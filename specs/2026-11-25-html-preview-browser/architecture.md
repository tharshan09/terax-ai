# Feature: Vorschau im Browser öffnen (Mini-Server) und Vorschau in der App

**Epic:** –
**Status:** Ready
**Discovery:** `discovery.md` (same folder)
**Derived from:** Discovery constraints, NFRs, and risks
**Stand:** `main` @ `cf07327`, gelesen 2026-11-25. Modus autonom: Weichen ohne Antwort des Users sind automatisch entschieden und stehen im Q&A-Log. Alle fachlichen Weichen hat der User am 25.11.2026 beantwortet (Runden 2 und 3); Baustein E gehört zu Welle 1.

| Lesart der Template-Sections | Bedeutung in diesem Feature |
|------------------------------|-----------------------------|
| API Design | Tauri-Commands und -Events zwischen Webview und Rust, die HTTP-Schnittstelle des Mini-Servers zum Browser, Aktionen im Frontend |
| Database Schema | entfällt: keine Datenbank, Freigaben leben nur im Speicher des Prozesses |
| Server Logic | Rust-Kern des Mini-Servers (reine Funktionen plus dünne Hülle) und reine Regel-Funktionen im Frontend |

---

## Problem & Solution

> No requirement IDs — context

**Problem:**
- Eine HTML-Datei auf dem SSH-Server zeigt Terax ohne ihre Bilder und Styles; `srcDoc` hat keine Basisadresse (`src/modules/html/HtmlPreviewPane.tsx:22-25`). Lokal laden relative Verweise laut GUI-Smoke vom 2026-07-02 ebenfalls nicht (`security-smoke-checklist.md:150-155`).
- Kein Weg, eine Datei im echten Browser des Macs anzusehen.
- In der App: Wischen über einer HTML-Vorschau wechselt immer den Tab; ein Vollbild für den Tab-Inhalt fehlt; Rendered/Raw verdeckt den Inhalt; Neu laden geht nur über Raw und zurück.

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
| W1: Baustein E „In-App-Vorschau über den Mini-Server" (User, 25.11.2026, ohne Vorab-Messung; der heutige Ladeweg bleibt als Rückfall; Abschnitt „In-App-Vorschau über den Mini-Server") |
| W2: Markdown im Browser, einfach gerendert |

| Out of Scope |
|--------------|
| Video und Audio im Browser (eigenes späteres Vorhaben, mit neuem SSH-Leseweg und Range) |
| WSL-Workspaces; Windows und Linux als Client (Code kompiliert dort weiter, NFR-6) |
| Änderungen an Speicher-, Cookie- und `fetch`-Grenzen der In-App-Vorschau (BR-24) |
| Freigabe des Servers ins Netz oder an andere Geräte (BR-1) |
| Verweise ab der Seitenwurzel (`/assets/app.js`) im Browser (Q&A 7) |
| Fix des Scroll-Hängers über die Wisch-Ausnahme hinaus (H2 bis H6 bleiben Mac-Prüfpunkte) |

---

## Kernentscheidungen

> No requirement IDs — covered via SVC-n

| Nr | Entscheidung | Stelle im Entwurf | Anforderungen |
|----|--------------|-------------------|---------------|
| K1 | Mini-Server im Rust-Teil als eigenes Modul `preview_server`, HTTP/1.1 von Hand auf tokio-Socket plus `httparse`; keine neue Crate im Lockfile | SVC-1, SVC-3, SVC-9; MIG-1 | BR-1, BR-2 |
| K2 | Je Freigabe ein eigener Listener auf `127.0.0.1`, Port vom Betriebssystem zufällig vergeben; damit hat jeder Link innerhalb eines Terax-Laufs eine eigene Herkunft (Origin) im Browser. Grenzen: Cookies trennt der Browser nicht nach Port, und ein späterer Lauf kann einen Port wieder vergeben (Sicherheitsmodell 13, 24) | SVC-1, SEC-4 | BR-1, BR-2, BR-14 |
| K3 | Geheimnis: 256 Bit Zufall je Freigabe als erstes Pfadsegment `http://127.0.0.1:{port}/{token}/{datei}`; relative Verweise tragen es von selbst, `../` fällt aus dem Bereich | SEC-1, VAL-4, API-2 | BR-3, BR-4, DF-1, DF-2 |
| K4 | Lebensdauer bis Prozessende; nichts gespeichert; Wiederverwendung desselben Links je Ort und Datei; höchstens 256 Freigaben | SVC-1, VAL-11 | BR-15, ST-1, ST-2, TR-1, TR-2 |
| K5 | Freigabe-Modell: HTML = Bezugsdatei plus Ordner der aufgelösten Datei plus Unterordner; Bild und PDF = nur die Datei; Home, Dateisystem-Wurzel und Ordner oberhalb des Home = nur die Datei | SVC-2, SEC-2 | BR-4, BR-9 |
| K6 | Jede Datei (Bezugsdatei und jede Nachbardatei) läuft durch dieselbe Prüfkette: Pfad-Normalisierung, Auflösen der Symlinks, Bereich, Sperrliste plus `.git`, reguläre Datei, 10 MiB, PDF-Echtheit; nie `trusted` | VAL-5 bis VAL-9, SVC-7, SVC-8 | BR-10, BR-11, BR-12, EP-3, EP-5 |
| K7 | Über SSH der heutige Leseweg (Helfer-Operation `read_bytes`, `src-tauri/src/modules/ssh.rs:394-412`) über eine neue Variante `ssh::read_bytes_typed` mit Fehlerart an der Grenze (SVC-22, MIG-21); Prüfung auf dem vom Host gemeldeten Ziel, Host nur aus der Freigabe; je SSH-Host ein Lesevorgang zugleich (SEC-14, Q&A 35) | SVC-8, SVC-22, SEC-5, SEC-14 | BR-5, BR-11, BR-13, DF-3 |
| K8 | Antwort-Kopfzeilen je Art: HTML mit `frame-ancestors 'self'`, Skripte ohne CSP, träge Arten (SVG, Bilder, CSS, JSON, Unbekanntes, Markdown ab W2) mit `Content-Security-Policy: sandbox`, PDF nur echt und ebenfalls mit `sandbox` (Q&A 4, User); überall `nosniff`, `no-store`, `no-referrer` | SVC-5, SVC-6, SEC-7 | BR-6, BR-14 |
| K9 | „Im Browser öffnen" als Command `preview_open_in_browser`; die Adresse entsteht in Rust und wird dort über die Rust-Seite des Openers geöffnet; die Webview sieht sie nie; keine Capability-Änderung | API-1, SVC-11, SEC-8 | BR-8, BR-16, TR-1 |
| K10 | Auslöser nur Klick: Command nur aus `src/modules/preview-server/`, KI-Modul ohne Bezug, Guard-Test | SEC-3 | BR-16 |
| K11 | Gemeinsame Kopfzeile `PreviewHeader` über HTML, Markdown, Raw und über Bild/PDF; `DocViewToggle` wird Inline-Segment | SVC-14, MIG-5 bis MIG-9 | BR-21, BR-23, UI-2 |
| K12 | Neu laden über einen Zähler je Pane, lokal und SSH, ohne Tab-Wechsel | API-6 | BR-22, FL-4, UI-3 |
| K13 | Zen-Zustand in eigenem Store `src/modules/zen`; im Zen weichen Kopf, Statusleiste, Seitenleiste, Griff, Polster und Rahmen; Eingabezeile nur außerhalb von Terminal-Tabs | API-7, SVC-15 | BR-19, FL-5, ST-3, ST-4 |
| K14 | Esc verlässt Zen in Vorschau-Tabs, auch mit Fokus im iframe: macOS-Tastenmonitor nach dem Muster des Wisch-Monitors, scharf geschaltet nur im Zen über einer Vorschau | API-3, API-4, SVC-16, SVC-18 | BR-20, FL-6, TR-4 |
| K15 | Wisch-Ausnahme: `data-no-tab-swipe` auf der sichtbaren HTML-Pane plus Rückfallregel bei leerem Hover-Ziel | SVC-17, MIG-6, MIG-13 | BR-18, FL-7 |
| K16 | Baustein E in W1: die In-App-HTML-Vorschau lädt lokal und über SSH über den Mini-Server, mit unveränderter `iframe`-Sandbox; der heutige Ladeweg bleibt als Rückfall hinter einer Konstante im Code (Q&A 29) | API-8, API-9, SVC-19 | BR-7, BR-24 |
| K17 | W2 Markdown: Rendern im Rust-Teil mit `pulldown-cmark`, statisch, abgeschottet; W1 hält Art, Ordner-Freigabe und Kopfzeilen-Slot bereit | SVC-20 | BR-17, FL-8 |

---

## API Design

### Overview

> No requirement IDs — context

| Aspect | Specification |
|--------|---------------|
| Style | Tauri-Commands (`invoke`) und ein Tauri-Event zwischen Webview und Rust; HTTP/1.1 `GET`/`HEAD` zwischen Browser und Mini-Server; Frontend-Aktionen als Funktionen der Module |
| Authentication | Commands: wie alle App-Commands im Hauptfenster (keine eigene ACL, `src-tauri/build.rs:3-6`). HTTP: Geheimnis je Freigabe im ersten Pfadsegment (SEC-1) |
| Rate Limiting | HTTP: Verbindungs-, Lese-, Größen- und Zeitgrenzen (SEC-12 bis SEC-16); Commands: Freigabe-Grenze (VAL-11) |

### Endpoints

