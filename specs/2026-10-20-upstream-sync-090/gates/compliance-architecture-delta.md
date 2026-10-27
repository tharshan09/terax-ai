# Gate 1: Architecture Compliance, Delta-Lauf

| Feld | Wert |
|---|---|
| Geprüft | `specs/2026-10-20-upstream-sync-090/architecture.md`, `discovery.md` (Diff gegen `68d45d0`), `codebase-scan.md`, `gates/obligations.md` |
| Vorlauf | `gates/compliance-architecture.md` (zusammengeführt) + `compliance-architecture-{code,data,runtime,ui}.md` |
| Prüfdatum | 2026-10-27 |
| Modus | Delta-Lauf (keine Perspektive): Einarbeitung B1–B5, X1–X10; geänderte Stellen laut Auftrag; neu geschriebene Behauptungen am Beleg |
| Nicht geprüft | unveränderte Abschnitte (Belegstellen vom Diff nicht berührt, Vorlauf-Verdikte gelten); keine wireframes.md, keine bindings.md (E2 still bestanden) |

## Skript-Tabelle (Arch-Precheck, übernommen)

| result | attempt | Befund | Klasse | Detail |
|---|---|---|---|---|
| PASS | 3 | AR-7 | note | Scan-Plausibilität: 3 NEW-Zeilen ohne Zielpfad (Zielpfade stehen in architecture.md unter Context & Research) |

## Summary

| decision | refuted | fix | obligation | note |
|---|---|---|---|---|
| 0 | 1 | 4 | 2 | 6 |

**Verdict:** FAILED (D-1 `refuted`)

## Einarbeitung der Vorlauf-Befunde

