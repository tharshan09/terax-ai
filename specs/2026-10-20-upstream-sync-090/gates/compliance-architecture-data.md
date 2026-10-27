# Gate 1: Architecture Compliance, Perspektive `data`

| Feld | Wert |
|------|------|
| Geprüft | `specs/2026-10-20-upstream-sync-090/architecture.md`, `discovery.md`, `codebase-scan.md` (keine `wireframes.md`, keine `bindings.md`, kein Reconcile) |
| Prüfdatum | 2026-10-27 |
| Lauf | Perspektive `data` (offener Lauf, kein Delta) |
| Worktree | `/Users/zipmend/Documents/private/projects/terax-ai/.claude/worktrees/upstream-sync-090` (Branch `upstream-sync-090`), `upstream/main` = `640e8b2` |
| Evidenz-Domäne | Zwischenablage-Datenformat (NSPasteboard), Dateinamen/Pfade (DF-1..DF-3, BR-1), Dateisystem-Semantik lokal + SSH-Host, IP-Adressformate (BR-16), Manifeste/Lockfiles/Registry-Stände (Slice 7, BR-19, BR-20), persistierte Settings |
| Messwerkzeuge | `git show` auf Upstream-Commits, Quelltext der Crates in `~/.cargo/registry`, kompilierte Rust-Sonden (`rustc`) gegen Upstream-`net/ip.rs`, privates NSPasteboard über JXA, `python3`-Sonde lokal (APFS) und auf `litha-claude` (Linux), `pnpm install --lockfile-only` in einer Scratch-Kopie, npm-Registry, crates.io-API |

## Skript-Tabelle (Arch-Precheck, übernommen)

| Ergebnis | ID | Klasse | Detail |
|----------|----|--------|--------|
| PASS | AR-7 | note | Scan-Plausibilität: 3 NEW-Zeilen ohne Zielpfad (Zielpfade stehen in architecture.md unter Context & Research) |

ID-Marker, ID-Existenz, Anker-Existenz, Enum-Werte, Versions-Literale, Scan-Zählungen, Registry- und Exception-Form sind damit erledigt und werden hier nicht erneut geprüft (P5).

## Summary

| Klasse | Anzahl |
|--------|--------|
| decision | 2 |
| refuted | 1 |
| fix | 3 |
| obligation | 7 |
| note | 6 |

Prüfmenge: 56 Bestands-Behauptungen der Perspektive `data`, davon 53 gemessen, 3 `NICHT GEMESSEN` (Self-Check 53 + 3 = 56).

**Verdict:** FAILED (2 `decision`, 1 `refuted`)

---

## Check A: Feature Mapping (Daten-Anteile)

| Item | Evidenz | Status |
|------|---------|--------|
| DF-1 Zwischenablage-Dateipfade → API-1, VAL-6 | Private-Pasteboard-Sonde: Dateireferenz-URL `file:///.file/id=6571367.184072728` → `filePathURL.path` liefert dekodierten absoluten Pfad | PASS |
| DF-2 Kopier-Ergebnis → `CopyResult` | Upstream `2723dc6:src-tauri/src/modules/fs/copy.rs:13-23` (`created`, `failed{source,message}`) | PASS |
| DF-3 Suffix-Zähler → SVC-2, VAL-4 | `copy.rs:10` `MAX_COPY_SUFFIX = 10_000`, `:137` `0..=MAX_COPY_SUFFIX`, `:160` `no free copy name` | PASS |
| BR-1 Finder-Benennung → SVC-2 | Upstream-Test `copy.rs:294-304` + Rust-Sonde `Path::file_stem/extension` | PASS |
| BR-3 keine halbe Kopie sichtbar → Staging | Staging `.terax-copy-*` ist bei `showHidden = true` im Explorer gelistet | FAIL → DA-3 |
| BR-16 eingebettete IPv4 → SVC-13, VAL-8 | Sonde: `64:ff9b:1::a9fe:a9fe` → `Private` | FAIL → DA-1 |
| BR-19 Version 0.8.7 → MIG-1/2/67/70 | vier Quellen gemessen | PASS |
| BR-20 genau eine Lezer-Kopie → MIG-68/69, SVC-15 | `pnpm install --lockfile-only`-Simulation: nur `@lezer/highlight@1.2.5` | PASS |
| BR-21 Symlinks → SVC-1, SEC-5 | Upstream `copy.rs:175-176,201-202`; Fork `ssh.rs` `upload_recursive` (`symlink_metadata` + `std::fs::read`) | PASS |

## Check B: Constraint Mapping (Daten-Anteile)

| Constraint | Architecture-Antwort | Evidenz | Status |
|------------|---------------------|---------|--------|
| Pfadlängen | unbegrenzte `String`-Felder (DTO) | `PC_PATH_MAX` macOS 1024, `litha-claude` 4096 (gemessen) | PASS |
| Namenslänge bei Suffix | nicht adressiert | `PC_NAME_MAX` 255 (beide Hosts); Name mit 251 Byte + ` copy` → `ENAMETOOLONG` (gemessen) | → DA-8 (obligation) |
| Batch-Umfang / Tiefe (VAL-5) | „wie Upstream, Festlegung über Gate-1-Auflagen" | Upstream `copy.rs:9,11`: 1024 Quellen, Tiefe 128 | → DA-7 (obligation) |
| Zeitlimit Zwischenablage | API-1 begrenztes Warten | Upstream `clipboard.rs` `recv_timeout(5 s)`, Text `clipboard read timed out or was cancelled` | PASS |
| `minimumReleaseAge` 4320 strikt | Upstream-Lock als Untergrenze | `pnpm-workspace.yaml:1-2`; Simulation lief mit Lezer 1.2.5 durch | PASS |

## Check C: Realistic Data

**C.1 Codebase Evidence.** Kein Datenbank-Backend. Persistente Daten: `localStorage` (`terax.sidebar.collapsed`, `useSidebarPanel.ts:16,91-94`), Tauri-Store der Spaces (`@tauri-apps/plugin-store` `LazyStore`, `spaces/lib/store.ts:1,28,61-62`), Settings-Store (`settings/store.ts`, u. a. `showHidden:323`), Statusleisten-Layout mit Widget-IDs (`statusbar/layout.ts:11-15,44-51`).

