# Bauplan: Upstream-Sync Runde 4 (crynta v0.9.0, ohne Ghostty)

| Key | Value |
|-----|-------|
| **Spec** | `specs/2026-10-20-upstream-sync-090` |
| **Issue** | -- |
| **Stand** | `4f8b2bf83aa0cf9f749f43ca411ebb073532361a` |
| **Stack** | TypeScript+Rust (Tauri 2) |

Bau-Reihenfolge (PM): slice-00 → slice-01 → slice-02 → slice-03 → slice-04 → slice-05 → slice-06, entspricht den Discovery-Slices 1 → 3 → 2 → 5 → 4 → 6 → 7. Je Slice ein Branch und ein PR gegen `main`, nacheinander gemergt; jeder Slice baut auf dem gemergten `main` des vorigen auf.

## Anforderungen

| ID | Slice | Nachweis |
|----|-------|----------|
| FL-1 | slice-01-clipboard-paste | AC |
| FL-2 | slice-01-clipboard-paste | AC |
| FL-3 | slice-01-clipboard-paste | AC |
| FL-4 | slice-01-clipboard-paste | AC |
| FL-5 | slice-01-clipboard-paste | AC |
| FL-6 | slice-03-animations | AC |
| FL-7 | slice-03-animations | AC |
| FL-8 | slice-04-visible-consumers | AC |
| FL-9 | slice-04-visible-consumers | AC |
| EP-1 | slice-01-clipboard-paste | AC |
| EP-2 | slice-01-clipboard-paste | AC |
| EP-3 | slice-01-clipboard-paste | AC |
| EP-4 | slice-01-clipboard-paste | AC |
| EP-5 | slice-01-clipboard-paste | AC |
| UI-1 | slice-01-clipboard-paste | AC |
| UI-2 | slice-01-clipboard-paste | AC |
| UI-3 | slice-01-clipboard-paste | AC |
| UI-4 | slice-01-clipboard-paste | AC |
| UI-5 | slice-01-clipboard-paste | AC |
| UI-6 | slice-01-clipboard-paste | AC |
| UI-7 | slice-01-clipboard-paste | AC |
| UI-8 | slice-03-animations | AC |
| UI-9 | slice-02-media-pause | AC |
| UI-10 | slice-06-deps-version | AC |
| ST-1 | slice-01-clipboard-paste | AC |
| ST-2 | slice-01-clipboard-paste | AC |
| ST-3 | slice-01-clipboard-paste | AC |
| ST-4 | slice-01-clipboard-paste | AC |
| ST-5 | slice-01-clipboard-paste | AC |
| ST-6 | slice-02-media-pause | AC |
| ST-7 | slice-02-media-pause | AC |
| ST-8 | slice-04-visible-consumers | AC |
| ST-9 | slice-04-visible-consumers | AC |
| TR-1 | slice-01-clipboard-paste | AC |
| TR-2 | slice-01-clipboard-paste | AC |
| TR-3 | slice-01-clipboard-paste | AC |
| TR-4 | slice-01-clipboard-paste | AC |
| TR-5 | slice-01-clipboard-paste | AC |
| TR-6 | slice-01-clipboard-paste | AC |
| TR-7 | slice-02-media-pause | AC |
| TR-8 | slice-02-media-pause | AC |
| TR-9 | slice-04-visible-consumers | AC |
| TR-10 | slice-04-visible-consumers | AC |
| BR-1 | slice-01-clipboard-paste | AC |
| BR-2 | slice-01-clipboard-paste | AC |
| BR-3 | slice-01-clipboard-paste | AC |
| BR-4 | slice-01-clipboard-paste | AC |
| BR-5 | slice-01-clipboard-paste | AC |
| BR-6 | slice-01-clipboard-paste | AC |
| BR-7 | slice-01-clipboard-paste | AC |
| BR-8 | slice-01-clipboard-paste | AC |
| BR-9 | slice-03-animations | AC |
| BR-10 | slice-03-animations | AC |
| BR-11 | slice-04-visible-consumers | AC |
| BR-12 | slice-02-media-pause | AC |
| BR-13 | slice-04-visible-consumers | AC |
| BR-14 | nach dem Merge | -- |
| BR-15 | slice-03-animations | AC |
| BR-16 | slice-00-core-picks | AC |
| BR-17 | slice-00-core-picks | AC |
| BR-18 | slice-05-lazy-start | AC |
| BR-19 | slice-06-deps-version | AC |
| BR-20 | slice-06-deps-version | AC |
| BR-21 | slice-01-clipboard-paste | AC |
| DF-1 | slice-01-clipboard-paste | AC |
| DF-2 | slice-01-clipboard-paste | AC |
| DF-3 | slice-01-clipboard-paste | AC |
| TG-1 | slice-01-clipboard-paste | AC |
| TG-2 | slice-01-clipboard-paste | AC |
| TG-3 | slice-01-clipboard-paste | AC |
| TG-4 | slice-02-media-pause | AC |
| TG-5 | slice-04-visible-consumers | AC |
| TG-6 | slice-00-core-picks | AC |
| API-1 | slice-01-clipboard-paste | AC |
| API-2 | slice-01-clipboard-paste | AC |
| API-3 | slice-01-clipboard-paste | AC |
| API-4 | slice-00-core-picks | AC |
| SVC-1 | slice-01-clipboard-paste | AC |
| SVC-2 | slice-01-clipboard-paste | AC |
| SVC-3 | slice-01-clipboard-paste | AC |
| SVC-4 | slice-01-clipboard-paste | AC |
| SVC-5 | slice-01-clipboard-paste | AC |
| SVC-6 | slice-01-clipboard-paste | AC |
| SVC-7 | slice-02-media-pause | AC |
| SVC-8 | slice-02-media-pause | AC |
| SVC-9 | slice-03-animations | AC |
| SVC-10 | slice-04-visible-consumers | AC |
| SVC-11 | slice-04-visible-consumers | AC |
| SVC-12 | slice-00-core-picks | AC |
| SVC-13 | slice-00-core-picks | AC |
| SVC-14 | slice-05-lazy-start | AC |
| SVC-15 | slice-05-lazy-start | AC |
| SVC-16 | slice-06-deps-version | AC |
| SVC-17 | slice-00-core-picks | AC |
| VAL-1 | slice-01-clipboard-paste | AC |
| VAL-2 | slice-01-clipboard-paste | AC |
| VAL-3 | slice-01-clipboard-paste | AC |
| VAL-4 | slice-01-clipboard-paste | AC |
| VAL-5 | slice-01-clipboard-paste | AC |
| VAL-6 | slice-01-clipboard-paste | AC |
| VAL-7 | slice-01-clipboard-paste | AC |
| VAL-8 | slice-00-core-picks | AC |
| VAL-9 | slice-01-clipboard-paste | AC |
| VAL-10 | slice-00-core-picks | AC |
| SEC-1 | slice-01-clipboard-paste | Deliverable |
| SEC-2 | slice-01-clipboard-paste | AC |
| SEC-3 | slice-01-clipboard-paste | AC |
| SEC-4 | slice-01-clipboard-paste | AC |
| SEC-5 | slice-01-clipboard-paste | AC |
| SEC-7 | slice-00-core-picks | AC |
| SEC-8 | slice-00-core-picks | Deliverable |
| SEC-6 | slice-01-clipboard-paste | AC |
| MIG-1 | slice-00-core-picks | AC |
| MIG-2 | slice-06-deps-version | AC |
| MIG-3 | slice-00-core-picks | Deliverable |
| MIG-4 | slice-00-core-picks | Deliverable |
| MIG-5 | slice-00-core-picks | AC |
| MIG-6 | slice-00-core-picks | AC |
| MIG-7 | slice-00-core-picks | AC |
| MIG-8 | slice-00-core-picks | Deliverable |
| MIG-9 | slice-02-media-pause | AC |
| MIG-10 | slice-04-visible-consumers | AC |
| MIG-11 | slice-05-lazy-start | AC |
| MIG-12 | slice-00-core-picks | Deliverable |
| MIG-13 | slice-00-core-picks | Deliverable |
| MIG-14 | slice-01-clipboard-paste | AC |
| MIG-15 | slice-01-clipboard-paste | Deliverable |
| MIG-16 | slice-01-clipboard-paste | AC |
| MIG-17 | slice-01-clipboard-paste | Deliverable |
| MIG-18 | slice-01-clipboard-paste | Deliverable |
| MIG-19 | slice-01-clipboard-paste | AC |
| MIG-20 | slice-01-clipboard-paste | Deliverable |
| MIG-21 | slice-01-clipboard-paste | Deliverable |
| MIG-22 | slice-01-clipboard-paste | AC |
| MIG-23 | slice-01-clipboard-paste | AC |
| MIG-24 | slice-06-deps-version | Deliverable |
| MIG-25 | slice-02-media-pause | AC |
| MIG-26 | slice-02-media-pause | Deliverable |
| MIG-27 | slice-02-media-pause | Deliverable |
| MIG-28 | slice-02-media-pause | Deliverable |
| MIG-29 | slice-02-media-pause | AC |
| MIG-30 | slice-02-media-pause | Deliverable |
| MIG-31 | slice-02-media-pause | AC |
| MIG-32 | slice-02-media-pause | Deliverable |
| MIG-33 | slice-02-media-pause | AC |
| MIG-34 | slice-02-media-pause | Deliverable |
| MIG-35 | slice-02-media-pause | Deliverable |
| MIG-36 | slice-02-media-pause | Deliverable |
| MIG-37 | slice-02-media-pause | Deliverable |
| MIG-38 | slice-02-media-pause | Deliverable |
| MIG-39 | slice-02-media-pause | Deliverable |
| MIG-40 | slice-03-animations | AC |
| MIG-41 | slice-03-animations | Deliverable |
| MIG-42 | slice-04-visible-consumers | AC |
| MIG-43 | slice-04-visible-consumers | AC |
| MIG-44 | slice-04-visible-consumers | Deliverable |
| MIG-45 | slice-04-visible-consumers | AC |
| MIG-46 | slice-04-visible-consumers | AC |
| MIG-47 | slice-04-visible-consumers | Deliverable |
| MIG-48 | slice-04-visible-consumers | AC |
| MIG-49 | slice-04-visible-consumers | AC |
| MIG-50 | slice-04-visible-consumers | Deliverable |
| MIG-51 | slice-04-visible-consumers | AC |
| MIG-52 | slice-05-lazy-start | AC |
| MIG-53 | slice-05-lazy-start | AC |
| MIG-54 | slice-05-lazy-start | AC |
| MIG-55 | slice-05-lazy-start | Deliverable |
| MIG-56 | slice-05-lazy-start | Deliverable |
| MIG-57 | slice-05-lazy-start | Deliverable |
| MIG-58 | slice-05-lazy-start | Deliverable |
| MIG-59 | slice-05-lazy-start | Deliverable |
| MIG-60 | slice-05-lazy-start | Deliverable |
| MIG-61 | slice-05-lazy-start | Deliverable |
| MIG-62 | slice-05-lazy-start | AC |
| MIG-63 | slice-05-lazy-start | AC |
| MIG-64 | slice-05-lazy-start | Deliverable |
| MIG-65 | slice-05-lazy-start | Deliverable |
| MIG-66 | slice-05-lazy-start | Deliverable |
| MIG-67 | slice-06-deps-version | AC |
| MIG-68 | slice-06-deps-version | AC |
| MIG-69 | slice-06-deps-version | AC |
| MIG-70 | slice-06-deps-version | AC |
| MIG-71 | slice-06-deps-version | Deliverable |
| MIG-72 | slice-06-deps-version | Deliverable |
| MIG-73 | slice-01-clipboard-paste | AC |
| MIG-74 | slice-01-clipboard-paste | AC |
| MIG-75 | slice-01-clipboard-paste | AC |
| MIG-76 | slice-01-clipboard-paste | AC |
| INV-1 | -- | -- |
| INV-2 | -- | -- |
| INV-3 | -- | -- |
| INV-4 | -- | -- |
| INV-5 | -- | -- |
| INV-6 | -- | -- |
| INV-7 | -- | -- |
| INV-8 | -- | -- |
| INV-9 | -- | -- |
| INV-10 | -- | -- |
| INV-11 | -- | -- |
| INV-12 | -- | -- |
| INV-13 | -- | -- |
| INV-14 | -- | -- |
| INV-15 | -- | -- |
| INV-16 | -- | -- |
| INV-17 | -- | -- |
| INV-18 | -- | -- |
| INV-19 | -- | -- |
| INV-20 | -- | -- |
| INV-21 | -- | -- |
| INV-22 | -- | -- |
| INV-23 | -- | -- |
| NFR-1 | slice-04-visible-consumers | AC |
| NFR-2 | slice-05-lazy-start | AC |
| NFR-3 | slice-01-clipboard-paste | AC |
| NFR-4 | slice-00-core-picks | AC |
| NFR-5 | slice-05-lazy-start | AC |
| NFR-6 | slice-01-clipboard-paste | AC |
| NFR-7 | slice-04-visible-consumers | AC |
| NFR-8 | slice-06-deps-version | AC |
| OB-1 | slice-01-clipboard-paste | AC |
| OB-2 | slice-01-clipboard-paste | AC |
| OB-3 | slice-01-clipboard-paste | AC |
| OB-4 | slice-00-core-picks | AC |
| OB-5 | slice-05-lazy-start | AC |
| OB-6 | slice-01-clipboard-paste | AC |
| OB-7 | slice-01-clipboard-paste | AC |
| OB-8 | slice-01-clipboard-paste | AC |
| OB-9 | slice-01-clipboard-paste | AC |
| OB-10 | slice-01-clipboard-paste | AC |
| OB-11 | slice-02-media-pause | AC |
| OB-12 | slice-04-visible-consumers | AC |
| OB-13 | slice-01-clipboard-paste | AC |
| OB-14 | slice-01-clipboard-paste | AC |
| OB-15 | slice-01-clipboard-paste | AC |
| OB-16 | slice-01-clipboard-paste | AC |
| OB-17 | slice-02-media-pause | AC |
| OB-18 | slice-02-media-pause | AC |
| OB-19 | slice-04-visible-consumers | AC |
| OB-20 | slice-05-lazy-start | AC |
| OB-21 | slice-01-clipboard-paste | AC |
| OB-22 | slice-01-clipboard-paste | AC |
| OB-23 | slice-02-media-pause | AC |
| OB-24 | slice-01-clipboard-paste | AC |
| OB-25 | slice-00-core-picks | AC |
| OB-26 | slice-00-core-picks | AC |
| OB-27 | slice-00-core-picks | AC |
| OB-28 | slice-01-clipboard-paste | AC |
| OB-29 | slice-01-clipboard-paste | AC |
| OB-30 | slice-01-clipboard-paste | AC |
| OB-31 | slice-01-clipboard-paste | AC |

