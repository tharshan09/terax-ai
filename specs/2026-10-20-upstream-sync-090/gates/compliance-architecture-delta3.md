# Gate 1: Architecture Compliance, Delta-Lauf 3

| Feld | Wert |
|---|---|
| Geprüft | `specs/2026-10-20-upstream-sync-090/architecture.md`, `discovery.md`, `codebase-scan.md`, `gates/obligations.md`; Code-Stand `68d45d0` (Worktree `upstream-sync-090`); Upstream per `git show` (`11343a1`, `upstream/main`); Abhängigkeit `ignore 0.4.32` (Version aus `src-tauri/Cargo.lock:2010-2011`, Quelltext aus `~/.cargo/registry`) |
| Vorlauf | `gates/compliance-architecture-delta2.md` (E-1 bis E-5, E-O1, N-1, N-2) |
| Prüfdatum | 2026-10-27 |
| Modus | Delta-Lauf (keine Perspektive): Einarbeitung E-1 bis E-5, E-O1, N-1; geänderte Stellen MIG-75, MIG-14, MIG-45, MIG-62, SVC-13, VAL-8, SEC-4, Risiko-Zeile SSH-Staging, Q&A #7/#28/#31, Traceability BR-3, Sweep „Staging-Sichtbarkeit“ samt Ausnahmen, OB-21, OB-27, Research-Log-Zeile „Gate 1 Delta 2“; neu geschriebene Behauptungen darin am Beleg (Vollständigkeit der Aufzählungs-Liste, Tragfähigkeit der Ausnahmen) |
| Nicht geprüft | unveränderte Abschnitte (Vorlauf-Verdikte gelten, Belegstellen vom Diff nicht berührt; NFR-3 nur als Kohärenz-Gegenstelle zu SEC-4); keine wireframes.md, keine bindings.md (E2 still bestanden) |
| Messungen | (a) Probe-Binary gegen `ignore 0.4.32` mit exakt der Walker-Konfiguration aus `grep.rs:80-88` (Scratchpad `ignore-probe`); (b) Git-Probe in einem Scratchpad-Repo (`gitprobe`): Staging ungetrackt, danach extern `git add -A`, danach Commit |

## Skript-Tabelle (Arch-Precheck, übernommen)

| result | attempt | Befund | Klasse | Detail |
|---|---|---|---|---|
| PASS | 5 | AR-7 | note | Scan-Plausibilität: 3 NEW-Zeilen ohne Zielpfad (Zielpfade stehen in architecture.md unter Context & Research) |

## Summary

| decision | refuted | fix | obligation | note |
|---|---|---|---|---|
| 1 | 1 | 3 | 1 | 3 |

**Verdict:** FAILED (F-1 `refuted`, F-3 `decision`)

## Einarbeitung Vorlauf

| Vorlauf | Stelle jetzt | Evidenz | Status |
|---|---|---|---|
| E-1 Git-Status | MIG-75 (Z.350), SEC-4 (Z.207), Risiko (Z.517), Q&A #7 (Z.689), #28 (Z.710), #31 (Z.713), BR-3 (Z.613), Sweep (Z.356), OB-21 | Parser-Anker `parser.rs:42-64`, `? ` an `:61-63`, `changed_files` an `operations.rs:166`; Sweep ergänzt um `grep -n "files.push" parser.rs` (4 Treffer `:44,:51,:57,:62`); OB-21 nennt Source-Control-Panel und Git-Farbe | eingearbeitet; Filterumfang „alle vier Eintragsarten“ → F-3; NFR-3 nicht nachgezogen → F-5 |
| E-2 `git_non_ignored_names` | Sweep Z.356 | `tree.rs:46-48` liefert die Menge für das Flag, Einträge filtert `tree.rs:204` (`name.starts_with('.') && !show_hidden`) | eingearbeitet, hält |
| E-3 MIG-62-Anker | Z.337 | `vite.config.ts:100` `return "xterm"`; `:66-131` | eingearbeitet, hält |
| E-4 Untergrenze | VAL-8 Z.187, SVC-13 Z.147 | „Maximum aus Private und allen Kandidaten-Klassen, nie Public“; Upstream `11343a1:net/ip.rs:78-84` kehrt mit Kandidaten-Maximum zurück, Untergrenze `:89-90` | eingearbeitet, hält |
| E-5 Präfix-Quelle | MIG-14 Z.289 | `STAGING_PREFIX`, `is_staging_name`, `tempfile`-Builder nutzt Konstante; Upstream-Literal `upstream/main:src-tauri/src/modules/fs/copy.rs:131-132`; MIG-19 Pin-Test liest `STAGING_PREFIX` | eingearbeitet, hält |
| E-O1 | OB-27 | `kind("64:ff9b:1:808:8:808:808:808") == IpKind::Private`, Rust-Test, implement/test | eingearbeitet |
| N-1 | MIG-45 Z.320 | `useFileTree.ts:251-257` Effekt auf `showHidden`/`gitDecorations` liest alle geladenen Ordner neu | eingearbeitet, hält |

