# Post-Implement Review Report

**Feature:** Tab-Gruppen (`specs/2026-11-23-tab-groups`), Teil „tab-strip"
**Branch:** tab-groups
**Default-Branch:** main
**Datum:** 2026-11-24
**Perspektive:** quality+alignment (Teil A + Teil B)
**Prüfmenge:** `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/TabGroupHeader.tsx`, `src/modules/tabs/TabActivityIndicator.tsx`, `src/modules/spaces/components/InlineRename.tsx` (Diff `git diff main...HEAD -- <scope>`, jede Datei vollständig gelesen)

---

## Summary

**Verdict:** FAILED

### Part A: Code Quality

| Kriterium | Findings |
|-----------|----------|
| A.1 Logic Errors | 1 |
| A.2 Error Handling | 0 |
| A.3 Security | 0 |
| A.4 Anti-Patterns | 1 |
| **Subtotal** | **2** |

### Part B: Codebase Alignment

| Kriterium | Findings |
|-----------|----------|
| B.1 Duplicate Solution Paths | 0 |
| B.2 Abstraction Reuse | 0 |
| B.3 Schema Consistency | 0 |
| B.4 Dead Code / Unused Imports | 1 |
| B.5 Error Handling Divergence | 0 |
| B.6 Configuration Drift | 0 |
| B.7 Interface Inconsistency | 0 |
| B.8 Dependency Direction | 0 |
| B.9 Security Pattern Consistency | 0 |
| B.10 Performance Pattern Consistency | 0 |
| **Subtotal** | **1** |

| **Total** | **3** |

Befund-Klassen: 2 × `fix`, 1 × `note`. Kein `decision`, kein `refuted`. Alle Befunde stehen auf `pending_review`.

---

## Findings

### RV-1: Umbenennen eines Gruppen-Tabs überlebt das Einklappen der Gruppe

**Kategorie:** A.1 · **Klasse:** fix · **Decision:** pending_review

**Problem:**
Der Umbenennen-Zustand eines Tabs (`editingId`, `src/modules/tabs/TabBar.tsx:167`) wird nur durch Speichern oder Verwerfen in `TabRenameInput` zurückgesetzt (`TabBar.tsx:458-462`); ausgelöst wird das durch Enter, Esc oder Fokusverlust (`TabBar.tsx:1151-1161`). Der Kopf der Gruppe unterdrückt beim Linksklick das `mousedown` (`src/modules/tabs/TabGroupHeader.tsx:166-168`). Deshalb behält das Namensfeld den Fokus, wenn man den Kopf anklickt, und es kommt kein Fokusverlust. Der Klick klappt die Gruppe trotzdem ein (`TabBar.tsx:819-826`). Danach zeichnet `renderGroup` die Mitglieder nicht mehr (`TabBar.tsx:831-837`). Das Namensfeld verschwindet also, ohne dass gespeichert oder verworfen wird, und `editingId` bleibt gesetzt. Klappt der Nutzer die Gruppe wieder auf, greift `TabBar.tsx:445` erneut: das Namensfeld erscheint von selbst wieder, mit dem alten Namen, und holt sich Fokus und Auswahl (`TabBar.tsx:1118-1126`). Der eingetippte Text ist verloren. React ruft beim Entfernen eines fokussierten Elements kein `onBlur` auf, weil Ereignisse während des Commits abgeschaltet sind. Der Weg über den Fokusverlust greift hier also nicht.

Vor den Gruppen konnte ein Tab in Bearbeitung nicht aus der Leiste verschwinden, ohne dass der Fokus wechselte. Erst das Einklappen per Klick macht diesen Zustand sichtbar.

**Neuer Code:** `src/modules/tabs/TabBar.tsx:445` (Rename-Zelle), `src/modules/tabs/TabGroupHeader.tsx:166` (mousedown am Kopf), `src/modules/tabs/TabBar.tsx:819` (Klick klappt um)

**Erwartete Beobachtung:**
Gruppe G aufgeklappt, Mitglied M ist ein Terminal. Rechtsklick auf M, dann „Rename", dann „foo" tippen ohne Enter. Klick auf den Kopf von G: G klappt ein, der Name von M bleibt unverändert. Erneuter Klick auf den Kopf: M erscheint sofort wieder mit offenem, fokussiertem Namensfeld und dem alten Namen. „foo" ist weg. Im Test lässt sich das so zeigen: Rename öffnen, `fireEvent.change`, dann Klick auf den Kopf mit `pointerDown`/`mouseDown`/`pointerUp` ohne Bewegung. Danach `groups` mit `collapsed: true` und wieder `false` neu rendern. `getByLabelText("Rename tab")` ist wieder vorhanden, `onRename` wurde nie aufgerufen.

