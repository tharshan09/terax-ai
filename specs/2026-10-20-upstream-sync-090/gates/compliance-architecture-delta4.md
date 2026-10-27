# Gate 1: Architecture Compliance, Delta-Lauf 4

| Feld | Wert |
|---|---|
| Geprüft | `specs/2026-10-20-upstream-sync-090/architecture.md` (721 Zeilen), `discovery.md`, `codebase-scan.md`, `gates/obligations.md`; Code-Stand `68d45d0` (Worktree `upstream-sync-090`); Upstream per `git show upstream/main`; Abhängigkeit `ignore 0.4.32` (`src-tauri/Cargo.lock:2009-2011`, Quelltext `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/ignore-0.4.32`) |
| Vorlauf | `gates/compliance-architecture-delta3.md` (F-1 bis F-7, O-1, N-2) |
| Resolver-Entscheid | `gates/DECISION-gate1-staging-search-2.md` (Anforderungen 1 bis 18) |
| Prüfdatum | 2026-10-27 |
| Modus | Delta-Lauf (keine Perspektive). Prüfmenge: (1) Einarbeitung F-1 bis F-7, O-1 und Anforderungen 1 bis 18; (2) geänderte Stellen SEC-4 (Z.207), Risiko-Zeile SSH-Staging (Z.524), Sweep „Staging-Sichtbarkeit“ (a) bis (e) samt `read_dir`-Ausnahmen (Z.357-363), MIG-14 (Z.289), MIG-19 (Z.294), MIG-73 bis MIG-76 (Z.348-351), Q&A #7 (Z.697), #28 (Z.718), #31 (Z.721), Traceability BR-3 (Z.620), NFR-3 (Z.482), Research-Log „Gate 1 Delta 2/3“ (Z.678-679), OB-21, OB-28, OB-29; (3) neu geschriebene Behauptungen darin am Beleg |
| Nicht geprüft | unveränderte Abschnitte (Vorlauf-Verdikte gelten, Belegstellen vom Diff nicht berührt); Research-Log Z.677 (historische Zeile Delta 1, unverändert); keine wireframes.md, keine bindings.md (E2 still bestanden) |
| Messungen | (a) Probe-Binary gegen `ignore =0.4.32` (Scratchpad `probe/`) mit der Walker-Konfiguration aus `grep.rs:80-88` / `:354-361`, seriell (`build`) und parallel (`build_parallel`), je ohne und mit `filter_entry(!name.starts_with(".terax-copy-"))`, im `git init`-Repo mit `.gitignore` `*` / `!*/` / `!*.txt`, Dateien `.terax-copy-x/src/report.txt`, `a/.terax-copy-y/b.txt`, `src/other.txt`; `hidden(true)` und `hidden(false)`; Wurzel = Repo und Wurzel = `.terax-copy-x`. (b) Git-Probe (Scratchpad `gp/`): ungetrackter Staging-Ordner, danach `git add -A`, `git status --porcelain=v2 -z --untracked-files=all` |

## Skript-Tabelle (Arch-Precheck, übernommen)

| result | attempt | Befund | Klasse | Detail |
|---|---|---|---|---|
| PASS | 6 | AR-7 | note | Scan-Plausibilität: 3 NEW-Zeilen ohne Zielpfad (Zielpfade stehen in architecture.md unter Context & Research) |

## Summary

| decision | refuted | fix | obligation | note |
|---|---|---|---|---|
| 0 | 0 | 2 | 2 | 2 |

**Verdict:** APPROVED

## Einarbeitung Vorlauf

