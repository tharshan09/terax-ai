# Gate 1: Architecture Compliance, Delta-Lauf 2

| Feld | Wert |
|---|---|
| Geprüft | `specs/2026-10-20-upstream-sync-090/architecture.md`, `discovery.md`, `codebase-scan.md`, `gates/obligations.md`; Code-Stand `68d45d0` (Worktree `upstream-sync-090`); Upstream per `git show` (`11343a1`, `0a6e511`, `2723dc6`, `bf7e03d`, `upstream/main`) |
| Vorlauf | `gates/compliance-architecture-delta.md` (D-1, X-A..X-D, O-1/O-2, N-1..N-6) und dessen Vorlauf `gates/compliance-architecture.md`; Resolver-Entscheid `gates/DECISION-gate1-staging-search.md` (Anforderungen 1-15) |
| Prüfdatum | 2026-10-27 |
| Modus | Delta-Lauf (keine Perspektive): Einarbeitung D-1, X-A..X-D, Resolver 1-15; geänderte Stellen SEC-4, Risiko-Zeile SSH-Staging, MIG-5, MIG-6, MIG-19, MIG-45, MIG-62, MIG-73, MIG-74, API-4, VAL-8, Test Strategy SSRF, Sweep „Staging-Sichtbarkeit“, Q&A #7/#24/#28, Traceability BR-3, NFR-3, Scope Z.50, Research Log, OB-21/25/26; neu geschriebene Behauptungen darin am Beleg |
| Nicht geprüft | unveränderte Abschnitte (Vorlauf-Verdikte gelten, Belegstellen vom Diff nicht berührt); keine wireframes.md, keine bindings.md (E2 still bestanden) |

## Skript-Tabelle (Arch-Precheck, übernommen)

| result | attempt | Befund | Klasse | Detail |
|---|---|---|---|---|
| PASS | 4 | AR-7 | note | Scan-Plausibilität: 3 NEW-Zeilen ohne Zielpfad (Zielpfade stehen in architecture.md unter Context & Research) |

## Summary

| decision | refuted | fix | obligation | note |
|---|---|---|---|---|
| 0 | 1 | 4 | 1 | 2 |

**Verdict:** FAILED (E-1 `refuted`)

## Einarbeitung Vorlauf und Resolver-Anforderungen

