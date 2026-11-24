# Post-Implement Review Report

**Feature:** Tab-Gruppen (`specs/2026-11-23-tab-groups`), End-Review Teil „tab-state"
**Branch:** tab-groups
**Default-Branch:** main
**Datum:** 2026-11-24
**Perspektive:** quality+alignment (Teil A + Teil B)
**Prüfmenge:** `src/modules/tabs/lib/useTabs.ts` (Diff `git diff main...HEAD -- src/modules/tabs/lib/useTabs.ts`, Datei vollständig gelesen, dazu der Stand auf `main` zum Vergleich)

Nur als Beleg gelesen, nicht geprüft: `src/app/App.tsx`, `src/modules/tabs/lib/tabGroups.ts`, `src/modules/spaces/lib/validate.ts`, `src/modules/spaces/lib/serialize.ts`, `src/modules/spaces/lib/useSpacesBoot.ts`, `src/modules/spaces/lib/useSpacePersistence.ts`, `src/app/hooks/useTabCloseGuards.ts`, `src/modules/spaces/SpaceSwitcher.tsx` (unverändert), `src/modules/terminal/TerminalStack.tsx`, `src/modules/terminal/lib/useTerminalPaneDnd.ts`, `src/modules/tabs/lib/useTabs.groups.test.tsx`, die Bestandstests der Hilfsfunktionen, `architecture.md`, `discovery.md`, `codebase-scan.md`, `build-plan.md`.
Nicht ausgeführt (Vorgabe des Auftrags): Test-Suite, Typprüfung, Build. Laut Auftrag sind Lint, Typprüfung und die volle Suite grün.

---

## Summary

**Verdict:** FAILED

### Part A: Code Quality

| Kriterium | Findings |
|-----------|----------|
| A.1 Logic Errors | 0 |
| A.2 Error Handling | 0 |
| A.3 Security | 0 |
| A.4 Anti-Patterns | 0 |
| **Subtotal** | **0** |

### Part B: Codebase Alignment

| Kriterium | Findings |
|-----------|----------|
| B.1 Duplicate Solution Paths | 1 |
| B.2 Abstraction Reuse | 3 |
| B.3 Schema Consistency | 0 |
| B.4 Dead Code / Unused Imports | 1 |
| B.5 Error Handling Divergence | 0 |
| B.6 Configuration Drift | 0 |
| B.7 Interface Inconsistency | 0 |
| B.8 Dependency Direction | 0 |
| B.9 Security Pattern Consistency | 0 |
| B.10 Performance Pattern Consistency | 0 |
| **Subtotal** | **5** |

| **Total** | **5** |

Klassen: 1 × `decision` (RV-1), 3 × `fix` (RV-2, RV-3, RV-4), 1 × `note` (RV-5). Alle Befunde: `decision = pending_review`.

Geprüft und ohne Befund (Zusammenspiel über Slice-Grenzen):
- Jede Zustandsänderung läuft über `via`/`onTabs`/`activate` und damit über `settle` (Normalisierung, dann Aufklapp-Regel); kein `setState` umgeht sie (`useTabs.ts:654-686`).
- Alle Gruppen-Aktionen des Hooks und `groups` werden in `App.tsx:170-229` abgenommen und verdrahtet (Leiste `App.tsx:658-700`, Palette `App.tsx:1521-1524`, Schließen `App.tsx:620-648`); keine Aktion ohne Aufrufer.
- Jeder Aufruf von `nextActiveInSpace` übergibt die Gruppen (`useTabs.ts:869, 876, 909, 917, 1280, 1543, 1932, 1960, 2001, 2234`; `useTabCloseGuards.ts:57`).
- Ohne Gruppen bleibt das Verhalten gleich: `nextActiveInSpace`, `pickTabBySpaceIndex`, `planSpaceRemoval`, `moveTabToSpace`, `reorderTab`, `closeTab`, `breakOutPane` mit Zahl, `openFileTab` liefern dieselbe Leisten-Reihenfolge und denselben aktiven Tab wie `main`. Nur die globale Array-Reihenfolge beim Umsortieren über `applyGapTarget` kann sich gegenüber anderen Spaces verschieben; das sieht der Nutzer nicht (Leiste und Speicherung arbeiten je Space).
- Wiederholte Updater-Läufe vergeben keine neuen Ids (`lazyTerminal` `useTabs.ts:690-713`, `removeTabsForSpace` `:927-934`, `openFileTab` `:1179-1182`, `breakOutPane` `:1866`).
- Neue und geänderte Kommentare im Diff stimmen mit dem Code überein (CC-F10 geprüft, u. a. `:261`, `:280`, `:536-539`, `:654`, `:688`, `:715-717`, `:1188-1189`, `:2077-2078`, `:2178-2180`, `:2214-2216`).