| Vorlauf | Stelle jetzt | Evidenz | Status |
|---|---|---|---|
| F-1 `refuted` (`grep.rs`-Ausnahme) | MIG-76 Z.351, SEC-4 Z.207, Sweep (a) Z.358, OB-28 | Ausnahme „Ausnahmen ohne eigenes Prädikat … `grep.rs:81,355`“ nicht mehr im Dokument (grep: 0 Treffer „81,355“, „Ausnahmen ohne eigenes“, „verbirgt jeden“, „fest verborgen“); Prädikat an beiden `grep.rs`-Walkern; Probe bestätigt Wirkung (s. Check C) | eingearbeitet, hält |
| F-2 `fix` (Wurzel) | SEC-4 Geltungsbereich und Notes, Q&A #7, Risiko-Zeile, OB-21 | „Aufzählungen, deren Wurzel außerhalb eines Staging-Ordners liegt; die Wurzel wird nie gefiltert (`walk.rs:1150-1152`)“; Probe Wurzel `.terax-copy-x` → Inhalt geliefert, auch mit Filter | eingearbeitet, hält |
| F-3 `decision` (Index-Einträge) | MIG-75 Z.350, Q&A #31 Z.721, SEC-4 Git-Satz, Sweep (d) Z.361, OB-29 | nur `? ` (`parser.rs:62`) gefiltert; Invariante Panel-Commit belegt (s. Bestands-Behauptung 10) | eingearbeitet, hält |
| F-4 `fix` (`git_diff`-Begründung) | Sweep Z.363 | `operations.rs:203-219` ohne Pathspec `git diff [--cached]`; ungetrackte Dateien nie; Index-Einträge ungefiltert | eingearbeitet, hält |
| F-5 `fix` (NFR-3) | NFR-3 Z.482 | nennt Inhaltssuche, AI-Dateiliste, AI-`grep`/`glob`, Git-Status, MIG-75/76, OB-21/28/29 | eingearbeitet, hält |
| F-6 `note` (Research-Log SSH) | Z.678 | `grep.rs:278` → `ssh::grep`; `native.ts:158-166` `guardSsh`, `:212-213` `grep`, `:223-224` `glob` | eingearbeitet, hält |
| F-7 `note` (`2 `-Token) | MIG-75 Test „`2 `-Eintrag mit Staging-Segment und Ursprungs-Token, gefolgt von einem normalen Eintrag“ | `parser.rs:48-49` verbraucht das Folgetoken | eingearbeitet |
| O-1 `obligation` | OB-28 | Whitelist-Probe an jeder Walker-Stelle, Nachweis Rust-Tests in `grep.rs`, `search.rs`, `tree.rs` | eingearbeitet; Lücke Variante `show_hidden = false` → O-2 |
| N-2 `note` (AR-7) | Skript-Tabelle | Arch-Precheck attempt 6 | unverändert |

## Anforderungen des Resolver-Entscheids

| # | Anforderung | Stelle | Status |
|---|---|---|---|
| 1 | SEC-4 über Primitive, Begründung, Geltungsbereich, Git-Invariante, Ausnahme-Satz gestrichen, Notes | Z.207 | umgesetzt |
| 2 | Risiko-Zeile Mitigation/Fallback | Z.524 | umgesetzt |
| 3 | Sweep (a) bis (e), Streichungen, F-4 | Z.357-363 | umgesetzt; Ausnahme-Begründungen in (b) teils ungenau → G-1, G-2 |
| 4 | MIG-14 Leser-Liste mit MIG-76 | Z.289 | umgesetzt |
| 5 | MIG-73 `git_non_ignored_names` | Z.348 | umgesetzt |
| 6 | MIG-74 Whitelist-Test | Z.349 | umgesetzt; Variante `show_hidden = false` fehlt → O-2 |
| 7 | neue MIG-76 | Z.351 | umgesetzt |
| 8 | MIG-75 nur `? `, Invariante, Tests | Z.350 | umgesetzt |
| 9 | MIG-19 Primitive, keine Ignore-Semantik | Z.294 | umgesetzt |
| 10 | Q&A #7 | Z.697 | umgesetzt |
| 11 | Q&A #28 | Z.718 | umgesetzt |
| 12 | Q&A #31 | Z.721 | umgesetzt |
| 13 | Traceability BR-3 | Z.620 | umgesetzt |
| 14 | NFR-3 | Z.482 | umgesetzt |
| 15 | Research-Log F-6 und neue Zeile Delta 3 | Z.678, Z.679 | umgesetzt |
| 16 | OB-21 | `obligations.md` OB-21 | umgesetzt |
| 17 | OB-28 | `obligations.md` OB-28 | umgesetzt |
| 18 | OB-29 | `obligations.md` OB-29 | umgesetzt |