| Vorlauf / Anforderung | Stelle jetzt | Evidenz | Status |
|---|---|---|---|
| D-1 / Anf. 1 SEC-4 | Z.207 | Regel auf „jede Aufzählung des Workspace-Inhalts durch die App (Baum, Suche, Unterordner-Menü, Dateiliste), lokal und SSH“, Inhalte darunter nie aufgezählt; Notes „in keiner App-Aufzählung … `ls -a`“ | eingearbeitet wie verlangt; Absolutaussage hält nicht → E-1 |
| D-1 / Anf. 2 Risiko-Zeile | Z.516 | alter Satz „während eines laufenden Kopierens“ entfernt (0 Treffer); Fallback „Rest liegt nur auf der Platte, in keiner App-Aufzählung“ | eingearbeitet; Fallback hält nicht → E-1 |
| D-1 / Anf. 3 MIG-74 | Z.349 | `search.rs:104`, `:111-121` (`filter_entry`, nur `PRUNE_DIRS` `:118`), `:299`, `:307-315` (`filter_entry` `fs_list_files`, `PRUNE_DIRS` `:312`), `reg_for` `:405` | eingearbeitet, Anker halten |
| N-4 / Anf. 4 MIG-73 | Z.348 | `tree.rs:204`, `:271`, `#[cfg(test)]` `:278`; `fs_read_dir_blocking` ist `pub` | eingearbeitet |
| D-1, N-4 / Anf. 5 MIG-19 | Z.294 | Helper `read_dir` `ssh.rs:294-310` (Filter `:299`), `list_subdirs` `:313-328` (`:318`), `search` `:476-504` (`:486-490`), `grep` `:507ff` (`:520-522`); `ssh::grep` sendet kein `showHidden` (`:1095`), `ssh::search` schon (`:1073`); `OPS` `:557`; Muster `:1422`; `copy` `:1201-1218`; `remote_exists` `fn` `:1144` | eingearbeitet, Anker halten (`:1145` = erste Rumpfzeile) |
| Anf. 6 Sweep | Z.355 | Sweep ausgeführt, s. Check F | eingearbeitet; Auswertungsstelle `tree.rs:46-48` ohne Ausnahme → E-2 |
| Anf. 7 Q&A #28/#7, BR-3, NFR-3, Research Log | Z.708, 687, 612, 474, 669 | Text entspricht den Anforderungen | eingearbeitet; Absolutaussage in Q&A #7 → E-1 |
| Anf. 8 OB-21 | obligations.md | Suche, Unterordner-Menü, Rest nach Abbruch, e2e mit künstlichem Rest | eingearbeitet; „in keiner App-Aufzählung“ mit heutigem Entwurf nicht erfüllbar → E-1 |
| X-A / Anf. 9 MIG-6, VAL-8 | Z.281, 187 | `11343a1:net/ip.rs:163,172` `assert_eq!(kind("64:ff9b:1::808:808"), IpKind::Private)`; Simulation /48-Kandidat `0.0.0.0` → Loopback | MIG-6 eingearbeitet; VAL-8-Wortlaut „praktisch mindestens Loopback“ lässt die Untergrenze Private weg → E-4, E-O1 |
| X-B / Anf. 10 MIG-5, Test Strategy | Z.280, 418 | `11343a1:net/clients.rs:135-173` `redirect_decision(next, last_previous, previous_len, allow_private) -> RedirectDecision`, Trim `:157`; Fork-Closure `net.rs:263-297` in `build_safe_client` (`:245`); Upstream-Tests `clients.rs:356-455` rufen die Funktion ohne Server | eingearbeitet |
| X-C / Anf. 11 Q&A #24 | Z.704 | `usePresence.ts:5-10` (Kommentar), `:13-24` `setTimeout`, 0 Treffer `requestAnimationFrame` | eingearbeitet |
| X-D / Anf. 12 API-4 | Z.86 | Pinning-Filter `net.rs:158-165`, Redirect `:281-289` | eingearbeitet |
| N-1 / Anf. 13 Scope Z.50 | Z.50 | `0a6e511:net.rs:97` Trim; `11343a1:net/clients.rs:157` | eingearbeitet |
| N-2 / Anf. 13 MIG-62 `xterm` | Z.337 | Gruppe `xterm` steht in `vite.config.ts:100`, nicht `:79` | eingearbeitet, Anker falsch → E-3 |
| O-1 / Anf. 14 OB-25 | obligations.md | Wortlaut identisch mit Resolver | eingearbeitet |
| O-2 / Anf. 15 OB-26 | obligations.md | Wortlaut identisch mit Resolver | eingearbeitet |

## Check A: Feature Mapping (Delta)

| Item | Evidenz | Status |
|---|---|---|
| BR-3 „keine halben Kopien sichtbar, auch nicht bei Abbruch“ (`discovery.md:208`) gegen SEC-4/Risiko/Q&A #7 | Baum, Suche, Unterordner-Menü, Dateiliste abgedeckt (MIG-73/74/19); Source-Control-Panel listet Staging-Inhalt als untracked (`git/operations.rs:142-146` `--untracked-files=all`, Probe) | FAIL → E-1 |
| BR-16 / VAL-8 | Klammer-Trim, `redirect_decision`, /48-Erweiterung | PASS mit E-4 |

## Check B: Constraint Mapping

N/A im Delta: keine wireframes.md, Constraint-Tabelle unverändert.

## Check C: Realistic Data

