# Gate 1: Architecture Compliance, Perspektive `code`

| Feld | Wert |
|------|------|
| Geprüft | `specs/2026-11-23-tab-groups/architecture.md`, `discovery.md`, `codebase-scan.md`; Code unter `src/` im Worktree `.claude/worktrees/tab-groups` (HEAD `e2e117c`) |
| Prüfdatum | 2026-11-23 |
| Perspektive | `code` (Bestandscode, Contracts, Schemas/DTOs, Layer-Grenzen, Tests, Invarianten, Scanner-Empfehlungen) |
| Lauf | offen (kein Delta, kein Vorlauf-Report) |
| Clickdummy / bindings.md | keiner / keine (`bindings_path` null) |

## Skript-Tabelle (Arch-Precheck, übernommen)

| Check | Ergebnis |
|-------|----------|
| Gesamt | PASS |
| AR-1 | PASS 19 h2 konform |
| AR-1d | PASS |
| AR-2 | PASS 79 definierte IDs, 135 referenziert |
| AR-3 | PASS 23 Anker aufgelöst |
| AR-4 | PASS 18 INV-Zeilen |
| AR-5 | PASS 19 Testnamen gefunden |
| AR-6 | PASS 10 Zeilen mit Version |
| AR-7 | WARN 6 NEW-Zeilen ohne Zielpfad (note) |
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
| decision | 1 |
| refuted | 2 |
| fix | 4 |
| obligation | 5 |
| note | 5 (+ AR-7 aus dem Skript) |

**Verdict:** FAILED

## A) Feature Mapping

| Item | Evidenz | Status |
|------|---------|--------|
| BR-1 bis BR-21, BR-24, BR-25 | jeweils in API-n/SVC-n/VAL-n referenziert | PASS |
| BR-22, BR-23, EP-7, FL-2/4/5/6/8/10/11/12, TR-1/2/3/7/11/12/15, UI-1/2/4/6/7, ST-1..6 | in architecture.md nicht per ID referenziert; inhaltlich Oberfläche (MIG-3, TabGroupHeader) | NICHT GEMESSEN — Beleg liegt in der Perspektive `ui` (N-5) |
| Space-Wechsel wählt aktiven Tab (bestehendes Verhalten, `src/app/App.tsx:334-339`) mit eingeklappten Gruppen | weder Discovery noch Architecture regeln es | D-1 |

## B) Constraint Mapping

| Constraint | Architecture-Antwort | Evidenz | Status |
|------------|----------------------|---------|--------|
| Name max. 32 Zeichen (BR-6) | VAL-1 + MIG-13 (Höchstlänge an `InlineRename`) | `src/modules/spaces/components/InlineRename.tsx:36-55` hat heute keine Längengrenze und festes `aria-label="Rename space"` | PASS (O-4) |
| Hintergrund-Tabs laufen weiter (BR-8) | Nur Leiste blendet aus | `src/app/App.tsx:1652` reicht `tabs` (alle) an den Terminal-Stapel, nicht `spaceTabs` | PASS |
| Hot Path Sammelzeichen (NFR-1) | SVC-6 ohne Zwischenlisten, primitiver Wert | Muster `src/modules/tabs/lib/selectTabAgentStatus.ts:19-30`, Test-Vorbild `TabActivityIndicator.test.tsx:30` | PASS |
| Alte Dateien / Rückschritt | Felder optional; ältere Prüfung liest nur `tabs`/`activeTabIndex` | `src/modules/spaces/lib/validate.ts:18-24`; `serializeTab` baut neue Objekte (`serialize.ts:81-115`), Zusatzfelder fallen beim Schreiben weg | PASS |
| Tab auf Tab = Split (BR-13) | Bestehende Unterscheidung bleibt | `src/modules/tabs/TabBar.tsx:216-232` (innere Hälfte = merge, sonst Lücke) | PASS |
| BR-24 schließen des einzigen sichtbaren Tabs | SVC-7 | Schließen-Knopf, Mittelklick und Menü-„Close" hängen an `tabs.length > 1` (`TabBar.tsx:345`, `:414`, `:623`) | PASS mit O-1 |

## C) Realistic Data