## Entscheidungen ohne Vorgabe

- Offen: `src/app/App.tsx` ändern laut Migration Map (MIG-10) drei Slices (S1, S2, S4), Dateibereiche außer slice-00 müssen disjunkt sein · Wahl: slice-00 legt den Getter `isWindowHidden` als Rumpf in `src/lib/windowVisibility.ts` an und stellt den tmux-cwd-Poll-Guard (`App.tsx:477`) schon darauf um; slice-02 berührt `App.tsx` nicht, slice-04 ist der einzige weitere Bauer · Grund: der Poll-Guard ist die kleinste abtrennbare Teilmenge, der Rumpf verhält sich wie heute `document.hidden` · Alternative: slice-00 legt die slice-04-Verdrahtung (`visible`, Konsumenten-Eingaben) als Rümpfe an; mehr Vertragsfläche in drei Dateien · Wirkung: technisch
- Offen: `src/modules/explorer/FileExplorer.tsx` ändern S3, S4 und S6 · Wahl: slice-00 stellt die zwei Icon-Stellen (`:494`, `:597-598`) auf synchrone Rümpfe `FileIcon`/`FolderIcon` um und reicht ein neues Prop `visible` ohne Wirkung an `useFileTree` durch; danach ändert nur slice-01 die Datei · Grund: disjunkte Dateibereiche; beide Rümpfe verhalten sich wie heute · Alternative: slice-00 übernimmt alle acht Icon-Aufrufer (MIG-55 bis MIG-61 wanderten aus slice-05) · Wirkung: technisch
- Offen: Architecture nennt für das Einfügen nur die `objc2`-Features (MIG-1); OB-15 verlangt unter Windows `MoveFileExW`, das im Fork-`windows-sys` das Feature `Win32_Storage_FileSystem` braucht (Upstream-Manifest hat es) · Wahl: slice-00 ergänzt alle drei Feature-Sätze in `src-tauri/Cargo.toml` als Vertrag für slice-01 · Grund: `Cargo.toml` gehört sonst slice-01 und slice-06 · Alternative: slice-01 ändert `Cargo.toml` selbst, dann dürfte slice-06 die Datei nicht ändern · Wirkung: technisch
- Offen: `TERAX.md` (MIG-24) ändern S2, S3 und S7 · Wahl: alle drei Notizen in slice-06 · Grund: disjunkte Dateibereiche; bei slice-06 existiert alles, was dokumentiert wird · Alternative: slice-00 schreibt die Notizen vorab für noch nicht gebauten Code · Wirkung: technisch
- Offen: Lezer-Fall des Build-Tests (MIG-64 nennt S6 und S7) · Wahl: slice-05 legt `dist-budget.test.ts` gleich mit dem Lezer-Fall aus `bf7e03d` an, slice-06 nutzt ihn als Vertrag · Grund: die Datei gehörte sonst zwei Slices; der Wächter steht vor dem Deps-Update (heute eine Kopie 1.2.3, also grün) · Alternative: slice-06 erweitert die Datei; Überschneidung der Dateibereiche · Wirkung: technisch
- Offen: `src/styles/globals.css` ändern S5 und S6 (`terax-icon-in`, MIG-40) · Wahl: slice-03 legt auch `@keyframes terax-icon-in` und `.terax-icon-in` an und liefert die Klasse an slice-05 · Grund: disjunkte Dateibereiche, slice-03 ist Besitzer der Animationen · Alternative: Rumpf der Klasse in slice-00 · Wirkung: technisch
- Offen: BR-14 (Ghostty-Wiedervorlage) hat in diesem Lauf keinen Bauanteil, die Discovery nennt keine eigene Laufgrenze · Wahl: `nach dem Merge` · Grund: die Kriterien gelten beim nächsten Sync; die Architecture führt BR-14 als Out of Scope; jeder Slice schließt Ghostty-Code unter „Nicht in diesem Slice“ aus · Alternative: Deliverable in slice-06 („kein Ghostty-Code übernommen“) · Wirkung: technisch
- Offen: BR-15 (Messung vorher/nachher) soll bei slice-03, slice-04 und slice-05 als Akzeptanzkriterium stehen, eine ID gehört aber genau einem Slice · Wahl: BR-15 bei slice-03; die Mess-ACs von slice-04 und slice-05 tragen NFR-1 bzw. NFR-2 (dieselbe Messung in Architecture-Fassung) und nennen BR-15 im Text · Grund: Regel 1 des Bauplans · Alternative: BR-15 in allen drei ACs als Quelle; der Precheck warnt dann zweimal · Wirkung: technisch
- Offen: IDs, die Migration Map oder Architecture mehreren Slices zuordnen · Wahl: je ID der Slice mit dem Hauptteil oder dem Endzustand: MIG-1 slice-00, MIG-2 slice-06, MIG-9 slice-02, MIG-10 slice-04, MIG-11 slice-05 (Vorher-Aufnahme `d766567` als Vertrag aus slice-00), MIG-24 slice-06, MIG-40 slice-03, MIG-64 slice-05, NFR-4 slice-00 (Jail-Teil über VAL-2 in slice-01), NFR-6 slice-01 (⌘S-Teil über BR-17 und VAL-10 in slice-00), FL-6 und FL-7 slice-03 (Media-Teil über BR-12 in slice-02) · Grund: Regel 1; die übrigen Teile tragen die Slices unter eigenen IDs oder als Vertrag · Alternative: Teile ohne ID bauen und nur im Text nennen · Wirkung: technisch
- Offen: Auflagen nur mit Ziel-Schritt QA (OB-18, OB-19, OB-20, OB-21) · Wahl: in der Tabelle beim zuständigen Slice, Nachweis als AC mit `[Prüfweg: QA]` · Grund: keine Auflage geht verloren, QA findet sie beim Slice · Alternative: weglassen; der Precheck warnt · Wirkung: technisch
- Offen: Fallback zu OB-18 (nativer Verdeckungs-Hinweis aus Rust) läge in `src-tauri/src/lib.rs`, das slice-01 gehört · Wahl: kein vorsorglicher Fallback; fehlt im e2e von slice-02 einer der drei Unsichtbar-Fälle, meldet der Slice das als Befund, der Plan wird nachgebessert · Grund: Architecture belegt alle drei Fälle über `document.visibilityState` (Q&A #3) · Alternative: `lib.rs` vorsorglich in slice-00 vorbereiten · Wirkung: technisch
- Offen: Namen der Sichtbarkeits-API (Architecture nennt Getter, Abo, Hook, Attribut) und der Konstante der Git-Widgets (MIG-51) · Wahl: `isWindowHidden`, `subscribeWindowHidden`, `useWindowHidden`, `installWindowVisibility`, Attribut `data-window-hidden`, Konstante `GIT_STATUS_WIDGET_IDS` · Grund: Verträge brauchen Namen; das Attribut steht in SVC-7 · Alternative: Upstream-Namen aus `windowActivity.ts`, die Fokus meinen und hier irreführen · Wirkung: technisch
- Offen: Die Chunk-Strategie aus MIG-62 ändert Chunk-Namen, auf die `.size-limit.json` zeigt (z. B. `alert-dialog-*.js`); die Migration Map nennt die Datei nicht · Wahl: slice-05 passt nur die Pfade an, Grenzwerte (540 KB Startpaket, 1650 KB gesamt, gzip) bleiben · Grund: der CI-Schritt `pnpm size` muss grün bleiben, ohne Rückschritte zu verdecken · Alternative: Grenzwerte anheben · Wirkung: technisch
- Offen: Upstream `f6f0004` ergänzt in `package.json` das Script `check:dist`; die Migration Map nennt es nicht, `package.json` gehört slice-06 · Wahl: kein `check:dist`; das Fallback-Script `test:dist` samt CI-Schritt (Risk-Tabelle, Build-Test über 2 min) gehört bei Bedarf slice-06 · Grund: disjunkte Dateibereiche · Alternative: slice-05 ändert `package.json`; Überschneidung mit slice-06 · Wirkung: technisch
- Offen: Das Deps-Update (`dirs` 7, tauri 2.12, vite 8.3) könnte Code außerhalb von slice-06 verlangen (13 `dirs::`-Stellen, darunter `ssh.rs` aus slice-01; `vite.config.ts` aus slice-05) · Wahl: slice-06 ändert nur Manifeste, Lockfiles, Version, Doku und zwei Tests; braucht ein Update Code in fremden Bereichen, stoppt der Slice mit Befund (Nachbesserung) · Grund: Architecture belegt Quellkompatibilität (`2992988` ohne Codeänderung) · Alternative: slice-06 bekommt vorsorglich die sieben `dirs::`-Dateien; Überschneidung mit slice-01 · Wirkung: technisch
- Offen: Upstream schaltet beim verborgenen Explorer auch den Drop-Listener ab (`useExplorerFileDrop` mit `enabled`); Architecture verlangt nur Watcher und Neu-Einlesen (SVC-10) · Wahl: nicht übernommen · Grund: bei zugeklappter Sidebar ist der Explorer 0 px breit, ein Drop ist dort nicht möglich; die Datei gehört slice-01 · Alternative: `enabled` in slice-01 vorbereiten · Wirkung: technisch

## Slices

### slice-00-core-picks: Kern-Picks, Verträge und geteilte Dateien

| Key | Value |
|-----|-------|
| **Dateibereich** | `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `.github/workflows/ci.yml`, `src/components/ai-elements/markdown-code.tsx`, `src-tauri/src/modules/net.rs`, `src-tauri/src/modules/net/ip.rs`, `src/modules/shortcuts/shortcuts.ts`, `src/modules/shortcuts/shortcuts.test.ts`, `src/modules/editor/EditorPane.tsx`, `src/app/App.tsx`, `src/modules/explorer/lib/iconResolver.test.ts`, `src/modules/theme/applyTheme.test.ts`, `src/modules/theme/customThemes.test.ts`, `src/lib/windowVisibility.ts`, `src/modules/explorer/FileIcon.tsx`, `src/modules/explorer/FileExplorer.tsx`, `src/modules/explorer/lib/useFileTree.ts` |
| **Abhängigkeiten** | `[]` |
| **Anforderungen** | `BR-16, BR-17, TG-6, API-4, SVC-12, SVC-13, SVC-17, VAL-8, VAL-10, SEC-7, SEC-8, MIG-1, MIG-3, MIG-4, MIG-5, MIG-6, MIG-7, MIG-8, MIG-12, MIG-13, NFR-4, OB-4, OB-25, OB-26, OB-27` |

**Ziel.** Schließt die SSRF-Lücke des AI-HTTP-Proxys, macht ⌘S auf App-Ebene zuverlässig und übernimmt die sauberen Upstream-Picks samt drei Test-Commits (Discovery Slice 1). Zugleich legt der Slice Verträge und Rümpfe in den Dateien an, die sonst zwei spätere Slices ändern müssten (`App.tsx`, `FileExplorer.tsx`, `Cargo.toml`), damit danach jede Datei genau einem Slice gehört.

**Deliverables**

- Picks: `f885631` (`grep-matcher` raus, `Cargo.lock` nur per `cargo` neu; MIG-1), `d3c8fd7` als Cherry-Pick (MIG-3), `e8f9fcd` per Handarbeit an allen vier `actions/checkout`-Stellen von `ci.yml`, HEAD-Seite der Jobs behalten, andere Workflows unverändert (MIG-4, SEC-8).
- SSRF nach architecture.md SVC-13, VAL-8, API-4, MIG-5, MIG-6: `net/ip.rs` aus `11343a1` plus Fork-Erweiterung `64:ff9b:1::/48` mit 1-2-Zeilen-Kommentar zur Abweichung; `ip_kind`/`IpKind` in `net.rs` entfernt, alte Assertions bleiben als Test; Klammer-Hunk aus `0a6e511` an `net.rs:90` und in `redirect_decision`; Redirect-Prüfung als reine Funktion aus der Closure in `build_safe_client` gelöst.
- ⌘S nach SVC-12, VAL-10, MIG-7: Registry-Eintrag `editor.save`, Handler und Freischaltung in `App.tsx` wie `editor.undo`, `save()` am `EditorPaneHandle` nach OB-4; Registry-Test `shortcuts.test.ts` (MIG-8).
- Test-Commits `258d119` (MIG-12) und `13ded38` (MIG-13); `d766567` als Vorher-Aufnahme des synchronen Icon-Resolvers (Vertrag für slice-05, die Anforderung MIG-11 liegt dort).
- Verträge und Rümpfe laut Liefert-Tabelle: Getter `isWindowHidden`, auf den der tmux-cwd-Poll-Guard (`App.tsx:477`) umzieht; `FileIcon`/`FolderIcon` als synchrone Rümpfe über den heutigen Resolver, auf die die zwei Icon-Stellen in `FileExplorer.tsx` umziehen; Prop `visible` am `FileExplorer`, durchgereicht als Option an `useFileTree`, ohne Wirkung; Cargo-Features für slice-01.

**Liefert**

| Vertrag | Signatur | Datei | Konsumenten |
|---------|----------|-------|-------------|
| `isWindowHidden` | `() => boolean`; der Rumpf liest den Sichtbarkeitszustand des Dokuments direkt, gleiches Verhalten wie heute `document.hidden` | `src/lib/windowVisibility.ts` | slice-02-media-pause (macht ihn zum Owner), Poll-Guard in `src/app/App.tsx` |
| `FileIcon` | React-Komponente, Props `name: string` plus alle `<img>`-Attribute außer `src` und `alt`; der Rumpf rendert synchron das Icon aus `fileIconUrl(name)` | `src/modules/explorer/FileIcon.tsx` | slice-05-lazy-start, `FileExplorer.tsx` |
| `FolderIcon` | React-Komponente, Props `name: string`, `expanded?: boolean` plus alle `<img>`-Attribute außer `src` und `alt`; der Rumpf rendert synchron das Icon aus `folderIconUrl(name, expanded)` | `src/modules/explorer/FileIcon.tsx` | slice-05-lazy-start, `FileExplorer.tsx` |
| `FileExplorer.visible` | Prop `visible?: boolean`, Default `true`, unverändert an `useFileTree` weitergereicht | `src/modules/explorer/FileExplorer.tsx` | slice-04-visible-consumers (`App.tsx` setzt es) |
| `useFileTree.visible` | Option `visible?: boolean` im zweiten Parameter von `useFileTree(rootPath, options)`, bis slice-04 ohne Wirkung | `src/modules/explorer/lib/useFileTree.ts` | slice-04-visible-consumers |
| `Cargo-Features Einfügen` | `objc2-app-kit` plus `NSPasteboardItem`; `objc2-foundation` plus `NSArray`, `NSURL`; `windows-sys` plus `Win32_Storage_FileSystem` | `src-tauri/Cargo.toml` | slice-01-clipboard-paste |
| `iconResolver-Vorher-Aufnahme` | Upstream-Test `d766567` gegen den synchronen Resolver, grün | `src/modules/explorer/lib/iconResolver.test.ts` | slice-05-lazy-start |
| `EditorPaneHandle.save` | `save: () => Promise<void>` über `saveRef`; `onSaved` nur nach echtem Schreiben | `src/modules/editor/EditorPane.tsx` | `editor.save`-Handler in `App.tsx`; slice-02-media-pause erhält ihn beim Umbau von `EditorPane.tsx` |
| `editor.save` | `ShortcutId` mit `Mod+S`, Label `Save file`, Gruppe Editor; deaktiviert, wenn der aktive Tab kein Editor ist | `src/modules/shortcuts/shortcuts.ts` | `App.tsx` |
| `redirect_decision` | reine Funktion in Upstream-Form `11343a1:net/clients.rs:135-173` (nächste URL, letzte URL, Anzahl bisheriger Redirects, `allow_private`) mit Ergebnis Follow, Stop oder TooMany | `src-tauri/src/modules/net.rs` | Redirect-Closure in `build_safe_client` |
| `ip_kind` | `ip_kind(ip: IpAddr) -> IpKind`, sichtbar im `net`-Modul | `src-tauri/src/modules/net/ip.rs` | `net.rs` (Auflösung, Pinning, Redirect) |

**Braucht**

| Vertrag | von Slice |
|---------|-----------|
| -- | -- |

**Akzeptanzkriterien**

1) GIVEN `src-tauri/src/modules/net/ip.rs` nach slice-00
   WHEN `ip_kind` die Adressen `::ffff:169.254.169.254`, `::127.0.0.1`, `::ffff:0:127.0.0.1`, `64:ff9b::a9fe:a9fe`, `2002:a9fe:a9fe::` und `2001:0:808:808:0:0:5601:5601` klassifiziert
   THEN ergeben sich BlockedMetadata, Loopback, Loopback, BlockedMetadata, BlockedMetadata und BlockedMetadata, während `::ffff:8.8.8.8` und `64:ff9b::808:808` Public bleiben
   [Source: BR-16, SVC-13, VAL-8]

2) GIVEN die Fork-Erweiterung für `64:ff9b:1::/48`
   WHEN `ip_kind` `64:ff9b:1::a9fe:a9fe`, `64:ff9b:1::7f00:1`, `64:ff9b:1::808:808`, `64:ff9b:1:a9fe:a9:fe00::` (/48), `64:ff9b:1:a9:fe:a9fe::` (/56), `64:ff9b:1:0:a9:fea9:fe00:0` (/64) und `64:ff9b:1:808:8:808:808:808` klassifiziert
   THEN ergeben sich BlockedMetadata, Loopback, Loopback, BlockedMetadata, BlockedMetadata, BlockedMetadata und Private, nie Public; die Upstream-Assertion für `64:ff9b:1::808:808` steht auf Loopback
   [Source: SVC-13, MIG-6, OB-25, OB-27]

3) GIVEN die bisherigen Fork-Assertions aus `net.rs:446-503`
   WHEN `cargo test --locked` sie gegen `net/ip.rs` ausführt
   THEN sind sie grün, darunter `0.0.0.0` → Loopback, `fd00:ec2::254` und `fe80::1` → BlockedMetadata, `fc00::1` → Private, `8.8.8.8` → Public; `grep -rn "fn ip_kind\|enum IpKind" src-tauri/src` liefert je Muster genau einen Treffer, in `net/ip.rs`
   [Source: MIG-5]

4) GIVEN die reine Funktion `redirect_decision`
   WHEN sie `http://[::ffff:169.254.169.254]/` und `http://[fd00:ec2::254]/` mit `allow_private = true` sowie `http://[::1]/` einmal ohne und einmal mit Opt-in prüft
   THEN lautet das Ergebnis Stop, Stop, Stop und Follow
   [Source: MIG-5, VAL-8, OB-26]

5) GIVEN ein AI-HTTP-Aufruf über `ai_http_request` mit IPv6-Literal-Host
   WHEN das Ziel `http://[::ffff:127.0.0.1]:11434/` ohne Opt-in, `http://[::1]:11434/` mit Opt-in bzw. `http://[::ffff:169.254.169.254]/` mit Opt-in ist
   THEN scheitert das erste mit dem bestehenden Opt-in-Fehlertext statt mit einem DNS-Fehler, das zweite wird klassifiziert und darf verbinden (kein `host not allowed`), das dritte scheitert mit `host not allowed: …`
   [Source: API-4, SEC-7, NFR-4]

