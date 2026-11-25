#!/usr/bin/env bash
# Rust-Kommandos für Terax auf der Werkbank im Prüfabbild, seriell über eine Sperre
# (ein gemeinsames Target-Volume, Speicher-Deckel der Maschine: nie zwei Läufe gleichzeitig).
# Aufruf: terax-cargo.sh <worktree-wurzel> <cargo-argumente…>
# Beispiel: terax-cargo.sh /pfad/zum/worktree test --locked --no-fail-fast preview_server -- --test-threads=2
set -euo pipefail
root="$(cd "$1" && pwd)"; shift
[ -f "$root/src-tauri/Cargo.toml" ] || { echo "kein src-tauri/Cargo.toml unter $root" >&2; exit 2; }
lock="${TMPDIR:-/tmp}/terax-cargo-$(id -u).lock"
exec 9>"$lock"
if ! flock -w 3600 9; then echo "Sperre $lock nach 3600 s nicht bekommen" >&2; exit 2; fi
exec docker run --rm --memory 6g --cpus 3 --user "$(id -u):$(id -g)" -e HOME=/tmp -e CARGO_BUILD_JOBS=2 \
  -v "$root":/work -v terax-cargo:/cargo -v terax-target:/target -w /work/src-tauri terax-rust:local cargo "$@"
