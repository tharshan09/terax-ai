# Plan-Review — Upstream-Sync 0.8.5 (Wellenplan)

Reviewer: frischer Kontext, rein lesend (git log/show/diff/merge-tree, Datei-Reads). Keine Änderungen an Checkout/Refs/Dateien.
Fakten-Stand: merge-base `d77476e`, Fork-main `1dded7f` (HEAD real auf `fix-swipe-clipboard` `1b6d163`, identischer Tree für die geprüften Dateien), upstream/main `5c2f4cd`. git 2.50.1.

## Verdikt: GO-mit-Änderungen

Der Wellen-Rahmen ist tragfähig (W0→W1→W2→W3, Datenverlust-Kette per Hand, Security-Gates erhalten, LSP/Editor-Rework/AI deferred). Aber der Plan hat **drei falsche Annahmen**, die vor Start korrigiert werden müssen: (1) 78a0b3d ist im Fork bereits implementiert → redundant; (2) 85a5653 ist NICHT unabhängig portierbar — sein EditorPane/externalFormat/LSP-Teil hängt an GESKIPPTEN Commits; (3) W1 ist kein „ein sauberer `cherry-pick -x` PR" — nur 3 von 7 Picks landen sauber, 78a0b3d entfällt, 3 brauchen Handarbeit.

---

## Prüfauftrag 1 — Abhängigkeits-Killer (Datenverlust-Kette)

**40a8ef2 (fs):** Der Fork-`file.rs` ist stark divergiert (trusted-Flag, `enforce_read`/`enforce_write`-Jail, `fs_is_pdf`, resolve_path/workspace, Symlink-Refuse). Upstream-Base ist `05dd86c` (schlank). 40a8ef2 hängt an KEINEM geskippten Commit — es sind vier orthogonale fs-Verbesserungen, per Hand auf die Fork-Gates zu setzen:
- `mtime` in `ReadResult::Text` (Fork hat es NICHT — `file.rs:104` gibt nur `{content,size}`). Pflicht für Save-Konflikt-Baseline.
- `fs_write_file` → `Result<u64>` (mtime) statt bisheriger Rückgabe. Für `diskMtimeRef` nach dem Write.
- **`fs_stat` symlink_metadata-Fix = echter Security-Bug im Fork:** `file.rs:292` nutzt `meta.file_type().is_symlink()` auf `std::fs::metadata` (folgt Symlinks) → meldet NIE `Symlink`. Direkt anwendbar, unabhängig.
- `force` + `FORCE_MAX_READ_BYTES` (50 MB) = **Large-File-Feature**, KEIN Datenverlust-Fix → siehe Änderung 5 (optional/deferred).
- `async` = kosmetisch, optional.

**662dbbb:** `useAppCloseGuard.ts` + `CloseDialogs.tsx` sind **base-identisch im Fork** (leere Diffs gg. d77476e) → 3-way sauber. `eol.ts`/`eol.test.ts` neu → additiv. `useDocument.ts` = Handarbeit (Fork-Divergenz, s.u.). **Keine Abhängigkeit von geskippten Commits.** ABER: der `markSaved`→`adoptDiskText`-Teil ist im Fork tot (kein Format-on-Save-Consumer) → weglassen (Änderung 3).

**85a5653 — HIER ist der Abhängigkeits-Killer:** Der Commit besteht aus 6 Datei-Hunks, davon sind **4 an GESKIPPTE Commits gebunden**:
- `EditorPane.tsx`-Hunk nutzt `resolveFormatter` (eingeführt von **6980581**, SKIP), `prefs.editorFormatOnSave` (**a25fb40**, SKIP), `lspFormatDocument` (LSP, SKIP), `applyFormattedContent`. → **muss entfallen**.
- `externalFormat.ts`-Hunk: Datei ist im Fork **ABSENT** (eingeführt von **a25fb40**, SKIP). → **muss entfallen**.
- `lsp/client.ts` + `useLspExtension.ts`: LSP absent. → entfallen (Plan sagt das).
- Portierbar bleiben nur: `useDocument.ts` (reload-Race-Recheck via `dirtyRef` nach Read, `saveNow`→`setDirty(buffer!==content)`, `forceRef`-Reset bei Pfadwechsel) + der `useAppCloseGuard.ts`-1-Hunk (busyTerminal-await VOR dirtyEditors-Count).