6) GIVEN ein aktiver Editor-Tab `notes.txt`, im Puffer von `a` auf `ab` geändert, Fokus außerhalb von CodeMirror
   WHEN der User ⌘S drückt
   THEN steht `ab` auf der Platte, `onSaved` läuft genau einmal, und das WebView öffnet keinen Dialog „Seite sichern“
   [Source: BR-17, SVC-12, TG-6]
   [Prüfweg: QA]

7) GIVEN die Shortcut-Registry nach slice-00
   WHEN `shortcuts.test.ts` `Mod+S` und `Mod+Shift+S` auflöst und der aktive Tab ein Terminal ist
   THEN ergibt `Mod+S` `editor.save` (Label `Save file`, Gruppe Editor), `Mod+Shift+S` bleibt `space.overview`, und im Terminal-Tab ist `editor.save` deaktiviert, die Taste fällt durch
   [Source: VAL-10, MIG-7]

8) GIVEN ein Editor-Tab, dessen Datei seit dem Öffnen extern geändert wurde (mtime weicht ab)
   WHEN ⌘S über den globalen Shortcut auslöst
   THEN erscheint der bestehende Konflikt-Hinweis, die Datei bleibt unverändert und `onSaved` wird nicht aufgerufen; ohne Konflikt wird geschrieben und `onSaved` läuft genau einmal
   [Source: OB-4]

9) GIVEN eine Chat-Antwort mit Inline-Code in einem Absatz mit 14 px Schriftgröße
   WHEN sie gerendert wird
   THEN hat der Inline-Code dieselbe Schriftgröße wie der Absatz statt fester 11 px
   [Source: SVC-17]
   [Prüfweg: QA]

10) GIVEN `src-tauri/Cargo.toml` nach slice-00
   WHEN in `src-tauri` `cargo tree -i grep-matcher --locked` und `cargo check --all-targets --locked` laufen
   THEN meldet das erste, dass kein Paket passt, das zweite ist grün mit den Features `NSPasteboardItem`, `NSArray`, `NSURL` und `Win32_Storage_FileSystem`; `reqwest` steht weiter auf 0.12
   [Source: MIG-1]

11) GIVEN slice-00 ist gemergt
   WHEN `pnpm check-types`, `pnpm lint`, `pnpm test`, `cargo clippy --all-targets -- -D warnings`, `cargo test --locked` und `pnpm build` laufen
   THEN sind alle grün, obwohl `isWindowHidden`, `FileIcon`, `FolderIcon` und `visible` nur Rümpfe sind
   [Source: --]

12) GIVEN die Dev-Instanz (eigener `identifier`) nach slice-00
   WHEN der Explorer geöffnet, eine neue Datei und ein neuer Ordner angelegt und danach das Fenster minimiert wird
   THEN zeigen Wurzel und Anlege-Zeile dieselben Icons wie vor slice-00, und solange das Fenster minimiert ist, läuft kein tmux-cwd-Poll
   [Source: --]
   [Prüfweg: QA]

**Nicht in diesem Slice**