C1 Codebase Evidence: Schema-Quellen sind `src/modules/spaces/lib/store.ts:17-20` (`SpaceState`), `serialize.ts:25-40` (`SerializedTab`), Handprüfung `validate.ts`. Bestehende Muster: Farbe als optionaler Index in `SPACE_COLORS` (`store.ts:12`, `spaceColor.ts:5-19`), optionale Felder per Spread weggelassen (`serialize.ts:53-58`), kaputte Einträge still verworfen (`serialize.ts:280-284`, `store.ts:43-48`).
C2 External API Analysis: keine externe API im Feature (kein Netz, kein Tauri-Befehl; SEC-1). N/A.
C3 Empfehlungs-Matrix: kein SQL-Schema; Typen gegen JSON-Datei und Code-Muster geprüft (Tabelle unten).

## D) Completeness + Dependencies

| Item | Evidenz | Status |
|------|---------|--------|
| Externe APIs | keine; Feature bleibt im React-Teil (`src/`), Rust-Teil out of scope | PASS |
| Untermenü-Bausteine vorhanden (Integrations „Menüs") | `src/components/ui/context-menu.tsx:43` `ContextMenuSub`, `:100` `ContextMenuSubTrigger`, `:124` `ContextMenuSubContent`, Export `:256-258` | PASS |
| Speicherung über bestehenden Store, kein neuer Schlüssel | `store.ts:22-26` (`terax-spaces.json`, `state:<id>`) | PASS |
| Versions-Spalte gegen Pinning/Lockfile | Dependency-Versionen gehören zur Perspektive `runtime` | NICHT GEMESSEN — außerhalb der Perspektive |

## F) Migration Completeness

Anwendbar (Umbau bestehender Ableitungen, Disposition 1 bis 3, „umstellen" in MIG-1).

| Item | Evidenz | Status |
|------|---------|--------|
| Map enthält Dateien, nicht Verzeichnisse | MIG-1 bis MIG-15 nennen Dateien | PASS |
| Funktions-Liste MIG-1 existiert | `useTabs.ts:219, 314, 347, 409, 460, 473, 514, 626, 650, 1230, 1440` | PASS |
| Sweep criterion mechanisch anwendbar | Lauf `grep -rnE "spaceId (===\|!==)" src --include=*.ts --include=*.tsx` ohne Tests: 25 Treffer | PASS |
| Sweep-Treffer abgedeckt | Alle Listen-Ableitungen außer `src/app/App.tsx:334` stehen in MIG-1/5/12 | FAIL → D-1 (Verhalten offen) |
| Sweep trifft den Bruch-Mechanismus | Verfehlt drei Kanäle ohne `spaceId`-Vergleich: Lücken-Index des Pane-Ausbrechens (`useTerminalPaneDnd.ts:209` → `App.tsx:1188`), Aufrufer von `nextActiveInSpace`, deren Eingabe um Gruppen wächst, und die Verbraucher von `spaceTabs` | F-1, F-2, F-3 |

## E) Pattern Consistency (Gate 1b)

| Scanner-Empfehlung | Architecture | Status |
|--------------------|--------------|--------|
| REUSE `SPACE_COLORS`/`accentFor` | Farbe = Index in die Space-Palette (DB-1, VAL-2) | PASS (O-3) |
| REUSE `ContextMenu*` | Layer „Oberfläche", Integrations-Zeile | PASS |
| EXTEND `useTabSwipe`/`useTabSwitcher` (Hooks unverändert, Callbacks filtern) | MIG-5 `swipeTab`, `getSwitcherOrder` | PASS |
| EXTEND `nextActiveInSpace` | SVC-7 | PASS (F-2, O-2) |
| EXTEND `pickTabBySpaceIndex`, `reorderTabsByGap`, `insertTabAtSpaceGap` | MIG-1 | PASS |
| EXTEND `gapIndexAt` | `gapTargetAt` additiv, `gapIndexAt` unverändert (MIG-2) | PASS (F-1) |
| EXTEND `selectTabAgentStatus` + `TabActivityIndicator` | SVC-6 als eigene Funktion in derselben Datei; begründet (Trade-off „INV-16 bleibt unberührt") | PASS, begründet abgewichen |
| EXTEND `InlineRename` | MIG-13 | PASS |
| EXTEND `useTabCloseGuards` | SVC-13, MIG-6 | PASS (N-4) |
| EXTEND `moveTabToSpace`, `reorderTab`, `planSpaceRemoval` | SVC-14, SVC-16 | PASS |
| EXTEND Persistenz-Dateien | MIG-8 bis MIG-12 | PASS |
| EXTEND `commands.ts` | MIG-14; bedingte Einträge nach bestehendem Muster `...(cond ? [..] : [])` (`commands.ts:~225`) | PASS |
| EXTEND `activateAgentTarget`, `jumpToTab` | statt Aufrufer-Änderung zentrale Regel SVC-9; begründet (Trade-off, Vorbild Kalt-Tab-Effekt `useTabs.ts:576-584`) | PASS, begründet abgewichen |
| NEW (Datenmodell, Regeln, Sichtbarkeit, Kopf, Aggregat, Dialog) | `tabGroups.ts`, `TabGroupHeader.tsx`, Dialog in `CloseDialogs.tsx` | PASS (Zielpfade: AR-7) |
| AVOID | keine | N/A |
| Disposition 1 (K2, consolidate) | Katalog-konform; eingelöst in MIG-1/MIG-5 für 5 von 6 Fund-Stellen; `App.tsx:334` fehlt | FAIL → D-1 |
| Disposition 2 (K4, consolidate statt vorgeschlagenem adopt_school) | Katalog erlaubt `consolidate` für K4; eingelöst über SVC-1 in MIG-1/MIG-5 | PASS (N-2) |
| Disposition 3 (K1, consolidate) | Genau zwei Schreiber `useTabs.ts:633`, `:664` → SVC-14 | PASS |
| Linsen-Ausfall | keiner | N/A |

## E2) Bindings Coverage (Gate 1c)

N/A — `bindings_path` und `reconcile_path` null, kein bindings.md im Projekt.

## E3) Existing-Behavior Invariants (Gate 1d)

| INV | Aussage am Code/Test | Konsumenten | Status |
|-----|----------------------|-------------|--------|
| INV-1 | `nextActiveInSpace.test.ts` „picks the previous…" prüft 3→2, 2→1; „falls forward…" 1→2 | `useTabs.ts:637`, `useTabCloseGuards.ts:28` rufen `nextActiveInSpace` | PASS |
| INV-2 | Tests prüfen Space-Grenze und `null` beim Letzten | `useTabCloseGuards.ts:28` | PASS |
| INV-3 | Test prüft Index-Pool je Space | `useTabs.ts:1300-1305` | PASS |
| INV-4 | Test `[1a,2b,3a,4b]` → `[2,3,1,4]`, b unverändert | `useTabs.ts:1682-1684` | PASS |
| INV-5 | Tests prüfen Halbbreite und `els.length` | `TabBar.tsx:232` richtig; zweiter Konsument `useTerminalPaneDnd.ts:209` fehlt | PASS (F-1) |
| INV-6 | Test prüft `stripHasTab` → false für fremde Id | `TabBar.tsx:232` ruft `stripHasTab` nicht (Import nur `gapIndexAt`, `TAB_STRIP_ATTR`, `TabBar.tsx:22`); einziger Nutzer `useTerminalPaneDnd.ts:208` | **R-1 refuted** |
| INV-7 | `planSpaceRemoval.test.ts:26`, `:46` prüfen Entfernen und kalten Ausweich-Tab | `useTabs.ts:680-707` | PASS |
| INV-8 | genannte Tests prüfen Bericht, Aktivwechsel, Undo — nicht die Ziel-Lücke; die Lücke prüft `paneAcrossTabs.test.ts:96` | `useTabs.ts:1498`, `:1547` | PASS (F-4) |
| INV-9 | `serialize.test.ts:28-54` prüft `["terminal","editor"]` | `useSpacePersistence.ts:41-50` | PASS |
| INV-10 | `serialize.test.ts:77-133` prüft Split, cwd, aktives Leaf, tmux | `useSpacePersistence.ts:41` | PASS |
| INV-11 | `resolveFileTabOpen.test.ts:82-94` prüft gleiche Referenz, kein `makeId` | `useTabs.ts:904-918` | PASS |
| INV-12 | `App.tsx:1077-1088` Clamp ohne Wrap | – | PASS (uncovered) |
| INV-13 | `App.tsx:642-651` MRU des Space; Wrap `useTabSwitcher.ts:23`, `:27` | – | PASS (uncovered) |
| INV-14 | `useTabCloseGuards.ts:29-42` (dirty Editor, Vordergrundprozess), sonst `disposeTab` | – | PASS (uncovered) |
| INV-15 | `App.tsx:922-931` Space wechseln, `setActiveId`, `focusPane` | – | PASS (uncovered) |
| INV-16 | `TabActivityIndicator.test.tsx:88-94` prüft working>waiting, idle → null | `TabActivityIndicator.tsx:21` | PASS |
| INV-17 | `useTabs.ts:626-645` + `App.tsx:1326-1331` | – | PASS (uncovered) |
| INV-18 | Nur der beim Start **aktive** Space bekommt ein Terminal (`useSpacesBoot.ts:119-123`); Spaces ohne gespeicherten Zustand werden übersprungen (`:95-99` `if (!st) continue`), andere Stellen legen beim Start keins an (`freshTerminalTab` nur `:122`) | – | **R-2 refuted** |
| Übernahme Scan → Architecture | 18 von 18 übernommen; Routing INV-13/14/17 von `differential_check` auf `qa_matrix` geändert, gedeckt durch Q&A 4 („6 per QA") | – | PASS (N-1) |

## Data Type Verdicts

| Feld | Arch-Typ | Evidenz | Verdict |
|------|----------|---------|---------|
| `SpaceState.groups` | optionale Liste | `validate.ts:18-24` toleriert Zusatzfelder; Muster optionaler Felder `serialize.ts:53-58` | PASS |
| Gruppen-Eintrag `name` | Text, optional, VAL-1 (32) | Nutzereingabe mit UI-Grenze 32 (BR-6); heute keine Grenze im Eingabefeld (`InlineRename.tsx:36-55`) | PASS (O-4) |
| Gruppen-Eintrag `color` | Ganzzahl, Index 0..7 | `SPACE_COLORS` hat 8 Einträge (`spaceColor.ts:5-14`); `accentFor` prüft nur den Bereich, nicht die Ganzzahligkeit (`spaceColor.ts:16-19`) | PASS (O-3) |
| Gruppen-Eintrag `collapsed` | Wahrheitswert, optional | – | PASS |
| `SerializedTab.group` | Ganzzahl, Position in `groups` | Tab-Ids werden je Start neu vergeben (`serialize.ts:192`, `allocId`), deshalb Positionsverweis statt Id | PASS (O-3) |
| `TabGroup.id` (Laufzeit) | Text, je Sitzung eindeutig | Bestehende Laufzeit-Ids sind Zahlen aus `allocId` (`useTabs.ts:586`) | PASS (N-3) |
| `Tab.groupId` | optional an `TabBase` | `TabBase` bei `useTabs.ts:67-71` | PASS |

## Bestands-Behauptungen (Perspektive `code`)

| # | Behauptung (architecture.md) | Beleg | Verdikt |
|---|------------------------------|-------|---------|
| 1 | Aktionen in `useTabs` (`src/modules/tabs/lib/useTabs.ts`), `App.tsx` reicht durch (Z. 62) | `useTabs.ts:543`, `App.tsx:160-215` | gehalten |
| 2 | `reorderTabByGap` bestehend (API-8) | `useTabs.ts:1682-1684` | gehalten |
| 3 | `breakOutPane` bestehend mit Undo (API-12) | `useTabs.ts:1498`, `:1547` | gehalten |
| 4 | `TabBase` bei `useTabs.ts:67` (DTO) | `useTabs.ts:67-71` | gehalten |
| 5 | `SpaceState`, Datei `terax-spaces.json`, Schlüssel `state:<spaceId>` (DB-1) | `store.ts:17-26` | gehalten |
| 6 | Space-Palette 8 Farben, `spaceColor.ts:5` | `spaceColor.ts:5-14` | gehalten |
| 7 | `SerializedTab` als gespeicherter Tab | `serialize.ts:25-40` | gehalten |
| 8 | `nextActiveInSpace` bestehend, heutige Regel links sonst rechts (SVC-7) | `useTabs.ts:460-470` | gehalten |
| 9 | Alle Aktivierungen laufen über den aktiven-Tab-Zustand von `useTabs` (Annahme, SVC-9) | `setActiveId` aus `useTabs` (`App.tsx:169`); Vorbild-Engstelle `useTabs.ts:576-584` | gehalten |
| 10 | `tabStripGap.ts` mit Zählkern `gapIndexAt` (SVC-10) | `tabStripGap.ts:46-53` | gehalten |
| 11 | Bestehende Einzel-Regeln des Schließen-Schutzes: ungespeicherte Datei, Vordergrundprozess (SVC-13) | `useTabCloseGuards.ts:29-42` | gehalten (N-4) |
| 12 | Genau zwei Stellen schreiben die Space-Zuordnung (SVC-14, MIG-1, Disp. 3) | `useTabs.ts:633`, `:664`; übrige `spaceId:`-Zuweisungen sind Neuanlagen | gehalten |
| 13 | `serialize.ts` schreibt/lädt Tabs (SVC-15, MIG-8) | `serialize.ts:117-124`, `:273-290` | gehalten |
| 14 | `planSpaceRemoval` entfernt Tabs (SVC-16) | `useTabs.ts:514-541` | gehalten |
| 15 | Konvention reine Funktion mit Test daneben | `tabs/lib/*.test.ts` neben jeder Regel-Funktion | gehalten |
| 16 | `CloseDialogs.tsx` hält die Schließen-Dialoge | `CloseDialogs.tsx:45-161`, Nutzung `App.tsx:1825` | gehalten |
| 17 | Persistenz: von Hand geprüft, abwärtskompatibel | `validate.ts`, `store.ts:43-48` | gehalten |
| 18 | Eingeklappte Tabs bleiben eingehängt, Stapel unverändert | Stapel bekommt alle Tabs (`App.tsx:1652`) | gehalten |
| 19 | Datenfluss `useSpacePersistence → serialize → terax-spaces.json` | `useSpacePersistence.ts:41-71`, `store.ts:60-62` | gehalten |
| 20 | Verworfene Felder heute ohne Meldung/Log | `serialize.ts:280-284`, `store.ts:43-48` | gehalten |
| 21 | Überholter Zieh-Vorgang heute ohne Umsortieren | `reorderTabsByGap` gibt bei unbekannter Id die Eingabe zurück (`useTabs.ts:479`, Test `reorderTabsByGap.test.ts:44`) | gehalten |
| 22 | MIG-1 Ist-Zustand: flaches Array, Streifen je Stelle gefiltert | Sweep-Treffer `useTabs.ts:224, 319, 466, 480, 522-537` | gehalten |
| 23 | MIG-2 `gapIndexAt`, `tabStripAt`, `stripHasTab` existieren | `tabStripGap.ts:21, 35, 46` | gehalten |
| 24 | MIG-3 flache Liste, Menü nur am Terminal-Tab | `TabBar.tsx:299`, `:605-643` | gehalten |
| 25 | MIG-4 `index.ts` als öffentliche Schnittstelle | `tabs/index.ts:1-28` | gehalten |
| 26 | MIG-5 eigene Filter für Leiste, Umschalter, Wischen | `App.tsx:352-355`, `:642-651`, `:1077-1088`; vierte Ableitung `App.tsx:334` fehlt in der Map | gehalten, unvollständig (D-1, F-3) |
| 27 | MIG-6 Rückfragen je Tab | `useTabCloseGuards.ts:24-45` | gehalten |
| 28 | MIG-7 Dialoge je Tab | `CloseDialogs.tsx:62-161` (4 `AlertDialog` je Tab bzw. Pfad) | gehalten |
| 29 | MIG-9 `SpaceState` mit `tabs`, `activeTabIndex` | `store.ts:17-20` | gehalten |
| 30 | MIG-10 Prüfung nur `tabs`, `activeTabIndex` | `validate.ts:18-24` | gehalten |
| 31 | MIG-11 schreibt nur bei Änderung der Tabs (Textvergleich) | Deps `useSpacePersistence.ts:86`, Vergleich `:59-66` | gehalten |
| 32 | MIG-12 Boot stellt je Space her, aktiver Tab per Index | `useSpacesBoot.ts:95-99`, `:134-136` | gehalten |
| 33 | MIG-13 `InlineRename` fest „Rename space", ohne Längengrenze | `InlineRename.tsx:39` | gehalten |
| 34 | MIG-14 flache Befehlsliste | `commands.ts:76-...` Array-Rückgabe | gehalten |
| 35 | MIG-15 `selectTabAgentStatus`: arbeitet schlägt wartet | `selectTabAgentStatus.ts:25-28` | gehalten |
| 36 | Sweep criterion trifft die Umbau-Stellen | Lauf 25 Treffer; verfehlt Kanäle ohne `spaceId`-Vergleich | teilweise (F-1, F-2, F-3) |
| 37–54 | INV-1 bis INV-18 | siehe E3 | 16 gehalten, INV-6 (Konsument) und INV-18 widerlegt |
| 55 | Ältere Version überliest Gruppen, verliert sie beim Schreiben | `validate.ts:18-24`, `serialize.ts:81-115` | gehalten |
| 56 | Primitiver Ergebniswert hält Neuzeichnen-Verhalten | `selectTabAgentStatus.ts:13-18` Kommentar + Code, `TabActivityIndicator.tsx:21` | gehalten |
| 57 | Tab-Mitte vs. Lücke als zwei Zieh-Ziele | `TabBar.tsx:216-232` | gehalten |
| 58 | Untermenü-Bausteine vorhanden (`context-menu.tsx:43`) | `context-menu.tsx:43, 100, 124, 256-258` | gehalten |
| 59 | Neue Tabs entstehen am Ende des Streifens oder an einer Lücke (Annahme) | Ausnahme: Vorschau-Slot wird an Ort und Stelle ersetzt (`resolveFileTabOpen.ts:93-96`); Folge laut Architecture „keine", da SVC-3 korrigiert | gehalten mit Ausnahme (O-5) |
| 60 | Über 20 Aufrufstellen setzen den aktiven Tab | 30 in `useTabs.ts`, 17 außerhalb | gehalten |
| 61 | Research: Nachfolger kennt nur den Space, letzter Tab nicht schließbar (`useTabs.ts:460`) | `useTabs.ts:466-467`, `:1234-1235` | gehalten |
| 62 | Research: letzter Tab zieht die Ansicht mit (`:626`); Space-Entfernung entfernt (`:514`) | `useTabs.ts:636-642`, `App.tsx:1328-1330`; `useTabs.ts:527` | gehalten |
| 63 | Research: Speichern vergleicht Text je Space (`useSpacePersistence.ts:41`) | `useSpacePersistence.ts:59-66` | gehalten |
| 64 | Research: Prüfung nur `tabs`/`activeTabIndex` (`validate.ts:18`) | `validate.ts:18-24` | gehalten |
| 65 | Research: kein `bindings.md`, kein `zip.config.json` | `ls` im Worktree: beide fehlen | gehalten |
| 66 | NFR-1 Test-Vorbild am Tab-Zeichen | `TabActivityIndicator.test.tsx:30` | gehalten |
| 67 | Test Strategy: Hook-Test des Ausbrechens, Lücken-Test mit festen Maßen | `useTabs.breakout.test.tsx:26-52`, `tabStripGap.test.ts:12-26` | gehalten |
| 68 | Annahme EP-5: heute folgt die Ansicht einem letzten Tab (INV-17) | `App.tsx:1326-1331` | gehalten |

Nicht in der Prüfmenge (andere Perspektive): Versions-Spalte der Integrations (`runtime`), UI-IDs und Layout (`ui`), reale Datei-Inhalte `terax-spaces.json` (`data`).

Self-Check: 68 erhoben = 68 Verdikte + 0 NICHT GEMESSEN.

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|----|--------|-------|------------|-------|-------|-------------|-----------------------|------------|-------------------|
| D-1 | decision | A, F, E (Disposition 1) | architecture.md (MIG-5, SVC-1/SVC-9), ggf. discovery.md | MIG-5: „`spaceTabs`, `getSwitcherOrder`, `swipeTab` auf SVC-1" | `src/app/App.tsx:334-339`: beim Space-Wechsel wird `inSpace[inSpace.length - 1]` aktiv, alle Tabs des Space, auch eingeklappte; die Stelle ist eine der 6 Fund-Stellen von Disposition 1 (`codebase-scan.md` Anti-Slop Fund 1) und fehlt in MIG-5. BR-16 stellt verschobene Gruppen ans Ende des Streifens, also oft als letzte. Mit SVC-1 „sichtbar" wird die Liste leer, wenn ein Space nur eingeklappte Gruppen hat (erreichbar: nicht aktiver loser Tab per Übersicht weggezogen, `App.tsx:1326`, `useTabs.ts:626-636`). Dann greift `if (inSpace.length === 0) return` (`App.tsx:335`) und der aktive Tab bleibt im alten Space | code | Heute: Wechsel in einen Space, dessen letzter Tab in einer eingeklappten Gruppe liegt, macht diesen Tab aktiv und SVC-9 klappt die geparkte Gruppe auf | PM entscheidet: (a) Space-Wechsel nimmt den letzten **sichtbaren** Tab (Empfehlung, passt zu BR-9); und für einen Space ohne sichtbaren Tab entweder (b1) nächste Gruppe klappt auf (wie BR-24) oder (b2) neues Terminal außerhalb der Gruppen (wie EP-1). Danach `App.tsx:334` in MIG-5 aufnehmen | nein |
| R-1 | refuted | E3 | architecture.md (INV-6, Consumers) | INV-6 Consumers: „`src/modules/tabs/TabBar.tsx:232`" | `TabBar.tsx:22` importiert nur `gapIndexAt`, `TAB_STRIP_ATTR`; `stripHasTab` wird einzig in `src/modules/terminal/lib/useTerminalPaneDnd.ts:208` gerufen (grep über `src`) | code | `grep -rn stripHasTab src` ohne Tests trifft nur `useTerminalPaneDnd.ts:4,208` und die Definition | Consumers von INV-6 auf `src/modules/terminal/lib/useTerminalPaneDnd.ts:208` setzen | nein |
| R-2 | refuted | E3 | architecture.md (INV-18) | INV-18: „Ein Space ohne gespeicherte Tabs bekommt beim Start ein neues Terminal" | `useSpacesBoot.ts:119-123` legt nur für den aktiven Space ein Terminal an („Active space must never be empty"); Spaces ohne Zustand werden übersprungen (`:95-99`); `freshTerminalTab` hat keinen weiteren Aufrufer | code | Start mit zwei Spaces, der nicht aktive ohne gespeicherte Tabs: er hat danach keinen Tab | Invariante auf „Der beim Start aktive Space bekommt ein neues Terminal, wenn er keine gespeicherten Tabs hat" einschränken; QA-Zeile entsprechend | nein |
| F-1 | fix | F, E3 (INV-5) | architecture.md (Migration Map, INV-5) | API-12: „Der neue Tab übernimmt die Zugehörigkeit der Ziel-Lücke"; MIG-2: „`gapTargetAt` ergänzen" | Der Lücken-Wert des Pane-Ausbrechens entsteht in `src/modules/terminal/lib/useTerminalPaneDnd.ts:209` (`gapIndexAt`) und läuft als `number` über `TerminalStack.tsx:35`, `WorkspaceSurface.tsx:27` und `App.tsx:1188` zu `breakOutPane(leafId, gapIndex)`; keine dieser Dateien steht in der Map, das Sweep criterion trifft sie nicht | code | Ohne Änderung erreicht den Ausbruch nur ein Index ohne Gruppen-Kontext; BR-11 für Panes wäre nicht umsetzbar | MIG-Zeilen ergänzen: `useTerminalPaneDnd.ts` ruft `gapTargetAt`; `TerminalStack.tsx`, `WorkspaceSurface.tsx`, `App.tsx` (`handleBreakOutPane`) reichen `GapTarget` statt `number`; INV-5 Consumers um `useTerminalPaneDnd.ts:209` ergänzen | nein |
| F-2 | fix | F | architecture.md (MIG-1) | SVC-7 Input: „Tabs, Gruppen, `closingId`"; MIG-1-Liste nennt `closeTab`, `moveTabToSpace`, `reorderTab` | Weitere Aufrufer von `nextActiveInSpace`: `closeAiDiffTab` (`useTabs.ts:980`), `undoBreakOutPane` (`:1575`), `closePaneByLeaf` (`:1599`), `closeActivePane` (`:1633`) | code | Jeder dieser Aufrufer muss nach der Signatur-Erweiterung Gruppen übergeben | MIG-1 um diese vier Funktionen ergänzen (Umstellung auf SVC-7 mit Gruppen) | nein |
| F-3 | fix | F | architecture.md (MIG-5) | MIG-5: „`spaceTabs` … auf SVC-1" | `spaceTabs` (`App.tsx:352`) speist `useWorkspaceCwd` (`App.tsx:404-406`; Explorer-Wurzel aus beliebigem Terminal des Space, `useWorkspaceCwd.ts:59-73`), Header/TabBar (`App.tsx:1533`), `TabSwitcherHud` (`App.tsx:1744`) und `swipeTab` (`App.tsx:1080`) | code | Wird `spaceTabs` „sichtbar", ändert Einklappen die Explorer-Wurzel und der Leiste fehlen die Mitglieder für Anzahl und Sammelzeichen (SVC-2, SVC-6) | MIG-5 legt den Modus je Verbraucher fest: `useWorkspaceCwd`, Leiste, HUD → SVC-1 „alle"; `swipeTab`, `getSwitcherOrder` → SVC-1 „sichtbar" | nein |
| F-4 | fix | E3 | architecture.md (INV-8, Source) | INV-8 Source: `useTabs.breakout.test.tsx` „reports the break-out…", „puts the pane back…" | Die genannten Tests prüfen Länge, Aktivwechsel und Undo-Layout, nicht die Position an der Lücke (`useTabs.breakout.test.tsx:54-97`); die Lücke prüft `paneAcrossTabs.test.ts:96` „gives the pane a tab of its own at the dropped gap" | code | – | Source von INV-8 um `src/modules/tabs/lib/paneAcrossTabs.test.ts` „gives the pane a tab of its own at the dropped gap" ergänzen | nein |
| O-1 | obligation | B | – (implement) | SVC-7: „gibt es keinen sichtbaren, der nächstgelegene Tab einer eingeklappten Gruppe" | Schließen-Knopf, Mittelklick und Menü-„Close" erscheinen nur bei `tabs.length > 1` (`TabBar.tsx:345`, `:414`, `:623`) | code | Space mit einem sichtbaren Tab und einer eingeklappten Gruppe: der sichtbare Tab zeigt Schließen-Knopf und Menü-„Close", Schließen macht einen Gruppen-Tab aktiv und klappt die Gruppe auf (BR-24) | Zählbasis der Bedingungen ist der ganze Streifen des Space | nein |
| O-2 | obligation | D | – (implement) | Layer: „Hält Tabs (mit `groupId`) und Gruppen-Metadaten" | Nachfolger-Wahl läuft im Updater `setTabs(curr => …)` (`useTabs.ts:1233-1243`); Refs hinken einen Commit nach (`useTabs.ts:1489-1492`, `:565-574`) | code | Einklappen und unmittelbar folgendes Schließen im selben Tick: Nachfolger ist ein sichtbarer Tab, nie ein Mitglied der gerade eingeklappten Gruppe | Tabs und Gruppen werden so gehalten, dass jeder Updater den zum `curr` passenden Klappzustand sieht | nein |
| O-3 | obligation | C | – (implement, qa) | VAL-2: „Muss eine Farbe der Space-Palette bezeichnen"; VAL-3: „`group` ein gültiger Verweis" | `accentFor` prüft nur `c >= 0 && c < length` (`spaceColor.ts:16-19`); `SPACE_COLORS[1.5]` ergibt `undefined` | code | Datei mit `color: 1.5` oder `group: 0.5` / `-1` / `"0"`: Gruppe erhält Farbe 0 bzw. Tab wird lose geladen, kein Absturz, keine leere Farbe | Prüfung auf Ganzzahl im Bereich für `color` und `group` | nein |
| O-4 | obligation | C | – (implement) | VAL-1: „höchstens 32 Zeichen … beim Laden gekürzt" | Eingabefeld ist ein `<input>` (`InlineRename.tsx:36-55`); `maxLength` zählt UTF-16-Einheiten | code | Ein Name mit Emoji, der beim Eingeben angenommen wurde, steht nach Neustart unverändert da | Eingabe-Grenze und Laden-Kürzung zählen gleich | nein |
| O-5 | obligation | C | – (qa) | Annahme: „Neue Tabs entstehen heute am Ende des Streifens oder an einer ausdrücklichen Lücke" | Vorschau-Datei ersetzt den Vorschau-Slot an seiner Position mit neuem Tab-Objekt ohne Zusatzfelder (`resolveFileTabOpen.ts:93-96`) | code | Vorschau-Tab ist Mitglied einer Gruppe, andere Datei als Vorschau öffnen: neuer Tab steht lose direkt hinter der Gruppe; war die Vorschau das letzte Mitglied, verschwindet die Gruppe (BR-7, EP-3) | QA-Fall aufnehmen | nein |
| N-1 | note | E3 | – | Routing INV-13/14/17: `qa_matrix` | Scan führt `differential_check` (`codebase-scan.md:148,149,152`); Q&A 4 bestätigt „6 per QA" | artifact | – | Keine Handlung; PM-Entscheid vorhanden | nein |
| N-2 | note | E | – | Disposition 2: `consolidate` | Scanner schlug `adopt_school` vor; Katalog erlaubt `consolidate` für K4 | artifact | – | Keine | nein |
| N-3 | note | C | – | `TabGroup.id` (Text) | Bestehende Laufzeit-Ids kommen als Zahl aus `allocId` (`useTabs.ts:586`) | code | – | Optional `allocId` wiederverwenden | nein |
| N-4 | note | E | – | SVC-13: „mit den bestehenden Einzel-Regeln" | Die Regeln stehen inline in `handleClose` (`useTabCloseGuards.ts:29-42`), nicht als eigene Funktionen | code | – | Für SVC-13 herausziehen, damit Einzel- und Sammel-Prüfung dieselbe Quelle nutzen (MIG-6) | nein |
| N-5 | note | A | – | – | Discovery-IDs ohne Referenz in architecture.md: BR-22, BR-23, EP-7, FL-2/4/5/6/8/10/11/12, TR-1/2/3/7/11/12/15, UI-1/2/4/6/7, ST-1..6 | artifact | – | Abdeckung prüft der Lauf `ui` | nein |
