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

## Wie der Rest gemessen wurde

Die Punkte unten hat die Sitzung selbst gemessen, in einer dritten Instanz „Terax E2E" (`pnpm tauri dev --no-watch` mit eigener Kennung `app.crynta.terax.e2e`, Test-Bridge, sauber gestartete Umgebung) neben der installierten App und „Terax Dev". Die Instanz lief aus einem Scratch-Worktree auf `232c6a2c` mit drei nur dort vorhandenen, nicht committeten Testhilfen:

- Die Test-Bridge stellt der App echte AppKit-Ereignisse zu (`NSEvent` für Mausklick und Taste mit Fensternummer, `CGEvent` für Trackpad-Scrollen mit Phasen) über `NSApp postEvent`. Sie laufen damit durch denselben Weg wie Eingaben des Users, auch durch die beiden lokalen Monitore (Esc, Wischen). Das Fenster wurde dazu kurz aktiviert.
- „Open in Browser" schreibt die Adresse in eine Datei, statt den Browser zu öffnen; geprüft wurde per `curl`.
- Die Lage der Ampelknöpfe wird aus `standardWindowButton` gelesen.

Grenzen der Methode: synthetisches Trackpad-Scrollen erreicht den nativen Wisch-Monitor, aber nicht die Seite (WebKit scrollt damit nicht); Shift+Esc wird bei synthetischer Zustellung in der Seite vervielfacht, auch mit unscharfem Monitor (kein Feature-Effekt, mit einer echten Taste gegenprüfen).

## 1. „Open in Browser", lokal — alles ja (ohne Browser-Darstellung)

- Seite mit Nachbardateien: `seite.html`, `stil.css`, `skript.js`, `bild.png`, `sub/y.png` 200. Zweiter Klick: dieselbe Adresse. Nach Änderung neuer Stand (`Cache-Control: no-store`). Kopfzeilen: `nosniff`, `no-referrer`, `frame-ancestors 'self'`.
- Reichweite (N-19): `../x.png` 404, `link.png` (Symlink nach außen) 403, `.env` 403.
- Groß-/Kleinschreibung (OB-24): `SUB/Y.PNG` lädt (200, APFS ohne Unterscheidung), `Seite.HTML` 200, `.GIT/config` 403.
- Getarnte Datei `harmlos.png -> seite.html`: `refused`, „the link points to a different kind of file", kein Browser-Aufruf.
- Datei direkt im Home: Seite 200, Nachbarbild 403, `.zshrc` 403.
- SVG direkt: `image/svg+xml` mit `Content-Security-Policy: sandbox; default-src 'none'; …`; in Terax als Code ohne Kopfzeile. PDF `application/pdf`, PNG `image/png`. `.txt` und Ordner: `unsupported`.
- Kontextmenü im Explorer: „Open in Browser" direkt unter „Open with Default App" bei HTML, SVG, PDF, PNG; fehlt bei `.txt`, Ordner hat nur „Open in Terminal".
- N-18: nach Beenden keine Verbindung; nach Neustart alter Link tot, neuer Klick neuer Port.
- N-16: der Server lauscht nur auf `127.0.0.1`; von der LAN-IP des Mac keine Verbindung.
- Nicht gemessen (braucht den User): Darstellung in Safari/Chrome, PDF in der installierten Safari-Version (N-8), Chrome-Dialog „lokales Netzwerk" (N-7), Firewall-Dialog.

## 2. „Open in Browser", SSH (Linux-Server) — alles ja, außer zwei nicht nachstellbaren Punkten

