# Design Conformance Report

**Feature:** Tab-Gruppen (Teil „wiring-and-close")
**Branch:** tab-groups
**Datum:** 2026-11-24
**Diff-Scope:** Prüfmenge: `src/app/App.tsx`, `src/modules/header/Header.tsx`, `src/modules/tabs/index.ts`, `src/modules/terminal/TerminalStack.tsx`, `src/modules/terminal/lib/paneDndStore.ts`, `src/modules/terminal/lib/useTerminalPaneDnd.ts`, `src/modules/terminal/lib/useTerminalSession.ts`, `src/app/hooks/useTabCloseGuards.ts`, `src/app/components/CloseDialogs.tsx`, `src/modules/command-palette/commands.ts` (`git diff main...HEAD -- <scope>`)
**Modus:** full
**Architecture:** `specs/2026-11-23-tab-groups/architecture.md`
**Bindings:** —

---

## Verdict

FAILED

Beide Befunde haben die Klasse `note`. Nach G4 blockiert keiner davon. Das Verdict ergibt sich trotzdem binär aus der Zahl der Befunde.

| Kategorie | Anzahl |
|---|---|
| Design Violations | 2 |
| Bindings Net Hits | 0 |
| Exceptions Applied | 0 |

---

## Design Violations

### DV-1 — low
- **Datei:** `src/modules/tabs/index.ts:2-10`
- **Design Ref:** architecture.md → Migration Map → MIG-4 (Target Pattern: „Zusätzlich Gruppen-Typen und die von App.tsx und spaces gebrauchten Funktionen"). Dazu Architecture Layers: Die Koordination umfasst `src/app/App.tsx` und `useTabCloseGuards`.
- **Erwartet:** Die öffentliche Schnittstelle `@/modules/tabs` führt die Gruppen-Funktionen, die die Koordination und `src/modules/spaces` brauchen. Die Aufrufer beziehen sie darüber.
- **Aktuell:** `index.ts` exportiert als Funktionen nur `visibleTabsInSpace` und `tabForSpaceSwitch`; diese beiden braucht App.tsx. Die übrigen Aufrufer importieren direkt aus `@/modules/tabs/lib/tabGroups`:
  - `planGroupClose` in `src/app/hooks/useTabCloseGuards.ts:10`. Dieselbe Datei holt `nextActiveInSpace` und die Typen über den Index (Zeilen 4-9), mischt also beide Wege.
  - `normalizeGroupName` in `src/modules/spaces/lib/validate.ts:1`.
  - `newGroupId` und `normalizeGroups` in `src/modules/spaces/lib/serialize.ts:19-24`.
  - `visibleTabsInSpace` in `src/modules/spaces/lib/useSpacesBoot.ts:4`, obwohl der Index die Funktion führt.

  Die Abweichung steht nur als Plan-Abweichung im Bauplan (`build-plan.md:380`, slice-00 „Wie gebaut"). Im Gate-Log gibt es dazu keine Entscheidung.

  Was für den Direktimport spricht:
  - Er ist im Bestand üblich: `main:src/modules/spaces/lib/serialize.ts:7-14` und `main:src/modules/spaces/lib/useSpacesBoot.ts:4` importieren direkt aus `tabs/lib/useTabs`, ebenso `src/app/App.tsx:125`, obwohl der Index `DEFAULT_SPACE_ID` exportiert.
  - Das Modul `tabs` importiert seinerseits aus `spaces` (`src/modules/tabs/lib/tabGroups.ts:1`, `src/modules/tabs/TabGroupHeader.tsx:15-18`). Ein Import aus `spaces/lib` über den Index würde also `TabBar` samt `spaces`-Komponenten mitladen.
- **Erwartete Beobachtung:**
  - `grep -nE "planGroupClose|normalizeGroupName|normalizeGroups|newGroupId" src/modules/tabs/index.ts` liefert keinen Treffer.
  - `grep -rn "@/modules/tabs/lib/tabGroups" src/app src/modules/spaces --include=*.ts --include=*.tsx | grep -v test` trifft `useTabCloseGuards.ts:10`, `useSpacesBoot.ts:4`, `validate.ts:1` und `serialize.ts:24`.
- **Klasse:** note
- **Empfehlung:** Die Abweichung als Entscheidung festhalten und MIG-4 berichtigen: Typen laufen über `index.ts`, Funktionen für `spaces` und `src/app/hooks` werden wie im Bestand direkt importiert. Alternativ führt `index.ts` die vier Funktionen, und `useTabCloseGuards.ts` stellt um. Bei `spaces` ist das wegen der Import-Richtung `tabs` → `spaces` nicht ratsam. Keine Verhaltensfolge.

### DV-2 — low
- **Datei:** `src/app/hooks/useTabCloseGuards.ts:21-30`, `src/app/hooks/useTabCloseGuards.ts:59-66`, `src/modules/terminal/lib/useTerminalSession.ts:961-979`
- **Design Ref:** architecture.md → Existing-Behavior Invariants → INV-14 („… verlangt eine Rückfrage, sonst schließt der Tab sofort"). Dazu Migration Map → Sweep criterion, zweites Kriterium: Eine Änderung an INV-Zeilen ist eine Entscheidung. Entscheidung: `gates/gate-log.jsonl:61`.
- **Erwartet:** Jede bewusste Änderung an einer Schutz-Invariante steht in der zugehörigen Entscheidung unter `deviates` (Gate-Log-Contract, Self-Check „Sagt eine Kennung nach meiner Wahl etwas anderes als vorher?").
- **Aktuell:** Scheitert die Prozess-Abfrage eines Terminals, liefert `leafForegroundCheck` den Wert `"failed"` (`useTerminalSession.ts:971-978`). `closeConfirmReason` macht daraus `"process"` (`useTabCloseGuards.ts:29`), und `handleClose` öffnet „Close Terminal?" (`useTabCloseGuards.ts:64-66`). Auf `main` schloss derselbe Tab sofort: `main:src/modules/terminal/lib/useTerminalSession.ts:969-975` gab `false` zurück, `main:src/app/hooks/useTabCloseGuards.ts:34-42` rief danach `disposeTab`. Die Entscheidung `gate-log.jsonl:61` deckt das Verhalten: `choice` nennt „beim Schliessen eines Tabs oder einer Gruppe", `req_ids` enthält INV-14. Sie trägt aber `"deviates": []`. Die Abweichung des Einzel-Schließens von INV-14 erscheint deshalb nicht im Abschnitt „Abweichungen" des Abschlussberichts.
- **Erwartete Beobachtung:**
  - Test `src/app/hooks/useTabCloseGuards.test.ts:89` („treats a failed process check as a running process") belegt `"process"` bei `"failed"`.
  - Ruft man `handleClose(t)` für ein Terminal, dessen Abfrage `"failed"` liefert, wird `pendingTerminalCloseTab` gesetzt und nicht `disposeTab` gerufen.
  - `sed -n 61p specs/2026-11-23-tab-groups/gates/gate-log.jsonl` zeigt `"req_ids": ["BR-15","INV-14","SVC-13"]` und `"deviates": []`.
- **Klasse:** note
- **Empfehlung:** INV-14 in `deviates` der Entscheidung aufnehmen oder INV-14 um „eine gescheiterte Prüfung zählt als laufend" verfeinern. Der Code bleibt unverändert, denn die Entscheidung trägt das Verhalten.

---

## Bindings Net Hits

Keine.

---

## Exceptions Applied (Audit)

Keine.

---

## Prüfmenge

**Geprüft (alle Kriterien C.1 bis C.5; C.6 entfällt, `bindings_path` = null):**
- `src/app/App.tsx`
- `src/modules/header/Header.tsx`
- `src/modules/tabs/index.ts`
- `src/modules/terminal/TerminalStack.tsx`
- `src/modules/terminal/lib/paneDndStore.ts`
- `src/modules/terminal/lib/useTerminalPaneDnd.ts`
- `src/modules/terminal/lib/useTerminalSession.ts`
- `src/app/hooks/useTabCloseGuards.ts`
- `src/app/components/CloseDialogs.tsx`
- `src/modules/command-palette/commands.ts`

**Nicht geprüft:**
- Außerhalb der Prüfmenge (andere Reviewer): die übrigen Dateien des Feature-Diffs. Das sind `src/modules/tabs/lib/useTabs.ts`, `src/modules/tabs/lib/tabGroups.ts`, `src/modules/tabs/lib/tabStripGap.ts`, `src/modules/tabs/lib/selectTabAgentStatus.ts`, `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/TabGroupHeader.tsx`, `src/modules/tabs/TabActivityIndicator.tsx`, `src/modules/spaces/lib/serialize.ts`, `src/modules/spaces/lib/store.ts`, `src/modules/spaces/lib/validate.ts`, `src/modules/spaces/lib/useSpacePersistence.ts`, `src/modules/spaces/lib/useSpacesBoot.ts`, `src/modules/spaces/components/InlineRename.tsx` und alle 13 neuen Testdateien. Gelesen habe ich davon nur `useTabs.ts` (`nextActiveInSpace`, `closeGroup`, `toggleGroupCollapsed`, `keepActiveVisible`, `closeTab`), `tabGroups.ts` (`visibleTabsInSpace`, `planGroupClose`, `tabForSpaceSwitch`), `tabStripGap.ts` (`gapTargetAt`) und `useTabCloseGuards.test.ts`, und zwar nur als Beleg für die Verdrahtung.
- Nicht ausgeführt: INV-12 bis INV-15 sind in der Architecture als `uncovered` / `qa_matrix` geführt. Ich habe sie nur statisch am Code geprüft und nicht in der laufenden App. Tests, Typprüfung und Build liefen laut Auftrag nicht.

---

## Notes

Prüfergebnis je Vorgabe aus dem Auftrag, ohne Befund, soweit nicht oben genannt:

**API und Services**
- **API-11:** In Ordnung. `requestCloseGroup` (`useTabCloseGuards.ts:104-120`) schließt bei `m = 0` sofort, sonst setzt es einen Plan. Bestätigen und Abbrechen stehen in den Zeilen 122-129. Danach folgt das neue Terminal über `disposeGroup` mit `closeGroup(groupId, inheritedCwdForNewTab())` (`App.tsx:620-630`). Die Namen `confirmGroupClose` und `cancelGroupClose` statt `confirmCloseGroup` und `cancelCloseGroup`, beide ohne `groupId`, folgen dem Vertrag des Bauplans (slice-00 „Liefert", `useTabCloseGuards (Rückgabe)`). Sie wirken auf den einen offenen Plan. Kein Befund.
- **API-13, UI-10, MIG-14:** In Ordnung. `commands.ts:244-274` liefert:
  - `tab.group.new`, immer sichtbar;
  - `tab.group.remove` und `tab.group.toggle`, nur wenn der aktive Tab einer Gruppe angehört;
  - die Aufrufe von API-1 (über `handleCreateGroup`, das das Namensfeld öffnet, Bauplan-Entscheidung 12), API-3 und API-7 (mit `spawnCwd`, `App.tsx:1521-1524`);
  - keinen neuen Laufzeit-Import aus `@/modules/tabs`.
- **SVC-1, Zuordnung der Verbraucher:** In Ordnung.
  - Die sichtbare Liste nutzen das Wischen (`App.tsx:1175`), der Tab-Umschalter (`App.tsx:738-741`), die Umschalter-Anzeige (`App.tsx:1848`) und „nächster/vorheriger Tab" über `stepSwitcher` (`App.tsx:1039-1040`).
  - Den ganzen Streifen bekommen die Leiste (`App.tsx:1636`) und die Ordner-Ableitung (`App.tsx:430-436`).
  - Die Nachfolger-Wahl und die Zählung „mehr als ein Tab" beim Schließen laufen über `nextActiveInSpace(tabs, id, groups)` (`useTabCloseGuards.ts:57`), das intern SVC-1 nutzt.
- **SVC-13:** In Ordnung. Die Einzel-Regel ist als `closeConfirmReason` herausgelöst (`useTabCloseGuards.ts:21-30`). Einzel-Schließen (Zeile 59) und Sammel-Prüfung (Zeile 107) nutzen dieselbe Stelle. Der Plan kommt aus `planGroupClose` in der Regel-Datei (Bauplan-Entscheidung 13).
- **SVC-17:** In Ordnung. Den Effekt beim Space-Wechsel steuert `tabForSpaceSwitch` (`App.tsx:353-359`), der eigene Filter ist entfernt.

**Migration Map**
- **MIG-5:** Alle Punkte sind erfüllt (`App.tsx:333-339`, `353-359`, `372-380`, `432`, `620-700`, `736-746`, `1172-1183`, `1281-1283`, `1521-1524`, `1636-1651`, `1848`, `1940-1942`). Jede Aktion mit `spawnCwd` bekommt `inheritedCwdForNewTab()` zum Zeitpunkt des Aufrufs.
- **MIG-6:** In Ordnung, `handleClose` ist der achte Aufrufer von `nextActiveInSpace` mit Gruppen.
- **MIG-7, UI-8:** In Ordnung. Der neue Dialog steht in `CloseDialogs.tsx:157-179` nach dem Muster der bestehenden Dialoge. Die Einzahl-Texte folgen Bauplan-Entscheidung 8. Esc und „Cancel" rufen nur `onCancelGroupClose`.
- **MIG-16 bis MIG-20:** In Ordnung.
  - MIG-16: `gapTargetAt` ohne `headerDrop`, die Prüfung `stripHasTab` bleibt (`useTerminalPaneDnd.ts:209-210`, `227`).
  - MIG-17: `paneDndStore.ts:18`, `44-48`.
  - MIG-18: `TerminalStack.tsx:35`.
  - MIG-19: `WorkspaceSurface.tsx:27` leitet den Typ ab und ist deshalb unverändert.
  - MIG-20: `Header.tsx:46-48`, `207-208`.
- **Sweep criterion:** In Ordnung. `grep -rnE "spaceId (===|!==)"` trifft in der Prüfmenge nichts mehr. Die drei Treffer in `App.tsx` auf `main` (Zeilen 334, 353 und 645) sind durch SVC-1 und SVC-17 ersetzt. Keine bestehende Testdatei ist geändert, alle Testdateien im Diff sind neu (`A`).

**Invarianten und Anti-Slop-Dispositionen**
- **INV-12, INV-13, INV-15:** In Ordnung. Die Logik zu Rand und Kreis ist unverändert, nur die Quelle ist jetzt SVC-1. Die Sprünge laufen weiter über `setActiveId`, also über SVC-9 (`App.tsx:1017-1027`, `1450-1459`).
- **INV-14:** Bis auf DV-2 in Ordnung.
- **Anti-Slop-Dispositionen 1 und 2:** In Ordnung. In `App.tsx` gibt es keinen eigenen Streifen-Filter mehr. Die drei Wechsel-Wege beziehen ihre Tabs aus SVC-1; „Tab nach Nummer" liegt in `useTabs` außerhalb der Prüfmenge.

**Discovery**
- BR-9, BR-10, BR-15, BR-24, BR-25, EP-1, EP-2 und EP-9 sind über die Verdrahtung oben gedeckt. Das eigentliche Schließen, Einklappen und neue Terminal liegen in `useTabs` (slice-02, außerhalb der Prüfmenge).

**Außerhalb der Migration Map**
- `src/modules/terminal/lib/useTerminalSession.ts` liegt laut Auftrag und Gate-Log-Entscheidung 61 begründet außerhalb. `leafHasForegroundProcess` verhält sich unverändert (`useTerminalSession.ts:981-985`; der einzige Aufrufer ist `useAppCloseGuard.ts:12`). Damit wertet das Schließen der App eine gescheiterte Abfrage weiter als „nichts läuft", das Schließen von Tab und Gruppe dagegen als „läuft". So ist es entschieden. Ob die beiden Wege zusammengehören, ist eine Frage der Ausrichtung am Bestand, nicht der Architektur.
