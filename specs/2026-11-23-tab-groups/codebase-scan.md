# Codebase Scan: Tab-Gruppen

- Feature: Tab-Gruppen (`specs/2026-11-23-tab-groups`)
- Scan-Datum: 2026-11-23
- Discovery: `specs/2026-11-23-tab-groups/discovery.md`
- Basis: `src/` im Worktree; kein `zip.config.json` (kein `invariants_scope_cmd`, Invarianten per grep erhoben); kein bindings.md (`bindings_path` null).
- Test-Runner: `vitest run` (`package.json`), Setup `src/test/setup.ts`, kein `include`-Filter in `vite.config.ts:151` (Default-Globs, alle `*.test.ts(x)` laufen).

## Identified Patterns

| # | Pattern | Fundstellen | Befund |
|---|---------|-------------|--------|
| 1 | Flaches `Tab[]` mit `spaceId` je Tab; Reihenfolge = Array-Reihenfolge, "Space-Strip" wird je Aufruf per `filter(t => t.spaceId === x)` abgeleitet | `src/modules/tabs/lib/useTabs.ts:224,319,466,480,522,537`; `src/app/App.tsx:334,353,645` | 12 unabhängige Filter-Stellen (17 `.spaceId ===` insgesamt, davon 5 Vergleiche ohne Strip-Ableitung) |
| 2 | Reine, exportierte Listen-Funktionen auf `Tab[]` mit Co-Test | `nextActiveInSpace` (useTabs.ts:460), `pickTabBySpaceIndex` (:219), `reorderTabsByGap` (:473), `insertTabAtSpaceGap` (:314), `planSpaceRemoval` (:514), `breakOutPaneFromTabs` (:347) | Tests: `nextActiveInSpace.test.ts`, `pickTabBySpaceIndex.test.ts`, `reorderTabsByGap.test.ts`, `planSpaceRemoval.test.ts`, `useTabs.breakout.test.tsx` |
| 3 | Zieh-Lücken per DOM-Hit-Test: `gapIndexAt` zählt `[data-tab-id]`-Elemente, Lücken-Index = Strip-Index | `src/modules/tabs/lib/tabStripGap.ts:46`; Nutzer `TabBar.tsx:22,232`; Test `tabStripGap.test.ts` | Gruppen-Kopf mit eigenem Element zählt NICHT als Tab, solange er kein `data-tab-id` trägt |
| 4 | Persistenz je Space: `SpaceState = { tabs: SerializedTab[]; activeTabIndex }`, Key `state:<spaceId>`, Zod-freie Handvalidierung (`isSpaceState`) | `src/modules/spaces/lib/store.ts:19-24,52-58`; `validate.ts:18-24`; `serialize.ts` | Kein Platz für Gruppen im Schema; `isSpaceState` prüft nur `tabs`/`activeTabIndex` (Zusatzfelder würden toleriert, nie validiert) |
| 5 | Serialisierung filtert private/transiente Tabs (`isSerializableTab`); `activeTabIndex` zählt nur serialisierbare Tabs der Space-Gruppe | `serialize.ts:60-72`; `useSpacePersistence.ts:51-57` | Gruppen-Mitglieder müssen auf den serialisierten Index abgebildet werden (EP-4: fehlende Mitglieder) |
| 6 | Persistenz-Flush: Debounce 3 s + Flush bei blur/hidden/beforeunload; Dirty-Check über `JSON.stringify` je Space | `useSpacePersistence.ts:12,63-102` | Gruppenänderungen ohne Tab-Änderung (Klappen, Umbenennen) lösen nur dann einen Flush aus, wenn `tabs` oder neuer Gruppenstate in den Effekt-Deps steht |
| 7 | Farb-Palette: `SPACE_COLORS` (8 oklch-Werte), Index in `SpaceMeta.color`, `accentFor()` | `spaces/lib/spaceColor.ts:5-19`; Nutzer `SpaceSwitcher.tsx`, `SpaceAvatar.tsx` | Palette ist Index-basiert; "erste freie Farbe" (BR-5) braucht Index je Gruppe |
| 8 | Inline-Umbenennen: `InlineRename` (Enter/Blur speichert, Esc verwirft, `done`-Ref gegen Doppel-Commit, `aria-label="Rename space"` fest) | `spaces/components/InlineRename.tsx:11-55`; einziger Nutzer `SpaceSwitcher.tsx:437`; Tab-Umbenennen hat eigenes Inline-Input in `TabBar.tsx` (:314 "render a non-button cell") | Zwei Umbenennen-Implementierungen existieren bereits |
| 9 | Rechtsklick-Menü: `ContextMenu*` aus `@/components/ui/context-menu`, nur am Terminal-Tab | `TabBar.tsx:3-7,607-641` | Andere Tab-Arten ohne Menü (Discovery UI-5 bestätigt) |
| 10 | Agent-Status-Aggregat: `selectTabAgentStatus(sessions, leafIds)` zero-alloc, "working" schlägt "waiting"; primitives Ergebnis für zustand-`Object.is` | `tabs/lib/selectTabAgentStatus.ts:19-30`; `TabActivityIndicator.tsx:6,21` | Gruppen-Aggregat hat umgekehrte Priorität (BR-21); Hot Path |
| 11 | Navigation: Tastatur `tab.next/prev` → `stepSwitcher` (MRU-Reihenfolge des Space), `tab.selectByIndex` → `selectByIndex` → `pickTabBySpaceIndex`, Wischen → `swipeTab` über `spaceTabs` (clamp, kein Wrap) | `App.tsx:944-950`, `App.tsx:640-657`, `App.tsx:1078-1090`; `useTabs.ts:1299-1305` | Drei verschiedene Sichtbarkeits-/Reihenfolge-Quellen (MRU, Array, Index-Pool) |
| 12 | Gezielter Sprung: `jumpToTab` (Space-Overview), `activateAgentTarget` (Glocke, Mission Control, Toast, Benachrichtigung), `onSelect={setActiveId}` (TabBar-Klick), Datei-Öffnen per `resolveFileTabOpen` + `setActiveId(existing.id)` | `App.tsx:922-931,1355-1363,1535`; `useTabs.ts:1111,1150,1203`; `agents/components/NotificationBell.tsx:26`, `AgentMissionControl.tsx:29,184` | BR-10 (Aufklappen) trifft mind. 4 Einstiegspunkte plus ~15 `setActiveId`-Aufrufe in `useTabs.ts` |
| 13 | Schließen-Schutz: `useTabCloseGuards` hält drei Pending-States (dirty Editor, Terminal-Vordergrundprozess, Pfad gelöscht) und prüft `leafHasForegroundProcess` async | `app/hooks/useTabCloseGuards.ts:14-90`; Dialoge in `App.tsx:1827ff` | Pro-Tab-Logik in `handleClose`; kein Sammelcheck. Letzter Tab eines Space wird nicht geschlossen (`nextActiveInSpace === null`) |
| 14 | Tab in anderen Space: `moveTabToSpace` (nur `spaceId` umschreiben, Position bleibt im globalen Array), Rückgabe "folge dem Tab" | `useTabs.ts:626-647`; Aufruf `App.tsx:1328`; Drag über `reorderTab` (`useTabs.ts:652ff`) | Space-Wechsel passiert an 2 Stellen (`moveTabToSpace`, `reorderTab` mit `crossSpace`) |
| 15 | Space-Entfernung: `planSpaceRemoval` (reine Funktion) | `useTabs.ts:514-541`; Test `planSpaceRemoval.test.ts` | BR-18 (Gruppen folgen Tabs) hängt hier |
| 16 | Befehlspalette: flaches Array `{id, run, ...}` je Eintrag, Kontext `ctx` | `command-palette/commands.ts:66-235` | IDs-Schema `tab.*`, `spaces.*` |
| 17 | Neustart-Hydrierung: `hydrateTabs`, `freshTerminalTab`, Boot-Logik wählt aktiven Tab per Index | `serialize.ts:137,155`; `useSpacesBoot.ts:120-134` | Gruppen müssen hier wieder aufgebaut werden (BR-19/20) |