**Antwort in 3 Sätzen:** 662dbbb hängt an keinem geskippten Commit und ist per Hand portierbar (Save-Konflikt/EOL/Quit-Guard sind self-contained); nur sein `adoptDiskText`-Teil ist im Fork tot und entfällt. 85a5653 ist NICHT als Ganzes portierbar: seine EditorPane-, externalFormat- und LSP-Hunks setzen die geskippte Formatter-Registry (6980581/a25fb40) und LSP voraus (`externalFormat.ts` fehlt im Fork komplett, `resolveFormatter`/`editorFormatOnSave` existieren nicht) und müssen entfallen. Übrig bleibt aus 85a5653 nur der echte Datenverlust-Kern — der reload/save-Race-Recheck in `useDocument.ts` und die Reihenfolge-Korrektur in `useAppCloseGuard.ts` — beide unabhängig portierbar.

Hunk-/Datei-Level-Aufteilung W3:
| Datei | Aus | Verdikt |
|---|---|---|
| `src-tauri/.../fs/file.rs` mtime + write-mtime + symlink_metadata | 40a8ef2 | PORTIEREN (Gates erhalten) |
| `src-tauri/.../fs/file.rs` force/FORCE_MAX | 40a8ef2 | OPTIONAL/DEFER (Feature) |
| `ai/lib/native.ts` ReadResult mtime | (neu, Fork-spezifisch) | PORTIEREN (shared type) |
| `editor/lib/eol.ts` + test | 662dbbb | PORTIEREN (additiv) |
| `editor/lib/useDocument.ts` mtime/adoptRead/save-conflict/reload | 662dbbb+85a5653 | REIMPLEMENTIEREN auf Fork-Divergenz |
| `editor/lib/useDocument.ts` adoptDiskText | 662dbbb+85a5653 | WEGLASSEN (tot) |
| `hooks/useAppCloseGuard.ts` dirty-editor-guard + ordering | 662dbbb+85a5653 | PORTIEREN (base-identisch → 3-way) |
| `components/CloseDialogs.tsx` | 662dbbb | PORTIEREN (base-identisch → 3-way) |
| `EditorPane.tsx`, `externalFormat.ts`, `lsp/*` | 85a5653 | ENTFALLEN (Skip-Deps) |

**Fork-Divergenz `useDocument.ts` (Reimplementierungs-Grund):** Fork hat `workspace`-Param (SSH) + `trusted: true` auf JEDEM invoke, importiert `ReadResult` aus `@/modules/ai/lib/native` (nicht inline), hat toast-Fehlerbehandlung in `saveNow`, KEIN `markSaved`. → Upstream-Diff patcht nicht; jede invoke muss `workspace`/`trusted` behalten. `mtime` muss in `ai/lib/native.ts:4-7` (shared, +Consumer composer/Html/Markdown — rückwärtskompatibel als Feld-Add) UND im Rust-`ReadResult` ergänzt werden.

## Prüfauftrag 2 — W1 Chronologie/Topologie + merge-tree

Upstream-Reihenfolge (oldest→newest, Position im Range): cb75fae(34) · 78a0b3d(35) · a71fcfc(36) · 786ceb5(45) · 85a5653(47) · ae9e690(50) · 7649926(51) · ac88362(64). Editor/LSP-Rework liegt DAZWISCHEN: 653dd15(25), 2219adb(26), a25fb40(30), 6980581(41). Relevant: 786ceb5/ae9e690/7649926 kommen NACH dem Rework → Kontext-Drift-Risiko.

merge-tree Cherry-Pick-Sim (`--merge-base=C^ main C`):
| Pick | Sim | Befund |
|---|---|---|
| ac88362 | **CLEAN** | da_filter.rs base-identisch. Sauberer `-x`. |
| 786ceb5 | **CLEAN** | languageDefinitions + neue markdownExtras.ts base-identisch. Trotz Position>Rework: additiv, keine Rework-Abhängigkeit. Sauberer `-x`. |
| a71fcfc | **CLEAN** | shortcuts.ts fork-geändert (+23/-2), aber 1-Zeilen-Rebind isoliert. Sauberer `-x`. |
| ae9e690 | CONFLICT nur `TERAX.md` | Code (languageDefinitions/languageResolver) auto-merged CLEAN. TERAX.md-Hunk droppen. Effektiv sauber. |
| cb75fae | **CONFLICT** `MarkdownPreviewPane.tsx` | Fork-HTML-Preview-Divergenz. `<Streamdown>`-Block existiert (Fork Z.94). = manuelle 2-Zeilen-Ergänzung (`mode="static"` + `parseIncompleteMarkdown={false}`). Test-Datei neu/clean. |
| 7649926 | **CONFLICT** `cmThemes.ts` | **Dep-Risiko aufgelöst = nur Kontext-Drift, KEINE harte Abhängigkeit.** Ziel-Zeilen existieren im Fork (`cmThemes.ts:63,64,82`, `type Palette` Z.8); 2219adb (+300/-85) hat NUR die Umgebung umformatiert. Manuelle 3-way ~10 Zeilen. Kein neuer Dep nötig (nutzt nur `t.tagName` etc.). |
| 78a0b3d | CONFLICT | **redundant, entfällt** — s. Prüfauftrag 3. |

