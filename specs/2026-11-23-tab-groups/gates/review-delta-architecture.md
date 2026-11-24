# Design Conformance Report

**Feature:** Tab-Gruppen (Delta-Lauf des End-Reviews, Perspektive Architektur)
**Branch:** tab-groups
**Datum:** 2026-11-24
**Diff-Scope:** Prüfmenge: Quelldateien des Fix-Commits `6f9e687` („fix(feature): address review findings“): `src/app/App.tsx`, `src/app/hooks/useTabCloseGuards.ts`, `src/modules/command-palette/commands.ts`, `src/modules/spaces/lib/serialize.ts`, `src/modules/spaces/lib/validate.ts`, `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/TabGroupHeader.tsx`, `src/modules/tabs/lib/tabGroups.ts`, `src/modules/tabs/lib/useTabs.ts`
**Modus:** full
**Architecture:** `specs/2026-11-23-tab-groups/architecture.md`
**Bindings:** —

Vorlauf (für den Delta-Lauf übergeben): `gates/design-conformance.md` (A1 bis A5, N1 bis N4), `gates/systemic-review.md` (E1 bis E3, F1 bis F6). Ich habe keine Tests, keine Typprüfung und keinen Build ausgeführt (Vorgabe). Alle Befunde beruhen auf dem Lesen des Codes.

---

## Verdict

FAILED

| Kategorie | Anzahl |
|---|---|
| Design Violations | 2 |
| Bindings Net Hits | 0 |
| Exceptions Applied | 0 |

---

## Design Violations

### DV-1 — medium
- **Datei:** `src/modules/tabs/lib/useTabs.ts:874`
- **Design Ref:** architecture.md → Server Logic, SVC-7 (Nachfolger: „gibt es keinen sichtbaren, der nächstgelegene Tab einer eingeklappten Gruppe“) und SVC-9 (die Aufklapp-Regel greift auch für den „Nachfolger nach SVC-7“); Q&A 5 („Nächste Gruppe klappt auf“); BR-24/EP-8 in discovery.md; MIG-1 (`reorderTab` läuft über SVC-7). Die Entscheidung zum Space-Überblick (build-plan.md:227, E1) gilt nur, wenn der Tab „innerhalb desselben Space“ auf einer eingeklappten Gruppe abgelegt wird.
- **Erwartet:** Der Fall: Der aktive Tab wird im Space-Überblick in einen anderen Space gezogen, und im Herkunfts-Space liegen nur noch Mitglieder eingeklappter Gruppen. Dann wählt `nextActiveInSpace` den nächstgelegenen Tab einer eingeklappten Gruppe. Dieser Tab wird aktiv, seine Gruppe klappt über SVC-9 auf (`expandActiveGroup`, `useTabs.ts:629-637`), und es entsteht kein neuer Tab. So verhält sich auch `moveTabToSpace` (`useTabs.ts:826-832`: Nachfolger ohne `keepActiveVisible`).
- **Aktuell:** Seit dem Fix übergibt `reorderTab` jeden Zustand an `keepActiveVisible`, auch den Zustand mit dem Nachfolger aus SVC-7 (`useTabs.ts:874-881`). Der Ablauf: `nextActiveInSpace` gibt über die Schleife für nahe Tabs (`useTabs.ts:545-548`) ein Mitglied der eingeklappten Gruppe zurück. `keepActiveVisible` (`useTabs.ts:707-714`) findet dann den aktiven Tab in einer eingeklappten Gruppe und ruft `activeAfterHide` auf. Weil der gezogene Tab den Space schon verlassen hat, liefert `activeAfterHide` `"new-terminal"`. Folge: Im Herkunfts-Space entsteht ein neues Terminal, es wird aktiv, und die Gruppe bleibt eingeklappt. Vor dem Fix griff hier SVC-9. Diesen Fall prüft keiner der neuen Tests in `useTabs.overview.test.tsx`.
- **Erwartete Beobachtung:** Test nach dem Muster von `useTabs.overview.test.tsx`: `setup([term(1), term(2,"G1"), term(3,"G1"), term(7, undefined, "b")], [group("G1",{collapsed:true})], t(1))`, danach `reorderTab(t(1), t(7), "bottom")`. Nach der Architecture: `activeId === t(2)` und `strip(s,"a") === "G1(t2,t3)"`. Tatsächlich (nach dem Code): `strip(s,"a") === "G1c(t2,t3) new"`, und `activeId` ist die Id des neuen Terminals.
- **Empfehlung:** In `reorderTab` `keepActiveVisible` nur aufrufen, wenn kein Nachfolger nach SVC-7 gesetzt wurde (`fallback === null`), wenn also der gezogene Tab selbst aktiv bleibt. Den Nachfolger-Fall wie bei `moveTabToSpace` der Aufklapp-Regel überlassen. Dazu den Test oben ergänzen.
- **Klasse:** fix