## Existing Abstractions

| Abstraktion | Location | Used by | Recommendation | Rationale |
|-------------|----------|---------|----------------|-----------|
| `SPACE_COLORS` + `accentFor` | `spaces/lib/spaceColor.ts:5,16` | 2 Komponenten (`SpaceSwitcher.tsx`, `SpaceAvatar.tsx`) + `store.ts:11` (Doku) | REUSE | Palette reicht für Gruppenfarben; "nächste freie Farbe" ist neue Logik obendrauf |
| `ContextMenu*` (ui) | `src/components/ui/context-menu` | `TabBar.tsx:3-7`, weitere Nutzer im Repo | REUSE | Standard-Menü; Untermenü-Komponenten (`ContextMenuSub*`) müssen vorhanden sein, nicht geprüft |
| `TabActivityIndicator` / `selectTabAgentStatus` | `tabs/TabActivityIndicator.tsx`, `tabs/lib/selectTabAgentStatus.ts` | `TabBar.tsx:356`; 1 Selektor-Nutzer | EXTEND | Aussehen reusable; Aggregat über mehrere Tabs mit umgekehrter Priorität (BR-21) und Leaf-Ids mehrerer Tabs ist neu |
| `InlineRename` | `spaces/components/InlineRename.tsx` | 1 (`SpaceSwitcher.tsx:437`) | EXTEND | Nur 1 Nutzungsstelle (kein REUSE); `aria-label` ist hartkodiert "Rename space", Länge 32 (BR-6) fehlt |
| `gapIndexAt` / `tabStripAt` / `stripHasTab` | `tabs/lib/tabStripGap.ts` | `TabBar.tsx` (Gap), `isInsideHorizontalScroller`-Pfad, Pane-Drag in `TabBar.tsx:205-232` | EXTEND | Lücken-Index zählt reine Tab-Elemente; Gruppen-Kontext (innerhalb/außerhalb, Kopf-Ziel) ist neu |
| `reorderTabsByGap` | `useTabs.ts:473`; `useTabs.ts:1683` (1 Produktiv-Aufruf) + Test | 1 Produktiv-Nutzer | EXTEND | Muss Gruppenzugehörigkeit nach Ziel-Lücke setzen (BR-11) und Gruppen als Block verschieben (BR-14) |
| `insertTabAtSpaceGap` | `useTabs.ts:314` | Pane-Breakout (`breakOutPaneFromTabs`) | EXTEND | BR-11 gilt auch für ausgebrochene Panes |
| `nextActiveInSpace` | `useTabs.ts:460` | 8 Nutzungsstellen in `useTabs.ts` + `useTabCloseGuards.ts:28` | EXTEND | Zentraler Nachfolger-Algorithmus; EP-1/EP-3 und "sichtbare Tabs" müssen hier rein, alle 9 Aufrufer erben es |
| `pickTabBySpaceIndex` | `useTabs.ts:219` | 1 Produktiv-Aufruf (`:1302`) + Test | EXTEND | BR-9: nur sichtbare Tabs zählen |
| `useTabSwipe` | `tabs/lib/useTabSwipe.ts` | `App.tsx:1090` | REUSE (unverändert) | Native Richtung; Sichtbarkeit entscheidet der Callback `swipeTab` (`App.tsx:1078`), nicht der Hook |
| `useTabSwitcher` | `tabs/lib/useTabSwitcher.ts` | `App.tsx:653` | REUSE (unverändert) | Order kommt per `getOrder`-Callback (`App.tsx:640`); dort filtern |
| `useTabCloseGuards` | `app/hooks/useTabCloseGuards.ts` | `App.tsx:606` | EXTEND | Sammel-Check für Gruppe; die per-Tab-Regeln (dirty Editor, `leafHasForegroundProcess`) sind Quelle der Wahrheit (BR-15) |
| `moveTabToSpace` | `useTabs.ts:626` | 1 Aufruf (`App.tsx:1328`) | EXTEND | BR-17: Tab verlässt Gruppe |
| `planSpaceRemoval` | `useTabs.ts:514` | 1 Produktiv-Aufruf | EXTEND | BR-18 |
| `serializeTabs` / `hydrateTabs` / `SpaceState` | `serialize.ts`, `store.ts` | `useSpacePersistence.ts`, `useSpacesBoot.ts` | EXTEND | Gruppen im SpaceState ergänzen; Tests `serialize.test.ts` (318 Z.) existieren |
| Gruppen-Datenmodell, Kopf-Komponente, Farblinie, Drop-Marke | -- | -- | NEW | Keine Gruppen-Abstraktion im Code (grep "group" in `modules/tabs`/`spaces` ohne Treffer zu Tab-Gruppen) |

