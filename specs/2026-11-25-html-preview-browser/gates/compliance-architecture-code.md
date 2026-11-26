# Gate 1 — Architecture Compliance, Perspektive `code`

| Kopf | Wert |
|------|------|
| Geprüft | `specs/2026-11-25-html-preview-browser/architecture.md` (895 Zeilen) gegen `discovery.md`, Zusatz-Kontext `dossier-vorschau.md` |
| Codebase | `/home/claude/litha/produkte/terax/terax-ai`, Branch `main`, `cf07327`; Upstream-Vergleich über `git show upstream/main:…` |
| Prüfdatum | 2026-11-25 |
| Perspektive | `code` (Bestandscode, Contracts, Typen an der Grenze Rust↔TypeScript, Layer-Grenzen, Tests, Invarianten, Migration Map) |
| Lauf | offen (kein Delta), gemessen nur durch Lesen; kein Build, kein Test, kein `cargo` |
| Bekannte Weichen, nicht erneut gemeldet | Q&A 2 (Esc nur in Vorschau-Tabs), Q&A 4 (PDF ohne `sandbox`), Q&A 6 (BR-4 enger oberhalb des Home) |

## Skript-Tabelle (Arch-Precheck, übernommen)

`gates/arch-precheck.json`: `result: PASS`, 0 Befunde, 0 blockierend, 0 Warnungen.

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

| Klasse | Anzahl |
|--------|--------|
| decision | 0 |
| refuted | 1 |
| fix | 9 |
| obligation | 5 |
| note | 6 |

Prüfmenge: 84 Bestands-Behauptungen erhoben, 73 gemessen, 11 nicht gemessen (andere Perspektive). Self-Check: 73 + 11 = 84.

**Verdict:** FAILED (ein `refuted`-Befund: R-1)

---

## Check A — Feature Mapping

Die Zuordnungstabelle (architecture.md:756-827) nennt alle 62 `[W1]`- und beide `[W2]`-Kennungen (Zählung aus Discovery: BR 24 + FL 7 + EP 6 + UI 5 + ST 4 + TR 4 + DF 4 + TG 8 = 62). Geprüft wurde, ob der genannte Abschnitt die Anforderung inhaltlich erfüllt: alle BR- und EP-Zeilen, dazu 16 Zeilen aus den übrigen Gruppen.

| Anforderung | Genannter Abschnitt | Inhaltlich erfüllt? | Status |
|-------------|---------------------|---------------------|--------|
| BR-1 | SEC-4, VAL-1, API-1 | Bindung `127.0.0.1:0`, Host-Prüfung genau `127.0.0.1:{port}` | PASS |
| BR-2 | SEC-4, SVC-1 | Port vom Betriebssystem | PASS |
| BR-3 | SEC-1, VAL-4, SVC-10 | 256 Bit, erstes Pfadsegment, leere `404` | PASS |
| BR-4 | SEC-2, SVC-2, VAL-5, VAL-6 | Ordner + Unterordner, `../` fällt aus dem Geheimnis-Segment; Abweichung Q&A 6 bekannt | PASS (Q&A 6 bekannt); Kohärenz VAL-5/API-2 siehe F-3 |
| BR-5 | SVC-8, SEC-5, VAL-10 | SSH-Weg über `ssh::read_bytes`, Host nur aus der Freigabe, WSL `unsupported` | PASS; Fehlerbild über SSH siehe R-1 |
| BR-6 | NFR-5, SVC-6, API-2 | jede Anfrage liest neu, `no-store` | PASS |
| BR-7 | API-1, SVC-19 | zusätzlich, In-App bleibt ohne Baustein E | PASS |
| BR-8 | SVC-11, API-1 | `open_url` von der Rust-Seite, Standard-Browser | PASS |
| BR-9 | VAL-10, SVC-5, SVC-2 | HTML, Bilder, PDF in W1; Markdown erst W2 | PASS |
| BR-10 | VAL-7, SEC-6 | Sperrliste auf Text und Ziel, `.git`, nie `trusted` | PASS |
| BR-11 | VAL-6, SVC-7, SVC-8 | Ziel nach Auflösen, lokal vor/nach Öffnen, SSH am gemeldeten Ziel | PASS |
| BR-12 | VAL-8, VAL-9, SEC-16 | 10 MiB, reguläre Datei, PDF-Echtheit | PASS; SSH-„zu groß" siehe R-1 |
| BR-13 | SVC-8, SEC-14, SEC-16 | heutiger Leseweg, 4 je Host | PASS |
| BR-14 | SEC-7, SVC-6, SVC-1, VAL-4 | Port je Freigabe = eigene Herkunft; träge Arten `sandbox`; PDF Q&A 4 bekannt | PASS |
| BR-15 | SEC-1, SVC-1, VAL-11 | nur Speicher, Ende mit Prozess, keine Verdrängung | PASS |
| BR-16 | SEC-3, SEC-8 | ein Aufrufer, Adresse nie in der Webview | PASS; Guard-Lücke siehe F-6 |
| BR-17 [W2] | SVC-20 | statisch, ohne Formeln/Farben, Bilder über Ordner-Freigabe | PASS |
| BR-18 | SVC-17, MIG-6, MIG-13, MIG-14 | Attribut + Rückfallregel nur für `html` | PASS |
| BR-19 | SVC-15, MIG-10–12 | Kopf, Statusleiste, Seitenleiste, Griff, Polster, Rahmen | PASS mit Lücken in der Map: F-1 (Rahmen weiterer Panes), F-2 (Seitenleiste) |
| BR-20 | API-3/4/7, SVC-16, SVC-18 | Taste, Esc, Kürzel; Q&A 1/2 | PASS (Q&A 2 bekannt) |
| BR-21 | SVC-14, MIG-5–8, NFR-8 | gemeinsame Zeile, kein Overlay | PASS |
| BR-22 | API-6 | Zähler je Pane, lokal und SSH | PASS |
| BR-23 | MIG-9, SVC-14 | Dateiname + Im Browser öffnen + Zen über Bild/PDF und Karte | PASS (SVG siehe N-5) |
| BR-24 | SEC-9 | Sandbox-Tokens unverändert, Quelltext-Test | PASS |
| BR-25 | SVC-12, SVC-14 | Liste je Welle, Guard gegen SVC-5 | PASS |
| EP-1 | VAL-4 | kein Inhalt ohne Geheimnis | PASS |
| EP-2 | SEC-4 | nur `127.0.0.1` | PASS |
| EP-3 | VAL-5, VAL-6, VAL-7 | Fehler je Datei, Seite lädt weiter | PASS |
| EP-4 | SEC-1 | Sockets enden mit dem Prozess | PASS |
| EP-5 | VAL-8, SEC-16 | lokal belegt; über SSH nur per Textvergleich erkennbar | PASS mit R-1 |
| EP-6 | SVC-13, API-5 | Toast je Status, Wortlaut Q&A 11 | PASS |
| FL-1 | API-1, API-5 | Klick → Command → Browser | PASS |
| FL-2 | API-2, SVC-7, SVC-8 | Nachbardateien relativ (Q&A 7 im Log) | PASS |
| FL-4 | API-6 | Neu laden ohne Tab-Wechsel | PASS |
| FL-5 | API-7, SVC-15 | Aufbau verschwindet | PASS mit F-1, F-2 |
| FL-7 | SVC-17 | kein Tab-Wechsel über HTML | PASS |
| UI-1 | API-5, SVC-12 | `available`/`hidden` über SVC-12 | PASS |
| UI-2 | SVC-14 | `default`/`zen`, Kopfzeile bleibt im Zen | PASS |
| UI-3 | API-6 | Zustand `loading` nirgends beschrieben | FIX (F-7) |
| UI-5 | MIG-15, SVC-12 | nur bei ausgelieferter Art, Workspace aus dem Explorer-Store | PASS |
| ST-2 | SVC-1, API-1 | Wiederverwendung je Ort + Datei + Klasse | PASS |
| TR-3 | API-7 | Taste oder Kürzel | PASS |
| DF-1 | API-2, SVC-11, SEC-4 | IP statt `localhost`, Geheimnis im Pfad | PASS |
| DF-2 | SEC-1, VAL-4 | an eine Freigabe gebunden | PASS |
| DF-3 | SEC-5, SVC-1 | Host aus der Freigabe | PASS |
| DF-4 | VAL-8, SEC-16 | 10 MiB je Datei | PASS |
| TG-8 | MIG-5 | Umschalter in der Zeile | PASS |