## Check A: Feature Mapping (Delta)

| Item | Evidenz | Status |
|---|---|---|
| BR-3 (`discovery.md:208` „Ein Element erscheint im Ziel erst, wenn es vollständig kopiert ist …“) gegen SEC-4, MIG-73/74/75/76/19 | jede Aufzählungs-Primitive aus dem Inventar trägt das Prädikat (Sweep (a) bis (d)); Probe: Prädikat schließt Staging im Whitelist-Repo seriell und parallel aus | PASS |
| BR-3 gegen Git-Status | `? `-Einträge gefiltert; App-eigene Staging-Reste sind immer `? ` (App stagt nur Pfade aus dem gefilterten Status, `useSourceControlPanel.ts:716,776-784,834`) | PASS |
| Kohärenz NFR-3 / SEC-4 / Q&A #7/#28/#31 / Risiko / BR-3-Traceability / OB-21/28/29 | gleiche Stellenmenge, gleicher Geltungsbereich „Wurzel außerhalb“, gleiche Git-Eingrenzung | PASS |

## Check B: Constraint Mapping

N/A im Delta: keine wireframes.md, Constraint-Tabelle unverändert.

## Check C: Realistic Data

| Item | Evidenz | Status |
|---|---|---|
| `ignore 0.4.32` Hidden-Regel nur ohne Ignore-/Whitelist-Treffer | `dir.rs:489-491` `if m.is_none() && self.inner.opts.hidden && is_hidden_entry(dent)`; Probe `hidden(true)` ohne Filter: `r/.terax-copy-x/src/report.txt` und `r/a/.terax-copy-y/b.txt` geliefert (seriell und parallel) | hält |
| `filter_entry` seriell nach Ignore-/Whitelist-Auswertung, kein Betreten | `walk.rs:1162` `should_skip_entry`, danach `:1177-1180` Filter; bei `true` `:1230` `skip_current_dir()`; Probe mit Filter: weder `.terax-copy-x` noch `.terax-copy-x/src` noch `a/.terax-copy-y` geliefert, `src/other.txt` geliefert | hält |
| `filter_entry` parallel nach Ignore-/Whitelist-Auswertung, kein Betreten | `walk.rs:1904` `should_skip_entry`, danach `:1926-1931` Prädikat, `:1932-1933` nur bei bestandenem Prädikat `self.send(Work …)`; Probe `build_parallel` mit Filter: identisch zur seriellen Liste | hält |
| Wurzel nie gefiltert | seriell `walk.rs:1150-1152`; parallel Wurzel ohne Filter als `Work` eingereiht `:1480-1496`; Probe Wurzel `r/.terax-copy-x`: Inhalt in beiden Walker-Arten auch mit Filter geliefert | hält |
| nur ein Filter je `WalkBuilder` | `walk.rs:1043-1045` „Calling this subsequent times overrides previous filter predicates“; `search.rs:111-120`, `:307-315` tragen bereits einen `filter_entry` (PRUNE_DIRS), kein Test auf PRUNE_DIRS in `search.rs` (grep `PRUNE_DIRS\|node_modules`: nur `:42-43,118,312`) | → O-1 |
| Whitelist-Pfad bei `show_hidden = false` | `search.rs:104`, `:299` und `tree.rs:48` setzen `.hidden(!show_hidden)`; Probe `hidden(true)` (= `show_hidden = false`) ohne Filter liefert Staging; geplante Whitelist-Tests (MIG-73/74, OB-28) nur mit `show_hidden = true` | → O-2 |
| Git: ungetrackt → `? `, extern gestagt → `1 A.` | Probe: vor `git add -A` `? .terax-copy-x/report.txt`; danach `1 A. N... … .terax-copy-x/report.txt` | hält (MIG-75 lässt `1 ` durch) |