| Vorlauf | Stelle jetzt | Evidenz | Status |
|---|---|---|---|
| B1 Klammern | Scope Z.50, API-4, VAL-8, MIG-5, Test Strategy, Q&A #26 | Fork `net.rs:90`, `:281` parsen ohne Trim (gemessen); `0a6e511:net.rs:97` `host.trim_matches(['[', ']'])`; Upstream-Test `embedded_ipv4_literals_cannot_smuggle_internal_hosts_past_the_guard` nutzt `resolve_and_classify(&str)` und `classify_and_collect_safe_ips(&str, bool)`, beide Signaturen im Fork gleich (`net.rs:88`, `:144`); `tokio` mit Feature `rt` (`Cargo.toml:51`) für `new_current_thread` | eingearbeitet; Testweg für den Redirect-Fall falsch benannt → X-B |
| B2 lokales NAT64 | SVC-13, MIG-6, VAL-8, Q&A #27, discovery BR-16 | RFC 6052 §2.2: Längen 32/40/48/56/64/96, Positionen /48 = Bits 48-63 + 72-87, /56 = 56-63 + 72-95, /64 = 72-103, /96 = 96-127, Bits 64-71 „MUST be zero“; RFC 8215 §5: `64:ff9b:1::/48 or any more-specific prefix` → passende Längen 48/56/64/96 | Positionen und u-Oktett korrekt; Konflikt mit einem übernommenen Upstream-Test → X-A |
| B3 Staging sichtbar | SEC-4, MIG-73, MIG-19, Risiko-Zeile, Q&A #28 | `fs/tree.rs:204` und Helper `ssh.rs:299` sind die Filter des Explorer-Baums (`useFileTree.ts:133` → `fs_read_dir`) | Baum eingearbeitet; Explorer-Suche nicht → D-1 |
| B4 Chunk-Strategie | MIG-62, SVC-15, Integration `vite`, Q&A #12/#29 | rolldown 1.2.6 Typ `codeSplitting?: boolean \| CodeSplittingOptions` (`define-config-Nbz-lniw.d.mts:864`), Gruppe mit `name`/`test`/`priority` (`:1026-1136`), Laufzeit-Schema `create-bundler-option-DSPiA5F7.mjs:1808,1845`, Übergabe `bindingifyCodeSplitting` `:2928`; **Build-Versuch** (s.u.) | eingearbeitet, Behauptung gemessen |
| B5 INV-19 | INV-19, Q&A #30 | `eager-budget.test.ts:10` `HEAVY = ["@ai-sdk","ai","streamdown","katex","@codemirror","@uiw"]`, Fälle `src/main.tsx` und `src/settings/main.tsx` (`:17-23`); `eager-graph.mjs` verfolgt Quell-Importe | eingearbeitet |
| X1 Guard ohne Tests | MIG-27, Sweep | Sweep-Kommando ausgeführt: Treffer nur in `App.tsx:477`, `useClaudeStatus.ts:55`, `useSpacePersistence.ts:89-96`, `useTerminalSession.ts:551,575`, `SshAgentActivityPoller.tsx:141`, `SurfaceLayer.tsx:132-137` (alle in MIG-10/35-39) und `rendererPool.ts` (Allowlist) | eingearbeitet |
| X2 INV-6 | INV-6, MIG-5 | Upstream `ip.rs`-Tests `non_global_ipv6_ranges_are_never_public` (`fe80::1`, `fd00:ec2::254` BlockedMetadata, `fc00::1` Private, `::` Loopback) und `ipv4_mapped_addresses_take_the_class_of_the_embedded_ipv4` existieren; `ipv4_kind` `o[0] == 0` → Loopback, Fork-Assertion `0.0.0.0` hält | eingearbeitet |
| X3 Entities | Database Schema | `useSidebarPanel.ts:16,54-56,94` (`terax.sidebar.collapsed`, `"1"`/`"0"`); `spaces/lib/store.ts:1,28` `LazyStore`; `settings/store.ts:164,165,203`; `App.tsx:902` `zenMode` | eingearbeitet |
| X4 SSRF-Sweep | Sweep | `grep -rn` → `net.rs:33`, `:78`; `parse::<IpAddr>` nur `:90`, `:281` | eingearbeitet |
| X5 Zähler | NFR-1, Monitoring | `git/operations.rs:88` `panel_snapshot` → `:114` `status_inner`; `native.ts:315,320` | eingearbeitet |
| X6 Q&A #24 | Q&A #24 | `motion` nicht in `package.json` (0 Treffer) - korrekt; neue Begründung zu rAF falsch → X-C | neu fehlerhaft |
| X7 `terax-icon-in` | MIG-40 | `globals.css:327` `--dur-fast: 160ms`, `:443-445` Reduced-Motion setzt `--dur-fast: 0.01ms` | eingearbeitet |
| X8 Watch-Stellen | MIG-45 | `useFileTree.ts:117-126`, `:157` (`...watchedRef.current`), `:179-180`, `:216-223` | eingearbeitet (Zeilenangabe `:163` statt `:157`, N-5) |
| X9 discovery:145 | discovery.md | Diff Z.145 „erstes neues Element ausgewählt“; kein „alle neu“ mehr | eingearbeitet |
| X10 MIG-41 | MIG-41 | `node_modules/tailwindcss/theme.css:438,440` `--animate-spin`/`--animate-pulse` linear/cubic infinite | eingearbeitet |

## Check A - Feature Mapping (Delta)

| Item | Evidenz | Status |
|---|---|---|
| BR-13 (discovery geändert: Sidebar-Leiste, `line-changes`, Zen) | SVC-11, MIG-46/47/51 nennen Rail-Badge, `line-changes`, Zen-Modus | PASS |
| BR-21 (discovery neu) | SEC-5, SVC-1, Q&A #10, Slice 3 in discovery | PASS |
| FL-4, UI-6, ST-3, Layout Z.145 (Einzelauswahl) | SVC-6, Q&A #4 | PASS |
| BR-3 „keine halben Kopien sichtbar, auch bei Abbruch“ | Explorer-Suche zeigt Staging-Inhalt bei `showHidden` | FAIL → D-1 |
| BR-16 (`64:ff9b:1::/48`) | SVC-13, VAL-8 | PASS mit X-A |
| BR-18 | MIG-62, SVC-15 | PASS (gemessen) |

## Check B - Constraint Mapping

N/A im Delta: keine wireframes.md, Constraint-Tabelle unverändert.

## Check C - Realistic Data