Weitere Abweichungen von Discovery-Entscheidungen außerhalb des Q&A-Logs: keine gefunden.

## Check B — Constraint Mapping

| Constraint | Architecture-Antwort | Evidenz | Status |
|-----------|----------------------|---------|--------|
| 10 MB je Datei (DF-4, BR-12) | VAL-8, `MAX_READ_BYTES` | `file.rs:16` = `10 * 1024 * 1024`, `pub(crate)` | PASS |
| SSH je Datei ein Prozess, kein Range (BR-13) | SEC-14, SVC-8 | `ssh.rs:1142-1209` ein `ssh`-Exec je Aufruf | PASS |
| Zeitgrenzen | SEC-13, SEC-15, SEC-16 | `ssh.rs:1506-1509`; mit `expected_size: None` 244 s je Datei (Rechnung siehe N-2) | PASS, N-2 |
| Fokus im iframe | SVC-18 | `useGlobalShortcuts.ts:65` Listener nur am Eltern-`window` | PASS |
| Wischen sieht nicht ins iframe | SVC-17 | `useTabSwipe.ts:35-37` | PASS |
| Seitenleiste speichert Einklappen | MIG-11 „ohne Speichern" | `App.tsx:1708-1710` → `useSidebarPanel.ts:93-104` | Mechanismus fehlt in der Map: F-2 |
| Windows/Linux kompilieren (R8) | `cfg`-Arme | CI: `ci.yml:92` `clippy -D warnings` (Linux), `ci.yml:107-133` nextest auf Windows/macOS | PASS mit O-2 |

## Check C — Typen an der Command-Grenze (statt Datenbank)

Datenbank: N/A, keine Datenbank. Geprüft wurden Rust-Struct ↔ TS-Typ, `serde`-Benennung und Fehlerform gegen das Muster `BrowserView` (`chrome.rs:25-46`) und `fs_read_remote_image` (`file.rs:157-166`).

### Data Type Verdicts

| Feld | Arch-Typ | Evidenz | Verdict |
|------|----------|---------|---------|
| `BrowserOpen` (Container) | `#[derive(Serialize)] #[serde(rename_all = "camelCase")]` | Muster `chrome.rs:38-46`; Felder einwortig | PASS |
| `BrowserOpenStatus` | `#[serde(rename_all = "snake_case")]` → `"too_large"`, `"limit_reached"`, `"open_failed"` | Muster `ViewStatus` `chrome.rs:25-35` | PASS |
| `BrowserOpen.reason` | `Option<String>` ↔ `string \| null` | serde schreibt `None` als `null` ohne `skip_serializing_if`; Muster `chrome.rs:45` | PASS |
| `FrameSource`/`FrameStatus` | `struct FrameSource { status: FrameStatus, url: Option<String>, reason: Option<String> }` ohne `derive`/`serde`-Angabe | architecture.md:355 vs. :354 | FIX (F-8) |
| Args `preview_open_in_browser` | `path: String, workspace: Option<WorkspaceEnv>` ↔ `{ path, workspace }` | Muster `file.rs:157-160` | PASS |
| `WorkspaceEnv` | bestehend, nur `Deserialize`, `tag = "kind"` | `workspace.rs:320-334`; TS `env.ts:5-8` (Zusatzfeld `label` wird ignoriert) | PASS |
| `zen_escape_arm` | `fn zen_escape_arm(armed: bool)` ↔ `invoke<void>(…, { armed })` | Rückgabe `()` zulässig | PASS (Warnungen auf Linux: O-2) |
| Event `terax:zen-escape` | `app.emit(…, ())` ↔ `listen<null>` | `()` serialisiert zu `null`; Muster `lib.rs:119` | PASS |
| Fehlerform | `Result<_, String>` | Muster `chrome.rs:57`, `file.rs:160` | PASS |
| `Grant.token` | 64 Hex aus 32 Bytes `getrandom::fill` | upstream `assets.rs:64-65` | PASS (nur intern) |

## Check D — Completeness + Dependencies (Code-Seite)