**Empfehlung:**
Die Bearbeitung auflösen, sobald der bearbeitete Tab nicht mehr gezeichnet wird. Am einfachsten: in `TabBar` `editingId` zurücksetzen, wenn `tabIndex` (`TabBar.tsx:196-214`) den Tab nicht mehr enthält. Besser, weil es zur bestehenden Fokusverlust-Regel passt: wie ein Fokusverlust auflösen (geändert = speichern, unverändert = verwerfen, `TabBar.tsx:1137-1140`). Den Wechsel des Space beim Fix mitdenken: dort bleibt heute schon `editingId` stehen, ebenso der neue `renamingGroupId` aus `src/app/App.tsx:381`, weil die Tastenkürzel im Capture-Modus auch bei fokussiertem Feld greifen (`src/modules/shortcuts/lib/useGlobalShortcuts.ts:65`).

---

### RV-2: Kommentar begründet die Rename-Zelle des Kopfs mit einem `<button>`, den es dort nicht gibt

**Kategorie:** A.4 (Verstoß CC-F10) · **Klasse:** fix · **Decision:** pending_review

**Problem:**
`src/modules/tabs/TabGroupHeader.tsx:149-150` sagt: „While renaming, a plain cell: an <input> inside a <button> is invalid and WebKit then refuses it focus and selection." Der Kopf ist außerhalb des Umbenennens aber kein `<button>`, sondern ein `<div role="button">` (`TabGroupHeader.tsx:155-158`). Genau so wurde er gebaut, damit das Feld nie in einem `<button>` steht (biome-ignore in `TabGroupHeader.tsx:154`). Dass WebKit einem `<input>` in einem `<button>` Fokus und Auswahl verweigert, trifft auf ein `div` nicht zu. Der Kommentar nennt also einen Grund, der für diesen Code nicht gilt. Der tatsächliche Unterschied zwischen beiden Varianten fehlt im Kommentar: ohne `role="button"`, `tabIndex`, `aria-*` und ohne die Handler für Umklappen und Ziehen, damit Klicks und Tasten dem Feld gehören. Der Kommentar wurde aus `TabBar.tsx:442-444` übernommen. Dort stimmt er, weil die Zelle sonst ein `TabsTrigger`-`<button>` ist.

**Neuer Code:** `src/modules/tabs/TabGroupHeader.tsx:149`
**Bestehendes Pattern:** `src/modules/tabs/TabBar.tsx:442-444` (gleicher Kommentar, dort zutreffend)

**Erwartete Beobachtung:**
`TabGroupHeader.tsx:151-178` enthält kein `<button>`-Element. Beide Zweige rendern ein `<div>`.

**Empfehlung:**
Den Kommentar auf den wahren Grund umschreiben, etwa: „While renaming, a plain cell without the toggle/drag handlers and without role=button, so clicks and keys belong to the field." Alternativ löschen. Die Begründung für das `div` statt `<button>` steht schon bei `TabGroupHeader.tsx:154`.

---

### RV-3: `gapIndexAt` hat keinen Aufrufer im Produktivcode mehr

**Kategorie:** B.4 · **Klasse:** note · **Decision:** pending_review

