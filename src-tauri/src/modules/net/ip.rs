//! Pure SSRF address classes. An IPv6 address that carries an IPv4 destination
//! takes the class of that IPv4, since a translating network delivers it there.

use std::cmp;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub(super) enum IpKind {
    Public,
    Private,
    Loopback,
    BlockedMetadata,
}

impl IpKind {
    fn severity(self) -> u8 {
        match self {
            Self::Public => 0,
            Self::Private => 1,
            Self::Loopback => 2,
            Self::BlockedMetadata => 3,
        }
    }

    pub(super) fn worse(self, other: Self) -> Self {
        cmp::max_by_key(self, other, |kind| kind.severity())
    }
}

pub(super) fn ip_kind(ip: IpAddr) -> IpKind {
    match ip {
        IpAddr::V4(v) => ipv4_kind(v),
        IpAddr::V6(v) => ipv6_kind(v),
    }
}

fn ipv4_kind(v: Ipv4Addr) -> IpKind {
    let o = v.octets();
    // Metadata services stay blocked even with private access: link-local
    // 169.254.169.254, Alibaba's 100.100.100.200 and Oracle's 192.0.0.192.
    if v.is_link_local() || o == [100, 100, 100, 200] || o == [192, 0, 0, 192] {
        return IpKind::BlockedMetadata;
    }
    // 0.0.0.0/8 is "this host" to most stacks.
    if v.is_loopback() || o[0] == 0 || v.is_broadcast() || v.is_multicast() {
        return IpKind::Loopback;
    }
    // IANA lists the PCP and TURN anycasts 192.0.0.9 and .10 as globally reachable.
    let ietf_global = matches!(o, [192, 0, 0, 9 | 10]);
    if o[0] == 10
        || (o[0] == 172 && (16..=31).contains(&o[1]))
        || (o[0] == 192 && o[1] == 168)
        || (o[0] == 100 && (64..=127).contains(&o[1]))
        || (o[0] == 198 && (o[1] == 18 || o[1] == 19))
        || (o[0] == 192 && o[1] == 0 && o[2] == 0 && !ietf_global)
        || (o[0] == 192 && o[1] == 0 && o[2] == 2)
        || (o[0] == 198 && o[1] == 51 && o[2] == 100)
        || (o[0] == 203 && o[1] == 0 && o[2] == 113)
        || o[0] >= 240
    {
        return IpKind::Private;
    }
    IpKind::Public
}

fn ipv6_kind(v: Ipv6Addr) -> IpKind {
    let s = v.segments();
    let kind = prefix_kind(v, &s);
    match isatap_ipv4(&s) {
        Some(tunnel) => kind.worse(ipv4_kind(tunnel)),
        None => kind,
    }
}

fn prefix_kind(v: Ipv6Addr, s: &[u16; 8]) -> IpKind {
    if v.is_unspecified() || v.is_loopback() || v.is_multicast() {
        return IpKind::Loopback;
    }
    // AWS and GCP serve instance metadata on fd00:ec2::254 and fd20:ce::254.
    if (s[0] == 0xfd00 && s[1] == 0xec2)
        || (s[0] == 0xfd20 && s[1] == 0xce)
        || v.is_unicast_link_local()
    {
        return IpKind::BlockedMetadata;
    }
    if let Some(kind) = embedded_ipv4(s)
        .into_iter()
        .flatten()
        .map(ipv4_kind)
        .reduce(IpKind::worse)
    {
        return kind;
    }
    // Fork deviation: upstream rates all of 64:ff9b:1::/48 Private; reading the
    // embedded IPv4 too keeps metadata blocked even with private access.
    if s[0] == 0x64 && s[1] == 0xff9b && s[2] == 1 {
        return local_use_nat64_ipv4(&v.octets())
            .into_iter()
            .map(ipv4_kind)
            .fold(IpKind::Private, IpKind::worse);
    }
    // Deny by default: only global unicast 2000::/3 can be public.
    if s[0] & 0xe000 != 0x2000 || is_special_purpose_non_global(s) {
        return IpKind::Private;
    }
    IpKind::Public
}