| Item | Evidenz | Status |
|------|---------|--------|
| Externe Schnittstelle SSH-Helfer: Fehlerformen | `ssh.rs:1055-1064` faltet alle `RemoteError`-Arten in `String`; `ssh.rs:1490-1502` gibt `Result<_, String>` | REFUTED (R-1) |
| SSH-Lesen blockiert den Thread | `ssh.rs:1142-1209` synchron (`std::process`, `wait_child`) | OBLIGATION (O-1) |
| Opener aus Rust, ohne Capability | `chrome.rs:66-72`; `capabilities/default.json:23` | PASS |
| Lockfile ohne neue Crate | `Cargo.lock:4895-4907` tokio mit `bytes`, `mio`, `socket2`, `tokio-macros`; `httparse` `:1780`, `getrandom 0.4.3` `:1483`, `percent-encoding` `:3020` | PASS |
| Versionen Arch vs. Lockfile/package.json | tokio 1.54.1, httparse 1.10.1, getrandom 0.4.3, percent-encoding 2.3.2, opener 2.7.2 (`:4564`), tauri 2.12.5 (`:4377`); `package.json:67,98,108,124,136` | PASS |
| Aktuellste Versionen im Netz | – | NICHT GEMESSEN (runtime) |

## Check E — Pattern Consistency (Gate 1b)

N/A — kein `codebase-scan.md` im Spec-Ordner.

## Check E2 — Bindings Coverage (Gate 1c)

N/A — keine `bindings.md` und kein `reconcile_path`.

## Check E3 — Existing-Behavior Invariants (Gate 1d)

Formal N/A (kein `codebase-scan.md`). Die INV-Tabelle (architecture.md:449-463) ist trotzdem eine Bestands-Behauptung und wurde am Testinhalt gemessen:

| INV | Source trägt die Invariante? | Test deckt am Inhalt? | Konsumenten | Status |
|-----|------------------------------|-----------------------|-------------|--------|
| INV-1 | `tabSwipe.ts:23-42` | ja: `isInsideHorizontalScroller.test.ts:43-55` (Raum, dir 1), `:57-68` (Kante), `:109-117` (`data-no-tab-swipe`) | `useTabSwipe.ts:37` einziger Aufrufer | PASS |
| INV-2 | `applyDocView.ts:16-68` | ja: `applyDocView.test.ts:61-69` (Id 4 bleibt, `kind: editor`), `:90-93` (dirty → gleiche Referenz) | `WorkspaceSurface.tsx:37`, `EditorStack.tsx:39-42` | PASS |
| INV-3 | `binaryPreview.ts:93`; `file.rs:240-259` | ja: `binaryPreview.test.ts:43-51`; `file.rs:836-845` | `EditorPane.tsx:430-435` | PASS |
| INV-4 | `PreviewPane.tsx:115-116` | ja: `PreviewPane.test.ts:34-39`, `:41-46`, `:55-57` | – | PASS |
| INV-5 | `guard.rs:172-207`, `:243-285` | teilweise: die drei genannten Tests decken Namen, Ordner und Ordner-Symlink (`guard.rs:548-560`), nicht den Datei-Symlink | `file.rs:98`, `:153` | FIX (F-9) |
| INV-6 | `asset.rs:10-18` | ja: `asset.rs:58-70` | `asset.rs:31` | PASS |
| INV-7 | `file.rs:182-189` | ja: `file.rs:766-784` | `useRemoteImage.ts:41-52` | PASS |
| INV-8 | Quelltext-Grenze | ja: `portsBoundary.test.ts:41-47` mit `PORTS_SURFACE = /ssh_port_\|modules\/ports/` (`:26`) | `terminal.ts:64` | PASS |
| INV-9 | `EditorPane.tsx:456-462` | ja: `EditorStack.window-hidden.test.tsx:115-137` | – | PASS |
| INV-10 | `App.tsx:1086`, `shortcuts.ts:317-321`, `App.tsx:1634`, `:1796` | `uncovered` stimmt (kein Test) | – | PASS |
| INV-11 | `App.tsx:1172-1184` | `uncovered` stimmt | `App.tsx:1185` | PASS |
| INV-12 | `HtmlPreviewPane.tsx:35-36` | `uncovered` stimmt | `:107`, `:114` | PASS |
| INV-13 | Breite: `useSidebarPanel.ts:18-23` nur bei `isUserInteraction`; Einklappen: `App.tsx:1708-1710` → `useSidebarPanel.ts:93-104` ohne solche Prüfung | Aussage stimmt heute nur, weil jedes heutige Einklappen von einer User-Aktion kommt; der Zen-Weg läuft durch denselben ungeprüften Pfad | `statusConsumers.ts:39-49`, `App.tsx:1730` lesen `sidebarCollapsed` | FIX (F-2) |

## Check F — Migration Completeness

Anwendbar (Migration Map vorhanden, Umbau bestehender Dateien).

| Item | Evidenz | Status |
|------|---------|--------|
| Map nennt Dateien, nicht Ordner | AR-10 (Skript) | PASS (Skript) |
| `DocViewToggle`-Konsumenten vollständig | `grep -rn DocViewToggle src --include=*.tsx`: nur `HtmlPreviewPane.tsx:102`, `MarkdownPreviewPane.tsx:72`, `EditorStack.tsx:53` = MIG-6/7/8 | PASS |
| Zen-Konsumenten vollständig | `App.tsx:962,975,1086,1497,1539,1634,1796`; über Parameter `useSourceControlContext.ts:28,95` → `statusConsumers.ts:49`, `commands.ts:227` (nur lesend) | PASS |
| `useTabSwipe`/`isInsideHorizontalScroller`-Konsumenten | nur `App.tsx:1185` bzw. `useTabSwipe.ts:37` | PASS |
| Tab-Arten in `serialize.ts` | unverändert, `serialize.ts:126`, `:260-269` | PASS |
| Pane-Rahmen im Zen | `PreviewPane.tsx:69`, `GitDiffPane.tsx:247`, `AiDiffPane.tsx:137` tragen denselben Rahmen, fehlen in der Map | FIX (F-1) |
| Seitenleiste im Zen | `useSidebarPanel.ts` fehlt in der Map; Konsumenten von `sidebarCollapsed` nicht genannt | FIX (F-2) |
| Sweep `PDF_MAGIC\|%PDF-` mechanisch | 8 Treffer heute: Definition `file.rs:194`, Kommentare `:196`, `:201`, Nutzung `:246`, `:259`, Test-Literale `:832`, `:870`, `:883` | FIX (F-4) |
| Sweep `DocViewToggle` mechanisch | widerspricht „nimmt Rendered/Raw … als Kinder bzw. Props" (architecture.md:383) | FIX (F-5) |
| Target Pattern MIG-8 | Neuaufbau per Schlüssel; vorhandenes `EditorPaneHandle.reload` | NOTE (N-1) |

## Plattform-Grenzen (Windows, Linux)