## Check A: Feature Mapping (Delta)

| Item | Evidenz | Status |
|---|---|---|
| BR-3 (`discovery.md:208` „Ein Element erscheint im Ziel erst, wenn es vollständig kopiert ist“) gegen MIG-73/74/75/19 + grep.rs-Ausnahme | lokale Inhaltssuche (`fs_grep_interactive`, `useContentSearch.ts:31`) liefert in einem Repo mit Whitelist-`.gitignore` Treffer aus `.terax-copy-x/` (Probe ws2) | FAIL → F-1 |
| BR-3 gegen Git-Status | MIG-75 deckt `? `-Einträge | PASS; Nebenwirkung auf Index-Einträge → F-3 |

## Check B: Constraint Mapping

N/A im Delta: keine wireframes.md, Constraint-Tabelle unverändert.

## Check C: Realistic Data

| Item | Evidenz | Status |
|---|---|---|
| Walker `grep.rs:80-88` (`hidden(true)`, `git_ignore(true)`, `ignore(true)`, `parents(true)`) | Probe ws1 (kein Repo): `.terax-copy-x/report.txt` nicht geliefert; ws2 (Git-Repo, `.gitignore` = `*`, `!*/`, `!*.txt`): `ws2/.terax-copy-x/src/report.txt` geliefert; ws3 (`.ignore` = `!.terax-copy-*/`): `ws3/.terax-copy-x/r.txt` geliefert; Wurzel `ws1/.terax-copy-x`: `report.txt`, `sub/b.txt` geliefert | F-1, F-2 |
| Ursache in `ignore 0.4.32` | `dir.rs:490` `if m.is_none() && self.inner.opts.hidden && is_hidden_entry(dent)`: Hidden-Regel greift nur, wenn kein Ignore-/Whitelist-Treffer vorliegt; `walk.rs:1150-1152` `if ent.depth() == 0 { return Ok(false); }`: die Wurzel wird nie gefiltert; `filter_entry` (`walk.rs:1176-1180`) läuft nach `should_skip_entry` und unabhängig von Whitelist | F-1, F-2 |
| Git: ungetrackter Staging-Ordner gegen `git diff --cached` | Probe: 0 Zeilen | hält für ungetrackt |
| Git: extern gestagter Staging-Inhalt | Probe nach `git add -A`: `1 A. N... … .terax-copy-x/report.txt`; `git diff --cached --name-only` → `.terax-copy-x/report.txt`; danach `git add a.txt && git commit` → Commit enthält `.terax-copy-x/report.txt` und `a.txt` | F-3, F-4 |

## Check D: Completeness + Dependencies