// IANA special-purpose blocks inside 2000::/3 that are not globally reachable.
fn is_special_purpose_non_global(s: &[u16; 8]) -> bool {
    match *s {
        [0x2001, 0x0db8, ..] => true,
        [0x3fff, b, ..] => b < 0x1000,
        [0x2001, 1, 0, 0, 0, 0, 0, 1..=3]
        | [0x2001, 3, ..]
        | [0x2001, 4, 0x112, ..]
        | [0x2001, 0x20..=0x3f, ..] => false,
        [0x2001, b, ..] => b < 0x0200,
        _ => false,
    }
}

fn v4(hi: u16, lo: u16) -> Ipv4Addr {
    let [a, b] = hi.to_be_bytes();
    let [c, d] = lo.to_be_bytes();
    Ipv4Addr::new(a, b, c, d)
}

// The IPv4 destinations a translation prefix carries; all None for any other address.
fn embedded_ipv4(s: &[u16; 8]) -> [Option<Ipv4Addr>; 2] {
    match *s {
        [0, 0, 0, 0, 0, 0xffff, hi, lo]
        | [0, 0, 0, 0, 0, 0, hi, lo]
        | [0, 0, 0, 0, 0xffff, 0, hi, lo]
        | [0x64, 0xff9b, 0, 0, 0, 0, hi, lo]
        | [0x2002, hi, lo, ..] => [Some(v4(hi, lo)), None],
        // Teredo stores the client IPv4 bit-inverted.
        [0x2001, 0, server_hi, server_lo, _, _, client_hi, client_lo] => [
            Some(v4(server_hi, server_lo)),
            Some(v4(!client_hi, !client_lo)),
        ],
        _ => [None, None],
    }
}

// ISATAP (RFC 5214) hides an IPv4 endpoint in the IID under any prefix; a
// lookalike IID counts too, as the address alone cannot rule out a tunnel.
fn isatap_ipv4(s: &[u16; 8]) -> Option<Ipv4Addr> {
    match *s {
        [_, _, _, _, 0 | 0x0100 | 0x0200 | 0x0300, 0x5efe, hi, lo] => Some(v4(hi, lo)),
        _ => None,
    }
}

