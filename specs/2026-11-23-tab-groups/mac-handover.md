# Mac-Handover: Tab-Gruppen testen und ausrollen

Übergabe von der Werkbank-Sitzung (Bau, 23./24.11.2026) an eine lokale Claude-Sitzung auf dem Mac. Auf der Werkbank lässt sich die App weder bauen noch starten; alles ab hier braucht den Mac.

## Ziel

1. Testbau „Terax Dev" aus dem Branch `tab-groups` neben der installierten App bauen und starten.
2. QA in der laufenden Test-App (Liste unten). Funde beheben oder mit dem Nutzer entscheiden.
3. Erst wenn die QA passt und der Nutzer ausdrücklich Ja sagt: PR mergen, Release bauen, echte App ersetzen.

## Stand

| Punkt | Wert |
|---|---|
| Repo | `tharshan09/terax-ai` (Fork; Upstream `crynta/terax-ai` nicht anfassen) |
| Branch | `tab-groups`, gepusht |
| PR | https://github.com/tharshan09/terax-ai/pull/96, Draft; Titel und Text stammen noch aus der Architektur-Phase („Specs only so far") und müssen vor dem Merge auf den gebauten Stand |
| Basis | `main` bei `9ce4d6b`; vor dem Merge prüfen, ob `main` weitergelaufen ist |
| Prüfungen | Lint, Typprüfung und volle Suite grün (138 Dateien, 1504 Tests). Die App wurde nie gestartet |
| Rust | unverändert; der Diff liegt nur unter `src/` |
| Version | `package.json` steht auf 0.8.7; ob das Release eine neue Nummer bekommt, entscheidet der Nutzer |

Lesen, in dieser Reihenfolge: `report/final/comment.md` (Abschlussbericht mit offenen Punkten, Abweichungen und allen Entscheidungen), `discovery.md` (was gewollt ist), `architecture.md` (Q&A 7 bis 9 und die Schutzliste INV-1 bis INV-18), `gates/obligations.md` (OB-1 bis OB-15), `gates/DECISION-end-review-korrekturen.md`.

## Regeln für die Mac-Sitzung

- Die laufende `/Applications/Terax.app` nie ungefragt beenden. Der Nutzer arbeitet darin. Für den Testbau ist das auch nicht nötig.
- Installieren der echten App nur mit ausdrücklichem Ja des Nutzers; die alte App vorher verschieben statt löschen.
- Review-Obergrenze: höchstens 3 Runden je PR, nur echte Fehler fixen, den Rest als Grenze in den PR.
- Prozessname der App ist `terax` (klein), auch beim Testbau: `pgrep -x terax`.
- Ob das Repo auf dem Mac noch liegt, ist offen (Umzug auf die Werkbank am 17.11.2026; alter Pfad `/Users/zipmend/Documents/private/projects/terax-ai`). Notfalls frisch klonen.

## Schritt 1: Testbau

```
git fetch origin
git switch tab-groups            # oder: git worktree add ../terax-tab-groups origin/tab-groups
pnpm install --frozen-lockfile
. "$HOME/.cargo/env"
pnpm tauri:build:dev-variant
open "src-tauri/target/release/bundle/macos/Terax Dev.app"
```

- Der Testbau heißt „Terax Dev" mit eigener Kennung `app.crynta.terax.dev`. Einstellungen, gespeicherte Tabs, Fensterzustand, SSH-Verbindungen und die verwalteten tmux-Sessions (Präfix `terax-dev-rs-`) sind von der echten App getrennt; Einzelheiten in `TERAX.md`, Abschnitt „Side-by-side test build".
- Nie über `Terax.app` kopieren; von dort starten, wo er gebaut wurde.
- Beide Apps teilen den tmux-Server. Für Tests eigene tmux-Sessions verwenden und im Session-Picker die Sessions der anderen App in Ruhe lassen.
- Meldet Gatekeeper „code has no resources but signature indicates they must be present": `codesign --force --deep --sign - "<Pfad>/Terax Dev.app"`.
- Der Testbau startet mit leerem Zustand (keine Spaces, keine Tabs der echten App). Für die QA ein paar Tabs und zwei Spaces anlegen.

Für gesteuerte Prüfungen (synthetisches Ziehen, Speicher-Asserts) gibt es die Test-Bridge im Debug-Build (`TERAX_TEST_BRIDGE=<dir> pnpm tauri dev`); Anleitung im Claude-Gedächtnis des Repos unter `terax-test-bridge` und `panes-ux-waves`. Ein Debug-Build braucht eine eigene Kennung und einen eigenen tmux-Präfix, sonst teilt er den Zustand mit der echten App.

## Schritt 2: QA-Liste

Jeder Punkt war auf der Werkbank nicht prüfbar. Erwartung steht jeweils dabei.

