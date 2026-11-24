# Post-Implement Review Report

**Feature:** Tab-Gruppen (`specs/2026-11-23-tab-groups`)
**Branch:** tab-groups (HEAD `303c841`)
**Default-Branch:** main (Merge-Basis `9ce4d6b`)
**Datum:** 2026-11-24
**Perspektive:** quality+alignment (Teil A + Teil B)
**Teilbereich:** rules-and-persistence

**Prüfmenge (`git diff main...HEAD -- <scope>`):**
- `src/modules/tabs/lib/tabGroups.ts`
- `src/modules/tabs/lib/tabStripGap.ts`
- `src/modules/tabs/lib/selectTabAgentStatus.ts`
- `src/modules/spaces/lib/serialize.ts`
- `src/modules/spaces/lib/validate.ts`
- `src/modules/spaces/lib/store.ts`
- `src/modules/spaces/lib/useSpacePersistence.ts`
- `src/modules/spaces/lib/useSpacesBoot.ts`

**Nur als Beleg gelesen (nicht geprüft, andere Reviewer):** `src/modules/tabs/lib/useTabs.ts`, `src/app/App.tsx`, `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/TabGroupHeader.tsx`, `src/modules/terminal/lib/useTerminalPaneDnd.ts`, die Tests unter `src/modules/spaces/lib/` und `src/modules/tabs/lib/` (nur Testnamen und Aufbau). Kontext: `architecture.md`, `codebase-scan.md`, `discovery.md` (Auszüge).

**Nicht ausgeführt (Vorgabe im Auftrag):** Tests, Typprüfung, Build. Lint, Typprüfung und volle Suite sind laut Auftrag grün.

---

## Summary

**Verdict:** FAILED