## Check D: Completeness + Dependencies

| Item | Evidenz | Status |
|---|---|---|
| Inventar Aufzählungs-Primitive vollständig | `grep -rn "WalkBuilder::new" src-tauri/src` → 5 (`tree.rs:47`, `grep.rs:80`, `:354`, `search.rs:103`, `:298`); `grep -rn "read_dir" src-tauri/src` → `std::fs::read_dir` nur `tree.rs:167,256`, `mutate.rs:198`, `ssh.rs:1172`, `history/mod.rs:76`, `test_bridge.rs:40`; kein `Path::read_dir()`, kein `walkdir`/`glob::`/`jwalk`; Helper `os.scandir`/`os.walk` nur `ssh.rs:297,316,484,518`, kein `listdir`/`glob.glob`; `git status` nur `operations.rs:142-146`; Frontend ohne `plugin-fs`/eigenes `readDir` (einziger Treffer `native.ts:199` → `fs_read_dir`) | hält |
| Abhängigkeit `ignore` | `Cargo.lock:2009-2011` `0.4.32`, Probe gegen `=0.4.32` | hält |

## Check E: Pattern Consistency (Gate 1b)

Delta ohne Änderung an Anti-Slop-Dispositionen und Scanner-Zuordnung; Skript AR-7 übernommen. PASS (unverändert).

## Check E2: Bindings Coverage

N/A: kein `bindings_path`/`reconcile_path`.

## Check E3: Existing-Behavior Invariants

Keine INV-Zeile im Delta geändert. PASS (unverändert).

## Check F: Migration Completeness (Delta)

| Item | Evidenz | Status |
|---|---|---|
| Sweep (a) `WalkBuilder::new` → genau 5, jede mit Prädikat | grep (s. Check D); MIG-73 (`tree.rs:47`), MIG-74 (`search.rs:103,298`), MIG-76 (`grep.rs:80,354`) | PASS |
| Sweep (b) `fs::read_dir(` → `tree.rs:167,256` + 4 Ausnahmen | heute 6 Treffer, deckungsgleich; nach MIG-15 entfällt `mutate.rs:198`, Upstream-`copy.rs` bringt `:188` (`copy_recursive`) und Testtreffer `:370,400,421,510`, die (b) nicht benennt | Ziel-Zustand nach Migration unvollständig → G-1 |
| Ausnahme `mutate.rs:198` | `mutate.rs:195-206` `copy_recursive` über die Drag-Drop-Quelle (`:208-210`), keine Aufzählung für die Oberfläche; Begründung in (b) nur „wandert mit MIG-15 nach `copy.rs`“ | Ausnahme hält, Grund fehlt → G-1 |
| Ausnahme `ssh.rs:1172` | `ssh.rs:1166-1185` `upload_recursive` über die lokale Quelle | hält |
| Ausnahme `history/mod.rs:76` | `history/mod.rs:71-94` `scan_path` liest die Ordner aus `$PATH` (`:74-75`), überspringt Ordner (`:80-82`), sammelt ausführbare Dateinamen für `path_cmds` (`:123`); kein Verlauf, kein Workspace | Ausnahme hält, Grund falsch → G-2 |
| Ausnahme `test_bridge.rs:40` | `test_bridge.rs:16-21` nur bei `cfg!(debug_assertions)` und `TERAX_TEST_BRIDGE`; liest das Bridge-Verzeichnis | hält |
| Sweep (c) `os.scandir(\|os.walk(` → 4 | `ssh.rs:297,316,484,518` | PASS |
| Sweep (d) `files.push` → `:62` mit, `:44,51,57` ohne | `parser.rs:44,51,57,62` | PASS |
| Sweep (e) Kreuzprobe `show_hidden` | Auswertungsstellen `tree.rs:48` (a), `:204` (b `:167`), `:271` (b `:256`), `search.rs:104,299` (a), `ssh.rs:299,318` (c scandir), `:487,490` (c walk `:484`), `:520,522` (c walk `:518`); übrige Treffer Parameter-Durchreichung (`tree.rs:164,253`, `search.rs:95`, `ssh.rs:998,1008,1073`) | PASS |
| Sweep `git_diff`/`git_commit_files` | `operations.rs:203-219`; `git_commit_files` Vorlauf #18 | PASS |
| MIG-73 bis MIG-76, MIG-19, MIG-14 Anker | s. Bestands-Behauptungen | PASS |