- Messseite vom Server: `index.html`, `stil.css`, `probe.js`, `bild.svg`, `daten.json`, `doc.pdf` 200; `../x` 404, `.env` 403. Erster Klick bis zur Adresse 1,8 s.
- SVG mit `<script>` auf dem Server: `sandbox`-CSP wie lokal (N-17).
- PDF über SSH in Terax: Karte „Binary file · preview not available over SSH" mit Kopfzeile (Dateiname, „Open in Browser", Zen); „Open in Browser" liefert `application/pdf` (N-24).
- Fehlende Datei (Nachbar und Eintragsdatei): `404 Not found` als Text, ohne Fehlertext des Servers.
- Last (N-25, N-4): `MaxSessions` nicht gesetzt (Standard 10). Bei 9 offenen SSH-Terminal-Tabs Seite plus 30 Bilder, 6 parallele Abrufe wie ein Browser: alle 31 mit 200, **Gesamtzeit 6,0 s** (eine Lesung je Host nacheinander, langsamste Anfrage 1,3 s). Dabei ging ein 10. SSH-Tab ohne Fehler auf.
- Klick-Lage: 5 Dateien per „Open in Browser" und 2 als Vorschau kurz nacheinander, danach ein weiterer SSH-Tab: alles da, keine Warnung im Log.
- Nicht nachstellbar: N-20 (der Schlüssel hat keine Passphrase; nach `ssh -O exit` baut die nächste Lesung die Verbindung still neu auf und die Seite kommt weiter), strenges Öffnen mit `chmod 711` (kein solcher Ordner), hängende Lesung.

## 3. Vorschau über den Mini-Server — Teil 2