### DV-2 — low
- **Datei:** `src/modules/tabs/TabBar.tsx:217`
- **Design Ref:** architecture.md → Quality Attributes, NFR-5 („Ohne Gruppen verhält sich die App wie vorher … Alle erweiterten Funktionen sind ohne Gruppen identisch“); Migration Map MIG-3 (`TabBar.tsx`). Ziel-Zustand F5 in systemic-review.md: Umbenennen endet, „wenn der Tab durch Einklappen nicht mehr gezeichnet wird“.
- **Erwartet:** Ohne Gruppen bleibt das Umbenennen eines Tabs wie im Bestand. Die neue Abschluss-Regel greift nur, wenn ein Tab durch Einklappen nicht mehr gezeichnet wird.
- **Aktuell:** Der neue Effekt (`TabBar.tsx:217-227`) speichert den eingetippten Namen über `onRename` immer dann, wenn der Tab, der gerade umbenannt wird, nicht mehr in `tabIndex` steht. Der Kommentar nennt den Space-Wechsel ausdrücklich („the space switched“). Die Leiste bekommt nur die Tabs des aktiven Space (`App.tsx:373-376`). `TabBar` hängt ohne `key` je Space (`Header.tsx:192-193`) und bleibt beim Space-Wechsel bestehen. Das Kürzel `space.next`/`space.prev` wird am Fenster in der Capture-Phase abgefangen (`useGlobalShortcuts.ts:65`, App.tsx:1046 ohne Sperre für Eingabefelder), also ohne vorheriges Blur. Damit ändert sich das Verhalten auch ohne Gruppen. Im Bestand (`git show main:src/modules/tabs/TabBar.tsx`, nur `editingId` an Zeile 116) ging der Entwurf verloren, und das Feld erschien bei der Rückkehr wieder. Jetzt wird der Entwurf als neuer Name übernommen.
- **Erwartete Beobachtung:** In einem Space ohne Gruppen „Rename“ an Tab X öffnen, „foo“ tippen und `space.next` drücken. Nach dem Fix heißt X „foo“. Auf `main` behält X seinen Namen, und bei der Rückkehr steht wieder das Umbenennen-Feld da.
- **Empfehlung:** Der PM bestätigt die Änderung als gewollt (sie wirkt wie ein Blur und ist vertretbar) und weist sie als Abweichung von NFR-5 aus. Oder der Effekt wird auf den Fall beschränkt, dass der Tab noch im Space der Leiste liegt und nur durch Einklappen verdeckt ist.
- **Klasse:** note

---

## Bindings Net Hits

Keine. (`bindings_path: null`, kein Sicherheitsnetz)

---

## Exceptions Applied (Audit)

Keine.

---

## Prüfmenge

Geprüft:
- `src/app/App.tsx` (Hunk `handleReorderTab`; Verdrahtung des Paletten-Kontexts App.tsx:1521-1524)
- `src/app/hooks/useTabCloseGuards.ts` (ganze Datei)
- `src/modules/command-palette/commands.ts` (Kontext-Typ und Gruppen-Befehle)
- `src/modules/spaces/lib/serialize.ts` (`serializeSpace`, `hydrateSpace`)
- `src/modules/spaces/lib/validate.ts` (ganze Datei)
- `src/modules/tabs/TabBar.tsx` (Umbenennen-Zustand, Effekt, `TabRenameInput`)
- `src/modules/tabs/TabGroupHeader.tsx` (Kopf-Zelle beim Umbenennen)
- `src/modules/tabs/lib/tabGroups.ts` (ganze Datei)
- `src/modules/tabs/lib/useTabs.ts` (geänderte Stellen samt Umgebung: `changeTabSpace`, `nextActiveInSpace`, `expandActiveGroup`/`settle`, `lazyTerminal`, `keepActiveVisible`, `newTabInSpace`, `moveTabToSpace`, `reorderTab`, `breakOutPaneFromTabs`, Gruppen-Aktionen 2032-2210)

Gelesen als Beleg, nicht geprüft: `src/modules/spaces/SpaceSwitcher.tsx`, `src/modules/header/Header.tsx`, `src/modules/shortcuts/lib/useGlobalShortcuts.ts`, `src/modules/terminal/lib/panes.ts`, `src/modules/terminal/lib/managedTmux.ts`, die neuen Testdateien `useTabs.overview.test.tsx` und `staleGroupTarget.test.ts`.