## Recommendations

### REUSE

| Was | Pfad | Nutzungen | Begründung |
|-----|------|-----------|------------|
| `SPACE_COLORS`/`accentFor` | `src/modules/spaces/lib/spaceColor.ts` | `SpaceSwitcher.tsx`, `SpaceAvatar.tsx` (2) | Palette der Discovery (Reused Patterns) |
| `ContextMenu` UI-Primitive | `src/components/ui/context-menu`; `TabBar.tsx:3-7` | `TabBar.tsx` + weitere | Standard-Primitive für Tab- und Kopf-Menü |

### EXTEND

| Was | Pfad | Begründung |
|-----|------|------------|
| `useTabSwipe`, `useTabSwitcher` Hooks | `src/modules/tabs/lib/useTabSwipe.ts`, `useTabSwitcher.ts` | Je nur 1 Nutzungsstelle (kein REUSE); Hooks selbst unverändert, die Callbacks in `App.tsx` tragen die Logik |
| `nextActiveInSpace` | `src/modules/tabs/lib/useTabs.ts:460` | 9 Aufrufer; EP-1/EP-3 |
| `pickTabBySpaceIndex` | `src/modules/tabs/lib/useTabs.ts:219` | BR-9 |
| `reorderTabsByGap`, `insertTabAtSpaceGap` | `src/modules/tabs/lib/useTabs.ts:473,314` | BR-11, BR-14 |
| `gapIndexAt` | `src/modules/tabs/lib/tabStripGap.ts:46` | Gruppen-Kontext der Lücke |
| `selectTabAgentStatus` + `TabActivityIndicator` | `src/modules/tabs/lib/selectTabAgentStatus.ts`, `TabActivityIndicator.tsx` | BR-21 |
| `InlineRename` | `src/modules/spaces/components/InlineRename.tsx` | 32-Zeichen-Grenze, `aria-label` |
| `useTabCloseGuards` | `src/app/hooks/useTabCloseGuards.ts` | BR-15 |
| `moveTabToSpace`, `reorderTab`, `planSpaceRemoval` | `src/modules/tabs/lib/useTabs.ts:626,652,514` | BR-17, BR-18 |
| `serialize.ts`, `store.ts`, `validate.ts`, `useSpacePersistence.ts`, `useSpacesBoot.ts` | `src/modules/spaces/lib/` | BR-19, BR-20 |
| `commands.ts` | `src/modules/command-palette/commands.ts` | 3 Einträge, IDs im Schema `tab.*` |
| `swipeTab`, `getSwitcherOrder`, `selectByIndex`-Aufruf, `activateAgentTarget`, `jumpToTab` | `src/app/App.tsx:1078,640,946,922,1355` | BR-9, BR-10 |