// RFC 6052 offsets for /48, /56, /64 and /96; byte 8 is the reserved u-octet.
fn local_use_nat64_ipv4(b: &[u8; 16]) -> [Ipv4Addr; 4] {
    [
        Ipv4Addr::new(b[6], b[7], b[9], b[10]),
        Ipv4Addr::new(b[7], b[9], b[10], b[11]),
        Ipv4Addr::new(b[9], b[10], b[11], b[12]),
        Ipv4Addr::new(b[12], b[13], b[14], b[15]),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kind(addr: &str) -> IpKind {
        ip_kind(addr.parse().unwrap())
    }

    #[test]
    fn ipv4_mapped_addresses_take_the_class_of_the_embedded_ipv4() {
        assert_eq!(kind("::ffff:127.0.0.1"), IpKind::Loopback);
        assert_eq!(kind("::ffff:7f00:1"), IpKind::Loopback);
        assert_eq!(kind("::ffff:169.254.169.254"), IpKind::BlockedMetadata);
        assert_eq!(kind("::ffff:a9fe:a9fe"), IpKind::BlockedMetadata);
        assert_eq!(kind("::ffff:10.0.0.1"), IpKind::Private);
        assert_eq!(kind("::ffff:192.168.1.1"), IpKind::Private);
        assert_eq!(kind("::ffff:172.16.0.1"), IpKind::Private);
        assert_eq!(kind("::ffff:100.64.0.1"), IpKind::Private);
        assert_eq!(kind("::ffff:0.0.0.0"), IpKind::Loopback);
        assert_eq!(kind("::ffff:8.8.8.8"), IpKind::Public);
        assert_eq!(kind("::ffff:1.1.1.1"), IpKind::Public);
    }

    #[test]
    fn alibaba_cloud_metadata_is_blocked_inside_cgnat_space() {
        assert_eq!(kind("100.100.100.200"), IpKind::BlockedMetadata);
        assert_eq!(kind("::ffff:100.100.100.200"), IpKind::BlockedMetadata);
        assert_eq!(kind("64:ff9b::6464:64c8"), IpKind::BlockedMetadata);
        assert_eq!(kind("100.100.100.199"), IpKind::Private);
        assert_eq!(kind("100.100.100.201"), IpKind::Private);
    }

    #[test]
    fn oracle_and_gcp_metadata_are_blocked_inside_private_space() {
        assert_eq!(kind("192.0.0.192"), IpKind::BlockedMetadata);
        assert_eq!(kind("::ffff:192.0.0.192"), IpKind::BlockedMetadata);
        assert_eq!(kind("64:ff9b::c000:c0"), IpKind::BlockedMetadata);
        assert_eq!(kind("192.0.0.191"), IpKind::Private);
        assert_eq!(kind("192.0.0.193"), IpKind::Private);
        assert_eq!(kind("fd20:ce::254"), IpKind::BlockedMetadata);
        assert_eq!(kind("fd20:cf::254"), IpKind::Private);
    }

    #[test]
    fn ipv4_compatible_and_translated_addresses_are_classified_by_their_ipv4() {
        assert_eq!(kind("::127.0.0.1"), IpKind::Loopback);
        assert_eq!(kind("::7f00:1"), IpKind::Loopback);
        assert_eq!(kind("::169.254.169.254"), IpKind::BlockedMetadata);
        assert_eq!(kind("::10.1.2.3"), IpKind::Private);
        assert_eq!(kind("::8.8.8.8"), IpKind::Public);
        assert_eq!(kind("::1"), IpKind::Loopback);
        assert_eq!(kind("::"), IpKind::Loopback);
        assert_eq!(kind("::ffff:0:127.0.0.1"), IpKind::Loopback);
        assert_eq!(kind("::ffff:0:8.8.8.8"), IpKind::Public);
    }

    #[test]
    fn nat64_addresses_are_classified_by_their_ipv4() {
        assert_eq!(kind("64:ff9b::7f00:1"), IpKind::Loopback);
        assert_eq!(kind("64:ff9b::127.0.0.1"), IpKind::Loopback);
        assert_eq!(kind("64:ff9b::a9fe:a9fe"), IpKind::BlockedMetadata);
        assert_eq!(kind("64:ff9b::a00:1"), IpKind::Private);
        assert_eq!(kind("64:ff9b::c0a8:101"), IpKind::Private);
        // A real IPv4-only host reached through DNS64 stays reachable.
        assert_eq!(kind("64:ff9b::808:808"), IpKind::Public);
        // Local-use NAT64: the /48 candidate of this address is 0.0.0.0.
        assert_eq!(kind("64:ff9b:1::808:808"), IpKind::Loopback);
    }

    #[test]
    fn local_use_nat64_addresses_take_the_worst_class_of_every_offset() {
        assert_eq!(kind("64:ff9b:1::a9fe:a9fe"), IpKind::BlockedMetadata);
        assert_eq!(kind("64:ff9b:1::7f00:1"), IpKind::Loopback);
        assert_eq!(kind("64:ff9b:1:a9fe:a9:fe00::"), IpKind::BlockedMetadata);
        assert_eq!(kind("64:ff9b:1:a9:fe:a9fe::"), IpKind::BlockedMetadata);
        assert_eq!(kind("64:ff9b:1:0:a9:fea9:fe00:0"), IpKind::BlockedMetadata);
    }

    #[test]
    fn local_use_nat64_is_never_public_even_when_every_offset_is() {
        assert_eq!(kind("64:ff9b:1:808:8:808:808:808"), IpKind::Private);
    }

    #[test]
    fn six_to_four_addresses_are_classified_by_their_ipv4() {
        assert_eq!(kind("2002:7f00:1::"), IpKind::Loopback);
        assert_eq!(kind("2002:7f00:1::1"), IpKind::Loopback);
        assert_eq!(kind("2002:a9fe:a9fe::"), IpKind::BlockedMetadata);
        assert_eq!(kind("2002:a00:1::"), IpKind::Private);
        assert_eq!(kind("2002:c0a8:101::5"), IpKind::Private);
        assert_eq!(kind("2002:808:808::1"), IpKind::Public);
    }

    #[test]
    fn teredo_addresses_are_unsafe_if_server_or_client_ipv4_is() {
        // Server 8.8.8.8, client 1.2.3.4 (obfuscated as !1.2.3.4).
        assert_eq!(kind("2001:0:808:808:0:0:fefd:fcfb"), IpKind::Public);
        // Client 127.0.0.1 obfuscated: 80ff:fffe.
        assert_eq!(kind("2001:0:808:808:0:0:80ff:fffe"), IpKind::Loopback);
        // Server 10.0.0.1.
        assert_eq!(kind("2001:0:a00:1:0:0:fefd:fcfb"), IpKind::Private);
        // Client 169.254.169.254: obfuscated 5601:5601.
        assert_eq!(
            kind("2001:0:808:808:0:0:5601:5601"),
            IpKind::BlockedMetadata
        );
    }

    #[test]
    fn isatap_interface_ids_are_classified_by_their_ipv4_under_any_prefix() {
        assert_eq!(kind("2400:cb00::5efe:a9fe:a9fe"), IpKind::BlockedMetadata);
        assert_eq!(
            kind("2400:cb00::200:5efe:169.254.169.254"),
            IpKind::BlockedMetadata
        );
        assert_eq!(kind("2400:cb00::5efe:127.0.0.1"), IpKind::Loopback);
        assert_eq!(kind("2400:cb00::200:5efe:a00:1"), IpKind::Private);
        assert_eq!(
            kind("2002:808:808::5efe:a9fe:a9fe"),
            IpKind::BlockedMetadata
        );
        assert_eq!(kind("2400:cb00::5efe:8.8.8.8"), IpKind::Public);
        assert_eq!(kind("2400:cb00::200:5efe:8.8.8.8"), IpKind::Public);
    }

    #[test]
    fn isatap_interface_ids_with_the_group_bit_set_are_classified_too() {
        assert_eq!(
            kind("2400:cb00::100:5efe:a9fe:a9fe"),
            IpKind::BlockedMetadata
        );
        assert_eq!(
            kind("2400:cb00::300:5efe:169.254.169.254"),
            IpKind::BlockedMetadata
        );
        assert_eq!(kind("2400:cb00::100:5efe:127.0.0.1"), IpKind::Loopback);
        assert_eq!(kind("2400:cb00::300:5efe:127.0.0.1"), IpKind::Loopback);
        assert_eq!(kind("2400:cb00::100:5efe:a00:1"), IpKind::Private);
        assert_eq!(kind("2400:cb00::300:5efe:192.168.1.1"), IpKind::Private);
        assert_eq!(kind("2400:cb00::100:5efe:8.8.8.8"), IpKind::Public);
        assert_eq!(kind("2400:cb00::300:5efe:8.8.8.8"), IpKind::Public);
        assert_eq!(kind("2400:cb00::400:5efe:a9fe:a9fe"), IpKind::Public);
    }

    #[test]
    fn a_global_address_with_an_isatap_iid_over_a_private_ipv4_needs_opt_in() {
        for addr in [
            "2400:cb00::5efe:10.0.0.1",
            "2400:cb00::100:5efe:10.0.0.1",
            "2400:cb00::200:5efe:172.16.0.1",
            "2400:cb00::300:5efe:192.168.0.1",
        ] {
            assert_eq!(kind(addr), IpKind::Private, "{addr}");
        }
    }

    #[test]
    fn isatap_with_a_public_ipv4_never_lifts_a_non_global_prefix() {
        assert_eq!(kind("::5efe:8.8.8.8"), IpKind::Private);
        assert_eq!(kind("fd12:3456::200:5efe:8.8.8.8"), IpKind::Private);
        assert_eq!(kind("fe80::5efe:8.8.8.8"), IpKind::BlockedMetadata);
    }

    #[test]
    fn globally_reachable_ietf_assignments_are_public() {
        for addr in [
            "2001:1::1",
            "2001:1::2",
            "2001:1::3",
            "2001:3::1",
            "2001:3:ffff::1",
            "2001:4:112::1",
            "2001:4:112:ffff::1",
            "2001:20::1",
            "2001:2f:ffff::1",
            "2001:30::1",
            "2001:3f:ffff::1",
        ] {
            assert_eq!(kind(addr), IpKind::Public, "{addr}");
        }
    }

    #[test]
    fn the_rest_of_the_ietf_block_stays_private() {
        for addr in [
            "2001:1::",
            "2001:1::4",
            "2001:1::1:1",
            "2001:2::1",
            "2001:4::1",
            "2001:4:113::1",
            "2001:10::1",
            "2001:1f:ffff::1",
            "2001:40::1",
            "2001:1ff:ffff::1",
        ] {
            assert_eq!(kind(addr), IpKind::Private, "{addr}");
        }
        assert_eq!(kind("2001:0:808:808:0:0:fefd:fcfb"), IpKind::Public);
        assert_eq!(kind("2001:0:a00:1:0:0:fefd:fcfb"), IpKind::Private);
    }

    #[test]
    fn non_global_ipv6_ranges_are_never_public() {
        assert_eq!(kind("fe80::1"), IpKind::BlockedMetadata);
        assert_eq!(kind("febf::1"), IpKind::BlockedMetadata);
        assert_eq!(kind("fc00::1"), IpKind::Private);
        assert_eq!(kind("fd12:3456::1"), IpKind::Private);
        assert_eq!(kind("fdff:ffff::1"), IpKind::Private);
        assert_eq!(kind("fd00:ec2::254"), IpKind::BlockedMetadata);
        assert_eq!(kind("fec0::1"), IpKind::Private);
        assert_eq!(kind("feff::1"), IpKind::Private);
        assert_eq!(kind("ff02::1"), IpKind::Loopback);
        assert_eq!(kind("ff00::"), IpKind::Loopback);
        assert_eq!(kind("::"), IpKind::Loopback);
        assert_eq!(kind("::1"), IpKind::Loopback);
        assert_eq!(kind("100::1"), IpKind::Private);
        assert_eq!(kind("2001:db8::1"), IpKind::Private);
        assert_eq!(kind("2001:db8:ffff::1"), IpKind::Private);
        assert_eq!(kind("2001:2::1"), IpKind::Private);
        assert_eq!(kind("3fff::1"), IpKind::Private);
        assert_eq!(kind("3fff:fff:ffff::1"), IpKind::Private);
        assert_eq!(kind("4000::1"), IpKind::Private);
        assert_eq!(kind("8000::1"), IpKind::Private);
    }

    #[test]
    fn global_unicast_ipv6_stays_public() {
        for addr in [
            "2606:4700::1111",
            "2607:f8b0:4005:80a::200e",
            "2a00:1450:4001:81b::200e",
            "2001:4860:4860::8888",
            "2001:200::1",
            "2001:1200::1",
            "2620:fe::fe",
            "3fff:1000::1",
            "3ffe::1",
        ] {
            assert_eq!(kind(addr), IpKind::Public, "{addr}");
        }
    }

    #[test]
    fn newly_covered_ipv4_ranges_are_not_public() {
        for addr in [
            "0.1.2.3",
            "192.0.0.8",
            "192.0.2.1",
            "198.51.100.7",
            "203.0.113.9",
            "240.0.0.1",
            "255.255.255.254",
        ] {
            assert_ne!(kind(addr), IpKind::Public, "{addr}");
        }
        for addr in ["192.0.1.1", "198.51.101.1", "203.0.114.1", "239.0.0.0"] {
            let expected = if addr == "239.0.0.0" {
                IpKind::Loopback
            } else {
                IpKind::Public
            };
            assert_eq!(kind(addr), expected, "{addr}");
        }
    }

    #[test]
    fn only_the_globally_reachable_anycasts_of_the_ietf_ipv4_block_are_public() {
        for addr in ["192.0.0.9", "192.0.0.10", "::ffff:192.0.0.9"] {
            assert_eq!(kind(addr), IpKind::Public, "{addr}");
        }
        for addr in [
            "192.0.0.0",
            "192.0.0.8",
            "192.0.0.11",
            "192.0.0.170",
            "192.0.0.255",
        ] {
            assert_eq!(kind(addr), IpKind::Private, "{addr}");
        }
    }
}
