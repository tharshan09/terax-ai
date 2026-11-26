# Übergabe an die Mac-Sitzung: HTML-Vorschau im Browser (Welle 1)

Stand: 26.11.2026. Geschrieben von der Sitzung auf der Linux-Werkbank für eine Claude-Sitzung am Mac. Diese Datei ist der Einstieg; das Protokoll der Werkbank-Sitzung (`progress.md`) ist nicht im Repo und am Mac nicht vorhanden.

## Wo wir stehen

- Repo: Fork `tharshan09/terax-ai` (Upstream `crynta/terax-ai`; dorthin geht nichts). Branch `html-preview-browser`, **Draft-PR #98** gegen `main` des Forks. `gh` hat den Upstream als Vorgabe: jeden Aufruf mit `-R tharshan09/terax-ai`.
- Alle fünf Slices sind gemergt, das Feature-Ende-Gate ist auf der Werkbank bestanden. Der geprüfte Code-Stand steht im PR-Text unter „Feature-end gate" (Rust 750 grün, Vitest 1826 grün, Clippy und Lint sauber, macOS-Code typgeprüft).
- **Auf macOS ist nichts davon je gelinkt oder gestartet worden.** Typgeprüft heißt: `cargo check --target aarch64-apple-darwin` ohne Linken. Der erste echte Build am Mac ist der erste Prüfpunkt.
- Der User hat am 26.11.2026 entschieden: **erst Mac-Abnahme**, der PR bleibt Draft. Merge nach `main`, „bereit" stellen und Installation sind je ein eigenes OK des Users.

## Was zu lesen ist (in dieser Reihenfolge)

1. `mac-checkliste.md` (dieser Ordner): die Abnahme, 65 Punkte in sieben Abschnitten. Das ist die Arbeit.
2. PR #98, Text: was gebaut wurde, Sicherheitsmodell, je Slice Prüfprotokoll und bekannte Grenzen, Abschnitt „Feature-end gate" mit den offenen Punkten nach Gewicht.
3. `build-plan.md`, je Slice der Abschnitt „Wie gebaut": Abweichungen vom Plan und bekannte Grenzen. Was dort steht, ist entschieden und kein neuer Befund.
4. `architecture.md`, Abschnitt „In-App-Vorschau über den Mini-Server" (Messungen M-A, M-B, M-C mit Abbruchfolge) und „Prüfbarkeit und Mac-Prüfpunkte" (N-1 bis N-25). `gates/obligations.md`: Auflagen OB-1 bis OB-24.
5. `TERAX.md` im Repo-Wurzelordner: Modul `preview_server`, `preview-server/`, `doc/`, `zen/`, die Dev-Variante.

## Regeln für die Mac-Sitzung