| Item | Evidenz | Status |
|---|---|---|
| Git-Porcelain für Staging-Ordner | Probe in Scratchpad-Repo: `.terax-copy-x/report.pdf` angelegt, `git status --porcelain=v2 --branch -z --untracked-files=all` liefert `? .terax-copy-x/report.pdf` | gemessen → E-1 |
| Kandidaten-Klassen `64:ff9b:1::/48` (Simulation nach SVC-13 mit Upstream-`ipv4_kind`) | `64:ff9b:1::808:808` → Kandidaten 0.0.0.0 / 0.0.0.0 / 0.0.0.8 / 8.8.8.8 → Loopback; `64:ff9b:1:a9fe:a9:fe00::` → 169.254.169.254 / 254.169.254.0 / 169.254.0.0 / 0.0.0.0 → BlockedMetadata; `64:ff9b:1:808:8:808:808:808` → alle vier Kandidaten 8.8.8.8 → **Public**, wenn nur die Kandidaten zählen | E-4, E-O1 |
| Upstream-Struktur `ipv6_kind` | `11343a1:net/ip.rs:77-83`: liefert `embedded_ipv4` etwas, kehrt die Funktion mit dem Kandidaten-Maximum zurück (`unwrap_or(IpKind::Public)`); die Untergrenze „außerhalb Global Unicast → Private“ (`:89-90`) wird dann nicht mehr erreicht | E-4, E-O1 |

## Check D: Completeness + Dependencies

| Item | Evidenz | Status |
|---|---|---|
| `redirect_decision` als reine Funktion übernehmbar | `11343a1:net/clients.rs:125-173`, Aufruf aus `redirect_policy` `:175-180`; Fork hat `is_blocked_host_name` (`net.rs:25`) | PASS |
| Staging-Präfix-Quelle in `copy.rs` | Upstream `2723dc6:fs/copy.rs:123`, `bf7e03d`/`upstream/main:fs/copy.rs:132`: Präfix nur als Literal in `tempfile::Builder::new().prefix(".terax-copy-")`, keine Konstante, kein Prädikat | MIG-14 nennt den Export nicht → E-5 |

## Check E: Pattern Consistency (Gate 1b)

Delta ohne Änderung an Anti-Slop-Dispositionen und Scanner-Zuordnung; Skript AR-7 übernommen. PASS (unverändert).

## Check E2: Bindings Coverage

N/A: kein `bindings_path`/`reconcile_path`.

## Check E3: Existing-Behavior Invariants

Keine INV-Zeile im Delta geändert. PASS (unverändert).

## Check F: Migration Completeness (Delta)

Sweep „Staging-Sichtbarkeit“ ausgeführt: `grep -rn "show_hidden\|showHidden" src-tauri/src/modules/fs src-tauri/src/modules/ssh.rs` → 37 Treffer; `grep -rln` über ganz `src-tauri/src` → nur `fs/tree.rs`, `fs/search.rs`, `ssh.rs`, der Suchraum des Sweeps umfasst also jede Backend-Datei, die `show_hidden` liest.

| Auswertungsstelle (Treffer, der die Sichtbarkeit entscheidet) | Wirkung | in MIG | Status |
|---|---|---|---|
| `fs/tree.rs:204` `fs_read_dir` | Baum, Pfad-Vervollständigung (`pathComplete.ts:43`), AI (`native.ts:200`) | MIG-73 | PASS |
| `fs/tree.rs:271` `list_subdirs` | Unterordner-Menü (`CwdBreadcrumb.tsx:187`) | MIG-73 | PASS |
| `fs/search.rs:104` (+ `filter_entry :111-121`) `fs_search` | Explorer-Suche (`ExplorerSearch.tsx:115`) | MIG-74 | PASS |
| `fs/search.rs:299` (+ `filter_entry :307-315`) `fs_list_files` | AI-Dateiliste (`useWorkspaceFiles.ts:36`) | MIG-74 | PASS |
| `ssh.rs:299` Helper `read_dir` | Baum SSH | MIG-19 | PASS |
| `ssh.rs:318` Helper `list_subdirs` | Unterordner-Menü SSH | MIG-19 | PASS |
| `ssh.rs:487`, `:490` Helper `search` | Suche SSH | MIG-19 | PASS |
| `ssh.rs:520`, `:522` Helper `grep` | Inhaltssuche SSH | MIG-19 | PASS |
| `fs/tree.rs:46-48` `git_non_ignored_names` (`.hidden(!show_hidden)`) | nur Mengenzugehörigkeit für das Flag `gitignored` (`:175-177`, `:216`); Einträge kommen aus `:204` | keine | Kriterium „jede Auswertungsstelle wendet das Prädikat an“ trifft sie, Ausnahmeliste nennt nur `grep.rs` → E-2 |
| übrige Treffer (`tree.rs:130-164,176,248,253`; `search.rs:61-95,269-290`; `ssh.rs:295,314,478,509,994-1073`) | Parameter-Weitergabe, Lesen aus dem Request | – | keine Auswertung |
| `fs/grep.rs:81`, `:355` `.hidden(true)` | Inhaltssuche lokal, fest verborgen | Ausnahme im Sweep | PASS |

