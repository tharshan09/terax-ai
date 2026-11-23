# Gate 1 — Architecture Compliance (Perspektive `ui`)

| Feld | Wert |
|------|------|
| Feature | Tab-Gruppen (`specs/2026-11-23-tab-groups`) |
| Geprüft | `architecture.md`, `discovery.md`, `codebase-scan.md`; Code im Worktree `.claude/worktrees/tab-groups` (HEAD `e2e117c`) |
| Clickdummy / bindings | nicht vorhanden / `bindings_path` und `reconcile_path` null |
| Prüfdatum | 2026-11-23 |
| Lauf | Perspektive `ui` (Oberfläche und Bedienung), kein Delta-Lauf |
| Prüfmenge | UI-, ST-, TR-, FL-, EP-Zeilen der Discovery gegen die Architecture; Bestands-Behauptungen mit Beleg in `src/modules/tabs/TabBar.tsx`, `tabs/lib/tabStripGap.ts`, `tabs/TabActivityIndicator.tsx`, `spaces/components/InlineRename.tsx`, `components/ui/context-menu.tsx`, `app/components/CloseDialogs.tsx`, `command-palette/commands.ts`, Durchschalt- und Sprung-Wege in `src/app/App.tsx` sowie deren direkte Nachbarn (`header/Header.tsx`, `terminal/lib/useTerminalPaneDnd.ts`, `terminal/lib/paneDndStore.ts`, `tabs/TabSwitcherHud.tsx`, `tabs/lib/useTabSwitcher.ts`) |
| Nicht in dieser Perspektive | Persistenz und Schema (`serialize.ts`, `store.ts`, `validate.ts`, `useSpacePersistence.ts`, `useSpacesBoot.ts`; Perspektive `data`), Regel-Kern in `useTabs.ts` außer Navigation (Perspektive `code`), Dependency-Laufzeit (Perspektive `runtime`) |

## Skript-Tabelle (Arch-Precheck, übernommen)

Ergebnis: **PASS**

| Check | Ergebnis |
|-------|----------|
| AR-1 | PASS 19 h2 konform |
| AR-1d | PASS |
| AR-2 | PASS 79 definierte IDs, 135 referenziert |
| AR-3 | PASS 23 Anker aufgelöst |
| AR-4 | PASS 18 INV-Zeilen |
| AR-5 | PASS 19 Testnamen gefunden |
| AR-6 | PASS 10 Zeilen mit Version |
| AR-7 | WARN 6 NEW-Zeilen ohne Zielpfad (Befund `note`, siehe N-5) |
| AR-8 | PASS 3 Dispositionen |
| AR-9 | SKIP keine bindings.md |
| AR-10 | PASS 15 MIG-Zeilen |
| AR-11 | PASS 0 automatische |
| AR-12 | PASS kein neuer Fachbereich |
| AR-13 | PASS |
| AR-Q | PASS |

## Summary

| Klasse | Anzahl |
|--------|--------|
| decision | 2 |
| refuted | 0 |
| fix | 8 |
| obligation | 5 |
| note | 5 |

**Verdict:** FAILED (zwei `decision`-Befunde: D-1, D-2)

---

## A) Feature Mapping (UI-, ST-, TR-, FL-, EP-Zeilen)

