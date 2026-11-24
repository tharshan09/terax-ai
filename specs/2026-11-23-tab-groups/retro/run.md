# Laufakte: 2026-11-23-tab-groups

| Key | Value |
|-----|-------|
| **Status** | completed |
| **Dauer** | 737 min |
| **Slices** | 6 |
| **Freie Helfer** | 0 |
| **Befunde** | 60 (bestätigt 10, verworfen 0) |
| **Entscheidungen** | 25 |

## Gates

| Gate | PASSED | FAILED | SKIPPED | max. Anlauf | Befunde |
|------|--------|--------|---------|-------------|---------|
| arch_precheck | 3 | 1 | 0 | 4 | 7 |
| citation_precheck | 0 | 0 | 1 | 1 | 0 |
| architecture_compliance | 0 | 2 | 0 | 2 | 47 |
| worktree_bootstrap | 7 | 0 | 0 | 1 | 0 |
| build_plan_precheck | 2 | 0 | 0 | 2 | 0 |
| lint | 11 | 0 | 0 | 4 | 0 |
| typecheck | 16 | 0 | 0 | 3 | 0 |
| tests | 10 | 1 | 0 | 3 | 33 |
| code_review | 6 | 1 | 0 | 2 | 1 |
| slice_merge | 6 | 0 | 0 | 1 | 0 |
| final_validation | 1 | 0 | 0 | 1 | 0 |
| malicious_intent_scan | 0 | 0 | 2 | 2 | 0 |
| systemic_review | 1 | 2 | 0 | 3 | 15 |
| design_conformance | 2 | 0 | 0 | 2 | 11 |

## Phasen (ab Discovery)

Durchlauf 501 min, aktiv 408 min, Wartezeit 93 min

| Phase | Status | Start | Ende | Dauer |
|-------|--------|-------|------|-------|
| discovery | completed | 2026-11-23T16:35:55Z | 2026-11-23T20:57:01Z | 261 min |
| architecture (im Build) | failed | 2026-11-23T21:20:26Z | 2026-11-23T22:17:36Z | 57 min |
| build | in_progress | 2026-11-23T22:30:25Z | 2026-11-24T00:57:04.385Z (vorläufig) | 147 min |

## Slices

| Slice | Status | Dauer |
|-------|--------|-------|
| slice-00-contracts | merged | 593 min |
| slice-01-group-rules | merged | 26 min |
| slice-02-tab-state | merged | 23 min |
| slice-03-persistence | merged | 10 min |
| slice-04-tab-strip | merged | 24 min |
| slice-05-close-and-palette | merged | 13 min |

## Auffälligkeiten (mechanisch)

- Gate arch_precheck brauchte 4 Anläufe
- Gate citation_precheck 1× übersprungen
- Gate architecture_compliance brauchte 2 Anläufe
- Gate architecture_compliance 2× rot ohne grünen Anlauf
- Gate build_plan_precheck brauchte 2 Anläufe
- Gate lint brauchte 4 Anläufe
- Gate typecheck brauchte 3 Anläufe
- Gate tests brauchte 3 Anläufe
- Gate code_review brauchte 2 Anläufe
- Gate malicious_intent_scan brauchte 2 Anläufe
- Gate malicious_intent_scan 2× übersprungen
- Gate systemic_review brauchte 3 Anläufe
- Gate design_conformance brauchte 2 Anläufe
- 25 Entscheidung(en) ohne Mensch: architecture, build_plan, run_mechanics, decision, resolver
- 6 Abweichung(en) von der Discovery: UI-1, TR-7, UI-8, BR-15, INV-14, NFR-5
- Slice slice-00-contracts brauchte 593 min (Median 24)

## Auffälligkeiten (Helfer)

- Das End-Review schloss ohne Prüflauf über den letzten Fix: systemic_review Anlauf 3 PASSED "kein weiterer Review-Lauf" über a29f781, nur Skripte (lint, typecheck, tests 1504); zuvor brachte jede Fix-Runde einen neuen Befund (E1 → D1, E2 → D2, F5 → N), also bleibt das Restrisiko im Resolver-Fix ungeprüft.
- Die Close-Rückfrage (BR-15, INV-14, UI-8) lief durch vier Entscheidungen ohne Mensch (slice-05 CR-1, E2, E3, Resolver zu D2), drei davon mit Abweichung von der Discovery; der Vertrag war für gescheiterte Prozess-Abfrage und tmux-Bindung offenbar zu dünn.
- 24 von 25 Entscheidungen traf der Agent, nur eine der Mensch (gate-log, 13:20); 6 Abweichungen von der Discovery (UI-1, TR-7, UI-8, BR-15, INV-14, NFR-5), dazu build_plan Entscheidung 7 mit `gap: true` und ohne req_ids, also Scope ohne Anforderung.
- Gate architecture_compliance war 2× rot (38 und 9 Befunde) und nie grün; der Mensch entschied "ohne weiteren Prueflauf" weiter, und D-R1 hatte eine falsche Bestandsannahme (sshAgentPoll.ts) bestätigt, so lief der Build auf einem nach Korrektur nicht erneut geprüften Stand.
- Der Nachprüfer stufte B3 und B4 (architecture_compliance Anlauf 1) und D-R1 als `refuted` ein; B3 und B4 widerlegen Annahmen der Prüf-Perspektiven (useSpacesBoot.ts, useTerminalPaneDnd.ts), D-R1 die Bestandsannahme der Architecture (sshAgentPoll.ts).
- Übersprungen: citation_precheck (kein bindings.md), malicious_intent_scan 2× (Trigger sprang bei 52 und 57 Dateien nicht an), Register-Übertrag und Zeilen-Verfahren (keine guarantees-Konfiguration, kein zip.config.json), Label-Wechsel und notify_cmd; das Zeilen-Verfahren lief nie, also gibt es keine Zeilen zu bewerten.
- slice-00 mit 593 min ist ein Zeitstempel-Fehler des Dirigenten (Tagesuhrzeit statt UTC); das Gate-Log zeigt 23:01:11 bis 23:12:58 UTC, rund 12 min. Die Laufdauer 737 min stützt sich auf denselben Start, Durchlauf laut Phasen 501 min, daher keine echte Bauzeit.
- tests slice-01-group-rules: 33 Tests rot (4 Dateien) kurz vor dem Speicher-Absturz um 23:24 UTC, Wiederholung ohne Code-Änderung mit 2 Workern grün (124 Dateien, 1381 Tests); Deutung: Umgebung, kein Codefehler, seither höchstens 2 Worker.
- Slice-Worktrees lagen im Scratch-Verzeichnis statt unter `.claude/worktrees` (run_mechanics, 23:01:09), weil die Sitzung dort keinen Worktree anlegen durfte; ein Abweichen vom Standardort.
- Lint (4), typecheck (3) und tests (3) zählen Anläufe nach den Fix-Commits 5a13165, 6f9e687 und a29f781, alle grün; einzig roter Testlauf ist der Absturz oben, bindings_exceptions 0 und freie Helfer 0.