| ID | Method | Path | Request | Response | Auth | Business Logic |
|----|--------|------|---------|----------|------|----------------|
| API-1 | Tauri-Command | `preview_open_in_browser` | `{ path: string, workspace?: WorkspaceEnv }` | `BrowserOpen` | Klick des Users (SEC-3) | Prüft Art und Ort (VAL-10), löst die Bezugsdatei auf (lokal kanonisch, SSH `ssh::realpath`, `ssh.rs:1465-1472`), prüft Sperrliste, Größe und bei lokaler PDF die Echtheit, holt oder legt die Freigabe an (SVC-1), baut die Adresse und öffnet sie im Standard-Browser (SVC-11). Gibt nie eine Adresse zurück (BR-1, BR-2, BR-3, BR-7, BR-8, BR-16, FL-1, TR-1, ST-2, DF-1, DF-3, EP-6) |
| API-2 | HTTP `GET`, `HEAD` | `http://127.0.0.1:{port}/{token}/{relpath}` auf dem Listener einer Browser-Freigabe | Kopf mit `Host`, kein Rumpf | Bytes mit Kopfzeilen nach SVC-6; Fehlercodes nach „Error Handling Strategy" | Geheimnis (VAL-4) | Jede Anfrage liest die Datei neu (SVC-7 lokal, SVC-8 SSH); ein leerer `relpath` oder einer mit Schrägstrich am Ende liefert die `index.html` dieses Ordners, ein Ordner ohne Schrägstrich ergibt `404`, nie eine Liste (BR-3, BR-4, BR-6, BR-10 bis BR-14, FL-2, FL-3, EP-1 bis EP-5) |
| API-3 | Tauri-Command | `zen_escape_arm` | `{ armed: boolean }` | `void` | – | macOS: setzt den Schalter des Esc-Monitors (SVC-18); andere Plattformen: tut nichts (BR-20, TR-4) |
| API-4 | Tauri-Event, Rust an Webview | `terax:zen-escape` | – | ohne Nutzlast | – | Feuert bei Esc ohne Modifier, solange scharf geschaltet; das Frontend verlässt Zen nach SVC-16 (BR-20, FL-6, TR-4) |
| API-5 | Frontend-Aktion | `openInBrowser(path, workspace)` in `src/modules/preview-server/lib/openInBrowser.ts` | Pfad, `WorkspaceEnv` | – | Klick | Ruft API-1; bei Status ungleich `opened` Toast nach SVC-13 (FL-1, EP-6, UI-1, UI-5, TG-1, TG-2) |
| API-6 | Frontend-Aktion | `onReload` der Kopfzeile | – | – | – | Erhöht den Neu-laden-Zähler der Pane: HTML lokal neuer Asset-Zähler und erneutes `asset_allow`, HTML und Markdown über SSH erneutes `fs_read_file`; Raw baut den Editor neu auf, gesperrt solange ungespeichert. Zustand der Taste (UI-3): `loading` vom Klick bis HTML lokal: `load`-Ereignis des neuen `iframe`; HTML über SSH und Markdown: Antwort von `fs_read_file` (Erfolg oder Fehler); Raw: der neu aufgebaute Editor hat die Datei gelesen; danach `idle` (BR-22, FL-4, UI-3, TG-5) |
| API-7 | Frontend-Aktion | `enterZen`, `exitZen`, `toggleZen` in `src/modules/zen/lib/zenStore.ts` | – | – | – | Einziger Schreiber des Zen-Zustands; Kürzel Mod+Shift+' (`src/modules/shortcuts/shortcuts.ts:317-321`), Zen-Taste, Esc (BR-19, BR-20, FL-5, FL-6, TR-3, TR-4, ST-3, ST-4, UI-4, TG-6) |
| API-8 | Tauri-Command, Baustein E | `preview_frame_source` | `{ path: string, workspace?: WorkspaceEnv }` | `FrameSource` | Einhängen der Pane | Holt oder legt eine Freigabe der Klasse `frame` an und gibt ihre Adresse für das `iframe` zurück (W1, Q&A 29; Abschnitt „In-App-Vorschau über den Mini-Server") |
| API-9 | HTTP `GET`, `HEAD`, Baustein E | wie API-2 auf dem Listener einer `frame`-Freigabe | wie API-2 | wie API-2, Kopfzeilen der Klasse `frame` (SVC-6) | Geheimnis | wie API-2 |

### Data Transfer Objects (DTOs)

> No requirement IDs — covered via API-n

| DTO | Fields | Validation | Notes |
|-----|--------|------------|-------|
| `BrowserOpen` (Rust `preview_server::BrowserOpen`, TS gleicher Name) | `status`: `opened` \| `unsupported` \| `refused` \| `too_large` \| `unreachable` \| `limit_reached` \| `open_failed`; `reason`: Text oder `null` | `reason` nur bei `refused`, `unreachable`, `open_failed` | Enthält nie Adresse, Port oder Geheimnis; Muster `BrowserView` (`src-tauri/src/modules/ports/chrome.rs:25-46`). `Err(String)` nur bei innerem Fehler (Aufgabe abgebrochen) |
| `FrameSource` (Baustein E) | `status`: `ready` \| `unsupported` \| `refused` \| `too_large` \| `unreachable` \| `limit_reached`; `url`: Text oder `null`; `reason`: Text oder `null` | `url` nur bei `ready` | Adresse nur für das `iframe`, nie gespeichert (Abschnitt „In-App-Vorschau über den Mini-Server") |
| `WorkspaceEnv` (bestehend) | `local` \| `wsl{distro}` \| `ssh{host}` | `wsl` ergibt `unsupported` (VAL-10) | `src-tauri/src/modules/workspace.rs:322-334`; `src/modules/workspace/env.ts:5-8` |
| `Grant` (nur Rust, nie an der Grenze) | `token` (64 Hex-Zeichen), `class` (`browser` \| `frame`), `location` (`local` \| `ssh{host}`), `entry` (aufgelöster Pfad der Bezugsdatei, Text ohne Längengrenze), `root` (aufgelöster Ordner oder leer = nur Datei), `kind` (`html` \| `image` \| `pdf` \| ab W2 `markdown`), `port` | SVC-2, SVC-10 | Schlüssel der Wiederverwendung: `location` + `entry` + `class`. Felder angelehnt an upstream `Grant { owner, root, directory, workspace }` (`upstream/main:src-tauri/src/modules/fs/assets.rs`) |
| Eintritts-Adresse | `http://127.0.0.1:{port}/{token}/{name}`; `name` = prozentkodierter Dateiname der aufgelösten Bezugsdatei | Host immer die IP, nie `localhost` (Bedrohung 19) | Nur in Rust gebaut (SVC-11) |
| HTTP-Anfrage | Zeile `GET`/`HEAD` + Ziel; Kopf `Host`; kein Rumpf | VAL-1 bis VAL-5 | `Connection: close` in jeder Antwort |

| Art (SVC-5) | Endungen | `Content-Type` | `Content-Security-Policy` (Browser-Freigabe) | Weitere Kopfzeilen (alle Arten) |
|-------------|----------|----------------|----------------------------------------------|---------------------------------|
| HTML | `html`, `htm` | `text/html` | `frame-ancestors 'self'` | `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `Content-Length`, `Connection: close` |
| Skript | `js`, `mjs` | `text/javascript` | keine (eine CSP am Skript würde Worker-Skripte einschränken) | wie oben |
| Träge | `css`, `json`, `map`, `txt`, `csv`, `md` (als Rohdatei), `svg`, `png`, `jpg`, `jpeg`, `gif`, `webp`, `avif`, `bmp`, `ico`, `woff`, `woff2`, `ttf`, `otf`, `wasm` | je Endung (`text/css`, `application/json`, `image/svg+xml`, `font/woff2`, `application/wasm`, …) | `sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'` (Muster upstream `response`) | wie oben |
| Unbekannt | alle übrigen | `application/octet-stream` | wie träge | wie oben |
| PDF | `pdf`, nur nach VAL-9 | `application/pdf` | wie träge Arten (Q&A 4, User, 25.11.2026); als Konstante in SVC-6 | wie oben |
| Markdown gerendert, ab W2 | `md`, `markdown` als Bezugsdatei | `text/html` | `sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'` | wie oben |
| Klasse `frame` (Baustein E) | wie oben | wie oben | HTML: `frame-ancestors` mit den App-Herkünften (`tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost`; im Debug-Build zusätzlich `http://localhost:1420`); übrige Arten wie oben | wie oben |

---

## Database Schema

> No requirement IDs — context

### Entities

| Table | Purpose |
|-------|---------|
| N/A | Keine Datenbank. Freigaben leben nur im Speicher (SVC-1) und enden mit dem Prozess (BR-15); Tabs speichern wie heute nur Pfad und Workspace (`src/modules/spaces/lib/serialize.ts:259-268`) |

### Schema Details

N/A: keine Tabellen.

### Relationships

N/A: keine Tabellen.

---

## Server Logic

### Services & Processing

Rust-Teil neu unter `src-tauri/src/modules/preview_server/`; reine Funktionen ohne Tauri- oder AppKit-Bezug, mit `cargo test` unter Linux prüfbar (NFR-6). Frontend-Regeln als reine Funktionen mit Vitest daneben.

| ID | Service | Responsibility | Input | Output | Side Effects |
|----|---------|----------------|-------|--------|--------------|
| SVC-1 | `PreviewServer` (Zustand, `mod.rs`) | Hält Freigaben im Speicher; findet die bestehende Freigabe je Ort + aufgelöste Bezugsdatei + Klasse oder legt eine an; startet den Listener erst beim Anlegen (kein Socket vor dem ersten Klick); Grenze VAL-11; nie entfernt bis Prozessende (BR-2, BR-15, ST-1, ST-2, TR-2, DF-3, TG-4) | Ort, Bezugsdatei, Art, Klasse | Freigabe mit Port, Geheimnis, Eintrittsname | Bindet einen Socket je Freigabe, startet je Freigabe eine Aufgabe auf der bestehenden Laufzeit (`tauri::async_runtime`) |
| SVC-2 | `grant_scope` (rein, `grant.rs`) | Bereich nach BR-4: HTML (ab W2 Markdown) = Ordner der aufgelösten Bezugsdatei samt Unterordnern; Bild, PDF = nur Datei; liegt der Ordner auf Dateisystem-Wurzel, Home oder einem Ordner oberhalb des Home = nur Datei (Q&A 6). Home lokal über `dirs::home_dir`, über SSH über `ssh::realpath(host, "~")` (`ssh.rs:371-374`), je Host einmal gemerkt (BR-4, BR-9) | aufgelöste Bezugsdatei, Home, Art | `root` oder leer | – |
| SVC-3 | `parse_request` (rein, `request.rs`) | Liest den Anfragekopf mit `httparse`; prüft VAL-1 bis VAL-3 | Kopf-Bytes, Port des Listeners | Methode + Ziel oder Ablehnung mit Code | – |
| SVC-4 | `split_target` (rein, `request.rs`) | Trennt Geheimnis und relativen Pfad; prüft VAL-4 und VAL-5; dekodiert genau einmal (`percent-encoding`) | Ziel, Geheimnis der Freigabe | relative Segmente oder Ablehnung | – |
| SVC-5 | `served_type` (rein, `policy.rs`) | Endung zu Art und `Content-Type` nach der Tabelle in „DTOs"; eigene feste Liste statt `mime_guess`; Bezugsdatei-Arten je Welle als Konstante (BR-9, BR-14, BR-25) | Dateiname, Welle | Art, Medientyp | – |
| SVC-6 | `response_headers` (rein, `policy.rs`) | Kopfzeilen je Art und Freigabe-Klasse nach der Tabelle in „DTOs" (BR-6, BR-14) | Art, Klasse | Kopfzeilen-Liste | – |
| SVC-7 | `read_local` (`source.rs`) | Lokales Lesen: `root` + Segmente, Auflösen, VAL-6 und VAL-7, Öffnen ohne Blockieren, Pfad der geöffneten Datei erneut prüfen (macOS `F_GETPATH`, Linux `/proc/self/fd`, Windows erneutes Auflösen), VAL-8, VAL-9; Muster upstream `respond`/`opened_path` (BR-4, BR-10, BR-11, BR-12, EP-3, EP-5) | Freigabe, Segmente | Bytes + Art oder Ablehnung | Dateizugriff auf einem Blocking-Thread |
| SVC-8 | `read_remote` (`source.rs`) | SSH-Lesen: VAL-5 und VAL-7 auf dem Pfad-Text vor dem Senden, dann `ssh::read_bytes_typed(host, pfad, MAX_READ_BYTES, None)` (SVC-22), VAL-6 und VAL-7 auf dem vom Host gemeldeten Ziel, VAL-9. Fehlerart zu Antwort: `Missing` und `NotRegularFile` zu `404`, `TooLarge` zu `403` „Larger than 10 MB" (beim Klick `too_large`), `TimedOut` zu `504`, `Unreachable` nach einer Wiederholung (SEC-14) zu `502`, `Failed` (darin auch `Killed`, SVC-22) ohne Wiederholung zu `502`; beim Klick `Unreachable`, `TimedOut`, `Failed` zu `unreachable`. Höchstens ein Lesevorgang je Host zugleich (SEC-14). Muster `fs_read_remote_image_with` (`src-tauri/src/modules/fs/file.rs:176-191`); der Leser ist als Funktion übergeben, damit Tests einen Host-Ersatz nutzen (`file.rs:753-764`) (BR-5, BR-11, BR-13) | Host aus der Freigabe, Freigabe, Segmente, Leser | Bytes + Art oder Ablehnung | ein `ssh`-Aufruf über den ControlMaster je Datei (`ssh.rs:1142-1209`) |
| SVC-9 | `serve_listener` (`listener.rs`) | Annahme-Schleife je Freigabe; je Verbindung: Kopf lesen mit SEC-13, SVC-3, SVC-4, Lesen über SVC-7 oder SVC-8 hinter den Grenzen SEC-14, Antwort mit SVC-6 schreiben (SEC-15), Verbindung schließen | Socket, Freigabe | – | Netz |
| SVC-10 | `new_token`, `token_matches` (rein, `grant.rs`) | 32 Bytes aus `getrandom::fill`, als 64 Hex-Zeichen (wie upstream `grant`); Vergleich ohne frühen Abbruch (BR-3, DF-2) | – / zwei Texte | Geheimnis / ja-nein | – |
| SVC-11 | `open_entry` (`mod.rs`) | Baut die Eintritts-Adresse und öffnet sie mit `tauri_plugin_opener::open_url(url, None)` von der Rust-Seite (Muster `src-tauri/src/modules/ports/chrome.rs:68-72`); Fehler zu `open_failed` mit Grund (BR-8, DF-1, EP-6) | Freigabe | `BrowserOpen` | startet den Standard-Browser |
| SVC-12 | `browserOpenable` (TS rein, `src/modules/preview-server/lib/browserOpenable.ts`) | „Im Browser öffnen" erscheint nur für Arten der Welle (W1: `html`, `htm`, Rasterbilder, `svg`, `pdf`; ab W2 `md`, `markdown`, `mdx`) und nur für Ort `local` oder `ssh`; Liste spiegelt SVC-5, ein Guard-Test vergleicht beide (BR-25, BR-5, UI-1, UI-5) | Pfad, `WorkspaceEnv`, Welle | ja-nein | – |
| SVC-13 | `browserOpenText` (TS rein, `src/modules/preview-server/lib/browserOpenText.ts`) | Toast-Text je Status (Wortlaut Q&A 11); `opened` ergibt keinen Toast (EP-6) | `BrowserOpen`, Dateiname, Host | Text oder `null` | – |
| SVC-14 | `previewHeaderModel` (TS rein, `src/modules/doc/lib/previewHeader.ts`) | Welche Elemente die Kopfzeile je Fläche zeigt: HTML und Markdown: Dateiname, Neu laden, Rendered/Raw, Im Browser öffnen (nach SVC-12), Zen; Raw: dieselben, Neu laden und Rendered gesperrt solange ungespeichert; Bild, PDF (auch Karte über SSH): Dateiname, Im Browser öffnen, Zen (Q&A 5) (BR-21, BR-23, BR-25, UI-2) | Fläche, Pfad, `WorkspaceEnv`, ungespeichert | Sichtbarkeit und Sperre je Element | – |
| SVC-15 | `zenChrome` (TS rein, `src/modules/zen/lib/zenChrome.ts`) | Was im Zen weicht: Kopf, Statusleiste, Seitenleiste, Griff, Polster der Arbeitsfläche, Rahmen der Pane; Eingabezeile weicht in allen Tabs außer Terminal-Tabs (Q&A 3); Zen aus = Aufbau wie heute (BR-19, FL-5, FL-6) | Zen an/aus, aktiver Tab | Schalter je Element | – |
| SVC-16 | `zenEscapeArmed`, `shouldExitZenOnEscape` (TS rein, `src/modules/zen/lib/zenEscape.ts`) | Scharf nur im Zen und wenn der aktive Tab eine Vorschau zeigt (`html`, `markdown`, `editor` mit Bild oder PDF); Esc verlässt Zen nicht, solange ein Dialog oder Menü offen ist; in Terminal- und Code-Tabs geht Esc an das Programm (Q&A 2) (BR-20, TR-4) | Zen, aktiver Tab, offene Überlagerung | ja-nein | – |
| SVC-17 | `defersToActivePreview` (TS rein, `src/modules/tabs/lib/tabSwipe.ts`) | Rückfallregel neben `isInsideHorizontalScroller`: ist der aktive Tab `html` und liefert `:hover` kein Ziel, wechselt das Wischen nicht (BR-18, FL-7, TG-7) | aktive Tab-Art, Hover-Ziel | ja-nein | – |
| SVC-18 | `install_zen_escape_monitor` (Rust, macOS, `src-tauri/src/modules/zen_escape.rs`) | Lokaler AppKit-Monitor für `keyDown` (Muster `install_tab_swipe_monitor`, `src-tauri/src/lib.rs:58-131`): bei Esc ohne Modifier und gesetztem Schalter (API-3) feuert er API-4; gibt jedes Ereignis unverändert weiter; andere Plattformen ohne Monitor (BR-20) | `NSEvent`, Schalter | Event | Event an die Webview |
| SVC-19 | `htmlPreviewSource` (TS rein, Baustein E, `src/modules/html/lib/htmlPreviewSource.ts`) | Ladeweg der In-App-HTML-Vorschau: in W1 `server` für `local` und `ssh`, `srcdoc` für WSL wie heute; steht die Konstante „Baustein an" auf aus (Rückfall, Abschnitt „In-App-Vorschau über den Mini-Server"), `asset` (lokal) oder `srcdoc` (SSH, WSL) wie heute (`HtmlPreviewPane.tsx:26-28`) (BR-7, BR-24) | `WorkspaceEnv`, Baustein an/aus | `asset` \| `srcdoc` \| `server` | – |
| SVC-20 | [W2] `render_markdown` (Rust, `src-tauri/src/modules/preview_server/markdown.rs`) | Markdown zu statischem HTML mit `pulldown-cmark`: Überschriften, Listen, Tabellen, Code ohne Farben, Bilder als relative Verweise; rohes HTML der Datei wird als Text ausgegeben; feste kleine Stilvorlage inline; ohne Formeln (BR-17, FL-8) | Markdown-Bytes | HTML-Bytes | – |
| SVC-21 | `is_pdf_magic` (rein, `src-tauri/src/modules/fs/file.rs`) | Ein Ort für „beginnt mit `%PDF-`"; genutzt von `fs_is_pdf` (`file.rs:193-260`) und VAL-9 (BR-12) | erste Bytes | ja-nein | – |
| SVC-22 | `read_bytes_typed` (`src-tauri/src/modules/ssh.rs`) | Wie `read_bytes` (`ssh.rs:1490-1502`), aber mit Fehlerart statt Text: die Rust-Seite übernimmt die Art aus der bestehenden internen Einteilung `RemoteError` (`ssh.rs:1045-1053`), die heute in `From<RemoteError> for String` verloren geht (`ssh.rs:1055-1064`): `Transport` zu `Unreachable`, `TimedOut` zu `TimedOut`, `Killed` (Helfer durch ein Signal beendet, z. B. bei Speichermangel, `ssh.rs:1105-1108`) zu `Failed`, `Failed` zu `Failed` oder einer der festen Arten. Der Helfer meldet bei `read_bytes` zusätzlich eine feste Art (`missing`, `not_regular`, `too_large`) im Antwort-Umschlag; gelesen wird sie in `read_bytes_typed` selbst aus dem Umschlag, nicht in `helper_answer` (`ssh.rs:1230-1273`), das weiter nur `Failed(String)` liefert (MIG-21). `read_bytes` bleibt mit Text-Fehler für `fs_read_remote_image` (BR-5, BR-12, BR-13) | Host, Pfad, Grenze, erwartete Größe | `RemoteFileBytes` oder `RemoteReadError` | wie `read_bytes` |

### Business Logic Flow

> No requirement IDs — covered via SVC-n

```
Klick (Kopfzeile UI-1 / Explorer UI-5) → openInBrowser (API-5) → preview_open_in_browser (API-1)
    → VAL-10 Art + Ort → Bezugsdatei auflösen (lokal kanonisch / SSH realpath) → VAL-7, VAL-8, VAL-9 (lokal)
    → SVC-2 Bereich → SVC-1 Freigabe holen/anlegen (VAL-11) → Listener 127.0.0.1:{zufall}
    → SVC-11 Adresse bauen → Opener (Rust) → Standard-Browser
    → BrowserOpen → SVC-13 Toast (nur wenn nicht opened)

Browser → TCP 127.0.0.1:{port} → SVC-9 (SEC-12, SEC-13)
    → SVC-3 (VAL-1, VAL-2, VAL-3) → SVC-4 (VAL-4, VAL-5)
    → Ort der Freigabe: lokal SVC-7 | SSH SVC-8 (SEC-14)
          → VAL-6, VAL-7, VAL-8, VAL-9 → SVC-5 Art
    → SVC-6 Kopfzeilen → Antwort (SEC-15) → Verbindung zu

Zen: Kürzel / Taste UI-4 → zenStore (API-7) → SVC-15 → App, Arbeitsfläche, Panes
     zenEscapeArmed (SVC-16) → zen_escape_arm (API-3) → Esc → terax:zen-escape (API-4) → exitZen
```

### Validation Rules

| ID | Field | Rule | Error Message |
|----|-------|------|---------------|
| VAL-1 | `Host` der Anfrage | Je Freigabe-Klasse genau eine Schreibweise mit dem Port dieses Listeners: Klasse `browser` nur `127.0.0.1:{port}`; Klasse `frame` (Baustein E) `127.0.0.1:{port}`, mit Fallback-Adresse stattdessen genau `localhost:{port}`; fehlt der Host oder nennt er etwas anderes (Name, anderer Port, andere Schreibweise), gibt es keinen Inhalt (BR-1) | `421`, leer |
| VAL-2 | Methode, Rumpf | Nur `GET` und `HEAD`; eine Anfrage mit Rumpf oder Übertragungs-Kodierung wird abgewiesen; keine CORS-Antwortkopfzeilen (BR-3) | `405` bzw. `400`, leer |
| VAL-3 | Anfragekopf | Größe und Lesedauer des Kopfs sind begrenzt (SEC-13); unlesbarer Kopf wird abgewiesen | `431` bzw. `400`, Verbindung zu |
| VAL-4 | Geheimnis | Das erste Pfadsegment ist genau das Geheimnis der Freigabe dieses Listeners; das Geheimnis einer anderen Freigabe gilt hier nicht; fehlt es oder ist es falsch, kein Inhalt und kein Hinweis, ob die Datei existiert (BR-3, BR-14, EP-1, DF-2) | `404`, leer |
| VAL-5 | Relativer Pfad | Einmal dekodiert; ein leeres Segment in der Mitte (doppelter Schrägstrich), ein Segment `.` oder `..`, eines mit Rückstrich, Steuerzeichen oder (Windows) Doppelpunkt wird abgewiesen; ein leerer `relpath` und genau ein leeres Schluss-Segment (Schrägstrich am Ende) bedeuten „Ordner" und gehen an VAL-8; ein zweites Dekodieren findet nie statt (BR-4, EP-3) | `404` „Not found" |
| VAL-6 | Bereich | Das Ziel nach Auflösen aller Symlinks liegt in `root` (Vergleich je Pfadkomponente) oder ist bei einer Nur-Datei-Freigabe genau die Bezugsdatei; lokal vor und nach dem Öffnen geprüft, über SSH auf dem vom Host gemeldeten Ziel (BR-4, BR-11, EP-3) | `403` „Refused by Terax" |
| VAL-7 | Sperrliste | Pfad-Text und aufgelöstes Ziel bestehen die Sperrliste `guard::check_read_str` (`src-tauri/src/modules/fs/guard.rs:172-207`); zusätzlich kein Segment `.git`; es gibt kein `trusted`, auch nicht für die Bezugsdatei (BR-10, BR-11) | `403` „Refused by Terax"; beim Klick Status `refused` |
| VAL-8 | Datei-Art, Größe | Nur reguläre Dateien bis `MAX_READ_BYTES` (10 MiB, `file.rs:16`), lokal und über SSH; eine Ordner-Anfrage nach VAL-5 liefert nur die `index.html` dieses Ordners; ein Ordner ohne Schrägstrich am Ende ergibt `404` (lokal: keine reguläre Datei; SSH: `NotRegularFile`) (BR-12, BR-13, EP-5) | `403` „Larger than 10 MB" bzw. `404` „Not found"; beim Klick Status `too_large` |
| VAL-9 | PDF-Echtheit | Jede `.pdf`-Antwort beginnt mit `%PDF-` (SVC-21); sonst abgewiesen (BR-12, BR-14) | `403` „Refused by Terax" |
| VAL-10 | Bezugsdatei beim Klick | Art nach SVC-5 und Welle; Ort `local` oder `ssh`, WSL nicht (BR-5, BR-9, BR-25) | Status `unsupported` |
| VAL-11 | Zahl der Freigaben | Höchstens 256 Freigaben zugleich; Wiederverwendung zählt nicht neu (Q&A 8, Q&A 9) | Status `limit_reached`, Toast nach Q&A 11 |

---

## Security

### Authentication & Authorization

| ID | Area | Mechanism | Notes |
|----|------|-----------|-------|
| SEC-1 | Zugang je Link | Geheimnis aus SVC-10 (256 Bit aus dem Zufallsquell des Betriebssystems) als erstes Pfadsegment; an genau eine Freigabe gebunden (Ort, Bezugsdatei, Bereich, Klasse); gilt bis Prozessende; nie gespeichert, nie geloggt (BR-3, BR-15, DF-1, DF-2, EP-1, EP-4, TR-2) | Nach Absturz oder Beenden schließt das Betriebssystem die Sockets; kein Aufräumen nötig (anders als SSH-Weiterleitungen, `TERAX.md:44`) |
| SEC-2 | Reichweite | SVC-2; Bild und PDF nur die Datei; HTML der Ordner der aufgelösten Bezugsdatei samt Unterordnern; nie Home, Wurzel oder ein Ordner oberhalb des Home (BR-4, BR-9) | Strenger als `asset_dir_target` (`src-tauri/src/modules/fs/asset.rs:10-18`), das nur Wurzel und Home ausnimmt |
| SEC-3 | Auslöser | Nur ein Klick des Users: API-1 wird ausschließlich aus `src/modules/preview-server/lib/openInBrowser.ts` gerufen; kein Werkzeug des eingebauten Agenten nennt den Command; Guard-Test `browserOpen.guard.test.ts` nach dem Muster `src/modules/ai/tools/portsBoundary.test.ts:41-47` (BR-16) | Der Agent kennt keine Adresse: Browser-Adressen erreichen die Webview nie (SEC-8) |
| SEC-4 | Netzgrenze | Bindung je Freigabe an `127.0.0.1:0`, der Port kommt vom Betriebssystem; Adresse immer mit der IP; keine Bindung an `0.0.0.0` oder `[::1]` in W1 (BR-1, BR-2, EP-2, DF-1) | Fallback `[::1]` nur in Baustein E (Abschnitt „In-App-Vorschau über den Mini-Server") |
| SEC-5 | Ort | Der SSH-Host stammt nur aus der Freigabe; die Adresse trägt keinen Host und keinen Pfad außerhalb des Bereichs (BR-5, DF-3) | Muster „Adresse nur in Rust" (`TERAX.md:45`) |

### Data Protection

| ID | Data Type | Protection | Notes |
|----|-----------|------------|-------|
| SEC-6 | Dateien im Bereich | VAL-5 bis VAL-9 für jede Datei, auch die Bezugsdatei; aufgelöstes Ziel zählt (BR-10, BR-11) | Über SSH erreichen die Bytes einer abgewiesenen Datei kurz den Speicher von Terax, nie die Antwort (bestehendes Muster `file.rs:185-189`) |
| SEC-7 | Antworten | Kopfzeilen nach SVC-6 (Tabelle in „DTOs"): träge Arten abgeschottet, HTML darf Skripte ausführen und im eigenen Bereich nachladen, PDF nur echt (BR-14, BR-6) | Keine CORS-Kopfzeilen, keine Cookies vom Server |
| SEC-8 | Geheimnis in der App | Browser-Adressen entstehen und öffnen in Rust (SVC-11); `BrowserOpen` trägt keine Adresse; keine Speicherung in Tabs, Einstellungen oder Log (BR-16, DF-1) | Die Webview-Capability bleibt unverändert (`src-tauri/capabilities/default.json:23`) |
| SEC-9 | In-App-Sandbox | Die `iframe`-Sandbox der HTML-Vorschau bleibt ohne `allow-same-origin` (`HtmlPreviewPane.tsx:30-36`), auch mit Baustein E; neuer Quelltext-Test sperrt die Tokens (Muster `src/modules/preview/PreviewPane.test.ts:25-56`) (BR-24) | FS-6 unangetastet |

### Input Validation & Sanitization

| ID | Input | Validation | Sanitization |
|----|-------|------------|--------------|
| SEC-10 | HTTP-Anfrage | VAL-1, VAL-2, VAL-3 über `httparse` (SVC-3) | Kein Rumpf wird gelesen; jede Antwort schließt die Verbindung |
| SEC-11 | Pfad in der Adresse | VAL-4, VAL-5 (SVC-4) | Einmal dekodiert; nie in einen Shell-Befehl gesetzt (der SSH-Leseweg übergibt den Pfad als JSON über stdin, `ssh.rs:1153`, `:1182-1186`) |

### Rate Limiting & Abuse Prevention

| ID | Resource | Limit | Window | Penalty |
|----|----------|-------|--------|---------|
| SEC-12 | Verbindungen | 16 je Freigabe, 64 insgesamt | gleichzeitig | Darüber wird die Verbindung sofort geschlossen |
| SEC-13 | Anfragekopf | 64 KiB; die Kopfzeile `Cookie` wird gelesen, nie ausgewertet (der Browser schickt die Cookies aller Dienste auf `127.0.0.1` mit, RFC 6265 §8.5, §6.1) | 10 s je Verbindung | `431` bzw. Verbindung zu |
| SEC-14 | Lesevorgänge | 8 insgesamt, davon 1 je SSH-Host (Q&A 35, User, 25.11.2026; die Zahl wird am Mac gemessen, N-25, und ist danach änderbar). Herleitung: sshd `MaxSessions` zählt je Netzverbindung, Default 10 (sshd_config(5)); denselben ControlMaster (`ssh.rs:122-127`) teilen jeder SSH-Terminal-Tab (`src-tauri/src/modules/pty/shell_init.rs:153`), Git (`src-tauri/src/modules/git/process.rs:345`), Datei-Aufrufe (`ssh.rs:1161`) und je Host mit Port-Freigaben eine Halte-Sitzung (`src-tauri/src/modules/ports.rs:167-186`); bei 7 Tabs und einer Halte-Sitzung bleiben 2 Plätze für Git, Explorer und Vorschau | gleichzeitig | Warten in der Reihe. Verweigert sshd die Sitzung, meldet der Master „Session open refused by peer", und `ssh` baut eine eigene Verbindung auf (Aufruf mit `BatchMode=yes`, `ssh.rs:1156-1162`): mit Agent oder Schlüssel ohne Passphrase gelingt das Lesen darüber ohne Fehler (über eine zusätzliche, nicht mitgezählte Verbindung); sonst endet es nach Verbindungsaufbau und Anmeldeversuch mit Exit 255 als `Unreachable`. Dann wird einmal nach kurzer Pause wiederholt; das hilft nur, wenn inzwischen ein Platz frei geworden ist, sonst folgt nach einem zweiten Anmeldeversuch `502` |
| SEC-15 | Antwort schreiben | eine Antwort | 30 s | Verbindung zu |
| SEC-16 | Dateigröße, SSH-Laufzeit | 10 MiB je Datei; SSH-Zeitbudget wie `read_bytes_timeout` (`ssh.rs:1506-1509`) | je Datei | `403` „Larger than 10 MB" bzw. `504` mit Text |

---

## Sicherheitsmodell

> No requirement IDs — covered via SEC-n

| # | Bedrohung | Gegenmittel | Stelle im Entwurf | Test, der es belegt | Anforderung |
|---|-----------|-------------|-------------------|---------------------|-------------|
| 1 | Andere lokale Prozesse fragen 127.0.0.1-Ports ab | Geheimnis je Freigabe; ohne Geheimnis leere `404`; keine Listen | SEC-1, VAL-4, SVC-10 | `cargo test`: echter Listener antwortet auf fehlendes und falsches Geheimnis mit leerer `404`; Vergleich erkennt jedes abweichende Zeichen | BR-3, EP-1 |
| 2 | Anderes Benutzerkonto auf dem Mac | wie 1 | SEC-1, SEC-4 | wie 1 | BR-1, BR-3 |
| 3 | Zugriff aus dem Netz | Bindung nur an `127.0.0.1` | SEC-4 | `cargo test`: lokale Adresse des Sockets ist `127.0.0.1`; Mac N-16 (Aufruf über die LAN-IP scheitert) | BR-1, EP-2 |
| 4 | Fremde Webseite im Browser: CSRF, Port-Scan | Geheimnis; nur `GET`/`HEAD`; keine CORS-Kopfzeilen; keine Nebenwirkung | VAL-2, SEC-7, SEC-10 | `cargo test`: `POST`/`PUT`/`OPTIONS` ergeben `405`; keine Antwort trägt `Access-Control-*` | BR-3, BR-14 |
| 5 | DNS-Rebinding, falscher Host-Header | `Host` muss genau die Schreibweise der Freigabe-Klasse haben (VAL-1) | VAL-1, SVC-3 | `cargo test`: Klasse `browser`: `evil.example`, `localhost:{port}`, anderer Port, fehlender Host ergeben `421`; Klasse `frame` mit Fallback: nur `localhost:{port}` wird bedient, `127.0.0.1:{port}` und `evil.example` ergeben `421` | BR-1 |
| 6 | Pfad-Ausbruch (`../`, `%2e%2e`, Rückstrich, doppelte Schrägstriche, absolute Pfade, doppelte Kodierung) | einmal dekodieren, Segmente prüfen, Bereich nach dem Auflösen prüfen | VAL-5, VAL-6, SVC-4 | `cargo test` mit Beispiel-Tabelle und `proptest` (bereits Dev-Abhängigkeit, `src-tauri/Cargo.toml:55`): kein angenommener Pfad verlässt `root` | BR-4, EP-3 |
| 7 | Symlink nach außen oder auf ein Geheimnis, lokal | Auflösen, Bereich und Sperrliste auf dem Ziel, Prüfung nach dem Öffnen über die geöffnete Datei | VAL-6, VAL-7, SVC-7 | `cargo test` (Unix): Link auf Datei außerhalb, auf `.ssh/…`, über einen verlinkten Ordner abgewiesen; Link innerhalb ausgeliefert | BR-11, EP-3 |
| 8 | Symlink über SSH | Prüfung auf dem vom Host gemeldeten Ziel | SVC-8 | `cargo test` mit Host-Ersatz nach `file.rs:753-764`: Ziel außerhalb oder geheim abgewiesen, Ziel innerhalb ausgeliefert | BR-5, BR-11, BR-13 |
| 9 | Geheimnis-Dateien im Ordner (`.env`, Schlüssel, `.ssh`, `.git`) | Sperrliste auf Text und Ziel, `.git`, kein `trusted` | VAL-7, SEC-6 | `cargo test` lokal und mit Host-Ersatz: `.env`, `id_ed25519`, `.ssh/config`, `.git/config` ergeben `403`; die Bezugsdatei `~/.ssh/notiz.html` ergibt `refused` | BR-10, EP-3 |
| 10 | Bezugsdatei im Home, in der Wurzel oder darüber gibt zu viel frei | nur die Datei | SVC-2, SEC-2 | `cargo test`: `/home/u/a.html`, `/a.html`, `/home/a.html` (Home `/home/u`) ergeben Nur-Datei; `/home/u/p/a.html` ergibt `/home/u/p` | BR-4 |
| 11 | Geheimnis in Verlauf, Referer, Sync | `Referrer-Policy: no-referrer`; Adresse nie in der Webview; mit Prozessende wertlos. Restrisiken: bleibt im Browser-Verlauf bis dahin; eine Seite kann `no-referrer` selbst lockern (`<meta name="referrer">`, Attribut `referrerpolicy`; W3C Referrer Policy §4, §11.1), dann geht ihre Adresse samt Geheimnis an fremde Server. Folge: ein fremder Server kennt Port und Geheimnis, nutzbar nur aus dem Browser des Macs heraus (Loopback, Host-Prüfung bleibt); eine fremde Seite könnte Dateien des Bereichs einbinden: Bilder und Styles kann sie ohne CORS nicht auslesen, Skripte (`.js`) des Bereichs laufen aber in ihrem Kontext und geben ihre Wirkung, z. B. globale Werte, preis (OWASP WSTG-CLNT-13) | SEC-7, SEC-8, SEC-1 | `cargo test`: jede Antwort trägt `no-referrer`; Vitest: `BrowserOpen` hat kein Adressfeld, `openInBrowser` gibt nichts zurück | BR-15, DF-2 |
| 12 | Alter Link nach dem Beenden | Freigaben nur im Speicher; Sockets enden mit dem Prozess | SEC-1, SVC-1 | Mac N-18 | BR-15, EP-4, TR-2 |
| 13 | Skripte von Link A lesen Dateien oder Speicher von Link B | eigene Herkunft je Freigabe (Port), Geheimnis je Freigabe, Listener nimmt nur sein Geheimnis. Restrisiken: Cookies, die eine Seite selbst setzt, gelten für alle Ports von 127.0.0.1 (RFC 6265 §8.5); Browser-Speicher (`localStorage`, IndexedDB) überdauert Terax, bekommt ein Link in einem späteren Lauf denselben Port, sieht seine Seite den Speicher des früheren Links (Trennung gilt nur innerhalb eines Laufs); Service Worker bleiben durch das Geheimnis im Pfad auf ihren Bereich begrenzt | SVC-1, VAL-4, SEC-1 | `cargo test`: Geheimnis von B auf dem Port von A ergibt `404`; Mac N-9 | BR-14, DF-2 |
| 14 | Zugriff auf einen anderen SSH-Host | Host nur aus der Freigabe | SEC-5, SVC-8 | `cargo test`: Host-Ersatz notiert den Host jedes Lesens; immer der Host der Freigabe | BR-5, DF-3 |
| 15 | Nicht-HTML-Arten führen Skript aus (SVG, Bilder, Markdown ab W2, Unbekanntes) | `sandbox`-CSP, `nosniff`, feste Typ-Liste, Unbekanntes als `application/octet-stream` | SVC-5, SVC-6, SEC-7 | `cargo test`: jede träge Art trägt `sandbox`; `svg` ist träge; HTML trägt kein `sandbox`; Mac N-17 (SVG mit Skript, direkt geöffnet, führt nichts aus) | BR-14 |
| 16 | Getarnte PDF (HTML-Inhalt mit `.pdf`) | Echtheitsprüfung vor jeder PDF-Antwort | VAL-9, SVC-21 | `cargo test`: Datei `report.pdf` mit HTML-Inhalt ergibt `403`, lokal und mit Host-Ersatz | BR-12, BR-14 |
| 17 | Fremde Seite bettet eine Terax-Seite ein | `frame-ancestors 'self'` an HTML | SVC-6 | `cargo test`: HTML der Browser-Klasse trägt `frame-ancestors 'self'` | BR-14 |
| 18 | Erschöpfung: viele Anfragen, große Dateien, langsame Gegenstelle, 300 Bilder über SSH | SEC-12 bis SEC-16 | SVC-9 | `cargo test` mit echtem Socket: Kopf über 64 KiB `431`, Kopf mit 20 KiB `Cookie` ergibt `200`, stockender Kopf schließt nach dem Zeitbudget, Datei über 10 MiB `403`; Lese-Grenze je Host (1) und eine Wiederholung nach `Unreachable` über Host-Ersatz mit Zähler; Mac N-4, N-25 | BR-12, BR-13, EP-5 |
| 19 | Port-Übernahme über `[::1]` bei `localhost` | Adresse nennt die IP `127.0.0.1` | SEC-4, SVC-11 | `cargo test`: Eintritts-Adresse beginnt mit `http://127.0.0.1:` | DF-1 |
| 20 | Eingebauter Agent löst „Im Browser öffnen" aus | Command nur im Modul `preview-server`, KI-Modul ohne Bezug | SEC-3 | Vitest `browserOpen.guard.test.ts`: kein Treffer für das Muster `preview_open_in_browser\|modules\/preview-server` unter `src/modules/ai/` (Muster `src/modules/ai/tools/portsBoundary.test.ts:26`), genau ein Aufrufer des Commands im Frontend | BR-16 |
| 21 | Geladene Seite ruft Terax-Befehle | Browser-Seiten laufen außerhalb von Tauri; Capabilities ohne `remote`-Adressen, unverändert | SEC-8 | Vitest (Guard-Test): `src-tauri/capabilities/default.json` enthält kein `remote` | BR-16, BR-24 |
| 22 | In-App-Sandbox wird gelockert (auch mit Baustein E) | Sandbox-Tokens ohne `allow-same-origin` bleiben | SEC-9 | Vitest Quelltext-Test `HtmlPreviewPane.sandbox.test.ts` | BR-24 |
| 23 | Fehlgelesene Anfrage, Request-Smuggling | `httparse`, kein Rumpf, `Connection: close` | VAL-2, VAL-3, SEC-10 | `cargo test`: Anfrage mit `Content-Length` oder `Transfer-Encoding` ergibt `400` | BR-1 |
| 24 | Eine ausgelieferte HTML-Seite wirkt auf Cookies und Sitzungen anderer lokaler Dienste | Entschieden (Q&A 36, User, 25.11.2026): so lassen, Restrisiko benannt. An Spezifikationen gemessen: Cookies trennen nicht nach Port (RFC 6265 §8.5), für „same site" zählt der Port nicht (WHATWG HTML); eine Seite auf `127.0.0.1:{A}` liest also per `document.cookie` die nicht-HttpOnly-Cookies eines Dienstes auf `127.0.0.1:8000`, setzt Cookies für `127.0.0.1` und schickt Anfragen, die als same-site dessen `SameSite`-Cookies tragen. Dienste unter `localhost` (so öffnet Terax auch Port-Freigaben, `TERAX.md:44`): Cookies gelten je Host-Schreibweise, die Seite kann deren Cookies weder lesen noch setzen, und `127.0.0.1` und `localhost` sind verschiedene Sites; Anfragen dorthin schickt sie aber cross-site wie jede Webseite, in Chrome ohne LNA-Nachfrage (LNA prüft nur Anfragen aus dem öffentlichen Netz), und Cookies ohne `SameSite`-Schutz gehen dabei mit. Verworfene Alternativen: B, HTML in anonymer Herkunft (`sandbox`-CSP ohne `allow-same-origin`): `document.cookie` wirft `SecurityError`, Anfragen sind nie same-site, Cookies ohne `SameSite`-Schutz gingen weiter mit; Nachladen per `fetch` hätte `Access-Control-Allow-Origin: null` gebraucht, das jedes Dokument mit `null`-Herkunft lesen lässt, auch das `iframe sandbox` einer fremden Seite, sodass nur noch das Geheimnis schützt (MDN `Access-Control-Allow-Origin`; vom Gate-1-Nachprüfer in Chrome 156 nachgestellt); ohne diese Antwort hätten nur Bilder, Styles und klassische Skripte geladen. C, eigener Name je Link (`{zufall}.localhost`): Safari löst solche Namen erst ab macOS 26 verlässlich auf (WebKit-Bug 160504) | SEC-7, Q&A 36 | Spezifikation (oben); kein eigener Test, weil für ein benanntes Restrisiko nichts gebaut wird | BR-14 |

---

## Architecture Layers

> No requirement IDs — context

### Layer Responsibilities

| Layer | Responsibility | Pattern |
|-------|----------------|---------|
| Regel-Kern Rust (`grant.rs`, `request.rs`, `policy.rs`) | Bereich, Geheimnis, Anfrage, Pfad, Art, Kopfzeilen | Reine Funktionen ohne Tauri und AppKit, Tests daneben (`TERAX.md:23`) |
| Lesen (`source.rs`) | Lokal und SSH, Prüfkette | Funktionen mit übergebenem Leser, damit Tests ohne SSH laufen |
| Netz-Hülle (`listener.rs`) | Sockets, Grenzen, Zeitbudgets, Schreiben | Annahme-Schleife je Freigabe auf der bestehenden tokio-Laufzeit |
| Command-Hülle (`preview_server/mod.rs`, `zen_escape.rs`) | Commands, Zustand, Opener, Esc-Monitor | Dünne `#[tauri::command]`-Funktionen; Plattform-Code in `cfg`-Armen |
| Frontend-Regeln (`preview-server/lib`, `doc/lib`, `zen/lib`, `tabs/lib/tabSwipe.ts`) | Sichtbarkeit, Texte, Zen-Aufbau, Esc, Wischen | Reine Funktionen mit Vitest |
| Oberfläche (`PreviewHeader`, Panes, `App.tsx`, `FileExplorer`) | Darstellung, Verdrahtung | `App.tsx` koordiniert nur (`TERAX.md:75`) |

### Data Flow

```
Webview: Kopfzeile / Explorer → openInBrowser → invoke preview_open_in_browser
Rust:    PreviewServer → Freigabe → Listener 127.0.0.1:{p} → Opener → Browser
Browser: GET /{token}/… → Listener → Prüfkette → lokal std::fs | SSH ssh::read_bytes_typed (SVC-22) → Antwort

Webview: zenStore ⇄ App, Arbeitsfläche, Panes; zen_escape_arm → Rust-Monitor → terax:zen-escape → zenStore
```

### Error Handling Strategy

| Error Type | Handling | User Response | Logging |
|------------|----------|---------------|---------|
| Falsches oder fehlendes Geheimnis | `404` ohne Inhalt | Browser zeigt leere Seite | keins |
| Falscher Host | `421` ohne Inhalt | – | keins |
| Falsche Methode, Rumpf, kaputter Kopf | `405` / `400` / `431` | – | keins |
| Datei fehlt (lokal; über SSH `Missing`), Ordner ohne Schrägstrich am Ende (lokal; über SSH `NotRegularFile`) | `404` „Not found" | Nachbardatei fehlt still, Seite lädt weiter (EP-3) | `debug` ohne Geheimnis |
| Außerhalb des Bereichs, Sperrliste, `.git`, unechte PDF | `403` „Refused by Terax" | wie oben | `debug` ohne Geheimnis |
| Größer als 10 MiB (lokal; über SSH `TooLarge`) | `403` „Larger than 10 MB" | wie oben (EP-5) | `debug` |
| SSH nicht lesbar: `Unreachable` nach einer Wiederholung (Verbindung weg; Passphrase ohne Master `ssh.rs:944-962`; eine wegen `MaxSessions` verweigerte Sitzung: der Master meldet „Session open refused by peer", `ssh` baut eine eigene Verbindung auf, die mit Agent oder Schlüssel ohne Passphrase gelingt und sonst nach Verbindungsaufbau und Anmeldeversuch mit Exit 255 endet, `ssh.rs:1109`), oder `Failed` (auch `Killed`, ohne Wiederholung) | `502` mit Text „Terax could not read {name} from {host}: {reason}" | Hauptdatei: Textseite; Nachbardatei fehlt still (Q&A 10) | `info` ohne Geheimnis |
| SSH-Zeitbudget überschritten (`TimedOut`) | `504` mit Text „Terax could not read {name} from {host}: timed out" | wie oben | `warn` (bestehend, `ssh.rs:1200`) |
| Klick: Art oder Ort nicht unterstützt | `unsupported` | Toast (Q&A 11); tritt nur auf, wenn SVC-12 und SVC-5 auseinanderlaufen | keins |
| Klick: Sperrliste, Größe, Host nicht erreichbar, Grenze, Opener scheitert | `refused` / `too_large` / `unreachable` / `limit_reached` / `open_failed` | Toast nach SVC-13 (EP-6) | `info` |

---

## Nahtstellen

> No requirement IDs — covered via API-n

### Commands, Events, HTTP

| Name | Richtung | Signatur Rust | Typ TypeScript | Aufrufer | Bereich |
|------|----------|---------------|----------------|----------|---------|
| `preview_open_in_browser` (API-1) | Webview an Rust | `async fn preview_open_in_browser(app: AppHandle, path: String, workspace: Option<WorkspaceEnv>) -> Result<BrowserOpen, String>` | `invoke<BrowserOpen>("preview_open_in_browser", { path, workspace })` | nur `openInBrowser.ts` | A (Rust), C (Frontend) |
| `zen_escape_arm` (API-3) | Webview an Rust | `fn zen_escape_arm(armed: bool)`; macOS setzt einen `AtomicBool`, sonst leer | `invoke<void>("zen_escape_arm", { armed })` | nur `useZenEscape.ts` | B, E |
| `terax:zen-escape` (API-4) | Rust an Webview | `app.emit("terax:zen-escape", ())` | `listen<null>("terax:zen-escape", …)` | nur `useZenEscape.ts` | B, E |
| `preview_frame_source` (API-8, Baustein E) | Webview an Rust | `async fn preview_frame_source(app: AppHandle, path: String, workspace: Option<WorkspaceEnv>) -> Result<FrameSource, String>` | `invoke<FrameSource>("preview_frame_source", { path, workspace })` | nur `HtmlPreviewPane.tsx` | G |
| HTTP (API-2, API-9) | Browser bzw. `iframe` an Rust | `GET`/`HEAD /{token}/{relpath}` | – | Browser | A |

| Typ an der Grenze | Rust | TypeScript |
|-------------------|------|------------|
| `BrowserOpen` | `#[derive(Serialize)] #[serde(rename_all = "camelCase")] struct BrowserOpen { status: BrowserOpenStatus, reason: Option<String> }`; `BrowserOpenStatus` mit `#[serde(rename_all = "snake_case")]` | `type BrowserOpenStatus = "opened" \| "unsupported" \| "refused" \| "too_large" \| "unreachable" \| "limit_reached" \| "open_failed"; type BrowserOpen = { status: BrowserOpenStatus; reason: string \| null }` |
| `FrameSource` (Baustein E) | `#[derive(Serialize)] #[serde(rename_all = "camelCase")] struct FrameSource { status: FrameStatus, url: Option<String>, reason: Option<String> }`; `FrameStatus` mit `#[derive(Serialize)] #[serde(rename_all = "snake_case")]` | `type FrameSource = { status: "ready" \| "unsupported" \| "refused" \| "too_large" \| "unreachable" \| "limit_reached"; url: string \| null; reason: string \| null }` |
| `WorkspaceEnv` | bestehend (`workspace.rs:322-334`) | bestehend (`src/modules/workspace/env.ts:5-8`) |
| `RemoteReadError` (nur Rust, zwischen `ssh.rs` und `preview_server`) | `pub enum RemoteReadError { Unreachable(String), TimedOut(String), Failed(String), Missing, NotRegularFile, TooLarge }` (SVC-22) | – (erreicht die Webview nur als `BrowserOpenStatus`) |

| Unverändert, bewusst | Grund |
|----------------------|-------|
| `src-tauri/capabilities/default.json` | Opener wird aus Rust gerufen, nicht aus der Webview (`chrome.rs:68-72`); App-Commands brauchen keinen Eintrag |
| `src-tauri/tauri.conf.json` (CSP, Asset-Scope) | Browser-Weg berührt die App-CSP nicht; Baustein E ist durch `frame-src … http:` gedeckt (`tauri.conf.json:28`) |
| `src-tauri/src/modules/fs/asset.rs` | bleibt für Medien im Editor und als Rückfall von Baustein E; kleinere Konfliktfläche zum upstream `assets.rs` |
| `src/modules/doc/DocStack.tsx` | Panes lesen Zen aus dem Store, Neu laden liegt in der Pane; Props bleiben |

### Neue Dateien nach Bereich

| Bereich | Datei | Zweck |
|---------|-------|-------|
| A Server-Kern (Rust, plattformneutral) | `src-tauri/src/modules/preview_server/mod.rs` | `PreviewServer` (SVC-1), Commands API-1 und API-8, `open_entry` (SVC-11), Typen `BrowserOpen`, `FrameSource` |
| A | `src-tauri/src/modules/preview_server/grant.rs` | `Grant`, `grant_scope` (SVC-2), Geheimnis (SVC-10) |
| A | `src-tauri/src/modules/preview_server/request.rs` | `parse_request` (SVC-3), `split_target` (SVC-4) |
| A | `src-tauri/src/modules/preview_server/policy.rs` | `served_type` (SVC-5), `response_headers` (SVC-6), Arten je Welle |
| A | `src-tauri/src/modules/preview_server/source.rs` | `read_local` (SVC-7), `read_remote` (SVC-8), geöffneter Pfad je Plattform (`within`, `opened_path` wie upstream benannt) |
| A | `src-tauri/src/modules/preview_server/listener.rs` | `serve_listener` (SVC-9), Grenzen; Test mit echtem Socket |
| B Esc-Monitor (Rust, macOS) | `src-tauri/src/modules/zen_escape.rs` | SVC-18, API-3; `cfg(target_os = "macos")`-Arm, sonst leere Funktionen |
| C Im Browser öffnen (Frontend) | `src/modules/preview-server/index.ts` | Barrel |
| C | `src/modules/preview-server/lib/browserOpenable.ts` (+ `.test.ts`) | SVC-12 |
| C | `src/modules/preview-server/lib/browserOpenText.ts` (+ `.test.ts`) | SVC-13 |
| C | `src/modules/preview-server/lib/openInBrowser.ts` (+ `.test.ts`) | API-5 |
| C | `src/modules/preview-server/OpenInBrowserButton.tsx` | UI-1 (Symbol `LinkSquare02Icon` wie `src/modules/preview/PreviewAddressBar.tsx:216-231`) |
| C | `src/modules/preview-server/browserOpen.guard.test.ts` | SEC-3 (Muster `preview_open_in_browser\|modules\/preview-server` unter `src/modules/ai/`); Listen-Gleichheit SVC-12 und SVC-5 (liest `policy.rs` wie `src/modules/ports/chromeProbe.guard.test.ts:10-16`); keine `remote`-Capability |
| D Kopfzeile und Neu laden (Frontend) | `src/modules/doc/PreviewHeader.tsx` (+ `.test.tsx`) | UI-2, UI-3; rendert `DocViewToggle` selbst (Props `view`, `onSetView`, `renderedDisabled`); Im Browser öffnen und Zen kommen als Props (`OpenInBrowserButton`, `ZenToggleButton`) |
| D | `src/modules/doc/lib/previewHeader.ts` (+ `.test.ts`) | SVC-14 |
| D | `src/modules/html/HtmlPreviewPane.sandbox.test.ts` | SEC-9 (Quelltext-Test der Sandbox-Tokens) |
| E Zen (Frontend) | `src/modules/zen/index.ts` | Barrel |
| E | `src/modules/zen/lib/zenStore.ts` | API-7 (zustand, wie die übrigen Stores) |
| E | `src/modules/zen/lib/zenChrome.ts` (+ `.test.ts`) | SVC-15 |
| E | `src/modules/zen/lib/zenEscape.ts` (+ `.test.ts`) | SVC-16 |
| E | `src/modules/zen/lib/useZenEscape.ts` | schaltet API-3, hört API-4, Esc-Taste im Eltern-Dokument als Rückweg ohne Monitor; ruft `exitZen` |
| E | `src/modules/zen/ZenToggleButton.tsx` | UI-4 |
| F Wisch-Ausnahme (Frontend) | `src/modules/tabs/lib/defersToActivePreview.test.ts` | Test zu SVC-17 |
| G Baustein E (W1) | `src/modules/html/lib/htmlPreviewSource.ts` (+ `.test.ts`) | SVC-19; Konstante „Baustein an" (in W1 an; aus = Rückfall) |
| G | Rust: Klasse `frame` in `policy.rs` und `mod.rs` (keine eigene Datei) | API-8, API-9 |
| H Welle 2 | `src-tauri/src/modules/preview_server/markdown.rs` | SVC-20 |

### Abhängigkeiten der Bereiche

| Bereich | braucht | über | ohne den anderen baubar? |
|---------|---------|------|--------------------------|
| A | – | – | ja |
| B | – | – | ja |
| C | A | Vertrag API-1 und `BrowserOpen` | ja: Vitest ersetzt `invoke`; Ende-zu-Ende erst mit A |
| D | C, E | `OpenInBrowserButton`, `ZenToggleButton` als eingesetzte Bausteine | ja: Kopfzeile nimmt die Tasten als Props; ohne C/E fehlen nur die Tasten |
| E | B (nur Esc bei Fokus im iframe) | API-3, API-4 | ja: ohne B wirkt Esc nur mit Fokus außerhalb der Seite |
| F | – | – | ja |
| G | A, D | Klasse `frame`; gemeinsame Datei `HtmlPreviewPane.tsx` | nein |
| H | A, C | Art `markdown` in `policy.rs`, Welle in `browserOpenable.ts` | nein |

| Gemeinsam angefasste Datei | Bereiche |
|----------------------------|----------|
| `src/modules/html/HtmlPreviewPane.tsx` | D, F, G |
| `src/app/App.tsx` | E, F |
| `src-tauri/src/lib.rs`, `src-tauri/src/modules/mod.rs` | A, B |
| `src-tauri/Cargo.toml` | A, H |
| `src/modules/editor/EditorStack.tsx`, `src/modules/editor/EditorPane.tsx` | D, E |

---

## Migration Map (when scope changes existing code)

| ID | Existing File | Current Pattern | Target Pattern | Specific Changes |
|----|---|---|---|---|
| MIG-1 | `src-tauri/Cargo.toml` | tokio nur `rt`, `time` (`Cargo.toml:50`); `httparse`, `getrandom`, `percent-encoding` nur transitiv | tokio zusätzlich `net`, `io-util`, `sync`; direkte Einträge `httparse = "1"`, `getrandom = "0.4"`, `percent-encoding = "2"` (die letzten zwei wie `upstream/main:src-tauri/Cargo.toml:46-47`) | Keine neue Crate im Lockfile: alle vier Crates stehen schon darin (`src-tauri/Cargo.lock:1780-1782`, `:1483-1486`, `:3020-3022`, `:4895-4907`); tokio hat `mio`, `socket2`, `tokio-macros` schon aktiv (`Cargo.lock:4899-4907`) |
| MIG-2 | `src-tauri/src/modules/mod.rs` | 18 Module (`mod.rs:1-18`) | zusätzlich `preview_server`, `zen_escape` | zwei Zeilen |
| MIG-3 | `src-tauri/src/lib.rs` | Wisch-Monitor in `setup` (`lib.rs:370-372`); Command-Liste (`lib.rs:393-499`) | zusätzlich Esc-Monitor in `setup` (macOS), `.manage(PreviewServer)`, Commands `preview_open_in_browser`, `zen_escape_arm` und `preview_frame_source` (Baustein E) | Exit-Pfad (`lib.rs:502-508`) unverändert |
| MIG-4 | `src-tauri/src/modules/fs/file.rs` | Magic-Vergleich inline in `fs_is_pdf_impl` (`file.rs:241-259`) | reine Funktion `is_pdf_magic` (SVC-21), von `fs_is_pdf` und VAL-9 genutzt | Verhalten von `fs_is_pdf` unverändert; bestehende Tests `is_pdf_*` (`file.rs:827-919`) bleiben grün |
| MIG-5 | `src/components/ui/DocViewToggle.tsx` | Overlay `absolute right-3 top-3 z-10` (`DocViewToggle.tsx:19`) | Inline-Segment in der Kopfzeile | Positionsklassen entfernen; Props und Sperre „Save to preview" bleiben (eigene Datei, nicht shadcn, `TERAX.md:121`, Commit `672ce69`) |
| MIG-6 | `src/modules/html/HtmlPreviewPane.tsx` | Overlay (`HtmlPreviewPane.tsx:102`), Rahmen (`:98`), Zähler je Mount (`:38-46`), kein Neu laden, keine Wisch-Ausnahme | `PreviewHeader` über dem `iframe`; Neu-laden-Zähler in beiden Lese-Effekten (`:54-69`, `:71-93`); `data-no-tab-swipe` nur bei `visible`; Rahmen und Ecken weg im Zen (SVC-15); Quelle nach SVC-19 (Baustein E, W1), der heutige Ladeweg bleibt als Rückfall | Sandbox-Konstanten (`:35-36`) unverändert (SEC-9) |
| MIG-7 | `src/modules/markdown/MarkdownPreviewPane.tsx` | Overlay (`:72`), Rahmen (`:68`) | `PreviewHeader`; Neu-laden-Zähler im Lese-Effekt (`:38-63`); Rahmen weg im Zen; „Im Browser öffnen" erst ab W2 (SVC-12) | Scroll-Container (`:73`) bleibt, damit die Wisch-Prüfung Tabellen weiter erkennt |
| MIG-8 | `src/modules/editor/EditorStack.tsx` | Raw-Overlay (`EditorStack.tsx:52-59`), Rahmen (`:51`) | Raw-Kopfzeile nach SVC-14; Neu laden baut `EditorPane` über einen Schlüssel neu auf, gesperrt bei `dirty`; Rahmen weg im Zen | Sperre „Save to preview" bleibt |
| MIG-9 | `src/modules/editor/EditorPane.tsx` | Bild und PDF ohne Kopf (`EditorPane.tsx:445-484`); Karte (`:486-509`) | `PreviewHeader` mit Dateiname, Im Browser öffnen, Zen über Bild- und PDF-Vorschau und über der Karte von Bild/PDF, auch über SSH | PDF-Gate (`:397-409`, `:463-481`) unverändert; Video/Audio unverändert |
| MIG-10 | `src/app/components/WorkspaceSurface.tsx` | Polster `px-3 pt-2 pb-2` je Schicht (`WorkspaceSurface.tsx:89`, `:109`, `:125`, `:139`, `:153`, `:167`, `:181`) | ohne Polster im Zen (SVC-15) | Klassen je Schicht aus SVC-15 |
| MIG-11 | `src/app/App.tsx` | `zenMode` als `useState` (`App.tsx:962`), Umschalten (`:1086`), Kopf (`:1634`), Statusleiste (`:1796`), Seitenleiste (`:1697-1750`, Speichern `:1709`), Griff (`:1751`), Eingabe (`:1780-1790`), Wischen (`:1172-1185`) | Zen aus `zenStore` (API-7); im Zen Seitenleiste eingeklappt über MIG-20 (Zustand ja, Speichern nein) und danach auf die vorige Breite zurück; Griff weg; Eingabe nach SVC-15; `useZenEscape` eingebunden; `useTabSwipe` bekommt SVC-17 | Weitere Leser (`:975`, `:1497`, `:1539`) lesen den Store |
| MIG-12 | `src/app/components/WorkspaceInputBar.tsx` | `open = isBlockTab \|\| (keysLoaded && panelOpen)` (`WorkspaceInputBar.tsx:78`) | zusätzlich verborgen, wenn SVC-15 es verlangt, ohne Aushängen | neue Prop für „im Zen verborgen" |
| MIG-13 | `src/modules/tabs/lib/useTabSwipe.ts` | gibt nur über `isInsideHorizontalScroller` nach (`useTabSwipe.ts:35-37`) | zusätzliche optionale Rückfrage vor `onSwipe` (SVC-17) | Signatur additiv |
| MIG-14 | `src/modules/tabs/lib/tabSwipe.ts` | `isInsideHorizontalScroller` (`tabSwipe.ts:23-42`) | daneben `defersToActivePreview` (SVC-17) | bestehende Funktion unverändert (INV-1) |
| MIG-15 | `src/modules/explorer/FileExplorer.tsx` | Menü „Open", „Open with Default App", … (`FileExplorer.tsx:788-805`); Workspace aus dem Store (`:223`) | Eintrag „Open in Browser" direkt unter „Open with Default App", nur wenn SVC-12 für Pfad und Explorer-Workspace zutrifft | UI-5 |
| MIG-16 | `TERAX.md` | kein Mini-Server; Tab-Arten ohne `html` (`TERAX.md:73`) | Absatz `preview_server::*` im Two-process model; Module `preview-server/` und `zen/`; Zen-Verhalten und Esc-Regel | Deliverable (Doku) |
| MIG-17 | `src/modules/preview/PreviewPane.tsx` | Rahmen und Ecken `rounded-md border border-border/60` (`PreviewPane.tsx:69`) | im Zen ohne Rahmen und Ecken (SVC-15) | nur Klassen; Sandbox und Adressleiste unverändert (INV-4) |
| MIG-18 | `src/modules/editor/GitDiffPane.tsx` | Rahmen und Ecken (`GitDiffPane.tsx:247`) | im Zen ohne Rahmen und Ecken (SVC-15) | nur Klassen |
| MIG-19 | `src/modules/editor/AiDiffPane.tsx` | Rahmen und Ecken (`AiDiffPane.tsx:137`) | im Zen ohne Rahmen und Ecken (SVC-15) | nur Klassen |
| MIG-20 | `src/modules/sidebar/useSidebarPanel.ts` | `persistSidebarCollapsed` setzt den Zustand `sidebarCollapsed` und schreibt `terax.sidebar.collapsed` bei jeder Größenänderung (`useSidebarPanel.ts:93-104`, gerufen aus `src/app/App.tsx:1708-1710`); nur die Breite prüft auf User-Aktion (`useSidebarPanel.ts:18-23`) | Einklappen im Zen setzt `sidebarCollapsed` (Watcher und Git-Abfragen pausieren wie heute, `useSidebarPanel.ts:78-81`) ohne Schreiben nach `localStorage`; Verlassen von Zen stellt Zustand und Breite von vorher her | Leser `src/modules/source-control/statusConsumers.ts:39-41`, `src/app/App.tsx:1730` unverändert (INV-13); neu ist nur der Weg „eingeklappt ohne Speichern" |
| MIG-21 | `src-tauri/src/modules/ssh.rs` | `read_bytes` gibt `Result<RemoteFileBytes, String>` (`ssh.rs:1490-1502`); die Fehlerart geht in `From<RemoteError> for String` verloren (`ssh.rs:1055-1064`); der Helfer meldet Fehler nur als Text (`ssh.rs:401-410`, `:795-796`) | zusätzlich `read_bytes_typed` mit `RemoteReadError` (SVC-22); der Helfer gibt bei `read_bytes` eine feste Art (`missing`, `not_regular`, `too_large`) im Antwort-Umschlag mit; `read_bytes_typed` liest sie selbst aus dem Umschlag, dafür wird der Ausführungsteil von `run_remote_json` (`ssh.rs:1142-1209`) intern so geteilt, dass Exit-Code, stdout und stderr erreichbar sind; `RemoteError`, `helper_answer` (`ssh.rs:1230-1273`) und `run_remote_json` behalten Verhalten und Form | `read_bytes` und `fs_read_remote_image` verhalten sich unverändert (INV-7; Helfer-Test `embedded_helper_read_bytes_returns_exact_bytes_within_the_cap` bleibt grün). Die Kopier-Muster, die `Failed(message)` mit genau einem Feld zerlegen (`ssh.rs:1910-1925`, `:1990-1994`, `:2045-2054`), bleiben unverändert, weil `RemoteError` weder Feld noch Variante dazubekommt. `upstream/main` hat kein `ssh.rs` (`git ls-tree upstream/main src-tauri/src/modules/`), also keine Konfliktfläche zum Sync |

**Sweep criterion:** `grep -rn "DocViewToggle" src --include=*.tsx` ohne Testdateien: danach rendert nur noch `PreviewHeader` den Umschalter (er rendert ihn selbst, Neue Dateien D). `grep -rn "zenMode" src` ohne Testdateien: danach schreibt nur `zenStore` den Zustand, alle übrigen Treffer lesen ihn. `grep -rn 'const PDF_MAGIC\|b"%PDF-"' src-tauri/src --include=*.rs`: außerhalb von `#[cfg(test)]`-Blöcken genau ein Treffer, die Konstante in `file.rs` (SVC-21); `grep -rn '%PDF-' src-tauri/src/modules/preview_server`: kein Treffer außerhalb von `#[cfg(test)]`-Blöcken. Jeder bestehende Test unter `src/modules/tabs`, `src/modules/editor`, `src/modules/preview` und in `src-tauri/src/modules/fs`, der nach dem Umbau rot wird, ist eine Entscheidung gegen die INV-Zeilen unten, kein Anlass zum Anpassen des Tests.

---

## Existing-Behavior Invariants

Kein `codebase-scan.md` vorhanden; Inventar von Hand erhoben, nur aus dem berührten Modul und seinen direkten Nutzern.

| ID | Invariant (checkable assertion) | Consumers | Source | Coverage | Routing |
|----|--------------------------------|-----------|--------|----------|---------|
| INV-1 | Wischen gibt einem waagerechten Scroller mit Platz in Wischrichtung und jedem Element mit `data-no-tab-swipe` nach; an der Scroll-Kante nicht | `src/modules/tabs/lib/useTabSwipe.ts:37` | `src/modules/tabs/lib/isInsideHorizontalScroller.test.ts` „blocks when an ancestor is a horizontal scroller with room to scroll left (dir 1)", „does NOT block at the right scroll edge (dir 1, scrollLeft at max)", „blocks unconditionally on a data-no-tab-swipe ancestor" | covered | none |
| INV-2 | Rendered/Raw tauscht die Tab-Art bei gleicher Id; Raw zu Rendered wird verweigert, solange ungespeichert | `src/app/components/WorkspaceSurface.tsx:37`, `src/modules/editor/EditorStack.tsx:39-42` | `src/modules/tabs/lib/applyDocView.test.ts` „turns an html tab into a raw editor", „refuses to render a dirty editor (dirty-guard, no data loss)" | covered | none |
| INV-3 | Die PDF-Vorschau ohne Sandbox erscheint nur nach bestätigter Echtheit; eine getarnte PDF landet auf der Karte | `src/modules/editor/EditorPane.tsx:430-435` | `src/modules/editor/lib/binaryPreview.test.ts` „renders the pdf iframe ONLY when the backend verified the magic bytes", „drops a fake .pdf (verification failed) to the inert card, never the iframe"; `src-tauri/src/modules/fs/file.rs` `is_pdf_false_for_html_named_pdf_with_null_byte` | covered | none |
| INV-4 | Die Web-Vorschau behält ihre Sandbox-Tokens und `no-referrer` | `src/modules/preview/PreviewPane.tsx:104-118` | `src/modules/preview/PreviewPane.test.ts` „grants allow-scripts and allow-same-origin", „does NOT include allow-top-navigation* tokens", „sets referrerPolicy to no-referrer" | covered | none |
| INV-5 | Die Sperrliste weist Geheimnis-Namen und geschützte Ordner ab, auch über Symlinks auf Datei oder Ordner | `src-tauri/src/modules/fs/file.rs:98`, `:153`; neu SVC-7, SVC-8 | `src-tauri/src/modules/fs/guard.rs` `read_blocks_secret_basenames`, `read_blocks_protected_dirs_incl_case_and_ads`, `enforce_read_trusted_refuses_deceptive_parent_symlink_to_secret`, `enforce_read_trusted_refuses_deceptive_leaf_symlink_to_secret` | covered | none |
| INV-6 | Die lokale HTML-Vorschau gibt nie Wurzel oder Home als Ordner frei | `src-tauri/src/modules/fs/asset.rs:31` | `src-tauri/src/modules/fs/asset.rs` `refuses_the_filesystem_root`, `refuses_the_home_directory_itself` | covered | none |
| INV-7 | Ein entferntes Bild, dessen Ziel ein Geheimnis ist, wird nach dem Lesen abgewiesen | `src/modules/editor/lib/useRemoteImage.ts:41-52` | `src-tauri/src/modules/fs/file.rs` `remote_image_refuses_a_symlink_to_a_secret_after_the_read` | covered | none |
| INV-8 | Das KI-Modul erreicht keine Weiterleitungs-Commands | `src/modules/ai/tools/terminal.ts:64` | `src/modules/ai/tools/portsBoundary.test.ts` „never reaches the forward commands from the AI module" | covered | none |
| INV-9 | Ein Medienclip in einem Hintergrund-Tab pausiert und bleibt beim Zurückkehren pausiert | `src/modules/editor/EditorPane.tsx:456-462` | `src/modules/editor/EditorStack.window-hidden.test.tsx` „[AC-6] pauses and hides a playing clip in a background tab, and keeps it paused on return" | covered | none |
| INV-10 | Mod+Shift+' schaltet Zen; im Zen fehlen Kopf und Statusleiste | `src/app/App.tsx:1634`, `:1796` | `src/app/App.tsx:1086` | uncovered | qa_matrix |
| INV-11 | Ist „Trackpad swipe to switch tabs" aus, wechselt kein Wischen den Tab; sonst Schritt für Schritt, am Rand Schluss | `src/app/App.tsx:1185` | `src/app/App.tsx:1172-1184` | uncovered | qa_matrix |
| INV-12 | Die HTML-Vorschau läuft lokal und remote in einer Sandbox ohne `allow-same-origin` | `src/modules/html/HtmlPreviewPane.tsx:107`, `:114` | `src/modules/html/HtmlPreviewPane.tsx:35-36` | uncovered | qa_matrix |
| INV-13 | Die Breite der Seitenleiste wird nur bei einer Änderung durch den User gespeichert; Ein- und Aufklappen spiegeln sich im Zustand `sidebarCollapsed`, an dem Watcher und Git-Abfragen pausieren | `src/app/App.tsx:1708-1710`, `src/app/App.tsx:1730` | `src/modules/sidebar/useSidebarPanel.test.ts` „only persists a positive width from direct user interaction", „mirrors collapse and expand as state", „keeps an explorer that starts collapsed free of watches until it opens"; `src/modules/source-control/statusConsumers.test.ts` „is idle with the sidebar collapsed, a terminal tab and no git widget" | covered | none |

INV-12 bekommt mit `HtmlPreviewPane.sandbox.test.ts` (SEC-9) einen Test in diesem Lauf. Dass Zen das Einklappen nicht speichert, ist neues Verhalten (MIG-20, Mac N-22), keine Invariante.

---

## Register

> No requirement IDs — context

N/A — kein Garantie-Register

| Verzeichnis | Entscheidung | Garantie | Begründung |
|-------------|--------------|----------|------------|

---

## Test Strategy & Mocking

> No requirement IDs — context

| System Boundary | Mocking Decision | Reason |
|-----------------|------------------|--------|
| Rust-Regel-Kern (SVC-2 bis SVC-6, SVC-10, SVC-21) | no_mocks | Reine Funktionen |
| Lokales Lesen (SVC-7) | no_mocks | Echte Dateien und Symlinks in `tempfile`-Ordnern wie `guard.rs`-Tests |
| SSH-Lesen (SVC-8) | mock_external | Auf der Werkbank kein SSH-Host; Host-Ersatz als übergebene Funktion nach `file.rs:753-764` (bestehendes Muster) |
| Listener (SVC-9) | no_mocks | Echter Socket auf `127.0.0.1:0` in `cargo test` (Linux, Docker-Abbild `terax-rust:local`, `specs/2026-11-20-ssh-remote-workflow/slim-spec.md:17`) |
| Opener (SVC-11) | mock_external | Kein Browser im Test; Öffnen als übergebene Funktion wie `view_with` in `chrome.rs:509-527` |
| Esc-Monitor (SVC-18) | no_mocks | Nur am Mac (N-10); kein Test auf der Werkbank |
| Frontend-Regeln (SVC-12 bis SVC-17, SVC-19) | no_mocks | Reine Funktionen, Vitest jsdom |
| `openInBrowser`, `useZenEscape`, `PreviewHeader` | mock_external | Tauri-IPC fehlt in jsdom; `invoke`/`listen` ersetzt wie in bestehenden Tests (`src/modules/ports/PortsList.test.tsx`) |
| Guard-Tests | no_mocks | Lesen Quelltext und Capabilities (Muster `chromeProbe.guard.test.ts`) |

---

## Constraints & Integrations

> No requirement IDs — context

### Constraints

| Constraint | Technical Implication | Solution |
|------------|----------------------|----------|
| Kein `cargo` auf der Werkbank (gemessen), App startet hier nicht | Server-Kern muss ohne App und ohne macOS prüfbar sein | Reiner Kern plus Listener-Test mit echtem Socket; AppKit nur in `zen_escape.rs` (NFR-6) |
| Bundle-Rahmen 7–8 MB (`TERAX.md:20`) | Keine schwere Abhängigkeit | Keine neue Crate in W1 (MIG-1); W2 drei kleine Crates |
| Über SSH je Datei ein Prozess, 10 MB, kein Range (`ssh.rs:394-412`, `:1490-1525`); alle Sitzungen eines Hosts teilen das `MaxSessions`-Budget des ControlMasters | Viele Nachbardateien kosten Zeit; zu viele gleichzeitige Lesevorgänge nehmen Terminal-Tabs und Git Plätze weg | SEC-14 (1 je Host, eine Wiederholung), BR-13 hingenommen; N-4, N-25 |
| `fs_read_file` mit `trusted` prüft über SSH nichts (`file.rs:94-101`) | Darf für den Server nicht gelten | Server liest nie über `fs_read_file`, sondern über SVC-8 mit Sperrliste vor und nach dem Lesen |
| Fokus im `iframe`: App-Kürzel kommen nicht an (`src/modules/shortcuts/lib/useGlobalShortcuts.ts:65`) | Esc braucht einen Weg außerhalb des DOM | SVC-18 (nativ) |
| Wisch-Entscheidung sieht nicht in das `iframe` (`useTabSwipe.ts:35-37`) | Über der HTML-Vorschau immer Tab-Wechsel | `data-no-tab-swipe` + SVC-17 |
| `titleBarStyle: Overlay` (`tauri.conf.json:21-22`) | Ohne Kopf liegen die Ampelknöpfe über dem Inhalt | Kopfzeile im Zen auf macOS mit linkem Abstand; Maß am Mac (N-11) |
| Seitenleiste speichert Einklappen (`App.tsx:1709`) | Zen darf das nicht dauerhaft überschreiben | Zen klappt ohne Speichern ein und stellt die Breite wieder her (MIG-20, INV-13, N-22) |
| macOS zuerst; Windows/Linux müssen kompilieren (R8) | `cfg`-Grenzen | `opened_path` mit macOS-, Linux- und Windows-Arm; Esc-Monitor nur macOS; tokio-Netz plattformneutral |
| Upstream ersetzt das Asset-Protokoll (crynta#1450) | Konflikte beim nächsten Sync | Eigenes Modul; `asset.rs` unberührt; Namen `Grant`, `within`, `opened_path` wie upstream; gleiche Cargo-Zeilen für `getrandom`, `percent-encoding` |

### Integrations

| Area | System / Capability | Interface | Version | Notes |
|------|----------------------|-----------|---------|-------|
| Netz, Laufzeit | tokio (`net`, `io-util`, `sync`, `time`, `rt`) | `TcpListener`, `timeout`, `Semaphore` | 1.54.1 | Lockfile `Cargo.lock:4895-4896`; neueste stabile laut Debian-Tracker 1.54.1 (gelesen 2026-11-25); LTS 1.47.x; keine Umbrüche, nur Features |
| HTTP-Kopf | httparse | `Request::parse` | 1.10.1 | Lockfile `Cargo.lock:1780-1781`; neueste laut docs.rs 1.10.1 (Build 2026-05-28, gelesen 2026-11-25) |
| Zufall | getrandom | `fill` | 0.4.3 | Lockfile `Cargo.lock:1483-1484`; neueste laut docs.rs 0.4.3 (gelesen 2026-11-25); `fill` unverändert seit 0.3; upstream nutzt `0.4` |
| Pfad-Dekodierung | percent-encoding | `percent_decode_str`, `utf8_percent_encode` | 2.3.2 | Lockfile `Cargo.lock:3020-3021`; neueste laut ecosyste.ms/docs.rs 2.3.2 (gelesen 2026-11-25) |
| Browser öffnen | tauri-plugin-opener (Rust-Seite) | `open_url(url, None)` | 2.7.2 | Lockfile `Cargo.lock:4563-4564`; Aufruf wie `chrome.rs:71`; Web-Belege zeigen nur ältere Stände bis 2.5.4 mit derselben Signatur (docs.rs, gelesen 2026-11-25); keine Versionsänderung |
| App-Rahmen | tauri | Commands, Events, `manage` | 2.12.5 | Lockfile `Cargo.lock:4376-4377`; neueste 2.12.6 vom 2026-11-16 (v2.tauri.app, gelesen 2026-11-25), Patch ohne Bezug; keine Änderung |
| Frontend-IPC | @tauri-apps/api | `invoke`, `listen` | ~2.12.3 | `package.json:67` |
| Zustand | zustand | `create` | ^5.0.15 | `package.json:108`; Muster der bestehenden Stores |
| Oberfläche | React | – | ^19.3.0 | `package.json:98` |
| Tests | vitest (jsdom) | `pnpm vitest run --maxWorkers=2` | ^4.1.11 | `package.json:136`, jsdom ^29.1.1 (`:124`) |
| SSH | OpenSSH ControlMaster + Python-Helfer auf dem Host | `ssh::read_bytes_typed` (neu, SVC-22), `ssh::realpath` | bestehend; `read_bytes_typed` neu | `ssh.rs:92-147`, `:1465-1502` |
| macOS-Ereignisse | objc2-app-kit `NSEvent` | lokaler Monitor `KeyDown` | 0.3 (Cargo.toml) | `Cargo.toml:67` Feature `NSEvent` ist schon aktiv |
| Geöffneter Pfad | libc `fcntl(F_GETPATH)` (macOS), `/proc/self/fd` (Linux), Windows erneutes Auflösen | – | libc 0.2 | `Cargo.toml:58-59`; Muster upstream `opened_path` |
| Browser | Safari, Chrome (Mac) | HTTP/1.1 über Loopback | Chrome ab 142 mit Local Network Access | Loopback-Seiten selbst lösen keine LNA-Prüfung aus (developer.chrome.com, gelesen 2026-11-25); N-7 |
| W2 Markdown | pulldown-cmark | Parser + HTML-Ausgabe | 0.13.x, Version beim Bau von W2 neu prüfen | Eintrag `pulldown-cmark = { version = "0.13", default-features = false, features = ["html"] }`, weil die Standard-Features sonst `getopts` mitziehen (pulldown-cmark 0.13.6 `Cargo.toml.orig`, laut Gate-1-Report); so kommen `pulldown-cmark-escape` und `unicase` neu ins Lockfile (`bitflags`, `memchr` vorhanden) |

---

## Quality Attributes (NFRs)

### From Discovery → Technical Solution

| ID | Attribute | Target (from Discovery) | Technical Approach | Measure / Verify |
|----|-----------|-------------------------|--------------------|------------------|
| NFR-1 | Ressourcen | „Unused features consume zero resources" (`TERAX.md:20`); Server läuft unsichtbar (TG-4) | Kein Socket und keine Aufgabe vor dem ersten Klick; je Freigabe ein Socket und eine Aufgabe; Grenze 256 | `cargo test`: neuer `PreviewServer` hat keinen Listener |
| NFR-2 | Bundle | 7–8 MB (`TERAX.md:20`) | Keine neue Crate in W1; eigener schlanker HTTP-Kern | Größe von `Terax.app` vor und nach dem Lauf (N-6) |
| NFR-3 | Ladezeit über SSH | Seite mit Nachbardateien lädt vollständig (BR-5), ohne Terminal-Tabs oder Git zu stören | Ein `ssh`-Aufruf je Datei über den ControlMaster; 1 zugleich je Host, eine Wiederholung nach Verweigerung (SEC-14). Geschätzt, nicht gemessen: 0,1 bis 0,5 s je Datei (eine Sitzung über den Master plus Start des Python-Helfers); 30 Bilder brauchen nacheinander rund 3 bis 15 s, mit 4 zugleich rund 1 bis 4 s | Mac N-4, N-25: Seite mit 30 Bildern bei 7 offenen Terminal-Tabs lädt vollständig, kein Tab und kein Git-Aufruf scheitert; Ladezeit notieren |
| NFR-4 | Verlässlichkeit | Eine fehlende Nachbardatei bricht die Seite nicht (EP-3) | Fehler je Datei; SSH-Ausfall als `502`/`504` mit Text; Zeitbudgets SEC-13, SEC-15, SEC-16 | `cargo test` mit echtem Socket; Mac N-20 |
| NFR-5 | Aktualität | Neuladen zeigt den aktuellen Stand ohne Schritt in Terax (BR-6, FL-3) | Jede Anfrage liest neu; `Cache-Control: no-store` | `cargo test`: zwei Abrufe nach Änderung der Datei liefern den neuen Inhalt; Mac N-3 |
| NFR-6 | Prüfbarkeit, Plattformen | macOS zuerst, Windows/Linux brechen nicht (R8) | Kern ohne AppKit; `cfg`-Arme; Esc-Monitor nur macOS | `cargo test --locked` unter Linux; `cargo clippy` |
| NFR-7 | Sicherheit | Sicherheitsfläche der Discovery | Abschnitt „Sicherheitsmodell" | Test je Zeile dort |
| NFR-8 | Bedienung | Kopfzeile verdeckt keinen Inhalt (BR-21) | Kopfzeile als eigene Zeile über dem Inhalt, kein Overlay | Vitest: Kopfzeile ohne absolute Positionierung; Mac N-11 |

### Monitoring & Observability

> No requirement IDs — covered via NFR-n

| Metric | Type | Target | Alert |
|--------|------|--------|-------|
| Entfällt | – | – | Keine Telemetrie (`SECURITY.md:36`); Log nur lokal, nie mit Geheimnis oder Adresse |

---

## Risks & Assumptions

> No requirement IDs — context

### Assumptions

| Assumption | Technical Validation | Impact if Wrong |
|------------|---------------------|-----------------|
| Binden an `127.0.0.1` löst keine Firewall-Nachfrage von macOS aus | Mac N-16 | Einmalige Nachfrage beim ersten Klick; Hinweis in `TERAX.md` |
| `open_url` öffnet `http://127.0.0.1:{port}/…` im Standard-Browser | Mac N-2 | Fehler-Toast `open_failed`; Ausweg „Copy" wäre eine neue Anforderung |
| Safari und Chrome zeigen eine PDF mit `sandbox`-CSP als Hauptdokument im eingebauten Betrachter: Chrome 156 vom Gate-1-Nachprüfer gemessen (Linux, headless); Chrome ab 91 laut Chromium (crbug 1187122); Safari ab 18.4 laut den offiziellen Apple-Release-Notes zu Safari 18.4 (Eintrag 141166987, nur Hauptdokument); eingebettete PDFs und Safari vor 18.4 offen | Mac N-8 | Bleibt die PDF in Safari leer: Safari aktualisieren; ein Wechsel auf Q&A 4 Option B bräuchte eine neue Entscheidung des Users |
| Der lokale AppKit-Monitor sieht `keyDown` auch bei Fokus im `iframe` | Mac N-10; der Wisch-Monitor sieht Ereignisse vor WKWebView (`lib.rs:64-65`) | Ehrliche Grenze aus Q&A 1 tritt ein |
| `:hover` reicht über einem `iframe` bis zum `iframe`-Element | Mac N-12; SVC-17 deckt den Fall ohne Hover-Ziel | Wischen über der Vorschau wechselt weiter; SVC-17 auf „aktiver Tab `html`" ausweiten |
| Python-Helfer liefert für Symlinks das aufgelöste Ziel (`ssh.rs:399`, `:412`) | `cargo test` des Helfers (`ssh.rs:2364`) und N-19 | Prüfung würde am Link-Pfad statt am Ziel greifen |
| Lokale Dateisysteme ohne Groß/Klein-Unterscheidung (APFS) liefern Wurzel und Ziel in derselben Schreibweise | Wurzel und Ziel werden auf demselben Weg aufgelöst; Abweichung weist ab | Fehlende Nachbardatei statt Ausbruch (fail-closed) |

### Risks & Mitigation

| Risk | Likelihood | Impact | Technical Mitigation | Fallback |
|------|------------|--------|---------------------|----------|
| Fehler in der selbst geschriebenen Pfad- und Bereichsprüfung öffnet Dateien außerhalb | Med | High | Reine Funktionen, Beispiel-Tabelle plus `proptest`, Prüfung nach dem Öffnen über die geöffnete Datei, Sperrliste doppelt | Freigabe auf Nur-Datei zurückstufen (eine Konstante in SVC-2) |
| SSH: Lesevorgänge nehmen Terminal-Tabs und Git Plätze im `MaxSessions`-Budget weg, oder Seiten laden langsam | Med | Med | 1 Lesevorgang je Host, eine Wiederholung nach Verweigerung, Zeitbudget je Datei (SEC-14) | Bei mehr als 8 offenen Tabs zum Host reicht auch das nicht: `MaxSessions` auf dem Server erhöhen (N-25); neuer Leseweg (Out of Scope) |
| Browser-Verhalten am Mac weicht ab (PDF-Betrachter, Firewall, 127.0.0.1 im App-Rahmen für Baustein E) | Med | Med | Mac-Prüfpunkte N-8, N-16, N-23 mit vorbereiteten Ausweichen | PDF: Safari aktualisieren; Baustein E: Konstante aus (Rückfall auf den heutigen Ladeweg) |
| Esc-Monitor greift in Terminal-Tabs (Claude Code bricht nicht mehr ab) | Low | High | Scharf nur im Zen über einer Vorschau (SVC-16), Ereignis wird weitergereicht | Monitor-Schalter aus; Zen nur per Taste und Kürzel |
| Zen-Einklappen überschreibt die gespeicherte Seitenleiste | Med | Low | Einklappen ohne Speichern, Wiederherstellen der Breite | QA N-22 |
| Konflikte mit dem nächsten Upstream-Sync (crynta#1450, #1486, #1461) | High | Med | Eigenes Modul, `asset.rs` unberührt, gleiche Namen und Cargo-Zeilen | Sync-Lauf löst `EditorPane.tsx` und `MarkdownPreviewPane.tsx` von Hand |

---

## Technology Decisions

> No requirement IDs — context

### Stack Choices

| Area | Technology | Rationale |
|------|------------|-----------|
| HTTP-Server | eigener Kern auf `tokio::net::TcpListener` + `httparse` | Alles schon im Lockfile; nur `GET`/`HEAD` ohne Rumpf, `Connection: close`; Aufwand rund 300 bis 400 Zeilen Rust samt Tests |
| Alternative hyper (Server) + hyper-util | verworfen | Server-Feature heute aus: `hyper` ohne `httpdate` im Lockfile (`Cargo.lock:1786-1802`); brächte `httpdate` und Server-Code; Keep-Alive und Chunked brauchen wir nicht |
| Alternative axum | verworfen | zieht `tower`, `matchit`, `serde_urlencoded` u. a.; Router ohne Nutzen bei einem Pfadmuster |
| Alternative tiny_http | verworfen | eigener Thread-Server neben tokio, neue Crates (`ascii`, `chunked_transfer`, `httpdate`) |
| Alternative von Hand auf `std::net` ohne tokio | verworfen | Ein Thread je Verbindung, Zeitbudgets per Socket-Option; mehr Code für Grenzen; tokio läuft ohnehin |
| MIME | eigene feste Liste (SVC-5) | `mime_guess` fehlt (`git grep`, Lockfile) und bringt eine große Tabelle; wir brauchen rund 25 Endungen |
| Zufall | `getrandom` 0.4 | Gleich wie upstream; Lockfile hat 0.4.3 |
| Markdown W2 | `pulldown-cmark` | kleiner als `comrak` (AST, mehr Abhängigkeiten); statische Ausgabe, kein Skript nötig |
| Zen-Zustand | zustand-Store | Panes und App lesen denselben Zustand ohne Prop-Kette |

### Trade-offs

| Decision | Pro | Con | Mitigation |
|----------|-----|-----|------------|
| Port je Freigabe | eigene Herkunft je Link: Speicher und Skripte innerhalb eines Terax-Laufs getrennt (BR-14) | mehr Sockets; Cookies bleiben portübergreifend, auch die anderer Dienste auf `127.0.0.1`; Speicher eines Ports kann in einem späteren Lauf an einen anderen Link fallen | Grenze 256; Server setzt keine Cookies; Sicherheitsmodell 13, 24; Q&A 36 |
| Geheimnis im Pfad | relative Verweise tragen es; `../` fällt heraus; keine Cookies | steht im Browser-Verlauf; Seitenwurzel-Verweise laden nicht | wertlos nach Prozessende; Q&A 7 |
| Prüfung über SSH nach dem Lesen | ein Aufruf je Datei | Bytes einer abgewiesenen Datei kurz im Speicher | nie in der Antwort; bestehendes Muster |
| PDF mit `sandbox` (Q&A 4, User) | gleiche Abschottung wie alle trägen Arten (BR-14 wörtlich) | Safari vor 18.4 zeigt die PDF womöglich leer | Echtheitsprüfung, `nosniff`; Mac N-8; Ausweichen nur mit neuer Entscheidung (Q&A 4 Option B) |
| Nativer Esc-Monitor | Esc wirkt immer | macOS-Code ohne Test auf der Werkbank | scharf nur im Zen über einer Vorschau; N-10, N-21 |
| Kein Range, kein Keep-Alive | kleiner Kern | Video/Audio laufen nicht, mehr Verbindungen | Video/Audio Out of Scope; Loopback-Verbindungen sind billig |

---

## Welle 2: Markdown im Browser

> No requirement IDs — covered via SVC-n

Alles in diesem Abschnitt ist **[W2]** und gehört nicht zum Bau von Welle 1.

| Frage | Entscheidung | Folge |
|-------|--------------|-------|
| Wo wird gerendert? | Im Rust-Teil beim Abruf, `pulldown-cmark` (SVC-20); jedes Neuladen rendert neu (BR-6) | Keine Skripte im Browser nötig |
| Verworfen: mitgelieferte Viewer-Seite (JS-Renderer im Browser) | – | Skripte in der Herkunft der Freigabe mit Datei-Inhalt als Eingabe; widerspricht „abgeschottet" (BR-14) |
| Verworfen: Übergabe aus der App (Streamdown rendert, App schickt HTML an Rust) | – | Webview-Inhalt würde zur Server-Quelle; Formeln und Farben sind ohnehin nicht gewollt (BR-17); kein Neuladen ohne Terax (BR-6) |
| Verworfen: `comrak` | – | größer, mehr Abhängigkeiten, Funktionsumfang über BR-17 hinaus |
| Bundle | `pulldown-cmark` mit `default-features = false, features = ["html"]` (sonst kommt `getopts` dazu); damit drei neue kleine Crates (`pulldown-cmark`, `pulldown-cmark-escape`, `unicase`); Zuwachs beim Bau von W2 messen (wie N-6) | Begründung im W2-Lauf |
| Sicherheit | Ausgabe als `text/html` mit `sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'`; rohes HTML aus der Datei als Text; Links bleiben Links | Bilder aus dem Ordner laden (Ordner-Freigabe), Skripte nie |
| Was Welle 1 dafür bereithält | Art `markdown` und Welle als Konstante in SVC-5; Ordner-Freigabe für Markdown in SVC-2; Kopfzeilen-Zeile in SVC-6; Welle in SVC-12; Taste in der Markdown-Kopfzeile ist schon da, nur verborgen (SVC-14) | W2 ändert nur `policy.rs`, `markdown.rs`, `Cargo.toml`, `browserOpenable.ts` |
| Markdown-Nachbarn in W1 | `.md` als Nachbardatei einer HTML-Seite wird in W1 als `text/plain` geliefert (träge) | Ab W2 nur die Bezugsdatei gerendert, Nachbarn bleiben Rohdatei |

---

## In-App-Vorschau über den Mini-Server

> No requirement IDs — covered via API-n

Baustein E gehört zu Welle 1 (User, 25.11.2026, ohne Vorab-Messung). Der heutige Ladeweg bleibt im Code als Rückfall; die Messungen sind Mac-Prüfpunkte mit Abbruchkriterium, keine Vorbedingung.

### Schnitt

| Punkt | Festlegung |
|-------|------------|
| Nahtstelle Rust | Command `preview_frame_source` (API-8), Freigabe-Klasse `frame` im selben `PreviewServer` (eigener Port, eigenes Geheimnis, Wiederverwendung je Ort und Datei), HTTP wie API-2 (API-9) |
| Nahtstelle Frontend | `htmlPreviewSource(workspace, enabled)` (SVC-19) mit einer Konstante „Baustein an", in W1 an; `HtmlPreviewPane` wählt danach den Ladeweg |
| Mit E (W1) | Lokal und SSH laden über den Server (ein Weg); WSL bleibt bei `srcDoc`; `asset_allow` und `srcDoc` bleiben in `HtmlPreviewPane` als Rückfall stehen (keine Löschung in W1); das Asset-Protokoll bleibt außerdem für Medien im Editor |
| Rückfall (Konstante aus) | `HtmlPreviewPane` lädt wie heute (`HtmlPreviewPane.tsx:54-93`): lokal Asset-Protokoll, SSH `srcDoc`; der Command bleibt registriert, wird aber nicht gerufen; alle übrigen Bereiche unverändert |
| Wenn der Rahmen nicht lädt | Die App erfährt nicht, ob WebKit den Rahmen über `http://127.0.0.1` sperrt (opake Herkunft, kein lesbarer Inhalt); die Vorschau zeigt dann eine weiße Fläche ohne Meldung. Einen automatischen Rückfall zur Laufzeit gibt es nicht; der Rückfall ist die Konstante, umgestellt nach M-C vor dem Merge (Abbruchkriterium unten) |
| Kopfzeilen der Klasse `frame` | HTML ohne `sandbox`-CSP (das `iframe`-Attribut schottet ab), `frame-ancestors` mit den App-Herkünften; übrige Arten wie bei Browser-Freigaben (Tabelle in „DTOs") |
| Adresse | `http://127.0.0.1:{port}/…`; zeigt die Messung, dass WebKit `127.0.0.1` im App-Rahmen sperrt, `localhost` aber lädt: Bindung zusätzlich an `[::1]` am selben Port und `localhost` in der Adresse; ist der Port auf `[::1]` belegt, wird der erste Socket freigegeben und ein Port gesucht, der auf beiden Adressen frei ist (Muster `TERAX.md:44`); die Host-Prüfung dieser Freigabe nimmt dann genau `localhost:{port}` an (VAL-1) |

### Mac-Prüfung und Abbruchkriterium (Messseite `evidence/messseite/index.html`, Punkte 1–8)

| Messung | Ablauf am Mac (installierte App oder `Terax Dev.app`, Release-Build) |
|---------|---------------------------------------------------------------------|
| M-A (Rückfall, heute) | Messseite einmal lokal und einmal vom SSH-Server als HTML-Vorschau öffnen; Punkte 1–8 notieren |
| M-B (Server-Weg im App-Rahmen) | Auf dem Mac im Ordner `evidence/messseite` `python3 -m http.server 8765 --bind 127.0.0.1` starten; in Terax einen Web-Vorschau-Tab mit `http://127.0.0.1:8765/index.html` öffnen; Punkte 1–6 notieren (7 und 8 sagen dort nichts, die Web-Vorschau hat `allow-same-origin`, `PreviewPane.tsx:115`); danach dasselbe mit `http://localhost:8765/index.html` |
| M-C (Abnahme mit Baustein E) | Release-Build mit Baustein E: Messseite als HTML-Vorschau, lokal und vom SSH-Server, mit den echten Kopfzeilen der Klasse `frame` (`frame-ancestors` mit den App-Herkünften); dazu eine Nachbar-HTML, die die Messseite in einem eigenen `iframe` einbettet. M-B sagt darüber nichts, weil `http.server` keine CSP sendet |

| Ergebnis von M-C | Folge |
|------------------|-------|
| Messseite lokal und remote sichtbar, Punkte 1, 2, 4, 5, 6 grün, verschachtelte Nachbar-HTML sichtbar | Baustein E bleibt an |
| Weiße Fläche oder Punkt 4 rot mit `127.0.0.1`, M-B mit `localhost` grün | Fallback-Adresse `localhost` einschalten (Schnitt, VAL-1), M-C wiederholen |
| Nur die verschachtelte Nachbar-HTML leer | `frame-ancestors` für die Klasse `frame` weglassen (das Geheimnis schützt weiter), M-C wiederholen |
| Abbruch: nach diesen Anpassungen weiter weiße Fläche oder Punkt 4 rot | Konstante vor dem Merge auf aus; HTML-Vorschau wie heute (M-A); Meldung an den User |
| Punkte 7 und 8 | erwartet rot (FS-6, BR-24); im Browser grün; kein Abbruchgrund |
| Punkt 3 (CDN) | erwartet grün (eigene Herkunft, App-CSP greift nicht); rot ist kein Abbruchgrund |
| M-A | Einordnung dessen, was der Rückfall zeigt |

### Folgen des Umstiegs

| Thema | Folge |
|-------|-------|
| FS-6 (Sandbox ohne `allow-same-origin`), BR-24 | Unverändert (SEC-9): das `iframe` bleibt opak; Speicher, Cookies und `fetch` auf Nachbardateien bleiben aus. BR-24 gilt damit wörtlich weiter, auch mit Baustein E; neu ist nur, dass in Remote-Vorschauen Inline- und CDN-Skripte laufen und Bilder, Styles und klassische Skripte aus dem Ordner laden. BR-24 stammt aus der Zeit, als der Baustein offen war; der Nachzug in `discovery.md` ist eine Klarstellung. Der Grund von FS-6 (Zugriff auf App- oder Asset-Herkunft) wird sogar schwächer, weil der Rahmen nie die App-Herkunft trägt; eine spätere Lockerung auf die Server-Herkunft wäre eine eigene Entscheidung, nicht Teil von E |
| Wiederhergestellte Tabs | Speichern weiter nur Pfad und Workspace (`src/modules/spaces/lib/serialize.ts:259-268`), nie eine Server-Adresse; beim ersten Einhängen holt die Pane eine neue Adresse; kalte Tabs kosten nichts (`src/modules/doc/DocStack.tsx:97-99`) |
| Wisch-Ausnahme | Unverändert; sie hängt am Pane-Element, nicht an der Quelle |
| Neu laden | Neuaufbau des `iframe`; kein Zähler in der Adresse nötig (`no-store`) |
| Esc im Zen | Unverändert (SVC-18) |
| App-CSP | Unverändert; `frame-src … http:` deckt den Server (`tauri.conf.json:28`) |
| Neben `fetch`: Modul-Skripte | Bleiben aus (CORS aus opaker Herkunft), wie heute lokal (`dossier-vorschau.md` 4.3) |

---

## Prüfbarkeit und Mac-Prüfpunkte

> No requirement IDs — context

### Nachweis je Kernentscheidung

| Nr | Nachweis | Wie |
|----|----------|-----|
| K1, K2 | `cargo test` | Listener-Test mit echtem Socket: Bindung, Port ungleich 0, zwei Freigaben zwei Ports |
| K3 | `cargo test` | Geheimnis-Vergleich, `split_target`-Tabelle, `proptest` |
| K4 | `cargo test` + Mac | Wiederverwendung, Grenze 256; N-18 für Prozessende |
| K5 | `cargo test` | `grant_scope`-Tabelle (Bedrohung 10) |
| K6 | `cargo test` | Bedrohungen 6, 7, 9, 16 lokal |
| K7 | `cargo test` + Mac | Bedrohungen 8, 14 mit Host-Ersatz; jede `RemoteReadError`-Art auf ihren Code (SVC-8); Helfer-Test: fehlende Datei, Ordner, zu große Datei melden `missing`, `not_regular`, `too_large` (MIG-21); eine Wiederholung nach `Unreachable`, Grenze 1 je Host; Mac N-4, N-20, N-25 |
| K8 | `cargo test` + Mac | Kopfzeilen je Art; N-8, N-17 |
| K9, K10 | Vitest + Mac | Guard-Test, `BrowserOpen` ohne Adresse; N-2 |
| K11 | Vitest | `previewHeaderModel`-Tabelle; `PreviewHeader` je Fläche |
| K12 | Vitest + Mac | Zähler löst erneutes Lesen aus (gemocktes `invoke`); N-3 |
| K13 | Vitest + Mac | `zenChrome`-Tabelle; N-11, N-22 |
| K14 | Vitest + Mac | `zenEscape`-Tabelle; N-10, N-21 |
| K15 | Vitest + Mac | `defersToActivePreview`, Attribut nur bei `visible`; N-12 |
| K16 | Vitest + Mac | `htmlPreviewSource` mit Konstante an und aus; N-23 (M-C mit Abbruchkriterium) |
| K17 | `cargo test` (im W2-Lauf) | Rendern, rohes HTML als Text, Kopfzeilen |

### Nicht messbar auf der Werkbank (Fortsetzung der Discovery-Liste)

| # | Prüfpunkt | Schritt | Bezug |
|---|-----------|---------|-------|
| N-1 bis N-15 | wie `discovery.md` Abschnitt „Nicht messbar auf der Werkbank" | – | N-1 ordnet den Rückfall von Baustein E ein; N-6 ist teilweise beantwortet: Server-Features von hyper sind aus (`Cargo.lock:1786-1802`, kein `httpdate`), tokio-Netz ist an (`Cargo.lock:4899-4907`); offen bleibt nur die gemessene Größe von `Terax.app` vorher/nachher; N-8 Schritt: echte PDF im Browser öffnen, mit und ohne `sandbox` (Konstante in SVC-6), in Safari (Version notieren; entscheidend ist 18.4 und neuer) und Chrome; jeweils als Hauptdokument, über einen Link mit `target="_blank"` aus einer ausgelieferten HTML-Seite und eingebettet (`<iframe>`, `<embed>`) in einer solchen Seite |
| N-16 | Loopback ohne Firewall-Nachfrage, Netz gesperrt | „Open in Browser" bei lokaler HTML; kein Firewall-Dialog; vom iPhone im selben WLAN `http://{Mac-IP}:{port}/…` aufrufen: keine Verbindung | BR-1, EP-2 |
| N-17 | Messseite im Browser, Abschottung träger Arten | Ordner `evidence/messseite` auf den SSH-Server kopieren, im Explorer „Open in Browser" auf `index.html`: Safari und Chrome zeigen 1–8 „ja"; Adresse auf `bild.svg` ändern: Bild sichtbar; eine SVG mit `<script>alert(1)</script>` direkt öffnen: kein Alert | BR-4, BR-14, FL-2 |
| N-18 | Link nach dem Beenden | Adresse aus dem Browser kopieren, Terax beenden, Seite neu laden: keine Verbindung; Terax starten: alter Link bleibt tot; neuer Klick: neue Adresse | BR-15, EP-4, TR-2 |
| N-19 | Reichweite und Symlinks | HTML mit `<img src="../x.png">` und `<img src="sub/y.png">`: nur `y` lädt; im Ordner `ln -s ~/geheim.png link.png` und `<img src="link.png">`: lädt nicht; `fetch('.env')` in der Seite: `403` | BR-4, BR-10, BR-11, EP-3 |
| N-20 | SSH getrennt | `ssh -O exit {host}` mit Passphrase-Schlüssel, Seite im Browser neu laden: Textseite „Terax could not read …"; Terminal zum Host öffnen, Passphrase eingeben, neu laden: Seite da | NFR-4, Q&A 10 |
| N-21 | Esc im Terminal-Tab im Zen | Claude Code in einem Terminal-Tab arbeiten lassen, Zen an, Esc: Claude Code bricht ab, Zen bleibt; in einem HTML-Tab in die Seite klicken, Esc: Zen endet | Q&A 1, Q&A 2 |
| N-22 | Seitenleiste nach Zen | Seitenleiste auf rund 300 px ziehen, Zen an und aus: wieder 300 px; Terax neu starten: Leiste offen | INV-13 |
| N-23 | Abnahme Baustein E | M-C mit Abbruchkriterium, M-A und M-B zur Einordnung, aus „In-App-Vorschau über den Mini-Server" | Q&A 29 |
| N-24 | Kopfzeile über SSH-PDF | PDF aus einem SSH-Workspace öffnen: Karte „preview not available over SSH" mit Kopfzeile; „Open in Browser" zeigt die PDF im Browser | BR-12, BR-23 |
| N-25 | Sitzungsbudget über SSH | Auf dem Server `sshd -T \| grep -i maxsessions` notieren; 7 SSH-Terminal-Tabs zum Host offen, eine Port-Freigabe aktiv; HTML-Seite mit 30 Bildern per „Open in Browser" öffnen, währenddessen einen weiteren Terminal-Tab öffnen und die Quellcodeverwaltung aktualisieren: alle Bilder da, Tab startet, Git ohne Fehler; Ladezeit notieren | SEC-14, NFR-3, Q&A 35 |
| N-26 | entfällt (Q&A 36 = A, User, 25.11.2026) | – | – |

---

## Anti-Slop Dispositions

> No requirement IDs — context

N/A — no findings (kein `codebase-scan.md` im Spec-Ordner).

| # | class | subject | decision | Rationale | guard_obligation | Implementation |
|---|-------|---------|----------|-----------|------------------|----------------|

---

## Open Questions

> No requirement IDs — context

| # | Question | Options | Recommended | Decision |
|---|----------|---------|-------------|----------|
| 1 | Scroll-Hänger nach Tab-Wechsel | Beobachtungsfrage der Discovery (Offene Frage 2) | unverändert aus der Discovery | – |
---

## Zuordnung der Anforderungen

> No requirement IDs — context

Alle 62 `[W1]`-Kennungen und beide `[W2]`-Kennungen der Discovery; keine Lücke. Baustein E gehört zu W1 (Q&A 29); API-8, API-9 und SVC-19 sind coverage-pflichtig.

| Anforderung | Welle | Abschnitt / Architektur-Kennung |
|-------------|-------|---------------------------------|
| BR-1 | W1 | SEC-4, VAL-1, API-1; Sicherheitsmodell 3, 5 |
| BR-2 | W1 | SEC-4, SVC-1 |
| BR-3 | W1 | SEC-1, VAL-4, SVC-10 |
| BR-4 | W1 | SEC-2, SVC-2, VAL-5, VAL-6 (Q&A 6, Q&A 7) |
| BR-5 | W1 | SVC-8, SVC-22, SEC-5, VAL-10 |
| BR-6 | W1 | NFR-5, SVC-6, API-2 |
| BR-7 | W1 | API-1; In-App-Vorschau bleibt, in W1 über den Server (SVC-19, Q&A 29) |
| BR-8 | W1 | SVC-11, API-1 |
| BR-9 | W1 | VAL-10, SVC-5, SVC-2 |
| BR-10 | W1 | VAL-7, SEC-6 |
| BR-11 | W1 | VAL-6, SVC-7, SVC-8 |
| BR-12 | W1 | VAL-8, VAL-9, SEC-16 |
| BR-13 | W1 | SVC-8, SVC-22, SEC-14, SEC-16 (Q&A 35) |
| BR-14 | W1 | SEC-7, SVC-6, SVC-1 (Port je Freigabe), VAL-4; Sicherheitsmodell 24 (Q&A 4, Q&A 36) |
| BR-15 | W1 | SEC-1, SVC-1, VAL-11 (Q&A 8, Q&A 9) |
| BR-16 | W1 | SEC-3, SEC-8 |
| BR-17 | W2 | SVC-20; Abschnitt „Welle 2: Markdown im Browser" |
| BR-18 | W1 | SVC-17, MIG-6, MIG-13, MIG-14 |
| BR-19 | W1 | SVC-15, MIG-10, MIG-11, MIG-12, MIG-17 bis MIG-20 (Q&A 3) |
| BR-20 | W1 | API-3, API-4, API-7, SVC-16, SVC-18 (Q&A 1, Q&A 2, weicht ab, vom User bestätigt) |
| BR-21 | W1 | SVC-14, MIG-5 bis MIG-8, NFR-8 |
| BR-22 | W1 | API-6 |
| BR-23 | W1 | MIG-9, SVC-14 (Q&A 5) |
| BR-24 | W1 | SEC-9; Abschnitt „In-App-Vorschau über den Mini-Server", Folgen (BR-24 gilt mit Baustein E wörtlich weiter, Q&A 29) |
| BR-25 | W1 | SVC-12, SVC-14 |
| FL-1 | W1 | API-1, API-5 |
| FL-2 | W1 | API-2, SVC-7, SVC-8 (Q&A 7) |
| FL-3 | W1 | NFR-5 |
| FL-4 | W1 | API-6 |
| FL-5 | W1 | API-7, SVC-15 |
| FL-6 | W1 | API-7, SVC-16 (Q&A 2, weicht ab, vom User bestätigt) |
| FL-7 | W1 | SVC-17 |
| FL-8 | W2 | SVC-20 |
| EP-1 | W1 | VAL-4 |
| EP-2 | W1 | SEC-4 |
| EP-3 | W1 | VAL-5, VAL-6, VAL-7 |
| EP-4 | W1 | SEC-1 |
| EP-5 | W1 | VAL-8, SEC-16 |
| EP-6 | W1 | SVC-13, API-5 (Q&A 11) |
| UI-1 | W1 | API-5, SVC-12 |
| UI-2 | W1 | SVC-14 |
| UI-3 | W1 | API-6 (Zustände `idle`, `loading`) |
| UI-4 | W1 | API-7 |
| UI-5 | W1 | MIG-15, SVC-12 |
| ST-1 | W1 | SVC-1 |
| ST-2 | W1 | SVC-1, API-1 |
| ST-3 | W1 | API-7, SVC-15 |
| ST-4 | W1 | API-7, SVC-15 (Q&A 2, weicht ab, vom User bestätigt) |
| TR-1 | W1 | API-1 |
| TR-2 | W1 | SEC-1 |
| TR-3 | W1 | API-7 |
| TR-4 | W1 | API-7, SVC-16 (Q&A 2, weicht ab, vom User bestätigt) |
| DF-1 | W1 | API-2, SVC-11, SEC-4 |
| DF-2 | W1 | SEC-1, VAL-4 |
| DF-3 | W1 | SEC-5, SVC-1 |
| DF-4 | W1 | VAL-8, SEC-16 |
| TG-1 | W1 | API-5 (Signal bewusst keines, NFR „Monitoring") |
| TG-2 | W1 | MIG-15, API-5 |
| TG-3 | W1 | API-2 |
| TG-4 | W1 | SVC-1, NFR-1 |
| TG-5 | W1 | API-6 |
| TG-6 | W1 | API-7, API-3, API-4 |
| TG-7 | W1 | SVC-17 |
| TG-8 | W1 | MIG-5 |

---

## Research Log

> No requirement IDs — context

| Date | Area | Finding |
|------|------|---------|
| 2026-11-25 | Codebase | `src-tauri/build.rs:3-6` ohne App-Manifest: App-Commands brauchen keine Capability |
| 2026-11-25 | Codebase | Lockfile: tokio hat `mio`, `socket2`, `tokio-macros` aktiv (`Cargo.lock:4899-4907`), also `net` schon im Build; hyper ohne `httpdate` (`Cargo.lock:1786-1802`), Server-Feature aus; `httparse` 1.10.1, `getrandom` 0.4.3, `percent-encoding` 2.3.2 vorhanden |
| 2026-11-25 | Codebase | Opener-Aufruf aus Rust: `tauri_plugin_opener::open_url(url, Some(app))` (`chrome.rs:68-72`) |
| 2026-11-25 | Codebase | Python-Helfer `read_bytes` löst auf, nur reguläre Dateien, `O_NOFOLLOW`, Grenze vor dem Senden (`ssh.rs:394-412`); Rust-Hülle mit Zeitbudget (`ssh.rs:1490-1525`) |
| 2026-11-25 | Codebase | Sperrliste lässt `.git` bewusst lesbar (`guard.rs:12-13`); der KI-Guard sperrt es |
| 2026-11-25 | Codebase | Zen-Zustand nur `useState` (`App.tsx:962`), Leser `:975`, `:1497`, `:1539`, `:1634`, `:1796`; Seitenleiste speichert Einklappen in `onResize` (`App.tsx:1709`) |
| 2026-11-25 | Codebase | Eingabezeile offen bei Block-Tab oder offenem KI-Panel (`WorkspaceInputBar.tsx:78`) |
| 2026-11-25 | Codebase | `tauri.conf.json:50` nennt macOS 13.0 als Mindestversion, `TERAX.md:151` noch 10.15 |
| 2026-11-25 | Upstream | `upstream/main:src-tauri/src/modules/fs/assets.rs`: Grant mit Token, `within`, `opened_path`, feste `media_type`-Liste, Kopfzeilen `sandbox`/`nosniff`/`no-store`/`no-referrer`; `upstream/main:src-tauri/Cargo.toml:46-48` `getrandom = "0.4"`, `percent-encoding = "2"`, `http-range` |
| 2026-11-25 | Web | (Runde 2 berichtigt) Ältere Berichte, nach denen der Chrome-PDF-Betrachter bei `Content-Security-Policy: sandbox` leer bleibt (Atlassian KB, textslashplain), betreffen crbug 1187122, laut Chromium security-dev behoben ab Chrome 91; Safari: „Fixed main frame PDFs served with a CSP sandbox header not loading. (141166987)" in den offiziellen Apple-Release-Notes zu Safari 18.4 (in Runde 3 auf diese Quelle umgestellt; zuvor Safari Technology Preview 212 und Redmine #40647) |
| 2026-11-25 | Web | Safari: `Sec-Fetch-Site` mit falschen Werten bei `iframe` und Sandbox (WebKit-Bugs 256472, 246508); darum keine Prüfung auf Fetch-Metadaten |
| 2026-11-25 | Web | WebKit behandelt Loopback-Inhalte uneinheitlich als Mixed Content (WebKit-Bugs 171934, 281149; Safari 18 sperrt 127.0.0.1 aus HTTPS-Seiten): Baustein E nur nach Messung |
| 2026-11-25 | Web | Chrome Local Network Access: Seiten von Loopback selbst lösen keine Prüfung aus; Edge plant keine Prüfung für Hauptfenster-Navigation |
| 2026-11-25 | Web | Versionen: tokio 1.54.1, httparse 1.10.1, getrandom 0.4.3, percent-encoding 2.3.2, tauri 2.12.6 (2026-11-16), pulldown-cmark 0.13.x |
| 2026-11-25 | Codebase (Runde 2) | `RemoteError` privat (`ssh.rs:1045-1053`), `From<RemoteError> for String` verliert die Art (`ssh.rs:1055-1064`), `read_bytes` gibt Text-Fehler (`ssh.rs:1490-1502`); `upstream/main` hat kein `ssh.rs` |
| 2026-11-25 | Codebase (Runde 2) | Am ControlMaster hängen Terminal-Tabs (`src-tauri/src/modules/pty/shell_init.rs:153`), Git (`src-tauri/src/modules/git/process.rs:345`), Datei-Aufrufe (`src-tauri/src/modules/ssh.rs:1161`) und die Halte-Sitzung der Port-Freigaben (`src-tauri/src/modules/ports.rs:167-186`) |
| 2026-11-25 | Web (Runde 2, in Runde 3 berichtigt) | Safari löst `*.localhost` über den Systemresolver auf; behoben ab macOS 26 in den Systembibliotheken unterhalb von WebKit, davor nicht verlässlich (WebKit-Bug 160504, Kommentare 19, 20; Terax-Mindestversion macOS 13.0, `tauri.conf.json:50`) |
| 2026-11-25 | Spezifikation (Runde 2, aus dem Gate-1-Report) | RFC 6265 §8.5: keine Trennung nach Port; WHATWG HTML „same site" ignoriert den Port; sshd_config(5): `MaxSessions` Default 10 je Verbindung |

---

## Q&A Log

> No requirement IDs — context

Modus autonom: keine Frage an den User; jede Zeile ist eine eigene Entscheidung dieses Agenten. Abweichungen von `discovery.md` sind markiert; der Nachzug in `discovery.md` steht aus (Schreibverbot dieses Laufs, gemeldet an die Steuereinheit).

| # | Question | Recommendation | Answer | Alternative & consequence | Mode | Wirkung | Anforderungen |
|---|----------|----------------|--------|---------------------------|------|---------|---------------|
| 1 | Im Zen-Modus soll Esc den Modus verlassen. Hast du vorher in eine HTML-Seite geklickt, bekommt nur die Seite die Tasten, Terax sieht das Esc nicht. Soll Terax das Esc trotzdem erkennen? | Ja: Terax erkennt Esc auf dem Mac direkt am Fenster (so wie heute schon das Wischen), aber nur im Zen über einer Vorschau. Esc wirkt dann immer; die Seite bekommt das Esc zusätzlich und schließt z. B. ihr eigenes Fenster | A: Ja, Erkennung am Fenster (SVC-18), nur im Zen über einer Vorschau scharf | Ehrliche Grenze: nach einem Klick in die Seite wirkt Esc erst nach einem Klick außerhalb; Rückweg über die Zen-Taste der Kopfzeile. Weniger Code, BR-20 nur teilweise erfüllt | User, 25.11.2026 | fachlich | Anforderungen: BR-20, TR-4, UI-4 · weicht ab: — |
| 2 | Esc ist im Terminal wichtig: es bricht in Claude Code ab, Vim braucht es. Soll Esc den Zen-Modus überall verlassen oder nur in Vorschauen? | Nur in Vorschauen (HTML, Markdown, Bild, PDF). In Terminal- und Code-Tabs geht Esc wie heute an das Programm; dort endet Zen mit Mod+Shift+' | A: nur in Vorschauen (SVC-16) | Überall: im Zen würde jedes Esc in Claude Code zuerst den Modus beenden statt abzubrechen; Vim im Editor verliert Esc | User, 25.11.2026 | fachlich | Anforderungen: BR-20, TR-4, FL-6, ST-4 · weicht ab: BR-20, TR-4, FL-6, ST-4 (vom User bestätigt; Nachzug in discovery.md nötig) |
| 3 | Der ausgebaute Zen-Modus blendet Seitenleiste, Ränder und Rahmen aus. Was passiert mit der Eingabezeile unten (KI-Eingabe, Befehlseingabe der Block-Tabs)? | In Vorschau- und Code-Tabs ausgeblendet; in Terminal-Tabs bleibt sie wie heute, weil Block-Tabs sie zum Tippen brauchen | A: Ausgeblendet außer in Terminal-Tabs (SVC-15) | Überall ausblenden: Block-Tabs sind im Zen nicht bedienbar. Überall lassen: mit offener KI-Leiste füllt die Vorschau das Fenster nicht | User, 25.11.2026 | fachlich | Anforderungen: BR-19, FL-5 · weicht ab: — |
| 4 | Terax schickt mit jeder Datei, die keine Webseite ist, eine Abschottungs-Anweisung mit, damit sie im Browser keine Skripte ausführt. Die erste Fassung dieser Frage sagte, bei PDF schalte diese Anweisung den PDF-Betrachter von Chrome ab; das ist widerlegt. Stand: in Chrome 156 gemessen (die PDF öffnet mit der Anweisung vollständig; gemessen vom Prüfer der Architektur unter Linux); Safari ab 18.4 laut den offiziellen Apple-Release-Notes zu Safari 18.4 (Eintrag 141166987, gilt für die PDF als Hauptdokument); ältere Safari zeigen die PDF leer. Wie soll Terax PDFs ausliefern? | A: mit Abschottung wie alle anderen Arten, und weiterhin nur echte PDFs (Terax prüft die ersten Bytes). Schlechter Fall: in einem Safari älter als 18.4 bleibt die PDF leer; dann Safari aktualisieren (Mac-Prüfpunkt N-8 prüft zusätzlich eingebettete PDFs) | A (User, 25.11.2026); die erste Antwort (ohne Abschottung) beruhte auf der widerlegten Begründung und gilt nicht | B: ohne Abschottung, nur echte PDFs: zeigt in jedem Browser an; der Unterschied zu A ist vor allem, dass BR-14 („alle anderen Arten abgeschottet") für PDF nicht wörtlich gilt; eine zusätzliche Sperre gegen Skripte im PDF-Betrachter durch die Anweisung ist nicht belegt (Chrome entfernt die CSP von PDF-Antworten für seinen Betrachter, Chromium security-dev 2024-09-18; Safari nicht gemessen). C: als Download: nie ein Skript, aber kein Betrachter, die PDF landet im Download-Ordner | User, 25.11.2026 | fachlich | Anforderungen: BR-12, BR-14 · weicht ab: — |
| 5 | Über Bild- und PDF-Vorschauen kommt eine Kopfzeile. Was steht darin? | Dateiname, „Open in Browser" und die Zen-Taste; auch auf der Karte „preview not available over SSH", weil dort der Browser der einzige Weg ist | A: Dateiname, Im Browser öffnen, Zen; auch über der SSH-Karte (SVC-14, MIG-9) | Nur Dateiname und Im Browser öffnen: im Zen fehlt bei Bildern der sichtbare Rückweg. Volle Zeile mit Neu laden: Neu laden gibt es für Bilder im Editor-Tab heute nicht | User, 25.11.2026 | fachlich | Anforderungen: BR-23, BR-20, BR-25 · weicht ab: — |
| 6 | Liegt eine Datei direkt in einem Ordner, der dein Home-Verzeichnis enthält (z. B. `/Users/seite.html` oder `/home/seite.html` auf dem Server), würde „Ordner und Unterordner" dein ganzes Home freigeben. Soll Terax dann nur die Datei selbst ausliefern? | Ja, wie bei Home und Dateisystem-Wurzel | A: nur die Datei (SVC-2) | Regel wörtlich: eine Seite an dieser seltenen Stelle könnte alle Dateien im Home nachladen (Geheimnis-Dateien bleiben gesperrt) | User, 25.11.2026 | fachlich | Anforderungen: BR-4 · weicht ab: BR-4 (vom User bestätigt; Nachzug in discovery.md nötig) |
| 7 | Manche gebauten Webseiten verweisen auf `/assets/app.js` (mit Schrägstrich vorn) statt auf `assets/app.js`. Weil der geheime Teil am Anfang der Adresse steht, laden solche Verweise nicht. Soll Terax sie in Welle 1 unterstützen? | Nein; Welle 1 lädt relative Verweise, wie sie KI-Berichte nutzen. Unterstützung als späterer Nachtrag | A: Nur relative Verweise (Lesart von FL-2) | Ja, über die Herkunftsangabe des Browsers: mehr gebaute Seiten laufen, dafür kann ein `../datei` eine gleichnamige Datei im Ordner selbst treffen, und die Prüfkette wird deutlich verwickelter | User, 25.11.2026 | fachlich | Anforderungen: FL-2, BR-4 · weicht ab: — |
| 8 | Klickst du für dieselbe Datei erneut auf „Im Browser öffnen": derselbe Link oder jedes Mal ein neuer? | Derselbe Link; Lesezeichen und offene Browser-Tabs bleiben gültig, Terax häuft keine Freigaben an | A: Derselbe Link je Ort und Datei (SVC-1) | Jedes Mal neu: alte Links blieben trotzdem bis zum Ende gültig, die Zahl offener Freigaben wächst mit jedem Klick | User, 25.11.2026 | fachlich | Anforderungen: TR-1, ST-2, DF-2, BR-15 · weicht ab: — |
| 9 | Terax hält höchstens 256 Browser-Links gleichzeitig offen. Was passiert beim nächsten? | Meldung „Too many browser links are open. Restart Terax to free them."; alle bestehenden Links bleiben gültig | A: Meldung, keine Verdrängung (VAL-11) | Ältester Link wird ungültig: der neue geht, aber ein offener Browser-Tab bricht ohne Hinweis (widerspricht BR-15) | User, 25.11.2026 | fachlich | Anforderungen: BR-15, EP-6 · weicht ab: — |
| 10 | Ist der SSH-Server beim Neuladen im Browser nicht erreichbar (Verbindung weg, Schlüssel mit Passphrase), was zeigt der Browser? | Eine schlichte Textseite „Terax could not read {Datei} from {Host}: {Grund}" für die Hauptdatei; fehlende Nachbardateien fehlen still wie bei jedem Webserver | A: Textseite mit Grund (`502`/`504`) | Leere Fehlerseite des Browsers ohne Grund: du siehst nicht, dass die SSH-Verbindung fehlt | User, 25.11.2026 | fachlich | Anforderungen: Lücke |
| 11 | Wie heißen Taste, Menüeintrag und Fehlermeldungen? | Taste und Menüeintrag „Open in Browser" (Symbol wie „Open in system browser" der Web-Vorschau), Menüeintrag direkt unter „Open with Default App". Meldungen: „Could not open the browser: {reason}", „{name} can't be opened in the browser: {reason}", „{name} is larger than 10 MB and can't be opened in the browser.", „Could not read {name} from {host}: {reason}", „Too many browser links are open. Restart Terax to free them.", „Open in Browser is not available for this file." | A: wie empfohlen (SVC-13, MIG-15) | „View in Browser" oder „Open in system browser": weicht vom Wortlaut der übrigen Menüeinträge („Open …") ab | User, 25.11.2026 | fachlich | Anforderungen: UI-1, UI-5, EP-6 · weicht ab: — |
| 12 | HTTP-Kern: eigene Umsetzung oder Bibliothek? | Eigener Kern auf tokio-Socket + `httparse`: keine neue Crate, nur `GET`/`HEAD` | Eigener Kern (K1) | hyper-Server: robustes HTTP, aber neue Crate `httpdate` und mehr Code im Bundle; axum, tiny_http noch schwerer | automatisch | technisch | Anforderungen: BR-1, BR-2 |
| 13 | Ein Port für alle Links oder ein Port je Link? | Port je Link: jede Freigabe hat im Browser eine eigene Herkunft, Speicher und Skripte sind getrennt | Port je Freigabe (K2) | Ein Port: weniger Sockets, aber alle Links teilen Speicher (`localStorage`) und Herkunft | automatisch | technisch | Anforderungen: BR-14, DF-2 |
| 14 | Wo steht das Geheimnis? | Erstes Pfadsegment: relative Verweise tragen es, `../` fällt heraus | Pfadsegment (K3) | Query: Nachbardateien tragen es nicht. Cookie: gilt für alle Ports von 127.0.0.1 und damit auch für fremde lokale Server | automatisch | technisch | Anforderungen: BR-3, DF-1 |
| 15 | Gilt für die Bezugsdatei das `trusted` der In-App-Vorschau? | Nein; Sperrliste und `.git` für jede Datei, auch die Bezugsdatei | Nie `trusted` (VAL-7) | Mit `trusted`: eine Datei in `.ssh` wäre per Link für jeden lokalen Prozess mit dem Link lesbar | automatisch | technisch | Anforderungen: BR-10 |
| 16 | `.git` im Ordner sperren? | Ja, wie der KI-Guard und upstream | Gesperrt (VAL-7) | Offen: Seiten-Skripte könnten Git-Konfiguration samt Token in Remote-Adressen lesen | automatisch | technisch | Anforderungen: BR-10, BR-14 |
| 17 | SSH: Prüfung vor oder nach dem Lesen? | Nach dem Lesen auf dem gemeldeten Ziel, wie `fs_read_remote_image` | Nach dem Lesen (SVC-8) | Vorher `realpath`: ein zusätzlicher SSH-Aufruf je Datei, doppelte Ladezeit | automatisch | technisch | Anforderungen: BR-11, BR-13 |
| 18 | Kopfzeilen-Matrix je Art | HTML `frame-ancestors 'self'`, Skripte ohne CSP, träge Arten `sandbox`, kein CORP/COOP, überall `nosniff`, `no-store`, `no-referrer` | wie empfohlen (SVC-6) | CORP `same-origin`: sperrt Bilder in Baustein E und in W2 (opake Herkunft); CSP an Skripten: bricht Worker | automatisch | technisch | Anforderungen: BR-6, BR-14 |
| 19 | Grenzen für Verbindungen, Kopf, Lesen, Schreiben | 16 je Freigabe, 64 gesamt; Kopf 64 KiB in 10 s (Runde 2); 8 Lesevorgänge, je SSH-Host nach Q&A 35; Schreiben 30 s; 10 MiB je Datei | wie empfohlen (SEC-12 bis SEC-16) | Ohne Grenzen: eine Seite mit 300 Bildern startet 300 SSH-Prozesse | automatisch | technisch | Anforderungen: BR-12, BR-13 |
| 20 | Bild- und PDF-Freigaben mit Ordner? | Nur die Datei; Ordner nur für HTML (ab W2 Markdown) | Nur Datei (SVC-2) | Mit Ordner: größere Fläche ohne Nutzen | automatisch | technisch | Anforderungen: BR-4, BR-9 |
| 21 | Ordner-Adressen | `index.html` des Ordners bei leerem Pfad oder Schrägstrich am Ende; Ordner ohne Schrägstrich `404`; nie eine Liste | wie empfohlen (VAL-5, VAL-8) | Liste: verrät Dateinamen; nichts: Seiten mit `href="sub/"` brechen; Weiterleitung ohne Schrägstrich auf `…/`: zusätzlicher Code für den seltenen Fall `href="sub"` | automatisch | technisch | Anforderungen: BR-4 |
| 22 | Wer öffnet den Browser? | Rust über die Rust-Seite des Openers; Webview sieht die Adresse nie; keine Capability-Änderung | wie empfohlen (SVC-11) | `openUrl` im Frontend: Adresse samt Geheimnis läge in der Webview | automatisch | technisch | Anforderungen: BR-8, BR-16 |
| 23 | Zen-Zustand | eigener Store `src/modules/zen` | wie empfohlen (API-7) | `useState` in `App.tsx` mit Props bis in jede Pane | automatisch | technisch | Anforderungen: BR-19, ST-3, ST-4 |
| 24 | Neu laden | Zähler je Pane; Raw baut den Editor neu auf, gesperrt solange ungespeichert | wie empfohlen (API-6) | Umweg über Raw wie heute: Tab-Art wechselt | automatisch | technisch | Anforderungen: BR-22, FL-4 |
| 25 | Wisch-Ausnahme über der Kopfzeile und bei leerem Hover | Attribut auf der ganzen sichtbaren HTML-Pane samt Kopfzeile; Rückfallregel SVC-17 | wie empfohlen | Nur Inhaltsbereich: Wischen über der Kopfzeile würde wechseln | automatisch | technisch | Anforderungen: BR-18, FL-7 |
| 26 | Esc-Monitor: Ereignis bei jedem Esc oder scharf schalten? | Scharf schalten per Command; kein Ereignis außerhalb von Zen über einer Vorschau | wie empfohlen (API-3) | Ereignis bei jedem Esc: eine Nachricht je Esc-Druck auch in Vim | automatisch | technisch | Anforderungen: BR-20 |
| 27 | Zen und Seitenleiste | einklappen ohne Speichern, danach vorige Breite | wie empfohlen (MIG-11) | Aushängen: Explorer verliert Zustand; Einklappen mit Speichern: Leiste bleibt nach Neustart zu | automatisch | technisch | Anforderungen: BR-19 |
| 28 | Kopfzeile im Zen auf macOS | linker Abstand für die Ampelknöpfe, Maß am Mac | wie empfohlen | ohne Abstand: Knöpfe verdecken den Dateinamen | automatisch | technisch | Anforderungen: BR-19, BR-21 |
| 29 | In-App-Vorschau über den Server (Offene Frage 1 der Discovery) | Abtrennbarer Baustein E mit eigener Nahtstelle; Entscheidung nach Messung N-23 | In W1 bauen, ohne Vorab-Messung (User, 25.11.2026); der heutige Ladeweg bleibt als Rückfall hinter einer Konstante, N-23 mit Abbruchkriterium (Abschnitt „In-App-Vorschau über den Mini-Server") | Erst messen, dann entscheiden: kein Risiko eines leeren Rahmens, aber Remote-Vorschauen blieben bis dahin ohne Bilder, Styles und Skripte aus dem Ordner | User, 25.11.2026 | fachlich | Anforderungen: BR-7, BR-24 · weicht ab: — |
| 30 | W2: wo wird Markdown gerendert? | Rust mit `pulldown-cmark`, statisch, abgeschottet | wie empfohlen (SVC-20) | Viewer-Seite mit JS: Skripte in der Herkunft der Freigabe; Übergabe aus der App: Webview-Inhalt als Server-Quelle | automatisch | technisch | Anforderungen: BR-17, FL-8 |
| 31 | Anlehnung an upstream | eigenes Modul, `asset.rs` unberührt, Namen `Grant`, `within`, `opened_path`, Cargo-Zeilen wie upstream; kein Range | wie empfohlen | `fs/assets.rs` von upstream vorziehen: großer Umbau der In-App-Medien, nicht Teil des Vorhabens | automatisch | technisch | Anforderungen: Lücke |
| 32 | Teststrategie Rust | Host-Ersatz für SSH, echter Socket für den Listener, `proptest` für Pfade | wie empfohlen | Test-Brücke im Debug-Build: läuft nur am Mac | automatisch | technisch | Anforderungen: Lücke |
| 33 | Prüfung auf Fetch-Metadaten (`Sec-Fetch-Site`) als zusätzliche Abwehr? | Nein; Safari liefert bei `iframe` und Sandbox falsche Werte | keine Prüfung | Prüfung: Safari könnte Nachbardateien der eigenen Seite abweisen | automatisch | technisch | Anforderungen: BR-14 |
| 34 | Über SSH kommt jeder Lesefehler heute nur als Text an (`ssh.rs:1490-1502`, `:1055-1064`); die Fehlertabelle braucht aber die Art (fehlt, Ordner, zu groß, Verbindung, Zeit). Typisierte Lesefunktion oder Einordnung über Texte? | Typisierte Variante `read_bytes_typed` in `ssh.rs`; der Helfer meldet bei `read_bytes` eine feste Art; `upstream/main` hat kein `ssh.rs`, also kein Sync-Konflikt | wie empfohlen (SVC-22, MIG-21) | Einordnung über Texte: kein Eingriff in `ssh.rs`, aber Transport- und Helfer-Texte sind offen, das Fehlerbild wird unscharf (z. B. eine fehlende Datei über SSH als `502` statt `404`) | automatisch | technisch | Anforderungen: BR-5, BR-12, BR-13, EP-3, EP-5 |
| 35 | Über SSH holt Terax jede Datei einer Seite einzeln vom Server. Alle Terminal-Tabs, Git und die Vorschau teilen sich dabei eine Verbindung, und der Server erlaubt darauf meist nur 10 gleichzeitige Sitzungen; mit 7 offenen Terminal-Tabs bleiben etwa 2 Plätze frei. Wie viele Dateien soll der Browser-Weg gleichzeitig holen? | A: eine nach der anderen, mit einer Wiederholung, falls der Server kurz ablehnt. Terminal-Tabs und Git werden nicht verdrängt; eine Seite mit 30 Bildern braucht geschätzt 3 bis 15 Sekunden (N-25 misst). Schlechter Fall: bei mehr als 8 offenen Tabs kann bei einem Schlüssel mit Passphrase (ohne Agent) trotzdem ein Bild fehlen | A (User, 25.11.2026); die Zahl wird am Mac gemessen (N-25) und ist danach änderbar (SEC-14) | B: zwei gleichzeitig mit Wiederholung: etwa doppelt so schnell; schlechter Fall ab 7 Tabs: ein neuer Terminal-Tab öffnet eine eigene Verbindung und fragt gegebenenfalls erneut nach der Passphrase; Bilder und Git-Aktualisierungen scheitern bei Passphrase-Schlüsseln ohne Agent. C: vier gleichzeitig wie im ersten Entwurf: rund 1 bis 4 Sekunden; derselbe schlechte Fall schon ab 5 bis 6 Tabs | User, 25.11.2026 | fachlich | Anforderungen: BR-5, BR-13 · weicht ab: — |
| 36 | Eine HTML-Seite, die du über „Open in Browser" öffnest, läuft unter der Adresse `127.0.0.1`. Betreibst du auf dem Mac andere Web-Dienste unter `127.0.0.1`, kann eine bösartige Seite deren Cookies lesen oder setzen und in deinem Namen Anfragen an sie schicken; der Browser trennt hier nicht nach Port. Dienste unter `localhost`, auch die Port-Freigaben von Terax: deren Cookies kann die Seite weder lesen noch setzen, Anfragen an sie schicken kann sie aber wie jede Webseite, in Chrome sogar ohne die Nachfrage, die eine Internet-Seite bekäme. Wie soll Terax damit umgehen? | A: so lassen, Restrisiko benennen: Seiten können alles, was eine Webseite kann (Speicher, Nachladen), wie im Kontrolltest mit der Messseite. Schlechter Fall: eine untergeschobene HTML-Datei stiehlt die Anmeldung eines Dienstes, den du unter `127.0.0.1` nutzt | A (User, 25.11.2026); Sicherheitsmodell 24 | B (verworfen): Seite in anonymer Herkunft ausliefern: Cookies anderer Dienste kann sie weder lesen noch setzen (der Browser wirft einen Fehler), Anfragen an sie gelten nie als same-site, Cookies ohne `SameSite`-Schutz gingen aber weiter mit; die Seite kann sich nichts merken; damit Skripte Nachbardateien per `fetch` laden, müsste Terax jedem Dokument mit anonymer Herkunft das Lesen erlauben, auch dem einer fremden Seite, dann schützt nur noch das Geheimnis; ohne diese Erlaubnis laden nur Bilder, Styles und klassische Skripte. C (verworfen): eigener Name je Link (`zufall.localhost`) statt `127.0.0.1`: in Chrome und Firefox getrennt; Safari löst solche Namen erst ab macOS 26 verlässlich auf, davor öffnet der Link dort oft gar nicht; weicht von „Adresse 127.0.0.1" ab | User, 25.11.2026 | fachlich | Anforderungen: BR-14, DF-1 · weicht ab: — |

---

## Änderungen Runde 2

> No requirement IDs — context

| Punkt | Inhalt | Geänderte Stellen (Abschnitt + Kennung) |
|-------|--------|------------------------------------------|
| A, Q&A 1, 3, 5, 7 bis 11 | Antworten des Users (25.11.2026, jeweils A) übernommen | Q&A Log Zeilen 1, 3, 5, 7, 8, 9, 10, 11 (Answer, Mode) |
| A, Q&A 2 | Esc nur in Vorschauen; Abweichung vom User bestätigt, zusätzlich FL-6 und ST-4 als abweichend benannt | Q&A Log Zeile 2; Zuordnung BR-20, FL-6, ST-4, TR-4 |
| A, Q&A 6 | Datei oberhalb des Home allein; Abweichung von BR-4 vom User bestätigt | Q&A Log Zeile 6 |
| A, Q&A 4 | Antwort gilt nicht (widerlegte Grundlage); Frage neu formuliert (Antwort in Runde 3) | Q&A Log Zeile 4; Open Questions 2 |
| B, R-1 | Typisierte SSH-Lesefunktion statt Text-Einordnung | Kernentscheidungen K7; Server Logic SVC-8, neu SVC-22; VAL-5, VAL-8; Error Handling Strategy; Nahtstellen (Typ `RemoteReadError`, `ssh.rs` aus „Unverändert, bewusst" entfernt); Migration Map neu MIG-21; Zuordnung BR-5, BR-13; Prüfbarkeit K7; Q&A Log Zeile 34; Research Log |
| B, RT-1 | Sitzungsbudget hergeleitet; Empfehlung 1 Lesevorgang je Host mit einer Wiederholung, dem User vorgelegt | Kernentscheidungen K7; SEC-14; SVC-8; Constraints (SSH-Zeile); NFR-3; Risks (SSH-Zeile); Sicherheitsmodell 18; Prüfbarkeit K7; Mac-Prüfpunkt neu N-25; Open Questions 4; Q&A Log Zeilen 19, 35; Zuordnung BR-13 |
| B, RT-2 | Neue Bedrohung „andere lokale Dienste unter 127.0.0.1"; Weiche mit drei Optionen dem User vorgelegt | Sicherheitsmodell neu 24, 13; Kernentscheidungen K2; Trade-offs (Port je Freigabe); Mac-Prüfpunkt neu N-26; Open Questions 5; Q&A Log Zeile 36; Zuordnung BR-14; Research Log |
| B, RT-3 | Falsche Aussage zum PDF-Betrachter an allen Fundstellen berichtigt; Empfehlung neu: PDF mit `sandbox` | Kernentscheidungen K8; DTOs (Kopfzeilen-Tabelle, Zeile PDF); Assumptions (PDF-Zeile); Trade-offs (PDF-Zeile); Prüfbarkeit (N-8-Schritt erweitert um `target="_blank"` und Einbettung); Open Questions 2; Research Log (PDF-Zeile berichtigt); Q&A Log Zeile 4; Zuordnung BR-14 |
| C, F-1 | Rahmen auch für Web-Vorschau, Git-Diff, KI-Diff im Zen weg | Migration Map neu MIG-17, MIG-18, MIG-19; Zuordnung BR-19 |
| C, F-2 | Einklappen im Zen über `useSidebarPanel.ts` ohne Speichern; INV-13 neu belegt | Migration Map neu MIG-20, MIG-11; Existing-Behavior Invariants INV-13 und Hinweis darunter; Constraints (Seitenleiste) |
| C, F-3 und RT-5 | Nur leere Segmente in der Mitte abweisen; Schrägstrich am Ende oder leerer Pfad = Ordner; Ordner ohne Schrägstrich `404` | VAL-5, VAL-8; API-2; Error Handling Strategy; Q&A Log Zeile 21 |
| C, F-4 | PDF-Sweep mechanisch anwendbar | Migration Map, Sweep criterion |
| C, F-5 | `PreviewHeader` rendert `DocViewToggle` selbst | Nahtstellen, Neue Dateien (Bereich D); Sweep criterion |
| C, F-6 | Guard-Muster prüft auch den Modulpfad | Sicherheitsmodell 20; Nahtstellen, Neue Dateien (Bereich C, Guard-Test) |
| C, F-7 | Zustände `idle`/`loading` der Neu-laden-Taste je Fläche | API-6; Zuordnung UI-3 |
| C, F-8 | `Serialize` und `rename_all` an `FrameSource`/`FrameStatus` | Nahtstellen, Typen an der Grenze |
| C, F-9 | Datei-Symlink-Test in INV-5 | Existing-Behavior Invariants INV-5 |
| C, RT-4 | Host-Prüfung je Freigabe-Klasse; Verhalten bei belegtem `[::1]`-Port | VAL-1; Sicherheitsmodell 5; In-App-Vorschau, Schnitt (Adresse) |
| C, RT-6 | Kopf-Grenze 64 KiB, `Cookie` nie ausgewertet | SEC-13; Sicherheitsmodell 18; Q&A Log Zeile 19 |
| C, RT-7 | Restrisiko „Seite lockert `no-referrer`" benannt | Sicherheitsmodell 11 |
| C, RT-8 | Herkunft getrennt nur innerhalb eines Laufs; Port-Wiederkehr als Restrisiko | Kernentscheidungen K2; Sicherheitsmodell 13; Trade-offs (Port je Freigabe) |
| C, RT-9 | Messung M-C mit den echten `frame`-Kopfzeilen und verschachteltem `iframe` | In-App-Vorschau, Entscheidungskriterium (M-C, Ergebniszeile); Mac-Prüfpunkt N-23 |
| C, RT-10 | `pulldown-cmark` ohne Standard-Features | Integrations (W2-Zeile); Welle 2 (Bundle) |

---

## Änderungen Runde 3

> No requirement IDs — context

| Punkt | Inhalt | Geänderte Stellen (Abschnitt + Kennung) |
|-------|--------|------------------------------------------|
| A, Q&A 4 | PDF mit Abschottung, nur echte PDFs (User, 25.11.2026) | Q&A Log Zeile 4; Kernentscheidungen K8; DTOs (Kopfzeilen-Tabelle, Zeile PDF); Trade-offs (PDF-Zeile); Assumptions (PDF-Zeile); Open Questions (Zeile entfernt) |
| A, Q&A 35 | Ein Lesevorgang je Host, eine Wiederholung; Zahl nach N-25 änderbar (User, 25.11.2026) | SEC-14; Q&A Log Zeile 35; Open Questions (Zeile entfernt) |
| A, Q&A 36 | So lassen, Restrisiko benannt (User, 25.11.2026) | Sicherheitsmodell 24; Q&A Log Zeile 36; Mac-Prüfpunkt N-26 (entfällt); Open Questions (Zeile entfernt) |
| A, Baustein E | In Welle 1, ohne Vorab-Messung; heutiger Ladeweg bleibt als Rückfall hinter einer Konstante; Abbruchkriterium nach M-C; BR-24 gilt wörtlich weiter | Status-Zeile „Stand"; Scope & Boundaries (In Scope); Kernentscheidungen K16; API-8; SVC-19; Nahtstellen („Unverändert, bewusst": `asset.rs`; Neue Dateien A und G); Migration Map MIG-3, MIG-6; Risks (Browser-Zeile); In-App-Vorschau über den Mini-Server (Einleitung, Schnitt mit neuer Zeile „Wenn der Rahmen nicht lädt", „Mac-Prüfung und Abbruchkriterium", Folgen FS-6/BR-24); Prüfbarkeit K16, N-1 bis N-15, N-23; Open Questions (Zeile entfernt); Zuordnung (Hinweis, BR-7, BR-24); Q&A Log Zeile 29 |
| A, Prototyp | Kein Dokumentbezug nötig; kein Abschnitt verweist auf einen Clickdummy | – |
| B, RT-D1 | Option B (anonyme Herkunft) sachlich berichtigt und als verworfen geführt: `Access-Control-Allow-Origin: null` lässt jedes Dokument mit `null`-Herkunft lesen, `document.cookie` wirft `SecurityError`, Cookies ohne `SameSite`-Schutz gingen weiter mit | Sicherheitsmodell 24; Q&A Log Zeile 36; Mac-Prüfpunkt N-26 (entfällt) |
| C, RT-D2 | Eingrenzung zu `localhost`-Diensten: keine Cookie-Rechte, keine same-site-Anfragen, aber cross-site Anfragen wie jede Webseite, in Chrome ohne LNA-Nachfrage | Sicherheitsmodell 24; Q&A Log Zeile 36 |
| C, RT-D3 | Fehlerbild einer wegen `MaxSessions` verweigerten Sitzung nach OpenSSH berichtigt; was die Wiederholung leistet; „Terminal-Tab startet nicht" ersetzt | SEC-14; Error Handling Strategy (SSH-Zeile); Q&A Log Zeile 35 |
| C, RT-D7 | Eingebundene Skripte geben ihre Wirkung an die einbindende Seite preis | Sicherheitsmodell 11 |
| C, RT-D9 | WebKit-Bug 160504: behoben ab macOS 26 | Research Log (Safari-`*.localhost`-Zeile); Sicherheitsmodell 24; Q&A Log Zeile 36 |
| C, RT-D10 | Safari-18.4-Beleg auf die offiziellen Apple-Release-Notes (141166987) umgestellt | Assumptions (PDF-Zeile); Research Log (PDF-Zeile); Q&A Log Zeile 4 |
| C, RT-D11 | Zusätzliche Sperre im PDF-Betrachter als unbelegt gekennzeichnet | Q&A Log Zeile 4 (Option B) |
| C, D-1 | `Killed` zu `Failed`: `502`, beim Klick `unreachable`, ohne Wiederholung | SVC-8; SVC-22; Error Handling Strategy (SSH-Zeile) |
| C, D-2 | Lesestelle der festen Art: `read_bytes_typed` wertet den Umschlag selbst aus; `helper_answer`, `RemoteError` und die Kopier-Muster bleiben unverändert | SVC-22; MIG-21 |
| C, D-3 | INV-13 um die zwei Tests mit Pausier-Bezug ergänzt | Existing-Behavior Invariants INV-13 |
| C, D-4 | SSH-Leseweg einheitlich `ssh::read_bytes_typed` | Architecture Layers (Data Flow); Integrations (SSH-Zeile) |
