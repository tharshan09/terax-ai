# End-Review, Perspektive Qualität und Abgleich mit dem Bestand (zusammengeführt)

- Feature: Tab-Gruppen, Diff `main...HEAD` (36 Dateien unter `src/`, Stand `934291f` plus Protokoll-Commits)
- Teile und Einzel-Reports: `review-tab-state-quality.md`, `review-tab-strip-quality.md`, `review-rules-persistence-quality.md`, `review-wiring-close-quality.md`
- Zuschnitt: vier Teile statt eines je Slice (kleine Slices zusammengelegt); jede Quelldatei des Diffs liegt in genau einem Teil; Testdateien und Spec-Dateien bleiben außen vor.
- Kein Prüfer hat Tests, Typprüfung oder Build ausgeführt (Vorgabe wegen der Auslastung des Rechners); Lint, Typprüfung und die volle Suite (1487 Tests) liefen vorher grün.

## Ergebnis erster Durchgang

FAILED: 3 bestätigte blockierende Befunde.

## Blockierende Befunde

| ID | Klasse | found_by | Stelle | Befund | Nachprüfung | Entscheidung |
|----|--------|----------|--------|--------|-------------|--------------|
| E1 | decision | tab-state (auch Perspektive Architektur als fix) | `src/modules/tabs/lib/useTabs.ts`, `reorderTab` | Im Space-Überblick klappt eine eingeklappte Gruppe auf, wenn der aktive Tab auf eines ihrer Mitglieder abgelegt wird; Menü und Ziehen in der Leiste lassen sie eingeklappt | CONFIRMED | Wie in der Leiste: Gruppe bleibt eingeklappt, sichtbarer Nachbar wird aktiv (Bauplan, Entscheidung zum Space-Überblick) |
| E2 | decision | wiring-close | `src/app/hooks/useTabCloseGuards.ts`, `requestCloseGroup` | „Close group" schließt ohne Rückfrage und beendet die verwalteten tmux-Sessions, wenn die Prozess-Prüfung nichts sieht (nicht eingehängte Mitglieder nach Neustart; tmux-gebundene Panes allgemein plausibel, nicht gemessen) | CONFIRMED | Beim Schließen einer Gruppe zählt jedes Terminal-Mitglied mit tmux-Bindung als rückfragepflichtig; Einzel-Schließen unverändert |
| E3 | decision | wiring-close | `src/app/hooks/useTabCloseGuards.ts`, `src/app/hooks/useAppCloseGuard.ts` | Gescheiterte Prozess-Abfrage: Tab und Gruppe fragen jetzt nach, „App beenden" nicht; das Einzel-Schließen weicht damit vom bisherigen Verhalten ab | CONFIRMED | Bleibt so: „App beenden" ist Bestand und nicht Teil des Features; Abweichung von INV-14 ausgewiesen; keine Code-Änderung |

## Korrekturen (fix), im Sammel-Fix

| ID | found_by | Stelle | Ziel-Zustand |
|----|----------|--------|--------------|
| F1 | tab-state, rules-persistence | `useTabs.ts`, `validate.ts` | Farbregel an einer Stelle (`normalizeGroupColor` in `tabGroups.ts`) |
| F2 | tab-state, rules-persistence | `useTabs.ts`, `serialize.ts` | Nachgebaute Hilfen (Gruppe setzen/lösen, ans Ende des Space, Gültigkeit der Zugehörigkeit) aus `tabGroups.ts` nutzen |
| F3 | tab-state | `useTabs.ts` | Ersatz-Terminal und neues Terminal entstehen an einer Stelle |
| F4 | wiring-close | `commands.ts` | Gruppen-Aktionen im Paletten-Kontext als Pflichtfelder |
| F5 | tab-strip | `TabBar.tsx` | Umbenennen eines Tabs endet, wenn der Tab durch Einklappen nicht mehr gezeichnet wird |
| F6 | tab-strip | `TabGroupHeader.tsx` | Kommentar an der Umbenennen-Zelle nennt den wahren Grund |

## Hinweise (note)

| ID | found_by | Hinweis |
|----|----------|---------|
| H1 | tab-state, tab-strip, rules-persistence | `gapIndexAt` und `reorderTabsByGap` haben keinen Aufrufer im Produktivcode mehr; die Halbbreiten-Regel steht in `gapTargetAt` ein zweites Mal. Bewusst so (bestehende Tests bleiben unverändert); Aufräumen nach dem Merge möglich |
| H2 | rules-persistence | Die Zähl-Einheit der Ziel-Lücke und die Regel „Gruppe landet hinter einer anderen Gruppe" stehen in der Leiste ein zweites Mal, weil die Ableitung in `tabGroups.ts` privat ist |
| H3 | wiring-close | `GroupClosePlan.memberIds` wird gefüllt, aber im Produktivcode nicht gelesen; bestätigt wird über die Gruppe zum Zeitpunkt der Bestätigung |
| H4 | wiring-close | Der Zweig „Pane landet in eingeklappter Gruppe" in `breakOutPane` wird nie erreicht, weil das Pane-Ziehen keinen eingeklappten Kopf als Ziel kennt |

Das Zusammenspiel über Slice-Grenzen ist in allen vier Teilen ohne Befund: Verdrahtung in `App.tsx` und `Header.tsx`, Ziel-Angabe beim Ziehen, Start und Speicherung, Durchschalten, Space-Wechsel, Sprünge, Schließen und Palette passen zu den gefüllten Aktionen.