**C.2 Externe Datenquellen mit gemessenen Samples.**

| Quelle | Feld | Gemessenes Sample | Befund |
|--------|------|-------------------|--------|
| NSPasteboard (privat, über `NSURL writeObjects`) | `public.file-url` je Item | `file:///.file/id=6571367.184072728` → `/…/pbprobe/a b%#ü.txt`; `file:///.file/id=6571367.184072727/` → `/…/Ordner mit Leerzeichen` (ohne Trailing Slash); normale URL wird ebenfalls dekodiert; ein Item je URL, Typ `public.file-url` | Upstream-Leseweg (`URLWithString` → `filePathURL` → `path`) trägt Leerzeichen, `%`, `#`, Umlaut |
| Finder ⌘C | dieselben Items | NICHT GEMESSEN (würde die Zwischenablage des Users überschreiben) | → DA-9 (obligation, QA) |
| Dateisystem macOS (APFS, `python3` 3.9.6) | rename/link/mkdir | `rename` Ordner auf leeren Ordner ok; auf nicht leeren `ENOTEMPTY`; `link` auf Vorhandenes `EEXIST`; `mkdir` `EEXIST`; `mkdir a` nach `A` → `EEXIST` (case-insensitive) | API-3-Semantik hält |
| Dateisystem `litha-claude` (Linux 6.12.113, Python 3.13.5) | dieselben Ops | identisch; `NAME_MAX` 255, `PATH_MAX` 4096 | API-3-Semantik hält |
| AI-HTTP-Proxy, IP-Literale | `Url::host_str` von IPv6 | `"[::ffff:127.0.0.1]".parse::<IpAddr>()` = Fehler; `to_socket_addrs` → `nodename nor servname provided` | → DA-2 |

**C.3 Data Type Verdicts.** Siehe Abschnitt „Data Type Verdicts" unten.

## Check D: Completeness + Dependency Version Check

| Library | Arch-Angabe | Pinning-File (Fork) | Upstream-Lock `640e8b2` | Actual Latest (gemessen 27.10.2026) | Status |
|---------|-------------|---------------------|------------------------|-------------------------------------|--------|
| `tauri` | 2.11.5 → ≥ 2.12.2; stabil 2.12.5 (21.10.) | `Cargo.lock:4606` 2.11.5 | 2.12.2 | 2.12.5, 2026-10-21 | PASS |
| `@tauri-apps/api` | ^2.11.1 → ^2.12.3; 2.12.4 | `package.json:66` ^2.11.1 | ^2.12.3 / Lock 2.12.3 | 2.12.4 | PASS |
| `@tauri-apps/cli` | ^2.11.4 → ^2.12.0; 2.12.4 | `package.json:115` ^2.11.4 | ^2.12.0 / Lock 2.12.0 | 2.12.4 | PASS |
| `react`, `react-dom` | ^19.2.8 → ^19.3.0; 19.3.1 (14.10.) | `package.json:97-98` | ^19.3.0 | 19.3.1, 2026-10-14 | PASS |
| `vite` | ^8.2.2 → ^8.3.1; 8.3.5 (21.10.) | `package.json:133` | ^8.3.1 | 8.3.5, 2026-10-21 | PASS |
| `@lezer/highlight` | 1.2.3 → exakt 1.2.5 (28.09.) | `package.json:62` ^1.2.3, Lock 1.2.3 | `catalog:` 1.2.5 | 1.2.5, 2026-09-28 | PASS |
| `@iconify-json/catppuccin` | 1.2.17 (14.09.2025) | `package.json:61` | ^1.2.17 | 1.2.17, 2025-09-14 | PASS |
| `dirs` | 6.0.0 → 7.0.0 (05.09.) | `Cargo.toml:31` "6", Lock 6.0.0 (+ transitiv 4.0.0) | 7.0.0 (+ transitiv 6.0.0) | 7.0.0, 2026-09-05 | PASS |
| `libc` | 0.2.189 → in `0.2`; 0.2.191 (16.10.) | `Cargo.lock:2314` 0.2.189 | 0.2.191 | 0.2.191, 2026-10-16 | PASS |
| `objc2-app-kit`, `objc2-foundation` | 0.3.2 unverändert | `Cargo.lock:2681,2808` 0.3.2 | 0.3.2 | 0.3.2, 2025-10-04 | PASS |
| `reqwest` | 0.12 bleibt; 0.13.5 (08.09.) | `Cargo.toml:45` 0.12, Lock 0.12.28 (+ transitiv 0.13.2) | 0.13.5 | 0.13.5, 2026-09-08 | PASS (DA-15) |
| `grep-matcher` | entfernt | `Cargo.toml:37`, Lock 0.1.8; 0 Treffer `grep_matcher` in `src-tauri/src` | – | – | PASS |
| pnpm | 11.9.0, Catalog „seit 9.5" | `package.json:7` `pnpm@11.9.0` | `pnpm@11.9.0` | – | PASS (Teil „seit 9.5" NICHT GEMESSEN) |

Neu spezifizierte Mechanismen gegen die Version der Abhängigkeit: `renamex_np` + `RENAME_EXCL` in libc 0.2.189 (`src/unix/bsd/apple/mod.rs:3325,4761`), `renameat2` + `RENAME_NOREPLACE` (`linux/gnu/mod.rs:1114`, `linux/mod.rs:1216`), `NSPasteboardTypeFileURL` (`objc2-app-kit-0.3.2/src/generated/NSPasteboard.rs:91`), `pasteboardItems` hinter Feature `NSPasteboardItem` (`NSPasteboard.rs:379-382`), `NSURL::URLWithString`/`filePathURL` (`objc2-foundation-0.3.2/src/generated/NSURL.rs:1181,1374`), `catalog:` in `overrides:` unter pnpm 11.9.0 (Simulation). Alle vorhanden.

## Check F: Migration Completeness (Daten-Anteile)

