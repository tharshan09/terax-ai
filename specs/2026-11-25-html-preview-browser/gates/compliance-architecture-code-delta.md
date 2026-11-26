# Gate 1 — Architecture Compliance, Perspektive `code`, Delta-Lauf (Runde 2)

| Kopf | Wert |
|------|------|
| Lauf | Delta gegen den Vorlauf `gates/compliance-architecture-code.md` |
| Geprüfter Diff | `gates/architecture-r1-r2.diff` (512 Zeilen, `diff -u` alt → neu), aktueller Stand `architecture.md` (946 Zeilen) samt Abschnitt „Änderungen Runde 2" |
| Codebase | `/home/claude/litha/produkte/terax/terax-ai`, `main` @ `cf07327`; Upstream über `git ls-tree`/`git show upstream/main` |
| Prüfdatum | 2026-11-25 |
| Perspektive | `code` |
| Bekannt, kein Befund | Q&A 4 (PDF-Kopfzeilen), Q&A 35 (Lesevorgänge je SSH-Host), Q&A 36 (Cookies anderer `127.0.0.1`-Dienste) liegen dem User vor; Q&A 1–3, 5–11 vom User beantwortet |
| Regel | Belegte Verdikte des Vorlaufs gelten weiter, soweit der Diff ihre Belegstelle nicht berührt; nicht neu geprüft |

## Skript-Tabelle (Arch-Precheck Runde 2, übernommen)

`gates/arch-precheck-r2.json`: `result: PASS`, 0 Befunde.

| ID | Prüfung | Status | Detail |
|----|---------|--------|--------|
| AR-1 | ID-Marker architecture.md | PASS | 27 h2 konform |
| AR-1d | ID-Marker discovery.md | PASS | konform |
| AR-2 | ID-Existenz | PASS | 100 definierte IDs, 164 referenziert |
| AR-3 | Anker pfad:zeile | PASS | 47 Anker aufgelöst |
| AR-4 | Invarianten-Zeilen | PASS | 13 INV-Zeilen mit gültigen Enums |
| AR-5 | Testnamen | PASS | 14 Testnamen in ihren Dateien gefunden |
| AR-6 | Versionen | PASS | 15 Zeilen mit Version |
| AR-7 | Scan-Plausibilität | SKIP | kein codebase-scan.md |
| AR-8 | Anti-Slop-Dispositionen | PASS | 0 Dispositionen formal vollständig |
| AR-9 | Bindings-Exceptions | SKIP | keine bindings.md |
| AR-10 | Migration Map | PASS | 21 MIG-Zeilen mit Dateipfad |
| AR-11 ff. | übrige | PASS | laut JSON |

## Summary

| Klasse | neu | aus Vorlauf noch offen |
|--------|-----|------------------------|
| decision | 0 | 0 |
| refuted | 0 | 0 (R-1 aufgelöst) |
| fix | 4 (D-1 bis D-4) | 0 (F-1 bis F-9 aufgelöst) |
| obligation | 1 (O-6) | 5 (O-1 bis O-5, weitergereicht in `gates/obligations.md`) |
| note | 0 | 6 (N-1 bis N-6, N-2 verändert) |

Prüfmenge: 61 Punkte erhoben, 48 gemessen, 13 nicht gemessen (andere Perspektive). Self-Check: 48 + 13 = 61.

**Verdict:** APPROVED (kein `decision`- oder `refuted`-Befund offen)

---

## Status der Vorlauf-Befunde