Nicht geprüft:
- `src/app/hooks/useTabCloseGuards.tmux.test.ts`, `src/modules/command-palette/commands.groups.test.ts`, `src/modules/command-palette/commands.test.ts`, `src/modules/tabs/TabBar.rename.test.tsx`, `src/modules/tabs/lib/staleGroupTarget.test.ts`, `src/modules/tabs/lib/useTabs.overview.test.tsx`: Testdateien, nicht in der Prüfmenge (nur Quelldateien).
- Laufzeitverhalten: Tests, Typprüfung und Build habe ich laut Vorgabe nicht ausgeführt.

---

## Notes

**Stand der Korrekturen aus dem Vorlauf**

| ID | Ziel-Zustand | Im Code | Beleg |
|----|--------------|---------|-------|
| A1 | `reorderTab`: eingeklappte Zielgruppe bleibt eingeklappt, sichtbarer Nachbar nach SVC-8 wird aktiv; Test | erfüllt, mit Nebenwirkung DV-1 | `useTabs.ts:878-881` → `keepActiveVisible` → `activeAfterHide` (`tabGroups.ts:293-323`); Test `useTabs.overview.test.tsx` „keeps a collapsed target group collapsed …“ und „spawns a terminal in the folder given …“; Ordner für das Ersatz-Terminal über `App.tsx:1432` |
| A2 | VAL-2 an einer Stelle in `tabGroups.ts` | erfüllt | `tabGroups.ts:510-517` `normalizeGroupColor`; Aufrufer `validate.ts:35`, `useTabs.ts:2119`; sonst keine Farbprüfung mehr gegen `SPACE_COLORS.length` (`spaceColor.ts:18` ist die bestehende Space-Farbe) |
| A3 | `moveGroupBlock`: überholte Zielgruppe ändert den Zustand nicht | erfüllt | `tabGroups.ts:408-415` (Zielgruppe fehlt oder gehört zu einem anderen Space → `state`) |
| A4 | `applyGapTarget`: überholte Zielgruppe beim Umsortieren ändert den Zustand nicht; ausgebrochener Pane landet lose | erfüllt | `tabGroups.ts:369-375` (Tab schon im Zustand → `state`); für einen neuen Tab `joins = undefined` (`tabGroups.ts:387`); `breakOutPaneFromTabs` übergibt den neuen Tab, ohne ihn vorher einzufügen (`useTabs.ts:435-446`) |
| A5 | `activeAfterHide`, `idBehindGroup` über die gemeinsame Ableitung | erfüllt | `tabGroups.ts:202-204`, `tabGroups.ts:299-308` (Ergebnis wie vor dem Fix); Sweep criterion: in den geänderten Zeilen leitet kein neuer Treffer von `spaceId (===|!==)` eine Liste ab |

**Weitere geänderte Stellen ohne Abweichung:** F2 (`withGroup`/`withoutGroup`/`validGroupOf`/`appendToSpace` aus `tabGroups.ts`; `changeTabSpace` bleibt der einzige Schreiber für den Space eines einzelnen Tabs nach SVC-14, `useTabs.ts:265-274`; `serialize.ts:324`), F3 (`newTabInSpace` über `lazyTerminal`, `useTabs.ts:811-815`, gleiche Tab-Form wie vorher), F4 (API-13: Pflichtfelder `commands.ts:74-76`, verdrahtet in `App.tsx:1521-1524`), F6 (nur ein Kommentar, `TabGroupHeader.tsx:149-150`). E2 umgesetzt wie entschieden: `useTabCloseGuards.ts:33-49,126`. Die Einzel-Regel `closeConfirmReason` bleibt die Quelle für Einzel- und Sammel-Prüfung (SVC-13), und das Einzel-Schließen ist unverändert (`useTabCloseGuards.ts:72-90`).

**Entschieden, kein Befund (laut Auftrag):** Bei „Close group“ fragt jedes Terminal-Mitglied mit tmux-Bindung nach (E2, Abweichung von BR-15). Bei „App beenden“ gilt weiter die bisherige Prozess-Regel (E3, Abweichung von INV-14).

**Beobachtung ohne Befund:** Sonderfall: Der aktive Tab ist der letzte Tab seines Space und landet über den Space-Überblick in einer eingeklappten Gruppe eines anderen Space. Dann folgt die Ansicht in den Ziel-Space (`App.tsx:1432-1435`), aktiv wird aber nach SVC-8 der sichtbare Nachbar, nicht der gezogene Tab. Das entspricht der Entscheidung E1, übertragen auf den Fall über Space-Grenzen (N1). INV-17 („die Ansicht folgt dem Tab“) gilt hier nur für den Space, nicht für den aktiven Tab.