| Item | Evidenz | Status |
|---|---|---|
| Vollständigkeit der App-Aufzählungen (Research-Log Z.671, SEC-4) | registrierte Commands `src-tauri/src/lib.rs:382-479`; Workspace-Pfade zählen auf: `list_subdirs`, `fs_read_dir`, `fs_search`, `fs_list_files`, `fs_grep`, `fs_grep_interactive`, `fs_glob`, `git_panel_snapshot` + `git_status` (beide `status_inner`, `operations.rs:137-168`), `git_diff`, `git_commit_files`; pfadgebunden: `git_diff_content`, `git_show_commit`, `git_commit_file_diff`; Watcher nicht rekursiv (`watch.rs:186`), Ereignisse lösen nur Refetch aus; Frontend-Aufrufer per grep: `useFileTree.ts:133`, `pathComplete.ts:43`, `native.ts:200,213,224`, `CwdBreadcrumb.tsx:187`, `ExplorerSearch.tsx:115`, `useWorkspaceFiles.ts:36`, `useContentSearch.ts:31`; Änderungszahl `useSourceControl.ts:483` aus `changedFiles.length` | Liste vollständig; Tragfähigkeit der Ausnahmen → F-1, F-2, F-4 |
| SSH-Wege | `tree.rs:164`, `:253` → Helper; `search.rs:95` → `ssh::search`; `grep.rs:119` (`fs_grep_interactive`) → `ssh::grep`; AI-`grep`/`glob` auf SSH abgewiesen (`native.ts:158-166` `guardSsh`); Git per `ssh` (`process.rs:334-345`), geparst lokal (`operations.rs:153`) | PASS, Wortlaut Research-Log → F-6 |
| Abhängigkeit `ignore` | `Cargo.lock:2010-2011` `0.4.32`, Quelltext gelesen | F-1 |

## Check E: Pattern Consistency (Gate 1b)

Delta ohne Änderung an Anti-Slop-Dispositionen und Scanner-Zuordnung; Skript AR-7 übernommen. PASS (unverändert).

## Check E2: Bindings Coverage

N/A: kein `bindings_path`/`reconcile_path`.

## Check E3: Existing-Behavior Invariants

Keine INV-Zeile im Delta geändert. PASS (unverändert).

## Check F: Migration Completeness (Delta)

| Item | Evidenz | Status |
|---|---|---|
| Sweep-Kriterium 1 `grep -rn "show_hidden\|showHidden" …` | unverändert gegen Vorlauf, Ausnahme `git_non_ignored_names` jetzt benannt | PASS |
| Sweep-Kriterium 2 `grep -n "files.push" parser.rs` | 4 Treffer `parser.rs:44,51,57,62`, deckungsgleich mit den vier Eintragsarten in MIG-75 | PASS |
| Ausnahme „Walks mit fest verborgenen Punkt-Namen (`grep.rs:81,355`)“ | Probe ws2/ws3; `ignore` `dir.rs:490` | widerlegt → F-1 |
| Ausnahme `git_diff`/`git_commit_files` | `git_commit_files` liest `diff-tree … <sha>` (`operations.rs:675-707`): aus Commits, hält; `git_diff` ohne Pfad (`useSourceControlPanel.ts:886` `native.gitDiff(repo.repoRoot, null, true)`) zählt den Index selbst auf, nicht aus dem gefilterten Status | Begründung ungenau → F-4 |
| Suchraum für Walker | `grep -rn "WalkBuilder::new" src-tauri/src` → `tree.rs:47`, `grep.rs:80`, `grep.rs:354`, `search.rs:103`, `search.rs:298`; kein weiterer Walker | Suchraum für F-1-Resolution |
| MIG-75 | Anker s. Einarbeitung; Tests `? .terax-copy-x/report.pdf`, `? docs/.terax-copyright.md`, `? a/.terax-copy-y/b.txt` | PASS als Map-Zeile; Umfang → F-3, F-7 |
| MIG-14, MIG-45, MIG-62 | s. Einarbeitung | PASS |

## Data Type Verdicts

Keine Datenbank, keine neuen persistenten Felder im Delta. Keine Datentyp-Checks.

## Bestands-Behauptungen (Delta-Prüfmenge)

