# Design Conformance Report

**Feature:** Tab-Gruppen (Teil „rules-and-persistence")
**Branch:** tab-groups
**Datum:** 2026-11-24
**Diff-Scope:** Prüfmenge: `src/modules/tabs/lib/tabGroups.ts`, `src/modules/tabs/lib/tabStripGap.ts`, `src/modules/tabs/lib/selectTabAgentStatus.ts`, `src/modules/spaces/lib/serialize.ts`, `src/modules/spaces/lib/validate.ts`, `src/modules/spaces/lib/store.ts`, `src/modules/spaces/lib/useSpacePersistence.ts`, `src/modules/spaces/lib/useSpacesBoot.ts` (`git diff main...HEAD -- <Prüfmenge>`)
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

---

## Design Violations

### DV-1 — niedrig
- **Datei:** `src/modules/tabs/lib/tabGroups.ts:391`
- **Design Ref:** architecture.md → Error Handling Strategy, Zeile „Überholter Zieh-Vorgang (Ziel-Tab oder Gruppe inzwischen weg)" (architecture.md:251) · SVC-11 (architecture.md:148)
- **Erwartet:** Ist die Zielgruppe eines Zieh-Vorgangs beim Ablegen schon verschwunden, wird nicht umsortiert und der Zustand bleibt.
- **Aktuell:** `moveGroupBlock` prüft nicht, ob `target.groupId` noch eine Gruppe benennt. Mit einer verschwundenen Zielgruppe liefert `idBehindGroup` `null` (tabGroups.ts:201, `last < 0`), und `null` heißt für `insertBlock` „hinter den letzten Tab des Space" (tabGroups.ts:174-181). Die gezogene Gruppe springt also ans Ende der Leiste. Der Fall kommt in der App vor: Die Leiste legt mit dem Ziel ab, das beim letzten Zeiger-Schritt gespeichert wurde (`TabBar.tsx:231-234`, `TabBar.tsx:355`, Ablegen `TabBar.tsx:819-824`). `useTabs.moveGroupByGap` reicht das Ziel ungeprüft weiter (`useTabs.ts:2169-2176`). Schließt sich das letzte Mitglied der Zielgruppe zwischen letztem Zeiger-Schritt und Loslassen (zum Beispiel weil die Shell endet), ist das Ziel überholt.
- **Erwartete Beobachtung:** `moveGroupBlock({ tabs: [t1(G1), t2, t3(G2)], groups: [G1, G2] }, "G1", { index: 3, groupId: "gone", onCollapsedHeader: false })` liefert die Tab-Reihenfolge `[t2, t3, t1]` (G1 steht am Ende von Space a), nicht den unveränderten Zustand (dasselbe Objekt).
- **Empfehlung:** In `moveGroupBlock` den unveränderten `state` zurückgeben, wenn `target.groupId !== null` ist und keine Gruppe mit dieser Id im Space der gezogenen Gruppe liegt (oder wenn `rest` kein Mitglied dieser Gruppe enthält).
- **Klasse:** fix

### DV-2 — niedrig
- **Datei:** `src/modules/tabs/lib/tabGroups.ts:349`
- **Design Ref:** architecture.md → Error Handling Strategy, Zeile „Überholter Zieh-Vorgang" (architecture.md:251) · SVC-10 (architecture.md:147)
- **Erwartet:** Ein Tab, dessen Zielgruppe beim Ablegen schon verschwunden ist, wird nicht umsortiert; der Zustand bleibt.
- **Aktuell:** Findet `applyGapTarget` die Gruppe aus `target.groupId` nicht (tabGroups.ts:349-354), behandelt es das Ziel als lose Lücke. Der Tab wird an `target.index` eingefügt, gezählt über die jetzt gezeichnete Leiste (tabGroups.ts:366-374). Das gilt auch für ein Ziel „auf eingeklapptem Kopf", dessen Kopf nicht mehr existiert. `useTabs.reorderTabByGap` prüft das Ziel ebenfalls nicht (`useTabs.ts:2066-2070`). Das Ablegen nutzt das gespeicherte Ziel (`TabBar.tsx:500-506`).
- **Erwartete Beobachtung:** `applyGapTarget({ tabs: [t1, t3, t4], groups: [] }, t4, { index: 1, groupId: "gone", onCollapsedHeader: true })` liefert die Tab-Reihenfolge `[t1, t4, t3]`, nicht den unveränderten Zustand.
- **Empfehlung:** Ist `target.groupId !== null`, gibt es keine solche Gruppe im Space des Tabs und steht der Tab schon in `state.tabs` (Umsortieren), den unveränderten `state` zurückgeben. Für einen neuen Tab (ausgebrochener Pane, `useTabs.ts:458-460`) die heutige lose Einfügung behalten. Sonst ginge der Pane verloren, weil der Quell-Tab ihn zu diesem Zeitpunkt schon abgegeben hat (`useTabs.ts:450-457`).
- **Klasse:** fix

### DV-3 — niedrig
- **Datei:** `src/modules/tabs/lib/tabGroups.ts:291`
- **Design Ref:** architecture.md → Migration Map, Sweep criterion (architecture.md:282) · Anti-Slop Disposition 1 „consolidate" (architecture.md:449) · SVC-1 (architecture.md:138) · SVC-8 (architecture.md:145)
- **Erwartet:** Jede Stelle, die eine Tab-Liste eines Space für Anzeige, Durchschalten, Nachfolger-Wahl oder Ziehen ableitet, holt sie über SVC-1 (`visibleTabsInSpace`). Damit gibt es die Regel „eingeklappte Gruppen verstecken ihre Mitglieder" nur an einer Stelle.
- **Aktuell:** `activeAfterHide` wählt den neuen aktiven Tab (eine Nachfolger-Wahl), leitet die Tab-Liste des Space aber selbst ab (`state.tabs.filter((t) => t.spaceId === group.spaceId)`, tabGroups.ts:295). Die Versteck-Regel steht dort ein zweites Mal: Menge der eingeklappten Gruppen tabGroups.ts:291-294, Sichtbarkeits-Prüfung tabGroups.ts:303. Das Original steht in `visibleTabsInSpace`, tabGroups.ts:53-61. Die Schwesterfunktion `nextActiveInSpace` holt dagegen beide Listen über SVC-1 (`useTabs.ts:548-552`). Gleiches Muster ohne Sichtbarkeits-Regel: `idBehindGroup` leitet den Streifen des Space für Zuordnen und Ziehen selbst ab (tabGroups.ts:196). Das entspricht `visibleTabsInSpace(…, { all: true })`. Das Verhalten ist heute richtig; es fehlt nur die eine gemeinsame Quelle.
- **Erwartete Beobachtung:** `grep -nE "spaceId (===|!==)" src/modules/tabs/lib/tabGroups.ts` trifft Zeile 295 (und 196) außerhalb von `visibleTabsInSpace`. In `activeAfterHide` steht kein Aufruf von `visibleTabsInSpace`.
- **Empfehlung:** In `activeAfterHide` die Gruppe auf einer Kopie der Gruppen als eingeklappt markieren (`groups.map((g) => g.id === groupId ? { ...g, collapsed: true } : g)`). Dann den ganzen Streifen über `visibleTabsInSpace(…, { all: true })` und die sichtbare Menge über `visibleTabsInSpace(…)` holen, wie in `nextActiveInSpace`. In `idBehindGroup` den Space-Filter durch `visibleTabsInSpace({ tabs, groups: [] }, spaceId, { all: true })` ersetzen.
- **Klasse:** fix

---

## Bindings Net Hits

Keine. (`bindings_path: null` — kein Sicherheitsnetz)

---

## Exceptions Applied (Audit)

Keine.

---

## Prüfmenge

Geprüft wurden die acht Dateien der Prüfmenge, jede vollständig gelesen und gegen C.1 bis C.5 geprüft:

- `src/modules/tabs/lib/tabGroups.ts`
- `src/modules/tabs/lib/tabStripGap.ts`
- `src/modules/tabs/lib/selectTabAgentStatus.ts`
- `src/modules/spaces/lib/serialize.ts`
- `src/modules/spaces/lib/validate.ts`
- `src/modules/spaces/lib/store.ts`
- `src/modules/spaces/lib/useSpacePersistence.ts`
- `src/modules/spaces/lib/useSpacesBoot.ts`

C.6 entfällt (keine Bindings).

Nicht geprüft wurden alle übrigen Dateien des Diffs, weil sie außerhalb der Prüfmenge liegen (andere Reviewer):

- `src/modules/tabs/lib/useTabs.ts`
- `src/modules/tabs/TabBar.tsx`
- `src/modules/tabs/TabGroupHeader.tsx`
- `src/modules/tabs/TabActivityIndicator.tsx`
- `src/modules/tabs/index.ts`
- `src/app/App.tsx`
- `src/app/hooks/useTabCloseGuards.ts`
- `src/app/components/CloseDialogs.tsx`
- `src/modules/command-palette/commands.ts`
- `src/modules/header/Header.tsx`
- `src/modules/spaces/components/InlineRename.tsx`
- `src/modules/terminal/*`
- alle Testdateien

Als Beleg gelesen, aber nicht geprüft: `useTabs.ts`, `TabBar.tsx`, `TabGroupHeader.tsx`, `index.ts`, `gapTargetAt.test.ts` und `serializeSpace.test.ts` (nur die Testnamen).

SVC-7 (`nextActiveInSpace`) liegt in `useTabs.ts` und damit außerhalb der Prüfmenge. Ich habe es nur gelesen (`useTabs.ts:540-564`, links, sonst rechts, sonst nächster eingeklappter, links zuerst) und dabei keine Abweichung gesehen. Es ist aber nicht geprüft.

Test-Suite, Typprüfung und Build habe ich laut Auftrag nicht ausgeführt.

---

## Notes

**Abgleich der genannten Kennungen (Prüfmenge):**

| Kennung | Ergebnis | Beleg |
|---|---|---|
| SVC-1 | ok (siehe DV-3 für die Nachbarfunktionen) | tabGroups.ts:47-62 |
| SVC-2 | ok; Gruppe nur über Mitglieder, eingeklappt mit gleichen `members`/`count` | tabGroups.ts:77-102 |
| SVC-3 | ok; Zusammenhang je Space, fremde/unbekannte Verweise gelöst, leere Metadaten verworfen | tabGroups.ts:118-164 |
| SVC-4 | ok; `groupFromTab` an der Stelle des Tabs, Farbe ohne die geleerte Altgruppe; `assignToGroup` hinter das letzte Mitglied, nur im selben Space; `removeFromGroup` direkt hinter die Gruppe; `dissolveGroup` an Ort und Stelle | tabGroups.ts:205-268 |
| SVC-5 | ok (wenigste Belegung, erste bei Gleichstand; Architecture schlägt BR-5) | tabGroups.ts:272-282 |
| SVC-6 | ok; wartet schlägt arbeitet, ohne Zwischenlisten, einfacher Wert | selectTabAgentStatus.ts:35-46 |
| SVC-8 | Ergebnis ok; Ableitung siehe DV-3 | tabGroups.ts:285-311 |
| SVC-10 | `gapTargetAt` ok (BR-11, Viertel-Regel am eingeklappten Kopf nach Bauplan); `applyGapTarget` ok bis auf das überholte Ziel (DV-2) | tabStripGap.ts:73-107, tabGroups.ts:344-376 |
| SVC-11 | ok bis auf das überholte Ziel (DV-1); Lücke in fremder Gruppe zählt als dahinter (Bauplan-Entscheidung) | tabGroups.ts:379-412 |
| SVC-12 | ok; Block ans Ende des Ziel-Space, Metadaten bleiben, `sourceEmptied`/`activeMoved` | tabGroups.ts:414-439 |
| SVC-15 | ok; Schreiben in Leisten-Reihenfolge nur mit speicherbarem Mitglied, Laden nachsichtig, danach `normalizeGroups`; `serializeTabs`/`hydrateTabs` haben keinen Zustand über Tabs hinweg, der Aufruf je Tab ändert nichts | serialize.ts:312-382 |
| SVC-17 | ok | tabGroups.ts:455-466 |
| DB-1 / MIG-9 | ok; `groups?` am `SpaceState`, `group?` am gespeicherten Tab, kein neuer Schlüssel; leeres `groups` wird nicht geschrieben (Bauplan-Entscheidung) | store.ts:17-22, serialize.ts:33-59, 340-342 |
| VAL-1 | ok; trimmen, 32 UTF-16-Einheiten, kein halbes Ersatzpaar, idempotent | tabGroups.ts:470-477 |
| VAL-2 | ok | validate.ts:31-36 |
| VAL-3 | ok; Eintrag nur ungültig, wenn er kein Objekt ist (Array zählt als kein Objekt), Felder einzeln nachsichtig, Verweis nach Datei-Position, `groups` keine Liste = alle Tabs lose, Tabs laden immer | validate.ts:29-60, serialize.ts:352-376 |
| VAL-4 | ok | tabGroups.ts:237, 352-354 |
| SEC-3 | ok; eine rein private Gruppe bekommt keinen Eintrag, ihr Name erreicht die Datei nicht | serialize.ts:320-337 |
| SEC-5 | ok; nur gelesen und auf Standardwerte zurückgesetzt, nichts ausgeführt | validate.ts:29-60 |
| MIG-2 | ok; `gapIndexAt`, `tabStripAt`, `stripHasTab` unverändert | tabStripGap.ts:23-55 |
| MIG-8 | ok | serialize.ts:312-382 |
| MIG-10 | ok; `isSpaceState` unverändert, Gruppen-Prüfung getrennt | validate.ts:21-60 |
| MIG-11 | ok; Gruppen in Momentaufnahme, Abhängigkeiten und JSON-Vergleich; Sofort-Schreiben bei Fokusverlust, Verstecken und Beenden über `latest.current` | useSpacePersistence.ts:10-16, 35-36, 59-77, 83-108 |
| MIG-12 | ok; Gruppen an `replaceTabs`, Index über `visibleTabsInSpace(…, { all: true })`; das Aufklappen beim Start (BR-20) besorgen `replaceTabs`, `settle` und `expandActiveGroup` (`useTabs.ts:644-668`, `816-828`) | useSpacesBoot.ts:96-104, 138-147 |
| MIG-15 / INV-16 | ok; `selectTabAgentStatus` unverändert | selectTabAgentStatus.ts:19-30 |
| INV-5 / INV-6 | ok; `gapIndexAt` und `stripHasTab` unverändert. Die Verbraucher nutzen jetzt `gapTargetAt`; ohne Gruppen ist der Index gleich (Test „matches gapIndexAt on a strip without groups") | tabStripGap.ts:36-55 |
| INV-9 / INV-10 | ok; `serializeTab`/`hydrateTab` unverändert, der Aufruf je Tab ist gleichwertig | serialize.ts:99-139, 292-308 |
| INV-18 | ok; Fallback-Terminal nur für den aktiven Space, unverändert | useSpacesBoot.ts:123-127 |
| BR-1 bis BR-7, BR-9, BR-11, BR-12 (Regel-Teil), BR-14 bis BR-16 (Regel-Teil), BR-19 bis BR-22 | in der Prüfmenge umgesetzt, abgesehen von DV-1 bis DV-3 | siehe Zeilen oben |
| BR-8, BR-10, BR-13, BR-17, BR-18, BR-23 bis BR-25 | liegen in `useTabs.ts`, `TabBar.tsx` oder `App.tsx`, außerhalb der Prüfmenge; BR-18 regelt die Architecture über SVC-16 anders (Architecture gilt) | — |

**Hinweise ohne Befund (für andere Prüfer oder den PM):**
- VAL-2 steht ein zweites Mal in `useTabs.ts:743-747` (`validGroupColor`) für `setGroupColor`. VAL-1 dagegen teilen sich Laden und Umbenennen über `normalizeGroupName` aus `tabGroups.ts`. Die Kopie liegt außerhalb dieser Prüfmenge (Zustands-Schicht, Prüfer von `useTabs.ts`). `validate.ts` selbst folgt MIG-10.
- `spaces/lib` importiert `normalizeGroups`, `newGroupId`, `normalizeGroupName` und `visibleTabsInSpace` direkt aus `@/modules/tabs/lib/tabGroups` statt über `@/modules/tabs`. Der Bauplan nennt das in slice-00 „Wie gebaut" als Abweichung. Es entspricht dem bestehenden direkten Import `DEFAULT_SPACE_ID` aus `@/modules/tabs/lib/useTabs` (useSpacesBoot.ts:5, schon auf `main`). Kein Befund.
- `gapIndexAt` hat im Produktionscode keinen Aufrufer mehr, nur noch in Tests. Die Architecture verlangt, dass es unverändert bleibt; das ist erfüllt.
- Geprüfte Code-Kommentare in der Prüfmenge: serialize.ts:310-311, 345-346; validate.ts:44-46, 51-52; useSpacesBoot.ts:138-139 (stimmt mit `useTabs.ts:816-828` und `settle` überein); tabGroups.ts:115-117, 166-167, 284, 342-343, 378, 452-454, 468-469, 479. Keine falsche Prämisse gefunden. tabGroups.ts:189-190 nennt für `idBehindGroup` nur „null, wenn die Gruppe den Space beendet"; der Fall „Gruppe ohne Mitglied" fehlt dort. Genau diese Verwechslung trägt DV-1.
