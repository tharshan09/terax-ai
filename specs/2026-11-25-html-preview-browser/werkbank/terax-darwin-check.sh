#!/usr/bin/env bash
# Typprüfung des Rust-Codes für macOS auf der Linux-Werkbank:
#   terax-darwin-check.sh <worktree>
# Fährt `cargo check --locked --lib --target aarch64-apple-darwin` im Prüfabbild.
# `cargo check` linkt nicht; die C-Build-Scripts (z. B. objc2-exception-helper)
# bekommen eine Compiler-Attrappe (werkbank/darwin/fakecc, fakear), die nur die
# Ausgabedateien anlegt. Damit wird Code unter cfg(target_os = "macos") typgeprüft.
# Grenzen: kein Linken, kein Lauf, keine Tests, kein Clippy für das Ziel; ein
# Fehler in C-Teilen fremder Crates bleibt unsichtbar. Grün heißt: übersetzt bis
# zur Typprüfung, mehr nicht.
# Exit 0 nur, wenn der Lauf endet UND das Paket terax erfasst wurde; Exit 2 = nicht messbar.
set -uo pipefail
root="$(cd "$1" && pwd)"
[ -f "$root/src-tauri/Cargo.toml" ] || { echo "kein src-tauri/Cargo.toml unter $root" >&2; exit 2; }
here="$(cd "$(dirname "$0")" && pwd)"
key="$(printf '%s' "$root" | sha1sum | cut -c1-12)"
lock="${TMPDIR:-/tmp}/terax-cargo-$(id -u).lock"
exec 9>"$lock"
flock -w 3600 9 || { echo "Sperre $lock nach 3600 s nicht bekommen" >&2; exit 2; }
docker run --rm --memory 2g -v terax-rustup-darwin:/usr/local/rustup terax-rust:local \
  sh -c 'rustup target add aarch64-apple-darwin >/dev/null 2>&1; chmod -R a+rX /usr/local/rustup' \
  || { echo "Ziel-Toolchain nicht ladbar" >&2; exit 2; }
log="$(mktemp)"
docker run --rm --memory 6g --cpus 3 --user "$(id -u):$(id -g)" -e HOME=/tmp -e CARGO_BUILD_JOBS=2 \
  -e "CARGO_TARGET_DIR=/target/darwin-$key" -e SDKROOT=/probe/fakesdk \
  -e CC_aarch64_apple_darwin=/probe/fakecc -e CXX_aarch64_apple_darwin=/probe/fakecc \
  -e AR_aarch64_apple_darwin=/probe/fakear -e CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER=/probe/fakecc \
  -v "$root":/work -v "$here/darwin":/probe:ro -v terax-cargo:/cargo -v terax-target:/target \
  -v terax-rustup-darwin:/usr/local/rustup -w /work/src-tauri terax-rust:local \
  sh -c 'touch src/lib.rs 2>/dev/null; cargo check --locked --lib --target aarch64-apple-darwin' > "$log" 2>&1
code=$?
cat "$log"
if [ $code -eq 0 ] && ! grep -q -E "(Checking|Compiling) terax " "$log"; then
  echo "nicht messbar: der Lauf hat das Paket terax nicht erfasst" >&2; rm -f "$log"; exit 2
fi
rm -f "$log"; exit $code