| ID | Klasse | Status | Beleg im Diff / am Code |
|----|--------|--------|-------------------------|
| R-1 | refuted | aufgelöst | Entscheidung getroffen: typisierte Variante `ssh::read_bytes_typed` mit `RemoteReadError` (SVC-22, MIG-21, Typ-Tabelle, Q&A 34); `ssh.rs` aus „Unverändert, bewusst" gestrichen; SVC-8 und Fehlertabelle bilden jede Art auf einen Code ab. Die neuen Bestands-Behauptungen tragen bis auf zwei Lücken (D-1, D-2, beide `fix`) |
| F-1 | fix | aufgelöst (anders als die erste Option, trägt) | MIG-17 `PreviewPane.tsx:69`, MIG-18 `GitDiffPane.tsx:247`, MIG-19 `AiDiffPane.tsx:137` stimmen am Code; weitere Pane-Rahmen gibt es nicht (Suche `rounded-md border border-border` über `src/modules`: übrige Treffer sind Chips, Popover, Bild-Rand) |
| F-2 | fix | aufgelöst | MIG-20 nennt `useSidebarPanel.ts:93-104`, `:18-23`, `:78-81`, Aufrufer `App.tsx:1708-1710`, Leser `statusConsumers.ts:39-41`, `App.tsx:1730`; alle Anker stimmen. INV-13 neu formuliert und mit Test belegt; Testzitat unvollständig, siehe D-3 |
| F-3 | fix | aufgelöst | VAL-5, VAL-8, API-2, Fehlertabelle und Q&A 21 sagen jetzt dasselbe: leerer `relpath` oder Schrägstrich am Ende = Ordner → `index.html`; Ordner ohne Schrägstrich `404` |
| F-4 | fix | aufgelöst | Neuer Sweep ist mechanisch: `grep -rn 'const PDF_MAGIC\|b"%PDF-"' src-tauri/src --include=*.rs` liefert heute genau 1 Treffer (`file.rs:194`); Test-Literale (`b"%PDF-1.7…"`, `b"%PDF-nope"`, `b"%PDF-1.4"`) treffen das Muster nicht |
| F-5 | fix | aufgelöst | Neue Dateien D: `PreviewHeader` rendert `DocViewToggle` selbst; Sweep passt dazu |
| F-6 | fix | aufgelöst | Bedrohung 20 und Neue Dateien C: Muster `preview_open_in_browser\|modules\/preview-server`, Vorbild `portsBoundary.test.ts:26` stimmt |
| F-7 | fix | aufgelöst | API-6 legt `loading`/`idle` je Fläche fest; Zuordnung UI-3 nachgezogen |
| F-8 | fix | aufgelöst | `FrameSource` mit `camelCase`, `FrameStatus` mit `snake_case`, beide `Serialize` |
| F-9 | fix | aufgelöst | INV-5 nennt `enforce_read_trusted_refuses_deceptive_leaf_symlink_to_secret`; Inhalt `guard.rs:526-539`: Datei-Symlink `innocent.txt → .ssh/id_rsa` wird auch mit `trusted` abgewiesen |
| O-1 bis O-5 | obligation | offen unverändert (weitergereicht) | `gates/obligations.md:7-11`; kein Rückschreiben vorgesehen. O-1 bleibt nötig: `read_bytes_typed` läuft über denselben synchronen Weg `ssh.rs:1142-1209` |
| N-1 | note | offen unverändert | Raw-Neu-laden bleibt Neuaufbau per Schlüssel (MIG-8, API-6); `EditorPaneHandle.reload` weiter ungenutzt |
| N-2 | note | offen verändert | Mit SEC-14 jetzt 1 Lesevorgang je Host (Entwurfsstand Q&A 35) und unverändertem Budget `read_bytes_timeout` mit `expected_size: None` (244 s, `ssh.rs:1506-1509`, `:897-909`) hält ein hängender Master den einzigen Platz je Host 244 s je Datei; 30 Nachbardateien warten nacheinander |
| N-3 | note | offen unverändert | TOCTOU im Helfer zwischen `realpath` und `open` (`ssh.rs:399-403`) |
| N-4 | note | offen unverändert | Bedrohung 21 prüft weiter nur `default.json`; `desktop.json` existiert |
| N-5 | note | offen unverändert | SVG öffnet im Editor als Code, keine Kopfzeile |
| N-6 | note | offen unverändert | Assumptions-Zeile nennt weiter `ssh.rs:2364` (`run_helper`); Test bei `ssh.rs:2425` |

## Messung der neuen Bestands-Behauptungen

