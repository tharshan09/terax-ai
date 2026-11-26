# Gate 1 — Architecture Compliance, Perspektive `runtime`

| Feld | Wert |
|------|------|
| Geprüft | `specs/2026-11-25-html-preview-browser/architecture.md` (895 Zeilen), gegen `discovery.md`; Zusatz-Kontext `dossier-vorschau.md` |
| Codebase | `/home/claude/litha/produkte/terax/terax-ai`, Branch `main`, SHA `cf07327` (nur gelesen) |
| Prüfdatum | 2026-11-25 |
| Perspektive | `runtime`: Abhängigkeits-Versionen und deren Quelltext/Doku, Konfiguration, Browser- und WebKit-Verhalten, HTTP-Semantik, sshd-Grenzen, Tauri-Verhalten |
| Lauf | offen (kein Delta-Lauf) |
| Eingaben ohne Datei | kein `clickdummy/`, kein `codebase-scan.md`, keine `bindings.md` |
| Messmittel | Lesen von Code, `Cargo.toml`, `Cargo.lock`, `git show upstream/main:…`; Quelltext und Doku der Abhängigkeiten über docs.rs; RFC 6265, 9110, 9112 (Volltext geladen); W3C Referrer Policy; WHATWG HTML; Chrome-Blog LNA; OSV-Abfrage je Crate-Version. Nichts gebaut, gestartet oder installiert |

## Skript-Tabelle (Arch-Precheck, übernommen)

Quelle: `gates/arch-precheck.json`, `result: PASS`, 0 Befunde. Nicht erneut geprüft (P5).

| ID | Prüfung | Status | Detail |
|----|---------|--------|--------|
| AR-1 | ID-Marker architecture.md | PASS | 26 h2 konform |
| AR-1d | ID-Marker discovery.md | PASS | konform |
| AR-2 | ID-Existenz | PASS | 94 definierte IDs, 158 referenziert |
| AR-3 | Anker pfad:zeile | PASS | 42 Anker aufgelöst |
| AR-4 | Invarianten-Zeilen | PASS | 13 INV-Zeilen mit gültigen Enums |
| AR-5 | Testnamen | PASS | 12 Testnamen in ihren Dateien gefunden |
| AR-6 | Versionen | PASS | 15 Zeilen mit Version |
| AR-7 | Scan-Plausibilität | SKIP | kein codebase-scan.md |
| AR-8 | Anti-Slop-Dispositionen | PASS | 0 Dispositionen formal vollständig |
| AR-9 | Bindings-Exceptions | SKIP | keine bindings.md |
| AR-10 | Migration Map | PASS | 16 MIG-Zeilen mit Dateipfad |
| AR-11 | Automatische Entscheide | PASS | 0 Assumptions „automatisch — zur PM-Durchsicht" |
| AR-12 | Register | PASS | kein neuer Fachbereich |
| AR-13 | Anker-Inhalt | PASS | 3 Bezeichner in ihren Ankerzeilen gefunden |
| AR-Q | Q&A Anforderungen | PASS | 11 automatische fachliche Entscheidung(en) mit Anforderungsbezug |

## Summary

| Klasse | Anzahl | IDs |
|--------|--------|-----|
| `decision` | 2 | RT-1, RT-2 |
| `refuted` | 1 | RT-3 |
| `fix` | 7 | RT-4 bis RT-10 |
| `obligation` | 9 | RT-11 bis RT-19 |
| `note` | 9 | RT-20 bis RT-28 |