### NEW

| Was | Begründung |
|-----|------------|
| Gruppen-Datenmodell (Name, Farbe, collapsed, spaceId, geordnete Mitglieder, Position) | Kein Vorbild im Code (DF-1..DF-6) |
| Reine Gruppen-Regel-Funktionen (anlegen, zuordnen, entfernen, auflösen, BR-3/BR-4-Invarianten) | Slice 1 "ohne Oberfläche prüfbar" |
| Sichtbare-Tabs-Ableitung (eingeklappte ausgeblendet) | Existiert nirgends; siehe Anti-Slop K2 |
| Gruppen-Kopf-Komponente, Farblinie, Drop-Marke | Neue UI-Patterns laut Discovery |
| Sammel-Aggregat über mehrere Tabs | Variante von #10 mit anderer Priorität |
| Gruppen-Schließen-Dialog | Sammel-Rückfrage hat kein Vorbild; bestehende Dialoge sind je Tab |

### AVOID

Keine. (Kein bindings.md; Discovery ersetzt keinen bestehenden Pfad, Frame "Nicht betroffen".)

## Anti-Slop Findings

| class | subject | sites | existing_owner | guards_present | exit_condition | suggested_resolution | evidence |
|-------|---------|-------|----------------|----------------|----------------|----------------------|----------|
| k2_knowledge_copy | "Welche Tabs sind in der Leiste sichtbar/navigierbar" (Strip eines Space) | `src/app/App.tsx:353`; `App.tsx:645`; `useTabs.ts:224`; `useTabs.ts:466`; `useTabs.ts:480`; `App.tsx:334` | keiner; je Stelle eigenes `filter(t => t.spaceId === ...)` | je Stelle keiner; `tabStripGap.ts:36 stripHasTab` prüft zusätzlich per DOM | none (kein K3) | consolidate: eine Ableitung "sichtbare Tabs des Space" als Deliverable, bevor BR-9 an 6 Stellen einzeln nachgezogen wird | `useTabs.ts:466` und `useTabs.ts:224` kodieren dieselbe Space-Strip-Ableitung unabhängig; `App.tsx:353` und `:645` ebenfalls |
| k4_pattern_fork | Tab-Wechsel: drei Wege wählen das nächste Ziel (MRU in `getSwitcherOrder`, Array-Clamp in `swipeTab`, Index-Pool in `pickTabBySpaceIndex`) | `App.tsx:640-648`; `App.tsx:1078-1088`; `useTabs.ts:219-226` | keine dominante Schule (3 Wege à 1 Nutzung) | keiner | none | adopt_school: eine Navigations-Reihenfolge-Quelle (sichtbare Tabs), die alle drei konsumieren | `swipeTab` clampt ohne Wrap, Switcher wrappt (`useTabSwitcher.ts:20-22`), Verhalten divergiert heute schon; BR-9 verlangt einheitliche Sichtbarkeit |
| k1_dual_mechanism | Tab in anderen Space verschieben (zwei Schreib-Pfade auf `tab.spaceId`) | `useTabs.ts:626-647` (`moveTabToSpace`); `useTabs.ts:652ff` (`reorderTab`, `crossSpace`) | `moveTabToSpace` (Menü/Overview), `reorderTab` (Zieh-Pfad in SpaceSwitcher) | beide: Fallback via `nextActiveInSpace` vorhanden (:637, :670); Gruppen-Austritt (BR-17) existiert in keinem | none | consolidate: BR-17/EP-3 in beiden Pfaden oder gemeinsamem Helfer erzwingen | `useTabs.ts:630` und `:670` schreiben beide `spaceId` |
| k3_stale_workaround | -- | -- | -- | -- | -- | -- | keiner gefunden (`UNTIL:`/`MIRROR-OF:`-Marker im berührten Umfeld: 0) |

