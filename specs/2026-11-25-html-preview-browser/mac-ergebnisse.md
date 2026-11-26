# Mac-Ergebnisse: HTML-Vorschau im Browser (Welle 1)

Abnahme nach `mac-checkliste.md` am Mac (Apple Silicon, macOS 27.0), 26.11.2026. Gemessener Stand: Branch `html-preview-browser`, Head `115d08e2`. SSH-Server der Probe: Linux.

## 0. Bauen und starten — alles ja

- `pnpm install --frozen-lockfile`: ohne Fehler.
- `pnpm tauri:build:dev-variant`: beim ersten Versuch ohne Fehler und ohne Warnung (Rust-Release 1 min 15 s). `zen_escape.rs` und `F_GETPATH` in `preview_server/source.rs` linken am Mac; keine Korrektur nötig.
- „Terax Dev" startet mit Terminal-Tab, die installierte App läuft unverändert daneben (N-15).
- Größe (N-6): `Terax Dev.app` 12,73 MiB (13 040 KB), installierte `Terax.app` 12 796 KB, also rund 240 KB mehr.
- Messung am Mac (Head `115d08e2`):
  - `pnpm check-types`: Exit 0.
  - `pnpm vitest run`: 164 Dateien, 1826 Tests grün.
  - `pnpm lint`: 97 Warnungen, 1 Info, kein Fehler (wie auf `main`).
  - `cargo test --locked -- --test-threads=2`: 743 grün, 0 rot, 13 ignoriert (die vorhandenen `ports`-e2e-Tests). Die Werkbank meldete 750; der Unterschied sind plattformgebundene Tests (11 nur unter Linux: `secrets`, AppImage-Umgebung, ein `ssh`-Test; dafür laufen am Mac die macOS-Zweige).
  - `cargo clippy --all-targets --locked -- -D warnings`: sauber.

### Nebenbefund (nicht dieses Feature): Dev-Variante aus einem Terax-Terminal gestartet

„Terax Dev" wurde zuerst per `open` aus einem Terminal der installierten App gestartet und erbte deren `ZDOTDIR` (`~/.cache/terax/shell-integration/zsh`). Der Schutz „Terax in Terax" in `src-tauri/src/modules/pty/shell_init.rs` vergleicht das geerbte `ZDOTDIR` nur mit dem eigenen Ordner; die Variante hat seit dem Variant-Modul einen anderen (`shell-integration-dev`), also wird der Ordner der installierten App zu `TERAX_USER_ZDOTDIR`, und deren `.zshenv`/`.zprofile`/`.zshrc` laden sich selbst, bis `too many open files` kommt. Folge: keine Shell-Integration, kein OSC 7, der Explorer folgt `cd` nicht. Mit sauberer Umgebung gestartet (`env -u ZDOTDIR -u TERAX_TERMINAL -u TERAX_PTY_ID open …`) tritt es nicht auf. Folgethema für den Variant-Zweig: den Schutz auf jeden Terax-Integrationsordner ausdehnen (z. B. alle `shell-integration*`-Geschwister des eigenen Ordners).

## 3. HTML-Vorschau über den Mini-Server (M-C) — Teil 1

Sicherheitsprobe und M-C, in „Terax Dev" (Release-Bundle, sauber gestartet).

- **Punkt 13 (Sicherheitsprobe), lokal und über SSH:** grün „nein (ipc:// 500; sichtbar: webkit ipc)". Kein `__TAURI_INTERNALS__`, kein `__TAURI__`, kein `window.ipc` im Rahmen; sichtbar ist nur `window.webkit.messageHandlers.ipc`, und der Aufruf über `ipc://` wird abgelehnt (500).
  - Einordnung „Kanal sichtbar" (Übergabe: klären, ob ein Aufruf über `postMessage` angenommen würde): WebKit hängt den Nachrichtenkanal in jeden Rahmen, auch in den der Vorschau. wry 0.57.1 reicht die Nachricht mit der Adresse des sendenden Rahmens weiter (`wry_web_view_delegate.rs`, `frameInfo().request().URL()`). Tauri 2.12.5 prüft dann in `Webview::on_message` zwei Dinge unabhängig voneinander: (1) den zufälligen `__TAURI_INVOKE_KEY__`, der nur in den Init-Skripten des Hauptrahmens steht und dem Rahmen fehlt (kein `__TAURI_INTERNALS__`), sonst wird die Nachricht verworfen; (2) die Herkunft: `http://127.0.0.1:<port>` ist weder `tauri://` noch `frontendDist` noch ein eigenes Schema, also `Origin::Remote`, und ohne `remote`-Capability (keine in `src-tauri/capabilities/`) lehnt die ACL jeden Befehl ab („not allowed by ACL"). Ergebnis: Kanal sichtbar, Aufruf nicht möglich. Gilt als grün.
- **M-C lokal:** Seite sichtbar. 1–6 ja (Skript inline, `probe.js`, CDN, Style inline, `stil.css`, `bild.svg`). 7 nein (Speicher), 8 nein (`daten.json` nachladen): wie erwartet durch die Abschottung des Rahmens. 9: 1512 × 913 px, Bildschirm 1512 px. Lineal bis 1400+ sichtbar, breite Tabelle scrollt waagerecht.
- **M-C über SSH (Linux-Server):** dieselbe Messseite vom Server sichtbar, mit Nachbardateien (bisher über SSH gar nicht möglich).
- „Open in Browser" (Chrome) lokal: Seite sauber. Klick-Tests (Punkt 11) laut User ohne Auffälligkeit.
- Offen in Abschnitt 3: verschachtelter `iframe`, Neu laden (auch bei getrennter Verbindung), Rückfall vor Verbindungsaufbau, Popups/Download/Zwischenablage im Einzelnen notiert.