---

## Findings

### RV-1: Ziehen in der Space-Übersicht klappt eine eingeklappte Gruppe auf, statt den aktiven Tab weiterzureichen

**Kategorie:** B.1 · **Klasse:** decision · **ID:** B.1-1

**Problem:**
Es gibt jetzt drei Wege, einen Tab in eine bestehende Gruppe zu bringen. Zwei laufen über die Regel-Funktionen und `keepActiveVisible`: „Add to group" (`addTabToGroup`) und Ablegen auf einem eingeklappten Kopf (`reorderTabByGap`). Ist die Zielgruppe eingeklappt und der Tab aktiv, bleibt die Gruppe zu und der aktive Tab wechselt nach SVC-8. Der dritte Weg ist `reorderTab`, das Ziehen in der Space-Übersicht. Er setzt die Zugehörigkeit selbst mit `withGroupId(…, onto.groupId)` und ruft `keepActiveVisible` nicht. Zieht man den aktiven Tab neben ein Mitglied einer eingeklappten Gruppe, liegt er danach in dieser Gruppe, und `settle` → `expandActiveGroup` klappt sie auf. Das widerspricht TR-3 („Add to group" oder Ziehen in eine Gruppe: der Zustand der Zielgruppe bleibt, `discovery.md:199`) und API-2 (`architecture.md:71`: „war der Tab aktiv und die Zielgruppe eingeklappt, gilt SVC-8"). Der Weg ist erreichbar: Die Übersicht listet alle Tabs eines Space, auch die Mitglieder eingeklappter Gruppen (`SpaceSwitcher.tsx:108-116`). Jede Tab-Zeile ist ein Ablageziel (`SpaceSwitcher.tsx:202`) und führt zu `onReorderTab` (`SpaceSwitcher.tsx:223` → `App.tsx:1430-1438` → `reorderTab`). Die Übernahme der Gruppe in der Übersicht hat keine Anforderung (`build-plan.md:753-756`, AC 29 „[Source: --]"). Der Test `useTabs.groups.test.tsx:599-611` prüft nur aufgeklappte Gruppen.

**Neuer Code:** `src/modules/tabs/lib/useTabs.ts:885-921` (Zugehörigkeit `:899-902`), Aufklappen `:643-652`, `:655-668`
**Bestehendes Pattern:** `src/modules/tabs/lib/useTabs.ts:2094-2106` (`addTabToGroup` → `assignToGroup` + `keepActiveVisible`), `:2062-2075` (`reorderTabByGap` → `applyGapTarget` + `keepActiveVisible`), `:718-730`

**Erwartete Beobachtung:**
Startzustand `[t1, G1c(t2, t3), t4]`, G1 eingeklappt, aktiv `t4`. `reorderTab(t4, t2, "top")` ergibt `t1 G1(t4,t2,t3)` mit `collapsed: false` und aktiv `t4`. `addTabToGroup(t4, "G1")` ergibt auf demselben Startzustand `t1 G1c(t2,t3,t4)` mit aktiv `t1` (vgl. `useTabs.groups.test.tsx:186-195`).

**Empfehlung:**
Der PM entscheidet, welches Verhalten die Übersicht haben soll.
(a) Wie API-2 und BR-12: In `reorderTab` das Ergebnis durch `keepActiveVisible(…, spawn)` führen (mit `lazyTerminal` und `spawnCwd` wie bei `addTabToGroup`) und einen Test für die eingeklappte Gruppe ergänzen.
(b) Das Aufklappen bewusst zulassen und als Abweichung von TR-3 festhalten.

---

### RV-2: Die Farbregel VAL-2 steht doppelt, die Namensregel VAL-1 nur einmal

**Kategorie:** B.2 · **Klasse:** fix · **ID:** B.2-1