| Item | Architecture-Antwort | Status |
|------|----------------------|--------|
| UI-1 `group_header` | `TabGroupHeader.tsx` (Layer), SVC-2, API-7, API-9, MIG-3 | teilweise — Klick und Doppelklick kollidieren (D-1); Tooltip ohne Baustein (N-1) |
| UI-2 `group_line` | MIG-3 „Köpfe und Farblinie" | PASS, Auflage O-2 |
| UI-3 `group_aggregate_indicator` | SVC-6, NFR-1, MIG-15 | teilweise — Zeichen-Darstellung nicht wiederverwendbar ohne Umbau (F-7) |
| UI-4 `group_header_menu` | API-4/5/6/10/11; Untermenü `context-menu.tsx:43,100,124` | PASS, N-2 |
| UI-5 `tab_group_menu_items` | MIG-3 „Menü an allen Tab-Arten", API-1..3 | teilweise — EP-7 fehlt (F-6); Close-Eintrag hängt an `tabs.length` (F-4) |
| UI-6 `group_color_picker` | API-6, VAL-2, Palette 8 Farben | PASS |
| UI-7 `group_name_input` | MIG-13, VAL-1, API-5 | PASS, Auflagen O-1, O-5 |
| UI-8 `group_close_dialog` | MIG-6, MIG-7, SVC-13, API-11 | PASS, F-8, N-3 |
| UI-9 `strip_drop_marker` | MIG-3, SVC-10 | teilweise — Pane-Ziehen fehlt (F-1); Lücke am Kopf mehrdeutig (F-5) |
| UI-10 `palette_group_commands` | API-13, MIG-14 | PASS (`hidden` = Eintrag weglassen; `PaletteItem` kennt nur `disabledReason`, `types.ts:15`) |
| ST-1 `ungrouped` | `Tab.groupId` fehlt | PASS |
| ST-2 / ST-3 | `TabGroup.collapsed` | PASS |
| ST-4 `renaming` | MIG-13 + Kopf-Komponente | PASS |
| ST-5 `close_confirm` | MIG-6 „Zustand Gruppe schließen offen" | PASS |
| ST-6 `removed` | SVC-2, SVC-3 | PASS |
| TR-1 | API-1 | PASS |
| TR-2 | API-5, VAL-1 | PASS |
| TR-3 | API-2, API-8 | PASS (F-5 gilt für den Ziehweg) |
| TR-4 / TR-5 | API-7 | PASS |
| TR-6 | SVC-9 | PASS, Auflage O-3 |
| TR-7 | API-5 (Weg Doppelklick nicht beschrieben) | offen — D-1 |
| TR-8 / TR-9 | API-6 / API-4 | PASS |
| TR-10..TR-13 | API-11, SVC-13, MIG-6, MIG-7 | PASS |
| TR-14 | API-10, SVC-12 | PASS |
| TR-15 / TR-16 | SVC-2/3; API-3, API-8 | PASS |
| FL-1..FL-5 | API-1, VAL-1, API-2, API-8/SVC-10, API-7/SVC-2/SVC-6 | PASS (FL-4: F-5) |
| FL-6 | SVC-1, MIG-1, MIG-5 | PASS für Tastatur, Nummer, Wischen, Umschalter; Space-Wechsel offen (D-2) |
| FL-7 / FL-8 | SVC-9 / API-7 | PASS |
| FL-9..FL-12 | API-3, UI-4, API-11, API-10 | PASS |
| FL-13 | SVC-15 | nicht in Perspektive (`data`) |
| EP-1 | API-7, SVC-8 | PASS |
| EP-2 | API-11 `cancelCloseGroup` | PASS |
| EP-3 | SVC-3 | PASS |
| EP-4 | SVC-15 | nicht in Perspektive (`data`) |
| EP-5 | SVC-12 | PASS |
| EP-6 | VAL-5 | PASS (`ContextMenuItem` hat `data-disabled`-Stil, `context-menu.tsx:92`) |
| EP-7 | — | FEHLT — F-6 |
| EP-8 | SVC-7, SVC-9 | Regel PASS; das Schließen in der Leiste fehlt (F-4) |
| EP-9 | SVC-13, BR-25 | PASS |

## B) Constraint Mapping (UI)