| Baustein | Evidenz | Status |
|----------|---------|--------|
| `libc` nur `cfg(unix)` | `Cargo.toml:58-59`; `F_GETPATH` nur im macOS-Arm | PASS |
| `opened_path`/`within` Windows-Arm | upstream nutzt `to_canon` (`upstream/main:…/assets.rs:249-258`); Fork hat `fs::to_canon` (`fs/mod.rs:16-27`) | OBLIGATION (O-2) |
| `zen_escape_arm` auf Linux | CI `clippy --all-targets -- -D warnings` (`ci.yml:92`); Muster `_text` (`lib.rs:163`) | OBLIGATION (O-2) |
| `tauri.linux.conf.json`, `tauri.windows.conf.json` | nur Fenster-Dekoration/Transparenz, keine CSP- oder Asset-Felder | PASS |
| Esc-Monitor app-weit | Muster `addLocalMonitorForEventsMatchingMask` (`lib.rs:126-129`) filtert kein Fenster; Settings-Fenster existiert (`lib.rs:355-357`) | OBLIGATION (O-4) |

---

## Bestands-Behauptungen

| ID | Behauptung (architecture.md) | Beleg | Verdikt |
|----|------------------------------|-------|---------|
| B-01 | Helfer `read_bytes` löst auf und meldet das Ziel (:170, :840) | `ssh.rs:394-412` `real = os.path.realpath(path)`, Rückgabe `{"real": …}` | bestätigt |
| B-02 | nur reguläre Dateien, `O_NOFOLLOW`, Grenze vor dem Senden (:840) | `ssh.rs:400-410` | bestätigt |
| B-03 | Signatur `ssh::read_bytes(host, pfad, MAX_READ_BYTES, None)` (:170) | `ssh.rs:1490-1502` | bestätigt |
| B-04 | Zeitbudget `read_bytes_timeout` (:260) | `ssh.rs:1506-1509`, `:897-909`; mit `None` 244 s | bestätigt (N-2) |
| B-05 | Transport → `unreachable`, Zeitüberschreitung → `timeout`; `ssh.rs` bleibt unverändert (:170, :363, :328-332) | `ssh.rs:1055-1064`, `:1490-1502`, `:795-796` | widerlegt (R-1) |
| B-06 | Home über `ssh::realpath(host, "~")` (:164) | `ssh.rs:371-374` `expanduser`; `:1465-1472` | bestätigt |
| B-07 | Pfad als JSON über stdin (:250) | `ssh.rs:1153`, `:1182-1186` | bestätigt |
| B-08 | `warn` bei Zeitüberschreitung (:332) | `ssh.rs:1200` | bestätigt |
| B-09 | Passphrase ohne Master → Meldung (:331) | `ssh.rs:944-962` `classify_ssh_error` | bestätigt |
| B-10 | ein `ssh`-Aufruf je Datei über den Master (:170) | `ssh.rs:1142-1209` | bestätigt |
| B-11 | Helfer-Test bei `ssh.rs:2364` (:577) | `:2364` ist `run_helper`; der Symlink-Test steht bei `:2425` | bestätigt, Anker ungenau (N-6) |
| B-12 | `guard::check_read_str` als Sperrliste ohne `trusted` (:216) | `guard.rs:172-207` | bestätigt |
| B-13 | Sperrliste lässt `.git` lesbar (:841) | `guard.rs:12-13` | bestätigt |
| B-14 | `fs_read_file` mit `trusted` prüft über SSH nichts (:509) | `file.rs:94-101` | bestätigt |
| B-15 | Muster `fs_read_remote_image_with`, Prüfung nach dem Lesen (:170, :240) | `file.rs:176-191`, `:185-189` | bestätigt |
| B-16 | Host-Ersatz-Muster (:170, :488) | `file.rs:753-764` | bestätigt |
| B-17 | `MAX_READ_BYTES` 10 MiB (:217) | `file.rs:16` | bestätigt |
| B-18 | Magic inline, Tests `is_pdf_*` (:427) | `file.rs:241-259`, `:827-919` | bestätigt |
| B-19 | `asset_dir_target` nimmt nur Wurzel und Home aus (:231) | `asset.rs:10-18` | bestätigt |
| B-20 | Muster `BrowserView` (:116) | `chrome.rs:25-46` | bestätigt |
| B-21 | Opener aus Rust, keine Capability (:173, :360) | `chrome.rs:66-72`; `default.json:23` | bestätigt |
| B-22 | Opener-Ersatz `view_with` (:490) | `chrome.rs:509-515` | bestätigt |
| B-23 | kein App-Manifest (:93, :837) | `build.rs:3-6` | bestätigt |
| B-24 | Capabilities ohne `remote` (:242, :290) | `default.json`, `desktop.json` | bestätigt (N-4) |
| B-25 | `frame-src … http:` (:361, :687) | `tauri.conf.json:28` | bestätigt |
| B-26 | `titleBarStyle: Overlay` (:512) | `tauri.conf.json:21-22` | bestätigt |
| B-27 | tokio nur `rt`, `time`; `proptest`; `libc` unix; `NSEvent` aktiv (:424, :275, :533, :532) | `Cargo.toml:50`, `:55`, `:58-59`, `:67` | bestätigt |
| B-28 | keine neue Crate im Lockfile (:424) | `Cargo.lock:4895-4907`, `:1483-1496`, `:1780`, `:3020` | bestätigt |
| B-29 | Lockfile-Versionen (:521-526) | `Cargo.lock:4896`, `:1781`, `:1484`, `:3021`, `:4564`, `:4377` | bestätigt |
| B-30 | package.json-Versionen (:527-530) | `package.json:67`, `:98`, `:108`, `:124`, `:136` | bestätigt |
| B-31 | Upstream: Cargo-Zeilen, `Grant`-Felder, Token, `within`/`opened_path` mit `cfg`-Armen (:119, :424, :515) | `upstream/main:src-tauri/Cargo.toml:46-47`; `…/assets.rs:13-18`, `:64-65`, `:244-310` | bestätigt |
| B-32 | 18 Module (:425) | `modules/mod.rs:1-18` | bestätigt |
| B-33 | `lib.rs`-Anker: Monitor, `setup`, Command-Liste, Exit (:426, :180) | `lib.rs:67-131`, `:372`, `:393-499`, `:505` | bestätigt |
| B-34 | `WorkspaceEnv` Rust/TS (:118) | `workspace.rs:320-334`; `env.ts:5-8` | bestätigt |
| B-35 | `HtmlPreviewPane`-Anker (:429, :181) | `HtmlPreviewPane.tsx:26-28`, `:35-36`, `:38-46`, `:54-69`, `:71-93`, `:98`, `:102` | bestätigt |
| B-36 | `MarkdownPreviewPane`-Anker (:430) | Effekt `:38-63`, Rahmen `:68`, Overlay `:72`, Scroller `:73` | bestätigt |
| B-37 | `EditorStack`-Anker (:431) | `EditorStack.tsx:51`, `:52-59` | bestätigt |
| B-38 | `EditorPane`-Anker (:432) | `EditorPane.tsx:382-413`, `:445-484`, `:486-509` | bestätigt |
| B-39 | `DocViewToggle` Overlay, eigene Datei (:428) | `DocViewToggle.tsx:19`; Commit `672ce69` | bestätigt |
| B-40 | Map deckt alle `DocViewToggle`-Konsumenten (MIG-6–8) | `grep`: 3 Konsumenten | bestätigt |
| B-41 | Polster je Schicht (:433) | `WorkspaceSurface.tsx:89`, `:109`, `:125`, `:139`, `:153`, `:167`, `:181` | bestätigt |
| B-42 | Zen nur `useState`, Leser `:975`, `:1497`, `:1539`, `:1634`, `:1796` (:434, :842) | `App.tsx:962` usw.; Parameter-Konsumenten nur lesend | bestätigt |
| B-43 | Seitenleiste speichert Einklappen in `onResize` (:513, :842) | `App.tsx:1708-1710` | bestätigt |
| B-44 | Map deckt den Zen-Weg der Seitenleiste (MIG-11) | `useSidebarPanel.ts:78-104`, `statusConsumers.ts:39-49`, `App.tsx:1730` fehlen | widerlegt als vollständig (F-2) |
| B-45 | Map deckt „Rahmen der Pane" (SVC-15, MIG-6–8) | `PreviewPane.tsx:69`, `GitDiffPane.tsx:247`, `AiDiffPane.tsx:137` fehlen | widerlegt als vollständig (F-1) |
| B-46 | Eingabezeile `open = …` (:435, :843) | `WorkspaceInputBar.tsx:77-78` | bestätigt |
| B-47 | `useTabSwipe` gibt nur über `isInsideHorizontalScroller` nach (:436) | `useTabSwipe.ts:35-37`; einziger Konsument `App.tsx:1185` | bestätigt |
| B-48 | `isInsideHorizontalScroller` (:437) | `tabSwipe.ts:23-42` | bestätigt |
| B-49 | Explorer-Menü und Workspace aus dem Store (:438) | `FileExplorer.tsx:788-805`, `:223` | bestätigt |
| B-50 | Tabs speichern nur Pfad und Workspace (:143, :683) | `serialize.ts:126`, `:260-269` | bestätigt |
| B-51 | kalte Tabs kosten nichts; `DocStack` bleibt unverändert (:364, :683) | `DocStack.tsx:94-101` | bestätigt |
| B-52 | Kürzel Mod+Shift+' (:106) | `shortcuts.ts:316-321` | bestätigt |
| B-53 | App-Kürzel kommen bei Fokus im iframe nicht an (:510) | `useGlobalShortcuts.ts:65` Listener am Eltern-`window` | bestätigt |
| B-54 | Guard-Muster (:232, :382) | `portsBoundary.test.ts:26`, `:41-47`; `chromeProbe.guard.test.ts:10-16` | bestätigt |
| B-55 | Quelltext-Test-Muster der Sandbox (:243) | `PreviewPane.test.ts:20-56` prüft wörtliches `sandbox="…"` | bestätigt (O-5) |
| B-56 | Symbol `LinkSquare02Icon` (:381) | `PreviewAddressBar.tsx:216-231` | bestätigt |
| B-57 | `TERAX.md`-Anker 20, 44-45, 73, 121 | gelesen | bestätigt |
| B-58 | `MaxSessions` bei `ports.rs:317` (:258) | Kommentar nennt `MaxSessions`, keinen Wert | bestätigt (nur Hinweis, kein Zahlenbeleg für „4") |
| B-59 | Raw: heute nur Overlay, kein Neu laden in der Kopfzeile (:431) | `EditorStack.tsx:52-59`; `EditorPaneHandle.reload` existiert (`EditorPane.tsx:58-59`, `:352`) | bestätigt (N-1) |
| B-60 | Prüfbar unter Linux mit `cargo test --locked` (:550) | `ci.yml:86-100`, `:107-133` | bestätigt (O-2) |
| INV-1 … INV-13 | 13 Zeilen (:451-463) | Tabelle Check E3 | 12 bestätigt, INV-5 und INV-13 mit FIX |

### Nicht gemessen

| ID | Behauptung | Grund |
|----|------------|-------|
| NM-1 | `:hover` reicht über einem iframe bis zum iframe-Element (:576) | NICHT GEMESSEN — andere Perspektive (runtime, WebKit) |
| NM-2 | Lokaler AppKit-Monitor sieht `keyDown` bei Fokus im iframe (:575) | NICHT GEMESSEN — andere Perspektive (runtime, AppKit) |
| NM-3 | Wisch-Monitor sieht Ereignisse vor WKWebView (`lib.rs:64-65`, :575) | NICHT GEMESSEN — Beleg ist ein Kommentar (P3); Laufzeit, andere Perspektive |
| NM-4 | `open_url(url, None)` öffnet den Standard-Browser; Signatur mit `None` (:173, :525) | NICHT GEMESSEN — Quelltext der Abhängigkeit, andere Perspektive (runtime) |
| NM-5 | PDF-Betrachter ohne `sandbox` (:574) | NICHT GEMESSEN — andere Perspektive (runtime, Browser) |
| NM-6 | Keine Firewall-Nachfrage bei `127.0.0.1` (:572) | NICHT GEMESSEN — andere Perspektive (runtime, macOS) |
| NM-7 | Tauri-Laufzeit hat mit `net` den IO-Treiber aktiv | NICHT GEMESSEN — Abhängigkeit, andere Perspektive |
| NM-8 | App-Commands aus einem `127.0.0.1`-iframe nicht aufrufbar; `removeUnusedCommands` (`tauri.conf.json:11`) ohne Wirkung auf neue Commands | NICHT GEMESSEN — Abhängigkeit/ACL-Laufzeit, andere Perspektive |
| NM-9 | Neueste Versionen laut Web (:521-526) | NICHT GEMESSEN — Web, andere Perspektive |
| NM-10 | Chrome LNA, Safari `Sec-Fetch-*`, WebKit Mixed Content (:534, :847-849) | NICHT GEMESSEN — andere Perspektive (runtime) |
| NM-11 | APFS liefert Wurzel und Ziel in derselben Schreibweise (:578) | NICHT GEMESSEN — Dateisystem-Laufzeit, andere Perspektive |

---

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|----|--------|-------|------------|-------|-------|-------------|-----------------------|------------|-------------------|
| R-1 | refuted | D, Bestand | architecture.md (SVC-8, Nahtstellen „Unverändert, bewusst", Error Handling) | SVC-8 (:170): „Fehler des Transports zu `unreachable`, Zeitüberschreitung (`ssh.rs:1506-1509`) zu `timeout`"; (:363): „`src-tauri/src/modules/ssh.rs` \| Leseweg wird nur genutzt (BR-13)"; (:328-332): „Datei fehlt → `404`", „Größer als 10 MiB → `403`", „SSH nicht lesbar → `502`", „Zeitbudget → `504`" | `ssh.rs:1490-1502` `pub fn read_bytes(…) -> Result<RemoteFileBytes, String>`; `ssh.rs:1055-1064` `impl From<RemoteError> for String` gibt bei `Transport`, `Failed`, `Killed`, `TimedOut` nur die Nachricht weiter; `ssh.rs:1045` `enum RemoteError` ist privat; Helfer-Fehler als `str(ex)` (`ssh.rs:795-796`); „zu groß" und „kein reguläres File" nur als Text (`ssh.rs:401-410`, angeheftet durch `ssh.rs:2415`, `:2420`); `ssh.rs:1506-1509` ist die Budget-Rechnung, kein Fehlertyp | code | Ein zweiter Agent findet in `ssh.rs` keine öffentliche Funktion, die zu `read_bytes` die Fehlerart liefert. SVC-8 kann `Transport` (z. B. „ssh: Control socket …", „no response from the remote helper") und `Failed` (z. B. „[Errno 2] No such file or directory: …") nur über Textvergleich trennen, und die Transport-Texte sind keine geschlossene Liste | Entscheiden und in architecture.md festhalten: (a) `ssh.rs` bekommt eine Lesefunktion mit typisiertem Fehler (Fehlerart an der Grenze), MIG-Zeile ergänzen, `ssh.rs` aus „Unverändert, bewusst" streichen; oder (b) Klassifikation über die angehefteten Texte („too large", „not a regular file", „timed out after") mit eigenem Test, und die Folge benennen: eine über SSH fehlende Datei ergibt `502` statt `404`, eine Ordner-Anfrage läuft über „not a regular file" auf `index.html` | nein |
| F-1 | fix | F, A (BR-19) | architecture.md (SVC-15, Migration Map) | SVC-15 (:177): „Was im Zen weicht: … Rahmen der Pane"; Map ändert Rahmen nur in MIG-6, MIG-7, MIG-8 | Gleicher Rahmen `rounded-md border border-border/60` in `src/modules/preview/PreviewPane.tsx:69`, `src/modules/editor/GitDiffPane.tsx:247`, `src/modules/editor/AiDiffPane.tsx:137`; MIG-10 entfernt das Polster für alle Schichten (`WorkspaceSurface.tsx:125`, `:167`, `:181`) | code | Im Zen bleibt in Web-Vorschau-, Git-Diff- und KI-Diff-Tabs ein Rahmen ohne Polster stehen; BR-19 („den Rahmen aus, sodass der Tab-Inhalt das Fenster füllt") gilt für den Modus, nicht nur für Vorschauen | Map-Zeilen für die drei Dateien: Rahmen und Ecken im Zen weg (SVC-15); oder SVC-15 ausdrücklich auf HTML/Markdown/Editor begrenzen und das in der Zuordnung zu BR-19 vermerken | nein |
| F-2 | fix | F, E3 (INV-13) | architecture.md (MIG-11, INV-13) | MIG-11 (:434): „im Zen Seitenleiste über den Panel-Griff eingeklappt ohne Speichern"; INV-13 (:463): „merkt sich Einklappen und Breite nur bei Änderung durch den User", Source `App.tsx:1709` | `App.tsx:1708-1710` ruft bei jeder Größenänderung `persistSidebarCollapsed(size.inPixels <= 0)`; `useSidebarPanel.ts:93-104` schreibt `terax.sidebar.collapsed` ohne Prüfung auf User-Aktion (nur die Breite ist geprüft, `useSidebarPanel.ts:18-23`); `useSidebarPanel.ts:78-82`: am Zustand `sidebarCollapsed` hängen Watcher und Git-Abfragen; Leser `statusConsumers.ts:39-49` (`railBadge`, `live`), `App.tsx:1730` (`FileExplorer visible`) | code | Ein `sidebarRef.collapse()` im Zen läuft über denselben Pfad und speichert „eingeklappt"; wird der Pfad umgangen, bleibt `sidebarCollapsed` `false` und Git-Status und Explorer-Watcher laufen bei unsichtbarer Leiste weiter | MIG-Zeile für `src/modules/sidebar/useSidebarPanel.ts` (oder die `onResize`-Stelle in `App.tsx`): im Zen setzt das Einklappen den Zustand `sidebarCollapsed` (Konsumenten pausieren) ohne Schreiben nach `localStorage`; INV-13-Source auf `useSidebarPanel.ts:18-23`, `:90-101` korrigieren | nein |
| F-3 | fix | A (BR-4), Kohärenz | architecture.md (VAL-5) | VAL-5 (:214): „ein Segment, das leer ist, … wird abgewiesen"; API-2 (:101): „`relpath` leer oder Ordner liefert dessen `index.html`"; Q&A 21 (:882): „nichts: Seiten mit `href=\"sub/\"` brechen" | architecture.md:214 vs. :101 und :882 | artifact | `GET /{token}/sub/` hat ein leeres letztes Segment, `GET /{token}/` einen leeren `relpath`; nach VAL-5 wörtlich beide `404`, nach API-2 beide `index.html` | VAL-5: leere Segmente in der Mitte abweisen (doppelte Schrägstriche); ein abschließender Schrägstrich und ein leerer `relpath` bedeuten „Ordner" und gehen an VAL-8 | nein |
| F-4 | fix | F (Sweep) | architecture.md (Sweep criterion) | (:441): „`grep -rn \"PDF_MAGIC\\|%PDF-\" src-tauri/src`: genau eine Definition (SVC-21)" | heute 8 Treffer: `file.rs:194` (Definition), `:196`, `:201` (Kommentare), `:246`, `:259` (Nutzung), `:832`, `:870`, `:883` (Test-Literale); Bedrohung 16 bringt weitere Test-Literale | code | Die Trefferzahl sagt nichts über „eine Definition"; das Kriterium ist so nicht mechanisch anwendbar | z. B. `grep -rn \"const PDF_MAGIC\\|b\\\"%PDF-\\\"\" src-tauri/src --include=*.rs` außerhalb `#[cfg(test)]` = genau 1 Treffer in `file.rs`, und `preview_server` enthält kein `%PDF-`-Literal außerhalb von Tests | nein |
| F-5 | fix | F (Sweep) | architecture.md (Sweep criterion, Neue Dateien D) | (:441): „danach rendert nur noch `PreviewHeader` den Umschalter"; (:383): „nimmt Rendered/Raw, Im Browser öffnen, Zen als Kinder bzw. Props" | architecture.md:441 vs. :383 | artifact | Werden die Tasten als Kinder übergeben, rendern `HtmlPreviewPane`, `MarkdownPreviewPane` und `EditorStack` weiter `<DocViewToggle>`; der Sweep schlägt an, obwohl der Entwurf eingehalten ist | Eine Form festlegen: `PreviewHeader` rendert `DocViewToggle` selbst (Props `view`, `onSetView`, `renderedDisabled`), dann gilt der Sweep; oder den Sweep auf „kein `DocViewToggle` außerhalb eines `PreviewHeader`-Kindes" umstellen | nein |
| F-6 | fix | A (BR-16) | architecture.md (SEC-3, Sicherheitsmodell 20) | Bedrohung 20 (:289): „kein Treffer für `preview_open_in_browser` unter `src/modules/ai/`, genau ein Aufrufer im Frontend" | Das benannte Muster prüft auch den Modulpfad: `portsBoundary.test.ts:26` `PORTS_SURFACE = /ssh_port_\|modules\/ports/` | code | Ein KI-Werkzeug, das `openInBrowser` aus `@/modules/preview-server` importiert, enthält den Command-Namen nicht; der beschriebene Test bleibt grün | Guard-Regex `preview_open_in_browser\|modules\/preview-server` unter `src/modules/ai/` | nein |
| F-7 | fix | A (UI-3) | architecture.md (API-6, SVC-14) | API-6 (:105): „Erhöht den Neu-laden-Zähler der Pane …"; UI-3 der Discovery: Zustände `idle`, `loading` | architecture.md:105, :176 nennen keinen `loading`-Zustand; discovery.md:407 | artifact | Kein Abschnitt sagt, wann die Taste `loading` zeigt und wann wieder `idle` | In API-6 oder SVC-14 je Fläche festlegen: HTML lokal bis `onLoad` des iframe, HTML/Markdown über `fs_read_file` bis zur Antwort, Raw bis der Editor gelesen hat | nein |
| F-8 | fix | C | architecture.md (Nahtstellen, Typen) | (:355): „`struct FrameSource { status: FrameStatus, url: Option<String>, reason: Option<String> }`" ohne `derive`/`serde` | Zeile darüber (:354) nennt für `BrowserOpenStatus` `#[serde(rename_all = \"snake_case\")]`; Muster `chrome.rs:25-26` | artifact | Ohne `snake_case` serialisiert `FrameStatus::TooLarge` als `\"TooLarge\"`, der TS-Typ erwartet `\"too_large\"` | `#[derive(Serialize)]` an beiden, `#[serde(rename_all = \"snake_case\")]` an `FrameStatus` angeben | nein |
| F-9 | fix | E3 (INV-5) | architecture.md (INV-5) | INV-5 (:455): „… auch über Symlinks auf Datei oder Ordner", Coverage `covered` mit drei Testnamen | Die drei Tests prüfen Namen (`guard.rs:361-384`), Ordner (`:404-419`) und einen Ordner-Symlink (`:548-560`); der Datei-Symlink steht in nicht genannten Tests `guard.rs:526` `enforce_read_trusted_refuses_deceptive_leaf_symlink_to_secret`, `:582` `enforce_read_blocks_symlink_to_protected_dir` | code | Am Testinhalt deckt die genannte Liste den Teil „Symlink auf Datei" nicht | `guard.rs` `enforce_read_trusted_refuses_deceptive_leaf_symlink_to_secret` in INV-5 ergänzen | nein |
| O-1 | obligation | D | – (implement) | SVC-8 (:170): „ein `ssh`-Aufruf über den ControlMaster je Datei" | `ssh.rs:1142-1209` synchron (`std::process::Command`, `wait_child` bis zum Budget); bestehender Aufrufer läuft auf `spawn_blocking` (`file.rs:162-166`) | code | Während acht gleichzeitiger SSH-Lesevorgänge bleiben Commands und Events der App ansprechbar; kein Tokio-Worker wird bis zu 244 s blockiert | SVC-8 auf `spawn_blocking` (oder eigenen Blocking-Pool) | nein |
| O-2 | obligation | Plattform | – (implement) | NFR-6 (:550): „`cargo test --locked` unter Linux; `cargo clippy`"; (:376): „`cfg(target_os = \"macos\")`-Arm, sonst leere Funktionen" | CI: `ci.yml:92` `cargo clippy --all-targets --locked -- -D warnings` (Linux), `ci.yml:107-133` nextest auf `windows-latest`, `macos-latest`; Muster `lib.rs:163` `_text`; Windows-Vergleich upstream über `to_canon` (`upstream/main:…/assets.rs:249-258`), Fork `fs/mod.rs:16-27` | code | `clippy -D warnings` auf Linux ohne Warnung (kein unbenutzter Parameter, kein toter `AtomicBool`); `cargo nextest` auf Windows grün, `within`/`opened_path` vergleichen dort die `to_canon`-Form, Symlink-Tests `cfg(unix)` | – | nein |
| O-3 | obligation | B (BR-4) | – (implement, qa) | SVC-2 (:164): „Home lokal über `dirs::home_dir`" | `dirs::home_dir` liefert den unaufgelösten Pfad (Nutzung ohne `canonicalize` in `asset.rs:31`); SVC-2 vergleicht mit dem Ordner der aufgelösten Bezugsdatei | code | Liegt Home hinter einem Symlink und die Bezugsdatei direkt darin, ergibt die Freigabe trotzdem Nur-Datei (Test mit verlinktem Home-Ordner) | – | nein |
| O-4 | obligation | Plattform (BR-20) | – (implement, qa) | SVC-18 (:180): „Lokaler AppKit-Monitor für `keyDown` … bei Esc ohne Modifier und gesetztem Schalter feuert er API-4" | Muster `lib.rs:126-129` meldet Ereignisse aller Fenster der App; Settings-Fenster `lib.rs:355-357` | code | Esc im Einstellungsfenster verlässt den Zen-Modus des Hauptfensters nicht | – | nein |
| O-5 | obligation | SEC-9 | – (implement) | SEC-9 (:243): „neuer Quelltext-Test sperrt die Tokens (Muster `src/modules/preview/PreviewPane.test.ts:25-56`)" | Muster prüft wörtliches `sandbox=\"…\"` (`PreviewPane.test.ts:30-33`); `HtmlPreviewPane` setzt `sandbox={LOCAL_SANDBOX}` aus Konstanten (`HtmlPreviewPane.tsx:35-36`, `:107`, `:114`) | code | Der Test schlägt an, sobald eine der beiden Konstanten `allow-same-origin` enthält oder ein iframe die Konstanten nicht nutzt | – | nein |
| N-1 | note | F (MIG-8) | architecture.md (MIG-8, API-6) | MIG-8 (:431): „Neu laden baut `EditorPane` über einen Schlüssel neu auf, gesperrt bei `dirty`" | `EditorPaneHandle.reload` (`EditorPane.tsx:58-59`, `:352`) → `useDocument.ts:180-190`, überspringt bei `dirty`; genutzt von `useEditorFileSync.ts:38` | code | Bestehender Weg liest neu ohne Neuaufbau (Cursor, Scroll, Handle bleiben) | Raw-Neu-laden über `reload()` statt Schlüssel | nein |
| N-2 | note | B | architecture.md (SEC-16) | SEC-16 (:260): „SSH-Zeitbudget wie `read_bytes_timeout`" | `ssh.rs:1506-1509` mit `expected_size: None` → `write_timeout(10 MiB)` = 30 s + 214 × 1 s = 244 s (`ssh.rs:897-909`) | code | Ein hängender Master hält jeden der 4 Plätze je Host bis zu 244 s | Größenhinweis übergeben oder eigenes kürzeres Budget für Nachbardateien | nein |
| N-3 | note | D | architecture.md (Risks) | Bedrohung 8 (:277): „Prüfung auf dem vom Host gemeldeten Ziel" | Helfer löst auf (`ssh.rs:399`) und öffnet danach (`:403`); `O_NOFOLLOW` schützt nur die letzte Komponente | code | Wird zwischen `realpath` und `open` ein Elternordner getauscht, weicht das gelesene vom gemeldeten Ziel ab; lokal prüft SVC-7 nach dem Öffnen, über SSH nicht | Restrisiko im Abschnitt „Risks" benennen | nein |
| N-4 | note | SEC (Bedrohung 21) | architecture.md (Sicherheitsmodell 21) | (:290): „`src-tauri/capabilities/default.json` enthält kein `remote`" | zweite Datei `src-tauri/capabilities/desktop.json` | code | Eine `remote`-Freigabe in `desktop.json` bliebe vom Guard-Test unbemerkt | Guard über alle Dateien in `src-tauri/capabilities/` | nein |
| N-5 | note | A (BR-23, BR-25) | architecture.md (SVC-14) | SVC-14 (:176): „Bild, PDF (auch Karte über SSH): Dateiname, Im Browser öffnen, Zen" | SVG ist Text: Bildvorschau nur bei `binary`/`toolarge` (`EditorPane.tsx:430`, `useDocument.ts:138-139`); SVG öffnet als Code | code | Über einer SVG erscheint keine Kopfzeile; „Open in Browser" für SVG gibt es nur im Explorer | In SVC-14 vermerken | nein |
| N-6 | note | Bestand | architecture.md (Assumptions) | (:577): „`cargo test` des Helfers (`ssh.rs:2364`)" | `ssh.rs:2364` ist `fn run_helper`; Test `embedded_helper_read_bytes_reports_the_symlink_target` bei `ssh.rs:2425` | code | Anker zeigt auf die Hilfsfunktion, nicht auf den Test | Anker auf `ssh.rs:2425` | nein |