**Grundablauf**
1. Rechtsklick auf einen Tab, „Add to new group": Gruppe entsteht an der Stelle des Tabs, Namensfeld im Kopf hat sofort Fokus und markierten Text (OB-11). Enter speichert, Esc lässt die Gruppe ohne Namen.
2. Weitere Tabs per „Add to group" hinzufügen; „Add to group" ist ausgegraut, wenn es keine andere Gruppe gibt. Jede Tab-Art hat das Menü (Terminal, Editor, Vorschau, Markdown, Git-Ansichten).
3. Klick auf den Kopf klappt ein und aus. Eingeklappt zeigt der Kopf Farbpunkt, Name, Anzahl und, wenn eine Session arbeitet oder wartet, das Sammelzeichen (wartet schlägt arbeitet). Kein Doppelklick-Umbenennen; Enter und Leertaste am Kopf klappen ebenfalls um.
4. Farblinie unter Kopf und Tabs sitzt richtig; die Markierung des aktiven Tabs sitzt genau unter dem Tab, auch nach Umsortieren und Klappen (OB-12). In mindestens zwei Themes und mit Hintergrundbild ansehen.
5. „Rename group", „Change color" (8 Farben), „Ungroup" (Tabs bleiben offen und an ihrer Stelle).

**Durchschalten und Sprünge**
6. Nächster/vorheriger Tab, Tab nach Nummer und Zwei-Finger-Wischen überspringen eingeklappte Gruppen; Wischen stoppt am Rand, der Umschalter läuft im Kreis (INV-12, INV-13).
7. Gruppe mit dem aktiven Tab einklappen: aktiv wird der nächste sichtbare Tab rechts, sonst links; gibt es keinen, öffnet sich ein neues Terminal im Ordner des bisherigen Tabs.
8. Sprung aus Glocke, Mission Control und Benachrichtigung zu einer Session in einer eingeklappten Gruppe: Gruppe klappt auf, Tab ist aktiv und im Bild, auch bei überlaufender Leiste (OB-13, INV-15).
9. Space-Wechsel: aktiv wird der letzte sichtbare Tab; eine eingeklappte Gruppe am Ende der Leiste bleibt eingeklappt. Hat der Space nur eingeklappte Gruppen, klappt die letzte auf.
10. Letzten sichtbaren Tab schließen, während eine eingeklappte Gruppe existiert: Schließen-Knopf, Mittelklick und Menü-„Close" sind da; der nächstgelegene Gruppen-Tab wird aktiv und seine Gruppe klappt auf (OB-8).

**Ziehen**
11. Tab in die Lücke zwischen zwei Mitgliedern: tritt bei. Tab in eine Lücke außerhalb: verlässt die Gruppe. Lücke hinter dem letzten Mitglied zählt als außerhalb. Die Einfüge-Marke hat innerhalb die Gruppenfarbe.
12. Tab auf die innere Hälfte eines eingeklappten Kopfs: wird letztes Mitglied, Gruppe bleibt eingeklappt; war er aktiv, wird ein Nachbar aktiv.
13. Gruppe am Kopf ziehen: wandert als Block; in eine andere Gruppe hinein landet sie direkt dahinter. Ein kurzer Klick ohne Bewegung klappt nur um.
14. Tab auf Tab ergibt weiter einen Split, auch über Gruppengrenzen. Pane auf die Leiste ergibt einen eigenen Tab und übernimmt die Gruppe der Ziel-Lücke; Rückgängig stellt alles wieder her.
15. Ohne Gruppen verhält sich das Ziehen wie in der installierten App (Vergleich nebeneinander).
16. Space-Überblick: aktiven Tab auf ein Mitglied einer eingeklappten Gruppe ziehen, die Gruppe bleibt eingeklappt. Aktiven Tab in einen anderen Space ziehen, während im alten Space nur eingeklappte Gruppen bleiben: dort klappt die nächste Gruppe auf, kein neues Terminal. Diese zweite Stelle wurde nach dem letzten Review geändert und nur durch Tests geprüft.

**Schließen und Verschieben**
17. „Close group" ohne tmux-Terminals und ohne Laufendes: schließt sofort. Mit laufendem Prozess oder ungespeicherter Datei: eine Rückfrage für die ganze Gruppe; „Cancel" und Esc ändern nichts.
18. „Close group" mit tmux-gebundenen Terminals (restart-sichere Sessions an): Rückfrage erscheint immer, Text endet auf „… or are bound to a tmux session." bzw. „… or is bound to a tmux session.". Nach Bestätigen sind die verwalteten Sessions weg (`tmux ls`), fremde tmux-Sessions bleiben.
19. „Close group" auf eine Gruppe mit allen Tabs des Space: danach steht dort ein neues Terminal.
20. Einzelnes Terminal schließen: wie in der installierten App (Rückfrage nur bei laufendem Prozess; INV-14).
21. „Move group to space": Gruppe steht mit Name, Farbe, Reihenfolge und Klappzustand am Ende der Leiste des Ziel-Space; der aktive Space wechselt nicht; ein geleerter Space bekommt ein neues Terminal. Bei nur einem Space ist der Eintrag ausgegraut.
22. Einzelner Tab in anderen Space: verlässt seine Gruppe (INV-17).