## Data Type Verdicts

Keine Datenbank, keine neuen persistenten Felder im Delta. Keine Datentyp-Checks.

## Bestands-Behauptungen (Delta-Prüfmenge)

| # | Behauptung (architecture.md) | Beleg | Verdikt |
|---|---|---|---|
| 1 | SEC-4/Q&A #28: `WalkBuilder` an `tree.rs:47`, `search.rs:103`, `:298`, `grep.rs:80`, `:354` | grep `WalkBuilder::new` | hält |
| 2 | SEC-4: Verzeichnis-Listing `tree.rs:167`, `:256` | `tree.rs:167`, `:256` `std::fs::read_dir(&root)` | hält |
| 3 | SEC-4/MIG-19: Helper-Listing `ssh.rs:297`, `:316` (`os.scandir`), `:484`, `:518` (`os.walk`) | `ssh.rs:297,316,484,518` | hält |
| 4 | SEC-4: Parser-Pfad ungetrackt `parser.rs:62` | `parser.rs:61-63` | hält |
| 5 | SEC-4/MIG-76: Hidden-Regel nur ohne Ignore-/Whitelist-Treffer (`dir.rs:490`) | `dir.rs:489-491`; Probe ohne Filter liefert Staging bei `hidden(true)` | hält |
| 6 | SEC-4: Prädikat wirkt seriell nach der Auswertung und verhindert das Betreten (`walk.rs:1162,1177`) | `walk.rs:1162`, `:1177-1180`, `:1225-1231`; Probe seriell mit Filter: kein Eintrag unter `.terax-copy-x` | hält |
| 7 | SEC-4: dito parallel (`walk.rs:1904,1927-1934`) | `walk.rs:1904`, `:1926-1933`; Probe parallel mit Filter: kein Eintrag unter `.terax-copy-x`, auch nicht verschachtelt `a/.terax-copy-y` | hält |
| 8 | SEC-4: Wurzel nie gefiltert (`walk.rs:1150-1152`) | seriell `:1150-1152`, parallel `:1480-1496`; Probe Wurzel `.terax-copy-x` | hält |
| 9 | SEC-4: cd im Terminal `useWorkspaceCwd.ts:103-108`, getippter Pfad `pathComplete.ts:36-46` | `useWorkspaceCwd.ts:103-108` (`root = spaceActiveTab.cwd`), `pathComplete.ts:35-47` (`fs_read_dir` auf getippten Ordner) | hält |
| 10 | SEC-4/MIG-75/Q&A #31: mit Filter nur auf `? ` enthält ein Panel-Commit nie einen Pfad, den das Panel nicht als gestagt zeigt | `parser.rs:127-129` `is_staged` ist für `?`/`?` immer `false`, ein gefilterter Eintrag ist also nie gestagt; Commit `operations.rs:437-442` `git commit -m` über den Index; Index-Änderungen erscheinen als `1 `/`2 `/`u ` (ungefiltert) und speisen `stagedEntries` (`useSourceControlPanel.ts:420-426`); einziger Commit-Aufruf `useSourceControlPanel.ts:956`; Probe: nach `git add -A` `1 A. … .terax-copy-x/report.txt` | hält |
| 11 | Sweep (a): genau 5 Stellen, keine Ausnahme | grep | hält |
| 12 | Sweep (b): `fs::read_dir(` → `tree.rs:167`, `:256` + `mutate.rs:198`, `ssh.rs:1172`, `history/mod.rs:76`, `test_bridge.rs:40` | grep, 6 Treffer | hält (Stand heute) |
| 13 | Sweep (b): `mutate.rs:198` „wandert mit MIG-15 nach `copy.rs`“ als Ausnahmegrund | `mutate.rs:195-210` Kopierrekursion über Drag-Drop-Quelle; MIG-15 Z.290 entfernt `copy_recursive`; `upstream/main:src-tauri/src/modules/fs/copy.rs:188` `std::fs::read_dir(src)` und `:370,400,421,510` Testtreffer | Ausnahme hält, Grund und Ziel-Zustand fehlen → G-1 |
| 14 | Sweep (b): `ssh.rs:1172` Rekursion über die vom User gewählte Kopierquelle | `ssh.rs:1166-1185` `upload_recursive` | hält |
| 15 | Sweep (b): `history/mod.rs:76` „App-interner Verlauf außerhalb des Workspace“ | `history/mod.rs:71-94` `scan_path` über `$PATH`, Ordner übersprungen `:80-82`, Ergebnis `path_cmds` `:123` | Ergebnis (keine Workspace-Aufzählung, kein Staging-Inhalt erreichbar) hält, Grund falsch → G-2 |
| 16 | Sweep (b): `test_bridge.rs:40` dev-only | `test_bridge.rs:1-21`, `:40` | hält |
| 17 | Sweep (c): 4 Stellen, Spiegel auf `dirnames` vor dem Abstieg und auf `filenames` | `ssh.rs:484-491`, `:518-523` (`dirnames[:] = …` in-place) | hält |
| 18 | Sweep (d): `:62` mit Prädikat, `:44,51,57` ohne | `parser.rs:44,51,57,62` | hält |
| 19 | Sweep (e): jede `show_hidden`-Auswertung liegt an (a) bis (c) | grep, s. Check F | hält |
| 20 | Sweep: `git_diff` ohne Pfad `git diff --cached` über den Index, ungetrackte nie; zeigt nichts, was das Panel nicht zeigt | `operations.rs:203-219`; Index-/Worktree-Änderungen getrackter Pfade sind `1 `/`2 `/`u ` und ungefiltert | hält |
| 21 | Sweep: `git_commit_files` liest aus Commits (`operations.rs:675-707`) | Vorlauf delta3 #18, Belegstelle unverändert | hält |
| 22 | MIG-73 Current: `git_non_ignored_names` `:46-54`, `WalkBuilder` `:47`, `.hidden(!show_hidden)`, kein Prädikat; Filter `:204`, `:271`; Testmodul `:278` | `tree.rs:46-60`, `:204`, `:271`, `:278` | hält |
| 23 | MIG-74 Current: `filter_entry` `:111-120` prüft nur `PRUNE_DIRS`; `fs_list_files` `:298`, `:299`, `:312`; Muster `reg_for` `:405` | `search.rs:103-122`, `:298-316`, `:405` | hält; Einbau in den bestehenden Filter → O-1 |
| 24 | MIG-76 Current: `search_tree` `:80-88` (`fs_grep` `:227`, `fs_grep_interactive` `:297`), `fs_glob_impl` `:354-361`, Testmuster `:430-434`, SSH-Zweig `:278` | `grep.rs:80-88`, `:227`, `:297`, `:354-362`, `:430-435`, `:274-279` | hält |
| 25 | MIG-76: Probe mit `.gitignore` `*`/`!*/`/`!*.txt` liefert `.terax-copy-x/src/report.txt` | eigene Probe, `hidden(true)` seriell und parallel | hält |
| 26 | MIG-75 Current: `out.files` ungefiltert `:42-64`, `changed_files` `operations.rs:166`, lokal geparst | `parser.rs:42-64`, `operations.rs:137-167` | hält |
| 27 | MIG-75: `2 `-Eintrag verbraucht Ursprungs-Token (Test Token-Ausrichtung) | `parser.rs:48-49` | hält |
| 28 | MIG-19: Filter `:299`, `:318`, `:486-490`, `:520-522`; `grep` bekommt von `ssh::grep` kein `showHidden`; Helper ohne Ignore-Semantik | `ssh.rs:299,318,486-490,520-522`; `ssh.rs:1086-1091` (Signatur ohne `show_hidden`); Helper kennt nur `SEARCH_PRUNE` (`:262`), keine `.gitignore`-Auswertung | hält |
| 29 | MIG-19: `remote_exists` `:1145`, Testmuster `:1422` | `ssh.rs:1145`, `:1422` | hält |
| 30 | MIG-14: einzige Quelle für MIG-73, MIG-74, MIG-75, MIG-76 und den Pin-Test aus MIG-19 | Z.289; MIG-73/74/75/76 verweisen auf MIG-14 | hält |
| 31 | Research-Log Z.678: `fs_grep_interactive` SSH über `grep.rs:278`; AI-`grep`/`glob` (`native.ts:213,224`) per `guardSsh` (`native.ts:158-166`) | `grep.rs:278`, `native.ts:158-167`, `:212-213`, `:223-224` | hält |
| 32 | NFR-3 Z.482 deckt dieselbe Stellenmenge wie SEC-4 | Z.207, Z.482 | hält |
| 33 | Q&A #7/#28/#31, Risiko Z.524, BR-3 Z.620: Wortlaut gemäß Entscheid, Geltungsbereich „Wurzel außerhalb“ | Z.697, Z.718, Z.721, Z.524, Z.620 | hält |
| 34 | OB-21, OB-28, OB-29 gemäß Anforderungen 16 bis 18 | `obligations.md` | hält |
| 35 | Q&A #31/OB-29: App stagt nur Pfade aus dem gefilterten Status | `useSourceControlPanel.ts:709-718`, `:776-785`, `:831-836` (Pfade aus `entry`/`unstagedEntries`) | hält |
| 36 | Entscheid/Sweep-Schluss: keine weitere Aufzählungs-Primitive | Check D | hält |

