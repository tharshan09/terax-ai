# Gate 1: Architecture Compliance (zusammengeführt)

- Feature: Tab-Gruppen (`specs/2026-11-23-tab-groups`)
- Perspektiven: `code`, `data`, `ui` (Einzel-Reports: `compliance-architecture-code.md`, `compliance-architecture-data.md`, `compliance-architecture-ui.md`)
- Perspektive `runtime`: entfällt. Das Feature berührt keine laufende Umgebung und keine Bestandsdaten außerhalb der lokalen Datei; `node_modules` fehlt im Worktree, installierte Versionen sind deshalb nicht gemessen (eine Behauptung der Perspektive `ui` zur Untermenü-Fähigkeit bleibt ungemessen).
- Skript-Ergebnis (Arch-Precheck): PASS nach einer Korrekturrunde; Hinweis AR-7 (6 NEW-Zeilen des Scans ohne Zielpfad).
- Bindings (Gate 1c): N/A, kein `bindings.md`.

## Ergebnis des ersten Durchgangs

VERDICT: FAILED (4 bestätigte blockierende Befunde), danach eine Korrekturrunde.

## Blockierende Befunde

| ID | Klasse | found_by | Stelle | Befund | Beleg | Nachprüfung | Erledigung in der Korrekturrunde |
|----|--------|----------|--------|--------|-------|-------------|----------------------------------|
| B1 | decision | code, ui | architecture.md MIG-5, SVC-1, SVC-9 | Nicht festgelegt, welcher Tab beim Wechsel in einen Space aktiv wird, wenn Tabs in eingeklappten Gruppen liegen; die Stelle fehlt in der Migration Map | `src/app/App.tsx:334` | CONFIRMED | Automatisch entschieden (Q&A 7): letzter sichtbarer Tab, sonst letzter Tab mit Aufklappen. Neu SVC-17; MIG-1 und MIG-5 ergänzt; Assumption „automatisch — zur PM-Durchsicht" |
| B2 | decision | ui | architecture.md API-7; discovery.md UI-1, TR-7 | Klick (umklappen) und Doppelklick (umbenennen) am selben Kopf; Umklappen ist nicht folgenlos wiederholbar | discovery.md UI-1; architecture.md API-7 | CONFIRMED | Automatisch entschieden (Q&A 8): Kopf reagiert nur auf Klick, Umbenennen über das Menü und nach dem Anlegen. Weicht ab von UI-1 und TR-7; Assumption „automatisch — zur PM-Durchsicht". discovery.md unverändert (nur PM-Antwort ändert sie) |
| B3 | refuted | data, code | architecture.md INV-18 | Die Invariante galt nur für den beim Start aktiven Space | `src/modules/spaces/lib/useSpacesBoot.ts:120` | CONFIRMED | INV-18 eingeschränkt; Assumption zu leerem nicht aktivem Space ergänzt |
| B4 | refuted | code (ui als fix) | architecture.md INV-6 | Falscher Consumer; der einzige Aufrufer liegt im Pane-Ziehen | `src/modules/terminal/lib/useTerminalPaneDnd.ts:208` | CONFIRMED | INV-6 neu gefasst, Consumer korrigiert; INV-5 um zweiten Consumer ergänzt |

## Eingearbeitete Korrekturen (fix)

| ID | found_by | Stelle | Ziel-Zustand |
|----|----------|--------|--------------|
| X1 | code, ui | Migration Map | Neue Zeilen MIG-16 bis MIG-19: Weg des Pane-Ausbrechens trägt `GapTarget` statt einer Zahl |
| X2 | code | MIG-1 | Alle Aufrufer von `nextActiveInSpace` genannt |
| X3 | code, ui | SVC-1, MIG-3, MIG-5 | Je Verbraucher festgelegt: sichtbare Liste oder ganzer Streifen; Schließen zählt alle Tabs des Space |
| X4 | code | INV-8 | Test zur Ziel-Lücke als Quelle ergänzt |
| X5 | ui | Migration Map | MIG-20 Kopfzeile reicht Gruppen-Daten und -Aktionen durch |
| X6 | ui | DTO `GapTarget`, SVC-10 | Lage zum Kopf in der Ziel-Angabe |
| X7 | ui | MIG-3 | „Add to group" deaktiviert ohne andere Gruppe; Untermenü ohne eigene Gruppe |
| X8 | ui | Migration Map | MIG-21 Darstellung des Status-Zeichens als gemeinsamer Baustein |
| X9 | ui | MIG-7 | Bestehende Sammel-Dialoge als Vorbild genannt |
| X10 | data | SVC-15 | Neue Funktionen bauen auf den bestehenden Schreib- und Lade-Funktionen auf |
| X11 | data | VAL-2, VAL-3 | Widerspruch aufgelöst: Felder fallen einzeln zurück; Basis des Verweises festgelegt |

