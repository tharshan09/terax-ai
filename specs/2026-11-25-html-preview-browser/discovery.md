# Feature: Vorschau im Browser öffnen (Mini-Server) und Vorschau in der App

**Epic:** --
**Issue:** -- _(Issues sind im Fork `tharshan09/terax-ai` deaktiviert, gemessen `gh repo view --json hasIssuesEnabled` = `false`; Rückverfolgung über diesen Ordner und die PRs.)_
**Status:** Ready. Ein Punkt bleibt offen und blockiert Welle 1 nicht: was den Scroll-Hänger löst, ist eine Beobachtungsfrage an den User (Abschnitt „Offene Fragen").
**Stand:** `main` @ `cf07327`, gelesen am 2026-11-25. Rust und App sind auf der Werkbank weder baubar noch startbar (kein `cargo`); Laufzeitverhalten steht unter „Nicht messbar auf der Werkbank".
**Entstehung:** Teil A aus einem Dossier-Lauf dieses Agenten, Teil B aus `specs/2026-11-25-html-preview-browser/dossier-vorschau.md` (zweiter Agent). Antworten des Users und technische Weichen der Steuereinheit vom 2026-11-25 sind eingearbeitet (Q&A-Log). UI-Texte sind Englisch wie die übrige App.
**Wellen:** Jede Anforderung trägt `[W1]` (dieser Lauf) oder `[W2]` (direkt danach, Tabelle „Nach dem Merge"). Nicht zu verwechseln mit den Wegen W1 bis W6 in `dossier-vorschau.md` Abschnitt 2.4.

---

## Ausgangslage und Wunsch

> No requirement IDs — context

Wortlaut des Users (25.11.2026):

> „…HTML-Dateien, die öffne ich ja dann über den Link und dann öffnet sich das ja als gerenderte Datei … ich würde da gerne so eine weitere Taste haben, dass ich den per Local Host, also über den Port zum Beispiel, in meinem Browser zum Beispiel öffnen könnte … dass ich das halt lokal auf meinem Mac in meinem Browser einsehen kann."

> „alle möglichen Dateien … sauber öffnen lassen über den Browser, also von Markdown, HTML, Bilder und so weiter … Aber HTML ist halt das Wichtigste."

Beschwerden zur Vorschau in der App (zusammengefasst, `progress.md:44`): nutzt nicht die volle Breite; waagerechtes Wischen wechselt den Tab und stört bei breiten Tabellen; nach einem Tab-Wechsel lässt sich manchmal nicht mehr scrollen, bis man „die Stelle wieder findet"; dynamische Artefakte schwer bedienbar.

| Rahmen | Befund |
|--------|--------|
| Arbeitsweise | Überwiegend SSH-Workspaces: Dateien liegen auf einem Linux-Server, Terax läuft auf dem Mac. Der Remote-Fall ist der Hauptfall |
| Heute lokal | HTML-Vorschau über das Tauri-Asset-Protokoll (`src/modules/html/HtmlPreviewPane.tsx:54-69`) |
| Heute remote | HTML-Vorschau als `srcDoc` aus `fs_read_file` (`HtmlPreviewPane.tsx:71-93`); relative Bilder, CSS, JS lösen nicht auf (`HtmlPreviewPane.tsx:22-25`) |
| Heute im Browser | Kein Weg für Dateien; „Open in system browser" nur für URLs im Vorschau-Tab (`src/modules/preview/PreviewAddressBar.tsx:215-230`) und Port-Freigaben (`src/modules/ports/PortsList.tsx:155-159`) |

---

## Entschiedenes

> No requirement IDs — covered via BR-1, BR-4, BR-9, BR-14, BR-15, BR-16, BR-17, BR-18, BR-19, BR-21

| # | Vorgabe | Wer | Anforderung |
|---|---------|-----|-------------|
| 1 | Mini-Server in der App: 127.0.0.1, Zufallsport, geheimer Link, Datei samt Nachbardateien, auch vom SSH-Server, Neuladen zeigt den aktuellen Stand | User | BR-1 bis BR-8 |
| 2 | „Im Browser öffnen" für die Vorschau-Arten, HTML zuerst | User | BR-9, BR-17 |
| 3 | Reichweite: nur Ordner der Datei und Unterordner, Geheimnis-Dateien nie, `../` lädt nicht | User | BR-4, BR-10, BR-11 |
| 4 | Nachladen per Skript nur für HTML-Seiten im freigegebenen Bereich, alle anderen Arten abgeschottet | User | BR-14 |
| 5 | Link gilt, bis Terax beendet wird | User | BR-15 |
| 6 | Welle 1: HTML samt Nachbardateien, Bilder und PDF als Rohdatei bis 10 MB, lokal und SSH. Welle 2: Markdown einfach gerendert. Video und Audio eigenes späteres Vorhaben. WSL, Windows/Linux als Client nicht in diesem Vorhaben | User | BR-9, BR-12, BR-17 |
| 7 | Wischen über einer HTML-Vorschau wechselt nie den Tab, sonst wie heute | User | BR-18 |
| 8 | Zen-Modus ausbauen, Taste in der Vorschau-Kopfzeile, Esc verlässt in Vorschauen | User | BR-19, BR-20 |
| 9 | Taste in der Kopfzeile jeder Vorschau und im Explorer-Kontextmenü; nur Klick des Users, nicht der eingebaute Agent | Steuereinheit, technisch | BR-16, BR-23, BR-25 |
| 10 | SSH-Leseweg: heutiger Weg jetzt, neuer Weg erst mit Video oder großen Dateien | Steuereinheit, technisch | BR-13 |
| 11 | Gemeinsame schmale Kopfzeile statt Overlay (Dateiname, Neu laden, Rendered/Raw, Im Browser öffnen, Zen) | Steuereinheit, technisch | BR-21, BR-22 |
| 12 | Speicher und `fetch` in der In-App-Sandbox bleiben wie heute (FS-6 unangetastet) | Steuereinheit, technisch | BR-24 |
| 13 | Popups, Downloads, Zwischenablage der In-App-Vorschau: erst messen | Steuereinheit, technisch | Mac-Prüfpunkt (E10) |
| 14 | Absicherung: Entscheidungsregeln als reine Funktionen mit Vitest plus Mac-Checkliste | Steuereinheit, technisch | Vorgabe an die Architektur (keine ID) |
| 15 | PDF wird mit Abschottung ausgeliefert wie alle anderen Nicht-HTML-Arten, nur echte PDFs (25.11.2026) | User | BR-14 |
| 16 | Cookies anderer lokaler Dienste unter `127.0.0.1`: so lassen, Restrisiko benannt (Architektur, Bedrohung 24) (25.11.2026) | User | Vorgabe an die Architektur (keine ID) |
| 17 | Über SSH ein Lesevorgang je Host zugleich, eine Wiederholung, Zahl nach Messung am Mac änderbar (25.11.2026) | User | BR-13 |
| 18 | Die In-App-Vorschau lädt in Welle 1 über den Mini-Server, ohne Vorab-Messung; der heutige Ladeweg bleibt als Rückfall hinter einer Konstante (25.11.2026) | User | BR-24 |
| 19 | Erneuter Klick gibt denselben Link, nur relative Verweise in Welle 1, höchstens 256 Links mit Meldung, Textseite bei SSH-Fehler, Taste „Open in Browser“ (25.11.2026) | User | Vorgabe an die Architektur (keine ID) |
| 20 | Kein Prototyp (25.11.2026) | User | Vorgabe an die Architektur (keine ID) |

---

## Problem & Solution

> No requirement IDs — context

**Problem:**
- Eine HTML-Datei auf dem SSH-Server zeigt Terax ohne ihre Bilder und Styles; `srcDoc` hat keine Basisadresse (`HtmlPreviewPane.tsx:22-25`). Lokal laden relative Verweise laut GUI-Smoke vom 2026-07-02 ebenfalls nicht (`security-smoke-checklist.md:150-155`).
- Kein Weg, eine Datei im echten Browser des Macs anzusehen.
- In der App: Wischen über einer HTML-Vorschau wechselt immer den Tab (`dossier-vorschau.md` 2.2); ein Vollbild für den Tab-Inhalt fehlt; Rendered/Raw verdeckt den Inhalt; Neu laden geht nur über Raw und zurück.

**Solution:**
- Mini-Server auf dem Mac liefert Datei und Nachbardateien an den Browser, lokal und über SSH (Welle 1: HTML, Bilder, PDF; Welle 2: Markdown).
- In der App: gemeinsame Kopfzeile mit Neu laden, Rendered/Raw, Im Browser öffnen und Zen; ausgebauter Zen-Modus; kein Tab-Wechsel per Wischen über einer HTML-Vorschau.

**Business Value:**
- HTML-Artefakte einer Claude-Session auf dem Server mit einem Klick vollständig im Mac-Browser, Neuladen zeigt jede Änderung.
- Breite Tabellen in der App seitlich schieben, ohne versehentlich den Tab zu verlassen; Vorschau über das ganze Fenster.

---

## Scope & Boundaries

> No requirement IDs — context

| In Scope |
|----------|
| W1: Mini-Server, „Im Browser öffnen" für HTML samt Nachbardateien, Bilder, PDF (lokal und SSH) |
| W1: Kopfzeile, Neu laden, ausgebauter Zen-Modus, Wisch-Ausnahme über HTML-Vorschau |
| W1: In-App-Vorschau über den Mini-Server (User, 25.11.2026) |
| W2: Markdown im Browser, einfach gerendert |

| Out of Scope |
|--------------|
| Video und Audio im Browser (eigenes späteres Vorhaben, mit neuem SSH-Leseweg) |
| WSL-Workspaces; Windows und Linux als Client |
| Änderungen an Speicher-, Cookie- und `fetch`-Grenzen der In-App-Vorschau (BR-24) |
| Freigabe des Servers ins Netz oder an andere Geräte (BR-1) |
| Fix des Scroll-Hängers über die Wisch-Ausnahme hinaus (H2 bis H6 bleiben Mac-Prüfpunkte) |

---

## Current State Reference

> No requirement IDs — context

- Tab-Arten mit Dateiinhalt: `editor`, `markdown`, `html` (`src/modules/tabs/lib/useTabs.ts:129-176`); Workspace je Tab beim Öffnen festgehalten (`useTabs.ts:135-136`, `:159-163`, `:171-175`). `TERAX.md:73` nennt `html` nicht (veraltet).
- Routing beim Öffnen (`src/app/App.tsx:896-905`, `src/lib/utils.ts:8-14`).
- Medien im Editor-Tab lokal über Asset-Protokoll, über SSH nur Rasterbilder (`src/modules/editor/lib/binaryPreview.ts:5-23`, `:73-95`).
- Remote-Dateizugriff über ControlMaster und Python-Helfer (`src-tauri/src/modules/ssh.rs:92-147`, `:1128-1209`).
- Lese-Guard mit Sperrliste und Symlink-Regeln (`src-tauri/src/modules/fs/guard.rs:28-86`, `:172-207`, `:243-285`).
- `openUrl` (plugin-opener) in Ports-Liste und Vorschau-Adressleiste (`PortsList.tsx:155-159`, `PreviewAddressBar.tsx:215-230`).
- Zen-Modus blendet Kopf und Statusleiste aus, Kürzel Mod+Shift+' (`dossier-vorschau.md` 1.4: `src/app/App.tsx:962`, `:1086`, `:1634`, `:1796`; `src/modules/shortcuts/shortcuts.ts:317-321`).
- Wisch-Erkennung nativ plus Frontend-Prüfung, Einstellung `trackpadTabSwipe`, Ausnahme-Attribut `data-no-tab-swipe` (`dossier-vorschau.md` 2.1, 2.3: `src-tauri/src/lib.rs:68-131`; `src/modules/tabs/lib/useTabSwipe.ts:31-38`; `src/modules/tabs/lib/tabSwipe.ts:23-42`; `src/modules/settings/store.ts:343`).
- Sandbox der HTML-Vorschau ohne `allow-same-origin` als Sicherheitsentscheidung FS-6 (`HtmlPreviewPane.tsx:30-36`; Commit `41f8936`).
- Aufräumen beim Beenden über `RunEvent::Exit` (`src-tauri/src/lib.rs:505-507`).

---

## Ist-Stand Teil A

> No requirement IDs — context

### 1. Bestand der Vorschau-Arten

| Art | Dateitypen | Ladeweg lokal | Ladeweg remote (SSH) | Limit | Fundstelle |
|-----|-----------|---------------|----------------------|-------|-----------|
| `html` | `.html`, `.htm` | `asset_allow` (Datei plus Ordner), `iframe src = convertFileSrc(path)?v={token}`, Sandbox ohne `allow-same-origin` | `fs_read_file` mit `trusted: true`, `iframe srcDoc` | lokal keins; remote 10 MB | `HtmlPreviewPane.tsx:26-36`, `:54-69`, `:71-93`, `:103-116`, `:128-137` |
| `markdown` | `.md`, `.markdown`, `.mdx` | `fs_read_file` mit `trusted: true`, Streamdown statisch mit Mathe-Plugin | wie lokal, Lesen auf dem Host | 10 MB | `src/modules/markdown/MarkdownPreviewPane.tsx:38-63`, `:93-102` |
| `editor`, Bild | png, jpg, jpeg, gif, webp, svg, ico | `asset_allow` nur Datei, `img src = convertFileSrc` | nur Raster (ohne svg): `fs_read_remote_image`, Blob-URL | remote 10 MB, Prüfung auf dem Host | `binaryPreview.ts:5-13`, `:33-46`; `src/modules/editor/EditorPane.tsx:397-399`; `src/modules/editor/ImagePreview.tsx:34-47`; `src/modules/editor/lib/useRemoteImage.ts:41-52`; `src-tauri/src/modules/fs/file.rs:138-191` |
| `editor`, PDF | pdf | `asset_allow` plus `fs_is_pdf` (Magic-Bytes), `iframe` ohne Sandbox | nicht unterstützt (Karte) | -- | `EditorPane.tsx:375-409`, `:463-481`, `:493-495`; `file.rs:193-260` |
| `editor`, Video/Audio | mp4, webm, ogg, mov; mp3, wav, flac, aac, m4a | `asset_allow`, `MediaPreview` | nicht unterstützt | -- | `binaryPreview.ts:14-15`, `:85`; `EditorPane.tsx:456-462` |
| `preview` | URL | `iframe src = url` mit `allow-same-origin` | Mac-Adresse einer Port-Freigabe | -- | `src/modules/preview/PreviewPane.tsx:104-115`; `TERAX.md:86` |

| Gate | Wirkung | Fundstelle |
|------|---------|-----------|
| `trusted` | Sperrliste entfällt nur für den vom User genannten Pfad; Symlink-Täuschung bleibt verboten | `guard.rs:238-285`; `file.rs:91-92` |
| SSH mit `trusted: true` | keine Prüfung vor dem Senden; Host folgt Symlinks | `file.rs:94-101` |
| `fs_is_pdf` | nur echte PDFs ins Sandbox-lose iframe | `file.rs:193-260` |
| `check_remote_image` | nur Raster, Sperrliste auch auf das aufgelöste Ziel | `file.rs:138-154`, `:185-189` |
| Asset-Scope | leer per Konfiguration, wächst je Vorschau, nie widerrufen | `src-tauri/tauri.conf.json:29-32`; `src-tauri/src/modules/fs/asset.rs:25-38`; `security-smoke-checklist.md:195-198` |
| Ordner-Freigabe HTML | Ordner der Datei rekursiv, nie Dateisystem-Wurzel oder Home selbst | `asset.rs:10-18`, `:33` |

Widerspruch zum Code-Kommentar (`HtmlPreviewPane.tsx:22-23`): laut GUI-Smoke 2026-07-02 kodiert `convertFileSrc` den Pfad als ein Segment, relative Verweise lösen auch lokal nicht auf (`security-smoke-checklist.md:150-155`, Fix verworfen `:184-188`); Datei seit `41f8936` unverändert. Prüfpunkt N-1.

### 2. Remote-Lesen im Rust-Teil

| Punkt | Befund | Fundstelle |
|-------|--------|-----------|
| Mechanismus | je Aufruf `ssh -T -o BatchMode=yes` über `ControlMaster=auto`, `ControlPersist=10m`; Python-Helfer auf dem Host, JSON über stdin | `ssh.rs:92-147`, `:1128-1134`, `:1142-1209` |
| Text lesen | `read_file`: ganze Datei, 10 MB, folgt Symlinks ohne das Ziel zu melden | `ssh.rs:377-391`, `:279` |
| Binär lesen (PR #90) | `read_bytes`: `realpath`, nur reguläre Dateien, Grenze vor der Übertragung, base64 samt aufgelöstem Pfad | `ssh.rs:394-412`, `:1484-1525` |
| Limits, Laufzeiten | 10 MB je Datei, 16 MiB je Antwort; 30 s, `read_bytes` 30 s plus 1 s je 64 KiB | `file.rs:16`; `ssh.rs:877`, `:893`, `:897-909`, `:1506-1509` |
| Streaming, Range | keins | `ssh.rs:394-412` |
| Ohne Master | neue Verbindung im `BatchMode`, scheitert bei Passphrase-Schlüsseln mit Hinweis | `ssh.rs:944-960` |

| Baustein | Bestand | Fehlt |
|----------|---------|-------|
| Remote-Bytes | `ssh::read_bytes` mit aufgelöstem Pfad (`ssh.rs:1490-1502`) | Typ-Liste über Rasterbilder hinaus (`file.rs:138-154`) |
| Sperrliste | `guard::check_read_str` (`guard.rs:172-207`) | Prüfung „im Ordner der Datei" auf dem aufgelösten Pfad, lokal und remote |
| URL-Pfad-Auflösung | -- | Normalisieren von `..`, `%2e%2e`, doppelten Schrägstrichen |
| MIME-Typen | nur Frontend, nur Raster (`binaryPreview.ts:35-46`); `mime_guess` fehlt | Zuordnung im Server |
| Viele Nachbardateien | je Datei ein SSH-Prozess | Begrenzung gleichzeitiger Abrufe; sshd `MaxSessions` (`ports.rs:317`) |

| Abhängigkeit | Befund | Fundstelle |
|--------------|--------|-----------|
| tokio | direkt nur `rt`, `time` | `src-tauri/Cargo.toml:50` |
| hyper 1.12.0, hyper-util, http, httparse | nur transitiv über `reqwest`; Server-Features ohne `cargo tree` nicht messbar | `src-tauri/Cargo.lock:1741-1822`; `Cargo.toml:44-47` |
| axum, tiny_http, warp, mime_guess | nicht vorhanden | `git grep`, `Cargo.lock` |
| Eigene URI-Schemes | keine; Tauri-Asset-Protokoll (`protocol-asset`) | `Cargo.toml:22`; `lib.rs:393-499` |
| Rahmen | „ultra-lightweight", 7-8 MB Bundle | `TERAX.md:20` |

Upstream (`upstream/main` = `b217c43`, nicht im Fork) ersetzt das Asset-Protokoll seit crynta#1450 (`1317e13`, 2026-11-06) durch ein eigenes Scheme mit 32-Byte-Token je Freigabe, Widerruf beim Entladen, Prüfung im Freigabe-Ordner vor und nach dem Öffnen, Range und den Kopfzeilen `Content-Security-Policy: sandbox`, `nosniff`, `no-store`, `Referrer-Policy: no-referrer` (`upstream/main:src-tauri/src/modules/fs/assets.rs:64-69`, `:103-113`, `:129-142`, `:144-241`, `:260-284`; `upstream/main:src-tauri/src/lib.rs:218-222`).

### 3. Sicherheitsfläche

| Regel des Forks | Fundstelle |
|-----------------|-----------|
| An jeder Grenze prüfen; Sperrliste beim Lesen und Schreiben, nie umgangen | `TERAX.md:21` |
| Sperrliste: Dateinamen und Ordner | `guard.rs:28-86`, `:172-207` |
| `trusted` nur für den vom User genannten Pfad | `guard.rs:238-285` |
| Über SSH nur Pfad-Text vor dem Senden (Audit FS-3) | `security-audit-2026-07.md:42-44`; `file.rs:94-101` |
| Ordner-Freigabe nie für Wurzel oder Home | `asset.rs:5-18` |
| Kein `allow-same-origin` für Workspace-HTML in der App | `HtmlPreviewPane.tsx:30-36` |
| Lokale Angreifer mit Shell nicht im Bedrohungsmodell; keine Telemetrie | `SECURITY.md:30`, `:36` |

| # | Bedrohung | Szenario | Übliche Gegenmittel | Bestand / Bezug |
|---|-----------|----------|---------------------|-----------------|
| 1 | Andere lokale Prozesse | Skript fragt 127.0.0.1-Ports ab | Geheimnis (BR-3), Zufallsport (BR-2), keine Verzeichnis-Listen | Port-Freigaben ohne Geheimnis (`TERAX.md:44`) |
| 2 | Andere Benutzer des Macs | zweites Konto erreicht Loopback | wie 1 | -- |
| 3 | Webseiten im Browser (CSRF, Port-Scan) | fremde Seite feuert `fetch` auf 127.0.0.1 | Geheimnis; nur `GET`/`HEAD`; keine CORS-Freigaben; Chrome ab 142 fragt nach (Local Network Access) | -- |
| 4 | DNS-Rebinding | `evil.example` zeigt später auf 127.0.0.1 | Host-Kopfzeile prüfen (Vite CVE-2025-24010, Jupyter) | -- |
| 5 | Pfad-Ausbruch, Symlinks | `../../.ssh/id_rsa`, Symlink auf Schlüssel | Normalisieren, auflösen, im Ordner prüfen, nach dem Öffnen erneut; remote aufgelösten Pfad vom Host | BR-10, BR-11; `guard.rs:243-285`; `ssh.rs:394-412` (meldet Pfad), `:377-391` (meldet nicht) |
| 6 | Reichweite über den Ordner hinaus | Datei im Home gibt das Home frei | Wurzel = Ordner der Datei, nie Home oder Wurzel | BR-4; `asset.rs:10-18` |
| 7 | Geheimnis in Verlauf, Referer, Sync | CDN-Schrift bekommt Adresse als Referer | `Referrer-Policy: no-referrer`; Geheimnis an eine Freigabe gebunden | upstream `assets.rs:139` |
| 8 | Lebensdauer | alter Link aus dem Verlauf | Ende mit Terax | BR-15 |
| 9 | Anderer SSH-Host | Link für Host A liest Host B | Host und Wurzel in der Freigabe auf dem Mac, nie in der Adresse | `TERAX.md:45` (Muster) |
| 10 | Skripte der Seite | HTML-Skript liest per `fetch` Dateien anderer Links derselben Herkunft | Trennung je Freigabe (eigene Herkunft je Link oder Geheimnis nicht als gemeinsames Cookie); für Nicht-HTML `Content-Security-Policy: sandbox` | BR-14 |
| 11 | Erschöpfung | 300 Bilder über SSH = 300 Prozesse | Abrufe begrenzen, Größengrenze | `ssh.rs:877`, `:893` |
| 12 | Port-Übernahme | Prozess auf `[::1]` fängt `localhost` ab | Link mit `127.0.0.1` | `TERAX.md:44`; `ports.rs:286-293` |
| 13 | IPC aus der Seite | geladene Seite ruft Terax-Befehle | keine `remote`-URLs in Capabilities; CVE-2026-42184 (Windows, Android; behoben 2.10.3) | `src-tauri/capabilities/default.json`; `Cargo.toml:22` |

| Festlegung des Port-Features (PR #94/#95) | Fundstelle |
|-------------------------------------------|-----------|
| Nichts ohne Klick; eingebauter Agent kann nicht auslösen | `specs/2026-11-20-ssh-remote-workflow/discovery.md:286` (dort Regel 13); `TERAX.md:87` |
| Nur vom Mac erreichbar | `discovery.md:289` (dort Regel 15) |
| Ende mit Terax | `discovery.md:291` (dort Regel 18) |
| Binden auf 127.0.0.1 und [::1] gegen Übernahme | `TERAX.md:44` |
| Adresse nur in Rust gebaut, Öffnen über die Rust-Seite des Openers | `TERAX.md:45`, `:88` |
| Kein Geheimnis; jeder lokale Prozess erreicht eine Freigabe | `TERAX.md:44`; `discovery.md:349` |

### 4. Öffnen im Browser

| Punkt | Befund | Fundstelle |
|-------|--------|-----------|
| Plugin | `tauri-plugin-opener ~2.7` | `Cargo.toml:23`; `lib.rs:349` |
| Capability URLs | `opener:default`; im Betrieb belegt für `http://localhost:{port}` | `capabilities/default.json:23`; `PortsList.test.tsx:252` |
| Capability Pfade | `opener:allow-open-path` `**` mit Sperre ausführbarer Endungen | `capabilities/default.json:24-64` |
| `openUrl` | Ports-Liste mit Fehler-Toast, Adressleiste, Git-Graph, Links | `PortsList.tsx:155-159`; `PreviewAddressBar.tsx:215-230`; `GitHistoryPane.tsx:879`; `markdownExtras.ts:88` |
| Muster Rust-Seite | Adresse entsteht in Rust, Webview sieht sie nie | `TERAX.md:45` |

### 5. Markdown und andere Arten im Browser

Heute rendert Markdown im Webview mit `streamdown` (`MarkdownPreviewPane.tsx:1-9`, `:93-102`). Entschieden ist eine einfache gerenderte Fassung in W2 (BR-17); die Optionen B (Server wandelt um, z. B. `comrak`) und C/D (Renderer der App, Übergabe aus der App) aus Teil A bleiben Material für die Architektur.

| Art | Rohdatei mit MIME-Typ | Anmerkung |
|-----|----------------------|-----------|
| Rasterbilder | reicht | -- |
| SVG | reicht | führt als Dokument Skripte aus; abgeschottet nach BR-14 |
| PDF | reicht | Prüfung auf echte PDF-Bytes wie `fs_is_pdf` (`file.rs:193-260`); Abschottung kann den PDF-Viewer abschalten (Vorbild WKWebView `EditorPane.tsx:468-470`), Prüfpunkt N-8 |
| Video, Audio | nur mit Range | nicht in diesem Vorhaben |

### 6. In-App-Vorschau über denselben Server

Entschieden: in W1, ohne Vorab-Messung (User, 25.11.2026); Entwurf siehe `architecture.md`, Abschnitt „In-App-Vorschau über den Mini-Server“.

| Punkt | Befund | Fundstelle |
|-------|--------|-----------|
| CSP `frame-src` | erlaubt `http:` | `tauri.conf.json:28` |
| Vorbild | Vorschau-Tab lädt `http://localhost:{port}` im iframe | `PreviewPane.tsx:104-115` |
| Sandbox | ohne `allow-same-origin`: Bilder, CSS, Skript-Tags laden; `fetch` an den Server wäre fremde Herkunft | `HtmlPreviewPane.tsx:30-36` |
| CSP-Vererbung | `srcDoc` erbt vermutlich die App-CSP, dann laufen remote keine Inline-Skripte (Teil B) | `dossier-vorschau.md` 4.2; `tauri.conf.json:28` |
| App-Scheme | macOS über `tauri://localhost` (ungeprüft); WebKit wertet eigene Schemes als nicht sicher | Web: WebKit-Bug 171934, 272461 |
| Entscheidung | in W1 über den Mini-Server, ohne Vorab-Messung (User, 25.11.2026) | Q&A-Log 15 |

### 7. Lebenszyklus

| Punkt | Bestand | Fundstelle |
|-------|---------|-----------|
| Fenster | ein Hauptfenster plus Einstellungen | `capabilities/default.json:5-8`; `TERAX.md:73` |
| Paralleler Testbau | `Terax Dev` hätte eigenen Server | `TERAX.md:155-175` |
| App-Ende | `RunEvent::Exit`; nach Absturz kein Aufräumen | `lib.rs:502-508`; `TERAX.md:44` |
| Wiederhergestellte Tabs | `preview`-Tabs mit gespeicherter URL; `html`/`markdown` mit Pfad und Workspace | `src/modules/spaces/lib/serialize.ts:241-269` |
| Aktueller Stand heute | `?v=` je Mount; remote liest beim Mount | `HtmlPreviewPane.tsx:38-46`, `:71-93` |
| Aktueller Stand im Server | jede Anfrage liest neu, Antwort ohne Zwischenspeicher, auch für Nachbardateien | Muster `upstream/main:…/assets.rs:138` |

### 8. Orte für die Taste

| Stelle | Bestand | Fundstelle |
|--------|---------|-----------|
| Kopf HTML/Markdown | nur Overlay Rendered/Raw | `src/components/ui/DocViewToggle.tsx:19`; `HtmlPreviewPane.tsx:102`; `MarkdownPreviewPane.tsx:72` |
| Medien im Editor-Tab | kein Kopf; „Open with Default App" nur auf der Karte, nicht über SSH | `EditorPane.tsx:445-505` |
| Raw-Ansicht | Umschalter zurück | `src/modules/editor/EditorStack.tsx:51-58` |
| Explorer-Kontextmenü | „Open", „Open with Default App", „Reveal in Finder", … | `src/modules/explorer/FileExplorer.tsx:788-867` |
| Vorbild-Symbol | „Open in system browser" (`LinkSquare02Icon`) | `PreviewAddressBar.tsx:215-230` |

---

## Teil B — Vorschau in der App

> No requirement IDs — context

Quelle: `specs/2026-11-25-html-preview-browser/dossier-vorschau.md` (Fundstellen dort, hier nur die tragenden). Anforderungen daraus: BR-18 bis BR-24, UI-2 bis UI-4.

### Breite

| Befund | Fundstelle (laut Dossier) |
|--------|---------------------------|
| **Widerlegung:** Rechts liegt kein Panel. Die horizontale Panel-Gruppe hat nur Seitenleiste und Arbeitsfläche; rechts nimmt die App nur 12 px Polster und 1 px Rahmen. „Wächst nach links, nicht nach rechts" ist Geometrie: die eingeklappte Leiste lag links | `src/app/App.tsx:1696-1792`; `src/app/components/WorkspaceSurface.tsx:153`; `src/modules/html/HtmlPreviewPane.tsx:98` |
| Kein `max-width` im App-Teil; schmal wirkende Seiten begrenzen sich vermutlich selbst (zentrierter Block im Dokument) | `dossier-vorschau.md` 1.2, 1.3 |
| KI-Eingabe sitzt unter dem Inhalt, nicht rechts | `src/app/App.tsx:1780-1790` |
| Zen-Modus blendet nur Kopf und Statusleiste aus; Seitenleiste, Polster, Rahmen, Eingabe bleiben; nicht dauerhaft, nicht in der Befehlspalette | `src/app/App.tsx:962`, `:1086`, `:1634`, `:1796` |
| Ohne Kopf liegen die macOS-Ampelknöpfe über dem Inhalt (`titleBarStyle: Overlay`) | `src-tauri/tauri.conf.json:21-22` |

### Wischen

| Befund | Fundstelle (laut Dossier) |
|--------|---------------------------|
| Nativer Monitor feuert ab 50 Punkten waagerecht, mitten in der Geste, gibt jedes Ereignis weiter | `src-tauri/src/lib.rs:68-131` |
| Frontend gibt nur nach, wenn ein Vorfahr unter dem Zeiger waagerecht scrollen kann; über einem iframe sieht es nicht hinein, also wechselt der Tab über der HTML-Vorschau immer | `src/modules/tabs/lib/useTabSwipe.ts:35-38`; `src/modules/tabs/lib/tabSwipe.ts:23-42` |
| Vorhandene Ausnahme `data-no-tab-swipe` (KI-Mini-Fenster, Ask-AI) | `src/modules/ai/components/AiMiniWindow.tsx:96`; `SelectionAskAi.tsx:47` |
| Markdown scrollt im Eltern-Dokument und wird erkannt | `src/modules/markdown/MarkdownPreviewPane.tsx:73` |

### Scroll-Hänger nach Tab-Wechsel (Rangliste der Hypothesen)

| # | Hypothese in einer Zeile | Experiment |
|---|--------------------------|-----------|
| H1 | Tab wechselt mitten in der Wischgeste; der Rest der Geste bleibt am Scroller des alten Tabs hängen | E1, E2 |
| H2 | Die Seite scrollt nur in einem inneren Bereich; der Zeiger steht nach dem Wechsel daneben | E3 |
| H3 | Eine unsichtbare Tab-Schicht darüber fängt das Scrollen im asynchronen Treffertest ab | E4 |
| H4 | Veralteter Hover-/Latch-Zustand des iframe nach Sichtbarkeitswechsel, erst Zeigerbewegung löst ihn | E5, E6 |
| H5 | Tastatur-Fokus liegt noch im alten Tab (betrifft nur Tasten-Scrollen) | E7 |
| H6 | Eine Überlagerung (z. B. offenes KI-Mini-Fenster) liegt über der Vorschau | E8 |

H7 (Wisch-Handler hängt) ist im Dossier verworfen. Wirkung der Anforderungen: Die Wisch-Ausnahme (BR-18) beseitigt H1 für Wischgesten, die über einer HTML-Vorschau beginnen. H1 bei Gesten, die in einem anderen Tab beginnen und auf einem HTML-Tab enden, sowie H2 bis H6 bleiben Mac-Prüfpunkte. Kein Requirement „Hänger behoben".

### Dynamische Artefakte

| Befund | Fundstelle (laut Dossier) |
|--------|---------------------------|
| Sandbox ohne `allow-same-origin` ist dokumentierte Entscheidung FS-6; Speicher, Cookies und Eigen-`fetch` scheitern bewusst | `HtmlPreviewPane.tsx:30-36`; Commit `41f8936`; `security-audit-2026-07.html:227-231` |
| Remote (`srcDoc`) erbt vermutlich die App-CSP: Inline- und CDN-Skripte laufen dann nicht; lokal laufen sie wahrscheinlich; nirgends als Entscheidung dokumentiert | `src-tauri/tauri.conf.json:28`; `dossier-vorschau.md` 4.2 |
| CSP-Wirkung nur im Release-Build messbar | `dossier-vorschau.md` 4.2, 7 |
| Popups, Downloads, Zwischenablage weniger erlaubt als in der Web-Vorschau; ungemessen | `HtmlPreviewPane.tsx:35-36`; `PreviewPane.tsx:115-117` |
| Fokus im iframe: App-Kürzel kommen nicht an, bis man außerhalb klickt | `src/modules/shortcuts/lib/useGlobalShortcuts.ts:65` |
| Neu laden nur über Raw und zurück | `src/modules/tabs/lib/applyDocView.ts:4-14` |

### Bedienelemente

| Befund | Fundstelle (laut Dossier) |
|--------|---------------------------|
| `DocViewToggle` als Overlay in HTML, Markdown und Raw-Ansicht; „Rendered" gesperrt solange ungespeichert | `DocViewToggle.tsx:5-19`; `EditorStack.tsx:51-58` |
| Betroffene Dateien einer Kopfzeile | `dossier-vorschau.md` 5.3 |
| Tests: Wisch-Prüfung und Doc-Umschalter haben Tests; `HtmlPreviewPane`, `DocStack`, `WorkspaceSurface`, `useTabSwipe`, Rust-Monitor nicht | `dossier-vorschau.md` 6.1 |

---

## UI Patterns

> No requirement IDs — context

### Reused Patterns

| Pattern Type | Component | Usage in this Feature |
|--------------|-----------|----------------------|
| Knopf „im Browser öffnen", Neu laden | `src/modules/preview/PreviewAddressBar.tsx` | Vorbild für Symbole und Wortwahl der Kopfzeile |
| Fehler-Toast beim Öffnen | `src/modules/ports/PortsList.tsx` | Fehler bei „Im Browser öffnen" |
| Rendered/Raw | `src/components/ui/DocViewToggle.tsx` | wandert in die Kopfzeile |
| Wisch-Ausnahme | `data-no-tab-swipe` (`src/modules/tabs/lib/tabSwipe.ts`) | Muster für BR-18 |
| Zen-Modus | `src/app/App.tsx` | wird ausgebaut |
| Kontextmenü | `src/modules/explorer/FileExplorer.tsx` | Eintrag „Im Browser öffnen" |

### New Patterns

| Pattern Type | Description | Rationale |
|--------------|-------------|-----------|
| Vorschau-Kopfzeile | schmale Zeile über dem Inhalt statt Overlay | Overlay verdeckt Inhalt, Platz für weitere Tasten |

---

## User Flow

1. FL-1: [W1] User wählt in der Kopfzeile einer Vorschau oder im Explorer-Kontextmenü „Im Browser öffnen" -> Terax öffnet einen Link auf den Mini-Server im Standard-Browser des Macs.
2. FL-2: [W1] Der Browser ruft den Link auf -> der Server liefert die Datei; Verweise auf Dateien im Ordner der Datei und darunter lädt der Browser mit; bei einer Datei aus einem SSH-Workspace liest Terax sie vom Server.
3. FL-3: [W1] Datei oder Nachbardatei ändert sich, User lädt im Browser neu -> der Browser zeigt den aktuellen Stand.
4. FL-4: [W1] User wählt „Neu laden" in der Kopfzeile -> die In-App-Vorschau liest die Datei neu und zeigt den aktuellen Stand; der Tab bleibt derselbe.
5. FL-5: [W1] User wählt die Zen-Taste in der Kopfzeile oder das Kürzel -> Kopf, Statusleiste, Seitenleiste, Ränder und Rahmen verschwinden; der Tab-Inhalt füllt das Fenster.
6. FL-6: [W1] User drückt in einer Vorschau Esc, oder überall die Zen-Taste oder das Kürzel -> die Ansicht kehrt zurück.
7. FL-7: [W1] User wischt waagerecht über einer HTML-Vorschau -> der Tab wechselt nicht; der Inhalt der Seite reagiert wie in einem Browser.
8. FL-8: [W2] User wählt „Im Browser öffnen" bei einer Markdown-Datei -> der Browser zeigt die einfach gerenderte Fassung samt Bildern aus dem Ordner der Datei.

**Error Paths:**
- EP-1: [W1] Aufruf ohne oder mit ungültigem Geheimnis -> kein Dateiinhalt.
- EP-2: [W1] Verbindungsversuch über eine andere Adresse als 127.0.0.1 -> keine Verbindung.
- EP-3: [W1] Eine Nachbardatei liegt außerhalb des Ordners der Datei (auch über einen Symlink) oder steht auf der Sperrliste -> sie wird nicht ausgeliefert; die übrige Seite lädt.
- EP-4: [W1] Aufruf eines Links nach dem Beenden von Terax -> keine Verbindung; nach dem Neustart braucht es einen neuen Klick.
- EP-5: [W1] Ein Bild oder PDF ist größer als 10 MB -> wird nicht ausgeliefert.
- EP-6: [W1] Öffnen im Browser scheitert -> Fehler-Toast nach dem Muster der Ports-Liste; Wortlaut legt die Architektur fest.

---

## UI Layout & Context

> No requirement IDs — context

### Screen: HTML-, Markdown- und Raw-Ansicht
**Position:** Tab-Inhalt
**When:** Vorschau sichtbar

**Layout:**
- Kopfzeile (UI-2), schmal, über dem Inhalt: Dateiname, Neu laden, Rendered/Raw, Im Browser öffnen, Zen
- Darunter der Inhalt, nicht mehr vom Umschalter verdeckt

### Screen: Bild- und PDF-Vorschau im Editor-Tab
**Position:** Tab-Inhalt
**When:** Bild oder PDF sichtbar

**Layout:**
- Kopfzeile mit mindestens Dateiname und Im Browser öffnen (BR-23)
- Darunter die Vorschau wie heute

### Screen: Zen-Modus
**Position:** ganzes Fenster
**When:** Zen an

**Layout:**
- Tab-Inhalt über das Fenster, ohne Kopf, Statusleiste, Seitenleiste, Ränder und Rahmen
- In Vorschauen bleibt die Kopfzeile mit der Zen-Taste als Rückweg

### Screen: Browser des Macs
**Position:** außerhalb von Terax
**When:** nach FL-1

**Layout:**
- Adresse `http://127.0.0.1:{port}/…` mit Geheimnis
- Inhalt: die Datei, wie der Browser sie darstellt; Markdown ab W2 einfach gerendert

---

## UI Components & States

| ID | Welle | Element | Type | Location | States | Behavior |
|----|-------|---------|------|----------|--------|----------|
| UI-1 | W1 | `open-in-browser` | Taste | Kopfzeile der Vorschau; Explorer-Kontextmenü (UI-5) | `available`, `hidden` (Art in dieser Welle nicht ausgeliefert) | Löst FL-1 aus; nur per Klick des Users |
| UI-2 | W1 | `preview-header` | Kopfzeile | über HTML-, Markdown-, Raw-Ansicht; über Bild- und PDF-Vorschau | `default`, `zen` | Ersetzt das Overlay; verdeckt keinen Inhalt |
| UI-3 | W1 | `preview-reload` | Taste | Kopfzeile | `idle`, `loading` | FL-4 |
| UI-4 | W1 | `zen-toggle` | Taste | Kopfzeile | `off`, `on` | FL-5, FL-6 |
| UI-5 | W1 | `explorer-open-in-browser` | Menüeintrag | Explorer-Kontextmenü, nur bei Dateien einer ausgelieferten Art | `shown`, `absent` | FL-1 ohne geöffnete Vorschau |

---

## Feature State Machine

### States Overview

| ID | Welle | State | UI | Available Actions |
|----|-------|-------|----|--------------------|
| ST-1 | W1 | `link_none` | kein Link dieser Datei | Im Browser öffnen |
| ST-2 | W1 | `link_valid` | Browser zeigt die Datei | Neuladen im Browser, erneut Im Browser öffnen |
| ST-3 | W1 | `zen_off` | normaler Aufbau | Zen an |
| ST-4 | W1 | `zen_on` | Tab-Inhalt füllt das Fenster | Zen aus (Esc in Vorschau-Tabs, Taste, Kürzel) |

### Transitions

| ID | Welle | Current State | Trigger | UI Feedback | Next State | Business Rules |
|----|-------|---------------|---------|-------------|------------|----------------|
| TR-1 | W1 | `link_none` | UI-1 oder UI-5 | Browser öffnet sich | `link_valid` | BR-1, BR-2, BR-3, BR-16 |
| TR-2 | W1 | `link_valid` | Terax wird beendet | -- | `link_none` | BR-15 |
| TR-3 | W1 | `zen_off` | UI-4 oder Mod+Shift+' | Aufbau verschwindet | `zen_on` | BR-19, BR-20 |
| TR-4 | W1 | `zen_on` | Esc (nur in Vorschau-Tabs), UI-4 oder Mod+Shift+' | Aufbau kehrt zurück | `zen_off` | BR-20 |

---

## Garantie

> No requirement IDs — context

keine

---

## Business Rules

Teil A
- BR-1: [W1] Terax liefert die Browser-Ansicht über einen eigenen Webserver auf dem Mac aus. Er nimmt Verbindungen nur auf 127.0.0.1 an, nie aus dem Netz.
- BR-2: [W1] Der Port des Servers ist zufällig, nicht fest.
- BR-3: [W1] Jeder Link trägt ein Geheimnis. Ohne gültiges Geheimnis liefert der Server keinen Dateiinhalt.
- BR-4: [W1] Der Server liefert die geöffnete Datei und Dateien aus ihrem Ordner und dessen Unterordnern. Ein Verweis nach oben (`../styles.css`) lädt nicht. Liegt die Datei direkt im Home, in der Dateisystem-Wurzel oder in einem Ordner oberhalb des Home, wird nur die Datei selbst ausgeliefert.
- BR-5: [W1] BR-1 bis BR-4 gelten für lokale Dateien und für Dateien in SSH-Workspaces; der SSH-Fall ist der Hauptfall. WSL-Workspaces sind nicht Teil dieses Vorhabens.
- BR-6: [W1] Neuladen im Browser zeigt den aktuellen Stand der Datei und ihrer Nachbardateien, ohne Schritt in Terax.
- BR-7: [W1] „Im Browser öffnen" ist zusätzlich; die In-App-Vorschau bleibt bestehen.
- BR-8: [W1] Terax öffnet den Link im Standard-Browser des Macs. Windows und Linux als Client sind nicht Teil dieses Vorhabens.
- BR-9: [W1] In Welle 1 liefert der Server HTML samt Nachbardateien, Bilder und PDF. Markdown folgt in Welle 2 (BR-17). Video und Audio sind nicht Teil dieses Vorhabens.
- BR-10: [W1] Dateien der Sperrliste (u. a. `.env`, Schlüssel, Inhalte von `.ssh`) liefert der Server nie aus, auch wenn sie im Ordner der Datei liegen.
- BR-11: [W1] Maßgeblich für BR-4 und BR-10 ist das Ziel nach Auflösen von Symlinks, lokal wie auf dem SSH-Server.
- BR-12: [W1] Bilder und PDF liefert der Server als Rohdatei bis 10 MB, lokal und über SSH.
- BR-13: [W1] Über SSH liest der Server über den heutigen Leseweg der App (je Datei bis 10 MB, kein Teil-Lesen). Ein neuer Leseweg kommt erst mit Video oder großen Dateien. (Steuereinheit, technisch)
- BR-14: [W1] Skripte einer HTML-Seite dürfen im Browser Dateien aus dem freigegebenen Bereich dieser Seite nachladen, nicht aus dem anderer Links. Alle anderen Arten (SVG, Markdown, Bilder) laufen abgeschottet. PDF nur nach Echtheitsprüfung (`%PDF-`).
- BR-15: [W1] Ein Link gilt, bis Terax beendet wird. Danach ist er ungültig; ein neuer Klick erzeugt einen neuen Link.
- BR-16: [W1] Nur ein Klick des Users löst „Im Browser öffnen" aus. Der eingebaute Terax-Agent und seine Werkzeuge können es nicht auslösen. (Steuereinheit, technisch)
- BR-17: [W2] Markdown zeigt der Browser einfach gerendert: Überschriften, Listen, Tabellen, Code, Bilder aus dem Ordner der Datei; ohne Formeln und ohne Code-Farben.

Teil B
- BR-18: [W1] Ein waagerechtes Wischen, das über einer HTML-Vorschau stattfindet, wechselt nie den Tab. Tab-Wechsel dort über Tab-Leiste, Tastatur oder Klick. In allen anderen Tabs bleibt das Wischen wie heute, die Einstellung „Trackpad swipe to switch tabs" bleibt.
- BR-19: [W1] Der Zen-Modus blendet zusätzlich zu Kopf und Statusleiste die Seitenleiste, die Ränder und den Rahmen aus, sodass der Tab-Inhalt das Fenster füllt. Die KI-/Block-Eingabe ist im Zen in Vorschau- und Code-Tabs ausgeblendet und bleibt in Terminal-Tabs (User, 25.11.2026).
- BR-20: [W1] Den Zen-Modus schaltet eine Taste in der Vorschau-Kopfzeile ein und aus. In Vorschau-Tabs (HTML, Markdown, Bild, PDF) verlässt Esc ihn, auch mit Fokus in der Seite; in Terminal- und Editor-Tabs geht Esc an das Programm. Das Kürzel Mod+Shift+' bleibt.
- BR-21: [W1] Über HTML-, Markdown- und Raw-Ansicht liegt eine gemeinsame schmale Kopfzeile statt des Overlays, mit Dateiname, Neu laden, Rendered/Raw, Im Browser öffnen und Zen. Sie verdeckt keinen Inhalt.
- BR-22: [W1] „Neu laden" liest die Datei neu (lokal und über SSH) und zeigt den aktuellen Stand, ohne Umweg über Raw und ohne Tab-Wechsel.
- BR-23: [W1] Auch Bild- und PDF-Vorschauen tragen eine Kopfzeile mit mindestens Dateiname und „Im Browser öffnen".
- BR-24: [W1] Speicher-, Cookie- und `fetch`-Grenzen der In-App-Vorschau bleiben wie heute (Sandbox ohne `allow-same-origin`, FS-6), auch wenn die Vorschau über den Mini-Server lädt; dabei laufen über SSH Inline- und CDN-Skripte, und Nachbardateien laden. (Steuereinheit, technisch)
- BR-25: [W1] „Im Browser öffnen" erscheint nur für Arten, die der Server in der jeweiligen Welle ausliefert (W1: HTML, Bilder, PDF; ab W2 zusätzlich Markdown), in der Kopfzeile und im Explorer-Kontextmenü.

---

## Data

| ID | Welle | Field | Required | Validation | Notes |
|----|-------|-------|----------|------------|-------|
| DF-1 | W1 | Link-Adresse | Yes | Host `127.0.0.1`, zufälliger Port, enthält das Geheimnis | Lage des Geheimnisses (Pfad, Query, Cookie-Tausch) legt die Architektur fest; BR-14 schließt ein über alle Links gemeinsames Cookie praktisch aus |
| DF-2 | W1 | Geheimnis | Yes | zufällig, nicht erratbar; gültig bis Terax endet | an eine Datei, ihren Ordner und ihren Ort (lokal oder SSH-Host) gebunden |
| DF-3 | W1 | Bezugsdatei mit Ort | Yes | -- | Pfad plus Workspace des Tabs (`useTabs.ts:153-176`); der SSH-Host stammt aus der Freigabe, nie aus der Adresse |
| DF-4 | W1 | Größengrenze | Yes | 10 MB je Datei (Bilder, PDF; über SSH je Datei) | BR-12, BR-13 |

---

## Trigger-Inventory

> Terax hat keine Nutzungsmessung (`SECURITY.md:36`). Alle Zeilen: Signal bewusst keines.

| ID | Welle | Entry Point | Trigger | Signal today | Signal after | Notes |
|----|-------|-------------|---------|--------------|--------------|-------|
| TG-1 | W1 | Vorschau-Kopfzeile | Klick „Im Browser öffnen" | none | none — deliberate | ab W2 auch Markdown |
| TG-2 | W1 | Explorer-Kontextmenü | „Im Browser öffnen" | none | none — deliberate | -- |
| TG-3 | W1 | Browser des Macs | Aufruf oder Neuladen eines Links | none | none — deliberate | Systemeingang; EP-1 bis EP-5 |
| TG-4 | W1 | Terax | Server läuft (Systemzustand, nicht angezeigt) | none | none — deliberate | endet mit Terax |
| TG-5 | W1 | Vorschau-Kopfzeile | Neu laden | none | none — deliberate | -- |
| TG-6 | W1 | Kopfzeile, Tastatur | Zen an/aus, Esc | none | none — deliberate | geändertes Verhalten |
| TG-7 | W1 | Trackpad über HTML-Vorschau | waagerechtes Wischen | none | none — deliberate | geändertes Verhalten |
| TG-8 | W1 | Vorschau-Kopfzeile | Rendered/Raw | none | none — deliberate | vom Overlay in die Zeile |

---

## Compliance & Security Surface

> No requirement IDs — covered via BR-1, BR-3, BR-4, BR-10, BR-11, BR-14, BR-15, BR-16, BR-24

| Fläche | Berührt | Befund |
|--------|---------|--------|
| Auth | Ja | Geheimnis im Link (BR-3), gültig bis Terax endet (BR-15) |
| Sensible Daten at-rest | Nein | Server speichert nichts; beim Lesen gelten Reichweite und Sperrliste (BR-4, BR-10, BR-11) |
| Externe Integrationen / Webhooks | Ja (Browser) | fremde Seiten im selben Browser sind Angreifer (Bedrohungen 3, 4, 7); Skripte der Seite nur im eigenen Bereich (BR-14) |
| Privilegierte Aktionen | Ja | lauschender Port nur auf 127.0.0.1 (BR-1); remote Lesen mit den Rechten des Server-Kontos |
| KI-Werkzeugfläche | Ja (Abgrenzung) | eingebauter Agent kann nicht auslösen (BR-16) |
| In-App-Sandbox | Nein (unverändert) | FS-6 bleibt (BR-24) |
| Aufbewahrungspflichten | Nein | -- |

---

## Implementation Slices

> No requirement IDs — context

Nicht Teil dieser Discovery (Vorgabe: kein Slice-Schnitt). Laufgrenze siehe Frame.

---

## Konfliktfläche Upstream-Sync

> No requirement IDs — context

| Fundstelle im Fork | Upstream-Gegenstück | Quelle |
|--------------------|---------------------|--------|
| `src-tauri/src/modules/fs/asset.rs`, `lib.rs:415` | `assets.rs` (Grant-Modell) seit crynta#1450; crynta#1486 ändert erneut | `git show upstream/main:…`; `gh pr view 1486 -R crynta/terax-ai` |
| `src-tauri/tauri.conf.json:28-32` | geändert in crynta#1486, CSP in `upstream/main` schon anders | `git show upstream/main:src-tauri/tauri.conf.json` |
| `src/modules/editor/EditorPane.tsx:370-505` (Kopfzeile für Bild und PDF, BR-23) | geändert in crynta#1486 | `gh pr view 1486` |
| `src/modules/editor/lib/binaryPreview.ts` | Upstream `mediaPreview.ts` | `gh api …/contents/src/modules/editor/lib` |
| `src/modules/markdown/MarkdownPreviewPane.tsx` (Kopfzeile, BR-21) | Upstream `useMarkdownDocument.ts`, crynta#1461 | `gh pr view 1461` |
| `src/modules/html/HtmlPreviewPane.tsx` | kein Gegenstück, Upstream ohne Modul `html` | `git ls-tree upstream/main src/modules/` |

---

## Context & Research

> No requirement IDs — context

### Similar Patterns in Codebase
| Feature | Location | Relevant because |
|---------|----------|------------------|
| Binär-Lesen über SSH | `src-tauri/src/modules/ssh.rs:394-412`, `:1490-1525`; `src-tauri/src/modules/fs/file.rs:156-191` | Leseweg mit aufgelöstem Pfad und 10 MB |
| Lese-Guard | `src-tauri/src/modules/fs/guard.rs` | Sperrliste, Symlinks |
| Asset-Freigabe | `src-tauri/src/modules/fs/asset.rs` | Regel „Ordner der Datei, nie Home oder Wurzel" |
| Port-Freigaben, Server-Chrome | `src-tauri/src/modules/ports.rs`, `ports/chrome.rs`; `TERAX.md:44-45` | Loopback, Lebensdauer, Klick, Adresse nur in Rust |
| Upstream-Grant-Modell | `upstream/main:src-tauri/src/modules/fs/assets.rs` | Token, Widerruf, Ordner-Prüfung, Range, Kopfzeilen |
| Wisch-Ausnahme | `src/modules/tabs/lib/tabSwipe.ts` | `data-no-tab-swipe` |

### Web Research
| Source | Finding |
|--------|---------|
| [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access) | ab Chrome 142 Nachfrage bei Zugriffen öffentlicher Seiten auf lokale Adressen |
| [GHSA-vg6x-rcgg-rjx6](https://osv.dev/vulnerability/GHSA-vg6x-rcgg-rjx6), [Vite server options](https://vite.dev/config/server-options.html) | DNS-Rebinding ohne Host-Prüfung |
| [Jupyter Server Security](https://jupyter-server.readthedocs.io/en/latest/operators/security.html) | Token im Link, Host-Prüfung auf Loopback |
| [OX Security: Live Preview](https://www.ox.security/blog/xssinlivepreview/), [CVE-2025-65717](https://www.sentinelone.com/vulnerability-database/cve-2025-65717/) | lokale Vorschau-Server von VS-Code-Erweiterungen von fremden Seiten lesbar |
| [WebKit Bug 171934](https://bugs.webkit.org/show_bug.cgi?id=171934), [WebKit Bug 272461](https://bugs.webkit.org/show_bug.cgi?id=272461) | Loopback-`http` und eigene Schemes in WebKit |
| [LogRocket: Streaming video in Safari](https://blog.logrocket.com/streaming-video-in-safari/) | Safari braucht `206 Partial Content` |
| [comrak](https://docs.rs/crate/comrak/0.59.0) | Markdown in HTML in Rust, entfernt rohes HTML |
| [Tauri core.js](https://docs.rs/crate/tauri/2.9.1/source/scripts/core.js) | `convertFileSrc` mit `encodeURIComponent` |
| [CVE-2026-42184](https://nvd.nist.gov/vuln/detail/cve-2026-42184) | Fehlklassifizierung lokaler Origins in Tauri, behoben 2.10.3 |
| Quellen Teil B | `dossier-vorschau.md` Abschnitt „Quellen außerhalb des Repos" |

---

## Frame

> No requirement IDs — context

| Question | Recommendation (from research) | Decision |
|----------|--------------------------------|----------|
| Legacy parity | not configured (`zip.config.json` fehlt) | not asked |
| Run boundary -- what does this run build, what comes after the merge? | Welle 1 in diesem Lauf, Welle 2 direkt danach | User: Welle 1 = HTML samt Nachbardateien, Bilder, PDF bis 10 MB, lokal und SSH, plus Teil B; Welle 2 = Markdown einfach gerendert. Video/Audio eigenes Vorhaben; WSL, Windows/Linux als Client nicht in diesem Vorhaben |
| Tolerated duplication -- may old and new path run side by side, until when? | In-App-Vorschau behält Asset/`srcDoc`, Browser nutzt den Server | Heutiger Ladeweg der In-App-Vorschau bleibt als Rückfall hinter einer Konstante, bis die Messung M-C am Mac bestanden ist. Davon unabhängig und dauerhaft: lehnt der Mini-Server eine einzelne Datei ab oder kann sie nicht liefern, lädt diese eine Vorschau auf dem heutigen Weg (User, 25.11.2026). |
| Open business rule -- which rule is undecided, who decides it? | keine Geschäftsregel offen | Offen bleibt nur die Beobachtung zum Hänger (Offene Frage 1) |

### Nach dem Merge

| Welle | IDs |
|-------|-----|
| W2 | FL-8, BR-17 |

---

## Open Questions

> No requirement IDs — context

Vollständige Fassung: Abschnitt „Offene Fragen".

---

## Offene Fragen

> No requirement IDs — context

1. **Was tust du, wenn das Scrollen nach einem Tab-Wechsel hängt?** (`fachlich`, Beobachtungsfrage; Dossier-Frage 2)
   - a) Zeiger ein Stück bewegen reicht.
   - b) Erst in die Seite klicken.
   - c) Finger heben und neu ansetzen.
   - d) Erst zurück in den richtigen Tab wischen oder klicken.
   - Empfehlung: zuerst E1 (Wisch-Einstellung einen Tag aus), weil ein Verschwinden des Hängers H1 bestätigt; die Antwort grenzt H2 bis H6 ein.

---

## Nicht messbar auf der Werkbank

> No requirement IDs — context

Kein `cargo`, App nicht startbar. Die Experimente E1 bis E11 stehen in `dossier-vorschau.md` Abschnitt 7 (CSP-Fragen E9, E10 nur im Release-Build) und werden hier nicht wiederholt. Messseite zur In-App-Vorschau über den Mini-Server: `evidence/messseite/index.html`.

| # | Prüfpunkt | Warum es zählt |
|---|-----------|----------------|
| N-1 | Laden lokale HTML-Vorschauen heute relative Bilder und CSS? Widerlegung zu B1: laut Smoke 2026-07-02 nein (`security-smoke-checklist.md:150-155`), Code-Kommentar sagt ja (`HtmlPreviewPane.tsx:22-23`); `convertFileSrc` in Tauri 2.12 prüfen | Ist auch der lokale Fall kaputt |
| N-2 | Öffnet `openUrl` `http://127.0.0.1:{port}/…` im Standard-Browser (belegt nur `localhost`) | BR-8 |
| N-3 | Browser-Cache beim Neuladen: neuer Stand von HTML und CSS in Safari und Chrome | BR-6 |
| N-4 | Laufzeit je Datei über SSH, viele Nachbardateien gleichzeitig (sshd `MaxSessions`) | BR-13 |
| N-5 | Lesen bei getrennter SSH-Verbindung (Passphrase-Schlüssel) | EP-Fälle |
| N-6 | Server-Features von hyper schon im Build, Größenzuwachs | `TERAX.md:20` |
| N-7 | Chrome Local Network Access beim Öffnen aus Terax | Bedienbarkeit |
| N-8 | PDF im Browser, wenn die Antwort abgeschottet ist (PDF-Viewer in Safari und Chrome) | BR-12, BR-14 |
| N-9 | Skripte einer HTML-Seite erreichen Nachbardateien, aber keine Dateien anderer Links | BR-14 |
| N-10 | Esc verlässt den Zen-Modus auch mit Fokus im iframe der HTML-Vorschau | BR-20 |
| N-11 | Ampelknöpfe im ausgebauten Zen-Modus über dem Inhalt | BR-19 |
| N-12 | Wischen über HTML-Vorschau wechselt nicht, Seite scrollt waagerecht; Wischen in anderen Tabs unverändert | BR-18 |
| N-13 | H1 bei Gesten, die in einem anderen Tab beginnen und auf einem HTML-Tab enden; H2 bis H6 (E1 bis E8) | Scroll-Hänger |
| N-14 | Popups, Downloads, Zwischenablage der In-App-Vorschau (E10) | Weiche der Steuereinheit „erst messen" |
| N-15 | Zwei Apps nebeneinander (`Terax Dev`) mit getrennten Servern | `TERAX.md:155-175` |

---

## Research Log

> No requirement IDs — context

| Date | Area | Finding |
|------|------|---------|
| 2026-11-25 | Codebase | Vorschau-Arten, Ladewege, Gates gelesen (Ist-Stand Teil A) |
| 2026-11-25 | Codebase | Kein HTTP-Server, kein eigenes URI-Scheme; `TcpListener` nur in Belegungsproben und Tests |
| 2026-11-25 | Codebase | SSH-Lesen je Datei als eigener Prozess, 10 MB, 30 s, kein Range |
| 2026-11-25 | Dokumente | Smoke 2026-07-02: relative Verweise lokal kaputt, widerspricht Code-Kommentar |
| 2026-11-25 | Upstream | `upstream/main` mit Grant-Modell (crynta#1450), nicht im Fork; kein `html`-Modul upstream |
| 2026-11-25 | Teil B | Dossier `dossier-vorschau.md` eingearbeitet: kein Panel rechts, Wisch-Mechanik, H1 bis H6, CSP-Vererbung |
| 2026-11-25 | GitHub | Issues im Fork deaktiviert |
| 2026-11-25 | Werkzeug | `zip.config.json` fehlt; kein `cargo` |

---

## Q&A Log

> No requirement IDs — context

Dieser Agent hat dem User keine Frage direkt gestellt. Die Fragen gingen über die Steuereinheit; technische Weichen hat die Steuereinheit nach den Empfehlungen gesetzt, die Architektur darf sie mit Beleg widerlegen.

| # | Question | Recommendation | Answer | Alternative & consequence | Mode |
|---|----------|----------------|--------|---------------------------|------|
| 1 | Welche Variante soll „im Browser öffnen" bekommen? | nicht überliefert | Mini-Server in der App: 127.0.0.1, Zufallsport, geheimer Link, Datei samt Nachbardateien, auch vom SSH-Server; Neuladen zeigt den aktuellen Stand. User, 2026-11-25 | nicht überliefert | interaktiv (Steuereinheit) |
| 2 | Für welche Vorschau-Arten? | nicht überliefert | „alle möglichen Dateien … Markdown, HTML, Bilder und so weiter … Aber HTML ist halt das Wichtigste". User, 2026-11-25 | nicht überliefert | interaktiv (Steuereinheit) |
| 3 | Wie weit darf die Browser-Seite außer der Datei selbst Dateien laden? | A: Ordner der Datei und Unterordner, nie Home oder Wurzel, Geheimnis-Dateien nie; entspricht der Regel der In-App-Vorschau | A; ein Verweis nach oben lädt nicht. User, 2026-11-25 | B (bis Projektwurzel): `../` lädt, größere Reichweite; C (nur Datei): Seiten ohne Bilder und CSS | interaktiv (Rückfrage) |
| 4 | Dürfen Skripte einer HTML-Seite im Browser weitere Dateien per Skript nachladen? | C: ja für HTML, abgeschottet für andere Arten | C: ja für HTML-Seiten im freigegebenen Bereich, abgeschottet für SVG, Markdown, Bilder. User, 2026-11-25 | A: auch SVG-Skripte lesen; B: dynamische Artefakte brechen im Browser | interaktiv (Rückfrage) |
| 5 | Wie lange soll ein Link funktionieren? | A: bis Terax endet, wie Port-Freigaben | A. User, 2026-11-25 | B: Link stirbt beim Schließen des Tabs; C: Abbruch nach fester Zeit; D: zusätzlicher Widerruf-Befehl | interaktiv (Rückfrage) |
| 6 | Wie soll Markdown im Browser aussehen, und was liefert der erste Lauf? (Fragen 4 und 6 aus Teil A) | B (einfach gerendert); erster Lauf HTML plus Bilder und PDF | Welle 1: HTML samt Nachbardateien, Bilder und PDF als Rohdatei bis 10 MB, lokal und SSH. Welle 2 direkt danach: Markdown einfach gerendert (Überschriften, Listen, Tabellen, Code, Bilder neben der Datei; ohne Formeln und Code-Farben). Video und Audio eigenes späteres Vorhaben. WSL und Windows/Linux als Client nicht in diesem Vorhaben. User, 2026-11-25 | Markdown wie in Terax: hoher Aufwand; alles in einem Lauf: neuer SSH-Leseweg mitten im Lauf | interaktiv (Rückfrage) |
| 7 | Wo soll die Taste „Im Browser öffnen" sitzen, und wer darf sie auslösen? | B mit Zusatz | B: Kopfzeile jeder Vorschau plus Explorer-Kontextmenü; nur Klick des Users, nicht der eingebaute Agent. Steuereinheit, technisch, 2026-11-25 | C: zusätzlich Befehlspalette und Tab-Menü; D: nur Menüs | automatisch (Steuereinheit, technisch) |
| 8 | Wie liest der Server Dateien vom SSH-Server? | C | C: heutiger Leseweg jetzt, neuer Leseweg erst mit Video oder großen Dateien. Steuereinheit, technisch, 2026-11-25 | B sofort: mehr Aufwand ohne Bedarf in W1 | automatisch (Steuereinheit, technisch) |
| 9 | Dossier-Frage 1: Wischen über der HTML-Vorschau | b | b: über einer HTML-Vorschau wechselt Wischen nie den Tab; Wechsel über Tab-Leiste, Tastatur, Klick; sonst wie heute. User, 2026-11-25 | a: Konflikt bleibt; c: Gewohnheit bricht in allen Tabs; d: aufwendig, scheitert vermutlich an der CSP | interaktiv (Rückfrage) |
| 10 | Dossier-Frage 3: Vorschau über das ganze Fenster | a | a: Zen-Modus ausbauen (zusätzlich Seitenleiste, Ränder, Rahmen weg; Taste in der Vorschau-Kopfzeile; Esc verlässt). User, 2026-11-25 | b: eigene Taste nur für Vorschauen; c: nur Ränder weg; d: nur Browser | interaktiv (Rückfrage) |
| 11 | Dossier-Frage 5: Speicher und `fetch` für Artefakte | a | a: bleibt wie heute, FS-6 unangetastet. Steuereinheit, technisch, 2026-11-25 | b: hängt an Offener Frage 1; c: öffnet geschlossene Lücke | automatisch (Steuereinheit, technisch) |
| 12 | Dossier-Frage 6: Popups, Downloads, Zwischenablage | a | a: erst messen (E10). Steuereinheit, technisch, 2026-11-25 | b: Angleichung an Web-Vorschau ohne Messung | automatisch (Steuereinheit, technisch) |
| 13 | Dossier-Frage 7: Gemeinsame Kopfzeile | a | a: schmale Zeile mit Dateiname, Neu laden, Rendered/Raw, Im Browser öffnen, Zen. Steuereinheit, technisch, 2026-11-25 | b: Overlay bleibt; c: Einblenden bei Mausbewegung | automatisch (Steuereinheit, technisch) |
| 14 | Dossier-Frage 8: Absicherung durch Tests | a | a: Entscheidungsregeln als reine Funktionen mit Vitest plus Mac-Checkliste. Steuereinheit, technisch, 2026-11-25 | b: Test-Bridge nur im Debug-Build ohne CSP; c: nur manuell | automatisch (Steuereinheit, technisch) |
| 15 | Teil-A-Frage 7 / Dossier-Frage 4: In-App-Vorschau über den Mini-Server | C | entschieden: in W1, ohne Vorab-Messung (User, 25.11.2026) | -- | User, 25.11.2026 |
| 16 | Dossier-Frage 2: Was löst den Scroll-Hänger? | zuerst E1 | offen, Beobachtungsfrage an den User (Offene Frage 1). Steuereinheit, 2026-11-25 | -- | automatisch (Steuereinheit) |