| ID | Behauptung (architecture.md, Stand Runde 2) | Beleg | Verdikt |
|----|---------------------------------------------|-------|---------|
| C-01 | SVC-22: interne Einteilung `RemoteError` (`Transport`, `Failed`, `Killed`, `TimedOut`, `ssh.rs:1045-1053`), Art geht in `From<RemoteError> for String` verloren (`ssh.rs:1055-1064`) | `ssh.rs:1045-1053`, `:1055-1064` | bestätigt |
| C-02 | `RemoteReadError { Unreachable, TimedOut, Failed, Missing, NotRegularFile, TooLarge }` übernimmt die Art aus `RemoteError`; SVC-8 bildet jede Art ab | `RemoteError::Killed` (`ssh.rs:1048-1050`, erzeugt `ssh.rs:1105-1108` bei Exit 128–254) hat kein Ziel in `RemoteReadError` und keine Zeile in SVC-8 | Lücke (D-1) |
| C-03 | MIG-21: Helfer gibt bei `read_bytes` eine feste Art im Antwort-Umschlag mit | Umschlag wird nur in `main` gebaut (`ssh.rs:790-799`, für alle Operationen gemeinsam); Leser ist nur `helper_answer` (`ssh.rs:1230-1273`) über `get("ok")`, `get("data")`, `get("error")`: ein zusätzlicher Schlüssel bricht keinen Leser; Tests mit Gleichheit auf den ganzen Umschlag gibt es nur für Erfolgsantworten (`used`, `all_taken`, `ssh.rs:2711-2718`) | bestätigt (kein weiterer Leser bricht) |
| C-04 | SVC-22: „die Rust-Seite übernimmt die Art" | `helper_answer` gibt bei `ok: false` nur `Failed(String)` aus `error` zurück (`ssh.rs:1264-1270`), ein `kind` geht dort verloren; `RemoteError::Failed(message)` wird in der Kopier-Logik per Muster mit genau einem Feld zerlegt (`ssh.rs:1912`, `:1992`, `:2047-2053`) | Lücke (D-2) |
| C-05 | MIG-21: „`read_bytes` und `fs_read_remote_image` verhalten sich unverändert" | einziger Aufrufer außerhalb `ssh.rs`: `file.rs:173`; Helfer-Texte bleiben angeheftet (`ssh.rs:2415`, `:2420`, `:2490`, `:2538`) und gelten weiter, solange `error` den Text behält | bestätigt (erreichbar) |
| C-06 | MIG-21: „`upstream/main` hat kein `ssh.rs`" | `git ls-tree --name-only upstream/main src-tauri/src/modules/` ohne `ssh.rs`; `git ls-tree -r upstream/main` ohne Pfad mit „ssh" | bestätigt |
| C-07 | Abgleich eingebetteter Helfer-Text ↔ Rust-Konstanten | vorhanden nur für `MAX_READ` (`ssh.rs:2462-2467`, `the_largest_read_bytes_reply_fits_under_the_stdout_cap`); MIG-21 nennt ihn nicht und sieht keinen Abgleich der Art-Literale `missing`, `not_regular`, `too_large` vor | Lücke als Auflage (O-6) |
| C-08 | Fehlertabelle: „von sshd verweigerte Sitzung" ist `Unreachable` | Exit 255 → `exit_error` → `Transport` (`ssh.rs:1219-1221`, `:1109-1115`) | bestätigt |
| C-09 | SEC-14/Research: ControlMaster geteilt von Terminal, Git, Datei-Aufrufen, Halte-Sitzung | `ssh.rs:122-127`; `pty/shell_init.rs:152-154`; `git/process.rs:345`; `ssh.rs:1161`; `ports.rs:167-186` | bestätigt |
| C-10 | MIG-17 Rahmen `PreviewPane.tsx:69` | `PreviewPane.tsx:69` | bestätigt |
| C-11 | MIG-18 Rahmen `GitDiffPane.tsx:247` | `GitDiffPane.tsx:247` | bestätigt |
| C-12 | MIG-19 Rahmen `AiDiffPane.tsx:137` | `AiDiffPane.tsx:137` | bestätigt |
| C-13 | F-1 vollständig (keine weiteren Pane-Rahmen) | Suche `rounded-md border border-border` über `src/modules` | bestätigt |
| C-14 | MIG-20-Anker | `useSidebarPanel.ts:18-23`, `:78-81`, `:93-104`; `App.tsx:1708-1710`, `:1730`; `statusConsumers.ts:39-41` | bestätigt |
| C-15 | INV-13 neu: „… spiegeln sich im Zustand `sidebarCollapsed`, an dem Watcher und Git-Abfragen pausieren", covered durch zwei Tests | `useSidebarPanel.test.ts:44-48` (Breite nur bei User), `:64-72` (Zustand folgt Ein-/Aufklappen) decken die ersten beiden Teile; das Pausieren steht in nicht genannten Tests `useSidebarPanel.test.ts:75-91`, `statusConsumers.test.ts:37` | teilweise (D-3) |
| C-16 | INV-5 neuer Test | `guard.rs:526-539` | bestätigt |
| C-17 | Sweep PDF neu mechanisch | 1 Treffer `file.rs:194`; `preview_server` existiert noch nicht | bestätigt |
| C-18 | Sweep `DocViewToggle` zu Neue Dateien D | architecture.md Neue Dateien D und Sweep gleichlautend | bestätigt |
| C-19 | Guard-Muster Bedrohung 20 | `portsBoundary.test.ts:26` | bestätigt |
| C-20 | MIG-21: Helfer meldet Fehler nur als Text (`ssh.rs:401-410`, `:795-796`) | `ssh.rs:401-411`, `:795-796` | bestätigt |
| C-21 | MIG-21: Test `embedded_helper_read_bytes_returns_exact_bytes_within_the_cap` bleibt grün | Test prüft nur `contains("too large")`, `contains("not a regular file")` (`ssh.rs:2412-2420`) | bestätigt (bei gleichbleibendem Text) |
| C-22 | Kohärenz VAL-5/VAL-8/API-2/Fehlertabelle/Q&A 21 | gleichlautend | bestätigt |
| C-23 | Kohärenz API-6 Zustände mit MIG-6/7/8 | gleichlautend | bestätigt |
| C-24 | Kohärenz `FrameSource`-Typen Rust ↔ TS | `snake_case`-Werte `too_large`, `limit_reached` passen zum TS-Typ | bestätigt |
| C-25 | Kohärenz SVC-8 ↔ Fehlertabelle (Arten → Codes, Klick-Status) | gleichlautend | bestätigt |
| C-26 | Kohärenz übrige Stellen mit dem SSH-Leseweg | Data Flow (:318) „SSH ssh::read_bytes → Antwort"; Integrations (:538) „`ssh::read_bytes`, `ssh::realpath` \| bestehend" | Regression (D-4) |
| C-27 | Kohärenz übrige Zahlen nach RT-1/RT-6 | keine Reste von „4 je Host" oder „8 KiB" im Dokument (Suche) | bestätigt |