- Kein Ghostty-, WebGPU- oder PTY-Transport-Code; aus `0a6e511` nur der Klammer-Hunk, aus `11343a1` nur `net/ip.rs` und die Redirect-Prüfung.
- `reqwest` bleibt 0.12; `dirs` 7 und Version 0.8.7 kommen in slice-06.
- `windowVisibility.ts`: nur der Getter-Rumpf; Abo, Hook, Attribut, Installation in `main.tsx` und die übrigen Sichtbarkeits-Stellen gehören slice-02.
- `FileIcon`/`FolderIcon`: nur der synchrone Rumpf; Nachladen, Platzhalter und die übrigen sieben Aufrufer gehören slice-05; `iconResolver.ts` bleibt unverändert.
- `useFileTree` wertet `visible` nicht aus (slice-04); Media-Previews in `EditorPane.tsx` bleiben unverändert (slice-02).
- `release.yml` und andere Workflows bleiben unverändert (architecture.md Q&A #21).

**Wie gebaut**

- Merge: PR #83, Squash-Commit `b10bcf9` auf `main`.
- Review: Pipeline-Reviewer APPROVED ohne Befunde; `/code-review high` 16 Runden. Echte Fixes unter anderem: ISATAP, IANA-Ausnahmen in `2001::/23` und `192.0.0.0/24`, Metadaten Alibaba/Oracle/GCP-IPv6, typisierter Host mit `check_url_shape`, ein Error-Event je Fehlerpfad im Stream, Upstream-Client-Cache aus `net/clients.rs`, gehaltenes ⌘S wird geschluckt.
- Abweichungen vom Plan:
  - Netzwerk folgt Upstream `11343a1` (Tie-Break-Regel, Gate-Log Runde 12): `redirect_decision` als reqwest-Policy wie upstream, dazu `net/clients.rs`. Eigene Redirect-Schleife, Resolver und Proxy-Regeln aus Runden 1 bis 11 wieder entfernt.
  - Verträge vor Nutzung entfernt (Gate-Log Runde 3): `isWindowHidden` kommt mit slice-02, `FileExplorer.visible`/`useFileTree.visible` mit slice-04, `FileIcon`/`FolderIcon` mit slice-05; Cargo-Features fürs Einfügen mit slice-01. Diese Slices dürfen dafür `App.tsx`, `FileExplorer.tsx`, `useFileTree.ts`, `TreeRow.tsx` und `Cargo.toml` anfassen.
  - ⌘S in Upstream-Form (`4cfc202`), kein zusätzlicher Page-Save-Guard; `useDocument.ts` unverändert.
- Dokumentierte, upstream-identische Restrisiken: siehe `evidence/slice-00-core-picks.json` und PR #83.

### slice-01-clipboard-paste: Einfügen aus dem Finder und Finder-Benennung

| Key | Value |
|-----|-------|
| **Dateibereich** | `src-tauri/src/modules/fs/copy.rs`, `src-tauri/src/modules/fs/clipboard.rs`, `src-tauri/src/modules/fs/mod.rs`, `src-tauri/src/modules/fs/mutate.rs`, `src-tauri/src/modules/fs/tree.rs`, `src-tauri/src/modules/fs/search.rs`, `src-tauri/src/modules/fs/grep.rs`, `src-tauri/src/modules/git/parser.rs`, `src-tauri/src/modules/ssh.rs`, `src-tauri/src/lib.rs`, `src/modules/explorer/lib/clipboardPaste.ts`, `src/modules/explorer/lib/clipboardPaste.test.ts`, `src/modules/explorer/lib/useExplorerFileDrop.ts`, `src/modules/explorer/lib/useExplorerFileDrop.test.ts`, `src/modules/explorer/FileExplorer.tsx`, `src/modules/explorer/FileExplorer.test.tsx` |
| **Abhängigkeiten** | `[slice-00-core-picks]` |
| **Anforderungen** | `FL-1, FL-2, FL-3, FL-4, FL-5, EP-1, EP-2, EP-3, EP-4, EP-5, UI-1, UI-2, UI-3, UI-4, UI-5, UI-6, UI-7, ST-1, ST-2, ST-3, ST-4, ST-5, TR-1, TR-2, TR-3, TR-4, TR-5, TR-6, BR-1, BR-2, BR-3, BR-4, BR-5, BR-6, BR-7, BR-8, BR-21, DF-1, DF-2, DF-3, TG-1, TG-2, TG-3, API-1, API-2, API-3, SVC-1, SVC-2, SVC-3, SVC-4, SVC-5, SVC-6, VAL-1, VAL-2, VAL-3, VAL-4, VAL-5, VAL-6, VAL-7, VAL-9, SEC-1, SEC-2, SEC-3, SEC-4, SEC-5, SEC-6, MIG-14, MIG-15, MIG-16, MIG-17, MIG-18, MIG-19, MIG-20, MIG-21, MIG-22, MIG-23, MIG-73, MIG-74, MIG-75, MIG-76, NFR-3, NFR-6, OB-1, OB-2, OB-3, OB-6, OB-7, OB-8, OB-9, OB-10, OB-13, OB-14, OB-15, OB-16, OB-21, OB-22, OB-24, OB-28, OB-29, OB-30, OB-31` |

**Ziel.** Dateien und Ordner aus dem Finder lassen sich per ⌘V oder Kontextmenü `Paste` in den Explorer einfügen, lokal und in SSH-Workspaces (Discovery Slice 3). Einfügen und Finder-Drop benennen bei Namensgleichheit wie der Finder, kopieren elementweise mit gesammelten Teilfehlern und zeigen nie eine halbe Kopie; der Staging-Ordner `.terax-copy-*` erscheint in keiner Aufzählung der App.

**Deliverables**

- Kopierkern `fs/copy.rs` nach SVC-1, SVC-2, MIG-14: async Command, Batch in `spawn_blocking` (OB-14), Staging plus No-Replace-Publish je Plattform (OB-8, OB-15), Limits (OB-1), `copy_name`, `STAGING_PREFIX`/`is_staging_name` als einzige Quelle; `copy_recursive`, `fs_copy`, `fs_copy_impl` aus `mutate.rs` entfernt, Tests nach `copy.rs` verschoben, Clobber-Test umgedeutet (MIG-15).
- Zwischenablage `fs/clipboard.rs` nach SVC-4, MIG-16 (Main-Thread-Sprung wie `clipboard_write_text`, höchstens 5 s in `spawn_blocking`, Lesekern mit Pasteboard-Parameter); `pub mod clipboard; pub mod copy;` in `fs/mod.rs` (MIG-17); Registrierung in `lib.rs` (MIG-18); kein Capability-Eintrag (SEC-1).
- SSH nach SVC-3, API-3, MIG-19: `ssh::copy` liefert `CopyResult`, Staging im Remote-Ziel, Kandidaten aus `copy_name`, Helper-Op `publish` (OB-16), Transportfehler als Gesamtfehler (OB-3), Helper-Listing-Filter an allen vier Primitiven plus Pin-Test.
- Staging-Sichtbarkeit nach SEC-4 und Sweep-Kriterium „Staging-Sichtbarkeit“ (architecture.md Migration Map): `tree.rs` (MIG-73), `search.rs` im bestehenden `filter_entry` (MIG-74, OB-30), `grep.rs` (MIG-76), `git/parser.rs` nur für `? `-Einträge (MIG-75).
- Frontend: `clipboardPaste.ts` mit `pasteTargetDir`, `parentDir`, `isPasteShortcut`, `reportCopyFailures`, `pasteClipboardFiles` und Typ `CopyResult` (MIG-20), Test `clipboardPaste.test.ts` (MIG-21); `FileExplorer.tsx` mit `Paste` in Zeilen- und Flächen-Menü, ⌘V im Container-Handler vor der Leer-Prüfung, Busy-Sperre, Auswahl nach OB-22 (MIG-22); Drop mit `renameOnConflict` und `reportCopyFailures` (MIG-23).

**Liefert**

| Vertrag | Signatur | Datei | Konsumenten |
|---------|----------|-------|-------------|
| `fs_copy` | IPC async; Argumente `sources: string[]`, `destDir: string`, `workspace?: WorkspaceEnv`, `renameOnConflict?: boolean` (fehlt = `false`); Ergebnis `CopyResult`, Gesamtfehler als Rejection | `src-tauri/src/modules/fs/copy.rs` | Drop und Einfügen in slice-01; Doku in slice-06 |
| `fs_clipboard_paths` | IPC async ohne Argumente; Ergebnis `string[]` (absolute Pfade, Vorwärts-Slash) | `src-tauri/src/modules/fs/clipboard.rs` | `pasteClipboardFiles`; Doku in slice-06 |
| `is_staging_name` | `pub(crate) fn is_staging_name(name: &str) -> bool`, dazu `pub(crate) const STAGING_PREFIX` mit Wert `.terax-copy-` | `src-tauri/src/modules/fs/copy.rs` | `tree.rs`, `search.rs`, `grep.rs`, `git/parser.rs`, Pin-Test in `ssh.rs` |
| `copy_name` | rein: Name, Zähler 1 bis 10.000, Ordner ja/nein → Kandidatenname nach BR-1 | `src-tauri/src/modules/fs/copy.rs` | lokaler Kopierkern, `ssh::copy` |
| `publish` | Helper-Op mit `op: "publish"`, `from`, `to` → `true` oder Fehler `already exists: {to}` | `src-tauri/src/modules/ssh.rs` | `ssh::copy` |
| `CopyResult` | TS-Typ mit `created: string[]` und `failed: { source: string; message: string }[]` | `src/modules/explorer/lib/clipboardPaste.ts` | `useExplorerFileDrop.ts`, `FileExplorer.tsx` |
| `pasteClipboardFiles` | Ablauf nach SVC-5: Zielordner, Wurzel, `WorkspaceEnv`, `isCurrent`, `refresh` → `Promise<string[]>` mit den angelegten Pfaden | `src/modules/explorer/lib/clipboardPaste.ts` | `FileExplorer.tsx` |

**Braucht**

| Vertrag | von Slice |
|---------|-----------|
| `Cargo-Features Einfügen` | slice-00-core-picks |

**Akzeptanzkriterien**

1) GIVEN ein lokaler Zielordner mit `a.txt`, `archive.tar.gz`, `Makefile`, `.env` und den Ordnern `v1.2` und `report`
   WHEN `fs_copy` mit `renameOnConflict = true` die gleichnamigen Quellen `a.txt`, `archive.tar.gz`, `Makefile`, `.env`, den Ordner `v1.2` und eine Datei `report` kopiert und danach `a.txt` ein zweites Mal
   THEN enthält `created` `a copy.txt`, `archive.tar copy.gz`, `Makefile copy`, `.env copy`, `v1.2 copy` und `report copy`, beim zweiten Lauf `a copy 2.txt`; kein vorhandenes Element ist verändert
   [Source: BR-1, SVC-2, API-2, MIG-14]

2) GIVEN im Ziel sind `a.txt`, `a copy.txt` und `a copy 2.txt` bis `a copy 10000.txt` belegt
   WHEN `fs_copy` `a.txt` mit `renameOnConflict = true` kopiert
   THEN steht das Element in `failed` mit `no free copy name`, und es entsteht keine neue Datei
   [Source: DF-3, VAL-4, OB-1]

3) GIVEN im Ziel liegt `a.txt` als hängender Symlink auf `victim` außerhalb des Workspace
   WHEN `fs_copy` `a.txt` einmal mit `renameOnConflict = true` und einmal mit `false` kopiert
   THEN ist `created` im ersten Fall genau `a copy.txt` im Ziel, im zweiten enthält `failed[0].message` `already exists`; `victim` wird in keinem Fall angelegt oder beschrieben
   [Source: API-2, OB-2]

4) GIVEN die Quellen `/tmp/ok1.txt`, `/tmp/gone.txt` (vor dem Aufruf gelöscht) und `/tmp/ok2.txt`
   WHEN `fs_copy` sie in einen Workspace-Ordner kopiert
   THEN enthält `created` zwei Pfade in der Form `destDir/{Name}` mit Vorwärts-Slash, `failed` genau einen Eintrag mit `source` `/tmp/gone.txt`, und `created.length + failed.length` ist 3
   [Source: BR-4, DF-2, API-2]

5) GIVEN der Workspace-Ordner `/ws/src` mit Unterordner `/ws/src/sub`
   WHEN `fs_copy` die Quelle `/ws/src` nach `/ws/src` bzw. nach `/ws/src/sub` kopiert, jeweils zusammen mit `/tmp/x.txt`
   THEN scheitert `/ws/src` je mit `cannot copy a folder into itself`, `x.txt` wird kopiert, und es entsteht kein neuer Ordner
   [Source: BR-7, VAL-3]

6) GIVEN die Quellen `rel.txt` (relativ), `/` und eine FIFO `/tmp/pipe`
   WHEN `fs_copy` sie kopiert
   THEN scheitern sie einzeln mit `copy source must be absolute`, `copy source has no filename` und `only files, folders and symbolic links can be copied`
   [Source: VAL-1, VAL-9]

7) GIVEN 1025 Quellen bzw. ein Ordner mit Verschachtelungstiefe 129
   WHEN `fs_copy` lokal oder im SSH-Zweig aufgerufen wird
   THEN scheitert der ganze Aufruf mit `copy at most 1024 items at a time` ohne jede Kopie bzw. nur dieses Element mit `folder nesting exceeds the copy limit`; 1024 Quellen und Tiefe 128 laufen durch
   [Source: VAL-5, SEC-6, OB-1]

8) GIVEN ein Quellordner `big/` mit einer unlesbaren Datei in der Mitte
   WHEN `fs_copy` ihn lokal kopiert
   THEN liegen danach weder `big` noch ein `.terax-copy-*`-Ordner im Ziel, und `big` steht in `failed`
   [Source: BR-3, SVC-1, NFR-3, MIG-14]

9) GIVEN eine injizierte Rename-Funktion, die `ENOTSUP`, `EINVAL` bzw. `EEXIST` liefert
   WHEN der Kopierkern ein Element veröffentlicht
   THEN führen `ENOTSUP` (macOS) und `EINVAL` (Linux `renameat2`) in die exklusive Reservierung, `EEXIST` zum nächsten Kandidaten, und kein vorhandenes Element wird ersetzt
   [Source: OB-8]

10) GIVEN der CI-Job `rust-test (windows-latest)`
   WHEN `cargo nextest run --locked` die Konflikttests ausführt
   THEN sind sie grün, veröffentlicht wird über `MoveFileExW` ohne `MOVEFILE_REPLACE_EXISTING`
   [Source: OB-15]

11) GIVEN ein Quellordner `pkg/` mit dem Symlink `pkg/link`, der auf `../outside` zeigt
   WHEN `fs_copy` ihn lokal kopiert
   THEN enthält das Ziel `pkg/link` als Symlink mit demselben Ziel-Text, und `outside` wird nicht mitkopiert
   [Source: BR-21, SEC-5]

12) GIVEN im Ziel existieren gleichnamige Dateien mit 250 Byte und mit 251 Byte langem Namen sowie ein Baum nahe `PATH_MAX` 1024
   WHEN `fs_copy` diese Quellen zusammen mit `/tmp/x.txt` und `renameOnConflict = true` kopiert
   THEN entsteht für den 250-Byte-Namen die Kopie mit 255 Byte, der 251-Byte-Name und der tiefe Baum scheitern einzeln mit dem OS-Grund, es bleibt kein Staging-Rest, nichts wird überschrieben, `x.txt` steht in `created`
   [Source: OB-9]

13) GIVEN ein case-insensitives APFS-Ziel mit `A.txt`
   WHEN `fs_copy` die Quelle `a.txt` mit `renameOnConflict = true` kopiert, lokal und über den Helper gegen lokales python3
   THEN entsteht `a copy.txt`, kein Element-Fehler
   [Source: OB-13]

14) GIVEN ein Ziel `/etc` außerhalb freigegebener Wurzeln bzw. die Datei `/ws/readme.md` als Ziel
   WHEN `fs_copy` lokal aufgerufen wird
   THEN scheitert der ganze Aufruf mit dem bestehenden Jail-Text bzw. `copy destination is not a directory`, ohne Kopie; Quellen außerhalb des Workspace bleiben erlaubt
   [Source: BR-6, VAL-2, SEC-2]

15) GIVEN ein eindeutig benanntes privates Pasteboard mit zwei Datei-URLs, einer Ordner-URL, einer Dateireferenz-URL `file:///.file/id=…` und einem Text-Eintrag, Namen mit Leerzeichen, `%`, `#` und `ä`
   WHEN der Lesekern liest
   THEN liefert er genau vier dekodierte absolute Pfade ohne Trailing Slash, der Text-Eintrag wird ignoriert, ein leeres Pasteboard liefert `[]`, und die allgemeine Zwischenablage des Users bleibt unberührt
   [Source: API-1, DF-1, VAL-6, SVC-4, SEC-3, MIG-16, OB-10]

16) GIVEN der Main-Thread antwortet nicht binnen 5 s bzw. ein Linux-Build
   WHEN `fs_clipboard_paths` aufgerufen wird
   THEN scheitert der Aufruf mit `clipboard read timed out or was cancelled` bzw. `clipboard file paste is only supported on macOS`; das Warten läuft in `spawn_blocking`
   [Source: API-1, MIG-16, OB-6]

17) GIVEN das eingebettete Helper-Programm gegen lokales python3 3.9.6
   WHEN `publish` eine Staging-Datei auf einen freien Namen, eine auf einen belegten Namen und einen Staging-Ordner mit scheiterndem Tausch veröffentlicht
   THEN liefert es `true`, `already exists: {to}` mit unverändertem Ziel bzw. entfernt die Reservierung per `os.rmdir`; Link-Fehler `ENOTSUP`/`EPERM` führen in den Rückfall, `EEXIST` zum nächsten Kandidaten
   [Source: API-3, OB-16]