## Auflagen (obligation)

14 Auflagen, zusammengeführt in `obligations.md` (OB-1 bis OB-14).

## Hinweise (note)

| ID | found_by | Hinweis |
|----|----------|---------|
| N1 | data | Wiederhergestellte Tabs sind nach dem Neustart bis zur ersten Aktivierung nicht eingehängt; Mitglieder eingeklappter Gruppen laufen erst nach Aufklappen und Auswahl wieder an. In den Assumptions vermerkt |
| N2 | data | Ist der aktive Tab privat, bleibt der alte gespeicherte Index stehen und kann in eine eingeklappte Gruppe zeigen, die dann beim Start aufklappt |
| N3 | code | Invarianten ohne Test laufen über die QA-Matrix (im Scan teils als Vergleichs-Prüfung geführt); vom PM in Q&A 4 bestätigt |
| N4 | code | Disposition 2 nutzt „zusammenführen" statt des Linsen-Vorschlags; der Katalog erlaubt das |
| N5 | code | Die bestehende Id-Vergabe ließe sich für Gruppen wiederverwenden |
| N6 | code, ui | Einzel-Regeln des Schließen-Schutzes für die Sammel-Prüfung herauslösen; in SVC-13 aufgenommen |
| N7 | ui | Tooltip am Kopf wie in der übrigen Leiste; Untermenü „Move group to space" mit dem bestehenden Space-Avatar |
| N8 | ui | Einzahl im Dialog-Text für einen Tab klären |
| N9 | Skript | AR-7: 6 NEW-Zeilen des Scans ohne Zielpfad |

## Datentyp-Prüfungen

Alle Datentypen bestanden (`groups`, `name`, `color`, `collapsed`, `group`, Laufzeit-Id, `groupId`), teils mit Auflagen OB-4, OB-5, OB-7. `GapTarget` und die Ziel-Angabe des Pane-Ausbrechens waren unvollständig und sind mit X1 und X6 ergänzt.

## Claims

| Perspektive | erhoben | gemessen | nicht gemessen |
|-------------|---------|----------|----------------|
| code | 68 | 68 | 0 |
| data | 22 | 22 | 0 |
| ui | 29 | 28 | 1 |

---

## Delta-Lauf

- Geprüft: `specs/2026-11-23-tab-groups/architecture.md` (Stand nach der Korrekturrunde), `discovery.md` (unverändert), `codebase-scan.md`, `gates/obligations.md`, Vorlauf-Reports `compliance-architecture{,-code,-data,-ui}.md`; Code im Worktree `.claude/worktrees/tab-groups` (HEAD `e2e117c`)
- Prüfdatum: 2026-11-23
- Modus: Delta-Lauf. Prüfmenge: die in der Korrekturrunde geänderten Stellen (API-7, DTO `GapTarget`, SVC-1, SVC-9, SVC-13, SVC-15, SVC-17, VAL-2, VAL-3, MIG-1, MIG-3, MIG-5, MIG-7, MIG-16 bis MIG-21, INV-5, INV-6, INV-8, INV-18, vier neue Assumptions, Q&A 7 und 8), `obligations.md` gegen die Vorlauf-Auflagen, die Erledigung von B1 bis B4 und X1 bis X11, und die eine im Vorlauf NICHT GEMESSENE Behauptung
- Bindings (Gate 1c): N/A, kein `bindings.md`

### Skript-Tabelle (Arch-Precheck nach der Korrekturrunde)