| # | Behauptung (architecture.md) | Beleg | Verdikt |
|---|---|---|---|
| 1 | Sweep: `git_non_ignored_names` (`tree.rs:46-48`) liefert nur das Flag für Einträge, die `:204` schon gefiltert hat | `tree.rs:46-48`, `:204` | hält |
| 2 | MIG-62: `xterm` `vite.config.ts:100`, `manualChunks` `:66-131` | `vite.config.ts:100` | hält |
| 3 | SVC-13: Upstream `ip.rs:77-83` kehrt im Kandidatenzweig ohne Untergrenze aus `:89` zurück | `11343a1:net/ip.rs:78-84`, `:89-90` | hält (±1) |
| 4 | VAL-8/SVC-13: in `64:ff9b:1::/48` Maximum aus Private und Kandidaten, nie Public | Zielverhalten, belegt durch OB-27 | hält |
| 5 | MIG-14: Upstream-Präfix als Literal im `tempfile`-Builder, Fork exportiert Konstante + Prädikat | `upstream/main:src-tauri/src/modules/fs/copy.rs:131-132` | hält |
| 6 | MIG-14: `is_staging_name` = „beginnt mit `STAGING_PREFIX`“ trifft die erzeugten Namen | `tempfile::Builder::prefix(".terax-copy-")` erzeugt `.terax-copy-<zufall>` | hält |
| 7 | MIG-19: Pin-Test gegen `STAGING_PREFIX` aus MIG-14 | MIG-14 Z.289 nennt MIG-19 als Leser | hält |
| 8 | OB-27 = Resolution E-O1 | `obligations.md:33` | hält |
| 9 | MIG-45: Muster `:251-257` | `useFileTree.ts:251-257` | hält |
| 10 | MIG-75: `1 `, `2 `, `u `, `? ` ungefiltert in `out.files` (`:42-64`, `? ` `:61-63`) | `parser.rs:42-64`, `:61-63` | hält |
| 11 | MIG-75: daraus `changed_files` (`operations.rs:166`) | `operations.rs:166` `changed_files: parsed.files` | hält |
| 12 | MIG-75/Q&A #31: lokal und SSH, geparst wird lokal | `process.rs:334-345` (`ssh … git`), Parse `operations.rs:153` | hält |
| 13 | MIG-75: `? docs/.terax-copyright.md` bleibt | Segment `.terax-copyright.md` beginnt nicht mit `.terax-copy-` | hält |
| 14 | MIG-75: Filter „gilt für alle vier Eintragsarten“ ohne Folge für Commits | Panel-Commit `operations.rs:438-443` (`git commit -m`, ohne Pfadliste) committet den ganzen Index; `canCommit` aus sichtbaren `stagedEntries` (`SourceControlPanel.tsx:364-365`); Probe: versteckter `1 A.`-Eintrag landet im Commit | Folge unbenannt → F-3 |
| 15 | Sweep: `files.push`-Stellen = Auswertungsstellen | `parser.rs:44,51,57,62` | hält |
| 16 | Sweep/SEC-4: `grep.rs:81,355` `.hidden(true)` „verbirgt jeden Punkt-Namen samt Inhalt“ | Probe ws2, ws3; `ignore-0.4.32/src/dir.rs:490` | widerlegt → F-1 |
| 17 | Sweep: `git_diff` liest nur Pfade aus dem gefilterten Status oder aus Commits | `useSourceControlPanel.ts:886` ruft `git_diff` ohne Pfad (`operations.rs:203-218`: kein Pathspec → ganzer Index); Probe: ungetrackt 0 Zeilen, extern gestagt enthalten | Ergebnis hält für ungetrackt, Begründung nicht → F-4 |
| 18 | Sweep: `git_commit_files` liest aus Commits | `operations.rs:675-707` `diff-tree … sha` | hält |
| 19 | SEC-4: „Inhalte unterhalb eines Staging-Ordners werden nie aufgezählt oder durchsucht“ | Explorer-Wurzel = Terminal-cwd (`useWorkspaceCwd.ts:103-108`); Pfadvervollständigung liest den getippten Ordner (`pathComplete.ts:36-46`); Unterordner-Menü je cwd-Segment (`CwdBreadcrumb.tsx:187`); `ignore` filtert die Wurzel nie (`walk.rs:1150-1152`); Probe Wurzel `ws1/.terax-copy-x` → beide Dateien | gilt nur für Wurzeln außerhalb → F-2 |
| 20 | Q&A #7: „keine App-Aufzählung zeigt ihn“; Risiko: „in keiner App-Aufzählung“; SEC-4 Notes: „erscheint … in keiner App-Aufzählung“ | wie #16 und #19 | widerlegt im Whitelist-Repo (F-1), sonst nur bei vom User angesteuertem Pfad (F-2) |
| 21 | Research-Log: Aufrufer `useFileTree.ts:133`, `pathComplete.ts:43`, `native.ts:200`, `CwdBreadcrumb.tsx:187`, `ExplorerSearch.tsx:115`, `useWorkspaceFiles.ts:36`, `native.ts:213,224`, `useContentSearch.ts:31` | grep über `src` | hält |
| 22 | Research-Log: Liste der App-Aufzählungen vollständig | Command-Liste `lib.rs:382-479`, Check D | hält |
| 23 | Research-Log: `fs_grep`/`fs_glob` „SSH über Helper-`grep`“ | nur `fs_grep_interactive` geht an `ssh::grep` (`grep.rs:119`); AI-`grep`/`glob` werden auf SSH abgewiesen (`native.ts:158-166`) | ungenau → F-6 |
| 24 | SEC-4: Git-Dekoration und Änderungszahl folgen dem Git-Status | `useSourceControl.ts:483` `changedFiles.length` | hält |
| 25 | BR-3-Traceability (Z.613) nennt MIG-75 und Git-Status | Z.613 | hält |
| 26 | Q&A #28 Empfehlung: Stellen lokal/SSH + Git-Status | Z.710, MIG-73/74/75/19 | hält |
| 27 | OB-21: e2e „Suche nach dem Dateinamen darin → kein Treffer“ | hält in Repos ohne Whitelist-Regel; im Whitelist-Repo liefert die Inhaltssuche Treffer (F-1) | hält mit F-1 |
| 28 | NFR-3 (Kohärenz zu SEC-4): Nachweis „Explorer-Baum, Explorer-Suche, Unterordner-Menü (MIG-73, MIG-74, MIG-19)“ | Z.475 ohne MIG-75 und Git-Status | abweichend → F-5 |
| 29 | Ignore-Version | `Cargo.lock:2010-2011` `0.4.32` | hält |
| 30 | Walker-Suchraum im Backend | `grep -rn "WalkBuilder::new" src-tauri/src` → 5 Stellen | hält |