**Neustart**
23. Gruppe umbenennen, umfärben, einklappen, App beenden, starten: alles ist wieder da (OB-2). War der aktive Tab in einer eingeklappten Gruppe, startet nur diese aufgeklappt (OB-6).
24. Private Tabs fehlen nach dem Neustart wie bisher; eine Gruppe aus nur privaten Tabs erscheint nicht.
25. Arbeitender Agent in einem tmux-Pane einer eingeklappten Gruppe, App neu starten: der Kopf zeigt „arbeitet", ohne dass die Gruppe aufgeklappt wird (OB-15; nur mit eingeschalteter Claude-Statistik-Freigabe).
26. Start mit leerem aktivem Space erzeugt ein Terminal (INV-18).

**Rest**
27. Befehlspalette: „Add tab to new group" immer; „Remove tab from group" und „Collapse/expand group" nur, wenn der aktive Tab in einer Gruppe ist.
28. Vorschau-Tab als Gruppenmitglied, andere Datei als Vorschau öffnen: der neue Tab steht lose hinter der Gruppe; war die Vorschau das letzte Mitglied, verschwindet die Gruppe (OB-10).
29. Tab in einer Gruppe umbenennen, Text tippen, Gruppe einklappen: der Name ist übernommen, beim Aufklappen ist kein Feld mehr offen.
30. 30 Tabs in 5 Gruppen: Ein- und Ausklappen und Umsortieren ohne sichtbare Verzögerung; CPU im Leerlauf nicht höher als in der installierten App.

## Bekannte offene Punkte (nicht als QA-Fund melden)

- Angefangenes Umbenennen einer **Gruppe** überlebt einen Space-Wechsel: das Feld bleibt offen, der getippte Text geht verloren. Kleiner Folge-Fix am Inline-Umbenennen; mit dem Nutzer klären, ob er vor dem Merge kommt.
- Angefangenes Umbenennen eines **Tabs** wird jetzt auch beim Space-Wechsel gespeichert (vorher blieb das Feld offen). Zur Durchsicht durch den Nutzer.
- Die Rückfrage bei „Close group" kommt bei tmux-Terminals immer, weil die Prozess-Prüfung nicht in tmux hineinsieht. Genauer ginge es nur mit einer Änderung am Rust-Teil.
- Terminals ohne tmux starten nach einem Neustart erst, wenn der Tab gewählt wird (Bestand).
- Nicht gebaut und nicht Teil dieses Laufs: automatische Status-Gruppen, Mission Control nach Gruppen, eigene Tastenkürzel, neuer Tab direkt in einer Gruppe.

## Schritt 3: Ausrollen (nur nach bestandener QA und Ja des Nutzers)

1. Funde aus der QA auf `tab-groups` beheben; danach `pnpm check-types`, `pnpm lint`, `pnpm test` (auf dem Mac ohne Worker-Grenze).
2. PR-Titel und -Text auf den gebauten Stand bringen (Grundlage: `report/final/comment.md`), Draft aufheben. Prüfen, ob `main` weitergelaufen ist; wenn ja, rebasen und die Prüfungen wiederholen. Die offene Panes-Welle C ändert dieselben Dateien (`src/modules/tabs/TabBar.tsx`, `src/modules/tabs/lib/useTabs.ts`).
3. Mergen in `main` des Forks. Achtung: das lokale `main` trackte früher `upstream/main`; vor jedem Pull `git pull origin main`.
4. Release bauen aus `origin/main` in einem eigenen Worktree: `pnpm tauri build --bundles app` (DMG-Bündelung ist unzuverlässig und nicht nötig). Im About-Tab steht der Commit des Builds.
5. Mit ausdrücklichem Ja des Nutzers: laufende App beenden lassen, alte `/Applications/Terax.app` verschieben, neue kopieren, `codesign --force --deep --sign - /Applications/Terax.app`, starten, prüfen, dass genau eine Instanz `terax` läuft.
6. Erster Start der echten App mit Gruppen: die gespeicherten Tabs müssen unverändert laden (alte Dateien haben keine Gruppen). Sollte der Nutzer danach auf eine ältere Version zurückgehen, lädt diese die Tabs weiter, die Gruppen gehen dabei verloren.
7. Aufräumen: „Terax Dev" beenden, seine tmux-Sessions (`terax-dev-rs-…`) prüfen und entfernen, Worktree und Branch `tab-groups` nach dem Merge löschen, `specs/open-topics.md` nachziehen (F2 erledigt, Folgepunkte von oben).
