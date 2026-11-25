#!/usr/bin/env bash
# Rust-Kommandos für Terax auf der Werkbank im Prüfabbild.
#
# - Seriell über eine Sperre: die Maschine hat einen Speicher-Deckel, nie zwei Läufe gleichzeitig.
# - EIGENES Target-Verzeichnis je Worktree. Alle Worktrees werden im Container unter demselben
#   Pfad /work eingehängt; mit einem gemeinsamen Target entscheidet cargo nach Dateizeit, ob neu
#   gebaut wird, und liefert dann das Testprogramm eines ANDEREN Worktrees (gemessen 25.11.2026).
#
# Aufruf:   terax-cargo.sh <worktree-wurzel> <cargo-argumente…>
# Beispiel: terax-cargo.sh /pfad/zum/worktree test --locked --no-fail-fast -- --test-threads=2
# Aufräumen eines Worktree-Targets:  terax-cargo.sh <worktree-wurzel> --drop-target
set -euo pipefail
root="$(cd "$1" && pwd)"; shift
[ -f "$root/src-tauri/Cargo.toml" ] || { echo "kein src-tauri/Cargo.toml unter $root" >&2; exit 2; }
key="$(printf '%s' "$root" | sha1sum | cut -c1-12)"
target="/target/wt-$key"
lock="${TMPDIR:-/tmp}/terax-cargo-$(id -u).lock"
exec 9>"$lock"
if ! flock -w 3600 9; then echo "Sperre $lock nach 3600 s nicht bekommen" >&2; exit 2; fi
base=(docker run --rm --memory 6g --cpus 3 --user "$(id -u):$(id -g)" -e HOME=/tmp -e CARGO_BUILD_JOBS=2
      -e "CARGO_TARGET_DIR=$target" -v "$root":/work -v terax-cargo:/cargo -v terax-target:/target
      -w /work/src-tauri terax-rust:local)
if [ "${1:-}" = "--drop-target" ]; then
  exec "${base[@]}" rm -rf "$target"
fi
echo "terax-cargo: worktree=$root target=$target" >&2
exec "${base[@]}" cargo "$@"