| ID | Klasse | Detail | Übernahme |
|----|--------|--------|-----------|
| – | – | Ergebnis: PASS | – |
| AR-5 | note | INV-8: Testname „gives the pane a tab of its own at the dropped gap" nicht in `useTabs.breakout.test.tsx` (er steht in `src/modules/tabs/lib/paneAcrossTabs.test.ts`, die Zeile nennt zwei Testdateien) | D-N1: die INV-8-Zeile ordnet den Test bereits `paneAcrossTabs.test.ts` zu (`paneAcrossTabs.test.ts:96`); kein Handlungsbedarf |
| AR-7 | note | 6 NEW-Zeilen des Scans ohne Zielpfad | unverändert aus dem Vorlauf (N9) |

### Summary

| Klasse | Anzahl |
|--------|--------|
| decision | 0 |
| refuted | 1 |
| fix | 3 |
| obligation | 1 |
| note | 5 |

**Verdict:** FAILED (D-R1)

### Erledigung der Vorlauf-Befunde

| Vorlauf | Erledigung steht im Dokument | Hält am Code | Neuer Widerspruch | Status |
|---------|------------------------------|--------------|-------------------|--------|
| B1 | SVC-17, SVC-9 (Auslöser „Space-Wechsel nach SVC-17"), MIG-1, MIG-5 (`App.tsx:334` über SVC-17), Assumption Z. 399, Q&A 7 | Heutiges Verhalten wie in SVC-17 beschrieben: aktiver Tab im Ziel-Space bleibt (`src/app/App.tsx:337`), sonst letzter Tab (`:338`), ohne Tab nichts (`:335`) | Keiner; SVC-17 fehlt aber in der Test-Strategie (D-F2) | erledigt |
| B2 | API-7, Assumption Z. 400, Q&A 8 (automatisch, Abweichung von UI-1 und TR-7 ausgewiesen) | Heute kein Kopf; `TabBar.tsx:412` nutzt Doppelklick nur zum Anheften der Vorschau | Abweichungsvermerk nennt TG-5 der Discovery nicht (D-F3) | erledigt |
| B3 | INV-18 eingeschränkt; Assumption Z. 401 | `src/modules/spaces/lib/useSpacesBoot.ts:120-123` legt nur im aktiven Space ein Terminal an; `:95-99` lädt je Space nur gespeicherte Tabs | – | erledigt |
| B4 | INV-6 Consumer `useTerminalPaneDnd.ts:208`; INV-5 zweiter Consumer `:209` | `useTerminalPaneDnd.ts:208` (`stripHasTab`), `:209` (`gapIndexAt`); einziger Aufrufer von `stripHasTab` außerhalb der Tests (grep) | – | erledigt |
| X1 | MIG-16 bis MIG-19 | `useTerminalPaneDnd.ts:209`, `:226`; `paneDndStore.ts:17`, `:42-43`; `TerminalStack.tsx:35`; `WorkspaceSurface.tsx:27` (Typ über `TerminalStackProps["breakOutPane"]`) | – | erledigt (D-N4) |
| X2 | MIG-1 nennt alle sieben Aufrufer in `useTabs.ts` (`:637`, `:670`, `:980`, `:1234`, `:1575`, `:1599`, `:1633`) | Achter Aufrufer `src/app/hooks/useTabCloseGuards.ts:28` steht weder in MIG-1 noch in MIG-6 | – | teilweise (D-F1) |
| X3 | SVC-1 (Zuordnung sichtbar / ganzer Streifen), MIG-3, MIG-5 | Wischen `App.tsx:1077-1080`, Umschalter `:642-651`, Anzeige `:1744`, Leiste `:1533`, Ordner `:403-405` → `useWorkspaceCwd.ts:59-69`, Schließen-Zählung `TabBar.tsx:345`, `:414`, `:624` | – | erledigt |
| X4 | INV-8 Source um `paneAcrossTabs.test.ts` ergänzt | Testinhalt `paneAcrossTabs.test.ts:96-112` (Tab 7 an Lücke 1 → `[1, 7, 2]`) | – | erledigt |
| X5 | MIG-20 | `src/modules/header/Header.tsx:47` (`onReorder(fromId, toGapIndex: number)`), `:190-206` | – | erledigt |
| X6 | DTO `GapTarget` (gezählt über Köpfe und Tabs), SVC-10 | `tabStripGap.ts:46-53` zählt nur `[data-tab-id]`; `gapTargetAt` zählt neu, `gapIndexAt` bleibt | – | erledigt |
| X7 | MIG-3 | Discovery EP-7, UI-5 | – | erledigt |
| X8 | MIG-21 | `TabActivityIndicator.tsx:12-41`: Status-Berechnung und Darstellung in einer Komponente | – | erledigt |
| X9 | MIG-7 | `CloseDialogs.tsx:110-139` (gelöschte Dateien, Anzahl im Text `:127`), `:141-161` mit `appCloseMessage` `:30` | – | erledigt |
| X10 | SVC-15 | `serialize.ts:114` `serializeTabs`, `:274` `hydrateTabs`; Aufrufer `useSpacePersistence.ts:52`, `useSpacesBoot.ts:99` | – | erledigt |
| X11 | VAL-2, VAL-3 | `spaceColor.ts:5-14` (8 Farben), `:16-19` (prüft nur den Bereich); `validate.ts:18-24` (`isSpaceState` prüft nur `tabs`, `activeTabIndex`) | VAL-3 und OB-1, OB-3 stimmen überein | erledigt |

### A) Feature Mapping (Delta)

| Item | Evidenz | Status |
|------|---------|--------|
| UI-1/TR-7 Umbenennen am Kopf | API-7: nur über „Rename group" und nach API-1; FL-1 und TR-1 (Namensfeld nach dem Anlegen) bleiben gedeckt | PASS (automatische Entscheidung Q&A 8; TG-5 siehe D-F3) |
| Space-Wechsel mit eingeklappten Gruppen | SVC-17, MIG-5 | PASS |
| UI-9 Marke für gezogenen Pane | MIG-3, MIG-16, MIG-17 | PASS |
| UI-3 Sammelzeichen | MIG-21, SVC-6 | PASS |

### B) Constraint Mapping (Delta)

| Item | Evidenz | Status |
|------|---------|--------|
| BR-11 gilt auch für Pane-Ausbrechen | `GapTarget` trägt Tab-, Gruppen- und Pane-Ziehen (DTO, MIG-16 bis MIG-19) | PASS |
| BR-24/EP-8 Schließen bei nur einem sichtbaren Tab | MIG-3 Zählung über alle Tabs; `TabBar.tsx:345` heute `tabs.length > 1` | PASS |
| BR-10/BR-20 Aufklappen | SVC-9 nennt Space-Wechsel und Start | PASS |
| BR-21 Sammelzeichen nach Neustart | Assumption Z. 402 beschreibt das Bestandsverhalten falsch | FAIL → D-R1 |

### C) Realistic Data (Delta)

| Item | Evidenz | Status |
|------|---------|--------|
| `color` gegen Palette | `SPACE_COLORS` 8 Einträge (`spaceColor.ts:5-14`); VAL-2 verlangt ganze Zahl im Bereich | PASS |
| `group` Index-Basis | VAL-3: Position in der Datei-Liste; geschrieben werden nur Gruppen mit speicherbarem Mitglied (SVC-15) → Index konsistent (OB-3) | PASS |
| Gruppen-Eintrag Fehlerform | VAL-3 nachsichtig je Feld; `isSpaceState` (`validate.ts:18-24`) verwirft heute nur bei fehlendem `tabs`/`activeTabIndex` | PASS |
| `GapTarget` Zählbasis | DTO: über Köpfe und Tabs; heute nur Tabs (`tabStripGap.ts:47`) | PASS |

### D) Completeness + Dependencies (Delta)

| Item | Evidenz | Status |
|------|---------|--------|
| Keine neue Abhängigkeit durch die Korrekturen | Integrations-Tabelle unverändert | PASS |
| Untermenü mit installierter radix-ui-Version | `node_modules` fehlt im Worktree und im Haupt-Checkout | NICHT GEMESSEN (aus dem Vorlauf, weiter offen) |

### F) Migration Completeness (Delta)

| Item | Evidenz | Status |
|------|---------|--------|
| MIG-1 Funktionsnamen existieren | alle 15 Namen in `src/modules/tabs/lib/useTabs.ts` gefunden (`:219`, `:314`, `:347`, `:409`, `:460`, `:473`, `:514`, `:626`, `:650`, `:974`, `:1230`, `:1440`, `:1547`, `:1590`, `:1622`) | PASS |
| MIG-1 „jeder Aufrufer von `nextActiveInSpace`" | 8 Aufrufer im Code, 7 genannt; `useTabCloseGuards.ts:28` fehlt | fix D-F1 |
| MIG-16 bis MIG-19 Kette des Pane-Ausbrechens | `useTerminalPaneDnd.ts:105`, `:209`, `:226` → `TerminalStack.tsx:35`, `:115` → `WorkspaceSurface.tsx:27`, `:104` → `App.tsx:1186-1188`, `:1662` → `useTabs.ts:1499` | PASS, vollständig (grep `gapIndex` und `onBreakOut`) |
| MIG-20, MIG-21, MIG-7 Ist-Zustand | siehe X5, X8, X9 | PASS |
| Sweep-Lauf | 25 Treffer wie im Vorlauf; `App.tsx:334` jetzt über MIG-5/SVC-17 gedeckt | PASS |

### E) Pattern Consistency — Gate 1b (Delta)

| Item | Evidenz | Status |
|------|---------|--------|
| EXTEND `TabActivityIndicator` | MIG-21 | PASS |
| EXTEND `serializeTabs`/`hydrateTabs` | SVC-15 baut darauf auf | PASS |
| SVC-13 eine Quelle der Einzel-Regel | Regel heute inline in `handleClose` (`useTabCloseGuards.ts:28-40`: ungespeicherter Editor, Vordergrundprozess) | PASS |
| Dispositionen 1 bis 3 | unverändert; Disposition 1 zusätzlich an `App.tsx:334` über SVC-17 eingelöst | PASS |

### E2) Bindings Coverage — Gate 1c

N/A — kein `bindings.md`, `bindings_path`/`reconcile_path` null.

### E3) Existing-Behavior Invariants — Gate 1d (Delta)

| INV | Source/Testinhalt | Consumer | Status |
|-----|-------------------|----------|--------|
| INV-5 | `tabStripGap.test.ts:34-44` prüft Halbbreiten-Regel und letzte Lücke an `gapIndexAt` | `TabBar.tsx:232`, `useTerminalPaneDnd.ts:209` rufen `gapIndexAt` | PASS |
| INV-6 | `tabStripGap.test.ts:112-115` prüft `stripHasTab` = false für fremde Tab-Id und leeren Streifen | `useTerminalPaneDnd.ts:208` setzt nur dann ein Ziel | PASS |
| INV-8 | `useTabs.breakout.test.tsx:54-66` (neuer Tab aktiv, Pane allein), `:83-97` (Undo: Layout gleich, Tab weg, aktiver Tab zurück); `paneAcrossTabs.test.ts:96-112` (Lücke 1 → `[1, 7, 2]`) | `useTabs.ts:1498` `breakOutPane`, `:1547` `undoBreakOutPane` | PASS |
| INV-18 | `useSpacesBoot.ts:120-123` | dieselbe Stelle | PASS |

### Data Type Verdicts (Delta)

| Feld | Arch-Typ | Evidenz | Verdict |
|------|----------|---------|---------|
| `GapTarget` | Lücke über Köpfe und Tabs + `groupId` + optional „auf eingeklapptem Kopf" | `tabStripGap.ts:47` zählt heute nur Tabs; links/rechts eines Kopfs jetzt unterscheidbar | PASS |
| Pane-Ziel `newTab` | `GapTarget` statt Zahl | `paneDndStore.ts:17`, Vergleich `:42-43` (MIG-17) | PASS |
| `color` (Laden) | ganze Zahl 0..7, sonst 0 | `spaceColor.ts:5-14` | PASS |
| `group` (Laden) | ganze Zahl, Position in der Datei-Liste | VAL-3, SVC-15 | PASS |

### Bestands-Behauptungen (Delta)

| # | Behauptung (Stelle) | Beleg | Verdikt |
|---|---------------------|-------|---------|
| 1 | Doppelklick löst vorher zwei Klicks aus (Q&A 8, Assumption Z. 400) | Vorlauf ui D-1, Belegquelle dependency (W3C UI Events); Belegstelle nicht berührt | hält (aus dem Vorlauf) |
| 2 | Treffertest zählt nur Tab-Elemente (DTO `GapTarget`, SVC-10) | `tabStripGap.ts:46-53` | hält |
| 3 | Wischen, Umschalter, Anzeige nutzen den Space-Filter (SVC-1, MIG-5) | `App.tsx:352-355`, `:642-651`, `:1077-1088`, `:1744` | hält |
| 4 | Leiste und Ordner-Ableitung bekommen den Streifen (SVC-1, MIG-5) | `App.tsx:1533`; `App.tsx:403-405` → `useWorkspaceCwd.ts:33`, `:59-69` | hält |
| 5 | Schließen hängt an „mehr als ein Tab" (MIG-3) | `TabBar.tsx:345`, `:414`, `:624` | hält |
| 6 | „Tab nach Nummer" über `pickTabBySpaceIndex` (SVC-1, MIG-1) | `useTabs.ts:219-224` | hält |
| 7 | Space-Wechsel wählt heute den letzten Tab, behält einen aktiven im Ziel-Space, tut ohne Tab nichts (SVC-17, Q&A 7) | `App.tsx:334-339` | hält |
| 8 | Space-Wechsel setzt den aktiven Tab über `setActiveId` (Auslöser in SVC-9) | `App.tsx:338` | hält |
| 9 | Einzel-Regeln des Schließen-Schutzes liegen in `useTabCloseGuards` (SVC-13) | `useTabCloseGuards.ts:28-40` | hält |
| 10 | `serializeTabs`/`hydrateTabs` und ihre Aufrufer (SVC-15) | `serialize.ts:114`, `:274`; `useSpacePersistence.ts:52`; `useSpacesBoot.ts:99` | hält |
| 11 | Palette mit 8 Farben (VAL-2) | `spaceColor.ts:5-14` | hält |
| 12 | Bestehende Prüfung beachtet nur `tabs` und `activeTabIndex` (VAL-3, MIG-10) | `validate.ts:18-24` | hält |
| 13 | 15 Funktionsnamen in MIG-1 existieren | siehe F) | hält |
| 14 | MIG-1: jeder Aufrufer von `nextActiveInSpace` wird umgestellt | 8 Aufrufer; `useTabCloseGuards.ts:28` ungenannt | hält nicht vollständig → D-F1 |
| 15 | MIG-7: Sammel-Dialoge bestehen | `CloseDialogs.tsx:110-161`, `:30` | hält |
| 16 | MIG-16: Pane-Ziel über `gapIndexAt`, Prüfung `stripHasTab` | `useTerminalPaneDnd.ts:202-210` | hält |
| 17 | MIG-17: `newTab` trägt eine Zahl, Gleichheit über sie | `paneDndStore.ts:17`, `:42-43` | hält |
| 18 | MIG-18: `TerminalStack` reicht den Index weiter | `TerminalStack.tsx:35`, `:115` | hält |
| 19 | MIG-19: `WorkspaceSurface` reicht den Index weiter | `WorkspaceSurface.tsx:27`, `:104` (Typ abgeleitet) | hält (D-N4) |
| 20 | MIG-20: `Header` reicht Props einzeln durch, `onReorder` mit Zahl | `Header.tsx:47`, `:78`, `:190-206` | hält |
| 21 | MIG-21: Status-Zeichen rechnet und zeichnet in einer Komponente | `TabActivityIndicator.tsx:12-41` | hält |
| 22 | INV-5 Consumer und Test | siehe E3 | hält |
| 23 | INV-6 Consumer und Test | siehe E3 | hält |
| 24 | INV-8 Consumer und Tests | siehe E3 | hält |
| 25 | INV-18 | siehe E3 | hält |
| 26 | Assumption Z. 401: nicht aktiver Space mit nur privaten Tabs ist nach dem Start leer | `serialize.ts:67-79` (`isSerializableTab`), `useSpacesBoot.ts:95-99`, `:120-123` | hält |
| 27 | Assumption Z. 402 (erster Teil): wiederhergestellte Tabs sind bis zur ersten Aktivierung nicht eingehängt | `serialize.ts:266` (`cold: true`), `liveTerminals.ts:8` (kalte Tabs ausgefiltert), `useTabs.ts:576-581` (Aktivierung wärmt) | hält |
| 28 | Assumption Z. 402 (zweiter Teil): Mitglieder laufen erst nach Aufklappen und Auswahl wieder an, das Sammelzeichen zeigt bis dahin nichts | `sshAgentPoll.ts:47-62`: der Poller sammelt tmux-gebundene Panes aller Terminal-Tabs, kalte eingeschlossen („their session may be live, and the indicator reads purely from tab state"); `App.tsx:1717` gibt ihm alle Tabs; der Status landet je Pane-Id im Agent-Speicher, den `selectTabAgentStatus` liest (`selectTabAgentStatus.ts:19-29`) | widerlegt → D-R1 |
| 29 | `obligations.md` OB-1 bis OB-14 decken alle Vorlauf-Auflagen ab | code O-1 bis O-5, data O-1 bis O-7, ui O-1 bis O-5 (17) sind alle einer OB-Zeile zugeordnet | hält (Ziel-Schritte teils verengt, D-N3) |
| 30 | Untermenü läuft mit installierter radix-ui-Version | – | NICHT GEMESSEN — `node_modules` fehlt im Worktree und im Haupt-Checkout (aus dem Vorlauf) |

Self-Check: 29 Verdikte + 1 NICHT GEMESSEN = 30 erhobene Behauptungen.

### Befundliste (Delta)

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|----|--------|-------|------------|-------|-------|-------------|-----------------------|------------|-------------------|
| D-R1 | refuted | B, Bestand | architecture.md (Assumptions, Z. 402) | „Mitglieder einer eingeklappten Gruppe laufen deshalb erst wieder an, wenn die Gruppe aufgeklappt und der Tab gewählt wird, und das Sammelzeichen zeigt bis dahin nichts" | `src/modules/agents/lib/sshAgentPoll.ts:47-62` sammelt tmux-gebundene Panes (SSH und lokales tmux) aller Terminal-Tabs, kalte eingeschlossen; `src/app/App.tsx:1717` übergibt alle Tabs; der Status steht im Agent-Speicher je Pane-Id, den `selectTabAgentStatus` (`selectTabAgentStatus.ts:19-29`) und damit SVC-6 liest | code | Nach einem Neustart läuft eine tmux-gebundene Session eines Mitglieds einer eingeklappten Gruppe weiter, und ihr Status (arbeitet/wartet) erreicht das Sammelzeichen, ohne dass die Gruppe aufgeklappt wird; nur Panes ohne tmux starten erst bei der Aktivierung | Assumption korrigieren: tmux-gebundene Mitglieder laufen nach dem Neustart weiter und speisen das Sammelzeichen auch kalt; nur Panes ohne tmux bleiben bis zur Aktivierung stumm. SVC-6 und NFR-1 daraufhin prüfen (Pane-Ids aus dem `paneTree` auch kalter Tabs); Vorlauf-Hinweis N1 entsprechend berichtigen | nein (neu; Vorlauf N1 trug dieselbe Aussage als Hinweis) |
| D-F1 | fix | F | architecture.md (MIG-6 oder MIG-1) | MIG-1: „jeder Aufrufer von `nextActiveInSpace` übergibt die Gruppen" | Achter Aufrufer `src/app/hooks/useTabCloseGuards.ts:28` (`if (nextActiveInSpace(tabs, id) === null) return;`) | code | Nach der Signatur-Erweiterung übergibt auch `handleClose` die Gruppen; der Vorab-Check „letzter Tab des Space" bleibt über alle Tabs gleich | MIG-6 um „`handleClose` (`useTabCloseGuards.ts:28`) übergibt die Gruppen an `nextActiveInSpace`" ergänzen | ja (Rest von X2) |
| D-F2 | fix | A, Kohärenz | architecture.md (Test Strategy & Mocking) | „Regel-Funktionen (SVC-1 bis SVC-8, SVC-10 bis SVC-16)" | SVC-17 ist neu eine reine Regel-Funktion (Services-Kopf Z. 134, Zeile Z. 153) | artifact | SVC-17 wird ohne Mocks als reine Funktion getestet | Zeile auf „SVC-1 bis SVC-8, SVC-10 bis SVC-17" ändern; SVC-17 in den Business Logic Flow aufnehmen | nein |
| D-F3 | fix | A, Kohärenz | architecture.md (Q&A 8, Assumption Z. 400) | Q&A 8: „weicht ab: UI-1, TR-7" | `discovery.md:277` TG-5: „Gruppen-Kopf \| Doppelklick / „Rename group"" | artifact | Der Abweichungsvermerk nennt alle Discovery-Zeilen, die den Doppelklick tragen, damit die PM-Durchsicht sie vollständig sieht | „weicht ab: UI-1, TR-7, TG-5" in Q&A 8 und in der Assumption | nein |
| D-O1 | obligation | C, B | – (implement, qa) | SVC-6: „Agent-Sessions, Pane-Ids aller Mitglieder" | `sshAgentPoll.ts:47-50`; kalte Tabs tragen ihren `paneTree` mit tmux-Bindung (INV-10) | code | Nach einem Neustart zeigt der Kopf einer eingeklappten Gruppe „wartet" bzw. „arbeitet" für ein tmux-gebundenes Mitglied, dessen Agent wartet bzw. arbeitet, ohne Aufklappen | Nachweis: QA nach Neustart mit wartendem Agent in einem tmux-Pane einer eingeklappten Gruppe · implement, qa | nein |
| D-N1 | note | Skript AR-5 | – | INV-8 Source | `paneAcrossTabs.test.ts:96` | code | – | Die Zeile ordnet den Test bereits der richtigen Datei zu; der Skript-Hinweis liest das Zeilenformat mit zwei Dateien falsch | nein |
| D-N2 | note | Kohärenz | architecture.md (MIG-1) | MIG-1: „…; SVC-9; SVC-17" | SVC-17 liegt laut Services-Kopf in `tabGroups.ts`, Aufrufstelle ist `App.tsx:334` (MIG-5) | artifact | – | In MIG-1 klarstellen, ob `useTabs` SVC-17 nur exportiert oder selbst ruft | nein |
| D-N3 | note | obligations.md | gates/obligations.md | OB-4, OB-12, OB-13 | Vorlauf ui O-2, O-3, O-5 und code O-3: „implement, qa"; OB-12 nur Implementierung, OB-13 nur QA, OB-4 nur Implementierung | artifact | – | Ziel-Schritte auf „Implementierung, QA" angleichen, wo der Vorlauf beides nennt | nein |
| D-N4 | note | F | architecture.md (MIG-19) | MIG-19 | `WorkspaceSurface.tsx:27` typisiert über `TerminalStackProps["breakOutPane"]` | code | – | MIG-19 ändert sich mit MIG-18 von selbst; die Zeile kann als „keine eigene Änderung, folgt MIG-18" stehen | nein |
| D-N5 | note | Skript AR-7 | – | – | – | – | – | 6 NEW-Zeilen des Scans ohne Zielpfad, wie Vorlauf N9 | ja |

### Claims (Delta)

| erhoben | gemessen | nicht gemessen |
|---------|----------|----------------|
| 30 | 29 | 1 |

## Abschluss nach dem Delta-Lauf (Entscheidung des PM)

- Delta-Lauf: VERDICT FAILED mit einem blockierenden Befund D-R1 (refuted, Nachprüfung CONFIRMED): der zweite Teil der neuen Annahme zu nicht eingehängten Tabs nach dem Neustart. Die übrigen Erledigungen (B1 bis B4, X1, X3 bis X11) hat der Delta-Lauf am Code bestätigt.
- Das Budget von einer Korrekturrunde war verbraucht. Der PM hat entschieden (architecture.md Q&A 9): berichtigen und weiter, ohne weiteren Prüflauf.
- Danach eingearbeitet, nicht mehr von einem Prüfer gegengelesen: D-R1 (Annahme berichtigt, SVC-6 liest auch nicht eingehängte Tabs), D-F1 (achter Aufrufer in MIG-6), D-F2 (SVC-17 in Test-Strategie und Ablauf), D-F3 (TG-5 im Abweichungsvermerk), D-O1 als OB-15.
- Hinweis N1 des ersten Durchgangs ist damit berichtigt: tmux-gebundene Mitglieder laufen weiter und melden „arbeitet" auch bei eingeklappter Gruppe.
- Offen als Hinweise: D-N2 bis D-N5 (Klarstellungen ohne Handlungspflicht), AR-7.