| Constraint | Architecture-Antwort | Status |
|------------|----------------------|--------|
| Gruppenname ≤ 32 Zeichen, getrimmt (BR-6, DF-1) | VAL-1 + MIG-13 (Höchstlänge an `InlineRename`) | PASS, O-5 |
| Dialog-Texte (Screen „Rückfrage") | MIG-7 | PASS, N-3 |
| Sichtbare Texte Englisch (BR-23) | Konvention (Scan „UI-Texte Englisch") | PASS |
| Pane wird per Ziehen auf die Leiste zum Tab, Zugehörigkeit nach Lücke (BR-11, letzter Satz) | API-12, SVC-10 | FEHLT im Pfad — F-1 |
| Tab auf Tab = Split (BR-13) | Constraint-Zeile, `TabBar.tsx:208-233` | PASS |
| 30 Tabs ohne Verzögerung (NFR-2) | SVC-1/SVC-2 einmal je Änderung | PASS (QA) |

## C) Realistic Data

Keine externe API. Die Daten der Oberfläche sind Nutzereingaben und Zustandswerte.

| Feld | Quelle | Messung | Status |
|------|--------|---------|--------|
| Gruppenname | Nutzereingabe, UI-Grenze 32 | `InlineRename.tsx:35-52` ohne `maxLength`; MIG-13 ergänzt sie | PASS, O-5 |
| Farb-Index | Palette | `spaceColor.ts:5-14` = 8 Einträge; `accentFor` fällt bei ungültigem Index auf `var(--primary)` zurück (`:16-19`) | PASS |
| Tab-Id im DOM | `data-tab-id` | numerisch, gelesen per `Number(el.dataset.tabId)` (`TabBar.tsx:218`) | PASS, O-4 |
| Lücken-Ziel | `gapIndexAt` | zählt nur `[data-tab-id]` (`tabStripGap.ts:47-52`) | F-5 |

## D) Completeness + Dependencies (UI)

| Item | Evidenz | Status |
|------|---------|--------|
| Externe APIs | keine (lokale App) | N/A |
| Bausteine vorhanden | `context-menu.tsx` (Sub, SubTrigger, SubContent, Separator: `:43,100,124,215`), `alert-dialog` (genutzt in `CloseDialogs.tsx:1-10`), `tooltip.tsx` in `src/components/ui/` | PASS — keine neue Abhängigkeit |
| `ContextMenuSub` produktiv genutzt | im Produktcode nicht genutzt (grep außerhalb `components/ui`: 0 Treffer) | Hinweis — erster Einsatz, QA prüft das Untermenü |
| Versionen | AR-6 (Skript) | übernommen |
| Untermenü läuft mit installierter Version | `node_modules` fehlt im Worktree | NICHT GEMESSEN — Laufzeit-Perspektive |

## F) Migration Completeness (UI-Dateien)

Gilt, weil MIG-1 bestehenden Code „umstellen" lässt.

| Datei | MIG | Status |
|-------|-----|--------|
| `src/modules/tabs/TabBar.tsx` | MIG-3 | vorhanden; Eingangs-Liste und Close-Bedingung fehlen (F-4) |
| `src/modules/tabs/lib/tabStripGap.ts` | MIG-2 | vorhanden; Form des Ziels unvollständig (F-5) |
| `src/modules/tabs/TabActivityIndicator.tsx` | — | FEHLT (F-7) |
| `src/modules/spaces/components/InlineRename.tsx` | MIG-13 | PASS |
| `src/components/ui/context-menu.tsx` | — | keine Änderung nötig, PASS |
| `src/app/components/CloseDialogs.tsx` | MIG-7 | vorhanden; Ist-Muster falsch beschrieben (F-8) |
| `src/modules/command-palette/commands.ts` | MIG-14 | PASS |
| `src/app/App.tsx` | MIG-5 | vorhanden; `spaceTabs` speist Leiste und Wischen zugleich (F-4); Space-Wechsel (D-2) |
| `src/modules/header/Header.tsx` | — | FEHLT (F-3) |
| `src/modules/terminal/lib/useTerminalPaneDnd.ts`, `terminal/lib/paneDndStore.ts`, `terminal/TerminalStack.tsx` | — | FEHLT (F-1) |
| `src/modules/tabs/TabSwitcherHud.tsx` | — | keine Änderung nötig, solange es die sichtbare Liste bekommt (F-4) |
| Sweep-Kriterium | `grep -rnE "spaceId (===\|!==)"` | mechanisch anwendbar; findet die Brüche der Oberfläche nicht (Zählung `tabs.length`, Lücke als Zahl in Signaturen); die Lücken F-1, F-3, F-4 liegen außerhalb des Kriteriums |

## E) Pattern Consistency — Gate 1b (Scan-Empfehlungen der Oberfläche)

| Empfehlung (Scan) | Architecture | Status |
|-------------------|--------------|--------|
| REUSE `SPACE_COLORS`/`accentFor` | DB-1 Farb-Index, UI-6 | PASS |
| REUSE `ContextMenu*` | Integrations, Layer | PASS |
| EXTEND `selectTabAgentStatus` | MIG-15: neue Funktion daneben, Begründung in den Trade-offs (INV-16) | PASS (begründet abgewichen) |
| EXTEND `TabActivityIndicator` | nicht adressiert | Befund F-7 |
| EXTEND `InlineRename` | MIG-13 | PASS (vermeidet dritte Umbenennen-Stelle, Scan-K4-Hinweis) |
| EXTEND `gapIndexAt` | additiv `gapTargetAt`, `gapIndexAt` unverändert (INV-5) | PASS (begründet: Panes-Welle C) |
| REUSE `useTabSwipe` / `useTabSwitcher` unverändert | nicht in der Migration Map, die Callbacks in MIG-5 | PASS |
| EXTEND `commands.ts` | MIG-14 | PASS |
| EXTEND `swipeTab`, `getSwitcherOrder`, `selectByIndex`, `activateAgentTarget`, `jumpToTab` | MIG-5, SVC-9 (Sprünge unverändert, Regel am aktiven Tab) | PASS |
| NEW Kopf, Linie, Marke | `TabGroupHeader.tsx`, MIG-3 | PASS |
| NEW Gruppen-Schließen-Dialog („kein Vorbild") | MIG-7 | Vorbild existiert (`CloseDialogs.tsx:110-161`, `useAppCloseGuard.ts:7-14`) — F-8, N-4 |
| AVOID | keine | N/A |
| Disposition 1 (k2, consolidate) | SVC-1; Fundstellen `App.tsx:353`, `:645` über MIG-5, `App.tsx:334` über das Sweep-Kriterium | PASS im Katalog; die Umsetzung an `App.tsx:334` hängt an D-2 |
| Disposition 2 (k4, consolidate) | SVC-1; `getSwitcherOrder` (`App.tsx:640`), `swipeTab`, `pickTabBySpaceIndex` (`useTabs.ts:219`) über MIG-1/MIG-5 | PASS (`consolidate` gilt für K1–K4, kein Guard nötig) |
| Disposition 3 (k1) | `useTabs.ts` | nicht in Perspektive (`code`) |
| Linsen-Ausfall | keiner | N/A |

## E2) Bindings Coverage — Gate 1c

N/A — `bindings_path` und `reconcile_path` sind null (kein bindings.md im Projekt).

## E3) Existing-Behavior Invariants — Gate 1d (Zeilen der Oberfläche)

| INV | Gemessene Quelle | Coverage-Prüfung (Testinhalt) | Konsumenten | Status |
|-----|------------------|-------------------------------|-------------|--------|
| INV-3 | `useTabs.ts:219-226` filtert nach `spaceId`, Index im Pool | `pickTabBySpaceIndex.test.ts:18-20` prüft B statt A | `useTabs.ts:1300-1305` `selectByIndex` | PASS |
| INV-5 | `tabStripGap.ts:46-53` Halbbreite, `els.length` hinter allem | `tabStripGap.test.ts:34-44` passt zur Aussage | `TabBar.tsx:232` stimmt; `useTerminalPaneDnd.ts:209` fehlt | PASS mit Ergänzung (F-1) |
| INV-6 | `tabStripGap.ts:34-39` `stripHasTab` | `tabStripGap.test.ts:112-115` passt zur Aussage | angegeben `TabBar.tsx:232` — dort wird `stripHasTab` nicht aufgerufen; der echte Konsument ist `useTerminalPaneDnd.ts:208` | F-2 |
| INV-12 | `App.tsx` `swipeTab`: `spaceTabs`-Reihenfolge, `Math.min/Math.max` ohne Umlauf, Abbruch am Rand | uncovered → qa_matrix | `useTabSwipe(appRootRef, swipeTab)` | PASS |
| INV-13 | `App.tsx:640-649` MRU des Space; `useTabSwitcher.ts:23` Umlauf modulo | uncovered → qa_matrix | `useTabSwitcher` `App.tsx:653` | PASS |
| INV-14 | `useTabCloseGuards.ts:25-45` Editor dirty / Vordergrundprozess → Rückfrage, sonst `disposeTab` | uncovered → qa_matrix | `App.tsx:595-606` | PASS |
| INV-15 | `App.tsx:922-931` Space wechseln, `setActiveId`, `focusPane` | uncovered → qa_matrix | `App.tsx:982`, `:1020`, `:1224` | PASS |
| INV-16 | `selectTabAgentStatus.ts:23-29` | `TabActivityIndicator.test.tsx:88-94` (working > waiting, idle trägt nichts bei) | `TabActivityIndicator.tsx:21` | PASS |
| INV-17 | `useTabs.ts:626-647`, `App.tsx:1326-1332` | uncovered → qa_matrix | `SpaceSwitcher.tsx:225` | PASS |
| INV-1, -2, -4, -7..-11, -18 | — | — | — | nicht in Perspektive (`code`/`data`) |

Jede Scan-Invariante der Oberfläche (INV-3, -5, -6, -12..-17) ist übernommen. Die Routing-Abweichung INV-13/-14/-17 (Scan `differential_check`, Architecture `qa_matrix`) steht unter PM-Bestätigung Q&A 4.

---

## Data Type Verdicts

| Feld | Typ in der Architecture | Evidenz | Verdict |
|------|-------------------------|---------|---------|
| `TabGroup.name` / Gruppen-Eintrag `name` | Text, VAL-1 ≤ 32 | Nutzereingabe; `InlineRename.tsx:35-52` ohne `maxLength`; MIG-13 ergänzt | OK (Zählmaß: O-5) |
| `TabGroup.color` / Gruppen-Eintrag `color` | Ganzzahl, Index in die Palette | `spaceColor.ts:5-14` (8 Werte), `accentFor` `:16-19` | OK |
| `TabGroup.collapsed` | Wahrheitswert | — | OK |
| `TabGroup.id` | Text, je Sitzung eindeutig | Tab-Ids sind Zahlen im DOM (`TabBar.tsx:218`) | OK, wenn der Kopf ein eigenes Attribut trägt (O-4) |
| `GapTarget` | Lücke im sichtbaren Streifen + `groupId` + „auf eingeklapptem Kopf" | `tabStripGap.ts:47`: links und rechts eines Kopfs gilt derselbe Index | UNVOLLSTÄNDIG — F-5 |
| `PaneDropTarget.newTab` | (nicht erfasst) | `paneDndStore.ts:17` `{ kind: "newTab"; gapIndex: number }` | UNVOLLSTÄNDIG — F-1 |
| `Header.onReorder` | (nicht erfasst) | `Header.tsx:47` `(fromId: number, toGapIndex: number)` | UNVOLLSTÄNDIG — F-3 |

## Bestands-Behauptungen (Perspektive `ui`)

| # | Behauptung (architecture.md) | Beleg | Verdikt |
|---|------------------------------|-------|---------|
| 1 | Untermenü-Bausteine vorhanden, `context-menu.tsx:43` (Integrations, Research Log) | `context-menu.tsx:43,100,124,256-258` | hält |
| 2 | Untermenü läuft mit installierter radix-ui-Version | — | NICHT GEMESSEN — `node_modules` fehlt im Worktree; Laufzeit-Perspektive |
| 3 | Schließen-Dialoge liegen in `CloseDialogs.tsx` | `CloseDialogs.tsx:45-164` | hält |
| 4 | MIG-7 Ist-Muster „Dialoge je Tab" | `CloseDialogs.tsx:110-139` (ein Dialog für mehrere Tabs, `pendingDeleteTabs: number[]`), `:141-161` (Sammel-Rückfrage beim Beenden) | hält nicht vollständig — F-8 |
| 5 | MIG-13: `InlineRename` fest „Rename space", ohne Längengrenze | `InlineRename.tsx:38`, keine `maxLength` in `:35-52` | hält |
| 6 | MIG-3: flache Tab-Liste, Rechtsklick-Menü nur an Terminal-Tabs | `TabBar.tsx:299`, `:605-644` | hält |
| 7 | MIG-2: Treffertest liefert nur Lücken-Index; `gapIndexAt`, `tabStripAt`, `stripHasTab` | `tabStripGap.ts:21-53` | hält |
| 8 | INV-5 Aussage, Test, Konsument | `tabStripGap.ts:46-53`; Test `:34-44`; `TabBar.tsx:232` | hält (weiterer Konsument: F-1) |
| 9 | INV-6 Konsument `TabBar.tsx:232` | `stripHasTab` nur in `useTerminalPaneDnd.ts:208` aufgerufen | hält nicht — F-2 |
| 10 | INV-16 working > waiting, Test-Inhalt | `selectTabAgentStatus.ts:23-29`; Test `:88-94` | hält |
| 11 | MIG-15: Selektor zero-alloc, primitiv, bleibt unverändert | `selectTabAgentStatus.ts:19-30` | hält |
| 12 | Layer: „Status-Zeichen" ist bestehender, wiederverwendbarer Baustein | `TabActivityIndicator.tsx:8-41`: Zeichen fest an `paneTree` und Tab-Priorität gebunden | hält nicht ohne Umbau — F-7 |
| 13 | NFR-1: Vorbild-Test am Tab-Zeichen existiert | `TabActivityIndicator.test.tsx:30-50` | hält |
| 14 | Palette mit 8 Farben, `spaceColor.ts:5` | `spaceColor.ts:5-14` | hält |
| 15 | MIG-14: flache Befehlsliste, ID-Schema `tab.*` | `commands.ts:75-77`, `:152`; `types.ts:6-17` | hält |
| 16 | MIG-5: eigene Streifen-Filter `spaceTabs`, `getSwitcherOrder`, `swipeTab` | `App.tsx:353-356`, `:640-649`, `swipeTab` | hält; `spaceTabs` speist zusätzlich Leiste (`App.tsx:1533`) und Umschalter-Anzeige (`:1744`) — F-4 |
| 17 | INV-12 Wischen ohne Umlauf, Halt am Rand | `App.tsx` `swipeTab` (clamp) | hält |
| 18 | INV-13 Umschalter MRU, Umlauf, nur aktiver Space | `App.tsx:640-649`; `useTabSwitcher.ts:19-28` | hält |
| 19 | INV-15 Sprung wechselt Space, aktiviert, fokussiert | `App.tsx:922-931` | hält |
| 20 | INV-17 einzelner Tab wechselt Space; Nachbar bzw. Ansicht folgt | `useTabs.ts:626-647`; `App.tsx:1326-1332` | hält |
| 21 | INV-14 Schließen-Rückfrage bei Vordergrundprozess oder dirty | `useTabCloseGuards.ts:25-45` | hält |
| 22 | INV-3 Tab nach Nummer zählt nur den aktiven Space | `useTabs.ts:219-226`; Test `:18-20` | hält |
| 23 | Annahme: alle Aktivierungen laufen über den aktiven-Tab-Zustand von `useTabs` | `useTabs.ts:560` (`useState`); `App.tsx:928`, `:1359`, `:1535` (`onSelect={setActiveId}`), Umschalter `onCommit`, `swipeTab` | hält für alle gemessenen Wege der Oberfläche |
| 24 | Annahme: eingeklappte Mitglieder werden nicht als Tab-Elemente gezeichnet; `applyGapTarget` übersetzt sichtbare Lücken eindeutig | `tabStripGap.ts:47` zählt nur `[data-tab-id]`; links und rechts eines Kopfs gilt derselbe Index | erster Teil hält, zweiter nicht — F-5 |
| 25 | Constraint: Split und Lücke bleiben getrennt; der Gruppen-Kontext hängt nur an der Lücke | `TabBar.tsx:208-233` | hält |
| 26 | SVC-10 / API-12: Treffertest gilt „auch für einen ausgebrochenen Pane" | Treffertest des Pane-Ziehens in `useTerminalPaneDnd.ts:202-209`, nicht in `TabBar.tsx` oder `tabStripGap.ts` | Pfad nicht erfasst — F-1 |
| 27 | API Overview: `App.tsx` reicht Aktionen an die Leiste durch | dazwischen liegt `Header.tsx:29-89`, `:190-206` mit expliziter Prop-Liste | unvollständig — F-3 |
| 28 | Research Log: letzter Tab eines Space lässt sich nicht schließen (`useTabs.ts:460`) | `useTabs.ts:466`; `useTabCloseGuards.ts:27`; in der Leiste `tabs.length > 1` (`TabBar.tsx:345`, `:414`, `:624`) | hält |
| 29 | SVC-9: Sprünge aus Glocke, Mission Control, Benachrichtigung, Space-Übersicht | `activateAgentTarget` (`App.tsx:922`, Aufrufe `:982`, `:1020`, `:1224`), `jumpToTab` (`App.tsx:1355-1363`) | hält |

Self-Check: 28 Verdikte + 1 NICHT GEMESSEN = 29 erhobene Behauptungen.

---

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|----|--------|-------|-----------|-------|-------|-------------|------------------------|------------|-------------------|
| D-1 | decision | A (UI-1, TR-7) | architecture.md (ggf. discovery.md UI-1) | API-7: „Klappt um. Beim Einklappen mit aktivem Mitglied: neuer aktiver Tab nach SVC-8, notfalls neues Terminal im selben Schritt"; Discovery UI-1: „Klick klappt um … Doppelklick startet Umbenennen" | Ein Doppelklick erzeugt vor `dblclick` zwei `click`-Ereignisse (W3C UI Events, Mouse Event Order). Am Tab ist das harmlos, weil Auswählen idempotent ist (`TabBar.tsx:406-412`); Umklappen ist es nicht | dependency | Doppelklick auf den Kopf der Gruppe mit dem aktiven Tab: der erste Klick klappt ein und wechselt den aktiven Tab nach SVC-8 oder öffnet ein neues Terminal (EP-1), der zweite klappt auf, der aktive Tab bleibt der neue (TR-5); erst dann öffnet sich das Namensfeld | Entscheiden: (a) Klick wirkt erst nach dem Doppelklick-Fenster (Einklappen verzögert), (b) Umbenennen nur über das Menü und den Doppelklick streichen (weicht ab von UI-1/TR-7), (c) Doppelklick nur auf dem Namen einer aufgeklappten Gruppe, die nicht den aktiven Tab enthält. In API-7/TabGroupHeader festhalten | nein |
| D-2 | decision | A (FL-6), F (Sweep) | architecture.md (MIG-5, Sweep criterion) | „Jeder Treffer, der eine Tab-Liste für Anzeige, Durchschalten, Nachfolger-Wahl oder Ziehen ableitet, ruft danach SVC-1" | Beim Space-Wechsel wird der letzte Tab des Space aktiv, ohne Tab passiert nichts (`App.tsx:334-339`). Ein Space mit nur eingeklappten Gruppen ist erreichbar: Ein nicht aktiver Tab wird ohne Ausweich-Logik verschoben (`useTabs.ts:633-640`, `SpaceSwitcher.tsx:225`), und nach SVC-7 darf ein nicht aktiver letzter sichtbarer Tab geschlossen werden (`useTabCloseGuards.ts:27`, Schließen aus der Space-Übersicht `App.tsx:1379`) | code | Mit SVC-1 (sichtbar) ist die Liste leer: der aktive Tab bleibt im alten Space, die Leiste zeigt einen Space ohne aktiven Tab. Mit allen Tabs wird der letzte Tab aktiv, und SVC-9 klappt seine Gruppe auf, auch wenn es sichtbare Tabs gibt | Entscheiden, welcher Tab beim Space-Wechsel aktiv wird. Empfehlung: der letzte sichtbare Tab; gibt es keinen, der letzte Tab des Space, dessen Gruppe aufklappt (wie BR-24). `App.tsx:334` in MIG-5 benennen | nein |
| F-1 | fix | F, B (BR-11), A (UI-9) | architecture.md (Migration Map, SVC-10, API-12) | SVC-10: „`applyGapTarget` übersetzt das Ziel … auch für einen ausgebrochenen Pane" | Der Pane-Treffertest steht in `useTerminalPaneDnd.ts:202-209` (`gapIndexAt` → `{kind:"newTab", gapIndex}`); der Typ des Ziels in `paneDndStore.ts:17`; die Leiste zeichnet die Marke aus dem Store-Index (`TabBar.tsx:125-137`); die Signaturen `breakOutPane(…, gapIndex: number)` in `TerminalStack.tsx:35` und `App.tsx:1187` | code | Ein Pane, der zwischen zwei Mitglieder gezogen wird, wird ein loser Tab, und die Marke ist neutral statt in Gruppenfarbe | MIG-Zeilen für `useTerminalPaneDnd.ts` (ruft `gapTargetAt`), `paneDndStore.ts` (`newTab` trägt `GapTarget`), `TerminalStack.tsx` und `App.tsx` `handleBreakOutPane` (Ziel statt Zahl) ergänzen; MIG-3 nennt die Pane-Marke in Gruppenfarbe | nein |
| F-2 | fix | E3 | architecture.md (INV-6) | INV-6, Consumers: „`src/modules/tabs/TabBar.tsx:232`" | `TabBar.tsx:22` importiert nur `gapIndexAt` und `TAB_STRIP_ATTR`; `stripHasTab` wird nur in `useTerminalPaneDnd.ts:208` aufgerufen | code | grep `stripHasTab` außerhalb von Tests trifft nur `useTerminalPaneDnd.ts` | Consumers auf `src/modules/terminal/lib/useTerminalPaneDnd.ts:208` korrigieren (bei INV-5 zusätzlich `:209` nennen) | nein |
| F-3 | fix | F | architecture.md (Migration Map) | MIG-5: „Gruppen-Zustand an `TabBar`" | `Header.tsx:29-89` führt jede TabBar-Prop einzeln, `:190-206` reicht sie durch; `onReorder: (fromId: number, toGapIndex: number)` steht in `:47` | code | Ohne Änderung an `Header.tsx` erreichen Gruppen-Daten und Gruppen-Aktionen die Leiste nicht, und das neue Ziel-Format von API-8 passt nicht zum Prop-Typ | MIG-Zeile für `src/modules/header/Header.tsx`: Gruppen-Daten und -Aktionen durchreichen, `onReorder` und die neue Gruppen-Zieh-Aktion mit `GapTarget` typisieren | nein |
| F-4 | fix | A (EP-8, UI-5), F | architecture.md (MIG-3, MIG-5) | MIG-5: „`spaceTabs`, `getSwitcherOrder`, `swipeTab` auf SVC-1" | `spaceTabs` (`App.tsx:353-356`) speist die Leiste (`App.tsx:1533` → Header → TabBar), die Umschalter-Anzeige (`App.tsx:1744`) und das Wischen. Die Leiste zeigt Schließen nur bei `tabs.length > 1` (Knopf `TabBar.tsx:345`, Mittelklick `:414`, Menü `:624`) | code | Bekommt die Leiste nur sichtbare Tabs, fehlt am letzten sichtbaren Tab das Schließen (gegen BR-24/EP-8), und eingeklappte Köpfe haben keine Mitglieder für Anzahl und Sammelzeichen | In MIG-5/MIG-3 festlegen: die Leiste bekommt den ganzen Streifen (SVC-1 „alle") samt Gruppen und zeichnet über SVC-2; Schließen zählt alle Tabs des Space; Wischen, Umschalter und Umschalter-Anzeige bekommen die sichtbare Liste | nein |
| F-5 | fix | C, A (FL-4, UI-9, BR-11, BR-14) | architecture.md (DTO `GapTarget`, SVC-10, SVC-11) | `GapTarget`: „Ziel-Lücke im sichtbaren Streifen, `groupId` oder keine, optional ‚auf eingeklapptem Kopf'" | `gapIndexAt` zählt nur `[data-tab-id]` (`tabStripGap.ts:47-52`); die Marke wird je Tab-Index gezeichnet (`TabBar.tsx:648-651`). In `[A][●G eingeklappt][B]` ergibt der Zeiger links und rechts des Kopfs dieselbe Lücke 1 ohne Gruppe | code | Ein Tab oder eine Gruppe, die links eines eingeklappten Kopfs abgelegt wird, kann rechts davon landen (oder umgekehrt); die Marke steht nicht dort, wo abgelegt wird | `GapTarget` um die Lage zum Kopf erweitern (Lücke gezählt über Köpfe und Tabs, oder Seite „vor/hinter Kopf `groupId`"), für API-8, API-9 und API-12; die Marke wird an derselben Stelle gezeichnet | nein |
| F-6 | fix | A (EP-7, UI-5) | architecture.md (MIG-3 bzw. API-2/VAL-4) | MIG-3: „Menü an allen Tab-Arten" (ohne EP-7) | EP-7 ist in der Architecture nicht erwähnt; `ContextMenuItem` hat einen Deaktiviert-Stil (`context-menu.tsx:92`, `data-disabled`) | artifact | „Add to group" ist ausgegraut, wenn es im Space keine Gruppe gibt außer der eigenen des Tabs | In MIG-3/UI-5: „Add to group" deaktiviert, wenn der Space keine andere Gruppe hat (EP-7); das Untermenü ohne die eigene Gruppe, namenlose als „Unnamed group" | nein |
| F-7 | fix | E, A (UI-3) | architecture.md (Migration Map) | Layer Oberfläche: „Bestehende UI-Bausteine (… Status-Zeichen)" | `TabActivityIndicator.tsx:8-21`: das Zeichen nimmt einen `paneTree` und rechnet selbst mit `selectTabAgentStatus` (arbeitet schlägt wartet); die Darstellung `:25-41` lässt sich nicht von außen mit einem Status aufrufen. Scan-Empfehlung EXTEND (`codebase-scan.md`, Existing Abstractions) | code | Ohne Umbau zeichnet der Kopf eine zweite Kopie der Zeichen (Symbol und `aria-label`s), oder er übernimmt die Tab-Priorität entgegen BR-21 | MIG-Zeile `src/modules/tabs/TabActivityIndicator.tsx`: Darstellung je Status (`working`/`waiting`) als eigenen Baustein herauslösen, den Tab und Kopf nutzen; das Verhalten am Tab bleibt (INV-16, Tests `TabActivityIndicator.test.tsx:30-64` unverändert grün) | nein |
| F-8 | fix | E, Bestand | architecture.md (MIG-7) | MIG-7 Current Pattern: „Dialoge je Tab" | `CloseDialogs.tsx:110-139` (ein Dialog für mehrere Tabs mit Anzahl im Text), `:141-161` mit `appCloseMessage` `:30-42` (Sammel-Rückfrage aus Anzahl und Prozess) | code | Es gibt bereits Dialoge, die mehrere Tabs zusammenfassen und die Anzahl in den Text schreiben | Ist-Muster korrigieren: „Dialoge je Tab sowie Sammel-Dialoge (gelöschte Dateien, App beenden)"; der neue Dialog folgt diesem Muster | nein |
| O-1 | obligation | A (UI-7) | — (implement) | — | `TabBar.tsx:314-317`: ein Eingabefeld in einem `<button>` ist ungültig, und WebKit blockiert dort Fokus und Auswahl | code | Nach „Add to new group" und „Rename group" hat das Namensfeld im Kopf sofort den Fokus und den Text markiert, auch in der Tauri-WebView (macOS) | implement | nein |
| O-2 | obligation | A (UI-2) | — (implement, qa) | — | Die Markierung misst `offsetLeft` relativ zur Liste als `offsetParent` (`TabBar.tsx:169-182`); ein positionierter Gruppen-Rahmen würde zum `offsetParent` | code | Die Markierung des aktiven Tabs sitzt in einer aufgeklappten Gruppe genau unter dem Tab, auch nach Umsortieren und Ein-/Ausklappen davor | implement | nein |
| O-3 | obligation | A (TR-6, FL-7) | — (implement, qa) | — | Das Einblenden des aktiven Tabs läuft nur bei Änderung von `activeId` (`TabBar.tsx:259-264`) | code | Ein Sprung (Glocke, Mission Control, Benachrichtigung) zu einem Tab in einer eingeklappten Gruppe in einer überlaufenden Leiste klappt die Gruppe auf, rollt den Tab in den sichtbaren Bereich, und die Markierung steht darunter, ohne Zwischenbild mit eingeklappter Gruppe | implement | nein |
| O-4 | obligation | C | — (implement) | — | Die Treffertests suchen `[data-tab-id]`: `tabStripGap.ts:35`, `:47`; `TabBar.tsx:217`, `:262`; Tab-Ids sind Zahlen (`TabBar.tsx:218`) | code | Kopf, Linie und Marke tragen kein `data-tab-id`; Ziehen, Split-Erkennung und Einblenden verhalten sich ohne Gruppen wie heute (INV-5, INV-6) | implement | nein |
| O-5 | obligation | C (DF-1, VAL-1) | — (implement, qa) | — | HTML `maxLength` zählt UTF-16-Einheiten; VAL-1 kürzt zusätzlich beim Laden | artifact | Ein Name, den die Eingabe angenommen hat (auch mit Emoji oder Umlauten aus kombinierten Zeichen), steht nach dem Neustart unverändert im Kopf; es entsteht nie ein halbes Zeichen | implement | nein |
| N-1 | note | A (UI-1) | — | — | Die Leiste nutzt `title` (`TabBar.tsx:664`); `src/components/ui/tooltip.tsx` existiert, in `modules/tabs` und `modules/spaces` aber nicht genutzt | code | — | Tooltip „{Name} · {n} tabs" am Kopf über `title` wie in der übrigen Leiste | nein |
| N-2 | note | E (UI-4) | — | — | `SpaceAvatar` (`SpaceAvatar.tsx:19`, genutzt in `SpaceSwitcher.tsx:435`) | code | — | Das Untermenü „Move group to space" zeigt Avatare über `SpaceAvatar` statt eines neuen Bausteins | nein |
| N-3 | note | B (UI-8) | — | — | Discovery-Text „Close {n} tabs?" / „{m} of them still have …"; bestehende Texte unterscheiden die Einzahl (`CloseDialogs.tsx:31-34`) | code | — | Einzahl für n = 1 und m = 1 in der Discovery-Durchsicht klären | nein |
| N-4 | note | E | — | — | `useAppCloseGuard.ts:7-14` (`anyTerminalBusy` über eine Tab-Liste) und `:35-37` (Anzahl dirty Editoren) prüfen schon über mehrere Tabs | code | — | Die Perspektive `code` prüft, ob SVC-13 diese Regeln nutzt, statt sie ein drittes Mal zu kodieren | nein |
| N-5 | note | E (Skript AR-7) | — | — | Arch-Precheck AR-7: 6 NEW-Zeilen ohne Zielpfad | artifact | — | Übernommen aus dem Skript | nein |