Bruch-Mechanismus über den Sweep hinaus: Aufzählungen ohne `show_hidden` zeigen Punkt-Namen ungefiltert. Gesucht über `src-tauri/src` nach `WalkBuilder`, `read_dir(`, `os.walk`, `scandir`: zusätzlich `mutate.rs:198`, `ssh.rs:1172` (Kopier-Rekursion der Quelle), `history/mod.rs:76`, `test_bridge.rs:40` (keine Workspace-Aufzählung für den User). Nicht über diese Muster erreichbar: `git status` (`git/operations.rs:137-153`), das die Workspace-Dateien selbst aufzählt → E-1.

| MIG | Evidenz | Status |
|---|---|---|
| MIG-5 | `net.rs:90`, `:281`, Closure `:263-297` in `build_safe_client` `:245`; Upstream-Form gemessen | PASS |
| MIG-6 | Upstream-Assertion gemessen | PASS |
| MIG-19 | Anker s.o. | PASS |
| MIG-45 | `useFileTree.ts:117-126` (`addWatch`/`removeWatch`), `:216-224`, `:157`, `:178-180` | PASS; Muster `:239-247` ist der Watch-Ereignis-Refetch, das Neu-Einlesen aller geladenen Ordner steht in `:251-257` → N-1 |
| MIG-62 | `xterm` `:100`; `manualChunks` `:66-131` | Anker → E-3 |
| MIG-73, MIG-74 | Anker s.o.; „Prädikat aus `copy.rs`“ | PASS, Quelle unbenannt → E-5 |

## Data Type Verdicts

Keine Datenbank, keine neuen persistenten Felder im Delta. Keine Datentyp-Checks.

## Bestands-Behauptungen (Delta-Prüfmenge)

