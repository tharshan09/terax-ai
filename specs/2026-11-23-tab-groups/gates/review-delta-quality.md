# Post-Implement Review Report

**Feature:** Tab-Gruppen, Delta-Lauf des End-Reviews über den Fix-Commit `6f9e687` („fix(feature): address review findings")
**Branch:** tab-groups
**Default-Branch:** main
**Datum:** 2026-11-24
**Perspektive:** quality+alignment (Teil A und Teil B), nur das Delta
**Vorlauf:** `systemic-review.md` (E1 bis E3, F1 bis F6), `design-conformance.md` (A1 bis A5)
**Prüfmenge (checked):** `src/app/App.tsx`, `src/app/hooks/useTabCloseGuards.ts`, `src/modules/command-palette/commands.ts`, `src/modules/spaces/lib/serialize.ts`, `src/modules/spaces/lib/validate.ts`, `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/TabGroupHeader.tsx`, `src/modules/tabs/lib/tabGroups.ts`, `src/modules/tabs/lib/useTabs.ts`. Jede Datei habe ich ganz bzw. an allen Stellen gelesen, die der Fix berührt, dazu ihre Aufrufer.
**Nicht geprüft (not_checked):** die sechs Testdateien des Commits (`useTabCloseGuards.tmux.test.ts`, `commands.groups.test.ts`, `commands.test.ts`, `TabBar.rename.test.tsx`, `staleGroupTarget.test.ts`, `useTabs.overview.test.tsx`). Sie liegen außerhalb der Prüfmenge; einige habe ich nur gelesen, um zu sehen, was abgedeckt ist. Tests, Typprüfung und Build habe ich nicht ausgeführt (Vorgabe). Laut Aufrufer sind Lint, Typprüfung und die volle Suite (1503 Tests) grün.

---

## Summary

**Verdict:** FAILED

### Part A: Code Quality

| Kriterium | Findings |
|-----------|----------|
| A.1 Logic Errors | 2 |
| A.2 Error Handling | 0 |
| A.3 Security | 0 |
| A.4 Anti-Patterns | 0 |
| **Subtotal** | **2** |

### Part B: Codebase Alignment

| Kriterium | Findings |
|-----------|----------|
| B.1 Duplicate Solution Paths | 0 |
| B.2 Abstraction Reuse | 0 |
| B.3 Schema Consistency | 0 |
| B.4 Dead Code / Unused Imports | 0 |
| B.5 Error Handling Divergence | 0 |
| B.6 Configuration Drift | 0 |
| B.7 Interface Inconsistency | 0 |
| B.8 Dependency Direction | 0 |
| B.9 Security Pattern Consistency | 0 |
| B.10 Performance Pattern Consistency | 0 |
| **Subtotal** | **0** |

| **Total** | **2** |

---

## Abgleich mit dem Vorlauf

| ID | Ziel-Zustand im Code? | Beleg | Neuer Fehler |
|----|-----------------------|-------|--------------|
| E1 / A1 | Ja, für die Zielgruppe. `reorderTab` führt das Ergebnis jetzt durch `keepActiveVisible`. Die eingeklappte Zielgruppe bleibt eingeklappt, aktiv wird ein sichtbarer Nachbar oder ein neues Terminal mit dem übergebenen Ordner | `useTabs.ts:859`, `useTabs.ts:878-881`, `useTabs.ts:703-715`, `App.tsx:1432` | RV-1 |
| E1, über Space-Grenzen | Rückgabewert und Aufrufer passen zusammen. `true` gibt es nur, wenn der aktive Tab der letzte seines Space war (`useTabs.ts:884-888`). Dann bleibt `activeId` auf dem verschobenen Tab, und `keepActiveVisible` wählt einen Tab im Ziel-Space (`activeAfterHide` auf `group.spaceId`, bzw. `spawn(group.spaceId, …)`, `useTabs.ts:711-714`). `handleReorderTab` folgt in den Space des Ziel-Tabs (`App.tsx:1432-1435`). `tabForSpaceSwitch` behält den aktiven Tab, weil er schon im Ziel-Space liegt (`tabGroups.ts:492`, `App.tsx:353-358`). Ohne Tab bleibt nur der verlassene Herkunfts-Space, wie vor dem Fix und wie bei `moveTabToSpace` (INV-17, `architecture.md:473`). Einen Space, dessen aktiver Tab woanders liegt, gibt es nicht | siehe Spalte links | – |
| E2 | Ja. Beim Schließen einer Gruppe fragt jedes Terminal-Mitglied mit tmux-Bindung (am Tab oder an einem Leaf) nach, ohne Prozess-Abfrage. Das Einzel-Schließen nutzt weiter nur `closeConfirmReason` | `useTabCloseGuards.ts:33-49`, `:126-129`; Einzel-Schließen `:72-90` unverändert | RV-2 |
| E3 | Keine Code-Änderung, wie entschieden. `closeConfirmReason` (`useTabCloseGuards.ts:22-31`) ist unverändert, `useAppCloseGuard.ts` steht nicht im Diff | `git show 6f9e687` | – |
| F1 / A2 | Ja. Die Farbregel steht nur noch in `normalizeGroupColor`, Laden und `setGroupColor` nutzen sie. Sie verhält sich wie die entfernten Kopien: `Number.isInteger` lieferte für Nicht-Zahlen schon `false`, die Bereichsprüfung ist dieselbe, die Rückfallfarbe bleibt 0 | `tabGroups.ts:510-517`, `validate.ts:35`, `useTabs.ts:2119` | – |
| F2 | Ja. `withGroup`/`withoutGroup` ergeben in allen Fällen (gleiche, fehlende, andere Gruppe, Ziel `undefined`) dasselbe wie das entfernte `withGroupId`. `appendToSpace` → `insertBlock(…, null)` setzt hinter den letzten Tab des Space, sonst ans Ende, wie die entfernte Kopie. `validGroupOf` prüft genau die entfernte Bedingung aus `serialize.ts` (`!g \|\| g.spaceId !== tab.spaceId`). `changeTabSpace` löst die Gruppe weiterhin | `tabGroups.ts:69-76`, `:105-114`, `:169-193`; `useTabs.ts:272`, `:866-869`, `:1172`; `serialize.ts:324` | – |
| F3 | Ja. `newTabInSpace` baut auf `lazyTerminal` auf, mit denselben Feldern, derselben Vergabe-Reihenfolge (Tab, Leaf, Session), `cold: true` und demselben Anhängen ans Ende. `newTab` (`useTabs.ts:930-957`) hat weiter ein eigenes Literal (Titel immer „shell"). Das bestand vorher und gehört nicht zum Ziel von F3 | `useTabs.ts:675-698`, `:811-815` | – |
| F4 | Ja. Die drei Gruppen-Aktionen sind Pflicht. Der einzige Aufrufer übergibt alle drei | `commands.ts:74-76`, `App.tsx:1521-1524` | – |
| F5 | Ja. Der Effekt beendet die Bearbeitung, sobald der Tab nicht mehr in `tabIndex` steht (`TabBar.tsx:219-227`). Er läuft nach dem Commit, nicht beim Rendern. Doppelt gespeichert wird nicht: `onCommit` und `onCancel` leeren den Entwurf vor dem Effekt (`:474-482`), der Effekt leert ihn vor `onRename` und setzt `editingId` auf `null`, sodass kein zweiter Lauf greift. Feuert beim Entfernen doch ein Blur, findet der Effekt einen leeren Entwurf. Ohne Änderung wird wie beim Blur nichts gespeichert (`:224` gegen `TabRenameInput` `:1162-1165`). Der Klick auf den Gruppen-Kopf verhindert den Blur (`TabGroupHeader.tsx:166-168`). Genau diesen Fall fängt der Effekt jetzt ab | `TabBar.tsx:169`, `:217-227`, `:471-482`, `:774-777` | – |
| F6 | Ja. Der Kommentar nennt den wahren Unterschied: ohne `role="button"`, Umklapp- und Zieh-Handler | `TabGroupHeader.tsx:149-150` gegen `:151-178` | – |
| A3 | Ja. Ein Ziel einer verschwundenen oder fremden Gruppe lässt den Zustand unverändert | `tabGroups.ts:408-415` | – |
| A4 | Ja. Beim Umsortieren mit überholtem Gruppen-Ziel bleibt der Zustand unverändert. Ein neuer Tab (ausgebrochener Pane) läuft weiter und landet lose | `tabGroups.ts:369-375`, `:387-396`; `useTabs.ts:443-446` | – |
| A5 | Ja, gleichwertig. `{ all: true }` filtert die Rohliste wie zuvor (`tabGroups.ts:52`). Die Menge der versteckten Gruppen in `activeAfterHide` ist dieselbe (Zielgruppe plus eingeklappte Gruppen des Space) | `tabGroups.ts:202-204`, `:299-308` | – |

Kein neuer Befund in Teil B. Die neuen Hilfen bleiben bei den Abhängigkeitsrichtungen des Bestands: `spaces/lib/validate.ts` importierte schon vorher aus `tabs/lib/tabGroups.ts`, und `tabGroups.ts` importierte `SPACE_COLORS` schon vorher. `reorderTab(…, spawnCwd?)` folgt der Signatur der anderen Gruppen-Aktionen mit Ersatz-Terminal (`addTabToGroup`, `toggleGroupCollapsed`, `reorderTabByGap`). `paneBoundToTmux` dupliziert keine bestehende Hilfe: `collectManagedSessions` (`managedTmux.ts:125-137`) erfasst nur verwaltete Sessions, die Entscheidung zu E2 verlangt aber jede tmux-Bindung.

---

## Findings

### RV-1: Zieht man den aktiven Tab im Space-Überblick in einen anderen Space und hat der Herkunfts-Space sonst nur eingeklappte Gruppen, entsteht dort ein neues Terminal, statt dass der nächste Tab seine Gruppe aufklappt

**Kategorie:** A.1 · **Klasse:** fix (Regression durch den Fix)

**Problem:**
Der Fix führt in `reorderTab` jedes Ergebnis durch `keepActiveVisible` (`src/modules/tabs/lib/useTabs.ts:874-881`). Wechselt der aktive Tab den Space, ist `activeId` dort schon der Nachfolger aus `nextActiveInSpace`. Hat der Herkunfts-Space keinen sichtbaren Tab mehr, liegt dieser Nachfolger in einer eingeklappten Gruppe (`useTabs.ts:545-548`). `keepActiveVisible` (`useTabs.ts:703-715`) prüft nur, ob der aktive Tab in einer eingeklappten Gruppe liegt. Es reicht deshalb auch diesen Nachfolger weiter, obwohl der nicht in die Gruppe „gelandet" ist, wie sein Kommentar `:700-702` sagt. `activeAfterHide` findet im Herkunfts-Space keinen sichtbaren Tab und liefert `"new-terminal"`. Es entsteht ein neues Terminal, die Gruppe bleibt eingeklappt.

Vor dem Fix klappte die Aufklapp-Regel in `settle` diese Gruppe auf (`useTabs.ts:629-637`, `:640-653`). So verlangen es SVC-7 und SVC-9 (`specs/2026-11-23-tab-groups/architecture.md:144`, `:146`: „Nachfolger beim Schließen/Wegziehen … der nächstgelegene Tab einer eingeklappten Gruppe" → „klappt seine Gruppe auf") und Q&A 5 (`architecture.md:492`: „Nächste Gruppe klappt auf … kein leeres Terminal").

Der zweite Weg, einen Tab in einen anderen Space zu schieben, macht es weiter so: `moveTabToSpace` (`useTabs.ts:828-832`) setzt den Nachfolger ohne `keepActiveVisible`, die Gruppe klappt auf. Ebenso das Schließen (Test `useTabs.groups.test.tsx:360-378` „falls back to the nearest collapsed tab and expands its group"). Seit dem Fix führen Ziehen auf einen Tab und „In Space verschieben" in derselben Lage zu verschiedenen Ergebnissen.

**Erwartete Beobachtung:**
Aufbau wie in `useTabs.overview.test.tsx`: Tabs `[term(2,"G1"), term(3,"G1"), term(4), term(7, undefined, "b")]`, `G1` eingeklappt im Space `a`, aktiv `t4`. Nach `reorderTab(t(4), t(7), "bottom")` zeigt der Space `a` heute `G1c(t2,t3) new`. `activeId` ist der neue Tab, die Rückgabe ist `false`. Nach SVC-7/SVC-9 erwartet: Space `a` zeigt `G1(t2,t3)`, `activeId === t(3)`, kein neuer Tab. Dasselbe Setup mit `moveTabToSpace(t(4), "b")` liefert schon heute `t3` aktiv und `G1` aufgeklappt.

**Neuer Code:** `src/modules/tabs/lib/useTabs.ts:874-881`
**Bestehendes Pattern:** `src/modules/tabs/lib/useTabs.ts:828-832` (`moveTabToSpace`), `src/modules/tabs/lib/useTabs.ts:629-637` (Aufklapp-Regel)

**Empfehlung:**
`keepActiveVisible` in `reorderTab` nur anwenden, wenn der verschobene Tab danach noch aktiv ist, etwa `const next = { ...s, tabs: without, activeId: fallback ?? s.activeId }; return next.activeId === tabId ? keepActiveVisible(next, spawn) : next;`. Dann greift für einen Nachfolger aus SVC-7 die Aufklapp-Regel wie bei `moveTabToSpace` und `closeTab`. E1 und der Fall „letzter Tab des Space" bleiben unverändert. Dazu einen Test mit dem Aufbau oben.

---

### RV-2: Der Dialog „Close group" behauptet für tmux-gebundene Mitglieder einen laufenden Prozess, auch wenn dort nichts läuft

**Kategorie:** A.1 · **Klasse:** decision

**Problem:**
Seit E2 zählt `groupMemberNeedsConfirm` jedes Terminal-Mitglied mit tmux-Bindung als rückfragepflichtig, ohne Prozess-Abfrage (`src/app/hooks/useTabCloseGuards.ts:41-49`, `:126-129`). Damit wächst `plan.m`. Der Dialog nennt diese Zahl aber unverändert als „… still have a running process or unsaved changes." (`src/app/components/CloseDialogs.tsx:51-55`, Wortlaut vorgegeben in `specs/2026-11-23-tab-groups/build-plan.md:1114`).

Ein tmux-gebundenes Terminal mit untätiger Shell gilt beim Einzel-Schließen als „idle", es gibt keine Rückfrage (`useTabCloseGuards.ts:22-31`, `leafForegroundCheck` in `useTerminalSession.ts:961-979`). In der Gruppe zählt es jetzt als „running process". Mit `restartSafeSessions` bekommt jedes neue lokale Terminal eine verwaltete tmux-Session (`useTabs.ts:81-86`, `:682`, `:933`). Dann meldet der Dialog praktisch bei jeder Gruppe alle Terminals als „running process".

Die Entscheidung zu E2 legt fest, dass gefragt wird, „auch wenn sich nicht feststellen laesst, ob dort etwas laeuft" (`gate-log.jsonl:100`). Über den Text, der dann einen laufenden Prozess behauptet, sagt sie nichts. Ihn zu ändern weicht vom Wortlaut des Bauplans ab. Deshalb ist das eine Entscheidung und keine mechanische Korrektur.

**Erwartete Beobachtung:**
`restartSafeSessions` an, Gruppe aus zwei lokalen Terminals mit untätiger Shell (Leaf mit `tmuxSession`, `pty_has_foreground_process` liefert `false`). „Close group" zeigt „Close 2 tabs?" / „2 of them still have a running process or unsaved changes.". Jedes der beiden Terminals schließt einzeln ohne Rückfrage.

**Neuer Code:** `src/app/hooks/useTabCloseGuards.ts:41-49`
**Bestehendes Pattern:** `src/app/hooks/useTabCloseGuards.ts:22-31` (Einzel-Regel: „running" nur bei Vordergrundprozess), Text `src/app/components/CloseDialogs.tsx:51-55`

**Empfehlung:**
Der PM entscheidet: (a) Text bleibt, und die Grenze wird zu E2 ausgewiesen. (b) Der Text nennt den tmux-Fall, z. B. „… still have a running process, a tmux session or unsaved changes.", mit Abweichungsvermerk zu `build-plan.md:1114`. (c) Die tmux-gebundenen Mitglieder werden getrennt gezählt und eigens genannt.

---

## Changed Files

| File | Lines Changed | Findings |
|------|---------------|----------|
| src/app/App.tsx | +2 -2 | 0 |
| src/app/hooks/useTabCloseGuards.ts | +21 -2 | 1 (RV-2) |
| src/modules/command-palette/commands.ts | +6 -6 | 0 |
| src/modules/spaces/lib/serialize.ts | +3 -2 | 0 |
| src/modules/spaces/lib/validate.ts | +5 -9 | 0 |
| src/modules/tabs/TabBar.tsx | +28 -2 | 0 |
| src/modules/tabs/TabGroupHeader.tsx | +2 -2 | 0 |
| src/modules/tabs/lib/tabGroups.ts | +54 -14 | 0 |
| src/modules/tabs/lib/useTabs.ts | +22 -52 | 1 (RV-1) |

Die Zeilenzahlen stammen aus `git show --numstat 6f9e687`. Die Testdateien des Commits sind nicht aufgeführt (außerhalb der Prüfmenge).
