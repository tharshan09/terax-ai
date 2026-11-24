# End-Review, Perspektive Architektur (zusammengeführt)

- Feature: Tab-Gruppen, Diff `main...HEAD` gegen `architecture.md` (kein `bindings.md`)
- Teile und Einzel-Reports: `review-tab-state-architecture.md`, `review-tab-strip-architecture.md`, `review-rules-persistence-architecture.md`, `review-wiring-close-architecture.md`
- Kein Prüfer hat Tests, Typprüfung oder Build ausgeführt (Vorgabe wegen der Auslastung des Rechners).

## Ergebnis erster Durchgang

Kein blockierender Befund in dieser Perspektive (keine Klasse `decision` oder `refuted`). Der Befund zum Space-Überblick (hier als `fix` C.5-1 geführt) blockiert über die Perspektive Qualität (E1 in `systemic-review.md`).

## Korrekturen (fix), im Sammel-Fix

| ID | found_by | Stelle | Ziel-Zustand |
|----|----------|--------|--------------|
| A1 | tab-state | `useTabs.ts`, `reorderTab` | Wie E1: eingeklappte Zielgruppe bleibt eingeklappt, sichtbarer Nachbar wird aktiv; Test |
| A2 | tab-state | `useTabs.ts`, `validate.ts` | VAL-2 an einer Stelle in `tabGroups.ts` |
| A3 | rules-persistence | `tabGroups.ts`, `moveGroupBlock` | Überholtes Zieh-Ziel (Gruppe verschwunden): Zustand unverändert |
| A4 | rules-persistence | `tabGroups.ts`, `applyGapTarget` | Überholtes Zieh-Ziel beim Umsortieren: Zustand unverändert; ausgebrochener Pane landet weiter lose |
| A5 | rules-persistence | `tabGroups.ts`, `activeAfterHide`, `idBehindGroup` | Tab-Liste des Space über die gemeinsame Ableitung (Sweep criterion, Disposition 1) |

## Hinweise (note)

| ID | found_by | Hinweis |
|----|----------|---------|
| N1 | tab-state | Space-Überblick über Space-Grenzen: der Tab verlässt seine Gruppe und tritt der Gruppe des Ziel-Tabs bei. In Architecture und Bauplan nicht festgelegt; bleibt so und wird im Sammel-Fix durch einen Test festgehalten |
| N2 | wiring-close | MIG-4: `index.ts` exportiert von den Gruppen-Funktionen nur zwei; die übrigen werden wie im Bestand direkt importiert. Keine Verhaltensfolge |
| N3 | wiring-close | INV-14: Die Entscheidung zur gescheiterten Prozess-Abfrage ändert das Einzel-Schließen; im Gate-Log als Abweichung nachgetragen |
| N4 | tab-strip | Die Pane-Ids für das Sammelzeichen werden bei jeder Tab- oder Gruppenänderung neu bestimmt, nie bei Änderungen im Agent-Speicher; kein spürbarer Effekt |

Ohne Abweichung geprüft: API-1 bis API-13, SVC-1 bis SVC-17 (bis auf die Korrekturen), DB-1, VAL-1 bis VAL-4, SEC-3 bis SEC-5, MIG-1 bis MIG-21 (MIG-19 über abgeleiteten Typ), Sweep criterion, NFR-1, die Anti-Slop-Dispositionen 1 bis 3, INV-1 bis INV-18 statisch (INV-12 bis INV-15, INV-17, INV-18 zusätzlich Prüfweg QA), UI-1 bis UI-10 mit den Abweichungen aus Architecture Q&A 8 und den Einzahl-Texten des Bauplans.