**Problem:**
`TabBar.tsx:25` importiert statt `gapIndexAt` jetzt `gapTargetAt`; auf `main` war TabBar einer von zwei Aufrufern (`main:src/modules/tabs/TabBar.tsx:22,232`). Der zweite Aufrufer, die Pane-Drag-Logik, ist ebenfalls umgestellt (`src/modules/terminal/lib/useTerminalPaneDnd.ts:4`). `gapIndexAt` (`src/modules/tabs/lib/tabStripGap.ts:48-55`) wird damit nur noch von Tests aufgerufen (`tabStripGap.test.ts:29-48`, `TabBar.test.tsx:367`, `gapTargetAt.test.ts:42-54,125-127`). Dieselbe Halbbreiten-Regel ist in `gapTargetAt` (`tabStripGap.ts:73-107`) noch einmal geschrieben, erweitert um die Köpfe. Die Architektur hält `gapIndexAt` bewusst fest („Der Zähl-Kern `gapIndexAt` bleibt unverändert (INV-5)", `architecture.md:147`, SVC-10). INV-5 nannte aber TabBar als Nutzer (`codebase-scan.md:140`). Die Invariante schützt jetzt ein Verhalten, das kein Produktivpfad mehr nutzt. Der Befund entsteht erst aus dem Zusammenspiel: der Slice, der `gapTargetAt` angelegt hat, ließ `gapIndexAt` stehen, und die Leiste hat den letzten Aufruf entfernt.

**Neuer Code:** `src/modules/tabs/TabBar.tsx:25`
**Bestehendes Pattern:** `src/modules/tabs/lib/tabStripGap.ts:48` (Definition), `main:src/modules/tabs/TabBar.tsx:232` (früherer Aufruf)

**Erwartete Beobachtung:**
`grep -rn "gapIndexAt" src --include=*.ts --include=*.tsx | grep -v '\.test\.'` findet nur die Definition und eine Erwähnung im Doc-Kommentar (`tabStripGap.ts:48,71`).

**Empfehlung:**
Keine Pflicht. Der PM entscheidet, ob `gapIndexAt` als getestete Referenz bleibt (dann INV-5 und SVC-10 so umformulieren, dass sie das sagen) oder wegfällt. Fällt es weg, die Fälle aus `tabStripGap.test.ts:29-48` auf `gapTargetAt` umziehen (dessen Gleichheits-Test `gapTargetAt.test.ts:42` gibt es schon) und den Verweis in `tabStripGap.ts:71` anpassen.

---

## Geprüftes Zusammenspiel über Slice-Grenzen (ohne Befund)

| Prüfpunkt | Leiste ruft | Zustand setzt um | Ergebnis |
|-----------|-------------|------------------|----------|
| Props in Header/App | `TabBarGroupProps` mit 14 Feldern (`TabBar.tsx:98-113`) | `App.tsx:658-694` belegt alle 14 Felder. `Header.tsx:48,80,208` reicht `groupProps` durch. `onReorder` hat in Header (`Header.tsx:47`) und App (`App.tsx:696-700`, `:1650`) den Typ `GapTarget` | vollständig verdrahtet |
| Inhalt von `tabs` | Leiste erwartet den ganzen Streifen inkl. eingeklappter Mitglieder (`TabBar.tsx:116`) | `App.tsx:373-376` `visibleTabsInSpace(..., { all: true })`, `App.tsx:1636` | passt; `hasClose` (`TabBar.tsx:470`) zählt wie `nextActiveInSpace(tabs, id, groups)` in `useTabCloseGuards.ts` |
| Tab ziehen | `onReorder(t.id, target.gap)` (`TabBar.tsx:506`) | `reorderTabByGap` → `applyGapTarget` + `keepActiveVisible` (`useTabs.ts:2062-2075`) | Lücken-Index zählt in Leiste (`tabIndex`, `TabBar.tsx:196-214`), Treffertest (`tabStripGap.ts:78-81`) und Regel (`drawnElements`, `tabGroups.ts:315-326`) dieselben Elemente; die als No-op unterdrückten Lücken der Marke (`TabBar.tsx:402-412`) ergeben in `applyGapTarget` dieselbe Reihenfolge |
| Auf eingeklappten Kopf ziehen | `gapTargetAt(..., { headerDrop: true })` (`TabBar.tsx:325`), Marke `header` (`TabBar.tsx:399-401`) | Zweig `onCollapsedHeader` in `applyGapTarget` (`tabGroups.ts:356-365`), aktiver Tab per `keepActiveVisible` | passt |
| Gruppe ziehen | `onMoveGroup(group.id, target.gap)` ohne `headerDrop` (`TabBar.tsx:304-306,823`) | `moveGroupByGap` → `moveGroupBlock` (`useTabs.ts:2169-2176`, `tabGroups.ts:379-412`) | Marke hinter der fremden Gruppe (`TabBar.tsx:416-421`) entspricht `idBehindGroup`; eigene Lücken sind auf beiden Seiten No-op |
| Pane ausbrechen | Marke aus `paneDndStore.target.gap` (`TabBar.tsx:178-187`) | `gapTargetAt` ohne `headerDrop` (`useTerminalPaneDnd.ts:210`), `breakOutPane(leaf, target)` | passt; keine Kopf-Marke für Panes |
| Umbenennen nach dem Anlegen | `onCreateGroup(t.id)` (`TabBar.tsx:700`) | `handleCreateGroup` (`App.tsx:650-656`): `createGroupFromTab` gibt per `flushSync` die angelegte Id zurück (`useTabs.ts:2079-2092`), danach `setRenamingGroupId` | passt; Menü und Befehlspalette verhindern beim Schließen die Fokus-Rückgabe (`TabBar.tsx:696`; Palette `runAfterClose`, `CommandPalette.tsx:137-143`) |
| Umbenennen speichern | `onRenameGroup(id, value)`, dann `onRenamingGroupChange(null)` (`TabGroupHeader.tsx:125-129`) | `renameGroup` → `normalizeGroupName` (`useTabs.ts:2141-2145`); unveränderter Name ist ein No-op | passt (`maxLength` = `GROUP_NAME_MAX`) |
| In anderen Space verschieben | `onMoveGroupToSpace(group.id, s.id)`, Liste ohne eigenen Space (`TabGroupHeader.tsx:237-240,263-264`) | `moveGroupToSpace(groupId, spaceId, cwd)` mit Prüfung, ob der Ziel-Space existiert, SVC-8 und neuem Terminal bei leerem Herkunfts-Space (`useTabs.ts:2181-2212`) | passt |
| Weitere Aktionen | `onAddToGroup`, `onRemoveFromGroup`, `onUngroup`, `onSetGroupColor(Number(v))`, `onToggleGroup`, `onCloseGroup` | `useTabs.ts:2094-2167`, `requestCloseGroup` (`useTabCloseGuards.ts`) | Parameter und Reihenfolge stimmen |

Weitere Prüfungen ohne Befund:
- Gruppennamen werden nur als Text gerendert (A.3).
- `InlineRename` wird wiederverwendet statt eine dritte Umbenennen-Variante zu bauen (B.1, B.2, wie in `codebase-scan.md:38` empfohlen).
- `AgentStatusBadge` ist aus `TabActivityIndicator` herausgelöst, ohne das Verhalten zu ändern (B.2).
- Das Sammelzeichen abonniert den Agent-Store nur bei eingeklappten Köpfen, das Space-Untermenü nur bei offenem Menü; das Radix-Menü wird erst beim Öffnen eingehängt (B.10).
- Helfer-Exporte aus einer Komponenten-Datei haben ein Vorbild im Bestand: `src/modules/git-history/GraphRail.tsx:15`, importiert von `GitHistoryPane.tsx:35` (B.8, kein Befund).

---

## Changed Files

| File | Lines Changed | Findings |
|------|---------------|----------|
| `src/modules/tabs/TabBar.tsx` | +621 -374 | 2 (RV-1, RV-3) |
| `src/modules/tabs/TabGroupHeader.tsx` | +308 -0 | 1 (RV-2; RV-1 berührt `:166`) |
| `src/modules/tabs/TabActivityIndicator.tsx` | +9 -0 | 0 |
| `src/modules/spaces/components/InlineRename.tsx` | +6 -1 | 0 |

## Prüfmenge

**checked:** die vier Dateien oben, gegen A.1 bis A.4 und B.1 bis B.10.

**not_checked:** alle übrigen Dateien des Diffs, weil sie außerhalb der Prüfmenge liegen und andere Reviewer sie prüfen. Als Beleg gelesen, aber nicht geprüft: `src/app/App.tsx`, `src/modules/header/Header.tsx`, `src/modules/tabs/lib/useTabs.ts`, `src/modules/tabs/lib/tabGroups.ts`, `src/modules/tabs/lib/tabStripGap.ts`, `src/modules/tabs/lib/selectTabAgentStatus.ts`, `src/modules/tabs/index.ts`, `src/app/hooks/useTabCloseGuards.ts`, `src/modules/terminal/lib/useTerminalPaneDnd.ts`, `src/modules/terminal/lib/paneDndStore.ts`. Nicht ausgeführt: Tests, Typprüfung und Build, auf Vorgabe des Aufrufers (Rechner ausgelastet; laut Aufrufer sind Lint, Typprüfung und die Suite grün).