18) GIVEN `TERAX_SSH_TEST_HOST=litha-claude` und ein Remote-Ordner mit `a.txt`
   WHEN `remote_mutations_smoke` `a.txt` und einen Ordner mit innerem Ordner-Symlink hochlädt
   THEN entsteht remote `a copy.txt`, der Ordner steht in `failed`, danach liegt kein `.terax-copy-*` und nichts Halbes unter einem Zielnamen
   [Source: BR-2, SVC-3, OB-7]

19) GIVEN ein SSH-Einfügen von 20 Dateien nach `litha-claude`
   WHEN der ControlMaster mitten im Batch beendet wird
   THEN erscheint ein einziger Toast `Paste failed: …` statt 20 Element-Fehlern, und unter keinem Zielnamen liegt etwas Halbes
   [Source: OB-3, EP-3]
   [Prüfweg: QA]

20) GIVEN ein Ordner mit `.terax-copy-x/report.pdf` und `.env`, `show_hidden = true`
   WHEN `fs_read_dir`, `list_subdirs`, `fs_search` mit `report` und mit `env` sowie `fs_list_files` laufen
   THEN erscheint `.env` jeweils, `.terax-copy-x` und `report.pdf` erscheinen nirgends
   [Source: SEC-4, MIG-73, MIG-74]

21) GIVEN ein `git init`-Repo mit `.gitignore` `*`, `!*/`, `!*.txt`, den Dateien `.terax-copy-x/src/report.txt` und `src/other.txt` und dem Ordner `.hidden`
   WHEN `search_tree` (über `fs_grep_interactive`), `fs_glob_impl` mit `**/*.txt`, `fs_search` mit `report` bei `show_hidden` true und false, `fs_list_files` und `git_non_ignored_names` laufen
   THEN liefert keiner etwas aus `.terax-copy-x`, `src/other.txt` wird gefunden, und bei `show_hidden = true` enthält `git_non_ignored_names` `.hidden`, aber nicht `.terax-copy-x`
   [Source: MIG-76, OB-28, OB-31]

22) GIVEN eine Wurzel mit `node_modules/x`, `.terax-copy-x/x` und `keep.txt`
   WHEN `fs_search` und `fs_list_files` laufen
   THEN liefern beide `keep.txt`, aber weder `node_modules/x` noch `.terax-copy-x/x`
   [Source: OB-30]

23) GIVEN der Helper gegen lokales python3 mit `show_hidden = true` und einem Ordner mit `.terax-copy-x/report` und `.hidden`
   WHEN `read_dir`, `list_subdirs`, `search` mit `report` und `grep` laufen
   THEN taucht `.terax-copy-x` in keinem Ergebnis auf und kein Treffer stammt daraus, `.hidden` wird gelistet, und der Pin-Test bestätigt, dass das Helper-Präfix `STAGING_PREFIX` entspricht
   [Source: MIG-19]

24) GIVEN eine `git status`-Ausgabe mit `? .terax-copy-x/report.pdf`, `? docs/.terax-copyright.md`, `? a/.terax-copy-y/b.txt`, einem Index-Eintrag `1 A. …` für `.terax-copy-x/report.txt` und einem `2 `-Eintrag mit Staging-Segment, gefolgt von einem normalen Eintrag
   WHEN der Parser sie liest
   THEN fallen nur die beiden ungetrackten Staging-Einträge weg; `docs/.terax-copyright.md`, der Index-Eintrag und die beiden letzten Einträge bleiben mit korrekter Token-Ausrichtung
   [Source: MIG-75, OB-29]

25) GIVEN ein Scratch-Repo mit liegendem Staging-Rest `.terax-copy-x/report.txt`
   WHEN der User im Terminal `git add -A` ausführt und im Source-Control-Panel committet
   THEN war der Rest vor dem `git add` im Panel unsichtbar, danach als gestagt sichtbar, und `git show --stat` enthält genau die gezeigten Pfade
   [Source: OB-29]
   [Prüfweg: QA]

26) GIVEN `showHidden = true`, ein Quellordner mit 2.000 Dateien, lokal und per SSH, sowie ein künstlich angelegter Rest `.terax-copy-x/` auch im Whitelist-Repo aus AC 21
   WHEN der Ordner eingefügt wird
   THEN zeigen Explorer-Baum, Explorer-Suche, Inhaltssuche, Unterordner-Menü der Statusleiste, Source-Control-Panel und Git-Farben weder einen Staging-Ordner noch etwas Halbes, nach Abschluss ist das Staging weg, und die UI bleibt während der Kopie bedienbar
   [Source: OB-21, OB-14]
   [Prüfweg: QA]

27) GIVEN ein lokaler Workspace `/tmp/ws` mit markiertem, zugeklapptem Ordner `docs` und im Finder kopierten Dateien `a.txt` und `b.txt`
   WHEN der User mit Fokus im Explorer ⌘V drückt
   THEN liegen `docs/a.txt` und `docs/b.txt` an, `docs` ist aufgeklappt und `docs/a.txt` ausgewählt und in Sicht
   [Source: FL-1, FL-2, FL-3, FL-4, UI-2, UI-6, TG-1, TR-1, TR-3, ST-3, OB-22]
   [Prüfweg: QA]

28) GIVEN `created` mit `/ws/docs/a.txt` und `/ws/docs/b.txt` für den zugeklappten Ordner `/ws/docs`
   WHEN `FileExplorer` das Ergebnis übernimmt
   THEN setzt er die Auswahl erst, wenn `/ws/docs` geladen und aufgeklappt ist und `created[0]` der Baum-Schlüsselform aus `joinPath` entspricht; `/ws/docs/a.txt` bleibt ausgewählt
   [Source: UI-6, SVC-6, OB-22]

29) GIVEN die Wurzel `/ws`
   WHEN `pasteTargetDir` mit markiertem Ordner `/ws/docs`, mit markierter Datei `/ws/docs/x.md`, ohne Markierung, aus dem Flächen-Menü und aus dem Zeilen-Menü von Ordner `/ws/b` bei markierter Datei `/ws/a.md` aufgerufen wird
   THEN ergibt sich `/ws/docs`, `/ws/docs`, `/ws`, `/ws` und `/ws/b`
   [Source: BR-5, SVC-5, OB-24]

30) GIVEN der Explorer-Container mit Fokus und Wurzel `/ws`
   WHEN ⌘V, ⌘⇧V, ⌘⌥V und Ctrl+V gedrückt werden, ⌘V in einem Eingabefeld, während Umbenennen, Anlegen oder Suche, ohne Wurzel, bei leerem Baum und ein zweites ⌘V während eines laufenden Einfügens
   THEN löst nur ⌘V aus, auch bei leerem Baum; alle anderen Fälle werden nicht behandelt
   [Source: VAL-7, BR-8, UI-2, EP-5, ST-2]

31) GIVEN `hello` als Text in der Zwischenablage
   WHEN der User mit Fokus im Terminal bzw. im Editor ⌘V drückt
   THEN erhält das Terminal bzw. der Editor `hello`, und der Explorer startet kein Einfügen
   [Source: BR-8, NFR-6]
   [Prüfweg: QA]

32) GIVEN `fs_clipboard_paths` liefert `[]`
   WHEN `pasteClipboardFiles` läuft
   THEN erscheint der Toast `No files on the clipboard`, `fs_copy` wird nicht aufgerufen, und der Explorer bleibt in `paste_idle`
   [Source: EP-1, UI-3, TR-2]

33) GIVEN `fs_copy` liefert `created` mit einem Pfad und in `failed` zuerst `/x/gone.txt` mit `No such file or directory` und dazu einen zweiten Fehler
   WHEN `pasteClipboardFiles` das Ergebnis auswertet
   THEN erscheint der Fehler-Toast `Could not copy 2 items` mit Beschreibung `/x/gone.txt: No such file or directory` (bei einem Fehler `Could not copy 1 item`), der Zielordner wird neu eingelesen, und der eine angelegte Pfad wird zurückgegeben
   [Source: UI-4, EP-2, TR-4, ST-4]

34) GIVEN `fs_copy` scheitert mit `copy at most 1024 items at a time`, `fs_clipboard_paths` scheitert mit `clipboard read timed out or was cancelled` bzw. alle Elemente stehen in `failed`
   WHEN `pasteClipboardFiles` läuft
   THEN erscheint `Paste failed: copy at most 1024 items at a time`, `Paste failed: clipboard read timed out or was cancelled` bzw. der Teilfehler-Toast ohne Auswahl; nach einem Gesamtfehler von `fs_copy` wird der Zielordner neu eingelesen
   [Source: EP-3, UI-5, TR-5, ST-5]

35) GIVEN ein laufendes Einfügen in die Wurzel `/ws-a`
   WHEN vor dem Ergebnis die Wurzel auf `/ws-b` wechselt und `isCurrent` damit falsch ist
   THEN wird nichts ausgewählt und nichts aufgeklappt, Fehler-Toasts erscheinen trotzdem
   [Source: EP-4, TR-6]

36) GIVEN ein lokaler Workspace mit Datei `a.md` und Ordner `b`
   WHEN der User das Kontextmenü einer Zeile und das der freien Fläche öffnet und `Paste` wählt, einmal während ein Einfügen läuft und einmal danach
   THEN zeigen beide Menüs `Paste` mit Hinweis `⌘V`; während des laufenden Einfügens bleibt die Wahl ohne Wirkung, danach fügt sie nach BR-5 ein
   [Source: UI-1, TG-2, ST-1, MIG-22]
   [Prüfweg: QA]

37) GIVEN ein Drop-Ereignis mit `/tmp/a.txt` über dem Ordner `/ws/docs`
   WHEN `useExplorerFileDrop` `fs_copy` ruft und das Ergebnis einen Eintrag in `failed` enthält bzw. die Rejection `boom` kommt
   THEN wird `fs_copy` mit `renameOnConflict: true` und `destDir` `/ws/docs` gerufen, der Teilfehler erscheint als `Could not copy 1 item`, die Rejection als `Copy failed: boom`, und der Ordner wird neu eingelesen
   [Source: UI-7, SVC-6, MIG-23]

38) GIVEN ein lokaler Workspace mit `docs/a.txt` und ein SSH-Workspace auf `litha-claude` mit `docs/a.txt`
   WHEN der User `a.txt` aus dem Finder lokal auf `docs` zieht bzw. im SSH-Workspace mit markiertem `docs` per ⌘V einfügt
   THEN entsteht jeweils `docs/a copy.txt`, und die Zielmarkierung beim Ziehen bleibt wie bisher
   [Source: FL-5, TG-3, BR-2]
   [Prüfweg: QA]

**Nicht in diesem Slice**