- Verschachtelter `iframe` (`nest.html` bettet eine HTML-Datei aus demselben Ordner ein): der innere Rahmen bleibt leer (erlaubt laut Checkliste; `frame-ancestors` nennt nur die App-Herkunft).
- Neu laden lokal und über SSH: der Rahmen wird neu aufgebaut und lädt, `aria-busy` endet nach rund 155 ms; nach Änderung der Datei neuer Stand.
- Rückfall vor Verbindungsaufbau: nach App-Neustart mit einem Server-HTML-Tab vorn stand die Vorschau schon bei der ersten Messung (< 4 s) über den Mini-Server; der Rückfall war nicht zu beobachten.
- Popups (N-14): Link mit `target=_blank` tut nichts; `window.open` liefert `null`; kein neues Fenster, kein Browser, die Adresse wird nirgends sichtbar.
- Download-Link (`download`-Attribut): lädt nichts herunter, sondern öffnet das Ziel im Rahmen; „Neu laden" holt die Datei zurück.
- Zwischenablage: `navigator.clipboard.writeText` nach einem Klick in der Seite gelingt („kopiert").

## 4. Kopfzeile — alles ja

- HTML: Reload, Rendered, Raw, Open in Browser, Zen. Markdown: dasselbe ohne Open in Browser. Bild und PDF: Open in Browser, Zen. Code-Datei (`main.rs`) und SVG: keine Kopfzeile.
- Kopfzeile 36 px über dem Inhalt; Inhalt füllt die Fläche darunter (474 von 528 px, Rest ist Rand des Bereichs); kein zweiter Scrollbalken im Arbeitsbereich.
- Markdown gescrollt (600 px): Kopfzeile bleibt an derselben Stelle. Markdown „Neu laden" nach Änderung: Position bleibt bei 600, neuer Abschnitt sichtbar, Taste dreht nicht weiter.
- Raw mit ungespeicherter Änderung: Reload und Rendered gesperrt (Rendered mit Hinweis „Save to preview"); nach Rückgängig wieder frei.
- Langer Dateiname: gekürzt, alle fünf Tasten sichtbar.

## 5. Zen und Esc — alles ja bis auf die Zeilen unten

Alle Esc-Fälle mit nativem Klick in die Seite (Fokus im Rahmen), dann nativer Esc:

- Ohne Zen: kein Ereignis, die Seite bekommt Esc. Im Zen über HTML: Zen endet, die Seite bekommt Esc trotzdem.
- Cmd+Esc und Shift+Esc: Zen bleibt. Mit Feststelltaste: Zen endet. Gehalten (mit Wiederholungen): Zen endet.
- Dialog IN der Seite offen: Esc schließt ihn, und Zen endet ebenfalls.
- Befehlspalette der App über der Vorschau: Esc schließt nur die Palette, Zen bleibt.
- Esc im Einstellungsfenster, Hauptfenster im Zen über der Vorschau: Zen bleibt (OB-4).
- PDF (Klick in die PDF), Bild, Markdown: Zen endet. Raw einer HTML-Datei: Zen bleibt, die Zen-Taste der Kopfzeile beendet ihn. Terminal-Tab: Zen bleibt, Fokus im Terminal.
- Tippen im Zen: 600 Zeichen in 2,8 s in ein Eingabefeld der Seite, alle angekommen, kein Hänger, kein Absturz.
- Seitenleiste: 480 px → im Zen 0 und kein Ziehgriff → nach Zen wieder 480; nach App-Neustart aus dem Zen heraus ist sie offen (N-22).
- Ampelknöpfe (aus AppKit): x 9–69, y 9–23 Punkte. Dateiname der Kopfzeile im Zen: bei 100 % ab x 80, bei 150 % ab x 120 — frei. **Bei 75 % ab x 60: der Anfang des Namens liegt unter dem grünen Knopf** (bekannte Grenze 3 im PR, jetzt gemessen).
- Erste Zeile im Zen ohne Kopfzeile: **Code-Tab** erste Zeile bei x 49, y 12–32 und **Terminal** ab x 0, y 0 — beide unter den Ampelknöpfen. Bild mittig, PDF unter seiner Kopfzeile: frei.
- Nicht gemessen: Esc mit Akzent-Auswahl (langes `e`), Abbruch von Claude Code mit Esc (der Fokus-Teil von N-21 ist gemessen), KI-Leiste im Zen (die Eingabeleiste ließ sich im DOM nicht sicher greifen; Regel per Vitest geprüft). Im Terminal-Fokus wechselt Ctrl+Shift+Tab den Tab nicht (vorhandenes Verhalten, nicht Teil des Features).

## 6. Wischen — alles ja, mit zwei offenen Gegenproben

- Über der HTML-Vorschau (Seitenmitte, breite Tabelle) und über ihrer Kopfzeile: der native Monitor meldet den Wisch, der Tab bleibt.
- Zeiger von der Tab-Leiste bzw. von der Seitenleiste in die Vorschau und sofort wischen: Tab bleibt. Von der Seitenleiste aus einmal von 19 Läufen gewechselt, danach in 18 Läufen (auch mit 0 ms Abstand) nicht mehr; vermutlich stand der echte Mauszeiger dabei über dem Testfenster. Mit echtem Trackpad gegenprüfen.
- Über Bild-, Markdown- und Terminal-Tab (auch im Zen): Wischen wechselt den Tab.
- Nicht messbar mit synthetischen Ereignissen: dass die breite Tabelle in der Seite waagerecht scrollt, und der Scroll-Hänger (N-13).

## 7. Grenzen — Befund

- `launchctl limit maxfiles`: 256 weich, unbegrenzt hart. Eine per Finder/`open` gestartete App bekommt genau das (gemessen mit einer Probe-App: `soft=256 hard=unlimited`); Rust und Tauri heben es nicht an.
- Jeder Link hält einen eigenen lauschenden Socket (nach 260 Versuchen: 256 IPv4-Sockets, ab dem 257. `limit_reached`).
- **Mit Limit 256 (Test-App direkt mit `ulimit -n 256` gestartet) kam nach rund 243 Links `Too many open files (os error 24)`.** Danach konnte der Prozess keine Datei mehr öffnen (die Test-Bridge las ihre Befehle nicht mehr); das betrifft Terminal, Explorer, Git und Lesen bis zum Neustart.
- Grundlast ohne Links: installierte Terax 39 Datei-Kennungen, „Terax Dev" 22. In der echten App kippt es also schon nach rund 215 bis 235 Links, unter der geplanten Obergrenze von 256; jede HTML-Vorschau in der App zählt mit (OB-23: neu vorzulegen).