- **Die installierte Terax-App des Users nie beenden oder neu starten** ohne ausdrückliches OK. Geprüft wird in der Zweit-App „Terax Dev" (`pnpm tauri:build:dev-variant`; eigene Einstellungen, eigene SSH-Verbindungen, eigener Mini-Server).
- Kein Merge, kein „bereit", keine Installation ohne OK des Users. Push auf `html-preview-browser` ist freigegeben.
- Nichts Geheimes ins Repo; keine echten Hostnamen, Nutzernamen oder Adressen in Tests, Commits oder im PR.
- Commits enden mit der Zeile `Co-Authored-By: <Modell der Sitzung> <noreply@anthropic.com>`; PR-Text nur über Datei schreiben (`gh api -X PATCH repos/tharshan09/terax-ai/pulls/98 -F body=@datei`), danach Länge gegen die Datei prüfen.
- Bewegt sich der Branch (jeder neue Commit), gilt die letzte Gesamtmessung nicht mehr für den PR-Head: vor einem Merge erneut messen (unten „Messen am Mac") und den Stand im PR-Text nachziehen.
- Die Werkbank-Skripte unter `werkbank/` (Docker-Wrapper, macOS-Typprüfung) sind für Linux gedacht; am Mac läuft `cargo` direkt.

## Ablauf

1. `git fetch origin html-preview-browser && git switch html-preview-browser`, `pnpm install --frozen-lockfile`.
2. **Build:** `pnpm tauri:build:dev-variant`. Scheitert er, ist das der erste Befund. Erwartbare Stellen: `src-tauri/src/modules/zen_escape.rs` (macOS-Arm: `NSEvent`-Getter, `msg_send!` für `windowNumber`) und `src-tauri/src/modules/preview_server/source.rs` (`opened_path` mit `F_GETPATH`). Beide sind typgeprüft, ein Linkfehler oder ein fehlendes Symbol wäre neu.
3. **Sicherheitsprobe vor allem anderen in Abschnitt 3 der Checkliste:** Messseite (`evidence/messseite/index.html`) lokal und vom SSH-Server als HTML-Vorschau in „Terax Dev" öffnen, **Punkt 13** ablesen. Erwartet: grün „nein". Siehe „Wenn etwas nicht stimmt".
4. Checkliste Abschnitt 0 bis 7 mit dem User durchgehen. Vieles kann nur der User sehen und bedienen (Wischen, Esc, Ampelknöpfe); die Sitzung baut, liest Logs und wertet aus.
5. Ergebnisse festhalten (unten „Ergebnisse ablegen"), dem User die offenen Entscheidungen vorlegen.

## Wenn etwas nicht stimmt

| Beobachtung | Was tun |
|---|---|
| Build scheitert | Fehlertext sichern. Kleine Korrektur im macOS-Code ist erlaubt (eigener Commit, danach „Messen am Mac"). Ist es mehr als eine Signatur oder ein Import: dem User vorlegen. |
| **Punkt 13 zeigt rot „JA" oder „Kanal sichtbar: …"** | Screenshot. In „Terax Dev" keine fremden HTML-Dateien mehr als Vorschau öffnen. Konstante `HTML_PREVIEW_VIA_SERVER` in `src/modules/html/lib/htmlPreviewSource.ts` auf `false` (die HTML-Vorschau lädt dann wie vor dem Feature; „Open in Browser" ist nicht betroffen), dem User melden. Bei „Kanal sichtbar" ohne „JA" zuerst klären, ob ein Aufruf wirklich angenommen wird (die Probe kann den `postMessage`-Kanal nicht selbst ausprobieren). |
| Vorschau über den Mini-Server bleibt weiß oder Punkt 4 der Messseite ist rot | Abbruchfolge aus der Architektur, in dieser Reihenfolge, je mit erneuter Messung M-C: (1) M-B zur Einordnung (Web-Vorschau-Tab auf `python3 -m http.server 8765 --bind 127.0.0.1`, dann `localhost`). (2) `FRAME_LOCALHOST_FALLBACK` in `src-tauri/src/modules/preview_server/mod.rs` auf `true`. (3) `FRAME_ANCESTORS` in `src-tauri/src/modules/preview_server/policy.rs` auf `false`. (4) Hilft beides nicht: `HTML_PREVIEW_VIA_SERVER` auf `false`, dem User melden. Ursache im Debug-Build (`pnpm tauri build --debug` mit der Dev-Variante) oder mit Web Inspector suchen, nicht unter `tauri dev` (dort hat die App eine andere Herkunft). |
| Nur die verschachtelte Nachbar-HTML ist leer | Schritt (3) oben. |
| Reload-Taste dreht ewig | Notieren, in welcher Lage (`load` bleibt aus). Bekannte Grenze; ob nachgebessert wird, entscheidet der User. |
| Esc beendet Zen nicht mit Fokus in der Seite | Der native Monitor greift nicht: `zen_escape.rs` (macOS-Arm) und `useZenEscape.ts` (Scharfschalten). Log der App lesen, ob `terax:zen-escape` ankommt. |
| Tippen im Zen hakt | Der Monitor läuft bei scharfem Schalter je Tastendruck durch `window_label`. Messen, melden. |
| Über SSH scheitert das Lesen, der Editor liest dieselbe Datei aber | Strenges Öffnen: auf einem macOS-Server braucht es Leserecht auf jedem Zwischenordner (bekannte Grenze). Auf einem Linux-Server wäre es ein Befund. |
| Viele Links, App wird instabil | `launchctl limit maxfiles` und `lsof -p <pid> | wc -l` notieren (OB-23). Die Obergrenze von 256 Links ist eine User-Entscheidung; reicht das Limit nicht, neu vorlegen. |

Nach bestandener Abnahme M-C: die Konstante `HTML_PREVIEW_VIA_SERVER` und die zwei Mess-Schalter tragen `UNTIL:`-Marker („M-C passed on the Mac"). Das Entfernen ist ein Folgethema, kein Teil der Abnahme.

## Messen am Mac (nach jeder Code-Änderung, vor jedem Merge)

Im Repo-Wurzelordner: `pnpm check-types`, `pnpm vitest run`, `pnpm lint` (erwartet: Exit 0, 97 Warnungen wie auf `main`). In `src-tauri/`: `cargo test --locked -- --test-threads=2` und `cargo clippy --all-targets --locked -- -D warnings`. Am Mac laufen dabei auch die macOS-Zweige, die auf der Werkbank nie liefen; ein roter Test dort ist ein echter Befund. Erwartete Größenordnung von der Werkbank: 750 Rust-Tests, 1826 Vitest-Tests.

## Ergebnisse ablegen

- Datei `mac-ergebnisse.md` in diesem Ordner: je Abschnitt der Checkliste „alles ja" oder die Zeilen mit „nein", dazu die notierten Werte (Safari-Version, MaxSessions, Ladezeit mit 30 Bildern, `maxfiles`, `lsof`-Zahl, App-Größe, Ergebnis von Punkt 13 und von M-C lokal und über SSH). Committen und pushen.
- Im PR-Text den Status und den Abschnitt „Not verifiable on the build machine" nachziehen (was gemessen ist, was offen bleibt).
- Issues sind im Fork abgeschaltet; Folgethemen stehen im PR-Text.

## Offene Entscheidungen des Users nach der Abnahme

1. Draft → bereit, Squash-Merge nach `main` des Forks (mit SHA-Pin auf den zuletzt gemessenen Head), Installation.
2. Falls gemessen: Obergrenze von 256 Links (zählt auch jede HTML-Vorschau in der App), Lese-Reihe über SSH (ein Lesevorgang je Host, einstellbar nach der Ladezeit-Messung).
3. Ob eine der bekannten Grenzen vor dem Merge noch behoben werden soll (Liste im PR-Text unter „Feature-end gate", nach Gewicht).

Schon entschieden und nicht neu zu fragen: Ränder im Zen bleiben (HTML randlos, Markdown mit Textrand, Bild und PDF mit kleinem Abstand); SVG hat „Open in Browser" nur im Kontextmenü; das Restrisiko „Seite im Browser läuft unter `127.0.0.1`" ist akzeptiert; Welle 2 (Markdown im Browser) bekommt nach dem Merge einen eigenen Plan.