- Kein Einfügen von Text oder Bildern; keine Zwischenablage unter Linux/Windows außer dem Fehlertext (architecture.md Q&A #11).
- Keine Mehrfachauswahl; ausgewählt wird nur das erste angelegte Element (Q&A #4).
- Aus der Upstream-Batch-Härtung nur der No-Replace-Rename; keine Watcher- oder Index-Änderungen (`fd21291`, `39fa919`).
- `useExplorerFileDrop.ts` behält die Zielregel `dirAt` und bekommt keinen `enabled`-Schalter.
- In `FileExplorer.tsx` bleiben Icon-Rümpfe und `visible`-Durchreichung aus slice-00 unverändert; `Cargo.toml` und `Cargo.lock` werden nicht geändert.
- Index-Einträge `1 `, `2 `, `u ` und `git_diff` bleiben ungefiltert; die Ausnahmen des Sweep-Kriteriums bleiben ohne Prädikat.
- Kein Eintrag in `TERAX.md` (slice-06).

**Wie gebaut**

- Merge: PR #84, Squash-Commit `8934207` auf `main`.
- Review: Pipeline-Reviewer ohne Befunde; `/code-review high` 27 Runden, ab Runde 20 keine High-Befunde mehr. Schluss nach Runde 27 auf Entscheidung des Users (zwei Punkte gefixt, Rest als bekannte Grenzen im PR).
- Abweichungen vom Plan:
  - AC19/OB-3: Transportfehler über SSH je Element, nach dem ersten Timeout bricht der Rest der Charge ab; Staging bleibt nach Timeout stehen, nach Failed/Killed wird es gelöscht. `CopyFailure.maybePlaced` meldet „may already be in place“, der Explorer liest den Zielordner dann trotzdem neu.
  - Helper-Ops `mkstage`, `write_bytes` (Zeitbudget 30 s plus 1 s je 64 KiB), `publish` mit Kandidatenliste (64 Namen); Remote-Befehl endet mit `; exit`.
  - `fs_watch`-Vertrag: Watcher nicht rekursiv, Staging-Filter nur für Eintrag und Elternordner, nie für den geöffneten Wurzelordner.
  - `joinPath`-Form aus `lib/paths.ts`; gemeinsamer `rereadAfterCopy` für Einfügen und Drop.
  - Pakete behalten ihre Endung (`Foo copy.app`); Sockets/FIFOs werden übersprungen.
  - Pasteboard wird auf einem Blocking-Worker mit 5 s Budget gelesen.
  - Lokale Ordner werden ohne Link-Folgen geöffnet (O_NOFOLLOW, dev/ino-Prüfung).
  - Frühes Leeren des Edit-Zustands zurückgenommen, Upstream-Reihenfolge (Tie-Break).
- Dokumentierte Restrisiken: siehe `evidence/slice-01-clipboard-paste.json` und PR #84.

### slice-02-media-pause: Fenster-Sichtbarkeit und Media-Pause

| Key | Value |
|-----|-------|
| **Dateibereich** | `src/lib/windowVisibility.ts`, `src/lib/windowVisibility.test.ts`, `src/lib/windowVisibility.guard.test.ts`, `src/main.tsx`, `src/modules/editor/lib/mediaPlayback.ts`, `src/modules/editor/lib/mediaPlayback.test.ts`, `src/modules/editor/MediaPreview.tsx`, `src/modules/editor/MediaPreview.test.tsx`, `src/modules/editor/EditorPane.tsx`, `src/modules/editor/EditorStack.tsx`, `src/modules/editor/EditorStack.window-hidden.test.tsx`, `src/modules/theme/SurfaceLayer.tsx`, `src/modules/statusbar/lib/useClaudeStatus.ts`, `src/modules/statusbar/lib/useClaudeStatus.test.tsx`, `src/modules/agents/components/SshAgentActivityPoller.tsx`, `src/modules/spaces/lib/useSpacePersistence.ts`, `src/modules/terminal/lib/useTerminalSession.ts` |
| **Abhängigkeiten** | `[slice-01-clipboard-paste]` |
| **Anforderungen** | `UI-9, ST-6, ST-7, TR-7, TR-8, BR-12, TG-4, SVC-7, SVC-8, MIG-9, MIG-25, MIG-26, MIG-27, MIG-28, MIG-29, MIG-30, MIG-31, MIG-32, MIG-33, MIG-34, MIG-35, MIG-36, MIG-37, MIG-38, MIG-39, OB-11, OB-17, OB-18, OB-23` |

**Ziel.** Ein zentraler Zustand „Fenster unsichtbar“ (minimiert, vollständig verdeckt, anderer Space; Fokus zählt nicht) wird Owner aller gleichbedeutenden Sichtbarkeits-Stellen und setzt `data-window-hidden` am `html`-Element. Video- und Audio-Previews pausieren und verschwinden bei inaktivem Tab, pausieren bei unsichtbarem Fenster und starten nie von selbst (Discovery Slice 2).

**Deliverables**

- `src/lib/windowVisibility.ts` nach SVC-7 und MIG-25 vervollständigt, der Getter `isWindowHidden` aus slice-00 bleibt Vertrag; einmalige Installation in `src/main.tsx` vor dem ersten Rendern (MIG-28); Tests `windowVisibility.test.ts` (MIG-26) und Quelltext-Guard `windowVisibility.guard.test.ts` mit der Allowlist aus dem Sweep-Kriterium „Fenster-Sichtbarkeit“ (MIG-27).
- Media nach SVC-8: `mediaPlayback.ts` (MIG-29, Klassifikation bleibt `binaryPreview.ts`) mit Test (MIG-30), `MediaPreview.tsx` (MIG-31) mit Test (MIG-32), `EditorPane.tsx` mit Prop `visible` und `MediaPreview` (MIG-9), `EditorStack.tsx` reicht `visible` weiter (MIG-33), Test `EditorStack.window-hidden.test.tsx` (MIG-34).
- Migration ohne Verhaltensänderung (INV-23): `SurfaceLayer.tsx` (MIG-35), `useClaudeStatus.ts` (MIG-36), `SshAgentActivityPoller.tsx` (MIG-37), `useSpacePersistence.ts` (MIG-38), `useTerminalSession.ts` (MIG-39).

**Liefert**

| Vertrag | Signatur | Datei | Konsumenten |
|---------|----------|-------|-------------|
| `subscribeWindowHidden` | `(listener: (hidden: boolean) => void) => () => void`; benachrichtigt synchron im selben `visibilitychange`-Dispatch, funktioniert auch vor der Installation | `src/lib/windowVisibility.ts` | `useSpacePersistence.ts`, `useTerminalSession.ts` |
| `useWindowHidden` | React-Hook `() => boolean` über `useSyncExternalStore` | `src/lib/windowVisibility.ts` | `MediaPreview.tsx`, `SurfaceLayer.tsx` |
| `installWindowVisibility` | `() => void`, idempotent, Startwert aus `document.visibilityState` | `src/lib/windowVisibility.ts` | `src/main.tsx` |
| `data-window-hidden` | Attribut am `html`-Element, gesetzt genau solange das Fenster unsichtbar ist | `src/lib/windowVisibility.ts` | slice-03-animations |
| `MediaPreview` | Komponente für Video/Audio mit `tabVisible` und `windowHidden`, `controls`, `preload="metadata"`, Klasse `hidden` nur bei inaktivem Tab | `src/modules/editor/MediaPreview.tsx` | `EditorPane.tsx` |

**Braucht**

| Vertrag | von Slice |
|---------|-----------|
| `isWindowHidden` | slice-00-core-picks |

**Akzeptanzkriterien**

1) GIVEN `windowVisibility` installiert, `document.visibilityState` ist `visible`
   WHEN der Zustand auf `hidden` wechselt und `visibilitychange` feuert, danach zurück auf `visible`
   THEN liefert `isWindowHidden()` erst `true`, dann `false`, `html` trägt `data-window-hidden` nur dazwischen, und ein Abonnent wird genau zweimal benachrichtigt, mit `true` und mit `false`
   [Source: SVC-7, TR-7, TR-8, ST-6, ST-7, MIG-25]

2) GIVEN ein sichtbares Fenster
   WHEN `blur` und `focus` am `window` feuern
   THEN bleibt `isWindowHidden()` `false`, es gibt kein Attribut und keine Benachrichtigung
   [Source: SVC-7, TG-4]

3) GIVEN ein Abonnent
   WHEN ein `visibilitychange`-Event mit Zustand `hidden` synchron ausgelöst wird
   THEN ist der Abonnent vor der Rückkehr von `dispatchEvent` aufgerufen, ohne Microtask und ohne `requestAnimationFrame`
   [Source: OB-11]

4) GIVEN ein Start mit `document.visibilityState` `hidden` (Hauptfenster startet mit `"visible": false`)
   WHEN `installWindowVisibility()` läuft und das Fenster danach gezeigt und später minimiert wird
   THEN ist der Startwert `true` mit Attribut, das Zeigen ist ein normaler Wechsel ohne Flush der Space-Persistenz, und das Minimieren löst genau einen Flush aus
   [Source: OB-17]

5) GIVEN ein Abo auf Modul-Ebene vor `installWindowVisibility()`, wie in `useTerminalSession.ts`
   WHEN später `visibilitychange` mit `hidden` feuert
   THEN erhält das Abo den Wechsel, und der Getter lieferte schon vor der Installation den aktuellen Dokumentzustand
   [Source: OB-23]

6) GIVEN `clip.mp4` spielt im Editor-Tab A
   WHEN der User auf Tab B wechselt, im Hintergrund Play ausgelöst wird und er zurück auf A wechselt
   THEN ist das Video im Hintergrund pausiert und ausgeblendet (Klasse `hidden`), das Play wird sofort zurückgenommen, und auf A ist es sichtbar, aber weiter pausiert
   [Source: BR-12, SVC-8, UI-9, MIG-29, MIG-31, MIG-33]

7) GIVEN `song.mp3` spielt im aktiven Editor-Tab
   WHEN das Fenster unsichtbar und danach wieder sichtbar wird
   THEN pausiert das Audio, bleibt sichtbar ohne Klasse `hidden` und läuft erst nach Play weiter
   [Source: BR-12, SVC-8, MIG-9]

8) GIVEN die Dev-Instanz (eigener `identifier`), ein Video spielt
   WHEN das Fenster minimiert, vollständig verdeckt bzw. auf einen anderen Space verschoben wird und ein Browser-Fenster daneben den Fokus bekommt
   THEN pausiert das Video in allen drei Unsichtbar-Fällen (Protokoll je Fall), beim reinen Fokuswechsel spielt es weiter
   [Source: OB-18, TG-4, UI-9]
   [Prüfweg: QA]

9) GIVEN eine probeweise eingefügte Zeile mit `document.hidden` in `src/modules/tabs/TabBar.tsx`
   WHEN `pnpm test` läuft
   THEN schlägt `windowVisibility.guard.test.ts` mit dieser Datei fehl; ohne die Zeile ist er grün, Treffer gibt es nur in `windowVisibility.ts` und `terminal/lib/rendererPool.ts`
   [Source: MIG-27]

10) GIVEN die Dev-Instanz mit SSH-Tab, Claude-Status-Widget und zwei Spaces
   WHEN das Fenster minimiert wird und wieder erscheint
   THEN ruhen Claude-Status-Poll, SSH-Agent-Poller und tmux-cwd-Poll, die Space-Persistenz schreibt einmal, PTY-Sichtbarkeitshinweise gehen neu an Rust, und danach laufen alle wieder wie vor slice-02 (INV-23)
   [Source: --]
   [Prüfweg: QA]

**Nicht in diesem Slice**

- Keine CSS-Pause und keine Stufen-Animationen (slice-03); `rendererPool.ts`, Cursor-Blinken und `useWindowFocus.ts` bleiben fokusgekoppelt (INV-18).
- Kein nativer Verdeckungs-Hinweis aus Rust; fehlt ein Unsichtbar-Fall im e2e, ist das ein Befund für eine Nachbesserung.
- Keine zweite Endungs-Liste, Upstream `mediaPreview.ts` wird nicht übernommen (architecture.md Q&A #16); Bilder und PDF bleiben unverändert.
- `App.tsx` wird nicht geändert (Poll-Guard schon in slice-00); `EditorPaneHandle.save` bleibt wie in slice-00.
- Kein Hinweis in `TERAX.md` (slice-06).

**Wie gebaut**

- Merge: PR #85, Squash-Commit `25b970e` auf `main`.
- Review: `/code-review high` 3 Runden (vereinbarte Obergrenze). Gefixt: Vollbild und Bild-in-Bild laufen weiter, Live-Fensterzustand beim Verlassen des Vollbilds, Kommentarregel.
- Abweichungen vom Plan:
  - `App.tsx` angefasst (nur tmux-cwd-Poll-Guard), wie im „Wie gebaut“ von slice-00 erlaubt.
  - `MediaPreview` liest `useWindowHidden` nicht selbst; die Bindung in `mediaPlayback.ts` abonniert `subscribeWindowHidden` und liest den Zustand live.
  - Vollbild und Bild-in-Bild heben Tab- und Fenster-Sperre auf (über Upstream hinaus, sonst unbenutzbar).
  - Upstream `mediaPreview.ts` nicht übernommen, Klassifikation bleibt `binaryPreviewMode` (Q&A #16).
  - `rendererPool` behält seinen eigenen Listener (Allowlist im Guard-Test).
- Offen für QA und dokumentierte Grenzen: siehe `evidence/slice-02-media-pause.json` und PR #85.

### slice-03-animations: Animationen in Stufen und Pause bei unsichtbarem Fenster

| Key | Value |
|-----|-------|
| **Dateibereich** | `src/styles/globals.css`, `src/styles/motionBudget.test.ts` |
| **Abhängigkeiten** | `[slice-02-media-pause]` |
| **Anforderungen** | `FL-6, FL-7, UI-8, BR-9, BR-10, BR-15, SVC-9, MIG-40, MIG-41` |

**Ziel.** Endlos-Animationen (Spinner, Pulse, Shimmer) laufen in Stufen statt flüssig und pausieren nur, solange das Fenster unsichtbar ist; Fokusverlust allein pausiert nichts (Discovery Slice 5). Die Leerlauf-CPU wird vorher und nachher gemessen.

**Deliverables**

- `globals.css` nach SVC-9 und MIG-40: `@theme`-Überschreibung `--animate-spin` und `--animate-pulse` mit `steps()`, Shimmer mit `steps()`, Pause-Regel unter `html[data-window-hidden]`, Reduced-Motion-Block unverändert; zusätzlich `@keyframes terax-icon-in` und `.terax-icon-in` mit Dauer `--dur-fast` für slice-05.
- `motionBudget.test.ts` nach MIG-41 (Vorlage `f6f0004` ohne die Fälle `terax-blink` und `terax-attention-pulse`).

**Liefert**

| Vertrag | Signatur | Datei | Konsumenten |
|---------|----------|-------|-------------|
| `.terax-icon-in` | CSS-Klasse mit endlicher Einblend-Animation `terax-icon-in`, Dauer `--dur-fast`, unter Reduced-Motion über die Token genullt | `src/styles/globals.css` | slice-05-lazy-start (`FileIcon.tsx`) |

**Braucht**

| Vertrag | von Slice |
|---------|-----------|
| `data-window-hidden` | slice-02-media-pause |

**Akzeptanzkriterien**

1) GIVEN `globals.css` nach slice-03
   WHEN `motionBudget.test.ts` alle `infinite`-Animationen auswertet
   THEN hat jede `steps()`, `--animate-spin`, `--animate-pulse` und `terax-shimmer` stehen als `infinite` mit `steps()` in `globals.css`, und die Pause-Regel hängt an `data-window-hidden`, nicht an einem Fokus-Attribut
   [Source: BR-10, SVC-9, MIG-40]

2) GIVEN eine probeweise ergänzte Regel `animation: x 1s linear infinite` ohne `steps()` in `globals.css`
   WHEN `pnpm test` läuft
   THEN schlägt `motionBudget.test.ts` fehl
   [Source: BR-10]

3) GIVEN `.terax-icon-in` in `globals.css`
   WHEN die Regel ausgewertet wird
   THEN ist die Animation endlich (kein `infinite`) und nutzt `--dur-fast`, das unter `prefers-reduced-motion` auf 0.01 ms steht
   [Source: MIG-40]

