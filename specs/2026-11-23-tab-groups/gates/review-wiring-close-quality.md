# Post-Implement Review Report

**Feature:** Tab-Gruppen (Teil „wiring-and-close")
**Branch:** tab-groups
**Default-Branch:** main
**Datum:** 2026-11-24
**Perspektive:** quality+alignment (Teil A + Teil B)
**Prüfmenge:** `git diff main...HEAD` eingeschränkt auf `src/app/App.tsx`, `src/modules/header/Header.tsx`, `src/modules/tabs/index.ts`, `src/modules/terminal/TerminalStack.tsx`, `src/modules/terminal/lib/paneDndStore.ts`, `src/modules/terminal/lib/useTerminalPaneDnd.ts`, `src/modules/terminal/lib/useTerminalSession.ts`, `src/app/hooks/useTabCloseGuards.ts`, `src/app/components/CloseDialogs.tsx`, `src/modules/command-palette/commands.ts`. Als Beleg gelesen, nicht geprüft: `src/modules/tabs/lib/useTabs.ts`, `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/TabGroupHeader.tsx`, `src/modules/tabs/lib/tabGroups.ts`, `src/modules/tabs/lib/tabStripGap.ts`, Rust-Teil `src-tauri/src/modules/pty/`. Keine Tests, keine Typprüfung, kein Build ausgeführt (Vorgabe).

---

## Summary

**Verdict:** FAILED

### Part A: Code Quality

| Kriterium | Findings |
|-----------|----------|
| A.1 Logic Errors | 1 |
| A.2 Error Handling | 0 |
| A.3 Security | 0 |
| A.4 Anti-Patterns | 0 |
| **Subtotal** | **1** |

### Part B: Codebase Alignment

| Kriterium | Findings |
|-----------|----------|
| B.1 Duplicate Solution Paths | 0 |
| B.2 Abstraction Reuse | 0 |
| B.3 Schema Consistency | 0 |
| B.4 Dead Code / Unused Imports | 2 |
| B.5 Error Handling Divergence | 1 |
| B.6 Configuration Drift | 0 |
| B.7 Interface Inconsistency | 1 |
| B.8 Dependency Direction | 0 |
| B.9 Security Pattern Consistency | 0 |
| B.10 Performance Pattern Consistency | 0 |
| **Subtotal** | **4** |

| **Total** | **5** |

Befund-Klassen: 2 × `decision` (RV-1, RV-2), 1 × `fix` (RV-3), 2 × `note` (RV-4, RV-5). Alle Befunde: `decision = pending_review`.

---

## Verdrahtung: was geprüft wurde und stimmt

Die Leitfragen des Auftrags, je mit Beleg. Hier steht kein Befund.

| Frage | Ergebnis | Beleg |
|-------|----------|-------|
| Passen die Aufrufe in App.tsx zu den gefüllten Aktionen (Parameter, Rückgabe)? | Ja. `createGroupFromTab` liefert `string \| null`; App nutzt die Rückgabe zum Start des Umbenennens. Alle Aktionen, die den aktiven Tab verstecken oder einen Space leeren können, bekommen `spawnCwd`. Die übrigen Aktionen brauchen keinen Ordner, weil sie nichts verstecken. | App.tsx:650-656 ↔ useTabs.ts:2079-2092; App.tsx:627, 665-675, 696-700, 1523-1524 ↔ useTabs.ts:2063, 2095, 2154, 2182, 2217 |
| Ordner für ein neues Terminal | `inheritedCwdForNewTab()` (Ordner des aktiven Tabs, sonst Cache, sonst Home), dasselbe Muster wie `openNewTab`. Die Leiste zeigt nur den aktiven Space, also ist der Space, in dem das Terminal entsteht, immer der aktive. | App.tsx:627, 846; useWorkspaceCwd.ts:122-134 |
| Wischen, Tab-Umschalter, Anzeige, Tab nach Nummer | Alle nutzen die sichtbare Liste (SVC-1). | App.tsx:1175, 738-741, 1848; App.tsx:1041-1045 → useTabs.ts:1614-1623 → useTabs.ts:252-259 |
| Space-Wechsel | Läuft über `tabForSpaceSwitch` (SVC-17); der Fall „nur eingeklappte Tabs" klappt über `activate` → `settle` → `expandActiveGroup` auf. | App.tsx:353-359; useTabs.ts:643-686 |
| Sprünge aus Glocke, Benachrichtigung, Mission Control, „focus attention", Space-Übersicht | Alle laufen über `setActiveId`; die Aufklapp-Regel (SVC-9) greift an einer Stelle. | App.tsx:1017-1027, 1070-1078, 1450-1459, 1672, 1819, 1865 |
| Gruppe schließen | Kopf-Menü → `requestCloseGroup` → `disposeGroup` → `closeGroup(groupId, cwd)`. Ein geleerter Space bekommt ein neues Terminal, das aktiv wird, wenn der aktive Tab zur Gruppe gehörte. | TabGroupHeader.tsx:244 → App.tsx:676 → useTabCloseGuards.ts:104-125 → App.tsx:620-630 → useTabs.ts:2243-2257 |
| Bekommt der Schließen-Schutz die Gruppen? | Ja, und das Schließen einzelner Tabs gibt sie an `nextActiveInSpace` weiter. | App.tsx:648; useTabCloseGuards.ts:57 |
| Drei Befehle der Befehlspalette | Sie rufen API-1, API-3 und API-7 auf. „Remove" und „Toggle" sind nur sichtbar, wenn der aktive Tab in einer Gruppe ist (UI-10). | commands.ts:244-274 → App.tsx:1521-1524 |
| Pane-Ausbrechen mit `GapTarget` | Der Weg ist durchgängig typisiert. | useTerminalPaneDnd.ts:210, 227 → TerminalStack.tsx:35, 115 → WorkspaceSurface.tsx:27 → App.tsx:1281-1283 → useTabs.ts:1831 |
| Verdrahtung, die nie erreicht wird | Zwei Stellen gefunden, siehe RV-4 und RV-5. Alle neu entpackten Namen in App.tsx werden genutzt, und jede `groupProps`-Callback hat einen Aufrufer in TabBar.tsx oder TabGroupHeader.tsx. | TabBar.tsx:700, 722, 739, 823, 825; TabGroupHeader.tsx:126-129, 172, 191, 205, 232, 239, 244 |

---

## Findings

### RV-1: „Close group" schließt ohne Rückfrage und beendet laufende tmux-Sessions, wenn die Mitglieder nicht eingehängt sind

**Kategorie:** A.1
**Klasse:** decision

**Problem:**
`closeConfirmReason` stuft ein Terminal als „idle" ein, wenn für seinen Pane keine eingehängte Session existiert (`!s?.pty`). Das betrifft jeden Tab, der nach einem Neustart wiederhergestellt und noch nicht aktiv war. Mitglieder einer eingeklappten Gruppe werden nie aktiv, solange die Gruppe zu ist, also bleiben sie genau in diesem Zustand. `requestCloseGroup` kommt so auf `m = 0` und schließt sofort. `closeGroup` beendet dabei die von Terax verwalteten tmux-Sessions aller Mitglieder.

Die Discovery nennt als Zweck des Features ausdrücklich „fertige Sessions, die noch Messungen laufen lassen". Laut discovery.md:301 ist das Beenden der Sessions durch die Rückfrage abgesichert. Für diesen Fall greift die Absicherung nicht.

Bei eingehängten verwalteten tmux-Tabs ist die Lücke wahrscheinlich dieselbe: Die Shell ersetzt sich per `exec` durch den tmux-Client, und die Prüfung zählt nur die Kinder dieses Prozesses (`pgrep -P shell_pid`). Der Client hat keine Kinder, weil der tmux-Server sich ablöst. Das ist zur Laufzeit zu bestätigen.

Für das Schließen eines einzelnen, noch nicht eingehängten Tabs besteht die Lücke schon heute. Die Gruppe macht daraus einen Klick, der N Sessions auf einmal beendet.

**Neuer Code:** `src/app/hooks/useTabCloseGuards.ts:21-30` (`closeConfirmReason`), `src/app/hooks/useTabCloseGuards.ts:104-117` (`requestCloseGroup`, `m === 0` → `disposeGroup`)
**Bestehendes Pattern:** `src/modules/terminal/lib/useTerminalSession.ts:964-965` (keine Session → `"idle"`); `src/modules/terminal/lib/liveTerminals.ts:7-8` (nicht eingehängte Tabs werden nicht gemountet); `src/modules/spaces/lib/serialize.ts:216` (wiederhergestellte Tabs sind `cold: true`); `src/modules/tabs/lib/useTabs.ts:2227-2229, 2262` (`closeGroup` sammelt und beendet die verwalteten Sessions); `src-tauri/src/modules/pty/shell_init.rs:203-204, 426-441` (`exec tmux new-session …`); `src-tauri/src/modules/pty/mod.rs:236, 266-271` (`pgrep -P shell_pid`)

**Beleg-Quelle:** Code (Frontend und Rust). Für die Aussage zum eingehängten Fall außerdem das Verhalten der Abhängigkeit tmux (der Server löst sich vom Client).

**Erwartete Beobachtung:**
1. Code: Für ein Mitglied mit `cold: true` liefert `closeConfirmReason` `null`, und `planGroupClose` liefert `m = 0`.
2. Laufzeit: Einstellung „restart-safe sessions" an. In einem Gruppen-Tab läuft `sleep 600`. Gruppe einklappen, Terax neu starten, Rechtsklick auf den Kopf und „Close group" → kein Dialog. Danach fehlt die Session in `tmux ls`, und der `sleep`-Prozess ist beendet.
3. Ohne Neustart: `pgrep -P <shell_pid>` für einen eingehängten verwalteten tmux-Tab mit laufendem `sleep 600` gibt nichts aus, und auch hier erscheint kein Dialog.

**Empfehlung:**
Der PM entscheidet. BR-15 verlangt wörtlich nur „die bestehenden Regeln", und denen genügt der Code. Optionen:
- (a) Ein Terminal-Mitglied ohne eingehängte Session, aber mit tmux-Bindung, zählt in `closeConfirmReason` als „läuft möglicherweise" und geht in `m` ein. Das ist nur Frontend und bleibt im Umfang.
- (b) Den Zustand der tmux-Panes abfragen. Dafür gibt es schon `tmux::local_pane_commands` (`src-tauri/src/modules/tmux.rs:89-101`), aber nötig wäre ein neuer Tauri-Befehl, und der Rust-Teil liegt laut architecture.md außerhalb des Umfangs.
- (c) Die Lücke als bekannte Grenze in die QA-Matrix aufnehmen und discovery.md:301 berichtigen.

---

### RV-2: Gescheiterte Prozess-Prüfung: Tab und Gruppe fragen nach, „App beenden" fragt nicht

**Kategorie:** B.5
**Klasse:** decision

**Problem:**
Der Diff stellt die Einzel-Prüfung auf `leafForegroundCheck` um. Scheitert `pty_has_foreground_process`, gilt das jetzt beim Schließen eines Tabs und einer Gruppe als „läuft" (Rückfrage). Der Schutz beim Beenden der App liest dieselbe Prüfung über `leafHasForegroundProcess`, und dort gilt ein Fehler weiter als „läuft nicht" (keine Rückfrage). Für dieselbe Frage („beende ich damit etwas?") gibt es damit zwei Fehler-Regeln.

Nebenbei ändert sich das Schließen eines einzelnen Terminals (INV-14, „sonst schließt der Tab sofort"): Bei einer gescheiterten Prüfung kommt jetzt ein Dialog, auf `main` schloss der Tab sofort. Für die Gruppe ist das gewollt (architecture.md, Error Handling Strategy). Für das Einzel-Schließen folgt es aus SVC-13 („dieselbe Stelle"), für „App beenden" ist nichts festgelegt.

**Neuer Code:** `src/app/hooks/useTabCloseGuards.ts:26-29`; `src/modules/terminal/lib/useTerminalSession.ts:977` (`"failed"`) und `:981-985` (bool-Hülle bildet `"failed"` auf `false` ab)
**Bestehendes Pattern:** `src/app/hooks/useAppCloseGuard.ts:7-14` (`anyTerminalBusy` über `leafHasForegroundProcess`, ein Fehler gilt als „läuft nicht"); main-Stand `src/app/hooks/useTabCloseGuards.ts` (`checks.some(Boolean)`, ein Fehler gilt als „läuft nicht")

**Beleg-Quelle:** Code

**Erwartete Beobachtung:** `pty_has_foreground_process` antwortet mit einem Fehler (z. B. „no session", `src-tauri/src/modules/pty/mod.rs:228-231`). Dann zeigt „Close" an diesem Tab den Dialog „Close Terminal?", während Cmd+Q mit demselben Tab die App ohne Dialog beendet.

**Empfehlung:**
Der PM entscheidet, ob „App beenden" der neuen Regel folgt. Wenn ja: `anyTerminalBusy` auf `leafForegroundCheck` mit `c !== "idle"` umstellen. Dann wird `leafHasForegroundProcess` nicht mehr gebraucht und kann entfallen, und es gibt wieder genau eine Regel. Wenn nein: die Abweichung als bewusste Entscheidung festhalten und INV-14 um „gescheiterte Prüfung → Rückfrage" ergänzen.

---

### RV-3: Die drei Paletten-Aktionen sind optional, alle anderen Aktionen der Palette sind Pflicht

**Kategorie:** B.7
**Klasse:** fix

**Problem:**
`CommandPaletteActionContext` führt jede Aktion als Pflichtfeld, auch die später ergänzten Space-Aktionen `newSpace` und `switchSpace`. Die drei neuen Gruppen-Aktionen sind optional und werden mit `?.()` aufgerufen. Lässt ein Aufrufer sie weg, zeigt die Palette die Einträge trotzdem an, und ein Klick tut nichts. Die Typprüfung meldet das nicht. Der Grund für die Optionalität ist erkennbar die Test-Fabrik in `commands.test.ts`, die die Felder nicht kennt.

**Neuer Code:** `src/modules/command-palette/commands.ts:74-76`, `:252`, `:263`, `:271`
**Bestehendes Pattern:** `src/modules/command-palette/commands.ts:45-73` (alle Aktionen Pflicht, z. B. `switchSpace: (id: string) => void` mit Aufruf `ctx.switchSpace(sp.id)`, `:156`); Test-Fabrik `src/modules/command-palette/commands.test.ts:15-52` (führt jedes Pflichtfeld als `noop`)

**Beleg-Quelle:** Code

**Erwartete Beobachtung:** Wird `createGroupFromTab` im App.tsx-Aufruf von `createCommandItems` (App.tsx:1521) entfernt, läuft die Typprüfung weiter grün durch, und „Add tab to new group" bleibt in der Palette sichtbar, tut aber nichts.

**Empfehlung:** Die drei Felder zu Pflichtfeldern machen, `?.(` durch direkte Aufrufe ersetzen und in der Fabrik `commands.test.ts:15-52` drei `noop`-Einträge ergänzen. Das ändert keine Zusicherung eines bestehenden Tests.

---

### RV-4: `GroupClosePlan.memberIds` wird im Produktionscode nie gelesen

**Kategorie:** B.4
**Klasse:** note

**Problem:**
`planGroupClose` berechnet `memberIds` und legt die Liste in den Plan, der in `pendingGroupClose` steht. Das Bestätigen schließt aber über `disposeGroup(pendingGroupClose.groupId)`, also die Mitglieder zum Zeitpunkt der Bestätigung, nicht die angefragten. Außer Tests liest niemand `memberIds`. Das Feld verspricht „schließt genau die gezeigten n Tabs", und diese Zusage hält der Code nicht ein. Im Normalfall fällt das nicht auf, weil der Dialog modal ist.

**Neuer Code:** `src/app/hooks/useTabCloseGuards.ts:122-125`
**Bestehendes Pattern:** `src/modules/tabs/lib/tabGroups.ts:32-37, 446-449` (das Feld wird gefüllt); laut Suche über `src` lesen es nur `CloseDialogs.test.tsx:37,41`, `useTabCloseGuards.test.ts:117` und `tabGroups.test.ts:509,515`

**Beleg-Quelle:** Code (`grep -rn memberIds src`)

**Erwartete Beobachtung:** Ohne Testdateien liefert `grep -rn "memberIds" src` nur die Definition und das Füllen in `tabGroups.ts`.

**Empfehlung:** Das Feld aus `GroupClosePlan` streichen, oder beim Bestätigen genau `plan.memberIds` schließen. Das Zweite braucht eine zusätzliche Signatur von `closeGroup`.

---

### RV-5: Der Zweig „neuer Tab landet in eingeklappter Gruppe" in `breakOutPane` ist über das Pane-Ziehen nicht erreichbar

**Kategorie:** B.4
**Klasse:** note

**Problem:**
Das Pane-Ziehen ruft `gapTargetAt(strip, clientX)` ohne `headerDrop` auf. Damit ist `onCollapsedHeader` immer `false`, und eine Gruppen-Id taucht nur für Lücken in aufgeklappten Gruppen auf. `applyGapTarget` lässt einen Tab ohne `onCollapsedHeader` nur in eine aufgeklappte Gruppe. In `breakOutPane` kann `hidden` deshalb nie wahr werden, und der Zweig, der den neuen Tab dann nicht aktiviert, läuft im Produktionscode nie. Laut BR-11 und BR-12 gilt das Ablegen auf einem eingeklappten Kopf nur für Tabs, nicht für Panes. Die Verdrahtung entspricht also der Spezifikation, und der Zweig ist toter Code.

**Neuer Code:** `src/modules/terminal/lib/useTerminalPaneDnd.ts:210`
**Bestehendes Pattern:** `src/modules/tabs/lib/tabStripGap.ts:86-93, 106` (Kopf-Treffer nur mit `headerDrop`); `src/modules/tabs/lib/tabGroups.ts:356-366` (`joins` nur bei aufgeklappter Gruppe); `src/modules/tabs/lib/useTabs.ts:459-461` (Pane-Ausbrechen über `applyGapTarget`); `src/modules/tabs/lib/useTabs.ts:1884-1891` (Zweig `hidden`); Tab-Ziehen setzt `headerDrop: true` (`src/modules/tabs/TabBar.tsx:325`)

**Beleg-Quelle:** Code

**Erwartete Beobachtung:** Für jedes `GapTarget`, das `useTerminalPaneDnd` erzeugt, liegt der neu entstandene Tab nach `breakOutPaneFromTabs` lose oder in einer aufgeklappten Gruppe. `hidden` (useTabs.ts:1885-1887) ist `false`.

**Empfehlung:** Den Zweig in `useTabs.ts:1884-1891` streichen (zuständig ist der Reviewer von `useTabs.ts`). Soll ein Pane doch auf einen eingeklappten Kopf fallen dürfen, ist das eine Änderung an BR-11/BR-12 und braucht `{ headerDrop: true }` in `useTerminalPaneDnd.ts:210`.

---

## Changed Files

| File | Lines Changed | Findings |
|------|---------------|----------|
| src/app/App.tsx | +128 -21 | 0 |
| src/app/components/CloseDialogs.tsx | +41 -1 | 0 |
| src/app/hooks/useTabCloseGuards.ts | +71 -14 | 3 (RV-1, RV-2, RV-4) |
| src/modules/command-palette/commands.ts | +38 -0 | 1 (RV-3) |
| src/modules/header/Header.tsx | +6 -3 | 0 |
| src/modules/tabs/index.ts | +10 -1 | 0 |
| src/modules/terminal/TerminalStack.tsx | +3 -3 | 0 |
| src/modules/terminal/lib/paneDndStore.ts | +7 -2 | 0 |
| src/modules/terminal/lib/useTerminalPaneDnd.ts | +6 -5 | 1 (RV-5) |
| src/modules/terminal/lib/useTerminalSession.ts | +13 -5 | 0 (Beleg in RV-2) |

## Prüfmenge

**checked:** die zehn Dateien der Tabelle oben, jede vollständig gegen A.1 bis A.4 und B.1 bis B.10.

**not_checked (außerhalb der Prüfmenge, andere Reviewer):** `src/modules/tabs/lib/useTabs.ts`, `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/TabGroupHeader.tsx`, `src/modules/tabs/lib/tabGroups.ts`, `src/modules/tabs/lib/tabStripGap.ts`, `src/modules/tabs/TabActivityIndicator.tsx`, `src/modules/tabs/lib/selectTabAgentStatus.ts`, `src/modules/spaces/**` (serialize, store, validate, useSpacePersistence, useSpacesBoot, InlineRename) sowie alle Testdateien des Diffs. Die ersten fünf wurden nur als Beleg gelesen.
