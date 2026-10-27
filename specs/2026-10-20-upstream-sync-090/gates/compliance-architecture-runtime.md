# Gate 1: Architecture Compliance (Perspektive runtime)

| Feld | Wert |
|------|------|
| Geprüft | `specs/2026-10-20-upstream-sync-090/architecture.md` gegen `discovery.md`, `codebase-scan.md` |
| Nicht vorhanden | `wireframes.md`, `bindings.md`, Reconcile (E2 entfällt) |
| Prüfdatum | 2026-10-27 |
| Perspektive | `runtime`: Laufzeitverhalten (WKWebView, Tauri-Threading, SSH-Host, Dateisysteme), Konfiguration, Build-Output, Dependency-Versionen, Hersteller-Doku |
| Lauf | offen (kein Delta) |
| Umgebung | macOS 27.0 (26A428), System-WebKit 22625.1.29.11.27 / Safari 27.0, python3 3.9.6 lokal; SSH-Host `litha-claude` Python 3.13.5, Linux 6.12.113+deb13 (`/tmp` tmpfs, `/` ext4) |
| Laufende Terax-App | nicht beendet, nicht gestartet; nur `ps`/`lsof` lesend |

**Eigene Messwerkzeuge (Scratchpad, nicht im Repo):** WKWebView-Probe (Swift, eigener Prozess, eigenes Fenster) für `visibilityState`/rAF/CSS-Animation bei Fokusverlust, Verdeckung, Minimieren und Fenster-Start mit `visible:false`; Python-Skript für Publish-Semantik (lokal APFS, Host tmpfs + ext4); `renamex_np`-Probe auf APFS, exFAT- und FAT-Disk-Image (`hdiutil`, danach ausgehängt und gelöscht); `vite build --sourcemap` in ein Temp-Verzeichnis mit Start-Graph-Analyse über `index.html`/`settings.html` + Sourcemaps.

---

## Skript-Tabelle (Arch-Precheck, übernommen)

| Ergebnis | ID | Klasse | Detail |
|----------|----|--------|--------|
| PASS | AR-7 | note | Scan-Plausibilität: 3 NEW-Zeilen ohne Zielpfad (Zielpfade stehen in architecture.md unter Context & Research) |

ID-Marker, ID-Existenz, Anker, Enum-Werte, Versions-Literale, Scan-Zählungen, Registry- und Exception-Form sind damit erledigt und hier nicht erneut geprüft (P5).

---

## Summary

| Klasse | Anzahl |
|--------|--------|
| decision | 0 |
| refuted | 2 |
| fix | 2 |
| obligation | 12 |
| note | 6 |

**Verdict:** FAILED

Grund: Die Bestands-Behauptung „AI-SDK ist schon lazy" (Q&A #12, INV-19) hält am gebauten Output nicht. Beide Fenster laden heute ~546 KB AI-SDK + zod beim Start vor. Der geplante `dist-budget.test.ts` (SVC-15) würde ohne Umbau der Chunk-Zuordnung sofort rot.

---

## Check A — Feature Mapping (runtime-Anteil)

| Item | Evidenz | Status |
|------|---------|--------|
| BR-9 / FL-6 / FL-7 (Pause nur bei unsichtbarem Fenster) → SVC-7 über `document.visibilityState` | Probe: verdeckt → `hidden`, minimiert → `hidden`, wieder sichtbar → `visible`; ohne Fokus bleibt `visible` | PASS (Space-Fall O-7) |
| BR-12 (Media) → SVC-8 an SVC-7 | gleiche Quelle wie BR-9 | PASS |
| BR-15 (Messung) → NFR-1, NFR-2, Monitoring | Zähler erfasst nur `git_status` (F-1); WebContent-Zuordnung (O-8); Startmessung im Dev-Server (O-9) | PASS mit Fix/Auflagen |
| BR-18 (Lazy-Start) → SVC-14, SVC-15, MIG-62, MIG-63 | Build-Output: AI-SDK im Start-Graphen beider Fenster, MIG-62 adressiert nur das Icon-Set | FAIL → R-1 |
| BR-19 (0.8.7) → MIG-67/70, `getVersion()` | `tauri.conf.json:4` trägt die Version, die About liest | PASS |
| BR-20 (eine Lezer-Kopie) → SVC-15/16, MIG-68/69 | heute genau 1× `@lezer+highlight@1.2.3` im Build und im Lock; Upstream nutzt dasselbe pnpm 11.9.0 mit `catalog:` + Override | PASS |
| BR-3 / BR-21 (Staging, kein Überschreiben) lokal + SSH → SVC-1, SVC-3, API-3 | Publish-Semantik lokal und auf dem Host gemessen | PASS mit Auflagen O-3..O-5, O-10, O-11 |

## Check B — Constraint Mapping (runtime-Anteil)