Unterdrückt via False-Positive-Registry: 0 (keine `slop-false-positives.md` im Ziel-Repo gefunden unter `specs/architecture/`).

Linsen-Antworten je Discovery-Deliverable: Owner-Frage (K1): Gruppen-Persistenz hat keinen bestehenden Pfad; Space-Wechsel siehe Fund 3. Wissens-Frage (K2): Sichtbarkeit/Strip siehe Fund 1; Palette existiert einmal (kein Fund). Rückbau-Frage (K3): Discovery ersetzt nichts. Schul-Frage (K4): siehe Fund 2; Umbenennen hat zwei Implementierungen (`InlineRename`, `TabBar.tsx`-Input), regelfreier Concern, Gruppen-Umbenennen wäre die dritte Stelle, kein harter Fund (Beleg-Zeile für Tab-Variante nur als Bereich `TabBar.tsx:314-360`).

## Conventions Detected

- Reine Logik als exportierte Funktionen in `tabs/lib/*.ts` mit gleichnamiger `*.test.ts` direkt daneben; Hooks `useX.ts` in `lib/`.
- Modul-Public-API über `index.ts` (`src/modules/tabs/index.ts`, `spaces/index.ts`); Importe über Alias `@/modules/...`.
- Persistierte JSON ist untrusted; Narrowing per Handvalidierung (`validate.ts`), kein Schema-Lib.
- Optionale Felder werden beim Serialisieren per Spread weggelassen (`...(x !== undefined && { x })`).
- Zustandsänderungen am Tab-Array über `setTabs(prev => ...)`, Live-Zugriff über `tabsRef`/`activeIdRef`.
- UI-Texte Englisch, Kommentare erklären das Warum ausführlich.
- Commands: `id` im Punkt-Schema (`tab.new`, `spaces.switch.<id>`).
- Formatter/Linter: `biome.json`; ungenutzte Exporte prüft `knip.json`.