4) GIVEN die Dev-Instanz mit laufendem Agent, sichtbarem Tab-Spinner, Mission-Control-Spinner und Shimmer sowie einem laufenden Video
   WHEN das Fenster minimiert, vollständig verdeckt bzw. auf einen anderen Space verschoben wird und danach wieder sichtbar ist
   THEN stehen alle Animationen und das Video ist pausiert; danach laufen die Animationen an derselben Stelle weiter, das Video bleibt pausiert bis Play
   [Source: FL-6, FL-7, BR-9, UI-8]
   [Prüfweg: QA]

5) GIVEN Terax sichtbar neben einem Browser, Fokus im Browser
   WHEN ein Agent in einem Hintergrund-Tab arbeitet
   THEN dreht der Tab-Spinner weiter, sichtbar in Stufen statt flüssig
   [Source: BR-9, UI-8]
   [Prüfweg: QA]

6) GIVEN `prefers-reduced-motion: reduce`
   WHEN ein Agent läuft
   THEN bleibt der Shimmer aus wie vor slice-03 (INV-17)
   [Source: BR-10]
   [Prüfweg: QA]

7) GIVEN eine Messinstanz aus gebautem Frontend (`pnpm tauri build --debug`, eigener `identifier`) mit 10 Tabs, davon 3 mit laufendem Claude-Code-Agent
   WHEN je vor und nach slice-03 60 s lang im Sekundentakt die CPU von `terax` und den zugeordneten WebContent-Prozessen gesampelt wird, einmal mit sichtbarem, einmal mit verdecktem Fenster
   THEN nennt der PR die Mediane vorher und nachher je Zustand samt PIDs; liegt die Differenz im Rauschen, heißt das Stück im PR „ohne messbaren Effekt“; danach zeigt `ps` keine zurückgebliebene Lastschleife
   [Source: BR-15]
   [Prüfweg: QA]

**Nicht in diesem Slice**

- Keine JS-Animationen, `usePresence.ts` bleibt (architecture.md Q&A #24); kein `surfaceFrame.ts`, kein `data-window-inactive`.
- Keine Upstream-Klassen `terax-blink` und `terax-attention-pulse`.
- `windowVisibility.ts` und Media bleiben wie in slice-02.
- `FileIcon` nutzt `.terax-icon-in` erst ab slice-05.

**Wie gebaut**

_(leer bis zum Merge)_

### slice-04-visible-consumers: Watcher und git status nur für sichtbare Konsumenten

| Key | Value |
|-----|-------|
| **Dateibereich** | `src/modules/sidebar/useSidebarPanel.ts`, `src/modules/sidebar/useSidebarPanel.test.ts`, `src/modules/explorer/lib/watchRegistry.ts`, `src/modules/explorer/lib/watchRegistry.test.ts`, `src/modules/explorer/lib/useFileTree.ts`, `src/modules/source-control/statusConsumers.ts`, `src/modules/source-control/statusConsumers.test.ts`, `src/modules/source-control/useSourceControlContext.ts`, `src/modules/source-control/useSourceControl.ts`, `src/modules/source-control/useSourceControl.test.ts`, `src/modules/statusbar/layout.ts`, `src/modules/statusbar/layout.test.ts`, `src/app/App.tsx` |
| **Abhängigkeiten** | `[slice-03-animations]` |
| **Anforderungen** | `FL-8, FL-9, ST-8, ST-9, TR-9, TR-10, BR-11, BR-13, TG-5, SVC-10, SVC-11, MIG-10, MIG-42, MIG-43, MIG-44, MIG-45, MIG-46, MIG-47, MIG-48, MIG-49, MIG-50, MIG-51, NFR-1, NFR-7, OB-12, OB-19` |

**Ziel.** Der Explorer hält Ordner-Watcher nur, solange er sichtbar ist, und liest beim Wieder-Sichtbarwerden alle geladenen Ordner neu ein; `git status` läuft nur, solange ein Konsument sichtbar ist, und frischt beim Sichtbarwerden genau einmal auf (Discovery Slice 4). Die Ersparnis wird gemessen.

**Deliverables**

- `useSidebarPanel.ts` spiegelt den eingeklappten Zustand als React-Zustand `sidebarCollapsed` (MIG-42, OB-12).
- `watchRegistry.ts` nach SVC-10 und Upstream-Vorlage (MIG-43) mit Test (MIG-44); `useFileTree.ts` wertet `visible` aus, alle Watch-Mutationen inklusive Tot-Ordner-Bereinigung und die Kandidatenquelle laufen über die Registry (MIG-45).
- `statusConsumers.ts` nach SVC-11 inklusive Rail-Badge und Statusleisten-Widgets (MIG-46) mit Test (MIG-47); `GIT_STATUS_WIDGET_IDS` in `statusbar/layout.ts` als einzige Quelle der Liste (MIG-51); `useSourceControl` mit Option `live` (MIG-49) und Test (MIG-50); `useSourceControlContext` mit Konsumenten-Eingaben (MIG-48).
- `App.tsx`: `FileExplorer` bekommt `visible`, `useSourceControlContext` bekommt eingeklappt, Git-Farben-Präferenz, Zen-Modus und Statusleisten-Layout (MIG-10).

**Liefert**

| Vertrag | Signatur | Datei | Konsumenten |
|---------|----------|-------|-------------|
| `sidebarCollapsed` | zusätzlicher Rückgabewert von `useSidebarPanel`, React-Zustand, Startwert aus `readSidebarCollapsed()` vor dem ersten Render | `src/modules/sidebar/useSidebarPanel.ts` | `App.tsx` |
| `GIT_STATUS_WIDGET_IDS` | exportierte Konstante mit `git-branch`, `git-sync`, `git-changes`, `git-staged`, `line-changes` | `src/modules/statusbar/layout.ts` | `statusConsumers.ts` |
| `statusConsumers` | reine Ableitung aus Sidebar-Ansicht, eingeklappt, aktivem Tab-Typ, Git-Farben-Präferenz, Statusleisten-Layout und Zen-Modus mit Ergebnis `live: boolean` | `src/modules/source-control/statusConsumers.ts` | `useSourceControlContext.ts` |
| `useSourceControl.live` | dritter Parameter mit `live` in `useSourceControl(path, enabled, options)` | `src/modules/source-control/useSourceControl.ts` | `useSourceControlContext.ts` |
| `createWatchRegistry` | Registry mit arm/disarm über `fs_watch_add` und `fs_watch_remove` (Upstream-Form) | `src/modules/explorer/lib/watchRegistry.ts` | `useFileTree.ts` |

**Braucht**

| Vertrag | von Slice |
|---------|-----------|
| `FileExplorer.visible` | slice-00-core-picks |
| `useFileTree.visible` | slice-00-core-picks |

**Akzeptanzkriterien**

1) GIVEN eine Registry mit den Ordnern `/ws` und `/ws/src`
   WHEN sie zweimal entschärft wird, im entschärften Zustand `/ws/lib` hinzukommt und `/ws/src` entfällt und sie danach zweimal scharf geschaltet wird
   THEN gibt es beim Entschärfen genau zwei native Freigaben, im entschärften Zustand keinen nativen Aufruf und beim Scharfschalten genau je ein `fs_watch_add` für `/ws` und `/ws/lib`
   [Source: SVC-10, MIG-43]

2) GIVEN ein Explorer mit geladenen Ordnern `/ws` und `/ws/src`
   WHEN `visible` auf `false` und danach auf `true` wechselt
   THEN gibt es im verborgenen Zustand keine Explorer-Watches und kein Neu-Einlesen bei `fs:changed`, beim Sichtbarwerden werden genau diese Ordner wieder beobachtet und beide neu eingelesen; `useFileTree.ts` ruft `watchAdd` und `watchRemove` nicht mehr direkt
   [Source: BR-11, MIG-45, TR-9, TR-10, ST-8, ST-9]

3) GIVEN `localStorage` `terax.sidebar.collapsed` mit Wert `"1"`
   WHEN die App startet
   THEN ist `sidebarCollapsed` schon beim ersten Render `true`, und der Explorer registriert beim Start keinen Watch
   [Source: MIG-42, OB-12]

4) GIVEN die Dev-Instanz, Explorer offen auf `/ws` mit aufgeklapptem `/ws/src`, `notes.md` in einem Editor-Tab offen
   WHEN die Sidebar zugeklappt wird, extern `/ws/src/new.txt` entsteht und `notes.md` geändert wird, und die Sidebar wieder aufgeht
   THEN decken die gezählten `fs_watch_remove` alle Explorer-Pfade, der Editor-Tab erkennt die Änderung an `notes.md` trotzdem (INV-13), und nach dem Aufklappen zeigt der Baum `new.txt`
   [Source: FL-8, FL-9, NFR-7, TG-5]
   [Prüfweg: QA]

5) GIVEN `statusConsumers`
   WHEN die Eingaben einzeln variiert werden
   THEN ist der Status live bei offener Sidebar (Rail-Badge, damit auch Panel und Explorer mit Git-Farben), bei aktivem Git-Tab `git-diff`, `git-history` oder `git-commit-file` und bei eingeblendeter Statusleiste mit einem der fünf Git-Widgets; nicht live bei zugeklappter Sidebar, Terminal-Tab und Layout ohne Git-Widget sowie im Zen-Modus mit zugeklappter Sidebar ohne Git-Tab, auch wenn `git-branch` im Layout steht
   [Source: BR-13, SVC-11, MIG-46, MIG-51]

6) GIVEN `useSourceControl` mit `live = false`
   WHEN das Fenster dreimal den Fokus bekommt und danach `live` auf `true` wechselt
   THEN gibt es bis zum Wechsel keinen `git status`-Aufruf und beim Wechsel genau einen; mit `live = true` frischt der Fokus wie bisher auf
   [Source: SVC-11, MIG-49]

7) GIVEN `App.tsx` nach slice-04
   WHEN Sidebar, Ansicht, aktiver Tab, Git-Farben-Präferenz, Zen-Modus oder Statusleisten-Layout wechseln
   THEN bekommt `FileExplorer` `visible` gleich „Sidebar nicht eingeklappt“, `useSourceControlContext` die Konsumenten-Eingaben und reicht `live` an `useSourceControl` weiter; der Git-Graph-Kontext nutzt einen Snapshot nur, wenn live; der Status-Pfad bleibt wie bisher (INV-15)
   [Source: MIG-10, MIG-48]

8) GIVEN eine Messinstanz aus gebautem Frontend mit eigenem `identifier`, 10 Tabs, davon 3 mit laufendem Agent, und ein Zähler-Wrapper über `git_status`, `git_panel_snapshot` und `fs_watch_*` in der Test-Bridge
   WHEN 60 s lang mit sichtbarem Fenster, zugeklappter Sidebar, aktivem Terminal-Tab und Statusleiste ohne Git-Widgets gemessen wird, mit fünf Fokuswechseln, danach die Sidebar aufgeht, und zusätzlich die CPU vor und nach slice-04 bei sichtbarem, verdecktem und minimiertem Fenster gesampelt wird
   THEN gibt es bis zum Aufklappen 0 Git-Status-Läufe und 0 Explorer-Watches, danach genau einen Lauf; der PR nennt diese Zahlen, die CPU-Mediane vorher und nachher nach BR-15 und die zugeordneten WebContent-PIDs
   [Source: NFR-1, OB-19]
   [Prüfweg: QA]

**Nicht in diesem Slice**

- Kein Abschalten des Drop-Listeners bei verborgenem Explorer; `useExplorerFileDrop.ts` bleibt bei slice-01.
- `FileExplorer.tsx` bleibt unverändert (Prop und Durchreichung aus slice-00).
- Rust-Watcher (`watch.rs`) und Editor-Watches bleiben unverändert (INV-13).
- Keine Änderung an `StatusBar.tsx`, `GitWidgets.tsx`, `SidebarRail.tsx`; das Standard-Layout zeigt weiter `git-branch` und `git-sync`, Git-Status bleibt damit per Default live.
- Settings-Webview schließen und Vibrancy-Default aus `f6f0004` bleiben out of scope.

**Wie gebaut**

_(leer bis zum Merge)_

### slice-05-lazy-start: Lazy-Start mit Build-Budget

| Key | Value |
|-----|-------|
| **Dateibereich** | `src/modules/explorer/lib/iconResolver.ts`, `src/modules/explorer/lib/iconResolver.test.ts`, `src/modules/explorer/lib/iconEngine.ts`, `src/modules/explorer/lib/iconEngine.test.ts`, `src/modules/explorer/FileIcon.tsx`, `src/modules/explorer/FileIcon.test.tsx`, `src/modules/tabs/TabBar.tsx`, `src/modules/git-history/GitHistoryPane.tsx`, `src/modules/explorer/ExplorerSearch.tsx`, `src/modules/command-palette/CommandPalette.tsx`, `src/modules/explorer/TreeRow.tsx`, `src/modules/source-control/SourceControlPanel.tsx`, `src/modules/ai/components/FilePicker.tsx`, `vite.config.ts`, `src/app/eager-budget.test.ts`, `src/app/dist-budget.test.ts`, `scripts/dist-graph.mjs`, `scripts/dist-graph.d.mts`, `scripts/eager-graph.mjs`, `.size-limit.json` |
| **Abhängigkeiten** | `[slice-03-animations, slice-04-visible-consumers]` |
| **Anforderungen** | `BR-18, SVC-14, SVC-15, MIG-11, MIG-52, MIG-53, MIG-54, MIG-55, MIG-56, MIG-57, MIG-58, MIG-59, MIG-60, MIG-61, MIG-62, MIG-63, MIG-64, MIG-65, MIG-66, NFR-2, NFR-5, OB-5, OB-20` |

**Ziel.** Weder Hauptfenster noch Einstellungsfenster laden beim Start AI-SDK, `zod`, Streamdown, CodeMirror oder das Icon-Set; das Icon-Set kommt beim ersten Icon nach, und ein Build-Test auf dem gebauten Output verhindert Rückfälle (Discovery Slice 6). Startbytes und Startzeit werden vorher und nachher gemessen.