Self-Check: 36 erhoben, 36 Verdikte, 0 NICHT GEMESSEN.

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|---|---|---|---|---|---|---|---|---|---|
| G-1 | fix | F (Sweep (b)) | architecture.md (Sweep Z.359) | „Ausnahmen mit Grund: `mutate.rs:198` (wandert mit MIG-15 nach `copy.rs`)“ | MIG-15 (Z.290) entfernt `copy_recursive` aus `mutate.rs`; `upstream/main:src-tauri/src/modules/fs/copy.rs:188` `for entry in std::fs::read_dir(src)?` (Kopierrekursion), dazu Testzeilen `:370,400,421,510` `std::fs::read_dir(dest.path()).unwrap().count()` | code | Nach der Migration liefert `grep -rn "fs::read_dir(" src-tauri/src` Treffer in `copy.rs`, die (b) weder nennt noch begründet; der Grund der Ausnahme (Kopierrekursion über die Quelle) steht nur bei `ssh.rs:1172` | (b) Ausnahme umformulieren: „`copy.rs` `copy_recursive` (heute `mutate.rs:198`, mit MIG-15 verschoben): Rekursion über die vom User gewählte Kopierquelle, keine Aufzählung für den User; Treffer in `#[cfg(test)]`-Modulen zählen Testergebnisse und sind ausgenommen“ | nein (neu) |
| G-2 | fix | F (Sweep (b)) | architecture.md (Sweep Z.359) | „`history/mod.rs:76` (App-interner Verlauf außerhalb des Workspace)“ | `src-tauri/src/modules/history/mod.rs:71-94` `scan_path`: `read_dir` je Ordner aus `$PATH` (`:74-76`), Ordner übersprungen (`:80-82`), ausführbare Dateinamen → `path_cmds` (`:123`) | code | Die Stelle liest keinen Verlauf, sondern die `$PATH`-Ordner; die Ausnahme hält trotzdem, weil sie keine Workspace-Aufzählung ist und Ordner (also jeden Staging-Ordner) überspringt | Grund ersetzen: „`history/mod.rs:76` (`scan_path`: ausführbare Dateien der `$PATH`-Ordner für Befehlsvorschläge, Ordner übersprungen `:80-82`, keine Workspace-Aufzählung)“ | nein (neu) |
| O-1 | obligation | C (MIG-74) | – | MIG-74: „`is_staging_name` aus `copy.rs` im `filter_entry`“ | `ignore-0.4.32/src/walk.rs:1043-1045` (ein zweiter `filter_entry` ersetzt den ersten); `search.rs:111-120`, `:307-315` tragen bereits den `PRUNE_DIRS`-Filter; kein Test auf `PRUNE_DIRS` in `search.rs` | dependency + code | Ein zusätzlicher `.filter_entry(…)`-Aufruf statt Erweiterung des bestehenden schaltet still entweder `PRUNE_DIRS` oder das Staging-Prädikat ab | Auflage: in `fs_search` und `fs_list_files` das Prädikat in den bestehenden `filter_entry` einbauen (ein Aufruf je Walker); Nachweis: Rust-Test je Walker mit `node_modules/x` und `.terax-copy-x/x` → beide nicht geliefert, Kontrolldatei geliefert; Ziel-Schritt implement, test | nein (neu) |
| O-2 | obligation | C (MIG-73, MIG-74, OB-28) | – | OB-28: „`fs_search` `report` mit `show_hidden = true` kein Treffer“; MIG-73: „`git_non_ignored_names` in einem Repo mit `.gitignore` `*`/`!*/`, `show_hidden = true`“ | `search.rs:104`, `:299`, `tree.rs:48` `.hidden(!show_hidden)`; Probe `hidden(true)` (= Standard `show_hidden = false`) im Whitelist-Repo ohne Filter: `.terax-copy-x/src/report.txt` geliefert | runtime + dependency | Die geplanten Whitelist-Tests decken nur `show_hidden = true`; ein an `show_hidden` gekoppeltes Prädikat (genau die Klasse aus F-1) bliebe in der Standard-Einstellung unentdeckt | Auflage: Whitelist-Fall für `fs_search`, `fs_list_files` und `git_non_ignored_names` zusätzlich mit `show_hidden = false` → `.terax-copy-x` bzw. `report.txt` nicht geliefert, Kontrolldatei geliefert; Ziel-Schritt test | nein (neu) |
| N-1 | note | E | – | – | Arch-Precheck AR-7 (attempt 6) | artifact | – | protokollieren | ja (Skript) |
| N-2 | note | C | – | – | Probe: Walker mit `hidden(true)` im Repo mit `.gitignore` `!*/` liefert `.git/hooks`, `.git/objects` u.a. (Whitelist hebt die Hidden-Regel auch für `.git` auf, `dir.rs:489-491`) | dependency + runtime | Bestandsverhalten außerhalb des Feature-Zuschnitts: Inhaltssuche und AI-`grep`/`glob` steigen in solchen Repos in `.git` ab | nur protokollieren; ggf. eigenes Thema | nein |