Self-Check: 30 erhoben, 30 Verdikte, 0 NICHT GEMESSEN.

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|---|---|---|---|---|---|---|---|---|---|
| F-1 | refuted | A, C, F (BR-3, SEC-4, Sweep) | architecture.md (SEC-4 Z.207, Sweep Z.356, neue/erweiterte MIG für `grep.rs`, Research-Log Z.671), obligations.md (OB-21) | SEC-4: „Ausnahmen ohne eigenes Prädikat: `fs_grep`, `fs_glob`, `fs_grep_interactive` lokal (`grep.rs:81,355` `.hidden(true)` verbirgt jeden Punkt-Namen samt Inhalt)“; Sweep: „Walks mit fest verborgenen Punkt-Namen (`grep.rs:81,355` `.hidden(true)`)“ | `ignore-0.4.32/src/dir.rs:490`: Hidden-Regel nur bei `m.is_none()`; Probe mit Walker-Konfiguration aus `grep.rs:80-88`: Git-Repo mit `.gitignore` `*` / `!*/` / `!*.txt` liefert `.terax-copy-x/src/report.txt`; `.ignore` mit `!.terax-copy-*/` liefert `.terax-copy-x/r.txt` | dependency + runtime | In einem Repo mit Whitelist-Regel für Ordner (`!*/`) findet die lokale Inhaltssuche (`fs_grep_interactive`) und das AI-`grep`/`glob` Dateien im Staging-Ordner | `search_tree` (`grep.rs:80`) und `fs_glob_impl` (`grep.rs:354`) erhalten wie MIG-74 `filter_entry(|e| !is_staging_name(e.file_name()))` (wirkt nach der Whitelist, `walk.rs:1176-1180`); Ausnahme in SEC-4 und Sweep streichen; Sweep um `grep -rn "WalkBuilder::new" src-tauri/src/modules/fs` ergänzen (5 Stellen: `tree.rs:47` Ausnahme Flag, `search.rs:103/298` MIG-74, `grep.rs:80/354` neu); Test s. O-1 | nein (neu) |
| F-2 | fix | A, F (SEC-4, Q&A #7, Risiko, OB-21) | architecture.md (SEC-4 Z.207 inkl. Notes, Risiko-Zeile Z.517, Q&A #7 Z.689), obligations.md (OB-21) | SEC-4: „Inhalte unterhalb eines Staging-Ordners werden nie aufgezählt oder durchsucht“; Q&A #7: „keine App-Aufzählung zeigt ihn“ | Explorer-Wurzel folgt dem Terminal-cwd (`src/modules/tabs/lib/useWorkspaceCwd.ts:103-108`), Pfadvervollständigung liest den getippten Ordner (`pathComplete.ts:36-46`), `ignore` filtert die Wurzel nie (`walk.rs:1150-1152`), Probe mit Wurzel `.terax-copy-x` liefert dessen Dateien; die geplanten Filter (MIG-73/74/75/19) prüfen Eintragsnamen unterhalb der Wurzel | code + dependency + runtime | Nach `cd .terax-copy-abc` im Terminal zeigen Explorer-Baum, Explorer-Suche, Inhaltssuche und Unterordner-Menü den Inhalt des Staging-Ordners; BR-3 bleibt erfüllt (der User steuert einen versteckten Ordner selbst an, unter dem Zielnamen erscheint nichts) | Wortlaut auf den entschiedenen Mechanismus einschränken: „Keine App-Aufzählung, deren Wurzel außerhalb eines Staging-Ordners liegt, listet, betritt oder durchsucht ihn; steuert der User einen Pfad darin selbst an (cd im Terminal, getippter Pfad), zeigt die App ihn wie das Terminal“; Q&A #7, Risiko-Zeile, SEC-4-Notes und OB-21 („nach einem SSH-Abbruch bleibt ein Rest in keiner App-Aufzählung sichtbar“) gleich einschränken | nein (Wortlaut seit Delta 1, Sachverhalt neu gemessen) |
| F-3 | decision | C, F (MIG-75, Q&A #31) | architecture.md (MIG-75 Z.350, Q&A #31 Z.713, SEC-4 Z.207) | MIG-75: „jeder Eintrag, dessen Pfad ein Segment mit `is_staging_name` (MIG-14) enthält, wird nicht in `out.files` übernommen … gilt für alle vier Eintragsarten“ | Panel-Commit `src-tauri/src/modules/git/operations.rs:438-443` (`git commit -m`, ganzer Index); Commit freigegeben über sichtbare `stagedEntries` (`SourceControlPanel.tsx:364-365`); Commit-Nachricht aus `git diff --cached` ohne Pfad (`useSourceControlPanel.ts:886`); Probe: nach externem `git add -A` steht `1 A. … .terax-copy-x/report.txt` im Index, ein Commit von `a.txt` enthält auch `.terax-copy-x/report.txt` | code + runtime | Hat der User (oder ein Agent im Terminal) einen Staging-Rest gestagt, blendet das Panel den Index-Eintrag aus und committet ihn beim nächsten Panel-Commit unsichtbar mit; Löschungen/Änderungen in einem getrackten Ordner mit dem Präfix lassen sich im Panel weder sehen noch stagen. Die App selbst stagt nur Pfade aus dem gefilterten Status (`useSourceControlPanel.ts:716,776-784,834`), App-eigene Kopien sind also immer `? `-Einträge | Empfehlung: nur `? `-Einträge filtern; Einträge `1 `, `2 `, `u ` (bereits im Index, nur durch Aktion außerhalb der App entstanden) bleiben sichtbar; Folge in Q&A #31 benennen. Alternative: alle vier filtern wie heute und die Folge „Panel-Commit enthält ausgeblendete Index-Einträge“ in Q&A #31 ausdrücklich annehmen | nein (neu) |
| F-4 | fix | F (Sweep) | architecture.md (Sweep Z.356) | „`git_diff`/`git_commit_files` zählen keinen Workspace-Inhalt auf, sondern lesen nur Pfade, die aus dem gefilterten Git-Status oder aus Commits stammen“ | `src/modules/source-control/useSourceControlPanel.ts:886` `native.gitDiff(repo.repoRoot, null, true)`; `operations.rs:203-218` ohne Pathspec → `git diff --cached` über den ganzen Index; Probe: ungetrackter Staging-Ordner → 0 Zeilen | code + runtime | `git_diff` ohne Pfad liest den Index selbst; Staging fehlt darin, weil `git diff` ungetrackte Dateien nie zeigt | Begründung ersetzen: „`git_diff` zeigt nur getrackte und gestagte Änderungen, nie ungetrackte; App-eigene Staging-Ordner bleiben ungetrackt, weil die App nur Pfade aus dem gefilterten Status stagt (`useSourceControlPanel.ts:716,776-784,834`); `git_commit_files` liest aus Commits“ (Wortlaut ggf. an F-3 anpassen) | nein |
| F-5 | fix | A (Kohärenz NFR-3) | architecture.md (NFR-3 Z.475) | „mit `showHidden = true` findet weder Explorer-Baum noch Explorer-Suche noch Unterordner-Menü etwas im Staging (MIG-73, MIG-74, MIG-19)“ | SEC-4 Z.207 und BR-3 Z.613 nennen zusätzlich Dateiliste, Git-Status und MIG-75; OB-21 prüft das Source-Control-Panel | artifact | NFR-3 bleibt hinter der entschiedenen Menge zurück | NFR-3-Nachweis um „Dateiliste der AI-Dateiauswahl, Inhaltssuche, Source-Control-Panel und Git-Dekoration (MIG-75)“ ergänzen | nein |
| O-1 | obligation | C (F-1, MIG-74) | – | SEC-4: „Inhalte unterhalb eines Staging-Ordners werden nie … durchsucht“ | Probe ws2 (Whitelist-`.gitignore` in Git-Repo) | runtime | Ein Test belegt, dass die Filter nach der Whitelist greifen | Rust-Tests in `grep.rs` und `search.rs`: Git-Repo mit `.gitignore` `*` / `!*/` / `!*.txt` und `.terax-copy-x/src/report.txt`; `fs_grep_interactive` und `fs_glob` (`**/*.txt`) liefern keinen Treffer daraus, `fs_search` `report` mit `show_hidden = true` ebenso; Ziel-Schritt implement, test | nein |
| F-6 | note | D (Research Log) | architecture.md (Research-Log Z.671) | „`fs_grep`/`fs_glob` (`native.ts:213,224`) und `fs_grep_interactive` (`useContentSearch.ts:31`) lokal durch `.hidden(true)` ausgenommen, SSH über Helper-`grep`“ | `grep.rs:119` nur `fs_grep_interactive` → `ssh::grep`; AI-`grep`/`glob` auf SSH per `guardSsh` abgewiesen (`native.ts:158-166`) | code | – | präzisieren: „SSH: `fs_grep_interactive` über Helper-`grep`, AI-`grep`/`glob` auf SSH nicht verfügbar“ | nein |
| F-7 | note | F (MIG-75) | architecture.md (MIG-75 Z.350) | „gilt für alle vier Eintragsarten; Tests: `? …`“ | `parser.rs:48-53`: `2 `-Einträge verbrauchen das folgende Token als Ursprungspfad | code | – | bleibt der Filter für `2 ` (F-3), einen Test mit gefiltertem `2 `-Eintrag gefolgt von einem normalen Eintrag ergänzen (Token-Ausrichtung); bei Resolution „nur `? `“ entfällt der Hinweis | nein |
| N-2 | note | E | – | – | Arch-Precheck AR-7 | artifact | – | protokollieren | ja (Skript) |