## Key Integration Points

| Punkt | Datei | Hinweis |
|-------|-------|---------|
| Tab-Zustand | `src/modules/tabs/lib/useTabs.ts` (1735 Z.) | Gruppen-State hier oder daneben; `useTabs` exportiert `setActiveId` an 20+ Stellen |
| Leiste | `src/modules/tabs/TabBar.tsx` (917 Z.) | Drag-State, Pane-Drag, Menü; gleiche Stelle wie Panes-Welle C (`specs/panes-ux/discovery.md`) |
| Navigation | `src/app/App.tsx:640-657, 944-950, 1078-1090` | Callback-basiert |
| Sprünge | `src/app/App.tsx:922, 1355`; `modules/agents/components/NotificationBell.tsx`, `AgentMissionControl.tsx`, `AgentToast.tsx` | Alle laufen über `activateAgentTarget`/`jumpToTab` |
| Persistenz | `modules/spaces/lib/serialize.ts`, `store.ts`, `useSpacePersistence.ts`, `useSpacesBoot.ts` | Schema-Erweiterung abwärtskompatibel halten (alte Dateien ohne Gruppen) |
| Schließen | `src/app/hooks/useTabCloseGuards.ts`, `App.tsx:595-606, 1827` | |
| Palette | `src/modules/command-palette/commands.ts` | |
| Space-Wechsel/Entfernen | `useTabs.ts:514, 626, 652`; `App.tsx:1328` | |

## Existing-Behavior Invariants

Modul: Tabs (Navigation, Reihenfolge, Schließen, Space-Wechsel) und Space-Persistenz, jeweils mit direkten Konsumenten. Alle Tests unter `src/**/*.test.ts(x)` laufen via `vitest run` (kein Include-Filter).