| # | Behauptung (architecture.md) | Beleg | Verdikt |
|---|---|---|---|
| 1 | Scope Z.50: Trim an `net.rs:90` aus `0a6e511` `net.rs:97` | `0a6e511:net.rs:97` `host.trim_matches(['[', ']'])`; Fork `net.rs:90` | hält |
| 2 | Scope Z.50: `net.rs:281` als Portierung aus `net/clients.rs:157` | `11343a1:net/clients.rs:157` | hält |
| 3 | API-4: `Url::host_str` behält Klammern | Vorlauf-Sonde, Belegstelle unverändert | hält (Vorlauf) |
| 4 | API-4: Auflösung `net.rs:88-117` | `net.rs:88-117` | hält |
| 5 | API-4: Verbindungs-Pinning `net.rs:158-163` | `net.rs:158-165` Filter der Pin-Adressen, Pinning `:256-260` | hält |
| 6 | API-4: Redirect-Prüfung `net.rs:281-289` | `net.rs:281-289` | hält |
| 7 | MIG-5: Closure in `build_safe_client` (`:262-296`) | `fn build_safe_client` `:245`, `Policy::custom` `:263-297` | hält |
| 8 | MIG-5: Upstream-Form `11343a1:net/clients.rs:135-173` | `11343a1:net/clients.rs:135-173` | hält |
| 9 | MIG-5/VAL-8: `redirect_decision(Url::parse("http://[::ffff:169.254.169.254]/"), allow_private = true)` → Stop | `clients.rs:157-160`; Upstream-Test `:436-442` mit `true` | hält |
| 10 | Test Strategy: Redirect-Prüfung ohne HTTP-Server | Signatur rein (`&Url`, `Option<&Url>`, `usize`, `bool`) | hält |
| 11 | MIG-6: Upstream-Assertion `kind("64:ff9b:1::808:808") == IpKind::Private` in `nat64_addresses_are_classified_by_their_ipv4` | `11343a1:net/ip.rs:163`, `:172` | hält |
| 12 | MIG-6: /48-Kandidat `0.0.0.0` → Loopback | Simulation; `ipv4_kind` `o[0] == 0` (`ip.rs:43-44`) | hält |
| 13 | VAL-8: in `64:ff9b:1::/48` „praktisch mindestens Loopback (wirkungsgleich mit Private, `net.rs:150-163`)“ | Simulation `64:ff9b:1:808:8:808:808:808` → alle Kandidaten 8.8.8.8 → Public, Upstream-Struktur ohne Untergrenze im Kandidatenzweig (`ip.rs:77-83` vor `:89`) | widerlegt für gebaute Adressen → E-4 |
| 14 | Q&A #24: `usePresence.ts` hält Knoten per `setTimeout` (`:13-24`) für CSS-Keyframes (`:5-9`) | `usePresence.ts:5-10`, `:13`, `:23` | hält |
| 15 | MIG-62: Fork-Gruppe `xterm` (`vite.config.ts:79`) | `vite.config.ts:100` | widerlegt (Anker) → E-3 |
| 16 | MIG-62: `manualChunks` `:51,66-120` | `:51` `rolldownOptions`, `manualChunks` `:66-131` | hält sinngemäß (Ende versetzt), mit E-3 |
| 17 | MIG-73: `fs_read_dir` `:204`, `list_subdirs` `:271`, Testmodul `:278` | `tree.rs:204`, `:271`, `:278` | hält |
| 18 | MIG-74: `fs_search` `:104`, `filter_entry` `:111-120` nur `PRUNE_DIRS` | `search.rs:104`, `:111-121`, `:118` | hält |
| 19 | MIG-74: `fs_list_files` `:299`, `:312`, eigener `filter_entry` | `search.rs:299`, `:307-315`, `:312` | hält |
| 20 | MIG-74: Testmodul, Muster `reg_for` `:405` | `search.rs:372` `#[cfg(test)]`, `:405` | hält |
| 21 | MIG-19: Helper `read_dir` `:294-305`, Filter `:299` | `ssh.rs:294`, `:299` | hält |
| 22 | MIG-19: Helper `list_subdirs` `:318` | `ssh.rs:318` | hält |
| 23 | MIG-19: Helper `search` `:486-490` | `ssh.rs:486-490` | hält |
| 24 | MIG-19: Helper `grep` `:520-522`, `ssh::grep` ohne `showHidden` | `ssh.rs:520-522`, Request `:1095` | hält |
| 25 | MIG-19: `OPS` `:557`, Muster `:1422`, `copy` `:1202-1215`, `remote_exists` `:1145` | `ssh.rs:557`, `:1422`, `:1201-1218`, `fn` `:1144` | hält (±1) |
| 26 | MIG-73/74/19: „Prädikat aus `copy.rs`, eine Quelle“ | Upstream `copy.rs` hat nur das Literal im `tempfile`-Builder (`2723dc6:fs/copy.rs:123`, `upstream/main:…:132`); MIG-14 (Z.289) nennt keinen Export | Quelle unspezifiziert → E-5 |
| 27 | Sweep: Suchraum erfasst alle `show_hidden`-Stellen im Backend | `grep -rln` über `src-tauri/src` → nur `fs/tree.rs`, `fs/search.rs`, `ssh.rs` | hält |
| 28 | Sweep: „jede Auswertungsstelle wendet das Staging-Prädikat an“, Ausnahme nur `grep.rs` | `tree.rs:46-48` `git_non_ignored_names` wertet `show_hidden` aus, zählt aber nicht auf | nicht mechanisch anwendbar → E-2 |
| 29 | Sweep: `grep.rs:81,355` `.hidden(true)` | `grep.rs:81`, `:355` | hält |
| 30 | SEC-4 Notes, Risiko-Fallback, Q&A #7: Rest „erscheint in keiner App-Aufzählung“ / „liegt nur auf der Platte, in keiner App-Aufzählung“ | `git/operations.rs:142-146` `status --porcelain=v2 --untracked-files=all`, lokal und über SSH (`git/process.rs:334`); Parser `parser.rs:122` setzt `untracked`; Panel zeigt `U` (`useSourceControlPanel.ts:149`); Probe liefert `? .terax-copy-x/report.pdf` | widerlegt → E-1 |
| 31 | Q&A #28: Aufzählung der Stellen lokal (`fs/tree.rs` Baum+Unterordner, `fs/search.rs` Suche+Dateiliste) und SSH (Helper `read_dir`, `list_subdirs`, `search`, `grep`) | Check F Tabelle | hält als Liste der `show_hidden`-Stellen; unvollständig als Liste der App-Aufzählungen → E-1 |
| 32 | MIG-45: `:117-126,217-224`, `:157`, `:178-180` | `useFileTree.ts:117-126`, `:216-224`, `:157`, `:178-180` | hält |
| 33 | MIG-45: Muster „alle geladenen Ordner neu einlesen“ `:239-247` | `:239` Refetch nach Watch-Ereignis; Neu-Einlesen aller geladenen Ordner `:251-257` | hält sinngemäß → N-1 |
| 34 | OB-21/25/26 entsprechen Resolver 8/14/15 | `obligations.md` OB-21, OB-25, OB-26 | hält |