**Problem:**
Slice-02 prüft den Farb-Index mit einer eigenen Funktion `validGroupColor` in `useTabs.ts`. Slice-03 schreibt dieselbe Regel noch einmal inline in `readGroupEntry` (`validate.ts`). Beide lauten wörtlich `Number.isInteger(c) && c >= 0 && c < SPACE_COLORS.length ? c : 0`. Bei der Schwesterregel VAL-1 ist das Feature anders vorgegangen: `normalizeGroupName` liegt einmal in `tabGroups.ts:470` und wird von `validate.ts:38` und `useTabs.ts:2143` genutzt. Der Build-Plan schließt für slice-02 eigene Regeln neben `tabGroups.ts` aus (`build-plan.md:761`: „Keine eigenen Regeln neben `tabGroups.ts`"). Nur wegen dieser Kopie importiert `useTabs.ts:3` `SPACE_COLORS` aus dem Spaces-Modul.

**Neuer Code:** `src/modules/tabs/lib/useTabs.ts:743-747` (genutzt `:2147-2151`), Import `:3`
**Bestehendes Pattern:** `src/modules/tabs/lib/tabGroups.ts:470` (`normalizeGroupName`, eine Stelle für VAL-1); Zweitkopie `src/modules/spaces/lib/validate.ts:31-36`

**Erwartete Beobachtung:**
`grep -rn "< SPACE_COLORS.length" src/modules` findet die Farbregel in `useTabs.ts:744` und `validate.ts:34`. Wer VAL-2 ändert (z. B. die Palette verkleinert), muss beide Stellen gleich halten.

**Empfehlung:**
In `tabGroups.ts` neben `normalizeGroupName` eine Funktion `normalizeGroupColor(color: unknown): number` exportieren. `validGroupColor` in `useTabs.ts` streichen und `setGroupColor` sowie `readGroupEntry` darauf umstellen. Danach entfällt der `SPACE_COLORS`-Import in `useTabs.ts`.

---

### RV-3: `useTabs.ts` baut private Hilfen aus `tabGroups.ts` nach

**Kategorie:** B.2 · **Klasse:** fix · **ID:** B.2-2

**Problem:**
Zwei Grundbausteine der Gruppen-Regeln stehen jetzt zweimal, je einmal in slice-01 und einmal in slice-02:
1. Die Zugehörigkeit setzen oder lösen. `withGroupId(tab, groupId)` (`useTabs.ts:274-278`, genutzt `:899`, `:1202`) tut für jede Eingabe dasselbe wie `withGroup`/`withoutGroup` (`tabGroups.ts:104-113`). `changeTabSpace` löst die Zugehörigkeit ein drittes Mal inline (`useTabs.ts:269`).
2. Einen Tab hinter den letzten Tab seines Space stellen. `appendToSpace` (`useTabs.ts:280-289`, genutzt `:729`, `:2205`, `:2255`) entspricht `insertTab(tabs, tab, null)` → `insertBlock(…, null)` (`tabGroups.ts:166-187`; `moveGroupAcrossSpaces` nutzt dieselbe Platzierung in `:429`).

Die Bausteine in `tabGroups.ts` sind nicht exportiert, deshalb hat slice-02 sie nachgebaut. Das widerspricht `build-plan.md:761` („Keine eigenen Regeln neben `tabGroups.ts`"). Ändert sich eine der beiden Fassungen, etwa wo neue Tabs bei einer Gruppe am Space-Ende landen, verhalten sich Hook und Regel-Funktionen verschieden.

**Neuer Code:** `src/modules/tabs/lib/useTabs.ts:269`, `:274-278`, `:280-289`
**Bestehendes Pattern:** `src/modules/tabs/lib/tabGroups.ts:104-113`, `:166-187`

**Erwartete Beobachtung:**
Für alle vier Fälle (`groupId` gleich, anders, `undefined` mit und ohne bisherige Gruppe) liefern `withGroupId` und `withGroup` inhaltsgleiche Tabs. Für jeden Space liefern `appendToSpace(tabs, t)` und `insertTab(tabs, t, null)` dasselbe Array.

**Empfehlung:**
`withGroup` (und `withoutGroup`) sowie `insertTab` (oder eine benannte Hülle `appendToSpace`) aus `tabGroups.ts` exportieren. Die Kopien in `useTabs.ts` streichen und `changeTabSpace` auf `withoutGroup` umstellen.

---

### RV-4: `lazyTerminal` kopiert den Terminal-Tab aus `newTabInSpace` samt Bindung an den lokalen Workspace

**Kategorie:** B.2 · **Klasse:** fix · **ID:** B.2-3

**Problem:**
Das neue `lazyTerminal` erzeugt das Ersatz-Terminal für Gruppen-Aktionen. Sein Rückgabe-Objekt (`useTabs.ts:700-711`) entspricht Zeile für Zeile dem Tab-Literal von `newTabInSpace` (`:839-850`). Nur `cold` ist dort fest, hier ein Parameter. Mitkopiert ist auch die Regel, die der Kommentar `:69-77` festschreibt: Jeder Tab mit verwalteter tmux-Session wird auf `LOCAL_WORKSPACE` gebunden (`:707-708`). Diese Bindung steht damit dreimal im Code (`:846-847` `newTabInSpace`, `:978-979` `newTab`, `:707-708` `lazyTerminal`); die ersten beiden gab es schon vor dem Feature. `lazyTerminal` erledigt die Aufgabe von `newTabInSpace` vollständig: Es vergibt die Ids in derselben Reihenfolge (Tab, Leaf, Session), und `cold` ist wählbar.

**Neuer Code:** `src/modules/tabs/lib/useTabs.ts:690-713`
**Bestehendes Pattern:** `src/modules/tabs/lib/useTabs.ts:832-854` (`newTabInSpace`), Regel-Kommentar `:69-77`

**Erwartete Beobachtung:**
Ändert man die Bindung, etwa ein anderes Workspace-Feld für verwaltete Sessions, ohne `lazyTerminal` anzupassen, laufen Ersatz-Terminals aus `closeGroup`, `moveGroupToSpace` und `toggleGroupCollapsed` anders als neue Tabs aus `newTabInSpace`.

**Empfehlung:**
`newTabInSpace` auf `lazyTerminal` aufbauen: `const tab = lazyTerminal(() => nextIdRef.current++, cwd)(spaceId, true); setState(onTabs((curr) => [...curr, tab])); return tab.id;`. Dann steht die Bindung für alle Ersatz-Terminals an einer Stelle.

---

### RV-5: Alte Zahl-Pfade haben keinen Produktiv-Aufrufer mehr; der neue `groups`-Parameter von `reorderTabsByGap` wird nirgends übergeben

**Kategorie:** B.4 · **Klasse:** note · **ID:** B.4-1

**Problem:**
Seit slice-02 ruft der Hook `reorderTabByGap` direkt `applyGapTarget` (`useTabs.ts:2062-2075`); auf `main` rief er `reorderTabsByGap` (`main:src/modules/tabs/lib/useTabs.ts:1683`). Die exportierte Funktion `reorderTabsByGap` (`useTabs.ts:566-581`) hat damit keinen Produktiv-Aufrufer mehr, nur noch `reorderTabsByGap.test.ts:20-46`. Ihr in diesem Diff ergänzter Parameter `groups` wird von keinem Aufrufer übergeben. Ähnlich bei `breakOutPane`: Alle Produktiv-Aufrufer typisieren das Ziel als `GapTarget` (`TerminalStack.tsx:35`, `useTerminalPaneDnd.ts:106`). Den Zahl-Zweig von `breakOutPane`/`breakOutPaneFromTabs` (`useTabs.ts:1834`, `:458-461`), `gapIndexOf` (`:246-248`) und damit `insertTabAtSpaceGap` (`:377-394`) erreichen nur noch die Bestandstests (`useTabs.breakout.test.tsx:37, 77, 171`; `paneAcrossTabs.test.ts`). Bewusst so entschieden (`build-plan.md:231`): Die Bestandstests sollten unverändert grün bleiben. Folge: Am selben API gelten zwei Zählweisen für die Lücke. Die Zahl zählt alle Tabs des Space, auch die eingeklappten, ohne Köpfe; `GapTarget.index` zählt die gezeichneten Elemente samt Köpfen. Der INV-4-Test (`reorderTabsByGap.test.ts`) prüft nicht mehr den Produktiv-Pfad (`applyGapTarget` + `keepActiveVisible`), sondern nur den gemeinsamen Kern `applyGapTarget` ohne Gruppen.

**Neuer Code:** `src/modules/tabs/lib/useTabs.ts:246-248`, `:458-461`, `:566-581`, `:1834`
**Bestehendes Pattern:** `src/modules/tabs/lib/useTabs.ts:2062-2075` (Produktiv-Pfad über `GapTarget`)

**Erwartete Beobachtung:**
`grep -rn "reorderTabsByGap" src --include=*.ts --include=*.tsx` findet außerhalb von `useTabs.ts` nur `reorderTabsByGap.test.ts`, und kein Aufruf hat ein viertes Argument. `grep -rn "breakOutPane(" src` findet einen Zahl-Aufruf nur in `useTabs.breakout.test.tsx`.

**Empfehlung:**
Kein Handlungszwang. Nach dem Feature-Merge die Bestandstests auf `GapTarget` umstellen und danach `reorderTabsByGap`, den Zahl-Zweig samt `gapIndexOf` und `insertTabAtSpaceGap` entfernen. Bleiben sie, den unbenutzten Parameter `groups` von `reorderTabsByGap` streichen und die Funktion als Test-Hülle kennzeichnen.

---

## Changed Files

| File | Lines Changed | Findings |
|------|---------------|----------|
| `src/modules/tabs/lib/useTabs.ts` | +1253 -663 | 5 |
