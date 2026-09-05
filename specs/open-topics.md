# Offene Themen (Stand 2026-09-05, nach Session terax-ai-39)

`main` = `0bf7d01`, Version 0.8.6, installiert und live. Upstream-Sync Runde 3 und beide
Follow-up-Runden sind abgeschlossen. Diese Datei ist der Einstieg für die nächste Session.

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

### Was fehlt
1. **Pane in einen eigenen Tab ausbrechen.** Die Umkehrung des Tab-auf-Tab-Merges. Griff
   auf die Tab-Leiste ziehen. Der Baum kann das schon (`removeLeaf` + neuer Tab mit
   Subtree), es fehlt das Drop-Ziel und der Übergang ohne PTY-Neustart.
2. **Pane direkt von Tab A nach Tab B ziehen.** Heute nur der Umweg über einen Merge des
   ganzen Tabs. Als „cross-tab pane move" schon länger notiert.
3. **Tauschen statt Einfügen.** Drop auf die Mitte eines Panes sollte die beiden Panes
   tauschen, die Kante fügt weiterhin ein.
4. **Kopfzeile als Greiffläche.** Der Griff erscheint heute nur bei Hover und ist klein.
   Die optionale Pane-Kopfzeile wäre die natürliche Fläche zum Ziehen.
5. **Tastaturweg zum Verschieben.** Upstream `d6e3491` und `460657a` bringen
   `⌘⌥⇧`+Pfeil. Übernahme kollidiert in fünf Dateien, deshalb Handarbeit.

Reihenfolge nach Nutzen: 1, dann 2, dann 3, danach 4 und 5.
Testweg: Drag ist synthetisch schwer, daher die Store-Aktionen direkt testen, wie bei
`mergeTabInto`. Für den Sichttest die Test-Bridge.

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
ernst nehmen: in den letzten drei Runden hat jedes Gate mindestens einen echten Fehler in
frisch geschriebenem Code gefunden. Danach die Gates laufen lassen (`check-types`, `lint`,
`vitest`, `cargo test`, `clippy -D warnings`, Build), erst dann mergen. Installieren nur
mit ausdrücklichem Ja des Users, und die laufende App nie ungefragt beenden.

Details, Fallstricke und die Belege der letzten Runden stehen in
`specs/upstream-sync-0.8.6/progress.md`.