Self-Check: 34 erhoben, 34 Verdikte, 0 NICHT GEMESSEN.

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|---|---|---|---|---|---|---|---|---|---|
| E-1 | refuted | A, C, F (BR-3, SEC-4) | architecture.md (SEC-4, Risiko-Zeile SSH-Staging, Q&A #7, Q&A #28, Sweep, neue MIG-Zeile), obligations.md (OB-21) | SEC-4: „erscheint aber in keiner App-Aufzählung (Baum, Suche, Unterordner-Menü)“; Risiko: „Rest liegt nur auf der Platte, in keiner App-Aufzählung“; Q&A #7: „keine App-Aufzählung zeigt ihn“ | `src-tauri/src/modules/git/operations.rs:137-153` `status_inner` ruft `git status --porcelain=v2 --branch -z --untracked-files=all` (`:142-146`), lokal und per SSH auf dem Host (`git/process.rs:334-345`); `parser.rs:122` markiert `untracked`; Panel zeigt `U` (`source-control/useSourceControlPanel.ts:149`), Explorer-Dekoration ebenso (`explorer/lib/gitStatusUtils.ts:27`); Probe: Repo mit `.terax-copy-x/report.pdf` → Ausgabe `? .terax-copy-x/report.pdf`; Upstream filtert nirgends (`git grep terax-copy upstream/main` → nur `fs/copy.rs:132`) | code + runtime | Liegt der Zielordner in einem Git-Repo, listet das Source-Control-Panel während des Kopierens jede Datei im Staging-Ordner als untracked; nach einem SSH-Abbruch dauerhaft (git over SSH), samt „Stage all“-Pfad für die halbe Kopie | Empfohlen (gleiche Herleitung wie der Resolver-Entscheid, BR-3 ohne Einschränkung auf eine Oberfläche): neue MIG-Zeile für `git/operations.rs` (oder `git/parser.rs`): Einträge, deren Pfad ein Segment mit dem Staging-Präfix enthält, fallen aus `changed_files` (Prädikat aus `copy.rs`; wirkt lokal und SSH, weil geparst wird lokal); Test in den Parser-Tests mit `? .terax-copy-x/report.pdf` → nicht enthalten; Sweep um `git status` ergänzen; OB-21 um das Source-Control-Panel ergänzen. Alternative: SEC-4/Risiko/Q&A #7 auf die vier genannten Aufzählungen eingrenzen und das Panel ausdrücklich ausnehmen; das schwächt BR-3 und braucht den PM | nein (neu, gleiche Klasse wie D-1) |
| E-2 | fix | F (Sweep) | architecture.md (Migration Map, Sweep „Staging-Sichtbarkeit“, Z.355) | „jede Auswertungsstelle wendet das Staging-Prädikat an …; Walks mit fest verborgenen Punkt-Namen (`grep.rs:81,355` `.hidden(true)`) bleiben so“ | `src-tauri/src/modules/fs/tree.rs:46-48` `git_non_ignored_names(dir, show_hidden)` mit `.hidden(!show_hidden)`; Ergebnis nur für `git_visible.contains(&name)` (`:175-177`, `:216`); die Einträge selbst filtert `:204` | code | Der Sweep markiert `tree.rs:48` als Auswertungsstelle ohne Prädikat; die Ausnahmeliste deckt sie nicht | Ausnahme ergänzen: „`git_non_ignored_names` (`tree.rs:46-48`) liefert nur das Flag `gitignored` für Einträge, die `:204` schon gefiltert hat, und braucht kein Prädikat“ | nein |
| E-3 | fix | F (MIG-62) | architecture.md (MIG-62, Z.337) | „Fork-Gruppe `xterm` (`vite.config.ts:79`)“; Current „`manualChunks` (`:51,66-120`)“ | `vite.config.ts:100` `if (id.includes("/xterm/") \|\| id.includes("@xterm/")) return "xterm";`; `manualChunks` endet `:131` | code | Anker `:79` zeigt in den Kommentar zu `clsx` | `vite.config.ts:100` und `:66-131` | nein (Anker aus N-2 übernommen) |
| E-4 | fix | C (VAL-8, SVC-13) | architecture.md (VAL-8 Z.187, SVC-13 Z.147) | VAL-8: „dort gewinnt die gefährlichste Kandidaten-Klasse, praktisch mindestens Loopback (wirkungsgleich mit Private …)“ | Simulation: `64:ff9b:1:808:8:808:808:808` → Kandidaten /48, /56, /64, /96 = 8.8.8.8 → Public; Upstream `11343a1:net/ip.rs:77-83` kehrt im Kandidatenzweig mit `max_by_key(severity)…unwrap_or(IpKind::Public)` zurück, die Untergrenze „außerhalb Global Unicast → Private“ (`:89-90`) greift dann nicht; Q&A #27 entscheidet „Adressen in `64:ff9b:1::/48` werden nie öffentlich“ | dependency + code | Eine gebaute Adresse im /48 wird Public, wenn die Erweiterung in `embedded_ipv4` eingehängt wird; VAL-8 nennt die Untergrenze nicht | VAL-8 und SVC-13: „in `64:ff9b:1::/48` gilt das Maximum aus Private und allen Kandidaten-Klassen, nie Public (Q&A #27); meist Loopback durch Null-Kandidaten“ | nein (Wortlaut aus X-A) |
| E-5 | fix | D, F (MIG-14, MIG-73/74/19) | architecture.md (MIG-14 Z.289) | MIG-73/74: „Prädikat aus `copy.rs`, eine Quelle“; MIG-19: „Pin-Test, dass das Präfix im Helper-Programm dem Rust-Präfix aus `copy.rs` entspricht“ | Upstream `2723dc6:src-tauri/src/modules/fs/copy.rs:122-123`, `upstream/main:…:132`: Präfix nur als Literal im `tempfile::Builder`; MIG-14 Target nennt keine Konstante und kein Prädikat | dependency + artifact | Die referenzierte eine Quelle existiert in der Vorlage nicht und ist in MIG-14 nicht beauftragt | MIG-14 Target ergänzen: `copy.rs` exportiert `pub(crate) const STAGING_PREFIX = ".terax-copy-"` und `is_staging_name(&str)`; der `tempfile`-Builder nutzt die Konstante; MIG-73/74, die neue MIG aus E-1 und der Pin-Test aus MIG-19 lesen sie | nein |
| E-O1 | obligation | C (SVC-13, Q&A #27) | – | Q&A #27: „Adressen in `64:ff9b:1::/48` werden nie öffentlich“ | s. E-4 | dependency + code | Ein Test belegt die Untergrenze | Rust-Test in `net/ip.rs`: `kind("64:ff9b:1:808:8:808:808:808") == IpKind::Private` (nicht Public); Ziel-Schritt implement, test | nein |
| N-1 | note | F (MIG-45) | architecture.md (MIG-45) | „beim Wechsel zu sichtbar alle geladenen Ordner neu einlesen (Muster `:239-247`)“ | `useFileTree.ts:239` liest nur Eltern geänderter Pfade neu; „alle geladenen Ordner“ steht in `:251-257` (Effekt auf `showHidden`/`gitDecorations`) | code | – | Muster-Anker auf `:251-257` setzen | nein |
| N-2 | note | E | – | – | Arch-Precheck AR-7 | artifact | – | protokollieren | ja (Skript) |