| Item | Evidenz | Status |
|---|---|---|
| IPv6-Literal-Form aus `Url::host_str` | Vorlauf-Messung (Sonde) gilt, Belegstelle unverändert | PASS |
| Klassen aus dem Kandidaten-Verfahren für reale Adressen | Simulation nach SVC-13 (Upstream-`ipv4_kind`): `64:ff9b:1::808:808` → Kandidaten /48 `0.0.0.0`, /56 `0.0.0.0`, /64 `0.0.0.8`, /96 `8.8.8.8` → **Loopback**; `64:ff9b:1::a9fe:a9fe` → BlockedMetadata; `64:ff9b:1::7f00:1` → Loopback; `64:ff9b:1::a00:1` → Loopback (nicht Private); `64:ff9b:1:a9fe:a9:fe00::` (/48-Form) → BlockedMetadata | X-A, O-1, N-6 |
| Policy Loopback vs. Private | `net.rs:150-155` und `:158-163`, Redirect `:286-288`: beide Klassen identisch behandelt | Klassenverschiebung Private→Loopback ohne Verhaltenswirkung |

## Check D - Completeness + Dependencies

| Item | Evidenz | Status |
|---|---|---|
| rolldown 1.2.6 `codeSplitting.groups` | Typen + Laufzeit (s. B4) und Build-Versuch: Fork-Stand (vite 8.2.2), `vite.config.ts` nur im Output-Block durch die Upstream-Gruppen (eager Prio 100, lazy Prio 0, `packageOf`) ersetzt, Build in das Scratchpad: `index.html` und `settings.html` laden kein `ai-anthropic`/`ai-cerebras`/`ai-sdk-shared` mehr; Sourcemap-Scan aller Start-Chunks: kein `@ai-sdk/*`, `ai`, `zod`, `streamdown`, `katex`, `@codemirror/*`, `@uiw/*`; einziger Rest im Hauptfenster `iconResolver-*.js` mit `@iconify-json/catppuccin`, `fileIcons.ts`, `folderIcons.ts` (MIG-52 zuständig); Settings-Fenster frei | PASS |
| Upstream-Gruppen in MIG-62 | `f6f0004:vite.config.ts:18-41` (`packageOf`, `EAGER_REACT_PACKAGES`), `:47-63` (Preload-Helper, Radix), `:65-109` (Provider, `ai-sdk-shared`, `cm-lang-*`, `cm-legacy-*`, `codemirror`, `streamdown`), `:176-181` Prioritäten 100/0 | PASS; Fork-Gruppe `xterm` nicht genannt → N-2 |

## Check E - Pattern Consistency (Gate 1b)

Delta ohne Änderung an Anti-Slop-Dispositionen und Scanner-Zuordnung; Skript AR-7 übernommen. PASS (unverändert).

## Check E2 - Bindings Coverage

N/A - kein `bindings_path`/`reconcile_path`.

## Check E3 - Existing-Behavior Invariants (Delta)

| Item | Evidenz | Status |
|---|---|---|
| INV-6 Teilaussagen | Upstream `ip.rs` Tests (s. X2); Fork-Tests `net.rs:442-505`; Konsumenten `net.rs:91,107,160,282` vorhanden | PASS (Coverage `uncovered` laut Skript-Korrektur) |
| INV-19 | `eager-budget.test.ts:10,17-23` | PASS |

## Check F - Migration Completeness (Delta)

| Item | Evidenz | Status |
|---|---|---|
| MIG-5 | `net.rs:90`, `:281`; Test-Port lauffähig | PASS; Redirect-Test ohne existierenden Weg → X-B |
| MIG-6 | „Upstream-Datei samt ihren Tests“ + Erweiterung | FAIL Kohärenz → X-A |
| MIG-19 | `ssh.rs:294-305` `read_dir`, Filter `:299`; `copy` `:1202-1215`, `remote_exists` `:1145`; `OPS` ab `:557`; Testmuster `:1422` | PASS (Zeilen leicht versetzt, N-5) |
| MIG-27 | Sweep s. X1 | PASS |
| MIG-40/41/45 | s. X7, X10, X8 | PASS |
| MIG-62 | gemessen (Check D) | PASS |
| MIG-73 | `tree.rs:204` Filter, Testmodul `#[cfg(test)]` `:278` | PASS für den Baum |
| Sweep SSRF/Visibility | ausgeführt | PASS |

