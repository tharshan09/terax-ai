# Offene Themen (Stand 2026-09-06, nach Session terax-ai-98)

`main` = `e41418a`, Version 0.8.6. Upstream-Sync Runde 3 und beide Follow-up-Runden sind
abgeschlossen. Diese Datei ist der Einstieg für die nächste Session.

**Panes/Tabs: Discovery abgeschlossen, Wellen A und B gemergt.** Die Entscheidungen und
der Bauplan stehen in `specs/panes-ux/discovery.md`, dort weiterlesen statt hier.
Als Nächstes steht Welle C an (Pane von Tab A nach Tab B).

---

## 1. Panes und Tabs (vom User als nächstes Thema benannt)

Vorbild ist iTerm. Ein Teil steht schon, es fehlen die Bewegungen zwischen Tabs und eine
bessere Greiffläche.

### Was heute funktioniert
- Split per `⌘D` / `⌘⇧D`, Fokus per `⌘]` / `⌘[`, `⌘W` schließt den Pane.
- Pane innerhalb eines Tabs verschieben: Greif-Griff bei Hover, Drop an eine Kante des
  Ziel-Panes. Session bleibt erhalten (`panes.moveLeaf`, `useTabs`).
- Tab auf Tab ziehen ergibt einen Split (innere Hälfte des Ziel-Tabs, Ring-Hervorhebung,
  Grenze bei 4 Panes). `panes.attachSubtree` + `useTabs.mergeTabInto`.
- Tab-Beschriftung folgt dem fokussierten Pane (`tabLabel.ts`).
- Fokus-Optik kombinierbar in den Einstellungen: Marker aktiv, Inaktiv-Abdunklung,
  optionale Pane-Kopfzeilen.

### Stand der Wellen
1. ~~**Pane in einen eigenen Tab ausbrechen.**~~ **GEMERGT** (PR #81, `61fa496`).
2. **Pane direkt von Tab A nach Tab B ziehen.** Welle C, als Nächstes. Baut auf A auf:
   eine inaktive Tab-Ebene ist `pointer-events: none`, der Weg führt über die Tab-Leiste
   (Verweilen über einem Tab wechselt dorthin). Bringt `movePaneIntoTab` und die
   gemeinsame Zulässigkeitsprüfung mit, die A bewusst nicht vorweggenommen hat.
3. ~~**Tauschen statt Einfügen.**~~ **GEMERGT** (PR #82, `e41418a`).
4. **Kopfzeile als Greiffläche.** Welle D. Der Griff ist klein und nur bei Hover da.
5. **Tastaturweg**, Upstream `d6e3491`/`460657a`. Welle E, Handarbeit (5-Datei-Konflikt).

Dazu zwei beim Messen gefundene, eigenständige Themen (beide in `discovery.md`):
- **§5a** Einen Pane zu teilen setzt die Breiten der Geschwister zurück (775/274 →
  524/524). Bestand auf `main`, nicht von den Wellen verursacht.
- **§5b** Verschieben und Tauschen schweigen, wenn ein Drag überholt wird; nur das
  Ausbrechen sagt Bescheid.

Testweg: Store-Aktionen direkt testen. **Neu und wichtig:** der Drag lässt sich in der
echten App sehr wohl synthetisch fahren (`elementFromPoint` trifft echtes Layout), und
Messungen dort haben mehrere Fehler gefunden, die keine Testsuite gesehen hätte. Details
in `discovery.md`, Abschnitt Fallstricke.

---

## 2. Kleine Nachzügler aus den letzten Runden

- **Busy-Terminal-Prüfung greift bei tmux nie.** `pty_has_foreground_process` fragt
  `pgrep -P <pty-pid>`, und der PTY-Prozess ist der tmux-Client ohne Kinder. Der
  Schließen-Schutz bewacht damit praktisch nur ungespeicherte Editoren. Für tmux müsste
  die Prüfung in die Session hineinschauen.
- **Settings-Fenster nach abgebrochenem Quit.** Der Code holt es zurück, live nicht
  abschließend belegt.
- **Remote-Hooks auf `litha-claude`** einmal neu aktivieren, ein Klick in der Glocke.
- **Alt-Screen-Tastengating** (Upstream `4634739`) in einer tmux-tauglichen Variante.
- **Fokus-Weiterleitung in `useTerminalSession`** an einer Stelle bündeln.
- **fish-Prompt**: Wrapper-Erkennung deckt jetzt Conda und venv ab, ein Blick auf
  Starship und Oh-My-Posh wäre der nächste Schritt.

---

## 3. Geparkte Upstream-Features (Auswahl nach Bedarf)

Alle mit Konflikten, also Handarbeit. Aufwand jeweils klein bis mittel.

| Thema | Upstream | Nutzen für dich |
|---|---|---|
| Tabs rechts schließen, andere schließen | `6af950d` | Aufräumen bei vielen Tabs |
| Close-Bestätigung abschaltbar | `40ad56b` | weniger Nachfragen |
| Versteckte Dateien umschalten `⌘⇧.` | `a975822` | Explorer |
| Cursor-Stil einstellbar | `4e2f7f7` | Optik |
| Umbruchspalte im Editor | `93b6b24` | Editor |
| Terminal-Schrift pro Theme | `89c65f0` | Optik |
| Svelte-Hervorhebung | `1fdbc50` | nur bei Svelte-Projekten |
| Vorschau-Tabs für Git-Diffs | `40c4c89` | Review-Fluss |
| Explorer-Pfade ins Terminal ziehen | `2e86730` | Terminal-Fluss |

---

## 4. Große Blöcke, nur auf ausdrücklichen Wunsch

- **CLI Control Plane** (`terax open <datei>` aus dem Terminal, Sidecar plus Socket,
  rund 3000 Zeilen). Für einen Terminal-zentrierten Arbeitsablauf der größte Hebel,
  greift aber tief in pty, shell_init, build.rs und den Release-Workflow.
- **Explorer Mehrfachauswahl** mit Stapel-Verschieben und -Löschen, rund 2000 Zeilen,
  braucht eine eigene Sicherheitsprüfung wegen der Pfadgrenzen.
- **UI-Neuentwurf** (schwebende Panes, neues Standard-Thema, nativer Hintergrund). Reine
  Optik, kollidiert vollständig in globals.css, App.tsx und Header.
- **Agenten in Split-Panes starten**, rund 900 Zeilen, Konflikte in Header, TabBar,
  useTabs und den Einstellungen.
- **Verschachtelte Git-Repositories**, kollidiert mit unserem SSH-Git-Routing.

---

## Arbeitsweise, die sich bewährt hat

Pro Welle ein Branch und ein PR. Review-Gate über `/code-review high`, und die Findings
ernst nehmen: über die Panes-Wellen hat das Gate 13 Runden gebraucht, bis es leer kam.
Die frühen Runden fanden echte Fehler, die späten etwas Unangenehmeres: Kommentare und
sogar einen Test, die mehr behaupteten, als der Code hält. Das Gate laufen lassen, bis es
nichts Neues mehr findet, und die eigenen Sicherheitsbehauptungen zuletzt prüfen, nicht
zuerst glauben. Danach die Gates laufen lassen (`check-types`, `lint`,
`vitest`, `cargo test`, `clippy -D warnings`, Build), erst dann mergen. Installieren nur
mit ausdrücklichem Ja des Users, und die laufende App nie ungefragt beenden.

Details, Fallstricke und die Belege der letzten Runden stehen in
`specs/upstream-sync-0.8.6/progress.md`.