**Deliverables**

- Icons nach SVC-14: `iconResolver.ts` als Lader mit dynamischem `import()`, Cache und Abo (MIG-52), `iconEngine.ts` mit Test (MIG-53), `FileIcon`/`FolderIcon` mit Platzhalter und `.terax-icon-in` (MIG-54); die sieben übrigen Aufrufer auf die Komponenten: `TabBar.tsx` (MIG-55), `GitHistoryPane.tsx` (MIG-56), `ExplorerSearch.tsx` (MIG-57), `CommandPalette.tsx` (MIG-58), `TreeRow.tsx` (MIG-59), `SourceControlPanel.tsx` (MIG-60), `FilePicker.tsx` (MIG-61); `iconResolver.test.ts` auf die nachladende API umgeschrieben (MIG-11).
- Build nach SVC-15: Chunk-Strategie `codeSplitting.groups` in `vite.config.ts` nach MIG-62 (eager vor lazy, Fork-Gruppe `xterm` bleibt eager, keine Ghostty-Gruppe); `eager-budget.test.ts` um Icon-Set und Icon-Dateien (MIG-63, OB-5); `dist-budget.test.ts` ohne den App-Lab-Fall, dafür mit Lezer-Fall aus `bf7e03d` (MIG-64); `scripts/dist-graph.mjs` (MIG-65) und `scripts/dist-graph.d.mts` (MIG-66); in `.size-limit.json` nur die Pfade.

**Liefert**

| Vertrag | Signatur | Datei | Konsumenten |
|---------|----------|-------|-------------|
| `Build-Test Lezer-Kopie` | Testfall in `dist-budget.test.ts`: genau eine `@lezer/highlight`-Kopie im gebauten Output, rot ab zwei Kopien | `src/app/dist-budget.test.ts` | slice-06-deps-version |
| `dist-graph.mjs` | Analyse eines gebauten `dist/`: Startgraph und Startbytes je Fenster (`index.html`, `settings.html`) | `scripts/dist-graph.mjs` | `dist-budget.test.ts`, Messung NFR-2 |

**Braucht**

| Vertrag | von Slice |
|---------|-----------|
| `.terax-icon-in` | slice-03-animations |
| `FileIcon` | slice-00-core-picks |
| `FolderIcon` | slice-00-core-picks |
| `iconResolver-Vorher-Aufnahme` | slice-00-core-picks |

**Akzeptanzkriterien**

1) GIVEN ein `vite build` mit Sourcemaps in ein Temp-Verzeichnis
   WHEN `dist-budget.test.ts` den Startgraphen von `index.html` und `settings.html` (Entry-Skripte, statische Imports, `modulepreload`) auswertet
   THEN enthält keiner Module aus `@ai-sdk/*`, `ai`, `zod`, `streamdown`, `@codemirror/*`, `@uiw/*`, `@iconify-json/catppuccin`, `fileIcons.ts` oder `folderIcons.ts`, und die schweren Stacks sind über dynamische Importe erreichbar
   [Source: BR-18, SVC-15, MIG-62, OB-5]

2) GIVEN ein probeweise eingefügter statischer Import von `@ai-sdk/anthropic` bzw. von `fileIcons.ts` in `src/main.tsx`
   WHEN `pnpm test` läuft
   THEN schlägt `dist-budget.test.ts` mit dem Paket- bzw. Dateinamen fehl, beim Icon-Import auch `eager-budget.test.ts`
   [Source: BR-18, MIG-63, OB-5]

3) GIVEN der Build nach slice-05 mit `@lezer/highlight` 1.2.3 im Lock
   WHEN der Lezer-Fall die Kopien in den Sourcemaps zählt
   THEN findet er genau eine Kopie und ist grün
   [Source: SVC-15]

4) GIVEN ein App-Start ohne geladenes Icon-Set
   WHEN das erste `FileIcon` mountet und danach weitere Icons in Baum, Tabs und Befehlspalette erscheinen
   THEN gibt es genau einen Abruf des Icon-Chunks, bis dahin einen Platzhalter in derselben Größe, danach das Icon mit `.terax-icon-in` und für weitere Icons keinen weiteren Abruf
   [Source: SVC-14, MIG-52, MIG-54]

5) GIVEN `iconResolver.test.ts` auf die nachladende API umgeschrieben
   WHEN es nach dem Laden die Fälle der Vorher-Aufnahme aus slice-00 prüft
   THEN ergeben sich für alle Datei- und Ordnernamen dieselben Icons wie vorher (INV-20), und `iconEngine.test.ts` deckt die Zuordnung von Name und Endung ab
   [Source: MIG-11, MIG-53]

6) GIVEN der Icon-Chunk lädt nicht
   WHEN Icons gerendert werden
   THEN bleibt der Platzhalter stehen, und `console.error` erscheint genau einmal
   [Source: SVC-14]

7) GIVEN `scripts/dist-graph.mjs` auf dem Build vor und nach slice-05
   WHEN die Startbytes je Fenster ermittelt werden
   THEN sind sie nachher für beide Fenster kleiner, ohne die heute vorgeladenen AI-Chunks `ai-anthropic`, `ai-cerebras` und `ai-sdk-shared` (rund 546 KB), und der PR nennt beide Zahlen je Fenster
   [Source: NFR-2]

8) GIVEN eine Messinstanz aus `pnpm tauri build --debug` mit eigenem `identifier` und Test-Bridge
   WHEN je vor und nach slice-05 fünf Starts vom Navigationsstart bis zum ersten Terminal-Element im DOM gemessen werden
   THEN nennt der PR die Mediane, nachher höchstens so groß wie vorher, und die Build-Art; ein Stück ohne messbaren Effekt wird nach BR-15 als solches benannt
   [Source: NFR-2, OB-20]
   [Prüfweg: QA]

9) GIVEN die Messinstanz nach slice-05
   WHEN der User zum ersten Mal eine `.ts`-Datei öffnet und danach das Einstellungsfenster
   THEN lädt der Editor kurz nach und zeigt die Datei gefärbt, und das Einstellungsfenster öffnet ohne AI- und Editor-Chunks
   [Source: BR-18]
   [Prüfweg: QA]

10) GIVEN `pnpm build` und `pnpm size` nach slice-05
   WHEN die Budgets aus `.size-limit.json` geprüft werden
   THEN sind beide mit unveränderten Grenzwerten grün (540 KB Startpaket, 1650 KB gesamt, gzip), `package.json` hat keine neue Laufzeitabhängigkeit, und der PR nennt die Laufzeit von `dist-budget.test.ts`
   [Source: NFR-5]

**Nicht in diesem Slice**

- Kein Script `check:dist` in `package.json` (Datei gehört slice-06).
- Keine Ghostty-Chunk-Gruppe, keine Deps-Änderung (slice-06), kein Pin von `@lezer/highlight`.
- `FileExplorer.tsx` nutzt die Komponenten seit slice-00 und wird nicht geändert; `globals.css` bleibt bei slice-03.
- Keine `content-visibility` im AI-Chat und keine Agent-Status-Selektoren aus `f6f0004`.

**Wie gebaut**

_(leer bis zum Merge)_

### slice-06-deps-version: Deps auf v0.9.0-Niveau, Lezer-Pin und Version 0.8.7

| Key | Value |
|-----|-------|
| **Dateibereich** | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `TERAX.md`, `src/modules/ai/lib/codeHighlight.test.ts`, `src/modules/editor/lib/languageResolver.test.ts`, `.github/workflows/ci.yml` |
| **Abhängigkeiten** | `[slice-05-lazy-start]` |
| **Anforderungen** | `UI-10, BR-19, BR-20, SVC-16, MIG-2, MIG-24, MIG-67, MIG-68, MIG-69, MIG-70, MIG-71, MIG-72, NFR-8` |

**Ziel.** Hebt die Abhängigkeiten auf v0.9.0-Niveau, pinnt `@lezer/highlight` zentral auf genau eine Kopie (`bf7e03d`), setzt die Version in allen Quellen auf 0.8.7 und schließt die Welle mit allen Gates und der Doku in `TERAX.md` ab (Discovery Slice 7).

**Deliverables**

- Manifeste und Lockfiles nach SVC-16 und der Integrations-Tabelle (architecture.md Constraints & Integrations): `package.json` (MIG-67), `pnpm-workspace.yaml` mit `catalog:` und Override im bestehenden `overrides:`-Block (MIG-68), `pnpm-lock.yaml` per `pnpm install` (MIG-69), `Cargo.toml` mit `dirs = "7"` und 0.8.7, `Cargo.lock` nur per `cargo` (MIG-2), `tauri.conf.json` auf 0.8.7 (MIG-70).
- Tests aus `bf7e03d`: `codeHighlight.test.ts` (MIG-71) und Erweiterung von `languageResolver.test.ts` (MIG-72).
- `TERAX.md` (MIG-24): Command-Liste um `fs::copy::fs_copy` und `fs::clipboard::fs_clipboard_paths`, Notiz „Fenster-Sichtbarkeit nur über `src/lib/windowVisibility.ts`“, Gotcha zur Lezer-Identität aus `bf7e03d`.
- Nur bei Bedarf: dauert `dist-budget.test.ts` über 2 min, eigenes Script `test:dist` in `package.json` und ein CI-Schritt in `ci.yml` (architecture.md Risks & Mitigation).

**Liefert**

| Vertrag | Signatur | Datei | Konsumenten |
|---------|----------|-------|-------------|
| -- | -- | -- | -- |

**Braucht**

| Vertrag | von Slice |
|---------|-----------|
| `Build-Test Lezer-Kopie` | slice-05-lazy-start |

**Akzeptanzkriterien**

1) GIVEN slice-06 ist gemergt
   WHEN `grep -rn "0\.8\.6" package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json` läuft und `Cargo.lock` gelesen wird
   THEN ist das Ergebnis leer, und alle drei Dateien sowie das Paket `terax` in `Cargo.lock` stehen auf `0.8.7`
   [Source: BR-19, MIG-67, MIG-70]

2) GIVEN die Dev-Instanz nach slice-06
   WHEN der User Einstellungen → About öffnet
   THEN steht dort `0.8.7` mit dem eingebetteten Commit
   [Source: UI-10]
   [Prüfweg: QA]

3) GIVEN die Lockfiles nach slice-06
   WHEN `Cargo.lock` und `pnpm-lock.yaml` gelesen und `pnpm install --frozen-lockfile` sowie `cargo check --all-targets --locked` ausgeführt werden
   THEN stehen `dirs` 7.0.0, `tauri` ab 2.12.2 und `reqwest` 0.12.x im Lock, `grep-matcher` fehlt, `react` ab 19.3.0, `vite` ab 8.3.1, `@tauri-apps/api` ab 2.12.3 und `@tauri-apps/cli` ab 2.12.0 sind aufgelöst, beide Befehle sind grün, und `minimumReleaseAge` steht unverändert auf 4320
   [Source: SVC-16, MIG-2, MIG-67]

4) GIVEN `pnpm-workspace.yaml` und `package.json` nach slice-06
   WHEN `pnpm install` den Lock erzeugt und der Lezer-Fall aus slice-05 läuft
   THEN gibt es einen Block `catalog:` mit `@lezer/highlight` 1.2.5 und im bestehenden `overrides:`-Block den Schlüssel `@lezer/highlight` mit `catalog:`, `dompurify`, `react-grab` und `react-doctor` sind unverändert, `package.json` nennt `catalog:` für `@lezer/highlight`, `pnpm-lock.yaml` enthält 1.2.5 genau einmal, und der Lezer-Fall ist grün
   [Source: BR-20, MIG-68, MIG-69]

5) GIVEN `codeHighlight.test.ts` und `languageResolver.test.ts` nach slice-06
   WHEN ein TS-Code-Block mit Schlüsselwort `const`, String `"x"` und Kommentar `// c` im Chat und `.ts`- und `.js`-Dateien in jedem Editor-Theme hervorgehoben werden
   THEN tragen Schlüsselwort, String und Kommentar je eine eigene Hervorhebungsklasse, in jedem Theme
   [Source: BR-20, NFR-8]

6) GIVEN die Dev-Instanz nach slice-06
   WHEN der User `src/app/App.tsx` in drei Editor-Themes öffnet und im Chat ein TS-Code-Block erscheint
   THEN sind Schlüsselwörter, Strings und Kommentare jeweils sichtbar gefärbt
   [Source: NFR-8]
   [Prüfweg: QA]

7) GIVEN slice-06 ist gemergt
   WHEN `pnpm check-types`, `pnpm lint`, `pnpm test`, `cargo test --locked`, `cargo clippy --all-targets -- -D warnings`, `pnpm build` und `pnpm size` laufen und der e2e-Rundgang über die QA-ACs von slice-00 bis slice-05 in der Dev-Instanz wiederholt wird
   THEN sind alle Gates grün, und kein Rundgang-Fall fällt gegenüber seinem Slice zurück
   [Source: SVC-16]

**Nicht in diesem Slice**

- `reqwest` bleibt 0.12 (architecture.md Q&A #14); das Upstream-Feature `macos-private-api` wird nicht übernommen.
- Keine Code-Anpassung in fremden Dateibereichen; braucht ein Update sie (etwa an den `dirs::`-Stellen oder in `vite.config.ts`), stoppt der Slice mit Befund.
- Keine Ghostty-Abhängigkeiten (`wasmparser` u. a.), kein Wechsel auf 0.9.x (BR-19).
- `release.yml` bleibt unverändert; `ci.yml` nur für den Fallback `test:dist`.

**Wie gebaut**

_(leer bis zum Merge)_
