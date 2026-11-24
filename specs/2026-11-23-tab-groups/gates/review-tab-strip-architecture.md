# Design Conformance Report

**Feature:** Tab-Gruppen (Teil „tab-strip")
**Branch:** tab-groups (HEAD `303c841`)
**Datum:** 2026-11-24
**Diff-Scope:** Prüfmenge: `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/TabGroupHeader.tsx`, `src/modules/tabs/TabActivityIndicator.tsx`, `src/modules/spaces/components/InlineRename.tsx` (`git diff main...HEAD -- <scope>`)
**Modus:** full
**Architecture:** `specs/2026-11-23-tab-groups/architecture.md`
**Bindings:** —

---

## Verdict

APPROVED

| Kategorie | Anzahl |
|---|---|
| Design Violations | 0 |
| Bindings Net Hits | 0 |
| Exceptions Applied | 0 |

---

## Design Violations

Keine.

---

## Bindings Net Hits

Keine. (`bindings_path` = null: kein Sicherheitsnetz, C.6 entfällt.)

---

## Exceptions Applied (Audit)

Keine.

---

## Prüfmenge

Geprüft: `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/TabGroupHeader.tsx`, `src/modules/tabs/TabActivityIndicator.tsx`, `src/modules/spaces/components/InlineRename.tsx`. Jede Datei vollständig gelesen, dazu der Diff gegen `main`. Geprüft gegen C.1 bis C.5, MIG-3, MIG-13, MIG-21, SVC-2, SVC-6, SVC-10, SEC-4, NFR-1, INV-5, INV-6 und INV-16, gegen UI-1 bis UI-9 der Discovery (UI-8 nur am Aufruf, siehe unten), gegen Q&A 8 und den Bauplan-Abschnitt „Entscheidungen ohne Vorgabe".

Nicht geprüft:
- Die übrigen 48 Dateien des Feature-Diffs: sie liegen außerhalb der Prüfmenge, andere Reviewer prüfen sie. Einige davon habe ich nur als Beleg gelesen: `src/app/App.tsx:373-381, 650-694, 1636-1651`, `src/modules/header/Header.tsx` (Diff), `src/modules/tabs/lib/tabGroups.ts`, `src/modules/tabs/lib/tabStripGap.ts`, `src/modules/tabs/lib/selectTabAgentStatus.ts`, `src/modules/tabs/lib/useTabs.ts:639-668, 2141-2147` und `src/modules/terminal/lib/useTerminalPaneDnd.ts:209-210`.
- UI-8 (der Dialog „Close group"): Er steht in `src/app/components/CloseDialogs.tsx`, außerhalb der Prüfmenge. Geprüft ist nur, dass „Close group" in der Leiste `onCloseGroup` aufruft (`TabGroupHeader.tsx:242-248` → `App.tsx:676` `requestCloseGroup`).
- Laufzeitprüfungen wurden nach Vorgabe nicht ausgeführt: keine Tests, keine Typprüfung, kein Build. Der Aufrufer meldet Lint, Typprüfung und Suite grün. Die QA-Kriterien (AC 8, 19, 20, 24; OB-12, OB-13, OB-15 in der echten App) sind statisch nicht prüfbar und bleiben bei der QA.

---

## Notes

### Abgleich je Referenz (alle konform)

| Referenz | Erwartet (architecture.md / discovery.md) | Beleg im Code |
|---|---|---|
| MIG-3 Zeichnen | Leiste zeichnet aus SVC-2 über den ganzen Streifen samt Gruppen | `TabBar.tsx:189-193` `stripLayout({ tabs, groups }, spaceId)`. `tabs` ist der ganze Streifen nach SVC-1 mit `all`: `App.tsx:373-376`, `1636` |
| MIG-3 Menü an allen Tab-Arten / UI-5 | Lose Tabs: „Add to new group", „Add to group" (Farbpunkt + Name, namenlose als „Unnamed group"). In einer Gruppe zusätzlich „Remove from group", die eigene Gruppe fehlt im Untermenü. Terminals behalten „Rename"/„Close" darunter. EP-7: ausgegraut ohne andere Gruppe | `TabBar.tsx:691-783`. Ziele über `stripGroups` ohne die eigene Gruppe: `432-433`. Ausgegraut: `712`. `groupDisplayName`: `TabGroupHeader.tsx:69-71`. Rename/Close nur bei Terminals: `749-780` |
| MIG-3 Schließen / BR-24 / EP-8 / OB-8 | Schließen-Knopf, Mittelklick und Menü-„Close" zählen über alle Tabs des Space | `TabBar.tsx:470` (`hasClose = tabs.length > 1`), `515`, `763`. `tabs` enthält die eingeklappten Mitglieder (`App.tsx:374`) |
| MIG-3 Ziehen / SVC-10 | Zieh-Zustand mit `GapTarget`, Kopf als Zieh-Quelle, Ziel aus `gapTargetAt`. Die Übersetzung in Array-Positionen bleibt bei den Regel-Funktionen | `TabBar.tsx:78`, `291-327`. Gruppe: `gapTargetAt` ohne `headerDrop` (`305`). Tab: mit `headerDrop` (`325`). Kopf: `814-829`. Die Leiste reicht `GapTarget` unverändert an `onReorder` (`506`) und `onMoveGroup` (`823`) weiter |
| UI-9 / BR-11 | Marke in Gruppenfarbe innerhalb einer Gruppe, sonst neutral. Eingeklappter Kopf hervorgehoben, wenn ein Tab darüber liegt. Gilt auch für einen gezogenen Pane | `TabBar.tsx:391-425` und `DropIndicator` `1017-1029`. Pane-Weg über `paneDropGap` `175-187` und die Farbe aus `colorOfGroup` (`424`). Kopf-Hervorhebung: `811-813` → `TabGroupHeader.tsx:105-108`. Pane ohne Kopf-Ziel nach der Bauplan-Entscheidung: `useTerminalPaneDnd.ts:210` ruft `gapTargetAt` ohne `headerDrop` |
| Bauplan: Gruppe in Gruppe gezogen | Die Lücke zählt als Lücke hinter der anderen Gruppe, die Marke steht dort | `TabBar.tsx:413-423` (`groupRange.end`) |
| UI-1 / API-7 / Q&A 8 | Klick klappt um, Rechtsklick öffnet UI-4, Ziehen verschiebt die Gruppe, kein Doppelklick-Umbenennen. Aufgeklappt: Farbpunkt + Name. Eingeklappt zusätzlich Anzahl + Sammelzeichen. Ohne Namen nur der Farbpunkt. Tooltip: Name + „{n} tabs", Einzahl „1 tab" nach Bauplan | Klick → `onToggleGroup` ohne `onSelect`: `TabBar.tsx:824-826`. Kein `onDoubleClick` am Kopf: `TabGroupHeader.tsx:155-177`. Inhalt `112-147`. Tooltip `91-93` mit `tabCountLabel` `73-75` |
| UI-2 | Linie in Gruppenfarbe unter Kopf und Tabs, nur aufgeklappt, ohne Interaktion | `TabBar.tsx:795-804`: Hintergrund statt Element, also kein `data-tab-id` (OB-14) |
| UI-3 / SVC-6 / OB-15 | Sammelzeichen nur am eingeklappten Kopf, rechts der Anzahl. `waiting` schlägt `working`. Gleiches Aussehen wie am Tab. Pane-Ids aus dem Pane-Baum jedes Mitglieds, auch eines noch nicht eingehängten | `TabGroupHeader.tsx:138-145`, `297-308` (`leafIds(t.paneTree)` je Terminal-Mitglied, ohne Rücksicht auf `cold`). Regel `selectTabAgentStatus.ts:35-46` ohne Zwischenlisten, Ergebnis ein einfacher Wert. Darstellung über `AgentStatusBadge` |
| UI-4 / EP-6 / VAL-5 | Reihenfolge: Rename group, Change color, Ungroup, Move group to space (andere Spaces mit Avatar und Name), Trenner, Close group. Bei nur einem Space ausgegraut | `TabGroupHeader.tsx:189-248`. Untermenü `256-292`: Filter `s.id !== spaceId` (`264`), ausgegraut `269`, Avatar und Name `285-286` |
| UI-6 | Alle 8 Palettenfarben als Punkte, die aktuelle markiert, ein Klick setzt sofort | `TabGroupHeader.tsx:201-228` (`SPACE_COLORS.map`, `onValueChange` → `onSetGroupColor`) |
| UI-7 / MIG-13 / OB-11 | Enter und Fokusverlust speichern, Esc verwirft. Das Feld öffnet sich nach FL-1 von selbst, mit Fokus und markiertem Text, nie in einem Knopf | `TabGroupHeader.tsx:119-130` und `151-152` (beim Umbenennen eine schlichte `div` ohne `role="button"`). `InlineRename.tsx:24-30` (Fokus und Markierung im nächsten Frame), `48-56`. Selbstöffnen: `App.tsx:650-656` |
| MIG-13 | `InlineRename` mit Beschriftung und Höchstlänge als optionalen Angaben, Space-Umbenennen unverändert | `InlineRename.tsx:9-10`, `18-19`, `42-43`. Standard „Rename space" ohne Grenze. `SpaceSwitcher.tsx` ist im Diff nicht berührt |
| MIG-21 / INV-16 | Darstellung je Status als eigener Baustein für Tab und Kopf. Am Tab schlägt „arbeitet" weiter „wartet" | `TabActivityIndicator.tsx:12-24`: unverändert `selectTabAgentStatus`, Ausgabe über `AgentStatusBadge` `27-51` mit unveränderter Auszeichnung. `TabActivityIndicator.test.tsx` ist im Diff nicht berührt |
| SVC-2 | Einzige Quelle für das Zeichnen. Eine Gruppe existiert nur mit Mitglied | Zeichnen nur aus `layout` (`TabBar.tsx:842-861`, `786-840`). Zählung der gezeichneten Elemente ebenfalls aus `layout` (`196-214`) |
| SEC-4 / VAL-1 | Der Name erscheint nur als Text (Kopf, Tooltip, Menü). Eingabe höchstens 32 Zeichen, getrimmt | JSX-Text bzw. `title`/`aria-label`: `TabGroupHeader.tsx:133-135`, `160-161`, `TabBar.tsx:729-731`. Kein `innerHTML`/`dangerouslySetInnerHTML` im Modul. `maxLength={GROUP_NAME_MAX}` (`TabGroupHeader.tsx:123`). Kürzen und Trimmen beim Speichern: `useTabs.ts:2141-2143` (`normalizeGroupName`) |
| NFR-1 | Kein Neuzeichnen des Kopfs bei Status-Änderungen fremder Sessions. Nur eingeklappte Köpfe werten aus | `GroupAggregateIndicator` wird nur bei `group.collapsed` eingehängt (`TabGroupHeader.tsx:138-145`). Der Selektor liefert einen einfachen Wert (`306`). Die Space-Liste wird nur bei offenem Menü abonniert (`256-263`) |
| INV-5 | Halbbreiten-Regel, hinter allen Elementen gilt die letzte Lücke | `gapIndexAt` ist unverändert (`tabStripGap.ts:48-55`, Diff nur additiv). `gapTargetAt` wendet dieselbe Regel über Köpfe und Tabs an (`73-107`). Ohne Gruppen und ohne eingeklappten Kopf liefert es denselben Index. Letzte Marke: `TabBar.tsx:897` |
| INV-6 | Ein Pane wird nur über dem eigenen Streifen angenommen | Die Prüfung beim Zeichnen bleibt: `TabBar.tsx:184-187`. `stripHasTab` in `useTerminalPaneDnd.ts:209` ist unverändert |
| UI-texts / BR-23 | Englische Texte | „Add to new group", „Add to group", „Remove from group", „Unnamed group", „Rename group", „Change color", „Ungroup", „Move group to space", „Close group", „{n} tabs"/„1 tab", Farbnamen `TabGroupHeader.tsx:52-61` |
| C.5 Datenfluss | Leiste/Menü → App.tsx → useTabs-Aktion. Die Leiste ändert keinen Zustand selbst | Jede Gruppen-Aktion läuft über `TabBarGroupProps` (`TabBar.tsx:98-113`), verdrahtet in `App.tsx:658-694` |

### Beobachtungen ohne Befund

- **NFR-1, Formulierung „Pane-Ids nur bei Änderung der Mitgliedschaft neu bestimmt":** Der `useMemo` in `TabGroupHeader.tsx:298-305` hängt an der Identität von `members`. `stripLayout` baut diese Liste bei jeder Änderung von `tabs` oder `groups` neu (`tabGroups.ts:80-99`, `TabBar.tsx:190-193`). Die Ids werden also bei jeder Tab- oder Gruppenänderung im Space neu bestimmt, nicht nur bei einer Änderung der Mitgliedschaft. Der Kommentar `TabGroupHeader.tsx:294-296` ist entsprechend ungenau. Das ist kein Befund: Neu berechnet wird nur, wenn die Leiste ohnehin neu zeichnet, nie bei Änderungen im Agent-Speicher. Das Prüfmaß von NFR-1 ist erfüllt (Test „…ignores foreign sessions"). Ein Split in einem Mitglied muss die Ids ohnehin erneuern. Ein spürbarer Unterschied für den Nutzer ist nicht zu erwarten.
- **Space-Liste aus dem Space-Speicher** (`TabGroupHeader.tsx:263`): Der Bauplan führt dies unter „Wie gebaut" als Abweichung. architecture.md verbietet es nicht. Es ist ein reiner Lesezugriff, die Aktion läuft weiter über `onMoveGroupToSpace`. Das Modul `tabs` liest `useSpaces` bereits an anderer Stelle (`useTabs.ts:4`).
- **Tastatur:** Enter und Leertaste am Kopf klappen ebenfalls um (`TabGroupHeader.tsx:169-174`). Das ergänzt API-7 („einfacher Klick") für die Bedienbarkeit und widerspricht Q&A 8 nicht.
- **Doppelklick am Kopf:** Er klappt zweimal um (AC 3). Das entspricht der Entscheidung in Q&A 8 und ist kein Befund.