4 Befunde: 1 × `fix`, 3 × `note`. Keiner davon ist `decision` oder `refuted`. Kein Logikfehler in der Prüfmenge gefunden; das Zusammenspiel Start → Tab-Zustand → Speicherung ist richtig verdrahtet (siehe „Zusammenspiel über Slice-Grenzen"). Alle Befunde betreffen Regeln oder Bausteine, die an zwei Stellen stehen.

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
| B.2 Abstraction Reuse | 2 |
| B.3 Schema Consistency | 0 |
| B.4 Dead Code / Unused Imports | 1 |
| B.5 Error Handling Divergence | 0 |
| B.6 Configuration Drift | 0 |
| B.7 Interface Inconsistency | 0 |
| B.8 Dependency Direction | 0 |
| B.9 Security Pattern Consistency | 0 |
| B.10 Performance Pattern Consistency | 0 |
| **Subtotal** | **4** |

| **Total** | **4** |

---

## Zusammenspiel über Slice-Grenzen (geprüft, ohne Befund)

**1. Übergibt der Start die geladenen Gruppen so, wie der Tab-Zustand sie erwartet, und greift danach die Aufklapp-Regel?** Ja.
- `useSpacesBoot.ts:96-104` sammelt je Space `hydrateSpace(...)`. `hydrateSpace` (`serialize.ts:347-382`) setzt `spaceId` jeder Gruppe auf den Space und normalisiert am Ende (`normalizeGroups`). Die Gruppen-Ids kommen aus demselben Zähler wie die Tab-Ids: `newGroupId(allocId)` (`tabGroups.ts:480-482`), `allocId` ist `nextIdRef` aus `useTabs` (`useTabs.ts:808`, Übergabe `App.tsx:326`). Ids stoßen also nicht zusammen, auch nicht über Spaces hinweg.
- Aufruf `replaceTabs(restored, activeTab.id, groups)` (`useSpacesBoot.ts:147`) passt zur Signatur `(next, nextActiveId, nextGroups?)` (`useTabs.ts:816-828`). `replaceTabs` läuft über `via` → `settle` (`useTabs.ts:655-668`): erst `normalizeGroups`, dann `expandActiveGroup` (`useTabs.ts:644-652`). Damit startet die Gruppe des aktiven Tabs aufgeklappt (BR-20). Test: `useTabs.groups.test.tsx:305` „expands only the active tab's group when state is replaced".
- Index des aktiven Tabs: Geschrieben wird er über alle speicherbaren Tabs des Space, eingeklappte Mitglieder eingeschlossen (`useSpacePersistence.ts:63-65`). Gelesen wird er über alle Tabs des Space (`useSpacesBoot.ts:140-146`, `{ all: true }`). Die Kommentar-Behauptung `useSpacesBoot.ts:138-139` stimmt also.

**2. Bekommt die Speicherung die Gruppen aus App.tsx und schreibt sie auch bei reinen Gruppen-Änderungen?** Ja.
- `App.tsx:172` holt `groups` aus `useTabs`, `App.tsx:333-339` reicht sie an `useSpacePersistence` weiter.
- `groups` steht in der Momentaufnahme (`useSpacePersistence.ts:35-36, 83`) und in den Effekt-Abhängigkeiten (`useSpacePersistence.ts:92`). Der Änderungs-Vergleich läuft über das Ergebnis von `serializeSpace` samt `groups` (`useSpacePersistence.ts:59, 68`). Umbenennen, Umfärben und Einklappen schreiben deshalb auch ohne Tab-Änderung.
- Ohne Gruppen-Änderung bleibt die Referenz von `groups` gleich (`tabGroups.ts:159-163`, `useTabs.ts:646-648`), es entstehen also keine zusätzlichen Schreibvorgänge. Tests: `useSpacePersistence.test.tsx:88`, `:121`, `:130-150`.

**3. Nutzen Tab-Zustand und Leiste die Regel-Funktionen, wie sie gebaut sind?** Im Kern ja.
- `useTabs` ruft `groupFromTab`, `assignToGroup`, `removeFromGroup`, `dissolveGroup`, `applyGapTarget`, `moveGroupBlock`, `moveGroupAcrossSpaces`, `activeAfterHide`, `tabForSpaceSwitch` und `normalizeGroupName` (`useTabs.ts:2069-2198`, `:621`, `:2143`).
- Die Leiste zeichnet aus `stripLayout` (`TabBar.tsx:191`) und prüft Treffer mit `gapTargetAt` (`TabBar.tsx:305, 325`).
- Der Kopf nutzt `groupAggregateStatus` (`TabGroupHeader.tsx:306`).
- Zweite Kopien gibt es an drei Stellen: RV-1 (Farbregel), RV-2 (Zähl-Einheit der Lücken in der Leiste) und RV-3 (Gruppen-Gültigkeit und Platzierung am Ende des Space).

---

## Findings

### RV-1: Farbregel VAL-2 steht zweimal (B.1-1, Klasse `fix`)

**Kategorie:** B.1

**Problem:**
Die Regel „die Gruppenfarbe ist eine ganze Zahl innerhalb der Palette, sonst gilt die erste Farbe" (VAL-2) ist zweimal unabhängig geschrieben:
- beim Laden in `readGroupEntry` (`src/modules/spaces/lib/validate.ts:31-36`)
- im Tab-Zustand als private Funktion `validGroupColor` (`src/modules/tabs/lib/useTabs.ts:743-747`), die `setGroupColor` nutzt (`useTabs.ts:2147-2151`)

Für die Schwester-Regel VAL-1 hat das Feature selbst das Muster mit einer einzigen Quelle gewählt: `normalizeGroupName` (`src/modules/tabs/lib/tabGroups.ts:470-477`), aufgerufen beim Laden (`validate.ts:38`) und beim Umbenennen (`useTabs.ts:2143`). Heute liefern beide Farb-Kopien dasselbe. Wird die Regel an einer Stelle geändert, etwa ein anderer Ersatzwert oder eine andere Palette für Gruppen, dann laden und setzen die beiden Wege unterschiedliche Farben.

**Neuer Code:** `src/modules/spaces/lib/validate.ts:31`
**Bestehendes Pattern:** `src/modules/tabs/lib/tabGroups.ts:470` (`normalizeGroupName`, eine Quelle für VAL-1 mit zwei Aufrufern); Kopie `src/modules/tabs/lib/useTabs.ts:743`

**Erwartete Beobachtung:** `grep -n "SPACE_COLORS.length" src/modules/spaces/lib/validate.ts src/modules/tabs/lib/useTabs.ts` findet zwei Stellen mit demselben Prädikat `Number.isInteger(x) && x >= 0 && x < SPACE_COLORS.length ? x : 0`. `grep -rn "function normalizeGroupName" src` findet genau eine Definition.

**Empfehlung:**
`normalizeGroupColor(v: unknown): number` in `tabGroups.ts` neben `normalizeGroupName` exportieren. `validate.ts:31-36` und `useTabs.ts:2149` darauf umstellen und `validGroupColor` entfernen.

---

### RV-2: Zähl-Einheit der Lücken und Ablege-Regel für Gruppen stehen in der Leiste ein zweites Mal (B.2-1, Klasse `note`)

**Kategorie:** B.2

**Problem:**
`GapTarget.index` zählt über „gezeichnete Elemente": ein Kopf ist ein Element, Mitglieder zählen nur bei aufgeklappter Gruppe, je eins (`tabGroups.ts:20-22`). Die Regel-Seite kodiert das in der privaten Funktion `drawnElements` (`src/modules/tabs/lib/tabGroups.ts:315-326`). `applyGapTarget` (`tabGroups.ts:367-371`) und `moveGroupBlock` (`tabGroups.ts:394-398`) übersetzen den Index damit in Array-Positionen.

Die Leiste rechnet dieselbe Einheit zweimal selbst nach:
- `TabBar.tsx:196-214` (`tabIndex`/`groupRange` für die Einfüge-Marke)
- `TabBar.tsx:842-854` (`drawnCount` für `lineAt`)

Dazu steht die Regel „eine Gruppe landet nie in einer anderen, sondern direkt dahinter" (`tabGroups.ts:378`, `:391-392`) für die Marke ein zweites Mal in `TabBar.tsx:415-419`.

Heute stimmen alle drei überein. Wird eine Seite geändert, zeigt die Marke eine andere Stelle als die, an der der Tab oder die Gruppe beim Loslassen landet. Weil `drawnElements` privat ist, kann die Leiste die Regel-Funktion gar nicht nutzen.

**Neuer Code:** `src/modules/tabs/lib/tabGroups.ts:315`
**Bestehendes Pattern:** `src/modules/tabs/TabBar.tsx:196-214`, `:415-419`, `:842-854` (Kopien in der Leiste; Datei außerhalb der Prüfmenge, nur als Beleg)

**Erwartete Beobachtung:** `grep -n "export function drawnElements" src/modules/tabs/lib/tabGroups.ts` findet nichts. `tabGroups.ts:323`, `TabBar.tsx:208` und `TabBar.tsx:854` tragen jeweils die Bedingung „Mitglieder zählen nur, wenn `!collapsed`".

**Empfehlung:**
Eine Ableitung aus `stripLayout` in `tabGroups.ts` exportieren, die Start-Index je Eintrag, Index je Tab und Ende je Gruppe liefert, ebenso den Ziel-Index beim Ziehen einer Gruppe. `drawnElements`, die Marke in `TabBar` und `lineAt` sollten sie gemeinsam nutzen. Ohne Umbau den Befund als Grenze im PR vermerken.

---

### RV-3: Gruppen-Gültigkeit und Platzierung am Ende des Space in Nutzern nachgebaut (B.2-2, Klasse `note`)

**Kategorie:** B.2

**Problem:**
`tabGroups.ts` hält zwei Regel-Bausteine privat. Nutzer bauen sie deshalb nach:
- **Gültigkeit der Zugehörigkeit** (Verweis zählt nur bei bekannter Gruppe im selben Space, VAL-4/BR-1): `groupsById` und `validGroupOf` (`tabGroups.ts:64-75`). `serializeSpace` schreibt dieselbe Prüfung neu (`src/modules/spaces/lib/serialize.ts:316`, `:323-324`).
- **Platzierung „hinter den letzten Tab des Space, sonst ans Ende"**: `insertBlock(tabs, block, spaceId, null)` (`tabGroups.ts:168-183`, so genutzt von `moveGroupAcrossSpaces`, `tabGroups.ts:429`). `useTabs` hat dafür eine eigene Fassung `appendToSpace` (`useTabs.ts:281-289`), genutzt für neue Terminals beim Einklappen, beim Verschieben und beim Schließen einer Gruppe (`useTabs.ts:729, 2205, 2255`).

Heute liefern beide Paare dasselbe Ergebnis. Die Regel steht aber je zweimal.

**Neuer Code:** `src/modules/spaces/lib/serialize.ts:323`
**Bestehendes Pattern:** `src/modules/tabs/lib/tabGroups.ts:68-75` (`validGroupOf`); `src/modules/tabs/lib/tabGroups.ts:168-183` (`insertBlock`); Kopie `src/modules/tabs/lib/useTabs.ts:281-289` (außerhalb der Prüfmenge)

**Erwartete Beobachtung:** `serialize.ts:323-324` und `tabGroups.ts:72-74` prüfen beide `byId.get(tab.groupId)` und `g.spaceId === tab.spaceId`. `appendToSpace(tabs, t)` und `insertBlock(tabs, [t], t.spaceId, null)` liefern für jede Eingabe dieselbe Reihenfolge.

**Empfehlung:**
`validGroupOf` (oder eine Funktion `groupOfTab(state, tab)`) und die Platzierung am Ende des Space aus `tabGroups.ts` exportieren. `serializeSpace` und `useTabs` darauf umstellen. Ohne Umbau als Grenze vermerken.

---

### RV-4: `gapIndexAt` hat keinen Produktiv-Aufrufer mehr (B.4-1, Klasse `note`)

**Kategorie:** B.4

**Problem:**
Auf `main` rufen `TabBar.tsx:232` und `useTerminalPaneDnd.ts:209` die Funktion `gapIndexAt` auf (`git show main:...`). Auf dem Branch rufen beide stattdessen `gapTargetAt` auf (`TabBar.tsx:305, 325`, `useTerminalPaneDnd.ts:210`). `gapIndexAt` (`src/modules/tabs/lib/tabStripGap.ts:48-55`) wird nur noch in Tests aufgerufen: `tabStripGap.test.ts:29-48` und als Vergleichswert in `gapTargetAt.test.ts:54`. `gapTargetAt` hat eine eigene Kopie der Halbbreiten-Schleife (`tabStripGap.ts:83-99`).

INV-5 nennt `TabBar.tsx:232` und `useTerminalPaneDnd.ts:209` als Nutzer. Seine Tests prüfen jetzt eine Funktion, die kein Produktiv-Pfad mehr aufruft; geschützt ist das Produktiv-Verhalten nur noch über den Vergleich in `gapTargetAt.test.ts:54`. Bei `reorderTabsByGap` liegt der Fall genauso (`useTabs.ts:568`, INV-4; außerhalb der Prüfmenge): auf `main` von `useTabs.ts:1683` aufgerufen, auf dem Branch nur noch von Tests.

MIG-2 verlangt `gapIndexAt` „unverändert". Das ist eingehalten, deshalb ist der Befund nur ein Hinweis.

**Neuer Code:** `src/modules/tabs/lib/tabStripGap.ts:83-99`
**Bestehendes Pattern:** `src/modules/tabs/lib/tabStripGap.ts:48-55` (`gapIndexAt`, auf `main` von `TabBar.tsx:232` und `useTerminalPaneDnd.ts:209` aufgerufen)

**Erwartete Beobachtung:** `grep -rn "gapIndexAt(" src --include=*.ts --include=*.tsx | grep -v "\.test\."` findet nur die Definition `tabStripGap.ts:48`.

**Empfehlung:**
Eine von zwei Möglichkeiten wählen:
- `gapTargetAt` und `gapIndexAt` teilen sich eine Schleife, so wie SVC-10 es vorsieht („Zähl-Kern `gapIndexAt`").
- Die INV-5-Tests auf `gapTargetAt` umziehen und `gapIndexAt` entfernen.

Bei `reorderTabsByGap` gilt dieselbe Wahl. Bis dahin sollte die Zeile in INV-5 die neuen Nutzer nennen.

---

## Changed Files

| File | Lines Changed | Findings |
|------|---------------|----------|
| `src/modules/tabs/lib/tabGroups.ts` | +482 -0 | 1 (RV-2) |
| `src/modules/tabs/lib/tabStripGap.ts` | +54 -0 | 1 (RV-4) |
| `src/modules/tabs/lib/selectTabAgentStatus.ts` | +16 -0 | 0 |
| `src/modules/spaces/lib/serialize.ts` | +94 -2 | 1 (RV-3) |
| `src/modules/spaces/lib/validate.ts` | +36 -0 | 1 (RV-1) |
| `src/modules/spaces/lib/store.ts` | +3 -1 | 0 |
| `src/modules/spaces/lib/useSpacePersistence.ts` | +21 -14 | 0 |
| `src/modules/spaces/lib/useSpacesBoot.ts` | +16 -6 | 0 |

Zeilenzahlen aus `git diff main...HEAD --numstat`.