## Blockierende Befunde (JSON)

```json
[
  {
    "id": "R-1",
    "class": "refuted",
    "claim": "architecture.md SVC-8 (Zeile 170): \"Fehler des Transports zu `unreachable`, Zeitüberschreitung (`ssh.rs:1506-1509`) zu `timeout`\"; Nahtstellen (Zeile 363): \"`src-tauri/src/modules/ssh.rs` | Leseweg wird nur genutzt (BR-13)\"; Error Handling (Zeilen 328-332): Datei fehlt 404, größer als 10 MiB 403, SSH nicht lesbar 502, Zeitbudget 504",
    "evidence": "src-tauri/src/modules/ssh.rs:1490-1502 (pub fn read_bytes -> Result<RemoteFileBytes, String>); ssh.rs:1055-1064 (impl From<RemoteError> for String faltet Transport/Failed/Killed/TimedOut auf die Nachricht); ssh.rs:1045 (enum RemoteError privat); ssh.rs:795-796 (Helfer meldet Fehler als str(ex)); ssh.rs:401-410 (zu groß / kein reguläres File nur als Text, angeheftet in ssh.rs:2415, :2420); ssh.rs:1506-1509 ist die Budget-Rechnung, kein Fehlertyp",
    "evidence_source": "code",
    "expected_observation": "In ssh.rs gibt es keine öffentliche Lesefunktion, die die Fehlerart (Transport, Antwort des Helfers, Zeitüberschreitung) liefert; SVC-8 kann sie mit unverändertem ssh.rs nur über Textvergleich bestimmen, und Transport- und Helfer-Texte sind nicht abgeschlossen trennbar",
    "scenario": "Im SSH-Workspace wird die Nachbardatei img/a.png gelöscht, danach reißt der ControlMaster ab. Beim Neuladen bekommt SVC-8 im ersten Fall Err(\"[Errno 2] No such file or directory: '/home/u/p/img/a.png'\"), im zweiten Err(\"ssh: Control socket connect(...): Connection refused\") — beide als String. Die Fehlertabelle verlangt 404 bzw. 502 (Hauptdatei: Textseite nach Q&A 10); ohne Änderung an ssh.rs oder eine festgelegte Text-Klassifikation landen beide in derselben Antwort. Ebenso kommt eine Ordner-Anfrage sub/ nur als Err(\"not a regular file: …\") zurück und muss per Text zu index.html werden."
  }
]
```