| # | invariant | consumers | source | coverage | routing |
|---|-----------|-----------|--------|----------|---------|
| INV-1 | `nextActiveInSpace` nimmt den Vorgänger im selben Space, sonst den Nachfolger | `useTabs.ts:637`, `:670`, `:980`, `:1234`, `:1599`, `:1633`; `useTabCloseGuards.ts:28` | `nextActiveInSpace.test.ts` "picks the previous tab within the same space", "falls forward when closing the first tab of a space" | covered | none |
| INV-2 | `nextActiveInSpace` springt nie in einen anderen Space und liefert `null` beim letzten Tab des Space (Schließen verweigert) | `useTabCloseGuards.ts:28`; `useTabs.ts:1234` | `nextActiveInSpace.test.ts` "never jumps into another space", "returns null for the last tab of its space" | covered | none |
| INV-3 | "Tab nach Nummer" zählt nur Tabs des aktiven Space | `useTabs.ts:1302`; `App.tsx:946-950` | `pickTabBySpaceIndex.test.ts` "Cmd+1 in space B returns B's first tab, not A's" | covered | none |
| INV-4 | `reorderTabsByGap` ordnet innerhalb des Space um, Lücke relativ zum Space-Strip inkl. gezogenem Tab | `useTabs.ts:1683` (via `reorderTab`-Callback in `TabBar.tsx:405`) | `reorderTabsByGap.test.ts` | covered | none |
| INV-5 | `gapIndexAt`: Halbbreiten-Regel über `[data-tab-id]`-Elemente, letzte Lücke = Anzahl | `TabBar.tsx:232` | `tabStripGap.test.ts` "picks the gap by the half-width rule", "reports the last gap..." | covered | none |
| INV-6 | Die Leiste führt nur Tabs des aktiven Space (`stripHasTab`) | `TabBar.tsx` Pane-Drag-Pfad (:205-232) | `tabStripGap.test.ts` "does not recognise a tab from another space's strip" | covered | none |
| INV-7 | Entfernen eines Space verschiebt dessen Tabs nicht, entfernt sie und sorgt für mind. einen Tab im Fallback-Space (kaltes Terminal) | `useTabs.ts:685`, `:700` (`removeSpace`-Pfad) | `planSpaceRemoval.test.ts` | covered | none |
| INV-8 | Pane-Breakout / Undo erzeugt Tab an Ziel-Lücke und stellt vorherigen Zustand wieder her | `useTabs.ts:1538`, `:1562-1575` | `useTabs.breakout.test.tsx`, `paneAcrossTabs.test.ts` | covered | none |
| INV-9 | Serialisierung lässt private Terminals und transiente Tab-Arten aus | `useSpacePersistence.ts:41,55` | `serialize.test.ts:28` "drops private terminals and transient kinds" | covered | none |
| INV-10 | Neustart-Round-Trip erhält Tabs, Splits, customTitle, tmux-Zuordnung | `useSpacesBoot.ts` (hydrateTabs-Aufruf), `useSpacePersistence.ts:41` | `serialize.test.ts` (Round-Trip-Fälle, 318 Z.; Zeilenbeleg je Fall nicht einzeln erhoben) | covered | none |
| INV-11 | Datei erneut öffnen aktiviert den vorhandenen Tab statt einen neuen anzulegen | `useTabs.ts:1111`, `:1150`, `:1203` | `resolveFileTabOpen.test.ts` | covered | none |
| INV-12 | Tab-Wischen springt Tab für Tab ohne Wrap (Clamp an den Rändern) | `App.tsx:1078-1088` | kein Test gefunden (`swipeTab` ist Inline-Callback; `tabSwipe.ts` testet nur `isInsideHorizontalScroller`) | uncovered | qa_matrix |
| INV-13 | Tab-Umschalter (`tab.next/prev`) wrappt und folgt MRU-Reihenfolge des aktiven Space, ignoriert Space-fremde Tabs | `App.tsx:640-657`, `useTabSwitcher.ts:20-22` | kein Test für `getSwitcherOrder`/Hook gefunden | uncovered | differential_check |
| INV-14 | Schließen eines Terminals mit Vordergrundprozess oder eines dirty Editors verlangt Rückfrage; sonst sofort | `App.tsx:606`, `useTabCloseGuards.ts:28-45` | kein Test für `useTabCloseGuards` gefunden | uncovered | differential_check |
| INV-15 | Sprung aus Glocke / Mission Control / Toast wechselt Space, aktiviert Tab, fokussiert Pane | `App.tsx:922-931`; `NotificationBell.tsx:26`; `AgentMissionControl.tsx:184` | kein Test für `activateAgentTarget` gefunden | uncovered | qa_matrix |
| INV-16 | Tab-Status-Zeichen: working schlägt waiting, idle trägt nichts bei | `TabActivityIndicator.tsx:21` | `TabActivityIndicator.test.tsx` (Fälle für working/waiting; `selectTabAgentStatus` selbst ohne eigenen Test) | covered | none |
| INV-17 | Einzelner Tab in anderen Space: Space-Feld wechselt, aktiver Tab fällt auf Nachbarn, sonst Rückgabe "folge" | `useTabs.ts:626-647`; `App.tsx:1328` | kein Test für `moveTabToSpace` gefunden | uncovered | differential_check |
| INV-18 | Erster Start eines geleerten Space erzeugt neues Terminal | `useSpacesBoot.ts:120-134` | kein Test für `useSpacesBoot` gefunden | uncovered | qa_matrix |

Anmerkung: Zeilenangaben der `source`-Spalte nennen Testdateien/-namen aus der Datei-Auflistung und Stichproben; für INV-10, INV-16 wurde der Inhalt der Testfälle nur anhand Dateiumfang/Namen eingeordnet. Kandidaten, Bestätigung und INV-ID-Verankerung in der Architecture-HITL.

## Bindings Context

No bindings file found.

## Scan Summary

| Kennzahl | Wert |
|----------|------|
| Patterns identifiziert | 17 |
| REUSE | 2 |
| EXTEND | 12 |
| NEW | 6 |
| AVOID | 0 |
| Anti-Slop K1 / K2 / K3 / K4 | 1 / 1 / 0 / 1 |
| Anti-Slop unterdrückt | 0 |
| Invarianten gesamt | 18 |
| covered / uncovered | 12 / 6 |
| Routing (uncovered) | differential_check 3, qa_matrix 3 |
| Bindings | keine (`bindings_path` null), Reconcile übersprungen |