Prüfmenge: 75 Behauptungen und Check-Items der Perspektive erhoben, 60 gemessen, 15 nicht gemessen (Gründe in „Bestands-Behauptungen"). Self-Check: 60 + 15 = 75.

Nicht erneut gemeldet (liegen dem User als fachliche Weichen vor): Esc nur in Vorschau-Tabs (Q&A 2), PDF ohne `sandbox` als Wahl (Q&A 4), BR-4 enger oberhalb des Home (Q&A 6). Geprüft wurde nur die sachliche Begründung zu Q&A 4 (RT-3).

**Verdict:** FAILED (2 × `decision`, 1 × `refuted`)

---

## Check A — Feature Mapping (Server-Anforderungen mit Laufzeitbezug)

| Item | Evidenz | Status |
|------|---------|--------|
| BR-1 nur 127.0.0.1 | SEC-4 (Z. 233), VAL-1 (Z. 210); bei Baustein-E-Fallback widersprüchlich (RT-4) | adressiert, Kohärenz-Lücke RT-4 |
| BR-2 Zufallsport | SEC-4 `127.0.0.1:0` | adressiert (Zufälligkeit am Mac nicht gemessen, C-72) |
| BR-3 Geheimnis | SEC-1, VAL-4, SVC-10; `getrandom::fill` 32 Byte | adressiert, gemessen |
| BR-6 Neuladen aktuell | jede Anfrage liest neu, `no-store` | adressiert (Wirkung Mac N-3) |
| BR-12 10 MB | VAL-8, SEC-16; SSH-Helfer begrenzt vor dem Senden (`ssh.rs:403-409`) | adressiert; Fehler-Abbildung über SSH offen (RT-17) |
| BR-13 heutiger SSH-Leseweg | SVC-8 → `ssh::read_bytes` (`ssh.rs:1490-1502`) | adressiert; Sitzungsbudget RT-1, Zeitbudget RT-16 |
| BR-14 Skripte nur im eigenen Bereich | Port je Freigabe, Geheimnis je Listener | adressiert innerhalb eines Laufs; Lücken RT-2 (andere 127.0.0.1-Dienste), RT-8 (Port-Wiederkehr) |
| BR-15 Link bis Prozessende | SVC-1, SEC-1 | adressiert (Mac N-18) |
| FL-2 Nachbardateien laden | API-2, SVC-4 | adressiert; Laufzeit-Lücken RT-5 (`sub/`), RT-11 (Query) |
| EP-2 keine Verbindung über andere Adresse | Bindung an 127.0.0.1 | adressiert (Mac N-16) |
| EP-5 > 10 MB | VAL-8 | adressiert |

## Check B — Constraint Mapping

| Constraint (Discovery) | Architektur-Antwort | Evidenz | Status |
|------------------------|---------------------|---------|--------|
| 10 MB je Datei, lokal und SSH | VAL-8, SEC-16 | `file.rs:16` `MAX_READ_BYTES = 10 * 1024 * 1024`; Helfer `ssh.rs:403-409` | PASS |
| SSH-Antwort ≤ 16 MiB | implizit | `ssh.rs:877` 16 MiB ≥ Base64(10 MiB) = 13 981 016 Byte + JSON | PASS |
| SSH-Zeitbudget 30 s + 1 s je 64 KiB | SEC-16 „wie `read_bytes_timeout`" | `ssh.rs:897-909`, `:1506-1509`: ohne bekannte Größe 244 s je Datei | PASS mit Auflage RT-16 |
| sshd `MaxSessions` | SEC-14: 4 je Host | `sshd_config(5)`: Default 10 je Verbindung, geteilt mit Terminals, Git, Halte-Sitzung | FAIL → RT-1 |
| Viele Nachbardateien | SEC-12 bis SEC-14 | — | PASS (Wert RT-6, RT-1) |
| Kein Range (BR-13) | Video/Audio Out of Scope; Server ignoriert `Range` | RFC 9110 Z. 6476 „A server MAY ignore the Range header field." | PASS |
| Kopf-Grenze | SEC-13 8 KiB | RFC 6265 §6.1, §8.5: Cookies aller 127.0.0.1-Ports gehen mit | FAIL → RT-6 (`fix`) |

## Check C — Realistic Data

C1/C3 (Datenbank, Schema): N/A — keine Datenbank (Architektur „Database Schema").
C2 (externe Schnittstellen): gemessen für die HTTP-Anfrage des Browsers und die SSH-Antwort, siehe „Data Type Verdicts".

## Check D — Completeness + Dependencies

### Abhängigkeiten

| Library | Arch-Version | Cargo.toml | Cargo.lock | Neueste / Hinweise | Zugeschriebene Fähigkeit | Status |
|---------|--------------|------------|------------|--------------------|--------------------------|--------|
| tokio | 1.54.1, + `net`, `io-util`, `sync` | `Cargo.toml:50` `features = ["rt", "time"]` | `Cargo.lock:4895-4896` 1.54.1; Abh. `bytes`, `libc`, `mio`, `socket2`, `tokio-macros`, `windows-sys` (`:4898-4906`) | OSV: keine Einträge für 1.54.1 | tokio 1.54.1 `Cargo.toml.orig`: `net = ["libc","mio/…","socket2","windows-sys/…"]`, `io-util = ["bytes"]`, `sync = []` → keine neue Crate | PASS |
| httparse | 1.10.1 | transitiv | `Cargo.lock:1780-1781` | OSV: keine Einträge | `Error::TooManyHeaders` „Parsed more headers than provided buffer can contain." (docs.rs) | PASS, Auflage RT-14 |
| getrandom | 0.4 / 0.4.3 | transitiv | `Cargo.lock:1483-1484` (daneben 0.2.17, 0.3.4) | OSV: keine | docs.rs 0.4.3: `getrandom::fill(&mut buf)?`; macOS `getentropy`, Linux `getrandom`-Syscall, Windows 10+ `ProcessPrng` | PASS |
| percent-encoding | 2.3.2 | transitiv | `Cargo.lock:3020-3021` | OSV: keine | Funktionsnamen nicht nachgelesen (C-12) | PASS (Version) |
| tauri-plugin-opener | 2.7.2 | `~2.7` (`Cargo.toml:23`) | `Cargo.lock:4563-4564` | OSV: keine | `open_url<P: AsRef<str>, S: AsRef<str>>(url: P, with: Option<S>)` ruft `::open::that_detached`; keine Scope-Prüfung in der Rust-Funktion (docs.rs `src/open.rs`) | PASS, Hinweis RT-20 |
| open | (transitiv) | – | `Cargo.lock:2913-2914` 5.4.5 | OSV: keine | macOS: `/usr/bin/open -- <url>` (docs.rs `src/macos.rs`) | Hinweis RT-21 |
| tauri | 2.12.5 | `~2.12` | `Cargo.lock:4376-4377` | „neueste 2.12.6" nicht nachgeprüft (C-18) | `async_runtime::spawn`, `spawn_blocking` vorhanden; globale Laufzeit `TokioRuntime::new()` (docs.rs `src/async_runtime.rs`) | PASS |
| hyper (verworfen) | 1.12.0 | transitiv | `Cargo.lock:1786-1802` ohne `httpdate` | – | Server-Teil nicht im Build | PASS |
| pulldown-cmark (W2) | 0.13.x | – | nicht im Lock | 0.13.6; `default = ["getopts", "html"]`; Abh. `bitflags`, `unicase`, `memchr`, optional `getopts`, `pulldown-cmark-escape` | `Html`/`InlineHtml` werden roh geschrieben | FAIL → RT-10 (`fix`), Auflage RT-18 |
| objc2-app-kit | 0.3, Feature `NSEvent` | `Cargo.toml:67` | – | – | lokaler Monitor | PASS |
| libc | 0.2 | `Cargo.toml:58-59` | – | – | `fcntl(F_GETPATH)` | PASS |

### Zeitgrenzen, Fehlerbehandlung, Größen je externer Abhängigkeit

| Abhängigkeit | Zeitgrenze | Fehlerbehandlung | Größe | Status |
|--------------|-----------|------------------|-------|--------|
| Browser (Anfrage lesen) | SEC-13 10 s | 400/431/405/421 | 8 KiB | Wert zu klein (RT-6); 405 ohne `Allow`, Host-Fehler nicht RFC-konform (RT-14) |
| Browser (Antwort schreiben) | SEC-15 30 s | Verbindung zu | 10 MiB | PASS; Abbau ohne Halbschluss (RT-15) |
| Warteschlange vor Lesevorgängen | keine | „der Browser wartet" (SEC-14) | 8 / 4 je Host | Auflage RT-16 |
| sshd | `read_bytes_timeout`: 244 s ohne bekannte Größe | Transport → 502, Zeit → 504; Helfer-Fehler (zu groß, kein reguläres File, fehlt) nicht abgebildet | 10 MiB je Datei, 16 MiB je Antwort | Auflagen RT-16, RT-17; Sitzungsbudget RT-1 |
| Lokales Dateisystem | keine (Blocking-Thread) | Prüfkette VAL-5 bis VAL-9 | 10 MiB | PASS |

## Check F — Migration Completeness (nur Konfiguration)

| Item | Evidenz | Status |
|------|---------|--------|
| MIG-1 `src-tauri/Cargo.toml` W1: tokio-Features + drei direkte Einträge, keine neue Crate | Lock-Einträge siehe Check D; tokio-Features ziehen nur `bytes`, `libc`, `mio`, `socket2`, `windows-sys`, alle in `Cargo.lock:4898-4906` | PASS |
| `src-tauri/tauri.conf.json` unverändert | `tauri.conf.json:28` `frame-src 'self' http: https: asset: https://asset.localhost` deckt `http://127.0.0.1:*` | PASS |
| `src-tauri/capabilities/default.json` unverändert | Rust-`open_url` ohne Scope-Prüfung (docs.rs); `grep '"remote"' capabilities/*.json` ohne Treffer | PASS |
| W2-Zeile `Cargo.toml` „drei kleine Crates" | pulldown-cmark-Defaults ziehen `getopts` mit | FAIL → RT-10 |

## Check E, E2, E3

| Check | Status |
|-------|--------|
| E Pattern Consistency | N/A — kein `codebase-scan.md` |
| E2 Bindings Coverage | N/A — keine `bindings.md` und kein `reconcile_path` |
| E3 Existing-Behavior Invariants | N/A — kein `codebase-scan.md` (INV-Zeilen gehören zur Perspektive `code`) |

## Data Type Verdicts

| Feld | Arch-Typ / Grenze | Evidenz | Verdict |
|------|-------------------|---------|---------|
| Geheimnis | 32 Byte → 64 Hex-Zeichen | `getrandom::fill`, Betriebssystem-Quelle je Plattform | OK (256 Bit) |
| `Host`-Kopf | genau `127.0.0.1:{port}` | Browser setzt die URL-Autorität; bei Fallback `localhost` widersprüchlich | OK für W1; RT-4 für Baustein E |
| Anfragekopf gesamt | 8 KiB | RFC 6265 Z. 1471-1476: Browser müssen ≥ 4096 Byte je Cookie und ≥ 50 Cookies je Domain tragen; Z. 1751: keine Trennung nach Port | ZU KLEIN → RT-6 |
| Zahl der Kopfzeilen | nicht festgelegt | `httparse::Error::TooManyHeaders` | Auflage RT-14 |
| Request-Target | `/{token}/{relpath}` | RFC 9112 Z. 454: `origin-form = absolute-path [ "?" query ]` | Query nicht behandelt → RT-11 |
| Eintrittsname | „prozentkodiert" | Zeichensatz offen (`#`, `?`, `%`) | Auflage RT-13 |
| Port | u16 vom Betriebssystem | – | OK |
| Datei lokal/SSH | ≤ 10 MiB | `file.rs:16`, `ssh.rs:403-409` | OK |
| SSH-Antwort | ≤ 16 MiB | `ssh.rs:877`; Base64 von 10 MiB = 13 981 016 Byte | OK |
| `Grant.entry` | Text ohne Längengrenze | nur im Speicher | OK |

## Bestands-Behauptungen und Check-Items (Prüfmenge `runtime`)

| # | Behauptung (Stelle in architecture.md) | Beleg | Verdikt |
|---|----------------------------------------|-------|---------|
| C-01 | tokio 1.54.1 im Lock (Z. 521, 424) | `Cargo.lock:4895-4896` | bestätigt |
| C-02 | tokio direkt nur `rt`, `time` (Z. 424) | `Cargo.toml:50` | bestätigt |
| C-03 | `net`, `io-util`, `sync` bringen keine neue Crate (Z. 424) | tokio `Cargo.toml.orig` Features; `Cargo.lock:4898-4906` | bestätigt |
| C-04 | `TcpListener`, `timeout`, `Semaphore` über diese Features (Z. 521) | tokio-Features `net`, `time`, `sync` | bestätigt |
| C-05 | Listener laufen auf `tauri::async_runtime` mit IO-Treiber (Z. 163) | tauri: `TokioRuntime::new()`; ob `new()` alle Treiber aktiviert, nicht nachgelesen | NICHT GEMESSEN — tokio-Doku zu `Runtime::new` nicht abgerufen |
| C-06 | tokio-Netz schon im Build (Z. 720, 838) | `socket2` hängt nur an tokio-`net`; normale Abh. `reqwest` → `hyper-util` (`Cargo.lock:1825-1842`) | bestätigt |
| C-07 | httparse 1.10.1 (Z. 522) | `Cargo.lock:1780-1781` | bestätigt |
| C-08 | `Request::parse` trägt das Kopf-Lesen (SVC-3) | docs.rs `httparse::Error` (7 Varianten inkl. `TooManyHeaders`) | bestätigt, Auflage RT-14 |
| C-09 | getrandom 0.4.3 (Z. 523) | `Cargo.lock:1483-1484` | bestätigt |
| C-10 | `fill`, 256 Bit aus dem Betriebssystem (SVC-10, SEC-1) | docs.rs getrandom 0.4.3 (Beispiel `getrandom::fill(&mut buf)?`, Backend-Tabelle) | bestätigt |
| C-11 | percent-encoding 2.3.2 (Z. 524) | `Cargo.lock:3020-3021` | bestätigt |
| C-12 | `percent_decode_str`, `utf8_percent_encode` (Z. 524) | – | NICHT GEMESSEN — API-Seite nicht abgerufen |
| C-13 | Check-Item: keine Sicherheitshinweise für die Versionen | OSV-API je Crate+Version (tokio, httparse, getrandom, percent-encoding, tauri-plugin-opener, tauri, pulldown-cmark 0.13.6, open 5.4.5): `[]` | bestätigt |
| C-14 | tauri-plugin-opener 2.7.2 (Z. 525) | `Cargo.lock:4563-4564` | bestätigt |
| C-15 | Rust-Seite des Openers ohne Capability-Änderung (K9, Z. 360) | docs.rs `open.rs`: `open_url` → `open` → `::open::that_detached`, keine Scope-Prüfung; `chrome.rs:68-72` | bestätigt |
| C-16 | Aufruf `open_url(url, None)` (SVC-11) | Signatur generisch über `S`; Doku-Beispiel `None::<&str>` | widerlegt (gering) → RT-20 |
| C-17 | tauri 2.12.5 (Z. 526) | `Cargo.lock:4376-4377` | bestätigt |
| C-18 | „neueste 2.12.6 vom 2026-11-16" (Z. 526) | – | NICHT GEMESSEN — ohne Bezug zum Entwurf, nicht abgerufen |
| C-19 | hyper-Server aus, kein `httpdate` (Z. 602) | `Cargo.lock:1786-1802` | bestätigt |
| C-20 | W2: drei neue Crates (Z. 535, 636) | pulldown-cmark 0.13.6 `default = ["getopts", "html"]`; `getopts` nicht im Lock | widerlegt → RT-10 |
| C-21 | W2: rohes HTML als Text (SVC-20, Z. 637) | pulldown-cmark `html.rs`: `Html(html) \| InlineHtml(html) => { self.write(&html)?; }` | gilt nur mit eigener Umsetzung → RT-18 |
| C-22 | pulldown-cmark 0.13.x (Z. 535) | docs.rs: 0.13.6 | bestätigt → RT-28 |
| C-23 | `NSEvent`-Feature aktiv (Z. 532) | `Cargo.toml:67` | bestätigt |
| C-24 | libc 0.2 (Z. 533) | `Cargo.toml:58-59` | bestätigt |
| C-25 | Opener aus Rust umgeht den Webview-Scope (Z. 360) | `chrome.rs:68-70` Kommentar + Quelltext C-15 | bestätigt |
| C-26 | Adresse nur in Rust, „Webview sieht sie nie" (SEC-8) | stimmt; die Adresse steht aber in der Argumentliste von `/usr/bin/open` (open 5.4.5 `macos.rs`) | bestätigt, Hinweis RT-21 |
| C-27 | App-CSP deckt Baustein E (Z. 361, 687) | `tauri.conf.json:28` `frame-src … http:` | bestätigt |
| C-28 | Capabilities ohne `remote` (Bedrohung 21) | `grep '"remote"'` ohne Treffer | bestätigt |
| C-29 | Exit-Pfad `lib.rs:502-508` unverändert (MIG-3) | `lib.rs:502-508` `RunEvent::Exit` → `ssh::disconnect_all()` | bestätigt |
| C-30 | Betriebssystem schließt Sockets nach Absturz (SEC-1) | – | NICHT GEMESSEN — nur am Mac (N-18) |
| C-31 | SSH-Leser löst auf, nur reguläre Dateien, `O_NOFOLLOW`, Grenze vor dem Senden (Z. 840) | `ssh.rs:394-412` | bestätigt |
| C-32 | Home über SSH per `realpath(host, "~")` (SVC-2) | `ssh.rs:371-374` `os.path.realpath(os.path.expanduser(…))` | bestätigt |
| C-33 | SSH-Zeitbudget je Datei (SEC-16) | `ssh.rs:897-909`, `:1506-1509`: mit `expected_size = None` (SVC-8) 30 s + 214 × 1 s = 244 s | gemessen → RT-16 |
| C-34 | 4 je Host halten `MaxSessions` ein (SEC-14) | sshd_config(5); `pty/shell_init.rs:153`, `git/process.rs:345`, `ports.rs:167-186`, `ssh.rs:1161` teilen den Master | widerlegt → RT-1 |
| C-35 | Check-Item: SSH-Antwortgrenze reicht für 10 MiB | `ssh.rs:877` | bestätigt |
| C-36 | Pfad nie in der Shell, JSON über stdin (SEC-11) | `ssh.rs:1153`, `:1182-1184` (Request-JSON über `stdin.write_all`) | bestätigt |
| C-37 | SSH-Fehler: Transport → `unreachable`/502, Zeit → 504 (SVC-8) | Helfer wirft `ValueError` für „too large"/„not a regular file" (`ssh.rs:401-411`) — nicht abgebildet | Lücke → RT-17 |
| C-38 | Host-Prüfung wehrt DNS-Rebinding ab (Bedrohung 5) | Browser setzt `Host` aus der URL-Autorität (RFC 9112 §3.2); Rebinding-Seite sendet ihren Namen | bestätigt |
| C-39 | Fehlender Host → 421 (VAL-1) | RFC 9112 Z. 445: „MUST respond with a 400" | widerlegt (gering) → RT-14 |
| C-40 | Baustein-E-Fallback `localhost` + `[::1]` (Z. 658) | VAL-1 (Z. 210) weist `localhost` ab | widersprüchlich → RT-4 |
| C-41 | Vergleich ohne frühen Abbruch (SVC-10) | Entwurf; 64 Zeichen fester Länge | bestätigt (Entwurfsebene) |
| C-42 | `no-referrer` schützt das Geheimnis (Bedrohung 11) | Referrer Policy §4, §11.1, §3.8 | eingeschränkt → RT-7 |
| C-43 | Geheimnis im Verlauf als Restrisiko (Bedrohung 11) | benannt | bestätigt |
| C-44 | Anderes Benutzerkonto sieht das Geheimnis nicht (Bedrohung 2) | getargv-README: Argumente nur für Prozesse desselben Users „by default" | bestätigt |
| C-45 | Port je Link trennt Speicher und Skripte (K2, Z. 615) | WHATWG HTML: same origin vergleicht Port | innerhalb eines Laufs bestätigt; über Läufe → RT-8 |
| C-46 | Cookie-Restrisiko nur zwischen Links (Bedrohung 13) | RFC 6265 Z. 1751; WHATWG HTML same site ignoriert Port | unvollständig → RT-2 |
| C-47 | Loopback-Seiten lösen kein LNA aus (Z. 534, 849) | Chrome-Blog: Umfang „public network to local or loopback", Unterressourcen und Subframes; Prompt ab Chrome 142 | bestätigt, Hinweis RT-27 |
| C-48 | Fremde Seite ohne Geheimnis bekommt nichts (Bedrohung 4) | leere `404` unabhängig von CORS | bestätigt |
| C-49 | Safari: falsche `Sec-Fetch-Site`-Werte (Q&A 33) | – | NICHT GEMESSEN — WebKit-Bugs nicht abgerufen |
| C-50 | `nosniff` + `sandbox` schotten träge Arten ab (K8) | – | NICHT GEMESSEN — Mac N-17 |
| C-51 | SVG mit Skript führt nichts aus (Bedrohung 15) | – | NICHT GEMESSEN — Mac N-17 |
| C-52 | Chrome-PDF-Betrachter bleibt mit `sandbox` leer (Q&A 4, Z. 129, 846, 865) | crbug 1187122 „fixed in Chrome 91"; Safari 18.4 „Fixed main frame PDFs served with a CSP sandbox header not loading" | widerlegt → RT-3 |
| C-53 | `frame-ancestors 'self'` sperrt fremde Einbettung (Bedrohung 17) | – | NICHT GEMESSEN — Spezifikation nicht abgerufen; `cargo test` prüft nur den Kopf |
| C-54 | `frame-ancestors` mit App-Herkünften für Klasse `frame` (Z. 131, 657) | M-B (Z. 665) nutzt `python3 -m http.server` ohne diese Kopfzeile | ungeprüft im Kriterium → RT-9 |
| C-55 | Keine CSP an Skripten wegen Worker (Z. 126) | – | NICHT GEMESSEN — CSP3 nicht abgerufen |
| C-56 | `no-store` → Neuladen zeigt neuen Stand (NFR-5) | – | NICHT GEMESSEN — Mac N-3 |
| C-57 | Kein Range genügt (Z. 620) | RFC 9110 Z. 6476 | bestätigt |
| C-58 | `Connection: close` je Antwort (Z. 121) | RFC 9112 Z. 1548-1551 (Halbschluss gegen TCP-Reset) | bestätigt, Auflage RT-15 |
| C-59 | Andere Methoden → 405 (VAL-2) | RFC 9110 Z. 7604-7606: 405 MUST `Allow` | unvollständig → RT-14 |
| C-60 | Kopf 8 KiB in 10 s (SEC-13) | RFC 6265 §6.1, §8.5 | zu klein → RT-6 |
| C-61 | Ziel enthält nur Geheimnis und Pfad (API-2, SVC-4) | RFC 9112 Z. 454 Query im origin-form | Lücke → RT-11 |
| C-62 | Einmal dekodieren, Segmente prüfen (VAL-5) | Reihenfolge Teilen/Dekodieren offen; `%2F` | Lücke → RT-12 |
| C-63 | Eintrittsname prozentkodiert (Z. 120) | Zeichensatz offen | Lücke → RT-13 |
| C-64 | Ordner liefert `index.html` (API-2, Q&A 21) | VAL-5 weist leeres Segment ab | widersprüchlich → RT-5 |
| C-65 | Anfrage-Form (VAL-1 bis VAL-5) | RFC 9112 Z. 515 „MUST accept the absolute-form" | Abweichung ungefährlich → RT-22 |
| C-66 | Kopfzeilen-Satz je Antwort (Tabelle Z. 125) | RFC 9110 Z. 2313-2316 `Date` | Hinweis RT-23 |
| C-67 | `Content-Type` je Endung (SVC-5) | ohne `charset` | Hinweis RT-24 |
| C-68 | AppKit-Monitor sieht `keyDown` bei Fokus im `iframe` (Z. 575) | – | NICHT GEMESSEN — Mac N-10 |
| C-69 | `127.0.0.1` gegen `localhost` im App-Rahmen (Z. 658) | – | NICHT GEMESSEN — Mac N-23 |
| C-70 | Keine Firewall-Nachfrage (Z. 572) | – | NICHT GEMESSEN — Mac N-16 |
| C-71 | `open_url` öffnet `http://127.0.0.1:{port}/…` (Z. 573) | – | NICHT GEMESSEN — Mac N-2 |
| C-72 | Port vom Betriebssystem zufällig (K2) | – | NICHT GEMESSEN — Port-Vergabe von macOS nicht nachgelesen |
| C-73 | IP-Literal verhindert Übernahme über `[::1]` (Bedrohung 19) | Browser verbindet zum Literal; Bestand `TERAX.md:44` | bestätigt |
| C-74 | Träge-CSP „Muster upstream `response`" (Z. 127) | `upstream/main:…/assets.rs:135-136` ohne `img-src` | Hinweis RT-25 |
| C-75 | Grenzen SEC-12 gegen fremde Seiten (Bedrohung 18) | Safari ohne LNA (Chrome-Blog nennt nur Chrome) | Hinweis RT-26 |

Außerhalb dieser Perspektive, nicht gemessen (andere Perspektive `code`): Anker und Verhalten in MIG-2 bis MIG-16, INV-1 bis INV-13, Testnamen und Guard-Tests, upstream-Cargo-Zeilen `upstream/main:src-tauri/Cargo.toml:46-47`, Frontend-Regeln SVC-12 bis SVC-19, `F_GETPATH`-Arm, `asset.rs`-Vergleich SEC-2. Perspektive `ui`: Kopfzeile, Zen, Wisch-Ausnahme. Diese zählen nicht zur Prüfmenge oben.

---

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|----|--------|-------|-----------|-------|-------|-------------|----------------------|------------|-------------------|
| RT-1 | decision | B, D | architecture.md (SEC-14, Risiken) | SEC-14 (Z. 258): „8 insgesamt, davon höchstens 4 je SSH-Host (sshd `MaxSessions`, `src-tauri/src/modules/ports.rs:317`)" | sshd_config(5): MaxSessions „maximum number of open shell, login or subsystem … sessions permitted per network connection", Default 10. Denselben Master nutzen Terminal-Tabs (`pty/shell_init.rs:153`), Git (`git/process.rs:345`), FS-Aufrufe (`ssh.rs:1161`) und je Host mit Freigaben eine Halte-Sitzung (`ports.rs:167-186`, `TERAX.md:44`). `ports.rs:317` sagt nur, dass eine verweigerte Sitzung ein Fehler ist; die Zahl 4 ist nirgends aus dem geteilten Budget abgeleitet | dependency, code | sshd mit `MaxSessions 10`, 7 offene Terminal-Tabs zum Host: eine HTML-Seite mit 30 Bildern im Browser liefert einige Bilder als `502`, oder ein während des Ladens geöffneter Terminal-Tab startet nicht | PM/Architektur entscheiden das Sitzungsbudget: (a) Grenze je Host senken (z. B. 2) und Verweigerung mit Wiederholung abfangen, (b) gemeinsamer Sitzungszähler je Host für alle Funktionen, (c) Restrisiko hinnehmen und im Sicherheitsmodell/Risiken mit Wirkung auf Terminal-Tabs benennen; N-4 um den Fall „viele Terminal-Tabs offen" ergänzen | nein |
| RT-2 | decision | A (BR-14), Sicherheitsmodell | architecture.md (Sicherheitsmodell Z. 13, Trade-offs) | Bedrohung 13 (Z. 282): „Restrisiko: Cookies, die eine Seite selbst setzt, gelten für alle Ports von 127.0.0.1" | RFC 6265 Z. 1751: „Cookies do not provide isolation by port." und „If a cookie is writable by a service on one port, the cookie is also writable by a service running on another port of the same server." WHATWG HTML „same site": Site einer IP-Herkunft = (Schema, Host); „the port and domain components are ignored". Chrome LNA erfasst nur Anfragen aus dem öffentlichen Netz (Chrome-Blog) | dependency (Spezifikationen) | Eine über Terax ausgelieferte HTML-Seite liest per `document.cookie` die nicht-HttpOnly-Cookies eines anderen Dienstes auf `http://127.0.0.1:8000` und kann Cookies für Host `127.0.0.1` setzen; ihre Formular-Anfragen an `127.0.0.1:8000` gelten als same-site und tragen dessen `SameSite=Lax/Strict`-Cookies | Entscheidung: (a) Restrisiko hinnehmen und für andere lokale Dienste auf `127.0.0.1` im Sicherheitsmodell und `TERAX.md` benennen; (b) HTML mit `sandbox allow-scripts …` ohne `allow-same-origin` ausliefern (eigene opake Herkunft, keine Cookies, cross-site), dann Nachladen per `fetch` nur mit CORS-Antwort — berührt BR-14; (c) anderer Hostname — weicht von DF-1 ab | nein |
| RT-3 | refuted | D (Browser-Verhalten) | architecture.md (Q&A 4, K8, DTO-Tabelle, Research Log, Trade-offs, Open Question 2) | Q&A 4 (Z. 865): „Bei PDF schaltet genau diese Anweisung den eingebauten PDF-Betrachter von Chrome ab, die Seite bleibt leer."; DTO-Tabelle (Z. 129): „keine (Q&A 4: `sandbox` schaltet den PDF-Betrachter ab)"; Research Log (Z. 846) | Chromium security-dev, Joe DeBlasio, 2021-03-22 (https://groups.google.com/a/chromium.org/g/security-dev/c/Abvu9qL-nzk): CSP-`sandbox`-Problem bei PDFs ist crbug.com/1187122, „This is fixed in Chrome 91 or higher." Safari: Redmine #40647 (https://www.redmine.org/issues/40647) zitiert die Release Notes von Safari 18.4: „Fixed main frame PDFs served with a CSP sandbox header not loading." (Issue am 2025-03-18 geschlossen). Offen bleibt nur ein Bericht zu Chrome 108 bei `target="_blank"` (2022-12-20, selber Thread) | dependency (Hersteller) | In aktuellem Chrome (≥ 91) und Safari (≥ 18.4) zeigt `http://127.0.0.1:{p}/{t}/x.pdf` mit `Content-Security-Policy: sandbox` die PDF als Hauptdokument im eingebauten Betrachter | Begründung in Q&A 4, K8, DTO-Tabelle, Trade-off „PDF ohne `sandbox`" und Research Log berichtigen, bevor der PM entscheidet; Empfehlung neu abwägen (Open Question 2, Option B ist nach den Belegen der Normalfall); N-8 um PDF über `target="_blank"` und eingebettet (`<iframe>`, `<embed>`) in einer ausgelieferten HTML-Seite erweitern | nein |
| RT-4 | fix | A (BR-1) | architecture.md (VAL-1, Bedrohung 5, Schnitt Baustein E) | VAL-1 (Z. 210): „nennt er einen Namen, `localhost` oder einen anderen Port, gibt es keinen Inhalt"; Schnitt (Z. 658): „Bindung zusätzlich an `[::1]` am selben Port und `localhost` in der Adresse" | Für `http://localhost:{port}/…` sendet der Browser `Host: localhost:{port}` (RFC 9112 §3.2); VAL-1 gibt dann `421`; Bedrohung 5 (Z. 274) testet `localhost:{port}` ausdrücklich als `421` | artifact | Mit Fallback-Adresse lädt die In-App-Vorschau nichts (`421`) | VAL-1 und Bedrohung 5 je Klasse fassen: Klasse `frame` mit Fallback nimmt genau `localhost:{port}` an, Klasse `browser` bleibt bei `127.0.0.1:{port}`; Bindung an `[::1]` am selben Port kann belegt sein — Verhalten wie `TERAX.md:44` (nächster freier Port auf beiden) festlegen | nein |
| RT-5 | fix | A (FL-2) | architecture.md (VAL-5, API-2) | VAL-5 (Z. 214): „ein Segment, das leer ist, `.` oder `..` lautet … wird abgewiesen"; API-2 (Z. 101): „`relpath` leer oder Ordner liefert dessen `index.html`"; Q&A 21 (Z. 882): „nichts: Seiten mit `href=\"sub/\"` brechen" | `href="sub/"` aus `/{t}/page.html` ergibt `/{t}/sub/` mit leerem Schluss-Segment → VAL-5 weist ab; `/{t}/sub` ohne Schrägstrich mit `index.html` beantwortet lässt deren relative Verweise gegen `/{t}/` auflösen | artifact | `href="sub/"` liefert `404` statt `sub/index.html` | VAL-5: genau ein leeres Schluss-Segment = Ordner → `index.html`; Ordner ohne Schrägstrich → `308` auf `…/` (relative `Location`) oder `404`; leere Segmente in der Mitte bleiben abgewiesen | nein |
| RT-6 | fix | B, C | architecture.md (SEC-13, VAL-3) | SEC-13 (Z. 257): „Anfragekopf: 8 KiB, 10 s je Verbindung" | RFC 6265 Z. 1471-1476: Browser tragen „At least 4096 bytes per cookie" und „At least 50 cookies per domain"; Z. 1751: Cookies gelten für alle Ports desselben Hosts. Jede Anfrage an `127.0.0.1:{p}` trägt die Cookies anderer `127.0.0.1`-Dienste mit | dependency (Spezifikation) | Setzt ein anderer lokaler Dienst auf `127.0.0.1` Cookies über rund 8 KiB, beantwortet der Server jede Anfrage mit `431`; die Seite öffnet nicht | Grenze auf 64 KiB anheben, Zahl der Kopfzeilen passend dimensionieren; `Cookie` wird gelesen, nie ausgewertet; Test mit 20 KiB Cookie-Kopf ergibt `200` | nein |
| RT-7 | fix | Sicherheitsmodell | architecture.md (Bedrohung 11) | Bedrohung 11 (Z. 280): „`Referrer-Policy: no-referrer`; … Restrisiko: bleibt im Browser-Verlauf" | W3C Referrer Policy §4: Zustellung auch „Via a `meta` element with a `name` of `referrer`" und „Via a `referrerpolicy` content attribute"; §11.1: „the value of the latest one will be used"; §3.8 `unsafe-url`: volle Adresse geht mit | dependency (Spezifikation) | Eine ausgelieferte Seite mit `<meta name="referrer" content="unsafe-url">` schickt `Referer: http://127.0.0.1:{p}/{token}/…` an ein CDN | Restrisiko ergänzen: Seiteninhalt kann `no-referrer` lockern; Folge benennen (fremde Seite mit Geheimnis kann Skripte per `<script src>` einbinden; Host-Prüfung bleibt wirksam) | nein |
| RT-8 | fix | Sicherheitsmodell | architecture.md (K2, Bedrohung 13, Trade-offs) | K2 (Z. 65): „damit hat jeder Link eine eigene Herkunft (Origin) im Browser"; Trade-off (Z. 615): „Speicher und Skripte getrennt" | Herkunft = Schema, Host, Port (WHATWG HTML „same origin" vergleicht Port); Browser-Speicher (localStorage, IndexedDB, Cache) überdauert Terax; Ports werden in jedem Lauf neu vergeben | dependency (Spezifikation), artifact | Bekommt ein Link nach einem Neustart denselben Port wie ein früherer Link, liest seine Seite dessen localStorage | Aussage auf „innerhalb eines Terax-Laufs" begrenzen und Restrisiko benennen (Service Worker bleiben durch das Geheimnis im Pfad auf ihren Bereich begrenzt) | nein |
| RT-9 | fix | Mac-Prüfpunkte | architecture.md (Entscheidungskriterium Baustein E, N-23) | M-B (Z. 665): „`python3 -m http.server 8765 --bind 127.0.0.1` starten …"; Klasse `frame` (Z. 131): „`frame-ancestors` mit den App-Herkünften (`tauri://localhost`, …)" | Pythons `SimpleHTTPRequestHandler` sendet keine CSP, M-B misst `frame-ancestors` mit `tauri://localhost` in WebKit also nie; eine im opaken `iframe` eingebettete Nachbar-HTML hat einen opaken Vorfahren, der keiner App-Herkunft entspricht | artifact, dependency | Kriterium „M-B grün" führt zu Baustein E, obwohl WebKit die Seite wegen `frame-ancestors` sperren kann | N-23 um M-C ergänzen: Release-Build mit Baustein E lädt eine Seite mit den echten Kopfzeilen der Klasse `frame`, dazu eine Nachbar-HTML im verschachtelten `iframe`; erst danach Baustein E abnehmen | nein |
| RT-10 | fix | D, F | architecture.md (Integrations Z. 535, Welle 2 Z. 636) | „zieht `pulldown-cmark-escape` und `unicase` neu ins Lockfile"; „drei neue kleine Crates" | pulldown-cmark 0.13.6 `Cargo.toml.orig`: `default = ["getopts", "html"]`, `getopts = { version = "0.2", optional = true }`; `getopts` fehlt im Lock | dependency | Mit Standard-Features kommt mindestens `getopts` dazu | W2-Zeile festlegen: `pulldown-cmark = { version = "0.13", default-features = false, features = ["html"] }` | nein |
| RT-11 | obligation | C2 | implement | API-2 (Z. 101): „`http://127.0.0.1:{port}/{token}/{relpath}`" | RFC 9112 Z. 454: `origin-form = absolute-path [ "?" query ]`; gebaute Seiten nutzen `app.js?v=3` | dependency (Spezifikation) | `GET /{t}/app.js?v=3` liefert `app.js`; ein `%3F` im Pfad bleibt Teil des Namens | Query vor dem Dekodieren abtrennen und verwerfen | nein |
| RT-12 | obligation | Sicherheit | implement | VAL-5 (Z. 214): „Einmal dekodiert; ein Segment, das leer ist, `.` oder `..` lautet … wird abgewiesen" | Werden Segmente vor dem Dekodieren geteilt, wird `..%2F..%2Fx` zu einem Segment `../../x`, das keinem verbotenen Wert gleicht; lokal fängt VAL-6 es ab, über SSH liest der Host die Datei außerhalb, bevor VAL-6 abweist (SVC-8) | artifact, code (`ssh.rs:394-412`) | `GET /{t}/..%2F..%2Fetc%2Fhosts` ergibt `404`, ohne dass ein SSH-Lesen startet | Ein dekodiertes Segment mit `/` (und `\`) abweisen oder erst dekodieren, dann teilen; Testtabelle um `%2F`, `%5C`, `%00`, `%252e` ergänzen | nein |
| RT-13 | obligation | C2 | implement | Eintritts-Adresse (Z. 120): „`name` = prozentkodierter Dateiname" | Unkodiertes `#` beginnt ein Fragment, `?` eine Query, `%` eine Kodierung | artifact | `Bericht #3.html`, `a?b.html`, `100%.html` öffnen sich im Browser | Zeichensatz festlegen: alles außer RFC-3986-unreserved kodieren | nein |
| RT-14 | obligation | D | implement | VAL-1 (Z. 210) „fehlt er … `421`"; VAL-2 (Z. 211) „`405`"; SEC-13 | RFC 9110 Z. 7604-7606: „The origin server MUST generate an Allow header field in a 405 response"; RFC 9112 Z. 445: fehlender oder doppelter Host → „MUST respond with a 400"; httparse `Error::TooManyHeaders` | dependency | `POST` ergibt `405` mit `Allow: GET, HEAD`; zwei `Host`-Zeilen ergeben `400`; Anfrage mit mehr Kopfzeilen als der Puffer ergibt `431` | in `parse_request` umsetzen und testen | nein |
| RT-15 | obligation | D | implement | Z. 121: „`Connection: close` in jeder Antwort" | RFC 9112 Z. 1548-1551: „To avoid the TCP reset problem, servers typically close a connection in stages. First, the server performs a half-close" | dependency | Antwort kommt vollständig an, auch wenn der Client nach dem Kopf weitere Bytes sendet | nach dem Schreiben nur die Schreibseite schließen, kurz lesen, dann schließen | nein |
| RT-16 | obligation | D | implement | SEC-14 (Z. 258): „Warten in der Reihe; der Browser wartet"; SEC-16: „SSH-Zeitbudget wie `read_bytes_timeout`" | `ssh.rs:1506-1509` mit `expected_size = None` (SVC-8): `write_timeout(10 MiB)` = 30 s + 214 s = 244 s je Datei (`ssh.rs:897-909`); Warten auf einen Platz unbegrenzt | code, dependency | Hängt der Helfer auf dem Host, bekommt jede wartende Anfrage nach einer festen Frist eine `504`-Textseite, nicht erst nach 244 s je Datei | Wartezeit auf einen Platz begrenzen (Wert im Bau festlegen) und mit `504` beantworten; Test mit nie antwortendem Host-Ersatz | nein |
| RT-17 | obligation | D | implement | SVC-8 (Z. 170): „Fehler des Transports zu `unreachable`, Zeitüberschreitung … zu `timeout`" | Helfer wirft `ValueError` für „not a regular file" und „file too large to preview" (`ssh.rs:401-411`); fehlende Datei = `FileNotFoundError` | code | Über SSH: Datei > 10 MiB → `403` „Larger than 10 MB" (beim Klick `too_large`), fehlend oder Ordner → `404`, Transport → `502` | Abbildung der Helfer-Fehler festlegen und mit Host-Ersatz testen | nein |
| RT-18 | obligation | W2 | implement (W2) | SVC-20 (Z. 182): „rohes HTML der Datei wird als Text ausgegeben" | pulldown-cmark 0.13 `html.rs`: `Html(html) \| InlineHtml(html) => { self.write(&html)?; }` | dependency | Markdown mit `<script>alert(1)</script>` zeigt den Text sichtbar | `Event::Html`/`InlineHtml` vor `push_html` in `Event::Text` umsetzen; Test | nein |
| RT-19 | obligation | W2 | qa (W2, Mac) | W2 (Z. 637): „`sandbox; default-src 'none'; img-src 'self' data:` … Bilder aus dem Ordner laden" | Im `sandbox`-Dokument ist die Herkunft opak; ob `'self'` dort die Server-Herkunft trifft, ist je Browser zu zeigen | artifact | Gerendertes Markdown zeigt Bilder aus dem Ordner in Safari und Chrome | Mac-Prüfpunkt im W2-Lauf | nein |
| RT-20 | note | D | architecture.md (SVC-11) | SVC-11 (Z. 173): „`tauri_plugin_opener::open_url(url, None)`" | Signatur `open_url<P, S>(url: P, with: Option<S>)`; Doku-Beispiel `None::<&str>` | dependency | — | `None::<&str>` schreiben | nein |
| RT-21 | note | Sicherheitsmodell | architecture.md (Bedrohung 1) | Bedrohung 1 (Z. 270): „Andere lokale Prozesse … Geheimnis je Freigabe" | open 5.4.5 `macos.rs`: `/usr/bin/open -- <url>`; Argumente für Prozesse desselben Users lesbar (getargv-README); `SECURITY.md:30` nimmt lokale Angreifer mit Shell aus | dependency | — | Gegenmittel auf andere Konten und abgeschottete Prozesse beziehen | nein |
| RT-22 | note | D | – | VAL-1 bis VAL-5 | RFC 9112 Z. 515: „A server MUST accept the absolute-form"; Browser senden sie nur an Proxys | dependency | — | Abweisen mit `400` bewusst festhalten | nein |
| RT-23 | note | D | – | Kopfzeilen-Tabelle (Z. 125) | RFC 9110 Z. 2313-2316: `Date` MUST in 2xx/4xx | dependency | — | optional `Date` setzen | nein |
| RT-24 | note | C2 | – | SVC-5 | `text/html`, `text/plain`, `text/css` ohne `charset` | artifact | — | `; charset=utf-8` für Text-Arten ohne eigene Angabe erwägen | nein |
| RT-25 | note | D | architecture.md (Z. 127) | „(Muster upstream `response`)" | `upstream/main:…/assets.rs:135-136`: `sandbox; default-src 'none'; style-src 'unsafe-inline'` ohne `img-src` | code | — | Zusatz `img-src 'self' data:` als eigene Ergänzung kennzeichnen | nein |
| RT-26 | note | Sicherheitsmodell | – | SEC-12 (Z. 256): „16 je Freigabe … Darüber wird die Verbindung sofort geschlossen" | Safari hat kein LNA; eine fremde Seite mit erratenem Port kann Plätze vor der Geheimnis-Prüfung binden | dependency | — | Plätze erst nach gültigem Geheimnis zählen oder Kopf-Frist für Verbindungen ohne Geheimnis kürzen | nein |
| RT-27 | note | D | – | Z. 534: „Loopback-Seiten selbst lösen keine LNA-Prüfung aus" | Chrome-Blog: geplant „a local server to localhost" | dependency | — | bei neuen Chrome-Versionen N-7 wiederholen | nein |
| RT-28 | note | D | – | Z. 535: „0.13.x … Benchmark-README … 0.13.4" | docs.rs: 0.13.6 | dependency | — | beim W2-Bau neu prüfen (steht schon im Entwurf) | nein |

## Blockierende Befunde (JSON)

```json
{"id":"RT-1","class":"decision","claim":"architecture.md SEC-14 (Z. 258): \"8 insgesamt, davon höchstens 4 je SSH-Host (sshd `MaxSessions`, `src-tauri/src/modules/ports.rs:317`)\"","evidence":"sshd_config(5) (https://man.openbsd.org/sshd_config): MaxSessions \"Specifies the maximum number of open shell, login or subsystem (e.g. sftp) sessions permitted per network connection.\", Default 10. Denselben ControlMaster (ssh.rs:92-147 control_args) nutzen Terminal-Tabs (src-tauri/src/modules/pty/shell_init.rs:153), Git (src-tauri/src/modules/git/process.rs:345), FS-Aufrufe (src-tauri/src/modules/ssh.rs:1161) und je Host mit Port-Freigaben eine Halte-Sitzung (src-tauri/src/modules/ports.rs:167-186; TERAX.md:44). ports.rs:317 sagt nur: \"A session the server refuses (`MaxSessions`) or ends at once is an error, not a holder.\" Keine Ableitung der Zahl 4 aus dem geteilten Budget.","evidence_source":"dependency","expected_observation":"sshd mit MaxSessions 10, sieben offene Terminal-Tabs zum Host: eine HTML-Seite mit 30 Bildern im Browser liefert einzelne Bilder als 502, oder ein während des Ladens geöffneter Terminal-Tab startet nicht.","scenario":"1. User arbeitet mit sieben Terminal-Tabs (Claude Code in tmux) auf devbox; Terax hat dazu eine Port-Freigabe (Halte-Sitzung). 2. User öffnet einen HTML-Bericht mit 30 Bildern per 'Open in Browser'. 3. Der Browser fragt sechs Bilder parallel an, der Server startet vier SSH-Lesevorgänge über den Master. 4. Sitzung 11 überschreitet MaxSessions 10; sshd verweigert sie. 5. Je nach Reihenfolge fehlt ein Bild (502) oder der gleichzeitig geöffnete Terminal-Tab bzw. ein Git-Aufruf scheitert."}
{"id":"RT-2","class":"decision","claim":"architecture.md Sicherheitsmodell Bedrohung 13 (Z. 282): \"Restrisiko: Cookies, die eine Seite selbst setzt, gelten für alle Ports von 127.0.0.1\"; Trade-off (Z. 615): \"eigene Herkunft je Link: Speicher und Skripte getrennt (BR-14)\"","evidence":"RFC 6265 §8.5 (https://www.rfc-editor.org/rfc/rfc6265, Z. 1751 der Textfassung): \"Cookies do not provide isolation by port. If a cookie is readable by a service running on one port, the cookie is also readable by a service running on another port of the same server. If a cookie is writable by a service on one port, the cookie is also writable by a service running on another port of the same server.\" WHATWG HTML same site (https://html.spec.whatwg.org/multipage/browsers.html#same-site): Site einer Herkunft ohne registrierbare Domain = (scheme, host); \"the port and domain components are ignored\". Chrome Local Network Access (https://developer.chrome.com/blog/local-network-access) erfasst Anfragen \"from the public network to local or loopback destinations\", nicht Loopback zu Loopback.","evidence_source":"dependency","expected_observation":"Eine über Terax ausgelieferte HTML-Seite auf http://127.0.0.1:{A} liest per document.cookie die nicht-HttpOnly-Cookies eines Dienstes auf http://127.0.0.1:8000, setzt Cookies für Host 127.0.0.1, und ihre Formular-Anfragen an 127.0.0.1:8000 tragen als same-site dessen SameSite=Lax/Strict-Cookies.","scenario":"1. User betreibt lokal einen Web-Dienst auf http://127.0.0.1:8000 mit Login-Cookie und Double-Submit-CSRF-Cookie. 2. Auf dem SSH-Server liegt eine HTML-Datei aus einem fremden Repo oder von einem manipulierten Agenten. 3. User öffnet sie per 'Open in Browser'; sie läuft mit Skripten auf http://127.0.0.1:{A}. 4. Das Skript liest die nicht-HttpOnly-Cookies von 127.0.0.1, setzt ein eigenes CSRF-Cookie für 127.0.0.1 und schickt ein Formular an http://127.0.0.1:8000. 5. Der Browser wertet die Anfrage als same-site und hängt die Session-Cookies an; kein LNA-Dialog, da Loopback zu Loopback."}
{"id":"RT-3","class":"refuted","claim":"architecture.md Q&A 4 (Z. 865): \"Bei PDF schaltet genau diese Anweisung den eingebauten PDF-Betrachter von Chrome ab, die Seite bleibt leer.\"; DTO-Tabelle (Z. 129): \"keine (Q&A 4: `sandbox` schaltet den PDF-Betrachter ab)\"; Research Log (Z. 846): \"Chrome-PDF-Betrachter bleibt bei `Content-Security-Policy: sandbox` leer\"","evidence":"Chromium security-dev, Joe DeBlasio, 2021-03-22 (https://groups.google.com/a/chromium.org/g/security-dev/c/Abvu9qL-nzk): Problem mit CSP sandbox bei PDFs ist crbug.com/1187122, \"This is fixed in Chrome 91 or higher.\" Redmine #40647 (https://www.redmine.org/issues/40647), Kommentar 2025-04-07, zitiert die Safari-18.4-Release-Notes: \"Fixed main frame PDFs served with a CSP sandbox header not loading.\"; Issue am 2025-03-18 als behoben in Safari 18.4 geschlossen. Einzige jüngere Gegenmeldung: Chrome 108 bei Link mit target=_blank (2022-12-20, selber Thread).","evidence_source":"dependency","expected_observation":"In Chrome ab 91 und Safari ab 18.4 wird http://127.0.0.1:{p}/{t}/x.pdf mit Content-Security-Policy: sandbox als Hauptdokument im eingebauten PDF-Betrachter angezeigt.","scenario":"1. Der PM liest Q&A 4: mit Abschottung bleibe die PDF in Chrome leer. 2. Er bestätigt 'PDF ohne sandbox'. 3. Ausgeliefert wird jede echte PDF ohne die Abschottungs-Kopfzeile, obwohl aktuelle Chrome- und Safari-Versionen sie mit Abschottung anzeigen. 4. Die strengere Variante (Open Question 2, Option B) wird auf falscher Grundlage verworfen."}
```

## Rückgabe

```
VERDICT: FAILED
BLOCKING_ISSUES: [RT-1 · decision · B/D · architecture.md SEC-14 · „höchstens 4 je SSH-Host (sshd MaxSessions, ports.rs:317)" · sshd_config(5) Default 10 je Verbindung, geteilt mit Terminal (shell_init.rs:153), Git (git/process.rs:345), FS (ssh.rs:1161), Halte-Sitzung (ports.rs:167-186) · dependency/code · 7 Terminal-Tabs + Seite mit 30 Bildern → einzelne 502 oder Terminal-Tab startet nicht · Sitzungsbudget entscheiden (Grenze senken + Wiederholung, gemeinsamer Zähler, oder Restrisiko benennen); N-4 erweitern | RT-2 · decision · Sicherheitsmodell/BR-14 · architecture.md Bedrohung 13 · „Restrisiko: Cookies … gelten für alle Ports von 127.0.0.1" · RFC 6265 §8.5; WHATWG HTML same site ignoriert Port; LNA nur public→local · dependency · ausgelieferte Seite liest/setzt Cookies anderer 127.0.0.1-Dienste, Anfragen dorthin same-site · entscheiden: Restrisiko benennen, opake Herkunft per sandbox-CSP, oder anderer Host | RT-3 · refuted · D · architecture.md Q&A 4, Z. 129, Z. 846 · „Chrome-PDF-Betrachter bleibt mit sandbox leer" · crbug 1187122 „fixed in Chrome 91"; Safari 18.4 „Fixed main frame PDFs served with a CSP sandbox header not loading" · dependency · Chrome ≥ 91 und Safari ≥ 18.4 zeigen PDF mit sandbox-CSP · Begründung berichtigen, Empfehlung neu abwägen, N-8 um target=_blank und eingebettete PDF erweitern]
FIX_ITEMS: [RT-4 VAL-1/Bedrohung 5 je Klasse; Klasse frame mit Fallback nimmt localhost:{port} an, Verhalten bei belegtem [::1]-Port festlegen | RT-5 VAL-5: ein leeres Schluss-Segment = Ordner → index.html, Ordner ohne Schrägstrich → 308 auf …/ oder 404 | RT-6 SEC-13: Kopf-Grenze 64 KiB, Kopfzeilen-Zahl passend, Cookie nie ausgewertet | RT-7 Bedrohung 11: Restrisiko „Seite lockert no-referrer per meta/referrerpolicy" | RT-8 K2/Bedrohung 13/Trade-off: „eigene Herkunft" nur innerhalb eines Terax-Laufs, Port-Wiederkehr als Restrisiko | RT-9 N-23 um M-C (Release-Build mit echten frame-Kopfzeilen, verschachtelter iframe) | RT-10 W2-Cargo-Zeile pulldown-cmark mit default-features = false, features = ["html"]]
OBLIGATIONS: [RT-11 Query vor dem Dekodieren abtrennen · GET /{t}/app.js?v=3 liefert app.js · implement | RT-12 dekodiertes Segment mit / oder \ abweisen · ..%2F..%2Fx → 404 ohne SSH-Lesen · implement | RT-13 Eintrittsname: alles außer unreserved kodieren · Dateien mit #, ?, % öffnen sich · implement | RT-14 405 mit Allow, doppelter/fehlender Host 400, TooManyHeaders 431 · Tests in parse_request · implement | RT-15 Halbschluss beim Verbindungsabbau · Antwort vollständig trotz Rest-Bytes · implement | RT-16 Wartezeit auf Lese-Platz begrenzt, danach 504 (heute 244 s je Datei ohne Größe) · Host-Ersatz, der nie antwortet · implement | RT-17 SSH-Helfer-Fehler abbilden: zu groß 403/too_large, fehlt/Ordner 404, Transport 502 · Host-Ersatz · implement | RT-18 W2: Html/InlineHtml → Text vor push_html · <script> erscheint als Text · implement | RT-19 W2: Bilder im gerenderten Markdown unter sandbox-CSP in Safari und Chrome · Mac · qa]
DATA_TYPE_VERDICTS: [Geheimnis 64 Hex OK | Host 127.0.0.1:{port} OK (W1), RT-4 für Baustein E | Anfragekopf 8 KiB ZU KLEIN (RT-6) | Kopfzeilen-Zahl offen (RT-14) | Request-Target ohne Query-Behandlung (RT-11) | Eintrittsname Zeichensatz offen (RT-13) | Datei 10 MiB OK | SSH-Antwort 16 MiB ≥ 13 981 016 Byte OK | Port u16 OK | Grant.entry ohne Grenze OK]
PATTERN_CONSISTENCY: [N/A — kein codebase-scan.md]
BINDINGS_COVERAGE: [N/A — keine bindings.md]
RECOMMENDATIONS: [RT-20 open_url mit None::<&str> | RT-21 Bedrohung 1 auf andere Konten beziehen (Adresse in argv von /usr/bin/open) | RT-22 absolute-form bewusst mit 400 | RT-23 Date-Kopf optional | RT-24 charset=utf-8 für Text-Arten erwägen | RT-25 img-src als eigene Ergänzung zu upstream kennzeichnen | RT-26 Verbindungsplätze erst nach gültigem Geheimnis zählen | RT-27 LNA-Ausbau „local server to localhost" beobachten | RT-28 pulldown-cmark aktuell 0.13.6]
CLAIMS: {erhoben: 75, gemessen: 60, nicht_gemessen: 15}
```

## Quellen außerhalb des Repos

- sshd_config(5): https://man.openbsd.org/sshd_config
- RFC 6265: https://www.rfc-editor.org/rfc/rfc6265.txt (Z. 1471-1476, 1751)
- RFC 9110: https://www.rfc-editor.org/rfc/rfc9110.txt (Z. 2313-2316, 4723-4724, 6476, 7604-7606)
- RFC 9112: https://www.rfc-editor.org/rfc/rfc9112.txt (Z. 445, 454, 509, 515, 1548-1551)
- W3C Referrer Policy: https://w3c.github.io/webappsec-referrer-policy/
- WHATWG HTML same site: https://html.spec.whatwg.org/multipage/browsers.html#same-site
- Chrome Local Network Access: https://developer.chrome.com/blog/local-network-access
- Chromium security-dev zu CSP sandbox und PDF: https://groups.google.com/a/chromium.org/g/security-dev/c/Abvu9qL-nzk
- Redmine #40647 (Safari 18.4): https://www.redmine.org/issues/40647
- tauri-plugin-opener 2.7.2 `src/open.rs`: https://docs.rs/crate/tauri-plugin-opener/2.7.2/source/src/open.rs
- open 5.4.5 `src/macos.rs`: https://docs.rs/crate/open/5.4.5/source/src/macos.rs
- tauri 2.12.5 `src/async_runtime.rs`: https://docs.rs/crate/tauri/2.12.5/source/src/async_runtime.rs
- tokio 1.54.1 `Cargo.toml.orig`: https://docs.rs/crate/tokio/1.54.1/source/Cargo.toml.orig
- getrandom 0.4.3: https://docs.rs/getrandom/0.4.3/getrandom/
- httparse 1.10.1 `Error`: https://docs.rs/httparse/1.10.1/httparse/enum.Error.html
- pulldown-cmark `Cargo.toml.orig` (0.13.6) und `html.rs` (0.13.0): https://docs.rs/crate/pulldown-cmark/latest/source/Cargo.toml.orig, https://docs.rs/crate/pulldown-cmark/0.13.0/source/src/html.rs
- getargv-README (Argumente fremder Prozesse unter macOS): https://docs.rs/crate/getargv/0.2.6/source/README.md
- OSV-API: https://api.osv.dev/v1/query (je Crate und Version, Ergebnis leer)
