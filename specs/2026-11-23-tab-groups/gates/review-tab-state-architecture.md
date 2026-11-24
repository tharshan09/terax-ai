# Design Conformance Report

**Feature:** Tab-Gruppen (Teil „tab-state")
**Branch:** tab-groups
**Datum:** 2026-11-24
**Diff-Scope:** Prüfmenge: `src/modules/tabs/lib/useTabs.ts` (`git diff main...HEAD -- src/modules/tabs/lib/useTabs.ts`)
**Modus:** full
**Architecture:** `specs/2026-11-23-tab-groups/architecture.md`
**Bindings:** —

---

## Verdict

FAILED

| Kategorie | Anzahl |
|---|---|
| Design Violations | 3 |
| Bindings Net Hits | 0 |
| Exceptions Applied | 0 |

Befund-Klassen: 2 × `fix`, 1 × `note`. Kein Befund der blockierenden Klassen `decision` oder `refuted`.

---

## Design Violations

### DV-1: medium
- **Datei:** `src/modules/tabs/lib/useTabs.ts:893`
- **Design Ref:** build-plan.md → „Entscheidungen ohne Vorgabe", Zeile 227 (Tab im Space-Überblick innerhalb desselben Space an einen anderen Tab gezogen); architecture.md → SVC-14 (Z. 151), SVC-8 (Z. 145), Trade-off „Aufklappen über eine Regel am aktiven Tab" (Z. 436: „Aktionen, die bewusst eingeklappt lassen, müssen den aktiven Tab im selben Schritt wechseln")
- **Erwartet:** Der Bauplan legt fest: Der gezogene Tab übernimmt die Zugehörigkeit des Ziel-Tabs. War er aktiv und ist die Gruppe des Ziel-Tabs eingeklappt, wird ein Nachbar aktiv, wie beim Ablegen auf einem eingeklappten Kopf (SVC-8 über `keepActiveVisible`, notfalls ein neues Terminal). Die Gruppe bleibt eingeklappt.
- **Aktuell:** `reorderTab` (useTabs.ts:885–921) setzt die Zugehörigkeit des Ziel-Tabs (`withGroupId(…, onto.groupId)`, Z. 899–902). Einen Nachfolger berechnet es nur bei einem Wechsel in einen anderen Space (Z. 907–910). Liegt der Ziel-Tab im selben Space in einer eingeklappten Gruppe, bleibt `activeId` auf dem gezogenen Tab. `settle` → `expandActiveGroup` (Z. 644–668) klappt die Gruppe dann auf. Bei `reorderTabByGap` (Z. 2069–2070) und `addTabToGroup` (Z. 2099–2101) läuft dagegen `keepActiveVisible`. Der Fall ist in der App erreichbar: Der Space-Überblick listet alle Tabs, auch die Mitglieder eingeklappter Gruppen (`src/modules/spaces/SpaceSwitcher.tsx:108–116` gruppiert das ungefilterte `tabs`, `src/app/App.tsx:1468` übergibt `tabs={tabs}`), und ein Ablegen auf einem Tab ruft `onReorderTab` (`SpaceSwitcher.tsx:223`). Der Test `useTabs.groups.test.tsx:599–611` („takes the target's group in the space overview") prüft nur eine aufgeklappte Gruppe.
- **Erwartete Beobachtung:** Hook-Test mit Space a = [t1, G1(t2, t3) eingeklappt, t4], aktiv t4, dann `reorderTab(t4, t2, "top")`. Ergebnis: `groups` enthält G1 mit `collapsed: false`, `activeId` ist t4. Nach dem Bauplan sollte G1 eingeklappt bleiben und t1 aktiv sein.
- **Empfehlung:** Im Updater von `reorderTab` den Fall „gleicher Space" wie `reorderTabByGap` durch `keepActiveVisible` führen. Für den Fall „kein sichtbarer Tab" braucht `reorderTab` ein `spawn` (`lazyTerminal`); dazu einen optionalen letzten Parameter `spawnCwd` ergänzen, wie es die anderen Aktionen tun (Entscheidung „optionaler letzter Parameter", build-plan.md:231). `App.handleReorderTab` reicht dann `inheritedCwdForNewTab()` durch. Den Fall in `useTabs.groups.test.tsx` ergänzen.
- **Klasse:** fix

### DV-2: low
- **Datei:** `src/modules/tabs/lib/useTabs.ts:743`
- **Design Ref:** build-plan.md → slice-02 „Nicht in diesem Slice", Zeile 761 („Keine eigenen Regeln neben `tabGroups.ts`"); architecture.md → Layer Responsibilities (Z. 225: Gruppen-Regeln als reine Funktionen in `tabGroups.ts`), VAL-2 (Z. 180), API-6 (Z. 75: „Farbe nach VAL-2 setzen")
- **Erwartet:** Die Regel VAL-2 („ganze Zahl, die eine Farbe der Space-Palette bezeichnet, sonst die erste Farbe") gibt es einmal als reine Funktion in `tabGroups.ts`. API-6 und das Laden nutzen dieselbe Stelle. VAL-1 ist schon so gebaut: `normalizeGroupName` (`tabGroups.ts:470`) nutzen sowohl `useTabs.ts:2143` als auch `validate.ts:39`.
- **Aktuell:** `useTabs.ts:743–747` hat eine eigene private Funktion `validGroupColor` (`Number.isInteger(color) && color >= 0 && color < SPACE_COLORS.length ? color : 0`), genutzt in `setGroupColor` (Z. 2149). In `src/modules/spaces/lib/validate.ts:31–36` steht dieselbe Regel noch einmal inline. Damit gibt es VAL-2 zweimal, und eine Gruppen-Regel liegt neben `tabGroups.ts`.
- **Erwartete Beobachtung:** `grep -n "SPACE_COLORS.length" src/modules/tabs/lib/useTabs.ts src/modules/spaces/lib/validate.ts` liefert zwei voneinander unabhängige Fassungen derselben Bereichsprüfung (`useTabs.ts:744`, `validate.ts:34`). `tabGroups.ts` exportiert keine Farb-Prüfung.
- **Empfehlung:** Eine reine Funktion, z. B. `normalizeGroupColor(value: unknown): number`, in `tabGroups.ts` anlegen und mit Test versehen (Muster: `normalizeGroupName`). `validGroupColor` in `useTabs.ts` und die Inline-Prüfung in `validate.ts` durch Aufrufe dieser Funktion ersetzen.
- **Klasse:** fix

### DV-3: low
- **Datei:** `src/modules/tabs/lib/useTabs.ts:898`
- **Design Ref:** architecture.md → SVC-14 (Z. 151: „ändert die Space-Zuordnung … und löst dabei seine Gruppen-Zugehörigkeit"); discovery.md → BR-17 (Z. 242); build-plan.md → Entscheidung Zeile 227 (ausdrücklich „innerhalb desselben Space"); AC 20 (build-plan.md:708–711, nur loser Ziel-Tab)
- **Erwartet:** Für ein Ablegen im Space-Überblick auf einem Tab, der in einem anderen Space in einer Gruppe liegt, macht weder die Architektur noch der Bauplan eine Vorgabe. BR-17 und SVC-14 regeln nur das Verlassen der eigenen Gruppe. Die Entscheidung in Zeile 227 gilt nur für denselben Space.
- **Aktuell:** `reorderTab` ruft zuerst `changeTabSpace` (Z. 898, löst die eigene Gruppe, SVC-14 erfüllt) und setzt danach `onto.groupId` (Z. 899–902). Damit wird der Tab Mitglied der Gruppe des Ziel-Tabs im Ziel-Space. Der Kommentar Z. 882–884 („inheriting the target's space and group") beschreibt das. Dokumentiert oder getestet ist es nicht.
- **Erwartete Beobachtung:** Hook-Test mit Space a = [t1, G1(t2, t3)], Space b = [t7, G5(t8, t9)], dann `reorderTab(t1, t8, "top")`. Danach gilt für t1 `spaceId: "b"` und `groupId: "G5"`, die Leiste von b ist [t7, G5(t1, t8, t9)].
- **Empfehlung:** Das Verhalten als Entscheidung in den Bauplan aufnehmen, als Erweiterung von Zeile 227 auf Ziel-Tabs in anderen Spaces mit derselben Begründung („landet genau an der gezeigten Stelle"), und mit einem Test absichern. Soll der Tab stattdessen lose ankommen, `withGroupId` im Fall „anderer Space" auslassen; `normalizeGroups` stellt ihn dann hinter G5.
- **Klasse:** note

---

## Bindings Net Hits

Keine. `bindings_path` ist `null` (architecture.md:477: kein `bindings.md`), daher kein Sicherheitsnetz C.6.

---

## Exceptions Applied (Audit)

Keine.

---

## Prüfmenge

Geprüft: `src/modules/tabs/lib/useTabs.ts`. Die ganze Datei wurde gelesen (2325 Zeilen) und mit `main:src/modules/tabs/lib/useTabs.ts` verglichen.

Nur als Beleg gelesen, selbst nicht geprüft: `src/modules/tabs/lib/tabGroups.ts`, `src/modules/spaces/lib/validate.ts`, `src/modules/spaces/SpaceSwitcher.tsx` (Z. 100–235), `src/app/App.tsx` (Z. 1035–1050, 1420–1490), `src/modules/tabs/lib/resolveFileTabOpen.ts`, `src/modules/tabs/lib/useTabs.groups.test.tsx`.

Nicht geprüft, weil außerhalb der Prüfmenge (dafür sind andere Reviewer zuständig): alle übrigen Dateien des Diffs, also `src/app/App.tsx`, `src/app/components/CloseDialogs.tsx`, `src/app/hooks/useTabCloseGuards.ts`, `src/modules/command-palette/commands.ts`, `src/modules/header/Header.tsx`, `src/modules/spaces/components/InlineRename.tsx`, `src/modules/spaces/lib/serialize.ts`, `src/modules/spaces/lib/store.ts`, `src/modules/spaces/lib/useSpacePersistence.ts`, `src/modules/spaces/lib/useSpacesBoot.ts`, `src/modules/spaces/lib/validate.ts`, `src/modules/tabs/TabActivityIndicator.tsx`, `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/TabGroupHeader.tsx`, `src/modules/tabs/index.ts`, `src/modules/tabs/lib/selectTabAgentStatus.ts`, `src/modules/tabs/lib/tabGroups.ts`, `src/modules/tabs/lib/tabStripGap.ts`, `src/modules/terminal/TerminalStack.tsx`, `src/modules/terminal/lib/paneDndStore.ts`, `src/modules/terminal/lib/useTerminalPaneDnd.ts`, `src/modules/terminal/lib/useTerminalSession.ts`, alle Testdateien und `specs/**`.

Laut Auftrag nicht ausgeführt: Tests, Typprüfung, Build. Lint, Typprüfung und Suite sind laut Aufrufer grün.

---

## Notes

Abgleich der vorgegebenen Referenzen gegen `useTabs.ts`. Der Status gilt für die Prüfmenge; „erfüllt" heißt: am Code nachvollzogen, ohne Abweichung.

| Referenz | Stelle in useTabs.ts | Ergebnis |
|---|---|---|
| API-1 `createGroupFromTab` | 2079–2092 | erfüllt: `groupFromTab` mit Id aus `newGroupId(nextIdRef)` (Entscheidung Gruppen-Ids). `flushSync` liefert die tatsächlich angelegte Id, bei fehlendem Tab `null`. Der aktive Tab bleibt. |
| API-2 `addTabToGroup` | 2094–2106 | erfüllt: `assignToGroup` (VAL-4), danach `keepActiveVisible` → SVC-8, notfalls neues Terminal lose am Ende |
| API-3 `removeTabFromGroup` | 2108–2112 | erfüllt: `removeFromGroup` |
| API-4 `ungroup` | 2114–2118 | erfüllt: `dissolveGroup`, der aktive Tab bleibt |
| API-5 `renameGroup` | 2141–2145 | erfüllt: VAL-1 über `normalizeGroupName` |
| API-6 `setGroupColor` | 2147–2151 | Verhalten erfüllt, Ort der Regel siehe DV-2 |
| API-7 `toggleGroupCollapsed` | 2153–2167 | erfüllt: Umklappen und Wechsel des aktiven Tabs in einem Updater (SVC-8, neues Terminal mit `spawnCwd`) |
| API-8 `reorderTabByGap` | 2062–2075 | erfüllt: `applyGapTarget` + `keepActiveVisible` (BR-12) |
| API-9 `moveGroupByGap` | 2169–2176 | erfüllt: `moveGroupBlock` |
| API-10 `moveGroupToSpace` | 2181–2212 | erfüllt: VAL-5 (Space existiert, nicht derselbe), SVC-12, aktiver Tab nach SVC-8, leerer Herkunfts-Space bekommt ein Terminal, der aktive Space bleibt |
| API-11 (nur `closeGroup`) | 2217–2263 | erfüllt: Nachfolger wie beim Einzel-Schließen (Entscheidung build-plan.md:222), geleerter Space bekommt ein Terminal (BR-25). Rückfrage-Teil liegt außerhalb der Prüfmenge. |
| API-12 `breakOutPane` / Undo | 416–472, 1831–1943 | erfüllt: `GapTarget` mit Gruppen → `applyGapTarget`. Undo entfernt den neuen Tab; die Zugehörigkeit der übrigen Tabs bleibt unberührt. |
| SVC-3 | 654–668 (`settle`) | erfüllt: Jeder `setState` läuft über `via`/`onTabs`/`activate` → `settle` → `normalizeGroups`. Kurzweg nur, wenn es weder Gruppen noch `groupId` gibt. |
| SVC-7 | 540–564 | erfüllt: erst sichtbar links, dann rechts, dann der nächstgelegene eingeklappte Tab; `null` nur beim letzten Tab des Space. Alle 9 Aufrufer in der Datei übergeben die Gruppen. |
| SVC-9 | 643–652, 660 | erfüllt: Die Aufklapp-Regel steht an genau einer Stelle (`expandActiveGroup` in `settle`). Ausnahmen gibt es nur über den Wechsel des aktiven Tabs im selben Schritt (`keepActiveVisible`, `breakOutPane`). |
| SVC-14 | 262–272 | erfüllt: einziger Schreiber von `spaceId` eines bestehenden Tabs; aufgerufen von `moveTabToSpace` (865) und `reorderTab` (898). Zur Gruppen-Zuordnung danach siehe DV-1 und DV-3. |
| SVC-17 | 621–625 | erfüllt: `planSpaceRemoval` wählt den Tab im Ausweich-Space über `tabForSpaceSwitch`; ohne Gruppen ist das gleich mit `main`. |
| MIG-1 | ganze Datei | erfüllt bis auf DV-1 und DV-2: Das Sweep-Kriterium (`grep -nE "spaceId (===\|!==)"`) liefert nur Vergleiche einzelner Tabs (268, 502, 862, 892, 908, 1197, 1858, 1928). Jede Streifen-Ableitung läuft über `visibleTabsInSpace`. `resolveFileTabOpen.ts` ist unverändert. |
| INV-1, INV-2 | 540–564 | ohne Gruppen gleich mit `main` (`shown` = alle Tabs des Space); Testdatei unverändert |
| INV-3 | 252–259, 1614–1623 | erfüllt; App übergibt immer `spaceId` (App.tsx:1042–1045) |
| INV-4 | 568–581 | ohne Gruppen gleich mit `main` (am Code nachgerechnet); andere Spaces bleiben unberührt (`insertTab` vor einer Id) |
| INV-7 | 604–637, 923–958 | erfüllt; der Updater liest jetzt `s.activeId` statt `activeIdRef` |
| INV-8 | 416–514, 1831–1943 | erfüllt; ohne Gruppen gleich mit `insertTabAtSpaceGap` |
| INV-11 | 1171–1213 | erfüllt; Aktivierung über `settle`, dadurch klappt die Gruppe auf |
| INV-17 | 858–880, 885–921 | erfüllt; Nachfolger und „Ansicht folgt" mit Gruppen |

Alle Testdateien im Diff sind neu (`git diff --name-status`: nur `A`). Damit ist keine bestehende Testdatei geändert (NFR-5, zweites Sweep-Kriterium).