### Nicht gemessen

| ID | Behauptung | Grund |
|----|------------|-------|
| NM-1 bis NM-11 | wie Vorlauf (`:hover` über iframe, AppKit-Monitor, `open_url`, PDF-Betrachter, Firewall, Tokio-IO-Treiber, IPC/ACL aus iframe, Web-Versionen, LNA/Safari/WebKit, Wisch-Monitor-Reihenfolge, APFS) | NICHT GEMESSEN — andere Perspektive (runtime); vom Diff nicht in die Perspektive `code` verschoben |
| NM-12 | RFC 6265 §8.5, WHATWG „same site", sshd_config(5) `MaxSessions` Default 10, WebKit `*.localhost`, Chrome-156-PDF-Messung, Safari 18.4 | NICHT GEMESSEN — Spezifikation/Laufzeit, andere Perspektive |
| NM-13 | `pulldown-cmark` 0.13 mit `default-features = false, features = ["html"]` ohne `getopts` | NICHT GEMESSEN — Quelltext der Abhängigkeit, andere Perspektive |

---

## Befundliste (neu)

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Szenario | Resolution | aus Vorlauf offen |
|----|--------|-------|------------|-------|-------|-------------|-----------------------|----------|------------|-------------------|
| D-1 | fix | C, D (SVC-22) | architecture.md (SVC-22, SVC-8, Typ-Tabelle) | SVC-22: „die Rust-Seite übernimmt die Art aus der bestehenden internen Einteilung `RemoteError` (`Transport`, `Failed`, `Killed`, `TimedOut` …)"; Typ: „`RemoteReadError { Unreachable(String), TimedOut(String), Failed(String), Missing, NotRegularFile, TooLarge }`"; SVC-8 nennt kein `Killed` | `ssh.rs:1048-1050` (`Killed`: Helfer starb an einem Signal), erzeugt `ssh.rs:1105-1108` bei Exit 128–254; die Kopier-Logik behandelt `Killed` wie `Failed` (`ssh.rs:1912`, `:1992`) | code | Für `RemoteError::Killed` gibt es weder eine `RemoteReadError`-Art noch einen HTTP-Code oder Klick-Status | Der Helfer wird auf dem Server per OOM-Killer beendet (Exit 137); `read_bytes_typed` hat keine festgelegte Abbildung, der Code entscheidet frei zwischen 502, Wiederholung oder Panik-Zweig | `Killed` → `Failed` (502; beim Klick `unreachable`), ohne Wiederholung; in SVC-22 und SVC-8 nennen | nein |
| D-2 | fix | F (MIG-21) | architecture.md (MIG-21, SVC-22) | MIG-21: „der Helfer gibt bei `read_bytes` eine feste Art (`missing`, `not_regular`, `too_large`) im Antwort-Umschlag mit" | `helper_answer` liest nur `error` und gibt `Failed(String)` (`ssh.rs:1259-1270`); `Failed(message)` wird in der Kopier-Logik mit genau einem Feld zerlegt (`ssh.rs:1912`, `:1992`, `:2047-2053`) | code | Die Map nennt keine Stelle, an der die Rust-Seite das neue Feld liest; ein zusätzliches Feld an `RemoteError::Failed` oder eine neue Variante ändert die Muster der Kopier-Logik | Ein Slice ergänzt nur den Python-Helfer und `read_bytes_typed`; `run_remote_json` liefert weiter `Failed("[Errno 2] …")` ohne Art → jede fehlende Datei wird `Failed` → 502 statt 404, also genau das Fehlerbild aus R-1 | MIG-21 ergänzen: Lesestelle der Art (`helper_answer`, `ssh.rs:1230-1273`, oder eigene Auswertung des Umschlags in `read_bytes_typed`) und Folge für die Kopier-Muster (`ssh.rs:1912-1924`, `:1992`, `:2047-2053` unverändert oder mit angepasst) | nein |
| D-3 | fix | E3 (INV-13) | architecture.md (INV-13) | INV-13: „… spiegeln sich im Zustand `sidebarCollapsed`, an dem Watcher und Git-Abfragen pausieren", Coverage `covered` mit „only persists a positive width from direct user interaction", „mirrors collapse and expand as state" | genannte Tests `useSidebarPanel.test.ts:44-48`, `:64-72` prüfen Breite und Zustand, kein Pausieren; das Pausieren prüfen `useSidebarPanel.test.ts:75-91` „keeps an explorer that starts collapsed free of watches until it opens" und `statusConsumers.test.ts:37` „is idle with the sidebar collapsed, a terminal tab and no git widget" | code | Am Testinhalt deckt die genannte Liste den Teil „Watcher und Git-Abfragen pausieren" nicht | Ein Umbau für MIG-20 lässt Watcher im Zen laufen; die zwei genannten Tests bleiben grün, INV-13 gilt trotzdem als gedeckt | die zwei Tests mit Pausier-Bezug in INV-13 ergänzen | nein |
| D-4 | fix | F (Kohärenz) | architecture.md (Data Flow, Integrations) | Data Flow (:318): „SSH ssh::read_bytes → Antwort"; Integrations (:538): „`ssh::read_bytes`, `ssh::realpath` \| bestehend" | SVC-8 (:170) und K7 nennen `ssh::read_bytes_typed` (SVC-22, neu) | artifact | Der entschiedene SSH-Leseweg steht an zwei Stellen verschieden | Ein Slice-Writer liest Data Flow/Integrations und baut SVC-8 auf `read_bytes` mit Text-Fehler | beide Stellen auf `ssh::read_bytes_typed` (neu, SVC-22) umstellen | nein |
| O-6 | obligation | D (MIG-21) | – (implement) | K7-Nachweis: „Helfer-Test: fehlende Datei, Ordner, zu große Datei melden `missing`, `not_regular`, `too_large`" | Art-Literale entstehen im Python-Text (`REMOTE_PYTHON`), gelesen in Rust; Abgleich Helfer ↔ Rust gibt es heute nur für `MAX_READ` (`ssh.rs:2462-2467`); der Erfolgs-Test dekodiert über die Rust-Funktion `parse_read_bytes` (`ssh.rs:2407`) | code | Der Helfer-Test dekodiert die Fehlerantwort über dieselbe Rust-Funktion wie `read_bytes_typed` und erwartet `Missing`, `NotRegularFile`, `TooLarge`; ein umbenanntes Literal auf einer Seite macht den Test rot | Python meldet `"not_regular"`, Rust erwartet `"not_regular_file"` → stiller Rückfall auf `Failed` → Ordner ohne Schrägstrich `502` statt `404` | – | nein |

Kein blockierender Befund offen; JSON-Block entfällt.