## Data Type Verdicts

Keine Datenbank; keine neuen persistenten Felder. Keine Datentyp-Checks im Delta.

## Bestands-Behauptungen (Delta-Prüfmenge)

| # | Behauptung (architecture.md) | Beleg | Verdikt |
|---|---|---|---|
| 1 | `net.rs:90`, `:281` parsen ohne Klammer-Entfernung (MIG-5) | `net.rs:90`, `:281` | hält |
| 2 | `Url::host_str` behält IPv6-Klammern (API-4) | Vorlauf-Sonde, Belegstelle unverändert | hält |
| 3 | Auflösung `net.rs:88-117` | `net.rs:88-118` | hält |
| 4 | „Verbindungs-Pinning (`net.rs:282`)“ (API-4) | `:282` ist die Redirect-Klassifikation; Pinning-Filter `net.rs:158-163`, `resolve_to_addrs` `:255-258` | widerlegt (Zeilenangabe) → X-D |
| 5 | Klammer-Hunk „aus `0a6e511`“ an `net.rs:90` und `:281` (Scope) | `0a6e511:net.rs:97`; Redirect-Trim upstream in `net/clients.rs:157` (`redirect_decision`) | hält sinngemäß, zweite Stelle ist Portierung → N-1 |
| 6 | Upstream erkennt eingebettete IPv4 nur in `64:ff9b::/96`, `64:ff9b:1::/48` pauschal privat (SVC-13) | `11343a1:net/ip.rs` `embedded_ipv4` (nur `[0x64,0xff9b,0,0,0,0,hi,lo]`), `s[0] & 0xe000 != 0x2000` → Private; Test `64:ff9b:1::808:808` → Private | hält |
| 7 | RFC-6052-Positionen 48/56/64/96, u-Oktett Bits 64-71 (SVC-13) | RFC 6052 §2.2, RFC 8215 §5 | hält |
| 8 | MIG-6: Upstream-Datei „samt ihren Tests“ plus Fork-Erweiterung | Upstream-Assertion `kind("64:ff9b:1::808:808") == Private`; nach SVC-13 → Loopback | widerlegt (innere Kohärenz) → X-A |
| 9 | Upstream-Test `embedded_ipv4_literals_…` läuft nach dem Trim (MIG-5, VAL-8) | Signaturen `net.rs:88,144`, `tokio` `rt` | hält |
| 10 | Upstream-Tests `non_global_…`, `ipv4_mapped_…` decken INV-6 | `11343a1:net/ip.rs` Tests | hält |
| 11 | `0.0.0.0` → Loopback mit Upstream-`ip.rs` (MIG-5) | `ipv4_kind` `o[0] == 0` | hält |
| 12 | Redirect-Test „über den bestehenden `flow`-Test-Weg in `net.rs`“ (Test Strategy) | `grep -rn "mod flow\|redirect_decision\|TcpListener" src-tauri/src` → 0; Fork-Redirect ist Closure in `build_safe_client` (`net.rs:262-296`); `mod flow` gibt es nur upstream | widerlegt → X-B |
| 13 | rolldown 1.2.6 kennt `codeSplitting` (`define-config-*.d.mts:864`) | `.d.mts:864`, Laufzeit-Schema, Build-Versuch | hält |
| 14 | `manualChunks` legt React in `ai-sdk-shared` → AI-SDK im Startpaket (MIG-62, SVC-15) | Vorlauf-Messung R-1, `vite.config.ts` unverändert | hält |
| 15 | Gruppen-Details der Upstream-Strategie (MIG-62) | `f6f0004:vite.config.ts:18-181` | hält |
| 16 | Upstream-Strategie schon vor Slice 7 umsetzbar (Research Log) | Build-Versuch mit vite 8.2.2 | hält |
| 17 | INV-19 Quellgraph, covered | `eager-budget.test.ts:10,17-23` | hält |
| 18 | MIG-63 `HEAVY` `:10` | `eager-budget.test.ts:10` | hält |
| 19 | `fs/tree.rs:204` Filter, Testmodul `:278` (MIG-73) | `tree.rs:204`, `:278` | hält |
| 20 | Helper-`read_dir` `ssh.rs:294-305`, Filter `:299` (MIG-19) | `ssh.rs:294-305`, `:299` | hält |
| 21 | SEC-4: liegengebliebener Staging-Ordner „erscheint aber nie im Explorer“ | `ExplorerSearch.tsx:115-119` ruft `fs_search` mit `showHidden`; lokal `search.rs:103-104` `.hidden(!show_hidden)`, `filter_entry` nur `PRUNE_DIRS`; SSH `ssh.rs:486-490` | widerlegt → D-1 |
| 22 | Risiko: „Explorer-Suche kann ihn während eines laufenden Kopierens finden, danach ist er weg“ | Rest nach SSH-Abbruch bleibt (SVC-3, Q&A #7); Suche wie #21 | widerlegt → D-1 |
| 23 | MIG-19 `copy` `:1162-1215`, `remote_exists`, `OPS` `:556-561`, Muster `:1417` | `:1145`, `:1202-1215`, `OPS` `:557`, Test `:1422` | hält (Zeilen versetzt, N-5) |
| 24 | Sweep Fenster-Sichtbarkeit: alle Treffer migriert | Sweep-Lauf (X1) | hält |
| 25 | Sweep SSRF: vorher 2 Treffer, `parse::<IpAddr>` an `:90`, `:281` | Sweep-Lauf | hält |
| 26 | Entities `terax.sidebar.collapsed`, `"1"`/`"0"` | `useSidebarPanel.ts:16,56,94` | hält |
| 27 | Spaces-Store `LazyStore` | `spaces/lib/store.ts:1,28` | hält |
| 28 | Präferenzen und Zen-Zustand | `settings/store.ts:164,165,203`; `App.tsx:902` | hält |
| 29 | `git_panel_snapshot` führt `git status` aus (`operations.rs:114`) | `operations.rs:88`, `:114` | hält |
| 30 | Q&A #24: `motion` keine Abhängigkeit | `package.json` 0 Treffer | hält |
| 31 | Q&A #24: JS-Bewegung über eigene `requestAnimationFrame`-Hooks (`usePresence.ts`) | `usePresence.ts` nutzt `setTimeout` (`:13-24`) und hält den Knoten für CSS-Keyframes gemountet (`:5-9`); kein `requestAnimationFrame` | widerlegt → X-C |
| 32 | `--dur-fast` und Reduced-Motion-Nullung (MIG-40) | `globals.css:327,443-445` | hält |
| 33 | Tailwind-Defaults in `theme.css` (MIG-41) | `theme.css:438,440` | hält |
| 34 | MIG-45 Watch-Stellen | `useFileTree.ts:117-126,157,179-180,216-223` | hält (`:163` → `:157`, N-5) |
| 35 | Q&A #27 Folge „nie öffentlich, je nach Inhalt Loopback/Metadaten“ | Simulation (Check C), Policy `net.rs:150-163` | hält |

Self-Check: 35 erhoben, 35 Verdikte, 0 NICHT GEMESSEN.

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|---|---|---|---|---|---|---|---|---|---|
| D-1 | refuted | A, C (BR-3, SEC-4) | architecture.md (SEC-4, Risiko-Zeile SSH-Staging, MIG-73/MIG-19, Q&A #28) | SEC-4: „Ein nach Absturz oder SSH-Abbruch liegengebliebener Staging-Ordner bleibt auf der Platte, erscheint aber nie im Explorer“; Risiko: „Explorer-Suche kann ihn während eines laufenden Kopierens finden, danach ist er weg“ | `ExplorerSearch.tsx:74,115-119` übergibt `showHidden` an `fs_search`; lokal `fs/search.rs:103-104` `.hidden(!show_hidden)`, `filter_entry` prüft nur `PRUNE_DIRS` (`:111-120`); SSH-Helper `search` `ssh.rs:486-490` filtert Punkt-Namen nur ohne `show_hidden`; Staging-Name `2723dc6:fs/copy.rs:122-124` `.terax-copy-`; Rest nach SSH-Abbruch bleibt (SVC-3, Q&A #7) | code | Mit `showHidden = true` und einem liegengebliebenen `.terax-copy-x/report.pdf` liefert die Explorer-Suche nach `report` den Treffer `.terax-copy-x/report.pdf` (lokal und SSH), dauerhaft, nicht nur während des Kopierens | Empfohlen (passt zur PM-Entscheidung „Explorer blendet immer aus“): neue MIG-Zeile für `fs/search.rs` (`fs_search` `filter_entry` überspringt das Präfix aus `copy.rs`; `fs_list_files` analog prüfen) und Erweiterung MIG-19 um Helper-`search` (Prune in `dirnames` + Namensprüfung), je ein Test mit `showHidden = true`; Risiko-Zeile und SEC-4 entsprechend korrigieren. Alternative: SEC-4/BR-3 auf „nie im Baum“ eingrenzen (PM-Entscheidung) | nein (neu, Rest von B3) |
| X-A | fix | F, C (MIG-6, VAL-8) | architecture.md (MIG-6, VAL-8) | MIG-6: „Upstream-Datei aus `11343a1` (nur `std`) samt ihren Tests, plus Fork-Erweiterung für `64:ff9b:1::/48`“ | `11343a1:net/ip.rs` Test `nat64_addresses_are_classified_by_their_ipv4`: `assert_eq!(kind("64:ff9b:1::808:808"), IpKind::Private)`; nach SVC-13 liefert der /48-Kandidat `0.0.0.0` (`ipv4_kind` `o[0] == 0` → Loopback), Ergebnis Loopback (Simulation) | dependency + code | Mit der Erweiterung ist dieser Upstream-Test rot | MIG-6 Target ergänzen: Upstream-Assertion `64:ff9b:1::808:808` wird zu `IpKind::Loopback` (Kommentar: Kandidat /48 = `0.0.0.0`); VAL-8 präzisieren: in `64:ff9b:1::/48` gewinnt die gefährlichste Kandidaten-Klasse, praktisch mindestens Loopback (wirkungsgleich mit Private, `net.rs:150-163`) | nein (neu) |
| X-B | fix | F (MIG-5, Test Strategy) | architecture.md (Test Strategy „AI-HTTP-Proxy / DNS“, MIG-5, VAL-8) | „Redirect-Prüfung mit geklammertem Literal über den bestehenden `flow`-Test-Weg in `net.rs`“ | Fork: kein `mod flow`, kein `redirect_decision`, kein Test-HTTP-Server (`grep -rn` → 0); Redirect-Logik ist Closure in `Policy::custom` (`net.rs:262-296`); Upstream-Vorlage `11343a1:net/clients.rs:135-173` `redirect_decision(next, last_previous, previous_len, allow_private)` | code + dependency | Der genannte Testweg existiert im Fork nicht; ohne Umbau ist die Redirect-Prüfung nicht als Unit-Test erreichbar | MIG-5 Target: Redirect-Prüfung als reine Funktion `redirect_decision` nach Upstream-Form herauslösen (Closure ruft sie), Klammer-Trim darin; Test ruft sie mit `Url::parse("http://[::ffff:169.254.169.254]/")` und `allow_private = true` → Stop. Test Strategy entsprechend umformulieren | nein (neu) |
| X-C | fix | D (Q&A #24) | architecture.md (Q&A #24) | „JS-gesteuerte Bewegung läuft nur über eigene `requestAnimationFrame`-Hooks (`src/lib/usePresence.ts`), die WebKit bei unsichtbarer Seite drosselt“ | `src/lib/usePresence.ts:5-9` („Keeps a node mounted … so CSS keyframes … can animate it out“), `:13-24` nur `setTimeout`; kein `requestAnimationFrame` in der Datei | code | `usePresence.ts` treibt keine Bewegung per rAF; die Animation ist CSS und fällt unter SVC-9 | Begründung ersetzen: „`motion` ist keine Abhängigkeit; `usePresence.ts` hält Knoten per `setTimeout` für CSS-Keyframes gemountet, die Bewegung selbst ist CSS und pausiert mit SVC-9“. Entscheid „nur CSS“ bleibt | ja (X6, Korrektur fehlerhaft) |
| X-D | fix | A (API-4) | architecture.md (API-4) | „bei der Auflösung (`net.rs:88-117`) und beim Verbindungs-Pinning (`net.rs:282`)“ | `net.rs:282` = `let k = ip_kind(ip)` der Redirect-Prüfung; Pinning-Filter `net.rs:158-163`, `resolve_to_addrs` `:255-258` | code | Zeilenangabe zeigt auf die Redirect-Prüfung, nicht auf das Pinning | „Verbindungs-Pinning (`net.rs:158-163`) und Redirect-Prüfung (`net.rs:281-289`)“ | nein |
| O-1 | obligation | C (SVC-13) | – | „an den RFC-6052-Positionen aller Prefix-Längen … (48, 56, 64, 96), jeweils unter Überspringen des u-Oktetts“ | Fork-Tests in VAL-8/MIG-6 prüfen nur die /96-Position; `64:ff9b:1::7f00:1` → Loopback ist schon über den /48-Nullkandidaten erfüllt (Simulation) | artifact | Jede Position ist durch einen Test belegt | Tests: `64:ff9b:1:a9fe:a9:fe00::` (/48) → BlockedMetadata, `64:ff9b:1:a9:fe:a9fe::` (/56) → BlockedMetadata, `64:ff9b:1:0:a9:fea9:fe00:0` (/64) → BlockedMetadata, `64:ff9b:1::808:808` → Loopback; Ziel-Schritt implement, test | nein |
| O-2 | obligation | F (VAL-8) | – | „Redirect-Test auf ein geklammertes Literal … wird gestoppt, auch mit Opt-in“ | X-B | artifact | Redirect-Fälle belegt | Tests an `redirect_decision`: `[::ffff:169.254.169.254]` und `[fd00:ec2::254]` mit `allow_private = true` → Stop; `[::1]` ohne Opt-in → Stop, mit Opt-in → Follow; Ziel-Schritt test | nein |
| N-1 | note | A (Scope) | architecture.md (Scope Z.50) | „aus `0a6e511` nur der Hunk … an `net.rs:90` … und `net.rs:281`“ | `0a6e511` trimmt in `net.rs:97`; der Redirect-Trim liegt upstream in der neuen Datei `net/clients.rs:157` | dependency | – | Wortlaut: zweite Stelle als Portierung aus `clients.rs` kennzeichnen | nein |
| N-2 | note | D (MIG-62) | architecture.md (MIG-62) | „Ghostty-Gruppe entfällt“ | Fork `vite.config.ts:79` Gruppe `xterm`; im Build-Versuch ohne diese Gruppe blieb das Startpaket sonst gleich (xterm landet im eager `useTerminalSession`-Chunk) | code + runtime | – | Fork-Gruppe `xterm` ausdrücklich nennen (eager, Prio 100) oder ihr Entfallen benennen | nein |
| N-3 | note | D | – | MIG-62/Q&A #29 | Build-Versuch: mit `codeSplitting.groups` allein sind beide Start-Graphen frei von AI-SDK, `zod`, CodeMirror; Icon-Daten bleiben bis MIG-52 im Hauptfenster | runtime | – | Messwert für den PR verwendbar | nein |
| N-4 | note | C (SEC-4) | – | „Explorer-Listing lokal und SSH“ | `list_subdirs` lokal `tree.rs:271`, SSH `ssh.rs:318` filtern nur über `show_hidden`; Aufrufer `CwdBreadcrumb.tsx:187` (Statusleiste) | code | Breadcrumb-Menü zeigt `.terax-copy-*` bei `showHidden` | optional dieselbe Präfix-Regel; `fs_read_dir` filtert nach MIG-73 auch für `pathComplete.ts:43` | nein |
| N-5 | note | F | architecture.md (MIG-19, MIG-45) | `OPS` `:556-561`, Muster `:1417`, Kandidatenquelle `:163` | `ssh.rs:557`, `:1422`; `useFileTree.ts:157` | code | – | Zeilenangaben nachziehen | nein |
| N-6 | note | C | – | VAL-8 Test `64:ff9b:1::7f00:1` → Loopback | Ergebnis entsteht schon aus dem /48-Kandidaten `0.0.0.0` | code | – | durch O-1 abgedeckt | nein |