| Item | Evidenz | Status |
|------|---------|--------|
| MIG-1/2 Cargo-Manifeste, Ziel dateigenau | `Cargo.toml:3,31,37,67-68`; Lock-Zeilen gemessen | PASS |
| MIG-5/6 SSRF | MIG-6 „Upstream 1:1" ist am Beleg nicht hinreichend: der Upstream-Test aus MIG-5 braucht das Klammer-Trimmen aus `0a6e511` | FAIL → DA-2 |
| MIG-67..70 Version/Lezer | Simulation MIG-68/69 erfolgreich | PASS |
| Sweep „Version" | `grep -rn "0\.8\.6" package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json` trifft heute genau die 3 Versionszeilen; `Cargo.lock` enthält weitere `0.8.6` (`rand 0.8.6` u. a.), das Kriterium prüft dort richtigerweise nur das Paket `terax` | PASS |
| Sweep „SSRF" | `grep -n "fn ip_kind\|enum IpKind" src-tauri/src` ohne `-r` liefert auf einem Verzeichnis nichts (exit 1), mit `-r` 2 Treffer in `net.rs:33,78` | FAIL → DA-6 |

## Check E: Pattern Consistency, Gate 1b (Daten-Anteile)

| Scanner-Empfehlung | Umsetzung in architecture.md | Evidenz | Status |
|--------------------|------------------------------|---------|--------|
| AVOID: alte `ip_kind` neben `net/ip.rs` | MIG-5 entfernt Funktion + Enum (Anti-Slop #2 `dismantle`) | Upstream `11343a1` net.rs-Diff entfernt dieselben Zeilen | PASS |
| EXTEND: `lezer` in bestehenden `overrides:`-Block | MIG-68 | Simulation: Pins `dompurify`, `react-grab`, `react-doctor` erhalten | PASS |
| EXTEND: `clipboard_write_text`-Stack (`objc2`) für die Leseseite | SVC-4, MIG-1 | Features vorhanden (bereits über Default-Features aktiv, DA-14) | PASS |
| EXTEND: `Cargo.toml` (`dirs` 7, `grep-matcher` raus) | MIG-1 | gemessen | PASS |
| NEW: `copy_name` einmal für lokal + SSH | SVC-2 (Anti-Slop #3 `consolidate`) | Upstream `copy.rs:224-243` | PASS |
| Anti-Slop #2 `k3_stale_workaround` → `dismantle` | katalog-konform, Umsetzungsstelle MIG-5/6 | Sweep-Kommando defekt | PASS mit DA-6 |
| Anti-Slop #3 `k2_knowledge_copy` → `consolidate` | katalog-konform, MIG-14/19 | – | PASS |

Linsen-Ausfall: keiner (architecture.md Anti-Slop-Abschnitt; Scan „Linse vollstaendig gelaufen").

## Check E2: Bindings Coverage, Gate 1c

N/A - keine `bindings.md`, kein `reconcile_path`.

## Check E3: Existing-Behavior Invariants, Gate 1d (Daten-Anteile)

| INV | Prüfung | Evidenz | Status |
|-----|---------|---------|--------|
| INV-6 SSRF-Klassen | Source trägt die Klassen (Fork `net.rs:33-75`); Upstream `ip.rs` erhält jede Klasse (169.254/16, `fd00:ec2::254`, `fe80::/10` BlockedMetadata; RFC1918/CGNAT Private; Loopback; Public) | Code-Vergleich + Sonde | PASS |
| INV-6 `covered` | Testinhalt `net.rs:446-503` prüft weder `fc00::/7` noch unspecified (`grep fc00` nur in `:68-69`, Code) | gemessen | FAIL → DA-5 |
| INV-7 (entfällt) | Fork-IPv6-Zweig fällt für `::ffff:127.0.0.1` auf `Public` (`net.rs:50-72`) | Code | PASS |
| INV-21 eine Lezer-Kopie | `pnpm-lock.yaml:904` (packages) + `:6697` (snapshots), nur Version 1.2.3 | gemessen | PASS |
| Scan-Invarianten 6, 7, 21 übernommen | INV-6, INV-7, INV-21 | architecture.md:367-382 | PASS |

---

## Data Type Verdicts

| Feld | Arch-Typ | Evidenz | Verdict |
|------|----------|---------|---------|
| `CopyRequest.sources[]` | `string`, unbegrenzt | `PATH_MAX` 1024 (macOS) / 4096 (Linux); bestehende fs-Commands nehmen `String` (`mutate.rs:212-214`) | PASS |
| `CopyRequest.destDir` | `string`, unbegrenzt | wie oben | PASS |
| `CopyResult.created[]` | `string`, Vorwärts-Slash | Upstream `copy.rs:87` `to_canon(dest_dir.join(name))`; Fork `fs/mod.rs:14` `to_canon` vorhanden | PASS |
| `CopyFailure.message` | `string`, unbegrenzt | Helper reicht `str(ex)` durch (`ssh.rs:569-570`); OS-Texte variabel | PASS |
| `fs_clipboard_paths` → `string[]` | absolute Pfade | Sonde: Dateireferenz-URL und Prozent-Kodierung werden über NSURL dekodiert | PASS |
| Suffix-Zähler (DF-3) | 1..10.000 | Upstream `MAX_COPY_SUFFIX = 10_000` | PASS |
| Zielname nach `copy_name` | `OsString` | `NAME_MAX` 255; 251-Byte-Name + ` copy` → `ENAMETOOLONG` | CONDITIONAL → DA-8 |
| Staging-Name `.terax-copy-<zufall>` | versteckter Ordner im Ziel | `fs/tree.rs:129-130` und `ssh.rs:299` blenden Dot-Einträge nur bei `showHidden = false` aus | CONDITIONAL → DA-3 |
| Ziel-IP (VAL-8) | `IpAddr` → `IpKind` | `64:ff9b:1::/48` immer `Private` | FAIL → DA-1 |
| Host-Literal (API-4) | `&str` aus `Url::host_str` | IPv6 behält Klammern; Fork parst ohne Trimmen (`net.rs:90,281`) | FAIL → DA-2 |
| `PublishRequest.from/to` | JSON-String | Helper-Protokoll JSON; Nicht-UTF-8 scheitert vorher (`ssh.rs` `upload_recursive`) | PASS |
| `@lezer/highlight` | exakt 1.2.5 über `catalog:` + Override | Simulation: 14 Referenzen, 1 Paketversion | PASS |
| Version | `0.8.7` in vier Quellen | `package.json:4`, `Cargo.toml:3`, `tauri.conf.json:4`, `Cargo.lock:5010` | PASS |
| `terax.sidebar.collapsed` | `"1"`/`"0"`, gespiegelt als React-Zustand | `useSidebarPanel.ts:16,54,76,91-94` | PASS (DA-11) |
| Spaces-Store (plugin-store) | Format unverändert, Schreib-Auslöser migriert (MIG-38) | `useSpacePersistence.ts:86-90`, `store.ts:28,61-62` | PASS (DA-4, DA-10) |

---

## Bestands-Behauptungen

| # | Behauptung (architecture.md) | Beleg | Verdikt |
|---|------------------------------|-------|---------|
| C-01 | API-1/VAL-6: Dateireferenz-URLs werden zu echten Pfaden aufgelöst, Einträge ohne Datei-URL ignoriert | Private-Pasteboard-Sonde (JXA): `file:///.file/id=…` → dekodierter Pfad; Upstream `2723dc6:clipboard.rs` `filePathURL()?.path()?` | bestätigt |
| C-02 | Annahme: Finder legt kopierte Elemente als Datei-URLs je Pasteboard-Item ab | – | NICHT GEMESSEN - echtes Finder-⌘C würde die Zwischenablage des Users überschreiben; e2e ist in architecture.md geplant (DA-9) |
| C-03 | `NSPasteboardTypeFileURL` in `objc2-app-kit` 0.3.2 (`generated/NSPasteboard.rs:91`) | Registry-Quelle `:91` | bestätigt |
| C-04 | Features `NSPasteboardItem`, `NSArray`, `NSURL` in 0.3.2 definiert und zu ergänzen | `objc2-app-kit-0.3.2/Cargo.toml:1028`, `objc2-foundation-0.3.2/Cargo.toml:68,198`; Fork nutzt Default-Features (`Cargo.toml:67-68`), deren `default`-Liste alle Features enthält | bestätigt (Ergänzung redundant, DA-14) |
| C-05 | Lesekern testbar mit privatem Pasteboard | `NSPasteboard pasteboardWithName` + `releaseGlobally` in der Sonde funktionsfähig | bestätigt |
| C-06 | Main-Thread-Sprung, begrenztes Warten, Fehlertext `clipboard read timed out or was cancelled` | Upstream `clipboard.rs` `run_on_main_thread`, `recv_timeout(5 s)` | bestätigt |
| C-07 | DF-1: nur absolute Pfade | Sonde liefert absolute Pfade; `NSURL.path` | bestätigt |
| C-08 | DTO: bestehende fs-Commands nehmen `String` (`mutate.rs:207-212`) | `mutate.rs:212-214` `sources: Vec<String>, dest_dir: String` | bestätigt |
| C-09 | macOS `PATH_MAX` 1024, Linux-Host 4096 | `os.pathconf` lokal 1024, `litha-claude` 4096 | bestätigt |
| C-10 | `CopyFailure.message` unbegrenzt, `ssh.rs:570` reicht `str(ex)` durch | `ssh.rs:569-570` | bestätigt |
| C-11 | SVC-2/BR-1: Benennung `a copy.txt`, `a copy 2.txt`, `archive.tar copy.gz`, `Makefile copy`, `.env copy`, `v1.2 copy` | Upstream `copy.rs:224-243` + Test `:294-304`; Rust-Sonde: `archive.tar.gz` stem `archive.tar` ext `gz`, `.env` ext `None` | bestätigt |
| C-12 | DF-3/VAL-4: Zähler bis 10.000, Text `no free copy name` | Upstream `copy.rs:10,137,158-161` | bestätigt |
| C-13 | VAL-5: Grenzen wie Upstream, Texte `copy at most {N} items at a time` / `folder nesting exceeds the copy limit` | Upstream `copy.rs:9,11,78-80,167-171`: N = 1024, Tiefe 128 | bestätigt (Werte als DA-7) |
| C-14 | Staging `.terax-copy-*` im Zielordner, nie unter dem Zielnamen | Upstream `copy.rs:121-126` `tempdir_in(dest)`, `prefix(".terax-copy-")`, `staging/item` | bestätigt |
| C-15 | SEC-4: Teilkopien bleiben im **versteckten** Staging (BR-3) | `fs/tree.rs:129-130`, `ssh.rs:299`: Dot-Einträge nur ohne `showHidden` ausgeblendet; Präferenz `settings/store.ts:164,323` | widerlegt bei `showHidden = true` → DA-3 |
| C-16 | SEC-5: Nicht-UTF-8-Namen scheitern remote (`ssh.rs:1176`) | `upload_recursive` `non-UTF-8 filename under …` | bestätigt |
| C-17 | SEC-5/BR-21 SSH: Datei-Symlinks als Inhalt, Ordner-Symlinks scheitern | `upload_recursive`: `symlink_metadata` → kein `is_dir` → `std::fs::read` folgt dem Link | bestätigt |
| C-18 | BR-21 lokal: Symlinks als Symlinks, nie verfolgt | Upstream `copy.rs:175-176,201-202` | bestätigt |
| C-19 | API-3/Constraints: `publish` nur mit `os.mkdir/rename/link/unlink`; Rename auf leeren Ordner ersetzt, `os.link` scheitert bei Vorhandenem | python-Sonde macOS + `litha-claude`: ok / `ENOTEMPTY` / `EEXIST` / `EEXIST` | bestätigt |
| C-20 | Host `litha-claude` Python 3.13.5 / Linux 6.12.113; lokal 3.9.6 | Sonden-Ausgabe | bestätigt |
| C-21 | Risiko: Dateisystem ohne No-Replace-Rename (exFAT, SMB) → Rückfall exklusive Reservierung | Upstream `mutate.rs:138-170` hat keinen Rückfall (Fehler wird durchgereicht); `VOL_CAP_INT_RENAME_EXCL` existiert (`apple/mod.rs:4199`) | NICHT GEMESSEN - kein exFAT/SMB-Volume verfügbar; Nachweis als DA-12 |
| C-22 | `renamex_np` + `RENAME_EXCL` in libc 0.2.189 (`apple/mod.rs:3325,4761`) | exakt diese Zeilen | bestätigt |
| C-23 | Linux `renameat2` + `RENAME_NOREPLACE` | `linux/gnu/mod.rs:1114`, `linux/mod.rs:1216` | bestätigt |
| C-24 | `net/ip.rs` 263 Zeilen, nur `std` | `wc -l` 263; einziger Import `use std::net::{IpAddr, Ipv4Addr, Ipv6Addr}` | bestätigt |
| C-25 | VAL-8/SVC-13: alle BR-16-Formen inkl. `64:ff9b:1::/48` landen in der Klasse ihrer eingebetteten IPv4 | Rust-Sonde gegen Upstream-`ip.rs`: `64:ff9b:1::a9fe:a9fe`, `64:ff9b:1::7f00:1`, `64:ff9b:1:a9fe:a9fe::` → `Private` | widerlegt → DA-1 |
| C-26 | übrige BR-16-Formen (mapped, compatible, SIIT, NAT64 /96, 6to4, Teredo) | Sonde: `::ffff:169.254.169.254`, `::ffff:0:169.254.169.254`, `64:ff9b::a9fe:a9fe`, `2002:a9fe:a9fe::`, `2001:0:808:808:0:0:5601:5601` → `BlockedMetadata` | bestätigt |
| C-27 | Upstream strenger (Dokumentationsbereiche, außerhalb `2000::/3` privat) | `ip.rs` `ipv4_kind` (192.0.2/24 u. a.), `ipv6_kind` `s[0] & 0xe000 != 0x2000` | bestätigt |
| C-28 | INV-6: bestehende Klassen bleiben mit Upstream-`ip.rs` gültig | Code-Vergleich `net.rs:33-75` vs. `ip.rs:39-92`; Sonde `fe80::1`, `fd00:ec2::254` BlockedMetadata, `fc00::1` Private | bestätigt |
| C-29 | INV-6 `covered` durch Tests `net.rs:446-503` | Tests prüfen 169.254/16, `fd00:ec2::254`, `fe80::1`, RFC1918/CGNAT, Loopback, Public; kein Assert für `fc00::/7` und unspecified | teilweise widerlegt → DA-5 |
| C-30 | INV-7: `::ffff:a.b.c.d` heute ungeschützt | Fork-IPv6-Zweig `net.rs:50-72` → `Public` | bestätigt |
| C-31 | API-4/VAL-8 + Test Strategy: Klassifikation bei Auflösung (`net.rs:88-117`) und Pinning (`net.rs:282`); Upstream-Test mit Literal-Hosts ohne DNS | Fork `net.rs:90` und `:281` `host.parse::<IpAddr>()` ohne Klammer-Trimmen; `Url::host_str` behält IPv6-Klammern (Upstream-Kommentar `11343a1:net.rs:46`); Trimmen kam mit `0a6e511` (`git log -S`); Sonde: `"[::1]".parse()` Fehler, `to_socket_addrs` DNS-Fehler | widerlegt → DA-2 |
| C-32 | MIG-1: `grep-matcher = "0.1"` `:37`, `dirs = "6"` `:31`, Version `:3` | `Cargo.toml` | bestätigt |
| C-33 | MIG-2: Lock 0.8.6, `grep-matcher`, `dirs` 6.0.0, `tauri` 2.11.5 | `Cargo.lock:5010,1602,823,4606` | bestätigt |
| C-34 | Upstream-Lock `640e8b2`: tauri 2.12.2, dirs 7.0.0, libc 0.2.191 | `git show upstream/main:src-tauri/Cargo.lock` | bestätigt |
| C-35 | crates.io-Stände + Daten (tauri 2.12.5, dirs 7.0.0, libc 0.2.191, objc2-* 0.3.2, reqwest 0.13.5) | crates.io-API `max_stable_version` | bestätigt |
| C-36 | npm-Projektbereiche (api ^2.11.1, cli ^2.11.4, react ^19.2.8, vite ^8.2.2, lezer ^1.2.3 `:62`, catppuccin) | `package.json:61,62,66,97,98,115,133` | bestätigt |
| C-37 | npm-Upstream-Ziele (^2.12.3, ^2.12.0, ^19.3.0, ^8.3.1) | `git show upstream/main:package.json` | bestätigt |
| C-38 | npm-Latest + Daten (react 19.3.1 14.10., vite 8.3.5 21.10., api/cli 2.12.4, lezer 1.2.5 28.09., catppuccin 1.2.17 14.09.2025) | `npm view … dist-tags.latest` / `time` | bestätigt (Daten für api/cli nicht abgefragt, Versionen bestätigt) |
| C-39 | `minimumReleaseAge` 4320 strikt; Zielstände ≥ 3 Tage alt | `pnpm-workspace.yaml:1-2`; Lezer 1.2.5 vom 28.09.; Simulation lief durch | bestätigt |
| C-40 | Fork-`overrides:` mit `dompurify`, `react-grab`, `react-doctor` | `pnpm-workspace.yaml` | bestätigt |
| C-41 | MIG-68/69: Catalog-Block + Lezer-Override im bestehenden Block → Lezer 1.2.5 genau einmal, Pins unverändert | `pnpm install --lockfile-only` (pnpm 11.9.0, exit 0): nur `@lezer/highlight@1.2.5`; Lock-`overrides:` enthält alle vier Schlüssel | bestätigt |
| C-42 | Catalog „seit pnpm 9.5" | – | NICHT GEMESSEN - Hersteller-Doku (Perspektive `runtime`); für die Entscheidung irrelevant, da 11.9.0 gemessen funktioniert |
| C-43 | INV-21/MIG-69: `@lezer/highlight` 1.2.3 einmal (`:904,6697`) | einzige Version im Lock | bestätigt |
| C-44 | `bf7e03d`: `catalog:` 1.2.5 + Override; Build-Test zählt Lezer-Kopien über Sourcemaps | `bf7e03d` Diff `pnpm-workspace.yaml`; `dist-budget.test.ts:221-231` | bestätigt |
| C-45 | `dirs` nur `home_dir`, 13 Stellen | `grep dirs::` 13 Treffer, alle `home_dir` | bestätigt |
| C-46 | `dirs` 7 für `home_dir` quellkompatibel; `2992988` nur Manifest/Lock | `2992988 --stat`: 2× `Cargo.toml`, `Cargo.lock`; Upstream ruft mit `dirs = "7"` weiter `dirs::home_dir` (`agent.rs`, `history/mod.rs`, `lsp/mod.rs`) | bestätigt |
| C-47 | `getrandom` nur transitiv | `Cargo.toml`: 0 direkte Einträge | bestätigt |
| C-48 | `grep-matcher`: 0 Treffer im Quellcode | `grep -rn grep_matcher src-tauri/src` = 0 | bestätigt |
| C-49 | `reqwest` 0.13 kam upstream mit `0a6e511` | `git log -S'reqwest = { version = "0.13"'` → `0a6e511` | bestätigt |
| C-50 | Version in vier Quellen; Sweep „Version" mechanisch | `package.json:4`, `Cargo.toml:3`, `tauri.conf.json:4`, `Cargo.lock:5010` | bestätigt |
| C-51 | Sweep „SSRF" mechanisch anwendbar | `grep -n` ohne `-r` auf `src-tauri/src`: keine Ausgabe, exit 1 | widerlegt → DA-6 |
| C-52 | Database Schema: einziger persistenter Zustand bleibt `localStorage` „Sidebar eingeklappt" | Feature legt keine neuen Daten an (bestätigt); MIG-38 migriert aber den Schreib-Auslöser des Spaces-Stores (`plugin-store`, `store.ts:1,28,61-62`) | teilweise widerlegt → DA-4 |
| C-53 | MIG-42: eingeklappt nur als Ref + `localStorage` | `useSidebarPanel.ts:76-77,88-99` | bestätigt |
| C-54 | SVC-11/MIG-51: Git-Widget-IDs; Standard zeigt `git-branch`, `git-sync` | `layout.ts:11-15`, `DEFAULT_HIDDEN` `:44-47` | bestätigt (zusätzlich `line-changes` default sichtbar, DA-16) |
| C-55 | MIG-38: Space-Flush bei `hidden`, `blur`/`beforeunload` unverändert | `useSpacePersistence.ts:86-97`: synchroner Flush im `visibilitychange`-Handler | bestätigt (Auflage DA-10) |
| C-56 | Annahme: `catalog:` + Override vereinheitlichen alle Lezer-Nutzer | Simulation: 14 Referenzen alle 1.2.5 | bestätigt |

Self-Check: 53 Verdikte (bestätigt/widerlegt/teilweise) + 3 `NICHT GEMESSEN` = 56 erhobene Behauptungen.

Nicht in dieser Prüfmenge (andere Perspektiven): Hostnamen-Blockliste und Pinning-Logik (`code`), `minimumSystemVersion` und API-Verfügbarkeit nach macOS-Version (`runtime`), WKWebView-Sichtbarkeit (`runtime`/`ui`), Helper-Op-Tabelle `OPS` und Sentinel (`code`).

---

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|----|--------|-------|-----------|-------|-------|-------------|----------------------|-----------|-------------------|
| DA-1 | decision | A, C | `architecture.md` (SVC-13, VAL-8), ggf. `discovery.md` (BR-16) | VAL-8: „die Formen aus BR-16 landen in der Klasse ihrer eingebetteten IPv4"; SVC-13: „Upstream 1:1"; API-4: „Metadaten bleiben auch mit Opt-in gesperrt" | Upstream `11343a1:src-tauri/src/modules/net/ip.rs` `embedded_ipv4` kennt nur `[0x64, 0xff9b, 0, 0, 0, 0, hi, lo]`; `64:ff9b:1::/48` fällt in `s[0] & 0xe000 != 0x2000` → `Private`. Rust-Sonde: `64:ff9b:1::a9fe:a9fe` → `Private`. Fork `net.rs:150-161` lässt `Private` mit `allow_private` durch | dependency + code | Mit Opt-in (z. B. `lm_ping`, `net.rs:203` `allow_private = true`) wird ein Local-Use-NAT64-Ziel mit eingebetteter Metadaten-IPv4 nicht als `BlockedMetadata` abgewiesen | Entscheidung (Sicherheit): (a) Upstream 1:1 behalten und BR-16/VAL-8 auf „`64:ff9b:1::/48` immer mindestens privat, unabhängig vom Präfix" korrigieren (Restrisiko nur in Netzen mit lokalem NAT64 und Opt-in); oder (b) `ip.rs` abweichend von Upstream erweitern: für `64:ff9b:1::/48` alle RFC-6052-Offsets (/48, /56, /64, /72, /80, /96) auswerten, schwerste Klasse gewinnt, plus Test. Empfehlung (a), weil die Einbettungsposition präfixabhängig ist und (b) einen Upstream-Fork von `ip.rs` erzeugt | nein |
| DA-2 | refuted | C, F | `architecture.md` (API-4, VAL-8, MIG-5, Scope, Test Strategy) | API-4: „Ziel-Adressen werden nach VAL-8 klassifiziert, sowohl bei der Auflösung (`net.rs:88-117`) als auch beim Verbindungs-Pinning (`net.rs:282`)"; Test Strategy: „IP-Literal-Hosts, keine DNS-Auflösung nötig (Upstream-Test aus `11343a1`)" | Fork `net.rs:90` und `net.rs:281`: `host.parse::<IpAddr>()` ohne Trimmen; `Url::host_str` behält IPv6-Klammern (Upstream-Kommentar `11343a1:net.rs:46`); Trimmen `trim_matches(['[', ']'])` kam mit `0a6e511` (out of scope). Sonde: `"[::ffff:127.0.0.1]".parse::<IpAddr>()` = Fehler, `to_socket_addrs` → `nodename nor servname provided`. Upstream-Test `embedded_ipv4_literals_cannot_smuggle_internal_hosts_past_the_guard` ruft `resolve_and_classify("[::ffff:127.0.0.1]").unwrap()` | code + dependency | (1) Der Test aus MIG-5 panickt im Fork am `unwrap()`. (2) Redirect-Prüfung `net.rs:279-295` klassifiziert IPv6-Literale nie; mit `allow_private = true` wird ein Redirect auf `http://[fd00:ec2::254]/` oder `http://[::ffff:169.254.169.254]/` nicht gestoppt. (3) Der Austausch von `ip_kind` allein schließt nur den DNS-Weg (AAAA-Eintrag mit eingebetteter IPv4) | MIG-5 erweitern: an beiden Literal-Stellen (`resolve_and_classify` `:90`, Redirect `:281`) `host.trim_matches(['[', ']'])` vor dem Parsen (Hunk aus `0a6e511`, 2 Zeilen); Scope-Zeile „nur der `net/ip.rs`-Teil" um diesen Hunk ergänzen; Test um einen Redirect-Fall auf ein geklammertes Metadaten-Literal mit Opt-in ergänzen. Folge benennen: öffentliche IPv6-Literal-URLs, heute DNS-Fehler, funktionieren danach | nein |
| DA-3 | decision | A, C | `architecture.md` (SEC-4, SVC-1, SVC-3) | SEC-4: „Teilkopien bleiben im versteckten Staging, nie unter dem Zielnamen (BR-3)" | Staging `prefix(".terax-copy-")` im Zielordner (Upstream `copy.rs:121-126`); Explorer listet Dot-Einträge bei `showHidden = true` (`fs/tree.rs:129-130`, SSH `ssh.rs:299`; Präferenz `settings/store.ts:164,323`, umschaltbar in `GeneralSection.tsx`) | code | Bei eingeschalteter Präferenz erscheint während eines großen Kopiervorgangs ein Ordner `.terax-copy-…` mit der halben Kopie `item` im Baum; nach SSH-Abbruch bleibt er sichtbar (Q&A #7) | Entscheidung (Verhalten): (a) Explorer-Listing lokal und SSH blendet `.terax-copy-*` unabhängig von `showHidden` aus (neue MIG-Zeilen `fs/tree.rs`, Helper `read_dir`); oder (b) Sichtbarkeit bei `showHidden` bewusst hinnehmen und SEC-4/BR-3 entsprechend präzisieren („nie unter dem Zielnamen; bei eingeblendeten versteckten Dateien als `.terax-copy-…` sichtbar"). Empfehlung (a) | nein |
| DA-4 | fix | C | `architecture.md` (Database Schema, Entities) | „Einziger persistenter Zustand bleibt der bestehende `localStorage`-Eintrag „Sidebar eingeklappt" (`useSidebarPanel.ts`)" | MIG-38 verlegt den Schreib-Auslöser des Spaces-Stores (`@tauri-apps/plugin-store` `LazyStore`, `spaces/lib/store.ts:1,28,61-62`; Flush `useSpacePersistence.ts:86-90`) | code | Abschnitt nennt alle berührten persistenten Zustände | Entities-Zeile ergänzen: `terax.sidebar.collapsed` (`localStorage`, gelesen + gespiegelt, SVC-10) und Spaces-Store (`plugin-store`, Format unverändert, Schreib-Auslöser über SVC-7, MIG-38); gelesene Präferenzen (`showHidden`, Git-Farben, Statusleisten-Layout, Zen-Modus) ohne Formatänderung | nein |
| DA-5 | fix | E3 | `architecture.md` (INV-6) | INV-6 … „`fc00::/7` Private" · Source „Tests `net.rs:446-503`" · covered | Fork-Tests `net.rs:446-503` ohne Assert für `fc00::/7` und unspecified; Upstream-Tests `ip.rs` `non_global_ipv6_ranges_are_never_public` (`fc00::1`, `fd12:3456::1` Private; `::` Loopback) | code + dependency | Source deckt jede Teilaussage der Invariante | Source auf „Tests `net.rs:446-503` + `net/ip.rs` (`non_global_ipv6_ranges_are_never_public`, `ipv4_mapped_addresses_take_the_class_of_the_embedded_ipv4`)" erweitern, beide bleiben laut MIG-5/MIG-6 erhalten | nein |
| DA-6 | fix | F | `architecture.md` (Sweep criterion, SSRF) | „SSRF: `grep -n "fn ip_kind\|enum IpKind" src-tauri/src` → genau ein Treffer je Muster, in `net/ip.rs`" | Kommando auf Verzeichnis ohne `-r`: keine Ausgabe, exit 1; mit `-r`: `net.rs:33`, `net.rs:78` | code | Kriterium liefert vor der Migration 2 Treffer in `net.rs`, danach je 1 in `net/ip.rs` | `grep -rn "fn ip_kind\|enum IpKind" src-tauri/src` | nein |
| DA-7 | obligation | B, C | – (implement + test) | VAL-5: „Grenzwerte wie Upstream `copy.rs`, Festlegung über die Gate-1-Auflagen" | Upstream `copy.rs:9` `MAX_COPY_SOURCES = 1024`, `:11` `MAX_COPY_DEPTH = 128`, `:78-80` Gesamtfehler, `:167-171` Element-Fehler | dependency | Rust-Tests an beiden Grenzen, lokal und im SSH-Zweig | Grenzen 1024 Quellen je Aufruf (Gesamtfehler `copy at most 1024 items at a time`) und Ordnertiefe 128 je Element (`folder nesting exceeds the copy limit`), beide auch für `WorkspaceEnv::Ssh`; Ziel-Schritt implement + test | nein |
| DA-8 | obligation | B, C | – (test) | SVC-2/VAL-4 (Kandidatenfolge) | `PC_NAME_MAX` 255 (APFS und `litha-claude`); 251-Byte-Name + ` copy` → `ENAMETOOLONG`; Upstream `publish_copy` gibt den OS-Fehler je Element zurück (`copy.rs:146-151`) | runtime + dependency | Konflikt bei langem Namen scheitert nur für dieses Element, Staging verschwindet, Batch läuft weiter | Rust-Test: Name mit 251 Byte im Ziel vorhanden → Element in `failed` mit OS-Text, kein Staging-Rest, übrige Elemente in `created`; analog SSH-Helper-Test; Ziel-Schritt test | nein |
| DA-9 | obligation | C | – (test + qa) | VAL-6: „Nachweis: Rust-Test mit privatem Pasteboard (Datei, Ordner, Text-Eintrag, leer)"; Annahme Finder-Items | Sonde: Dateireferenz-URL `file:///.file/id=…`, Ordner mit Trailing Slash, Name `a b%#ü.txt` werden über NSURL korrekt dekodiert | runtime | Test- und QA-Fälle decken das reale Datenformat | Rust-Test ergänzen um Dateireferenz-URL, Name mit Leerzeichen, `%`, `#`, Umlaut und Ordner (erwartet: dekodierter absoluter Pfad ohne Trailing Slash); QA: echtes Finder-⌘C mit 2 Dateien + 1 Ordner → genau 3 Pfade (C-02); Ziel-Schritt test + qa | nein |
| DA-10 | obligation | C | – (implement + test) | MIG-38: „Abo aus SVC-7, Flush beim Wechsel zu unsichtbar" | Heute flusht `useSpacePersistence.ts:87-89` synchron im `visibilitychange`-Handler in den `plugin-store` | code | Kein Verlust ungesicherter Tab-/Space-Zustände beim Verstecken des Fensters | SVC-7 benachrichtigt Abonnenten synchron im selben `visibilitychange`-Dispatch (kein Microtask/rAF); Test in `windowVisibility.test.ts`: Abonnent ist vor Rückkehr von `dispatchEvent` aufgerufen; Ziel-Schritt implement + test | nein |
| DA-11 | obligation | C | – (implement + test) | MIG-42: „zusätzlich React-Zustand `sidebarCollapsed`" | `useSidebarPanel.ts:54,76` `readSidebarCollapsed` liest `terax.sidebar.collapsed` beim Mount | code | Bei eingeklappt gestarteter Sidebar registriert der Explorer beim Start keine Watches | Initialwert des gespiegelten Zustands aus `readSidebarCollapsed()` vor dem ersten Render; Test in `useSidebarPanel.test.ts` mit `"1"` im Storage; Ziel-Schritt implement + test | nein |
| DA-12 | obligation | C | – (test) | MIG-14: „sonst und bei nicht unterstütztem Dateisystem exklusive Reservierung" | Upstream `mutate.rs:138-170` `rename_no_replace` ohne Rückfall; libc kennt `VOL_CAP_INT_RENAME_EXCL` (`apple/mod.rs:4199`) | dependency | Rückfall greift nur bei „nicht unterstützt" (`ENOTSUP`/`EINVAL`), nie bei `EEXIST`, und ersetzt nie ein Element | Rust-Test mit injiziertem Unsupported-Fehler (kein exFAT/SMB im CI, C-21): Rückfall veröffentlicht ohne Ersetzen; `EEXIST` führt weiter zum nächsten Kandidaten; Ziel-Schritt test | nein |
| DA-13 | obligation | C | – (test) | SVC-3: „Zielnamen-Kandidaten … nach einmaligem Lesen des Zielordners vorfiltern …, bei Kollision nächster Kandidat" | APFS case-insensitive gemessen (`mkdir a` nach `A` → `EEXIST`); `publish` meldet `already exists` | runtime | Auf case-insensitiven Remote-Hosts entsteht bei `A.txt` vs. `a.txt` die nächste Kopie, kein Element-Fehler | Helper-Test gegen lokales python3 (läuft auf APFS): Ziel enthält `A.txt`, Quelle `a.txt`, `renameOnConflict = true` → `a copy.txt`; Ziel-Schritt test | nein |
| DA-14 | note | D | – | MIG-1: „App-Kit zusätzlich `NSPasteboardItem`; Foundation zusätzlich `NSArray`, `NSURL`" | Fork `Cargo.toml:67-68` ohne `default-features = false`; `default` von `objc2-app-kit-0.3.2` (`Cargo.toml:2017`) und `objc2-foundation-0.3.2` (`:234`) umfasst alle Features | dependency | – | Ergänzung ist redundant, schadet nicht; Upstream nutzt `default-features = false` | nein |
| DA-15 | note | D | – | Integrations: „`reqwest` 0.12 bleibt" | Fork `Cargo.lock:3758` enthält bereits `reqwest` 0.13.2 transitiv | dependency | – | Entscheidung Q&A #14 betrifft nur die direkte Abhängigkeit; kein Handlungsbedarf | nein |
| DA-16 | note | C | – | Research Log: „Standard-Statusleiste zeigt `git-branch` und `git-sync`" | `layout.ts:44-51`: nur `git-changes`, `git-staged` default aus, `line-changes` default sichtbar | code | – | Aussage stimmt, ist aber unvollständig; Schluss „Git-Status bleibt per Default live" gilt verstärkt | nein |
| DA-17 | note | C | – | SVC-3 (Upload) | `upload_recursive` liest jede Datei vollständig in den Speicher (`std::fs::read`) und schickt sie base64-kodiert als JSON (`write_bytes`) | code | – | Keine Größengrenze je Datei im SSH-Weg (bestehendes Drop-Verhalten); Finder-Einfügen macht große Dateien wahrscheinlicher; im PR benennen | nein |
| DA-18 | note | C | – | SVC-2 (nur letzte Endung) | Rust-Sonde: `Path::new("file.").extension()` = `Some("")` → `copy_name` ergibt `file copy.` | dependency | – | Randfall außerhalb BR-1; optional Testfall | nein |
| DA-19 | note | – | – | Skript AR-7 | Precheck-JSON | artifact | – | Scan-NEW-Zielpfade stehen in Context & Research; übernommen | nein |