Empfehlung: W1-Picks in Upstream-Chronologie anwenden (cb75fae → a71fcfc → 786ceb5 → ae9e690 → 7649926 → ac88362); `languageDefinitions.ts` wird von 786ceb5 UND ae9e690 berührt → in dieser Reihenfolge picken (jeder Pick re-3-way't).

## Prüfauftrag 3 — 78a0b3d Reachability → REDUNDANT

Der Fork hat die **exakte Härtung bereits** — unabhängig implementiert (vermutlich security-fix-loop-2026-07): `ai/tools/search.ts:40` `filterReadableHits<T>(hits) => hits.filter(h => checkReadable(h.path).ok)`, aufgerufen in grep (Z.95) und glob (Z.133). Fork-Kommentar dokumentiert sogar die relative-vs-absolute-Nuance, die Upstreams `pathForSafety` adressiert: „Filtering is on `path` (the resolved absolute path the checks understand), not `rel`". → **78a0b3d bringt nichts Neues; aus W1 STREICHEN.** Reachability-Frage damit gegenstandslos (der Fix ist bereits aktiv, ob AI-Runtime lebt oder nicht). Optional (kein Pick): einmal verifizieren, dass Fork-`native.grep` `h.path` wirklich absolut liefert — der Kommentar behauptet es.

## Prüfauftrag 4 — Zweitmeinung SKIP-Listen (Security/Datenverlust)

Stealth-Fix-Scan der geskippten Commits: **keiner** berührt src-tauri (fs/pty/guard) oder ein geteiltes nicht-AI-kritisches File:
- 882641e: rein AI (AiChat/agent.ts/errors.ts/prompt.ts/transport.ts) — Fork-AI entkernt, Info-Leak nur im AI-Chat-Pfad → SKIP korrekt, kein unabhängiger Fix.
- 3e9f374/0dc259d: tabs/terminal agentActivity (Parallel-Impl) → Fork-behalten korrekt.
- fe4e074/9616cc8/7b1fae6/5c2f4cd: AI-Feature-Plumbing (9616cc8 fasst auch source-control/autocomplete an, aber nur Modell-Liste). Kein Datenverlust/Security-Fix.
**→ Die SKIP-Liste enthält keinen Pflicht-Fix.** Bestätigt.

Ein latenter Loose-End (kein Skip-Fehler): der `force`/`openAnyway`-Pfad hat im Fork **keinen UI-Trigger** — Fork-EditorPane hat zwar `toolarge`-Zweig (Z.372/415/491 „File too large"), aber keinen „Open anyway"-Button. Deshalb Empfehlung Änderung 5.

## Prüfauftrag 5 — W2 Dep-Mechanik

- **tauri 2.11.3→2.11.4 (ba0e276):** Fork ist auf 2.11.3 (Cargo.lock Z.4792), Cargo.toml nutzt Caret `version = "2"`. Patch-Bump, **non-breaking**, per `cargo update -p tauri --precise 2.11.4` reproduzierbar, keine Code-Änderung. 
- cargo-Gruppe 3e654c3 + npm-Gruppen 831860b/a069d6f/841c726: über `cargo update -p …` bzw. `pnpm update …` regenerierbar (Locks nie mergen). Kein Breaking in den betroffenen Paketen erkennbar (Minor/Patch-Gruppen).
- **7649926 ist KEIN Dep-Item.** Das „Dep-Risiko"-Flag im Dossier war eine Fehldiagnose: das eigentliche Risiko war die cmThemes-Base-Version (2219adb), und das ist nur Kontext-Drift (Prüfauftrag 2). 7649926 braucht KEINE neuere Dependency → gehört als Handarbeits-Pick in W1, nicht in W2.
- 1005caa (tauri-action 0→1): CI-YAML, Fork eigene Release-Infra → SKIP/manuell (wie geplant).

## Prüfauftrag 6 — Reihenfolge W1→W2→W3

**W1→W2→W3 ist korrekt; kein Reorder nötig.** W3s fs-Umbau nutzt nur bestehende tauri-2-APIs (`async` command, `AppHandle`, `app.emit` — alle seit tauri 2.0), NICHT neue APIs aus 2.11.4. Der tauri-Patch-Bump (W2) ist für W3 irrelevant → die beiden sind sogar unabhängig. Version-Bump 0.8.5 in W2 mitzunehmen ist unkritisch (kosmetisch). Einzige harte Sequenz-Regel: innerhalb W3 die fs-Rust-Änderung (mtime/write-mtime) VOR der useDocument-Reimplementierung, da letztere die mtime-Rückgaben konsumiert.

---

## Konkrete Plan-Änderungen (nummeriert)

1. **78a0b3d aus W1 STREICHEN — redundant.** Fork hat `filterReadableHits` bereits (grep+glob gefiltert). Beweis: `main:src/modules/ai/tools/search.ts:40,95,133`.
2. **85a5653 aufsplitten, nicht als Ganzes portieren.** Nur `useDocument.ts`-Race-Recheck + `useAppCloseGuard.ts`-Ordering übernehmen; `EditorPane.tsx`/`externalFormat.ts`/`lsp/*` ENTFALLEN. Beweis: `externalFormat.ts` von a25fb40 (SKIP) eingeführt + im Fork absent; `resolveFormatter` von 6980581 (SKIP).
3. **662dbbb: `markSaved`→`adoptDiskText` weglassen** (toter Code im Fork — kein Format-on-Save-Consumer). Kern (EOL/Save-Konflikt/Quit-Guard/reload-refactor) behalten. Beweis: `main:src/modules/editor/lib/useDocument.ts` liefert `{doc,dirty,onChange,save,reload}`, kein markSaved; `EditorPane.tsx` referenziert keinen Formatter.
4. **W3 als Reimplementierung deklarieren, nicht „Hand-Merge".** Fork-`useDocument.ts` divergiert (workspace-Param + `trusted` auf jedem invoke, ReadResult aus `ai/lib/native`). `mtime` in `ai/lib/native.ts:4-7` UND Rust-`ReadResult` ergänzen. Beweis: `main:src/modules/ai/lib/native.ts:4-7`, `file.rs:104`.
5. **40a8ef2: `force`/`FORCE_MAX_READ_BYTES` von der Datenverlust-Kette trennen.** Pflicht = mtime (ReadResult+write) + `fs_stat` symlink_metadata-Fix (echter Bug: `file.rs:292` folgt Symlinks). `force`/`openAnyway` = Large-File-Feature (aus 6980581) → DEFER, oder mit minimalem „Open anyway"-Button im `toolarge`-Zweig (Fork hat keinen Trigger). Beweis: `file.rs:283-306` (fs_stat), `EditorPane.tsx:372/415/491` (toolarge ohne Aktion).
6. **7649926 umklassifizieren: „Dep-Risiko" → „Pick mit manueller 3-way".** Braucht keinen Dep; nur Kontext-Drift durch 2219adb. Ziel-Zeilen existieren im Fork. Beweis: `main:src/modules/editor/lib/cmThemes.ts:8,63,64,82`.
7. **W1 nicht als „ein sauberer `cherry-pick -x` PR" beschreiben.** Sauber `-x`: ac88362, 786ceb5, a71fcfc. Pick+TERAX.md-Hunk-drop: ae9e690. Handarbeit: cb75fae (2 Zeilen), 7649926 (~10 Zeilen). Gestrichen: 78a0b3d. In Upstream-Chronologie picken (786ceb5 vor ae9e690 wg. gemeinsamem languageDefinitions.ts). Beweis: merge-tree-Sims oben.
8. **W1→W2→W3 bestätigt (kein Reorder).** W3-fs nutzt keine neuen tauri-2.11.4-APIs; W2-Bump ist non-breaking Patch (2.11.3→2.11.4). Beweis: `Cargo.lock:4792`, 40a8ef2 nutzt nur async/AppHandle/emit.

## (d) W1-Picks mit erwartetem Konflikt
- **cb75fae** — CONFLICT `MarkdownPreviewPane.tsx` (Fork-HTML-Preview); manuelle 2-Zeilen-Ergänzung.
- **7649926** — CONFLICT `cmThemes.ts` (Kontext-Drift durch 2219adb); manuelle 3-way ~10 Zeilen.
- **ae9e690** — CONFLICT nur `TERAX.md` (Code clean); Doc-Hunk droppen.
- **78a0b3d** — CONFLICT `search.ts`/`search.test.ts`, aber **streichen** (Fork hat den Fix bereits).
- Sauber: ac88362, 786ceb5, a71fcfc.
