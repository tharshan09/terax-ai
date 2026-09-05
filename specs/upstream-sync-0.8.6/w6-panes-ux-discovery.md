# W6 Panes/Tabs-UX (Discovery, Stand 2026-09-05)

User-Wunsch (iTerm-Vorbild): (1) Tab auf anderen Tab ziehen → wird dort Split-Pane; (2) Panes innerhalb eines Splits per Drag umsortieren; (3) Tab-Name folgt dem fokussierten Pane.

## Ist-Zustand (Code)
- Pane-Baum: `src/modules/terminal/lib/panes.ts` (leaf/split, `splitLeaf`, `removeLeaf`, `moveLeaf(tree, source, target, edge, newSplitId)` = Leaf innerhalb EINES Baums an eine Kante eines Ziel-Leafs hängen, `DropEdge` left/right/top/bottom). `useTabs.ts` ruft `moveLeaf` (Pane-Drag&Drop innerhalb eines Tabs, PRs #37–#42, session-erhaltend).
- UI: `PaneTreeView.tsx` zeigt pro Leaf einen Grab-Griff („Drag pane", nur bei Split sichtbar) + `PaneDropOverlay` (Kantenhälfte hervorgehoben). Drag-Session pointer-basiert (Store `dropStore` für Datei-Drops, Pane-Drag über `onPaneDragStart`-Prop).
- Tabs: `TabBar.tsx` Reorder pointer-basiert (`draggingId`, `onReorder(fromId, toGapIndex)`), Drop-Ziel = Lücke zwischen Tabs. Kein Drop AUF einen Tab.
- Labels: `tabLabel.ts::labelFor` = customTitle → tmuxSession (nicht managed) → basename(tab.cwd) → title. `tab.cwd` ist Tab-Ebene; `useWindowTitle.ts` nutzt bereits `findLeafCwd(paneTree, activeLeafId)` (Fenstertitel folgt dem Pane), das Tab-Label NICHT.

## Lücken → Inkremente
1. **Tab-Label folgt fokussiertem Pane** (klein): `labelFor` bekommt den Pane-cwd (`findLeafCwd(t.paneTree, t.activeLeafId) ?? t.cwd`) und – bei tmux-Leaves – die tmuxSession des fokussierten Leafs statt Tab-Ebene. Tests in `tabLabel.test.ts`. Achtung: customTitle bleibt Vorrang.
2. **Panes umsortieren = vorhanden**, aber nur über den kleinen Griff bei Hover. Verbesserung: Pane-Header (optional, Settings „Pane headers") als Drag-Fläche, Tausch-Drop (Mitte = swap statt Kante = insert) und Upstream d6e3491/460657a „directional pane swapping shortcuts" (⌘⌥⇧+Pfeil) als Tastatur-Weg übernehmen.
3. **Tab auf Tab ziehen → Split** (mittel): TabBar-Drag erhält zweites Drop-Ziel „auf Tab" (Mitte des Tab-Buttons statt Lücke) → `useTabs.mergeTabIntoTab(srcTabId, dstTabId, edge)`: Quell-PaneTree als Subtree neben das aktive Leaf des Ziel-Tabs hängen (neuer Split), Quell-Tab schließen OHNE PTY-Kill (Leaf-IDs bleiben, Sessions wandern), activeLeafId setzen. Umkehrung „Pane in neuen Tab ausbrechen" (Griff auf die Tab-Leiste ziehen) = Bonus. Bereits als Follow-up „cross-tab pane move" in terax-feature-ideas notiert.
4. Reihenfolge: 1 → 3 → 2. Test-Bridge-e2e für 3 (Drag synthetisch schwer → Store-Aktionen direkt testen).