| Constraint | Architecture-Antwort | Evidenz | Status |
|------------|----------------------|---------|--------|
| macOS-Mindestversion 13.0 | keine Laufzeit-Weiche | `tauri.conf.json:50`; SDK `sys/stdio.h:52` `renamex_np __OSX_AVAILABLE(10.12)`, `NSPasteboard.h:39` `NSPasteboardTypeFileURL API_AVAILABLE(macos(10.13))` | PASS |
| python3 auf dem Host | `publish` nur mit `os.mkdir/rename/link/unlink` | Host 3.13.5, lokal 3.9.6; Semantik gemessen (siehe Behauptungen B-07..B-10) | PASS |
| `minimumReleaseAge` 4320 strikt | Upstream-Lock als Untergrenze | `pnpm-workspace.yaml:1-2`; alle Zielstände älter als 3 Tage (jüngster: vite 8.3.5 vom 21.10.2026) | PASS |
| Prod-App nie beenden | isolierte Instanz | `identifier` `app.crynta.terax` (`tauri.conf.json:5`) und `MANAGED_PREFIX` (`managedTmux.ts:22`) sind fest kodiert | PASS (N-5) |
| Timeout Zwischenablage (API-1, SEC-6) | „wartet begrenzt" | Wert in architecture.md nur im Research Log (5 s) | PASS mit Auflage O-1 |
| Main-Thread bei großen Kopien (Q&A #9) | async + blockierende Arbeit außerhalb | Tauri-Quelltext belegt Main-Thread für sync | PASS mit Auflage O-2 |
| Dateisysteme ohne No-Replace (Risk) | exklusive Reservierung als Rückfall | exFAT gemessen: `ENOTSUP`, Rückfall funktioniert | PASS mit Auflage O-3 |
| Windows-Build (CI `windows-latest` mit `cargo nextest`) | MIG-14 „sonst … exklusive Reservierung" | nicht messbar (kein Windows-Host); Upstream nutzt `MoveFileExW` ohne Replace | PASS mit Auflage O-4 |

## Check C — Realistic Data

Keine Datenbank (architecture.md „Database Schema: N/A"). Geprüft sind die Laufzeit-Datenformate und Grenzwerte.

| Item | Evidenz | Status |
|------|---------|--------|
| Pfade als unbegrenzter String (DTOs) | `getconf PATH_MAX /`: macOS 1024, Host 4096; `NAME_MAX` 255 auf beiden | PASS |
| Suffix-Zähler 1..10.000 (DF-3) | Upstream `MAX_COPY_SUFFIX = 10_000` (`copy.rs@2723dc6:10`) | PASS |
| VAL-5 Grenzwerte („Festlegung über die Gate-1-Auflagen") | Upstream `MAX_COPY_SOURCES = 1024`, `MAX_COPY_DEPTH = 128` (`copy.rs@2723dc6:9,11`) | Auflage O-12 |
| Namen nahe `NAME_MAX` + Suffix, tiefe Bäume nahe `PATH_MAX` + Staging-Präfix | ` copy 10000` = +11 Byte; Staging-Pfad `/.terax-copy-XXXXXX/item` ist länger als der Zielpfad | Auflage O-10 |
| Externe Daten: Finder-Pasteboard | Typ `NSPasteboardTypeFileURL` je Item, Auflösung über `filePathURL` (SDK + objc2 0.3.2 vorhanden) | API PASS; Finder-Verhalten NICHT GEMESSEN (würde die Zwischenablage des Users überschreiben) |
| SSH-Fehlertexte unbegrenzt | `ssh.rs:570` `str(ex)` | PASS |

## Check D — Completeness + Dependency Version Check

Existing-Projekt: Arch-Version, Pinning-Datei und aktueller Registry-Stand je Paket (gemessen am 27.10.2026 per `npm view` und crates.io-API).

| Paket | Arch (Projekt → Ziel; „aktuell") | Pinning (Fork) | Upstream-Lock `640e8b2` | Registry aktuell | Status |
|-------|----------------------------------|----------------|-------------------------|------------------|--------|
| `tauri` | 2.11.5 → ≥ 2.12.2; 2.12.5 | Cargo.lock 2.11.5 | 2.12.2 (wry 0.57.0) | 2.12.5 (21.10.2026) | PASS (N-4: wry 0.55.1 → 0.57.0) |
| `@tauri-apps/api` | ^2.11.1 → ^2.12.3; 2.12.4 | `package.json:66` ^2.11.1 | ^2.12.3 | 2.12.4 | PASS |
| `@tauri-apps/cli` | ^2.11.4 → ^2.12.0; 2.12.4 | `:115` ^2.11.4 | ^2.12.0 | 2.12.4 | PASS |
| `react`/`react-dom` | ^19.2.8 → ^19.3.0; 19.3.1 | `:97-98` | ^19.3.0 | 19.3.1 (14.10.2026) | PASS |
| `vite` | ^8.2.2 → ^8.3.1; 8.3.5 | `:133` (installiert 8.2.2, rolldown 1.2.6) | ^8.3.1 (rolldown 1.2.11) | 8.3.5 (21.10.2026) | PASS; Chunk-Strategie siehe R-1 |
| `@lezer/highlight` | 1.2.3 → exakt 1.2.5 | `:62` ^1.2.3, Lock 1.2.3 | `catalog:` 1.2.5 | 1.2.5 (28.09.2026) | PASS |
| `@iconify-json/catppuccin` | 1.2.17 unverändert | `:61` | ^1.2.17 | 1.2.17 | PASS |
| `dirs` | 6.0.0 → 7.0.0 | Cargo.toml:31 `"6"` | 7.0.0 | 7.0.0 (05.09.2026) | PASS (`home_dir` identisch, dirs-sys 0.5.0 in beiden) |
| `libc` | 0.2.189 → 0.2.x; 0.2.191 | Lock 0.2.189 | 0.2.191 | 0.2.191 (16.10.2026) | PASS |
| `objc2-app-kit` | 0.3.2 + `NSPasteboardItem` | Lock 0.3.2 | 0.3.2 | 0.3.2 | PASS (N-1) |
| `objc2-foundation` | 0.3.2 + `NSArray`, `NSURL` | Lock 0.3.2 | 0.3.2 | 0.3.2 | PASS (N-1) |
| `reqwest` | 0.12 bleibt; 0.13.5 | Cargo.toml:45 `0.12`; Lock 0.12.28 + 0.13.2 transitiv | 0.13.5 | 0.13.5 | PASS (N-6) |
| `actions/checkout` | v7 | `ci.yml:17,58,110,134` | v7 | v7.0.1 (20.07.2026); Input `persist-credentials` (Default `true`, `action.yml:52-54`) | PASS |
| WKWebView | WebKit 22625.1.29.11.27, Safari 27.0 | – | – | gemessen auf dem Entwicklungsrechner | PASS |
| pnpm | 11.9.0, Catalog | `package.json:7` | gleiches `packageManager` mit `catalog:` + Override (`pnpm-workspace.yaml@upstream:6-10`) | – | PASS |

Neu spezifizierte Mechanismen gegen Zielumgebungen: `renamex_np`/`RENAME_EXCL` (libc 0.2.189 `apple/mod.rs:3325,4761`), `renameat2`/`RENAME_NOREPLACE` (libc `linux/gnu/mod.rs:1114`, `linux/mod.rs:1216`), `codeSplitting.groups` (rolldown 1.2.6 `define-config-*.d.mts:864,881`) sind in den Fork-Versionen vorhanden.

## Check F — Migration Completeness (runtime-Anteil)

| Item | Evidenz | Status |
|------|---------|--------|
| Sweep Fenster-Sichtbarkeit | `grep -rnE "document\.hidden|visibilityState|visibilitychange" src`: Treffer nur in `App.tsx:477`, `useClaudeStatus.ts:55`, `useSpacePersistence.ts:89,92,96`, `rendererPool.ts:103,110,113`, `useTerminalSession.ts:551,575`, `SshAgentActivityPoller.tsx:141`, `SurfaceLayer.tsx:132-137` → alle in MIG-10, MIG-35..39 oder Allowlist | PASS |
| Guard-Umfang MIG-27 vs. neue Tests MIG-26, MIG-34 | die Tests müssen `visibilityState`/`visibilitychange` benutzen, MIG-27 erlaubt die Muster nur in zwei Dateien | FIX → F-2 |
| MIG-62 `vite.config.ts` | Ziel nur „benannter Chunk für das Icon-Set"; Build-Output braucht zusätzlich die Eager/Lazy-Trennung | FAIL → R-1 |
| Sweep Version / Lezer | Ausgangswerte gemessen (0.8.6 in drei Quellen, Lezer 1× 1.2.3) | PASS |

## Check E — Pattern Consistency (Gate 1b, runtime-Anteil)

| Empfehlung / Disposition | Umsetzung in architecture.md | Laufzeit-Evidenz | Status |
|--------------------------|------------------------------|------------------|--------|
| AVOID Upstream-Fokus-Kopplung `html[data-window-inactive]` | `data-window-hidden` aus `visibilityState` (SVC-7, MIG-40) | Probe: Fokusverlust lässt `visibilityState` auf `visible` | PASS |
| AVOID neues `document.hidden`-Paar | Owner SVC-7 + Guard MIG-27 | Sweep vollständig; Guard-Umfang F-2 | PASS (F-2) |
| NEW Fenster-Sichtbarkeits-Zustand | MIG-25/28 | Startzustand `hidden` gemessen (Fenster startet unsichtbar) | PASS mit Auflage O-6 |
| EXTEND `clipboard_write_text`-Muster | SVC-4, MIG-16 | Muster async + `run_on_main_thread` (`lib.rs:139-158`) | PASS |
| EXTEND Eager-Budget-Test (P9) + NEW dist-budget | MIG-63/64 | Quelltest grün, Build-Output trotzdem mit AI-SDK | FAIL → R-1/R-2 |
| Anti-Slop #1 consolidate | MIG-25..39 + Guard | wie oben | PASS |
| Anti-Slop #2, #3 | kein Laufzeit-Beleg in dieser Perspektive | – | außerhalb Perspektive (code) |

## Check E2 — Bindings Coverage

N/A — kein `bindings_path` und kein `reconcile_path`.

## Check E3 — Existing-Behavior Invariants (runtime-Anteil)

| INV | Evidenz | Status |
|-----|---------|--------|
| INV-17 (Animationen bei sichtbarem Fenster ohne Fokus) | Probe: ohne Fokus `visible`, rAF und Animation laufen | PASS |
| INV-18 (Renderer-Pool an Fokus + Sichtbarkeit) | `rendererPool.ts:103,110` unverändert in Allowlist | PASS |
| INV-19 (Startpaket ohne `@ai-sdk`, `ai`, …; covered) | Build-Output: `@ai-sdk/*` und `ai@` in den statischen Chunks beider Fenster; `eager-budget.test.ts` prüft nur den Quell-Importgraphen (`scripts/eager-graph.mjs:1-8`) | FAIL → R-2 |
| INV-21 (eine Lezer-Kopie) | `pnpm-lock.yaml:904,6697`; Build-Sourcemaps 1× `@lezer+highlight@1.2.3` | PASS |
| INV-22 (About = Tauri-App-Version) | `tauri.conf.json:4` `"version"` gesetzt | PASS |
| INV-23 (Poller ruhen bei unsichtbarem Fenster) | Probe: `visibilitychange` feuert bei Verdecken/Minimieren/Wiederherstellen | PASS |
| INV-1..16, INV-20 | Beleg liegt im Code/Test | außerhalb Perspektive (code) |

---

## Data Type Verdicts

| Feld | Arch-Typ | Evidenz | Verdict |
|------|----------|---------|---------|
| `CopyRequest.sources[]`, `destDir` | `string` unbegrenzt | `PATH_MAX` 1024 (macOS) / 4096 (Linux-Host), `NAME_MAX` 255 | PASS |
| `CopyResult.created[]` | `string` | gleiche Grenzen | PASS |
| `CopyFailure.message` | `string` unbegrenzt | OS-/Python-Fehlertexte variabel (`ssh.rs:570`) | PASS |
| `fs_clipboard_paths` → `string[]` | unbegrenzt | Pasteboard-Items beliebig viele; Batch-Grenze greift erst in `fs_copy` | PASS |
| DF-3 Suffix-Zähler | 1..10.000 | Upstream `MAX_COPY_SUFFIX = 10_000` | PASS |
| VAL-5 Quellen je Aufruf / Ordnertiefe | „wie Upstream" | Upstream 1024 / 128 | PASS mit Auflage O-12 |
| API-1 Zeitlimit | „begrenzt" | Upstream 5 s (`clipboard.rs@2723dc6:22`) | PASS mit Auflage O-1 |
| Staging-Name | `.terax-copy-…` | Upstream `tempfile::Builder::new().prefix(".terax-copy-")` (`copy.rs@2723dc6:122-123`) | PASS |

---

## Bestands-Behauptungen (Prüfmenge runtime)

| # | Behauptung (architecture.md) | Beleg | Verdikt |
|---|------------------------------|-------|---------|
| B-01 | API-1/SVC-4: Pasteboard-Zugriff auf dem Main-Thread wie `clipboard_write_text` (`lib.rs:132-158`) | `lib.rs:139-158`: `async fn` + `run_on_main_thread` + Kanal | bestätigt |
| B-02 | API-1: begrenztes Warten, Fehler `clipboard read timed out or was cancelled` (Research Log: 5 s) | `clipboard.rs@2723dc6:13-27` (`spawn_blocking(recv_timeout(5 s))`) | bestätigt (O-1) |
| B-03 | `NSPasteboardTypeFileURL`, `filePathURL`, `pasteboardItems` verfügbar | objc2-app-kit 0.3.2 `NSPasteboard.rs:91,382`, `NSPasteboardItem.rs:85`; objc2-foundation `NSURL.rs:1181,1374`; SDK `NSURL.h:165` | bestätigt |
| B-04 | Finder legt Datei-URLs je Item ab, als Dateireferenz-URLs (Assumption, SVC-4) | – | NICHT GEMESSEN — Messung würde die allgemeine Zwischenablage des Users überschreiben; e2e mit echtem Finder-⌘C ist in der Arch vorgesehen |
| B-05 | Q&A #9: Sync-Commands laufen in Tauri auf dem Main-Thread | tauri-macros 2.6.3 `wrapper.rs:50` (Default `Blocking`), `:404-434` (Aufruf inline im IPC-Handler) | bestätigt |
| B-06 | Fork-`fs_copy` ist sync | `mutate.rs:210-211` `#[tauri::command] pub fn fs_copy` | bestätigt |
| B-07 | API-3 Ordner: exklusive Reservierung + atomarer Tausch gegen leere Reservierung | Python lokal (3.9.6, APFS) und Host (3.13.5, tmpfs + ext4): `rename(dir, leeres dir)` ok, auf nicht-leeres `ENOTEMPTY`, `mkdir` auf Vorhandenes `EEXIST` | bestätigt |
| B-08 | API-3 Dateien: `os.link` scheitert bei vorhandenem Ziel | lokal + Host: `EEXIST`, Ziel unverändert | bestätigt |
| B-09 | SEC-4: hängender Symlink am Ziel zählt als belegt (für `publish`) | lokal + Host: `link`/`mkdir` auf hängenden Symlink `EEXIST` | bestätigt |
| B-10 | Hardlink-Weg ist Normalfall (ext4/xfs/APFS) | ext4, tmpfs, APFS: Link ok; exFAT: `ENOTSUP` | bestätigt (xfs nicht vorhanden) |
| B-11 | Host `litha-claude` Python 3.13.5 / Linux 6.12.113; lokal 3.9.6, macOS 27.0 | `ssh … python3 --version; uname -sr`; `sw_vers` | bestätigt |
| B-12 | Helper wird je Aufruf mitgeschickt, Verbindung über ControlMaster | `ssh.rs:783-786` (Base64-Programm im Kommando), `control_args` `ssh.rs:93ff`; `ps`: `ssh: ~/.terax/ssh-control/… [mux]` | bestätigt |
| B-13 | `minimumSystemVersion` 13.0 | `tauri.conf.json:50` | bestätigt |
| B-14 | `renamex_np` ab 10.12, `NSPasteboardTypeFileURL` ab 10.13 | SDK `sys/stdio.h:52`, `NSPasteboard.h:39` | bestätigt |
| B-15 | `minimumReleaseAge` 4320 strikt | `pnpm-workspace.yaml:1-2` | bestätigt |
| B-16 | pnpm 11.9.0, `catalog:` + Override funktionieren | `pnpm --version` 11.9.0; Upstream mit gleichem `packageManager` nutzt `catalog:` + `'@lezer/highlight': 'catalog:'` | bestätigt |
| B-17 | npm-Stände „aktuell stabil" (react 19.3.1, vite 8.3.5, api/cli 2.12.4, lezer 1.2.5, catppuccin 1.2.17) | `npm view` 27.10.2026 | bestätigt |
| B-18 | crates „aktuell stabil" (tauri 2.12.5, dirs 7.0.0, libc 0.2.191, objc2-* 0.3.2, reqwest 0.13.5) | crates.io-API `max_stable_version` | bestätigt |
| B-19 | Projekt-Stände (tauri 2.11.5, dirs 6.0.0, libc 0.2.189, lezer 1.2.3, react/vite/api/cli-Bereiche) | `Cargo.lock`, `package.json`, `pnpm-lock.yaml:904` | bestätigt |
| B-20 | Upstream-Lock `640e8b2` als Untergrenze (tauri 2.12.2, api ^2.12.3, cli ^2.12.0, react ^19.3.0, vite ^8.3.1) | `git show upstream/main:{package.json,src-tauri/Cargo.lock}` | bestätigt |
| B-21 | libc 0.2.189 enthält `renamex_np` + `RENAME_EXCL` (`apple/mod.rs:3325,4761`) | Registry-Quelltext, exakt diese Zeilen | bestätigt |
| B-22 | objc2-app-kit 0.3.2: `NSPasteboardTypeFileURL` (`NSPasteboard.rs:91`), Feature `NSPasteboardItem` | Quelltext; Feature `Cargo.toml:1028`, zugleich in `default` | bestätigt (N-1) |
| B-23 | objc2-foundation 0.3.2: Features `NSArray`, `NSURL` | `Cargo.toml` default-Liste | bestätigt (N-1) |
| B-24 | `dirs` 7 für `home_dir` quellkompatibel | dirs-7.0.0 `src/lib.rs:74` gleiche `pub fn`-Menge wie 6.0.0, beide auf dirs-sys 0.5.0 | bestätigt |
| B-25 | Upstream `2992988` änderte nur Manifest/Lock | `git show --stat 2992988`: `Cargo.lock`, `Cargo.toml`, `crates/terax-cli/Cargo.toml` | bestätigt |
| B-26 | `macos-private-api` nur für Vibrancy | Upstream `Cargo.toml:39-40` („backs the transparent window NSVisualEffectView") | bestätigt |
| B-27 | `reqwest` 0.13 kam upstream mit `0a6e511` | `git log -S'version = "0.13"' -- src-tauri/Cargo.toml` → `0a6e511` | bestätigt |
| B-28 | System-WebKit 22625.1.29.11.27 (Safari 27.0), macOS 27.0 | `WebKit.framework/Resources/Info.plist`, `sw_vers` | bestätigt |
| B-29 | WebKit meldet `hidden` bei minimiertem Fenster | Probe: `visibilitychange->hidden`, `occl=notVisible` | bestätigt |
| B-30 | WebKit meldet `hidden` bei vollständig verdecktem Fenster | Probe: deckendes Fenster darüber → `hidden`, entfernt → `visible` | bestätigt |
| B-31 | WebKit meldet `hidden` bei anderem Space | – | NICHT GEMESSEN — Space-Wechsel ist programmatisch nur über Mission Control/private APIs auslösbar; e2e in Slice 2 (O-7) |
| B-32 | BR-9-Grundlage: Fokusverlust ändert die Sichtbarkeit nicht | Probe nach Wiederherstellen: `hasFocus=false`, `visible` | bestätigt |
| B-33 | Q&A #24: `requestAnimationFrame` hält bei unsichtbarer Seite | Probe: rAF-Zähler steht während Verdeckung/Minimierung (271 bzw. 399), läuft danach weiter | bestätigt |
| B-34 | Risk: WebKit drosselt verdeckte Seiten ohnehin | Probe: `getAnimations()[0].currentTime` bleibt bei 4603 ms, obwohl ~7 s vergangen sind (keine Rendering-Updates) | bestätigt (N-3) |
| B-35 | Q&A #12 / Scan: „AI-SDK … schon lazy und per Quelltest gesichert" | Build-Output: siehe R-1 | **widerlegt** |
| B-36 | Q&A #12: Editor (`@codemirror`, `@uiw`) schon lazy | Build-Output: keine `@codemirror`/`@uiw`-Quellen in den statischen Chunks beider Fenster | bestätigt |
| B-37 | Integration `vite`: „`manualChunks` und `--sourcemap` für SVC-15 wie Upstream" | Upstream `vite.config.ts:185-200` ersetzt `manualChunks` durch `codeSplitting.groups` | **widerlegt** (Teil von R-1) |
| B-38 | BR-18-Ausgang: Icon-Set heute im Startpaket | Build: `iconResolver-*.js` (352 KB, `@iconify-json/catppuccin`, `fileIcons`, `folderIcons`) statisch in `index.html`; nicht in `settings.html` | bestätigt |
| B-39 | INV-19: Startpaket beider Fenster ohne `@ai-sdk`, `ai`, …; covered | siehe R-2 | **widerlegt** |
| B-40 | INV-21: heute genau eine Lezer-Kopie 1.2.3 | Lock `:904,6697`; Build-Sourcemaps 1× `@lezer+highlight@1.2.3` | bestätigt |
| B-41 | Risk: `dist-budget.test.ts` verlängert `pnpm test` spürbar (Likelihood High) | `vite build --sourcemap` gemessen: 7 s | hält nicht (Schätzung, N-2) |
| B-42 | SEC-8: `persist-credentials` an 4 Checkout-Stellen von `actions/checkout@v7` | `ci.yml:17,58,110,134`; `action.yml@v7:52-54` | bestätigt |
| B-43 | NFR-1: CPU von `terax` + WebContent-Prozess per `ps` | `ps`: `/Applications/Terax.app/Contents/MacOS/terax`; drei `com.apple.WebKit.WebContent` mit `ppid 1`, `lsof` liefert keine Zuordnung | bestätigt mit Auflage O-8 |
| B-44 | NFR-1/Monitoring: Zähler der `git_status`-Aufrufe misst die Git-Status-Läufe | `useSourceControl.ts:255,272` rufen `git_panel_snapshot`; `operations.rs:114` führt dort `status_inner` aus | unvollständig → F-1 |
| B-45 | NFR-2: Startzeit-Median aus 5 Starts der Dev-Instanz | `tauri dev` lädt vom Dev-Server (`tauri.conf.json` `devUrl` `http://localhost:1420`), nicht aus `frontendDist` | hält nur mit gebautem Frontend → O-9 |
| B-46 | Isolierte Instanz über eigenen `identifier` + eigenes `MANAGED_PREFIX` | beide fest kodiert (`tauri.conf.json:5`, `managedTmux.ts:22`); Memory `terax-test-bridge.md` | bestätigt (N-5) |
| B-47 | Risk/MIG-14: Dateisystem ohne No-Replace-Rename → exklusive Reservierung als Rückfall (exFAT) | exFAT-Image: `renamex_np(RENAME_EXCL)` freies Ziel `ENOTSUP`, belegtes `EEXIST`; Reservierung (Ordner auf leere Reservierung, Datei auf eigene `O_EXCL`-Datei) funktioniert; FAT unterstützt `RENAME_EXCL` | bestätigt (O-3) |
| B-48 | Risk: SMB ohne No-Replace-Rename | – | NICHT GEMESSEN — keine SMB-Freigabe in der Umgebung |
| B-49 | `useSyncExternalStore` vorhanden (React ≥ 18) | gebauter React-19.2.8-Chunk exportiert `useSyncExternalStore` | bestätigt |
| B-50 | UI-10: `getVersion()` liest `tauri.conf.json` | `"version": "0.8.6"` gesetzt (`tauri.conf.json:4`) | bestätigt |
| B-51 | DTOs: feste Pfadlängen wären falsch (macOS 1024, Linux 4096) | `getconf PATH_MAX /` lokal 1024, Host 4096 | bestätigt |
| B-52 | Monitoring: Lezer-Kopien über Sourcemaps zählbar | Build-Sourcemaps enthalten `.pnpm/@lezer+highlight@<ver>`-Pfade | bestätigt |
| B-53 | Research Log: WebKit Bug 107494 (Verdeckung → Sichtbarkeit) | – | NICHT GEMESSEN — Web-Referenz; Sachverhalt durch B-30 direkt gemessen |
| B-54 | MIG-14 „sonst … exklusive Reservierung" + Trade-off „Drop funktioniert dort (Linux/Windows) weiter" | kein Windows-Host; Upstream nutzt auf Windows `MoveFileExW` ohne `MOVEFILE_REPLACE_EXISTING` (`mutate.rs@2723dc6:157-183`); CI führt `cargo nextest` auf `windows-latest` aus (`ci.yml:107-129`) | NICHT GEMESSEN — Laufzeit Windows (O-4) |

**Self-Check:** erhoben 54 · gemessen 49 · NICHT GEMESSEN 5 (B-04, B-31, B-48, B-53, B-54) → 49 + 5 = 54.

Außerhalb der Perspektive (Beleg im Code oder in Tests, für die `code`-Perspektive): API-4/`net.rs`-Zeilen, VAL-1..VAL-10-Regelinhalte, INV-1..INV-16, INV-20, Anti-Slop #2/#3, Shortcut-Registry, Watcher-Refcount `watch.rs`.

---

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|----|--------|-------|-----------|-------|-------|-------------|-----------------------|------------|-------------------|
| R-1 | refuted | A, D, F (BR-18, MIG-62) | `architecture.md` (Q&A #12 Z. 682, MIG-62 Z. 333, Integration `vite` Z. 444, SVC-15 Z. 145) | Q&A #12: „AI-SDK und Editor sind schon lazy und per Quelltest gesichert; neu sind nur das Icon-Set und ein Test auf dem gebauten Output"; MIG-62: „benannter Chunk für das Icon-Set"; Integration: „`manualChunks` … wie Upstream genutzt" | `pnpm exec vite build --outDir <tmp> --sourcemap` im Worktree (Fork-Stand, vite 8.2.2/rolldown 1.2.6): `index.html` und `settings.html` laden statisch `ai-anthropic-*.js` (258 KB), `ai-cerebras-*.js` (54 KB), `ai-sdk-shared-*.js` (234 KB) mit `@ai-sdk/anthropic`, `@ai-sdk/provider-utils`, `@ai-sdk/react`, `ai@`, `zod`. Ursache: `main-*.js` und `settings-*.js` importieren `nn` aus `ai-sdk-shared`, das ist React (`react/index.js`, `react.production.js` liegen laut Sourcemap in diesem Chunk); `ai-sdk-shared` importiert statisch `ai-anthropic`/`ai-cerebras`. Upstream `vite.config.ts:185-200` beschreibt genau diesen Mechanismus („`ai-sdk-shared` … captured the CJS `react/index.js` … ~560 kB of AI SDK + zod preloaded in both windows") und ersetzt `manualChunks` durch `codeSplitting.groups` (eager Priorität 100 / lazy 0) mit `packageOf()` | runtime (Build-Output), dependency (Upstream-Quelltext) | Nach Slice 6 wie geplant wird der neue `dist-budget.test.ts` (SVC-15: „kein AI-SDK … im Start-Graphen") für beide Fenster rot; ohne den Test bleibt der Startgewinn von BR-18 für das AI-SDK aus | MIG-62 Zielmuster: Upstream-Chunk-Strategie aus `f6f0004` übernehmen (`packageOf()`, `EAGER_REACT_PACKAGES`, `codeSplitting.groups` eager vor lazy; rolldown 1.2.6 kennt `codeSplitting.groups`, `define-config-*.d.mts:864,881`), Icon-Chunk darin. Q&A #12 und Integration `vite` korrigieren: AI-SDK ist nur im Quellgraphen lazy, im Build heute eager | nein |
| R-2 | refuted | E3 (INV-19) | `architecture.md` (INV-19 Z. 380) | „Startpaket beider Fenster enthält kein `@ai-sdk`, `ai`, `streamdown`, `katex`, `@codemirror`, `@uiw` · Tests `src/app/eager-budget.test.ts` · covered" | Build-Output wie R-1: `@ai-sdk/*` und `ai@` in den statischen Chunks beider Fenster. `eager-budget.test.ts` verfolgt laut `scripts/eager-graph.mjs:1-8` nur statische Quell-Imports, nicht den Chunk-Graphen; der Test ist grün, obwohl das Startpaket das AI-SDK enthält | runtime (Build-Output), code (Testinhalt) | Die Invariante „Startpaket ohne AI-SDK" ist heute falsch; „covered" trifft nur auf den Quellgraphen zu | INV-19 auf den Quellgraphen eingrenzen („statischer Quell-Importgraph beider Fenster enthält kein …", covered durch `eager-budget.test.ts`); das Startpaket-Verhalten ist Zielverhalten von SVC-15/R-1, keine bestehende Invariante | nein |
| F-1 | fix | A, D (NFR-1, Monitoring) | `architecture.md` (NFR-1 Z. 465, Monitoring Z. 481) | NFR-1: „Zahl der `git_status`- und `fs_watch_*`-Aufrufe"; Monitoring: „`git_status_calls_per_min` … 0 ohne sichtbaren Konsumenten" | `useSourceControl.ts:255,272` frischt über `native.gitPanelSnapshot` auf (`invoke("git_panel_snapshot")`, `native.ts:314-318`); `git/operations.rs:114` führt dort `status_inner` aus, also `git status` | code (Laufzeit-Pfad der Messung) | Ein Zähler nur auf `git_status` zeigt 0, obwohl `git status` über `git_panel_snapshot` läuft; Slice 4 könnte grün gemessen werden, ohne dass Git-Status ruht | NFR-1 und Monitoring: Zähler über `git_status` UND `git_panel_snapshot`; Metrik z. B. `git_status_runs_per_min` | nein |
| F-2 | fix | F (MIG-27, Sweep) | `architecture.md` (MIG-27 Z. 298, Sweep Z. 346) | „Quelltext-Scan über `src/`: `document.hidden`, `visibilityState`, `visibilitychange` nur in `windowVisibility.ts` und im … `rendererPool.ts`" | MIG-26 (`windowVisibility.test.ts`: „`visibilityState` umdefiniert, echtes `visibilitychange`-Event", Test Strategy Z. 409) und MIG-34 (`EditorStack.window-hidden.test.tsx`) müssen diese Muster verwenden | artifact | Der Guard aus MIG-27 wird durch die eigenen Tests aus MIG-26/MIG-34 rot | MIG-27 und Sweep: Testdateien (`*.test.ts`, `*.test.tsx`) vom Scan ausnehmen oder ausdrücklich in die Allowlist aufnehmen | nein |
| O-1 | obligation | B, C (API-1) | implement | „Wartet begrenzt auf den Main-Thread, Überschreitung → Fehler `clipboard read timed out or was cancelled`" | Upstream `clipboard.rs@2723dc6:13-27`: `run_on_main_thread`, dann `spawn_blocking(rx.recv_timeout(5 s))` | dependency | `fs_clipboard_paths` blockiert weder den Main-Thread noch einen async-Worker; nach 5 s kommt der Fehlertext | 5 s wie Upstream, Warten über `tauri::async_runtime::spawn_blocking`; Rust-Test oder e2e für den Fehlertext | nein |
| O-2 | obligation | B (API-2, Q&A #9) | implement | „async Command `fs_copy` (blockierende Arbeit außerhalb des Main-Threads)" | Sync-Command läuft inline im IPC-Handler (tauri-macros `wrapper.rs:404-434`); Upstream kapselt den Batch in `spawn_blocking` (`copy.rs@2723dc6:26-34`) | dependency | Ein großer lokaler oder SSH-Kopiervorgang friert die UI nicht ein | gesamten Batch (lokal und SSH) in `tauri::async_runtime::spawn_blocking`; e2e: großer Ordner-Drop, UI bleibt bedienbar | nein |
| O-3 | obligation | B, C (MIG-14) | implement + test | „sonst und bei nicht unterstütztem Dateisystem exklusive Reservierung" | exFAT-Image: `renamex_np(RENAME_EXCL)` → `ENOTSUP` bei freiem Ziel, `EEXIST` bei belegtem; Reservierungs-Rückfall funktioniert dort; APFS/FAT unterstützen `RENAME_EXCL` | runtime (Messung) | Einfügen auf exFAT-Volume legt Kopien an, nie Überschreiben | Rückfall nur bei `ENOTSUP` (macOS) bzw. `EINVAL` (Linux `renameat2`, nicht gemessen) auslösen, nie bei `EEXIST`; Test mit `hdiutil`-exFAT-Image oder injiziertem errno | nein |
| O-4 | obligation | B, D (MIG-14, Trade-offs) | implement + test | „sonst … exklusive Reservierung"; „Drop funktioniert dort weiter" | Upstream Windows-Zweig `MoveFileExW` ohne `MOVEFILE_REPLACE_EXISTING` (`mutate.rs@2723dc6:157-183`); CI `cargo nextest` auf `windows-latest` (`ci.yml:107-129`) | dependency, code | Ordner- und Dateikonflikte auf Windows legen Kopien an; CI-Windows-Tests grün | Windows-Pfad wie Upstream (`MoveFileExW` ohne Replace), kein Reservieren + `std::fs::rename` für Ordner; Konflikttests laufen im Windows-CI-Job | nein |
| O-5 | obligation | B (API-3, SVC-3) | implement + test | „Ordner über exklusive Reservierung des Zielnamens und atomaren Tausch …; ohne Hardlink-Unterstützung Rückfall auf Prüfen-dann-Umbenennen" | Host + lokal: `rename` auf nicht-leere Reservierung `ENOTEMPTY`; `link` auf exFAT `ENOTSUP`; zwischen `mkdir` und `rename` ist der Zielname kurz als leerer Ordner sichtbar | runtime (Messung) | Scheitert der Tausch, bleibt keine leere Reservierung unter dem Zielnamen; Link-Fehler `ENOTSUP`/`EPERM` führen in den Rückfall, `EEXIST` zum nächsten Kandidaten | `publish`: bei Fehler nach `mkdir` die Reservierung mit `os.rmdir` entfernen (scheitert sicher, wenn nicht leer); Rückfall-errnos benennen; Helper-Test gegen lokales python3 3.9.6 und Smoke gegen `litha-claude` (3.13.5) | nein |
| O-6 | obligation | E (SVC-7, MIG-26, MIG-28, MIG-38) | implement + test | „einmal in `src/main.tsx` installiert"; MIG-26 „Startwert" | Hauptfenster startet unsichtbar (`tauri.conf.json:23` `"visible": false`), `show()` erst per `setTimeout` 50/500 ms nach dem Rendern (`main.tsx:42-49`). Probe: WKWebView in nicht gezeigtem Fenster meldet beim Skriptstart `hidden`, beim Zeigen `visibilitychange->visible` | runtime (Messung) | SVC-7 startet mit `hidden = true` und setzt `data-window-hidden`, wechselt beim Zeigen; die Space-Persistenz flusht beim Start nicht | Startwert aus `document.visibilityState` lesen, Start-Übergang hidden→visible als normalen Wechsel behandeln, Flush nur bei visible→hidden; Test „Start unsichtbar → gezeigt" | nein |
| O-7 | obligation | A (BR-9, Q&A #3) | qa | „e2e prüft alle drei Fälle, nativer Hinweis bleibt Fallback" | gemessen: minimiert und verdeckt → `hidden`; anderer Space nicht gemessen | runtime | In allen drei Fällen pausieren Animationen und Media | e2e Slice 2/5 mit Space-Wechsel ausdrücklich durchführen; fehlt der Fall, greift der benannte Fallback | nein |
| O-8 | obligation | A (NFR-1) | qa | „60 s Sampling der CPU von `terax` + WebContent-Prozess per `ps`" | drei `com.apple.WebKit.WebContent`-Prozesse mit `ppid 1` (72874, 72879, 81917), `lsof` ohne App-Bezug; nur Startzeit-Gleichheit (81917 zu `terax` 81913) ordnet zu | runtime (`ps`) | Messung erfasst genau die WebContent-Prozesse der Messinstanz (Haupt- und ggf. Settings-Fenster) | PIDs vor/nach dem Start der Messinstanz vergleichen oder über Startzeit zuordnen; zugeordnete PIDs im PR nennen | nein |
| O-9 | obligation | A (NFR-2) | qa | „Median aus 5 Starts der Dev-Instanz" | `tauri dev` lädt vom Dev-Server `http://localhost:1420` ohne Bundling; Chunks/Preloads aus S6 wirken nur mit `frontendDist` | runtime (Konfiguration) | Startzahlen zeigen den Effekt von Chunk- und Preload-Änderungen | Startmessung mit gebautem Frontend (`pnpm tauri build --debug`, eigener `identifier`; Test-Bridge braucht Debug-Build) | nein |
| O-10 | obligation | C (BR-1, VAL-4) | test | „Erster freier Kandidat aus SVC-2" | `NAME_MAX` 255 (macOS, Host); Suffix ` copy 10000` = +11 Byte; Staging-Pfad `/.terax-copy-XXXXXX/item` länger als Ziel; `PATH_MAX` 1024 macOS | runtime (`getconf`) | Name mit 250 Byte bzw. Baum nahe `PATH_MAX`: Element scheitert mit Grund, nichts überschrieben, Staging entfernt | Rust-Test für beide Grenzfälle (lokal), Smoke-Fall für SSH | nein |
| O-11 | obligation | A (BR-3) | qa | „Teilkopien bleiben im versteckten Staging, nie unter dem Zielnamen" | Staging liegt als `.terax-copy-…` im Zielordner; „versteckt" nur bei `showHidden = false` (Default `settings/store.ts:323`; `tree.rs` blendet Punktdateien nur ohne `show_hidden` aus) | code, runtime | Mit `showHidden = true` taucht der Staging-Ordner kurz auf, unter dem Zielnamen nie etwas Halbes; nach Abschluss ist er weg | e2e lokal + SSH mit `showHidden = true` und großem Ordner | nein |
| O-12 | obligation | C (VAL-5) | implement + test | „Grenzwerte wie Upstream `copy.rs`, Festlegung über die Gate-1-Auflagen" | Upstream `copy.rs@2723dc6:9-11`: `MAX_COPY_SOURCES = 1024`, `MAX_COPY_SUFFIX = 10_000`, `MAX_COPY_DEPTH = 128` | dependency | 1025 Quellen → Gesamtfehler `copy at most 1024 items at a time`; Tiefe 129 → Elementfehler | Werte 1024 / 128 / 10.000 übernehmen; Rust-Tests an beiden Grenzen (VAL-5) | nein |
| N-1 | note | D (MIG-1) | – | „App-Kit zusätzlich `NSPasteboardItem`; Foundation zusätzlich `NSArray`, `NSURL`" | Fork setzt bei `objc2-app-kit`/`objc2-foundation` keine `default-features = false` (`Cargo.toml:67-68`); die Default-Listen der 0.3.2-Crates enthalten `NSPasteboardItem`, `NSArray`, `NSURL` schon | dependency | Feature-Ergänzung ändert den Build nicht | harmlos, dokumentiert die Nutzung; Upstream schaltet Defaults ab | nein |
| N-2 | note | D (Risks) | – | „`dist-budget.test.ts` verlängert `pnpm test` spürbar · High" | `vite build --sourcemap` im Worktree: 7 s | runtime | Testlauf wächst um Sekunden, nicht Minuten | Likelihood auf Low/Med senken; Fallback `test:dist` unnötig | nein |
| N-3 | note | A (BR-9, Risks) | – | „BR-9-Pause bringt kaum Ersparnis, weil WebKit verdeckte Seiten ohnehin drosselt · Med" | Probe: bei `hidden` stehen rAF und Animations-Updates (`currentTime` eingefroren) | runtime | Die CSS-Pause bei unsichtbarem Fenster zeigt in NFR-1 vermutlich keinen messbaren Effekt; der Gewinn liegt in BR-10 | im PR nach BR-15 als „ohne messbaren Effekt" benennen, falls so gemessen | nein |
| N-4 | note | D (Integrations) | – | `tauri` „Projekt 2.11.5 … → Ziel ≥ 2.12.2" | Upstream-Lock zieht `wry` 0.55.1 → 0.57.0 (WKWebView-Schicht) | dependency | – | in der Integrations-Tabelle erwähnen; e2e-Rundgang nach Slice 7 deckt es ab | nein |
| N-5 | note | B (Constraints) | – | „eigener `identifier` + eigenes `MANAGED_PREFIX`" | beide fest kodiert (`tauri.conf.json:5`, `managedTmux.ts:22`) | code | – | Labor-Änderungen lokal halten, nie committen (QA-Runbook) | nein |
| N-6 | note | D (Integrations) | – | „`reqwest` 0.12 bleibt" | `Cargo.lock` enthält zusätzlich `reqwest` 0.13.2 transitiv | dependency | – | Aussage gilt für die direkte Abhängigkeit; zwei reqwest-Versionen bleiben im Build | nein |
