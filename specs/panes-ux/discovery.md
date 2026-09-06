# Panes und Tabs: Discovery

Stand 2026-09-06, Session terax-ai-40. Basis `main` = `491aa2d`, Version 0.8.6.

Auftrag: die Bewegungen zwischen Tabs und eine bessere Greifflaeche, Vorbild iTerm.
Dieses Papier legt die Entscheidungen fest und zerlegt das Ergebnis in Inkremente.
Es ist bewusst kurz und trifft Empfehlungen statt Optionen aufzuzaehlen.

**Status: entschieden am 2026-09-06.** Der User hat D2 (Mitte tauscht), D3 (Ausbrechen
in die Luecke, auf die der Zeiger zeigt), D7 (Toast mit Knopf, nur ueber Tab-Grenzen)
und D8 (Kopfzeile wird der Griff, bleibt aber optional) so bestaetigt. D1, D4, D5 und
D6 folgen aus dem Code und standen nicht zur Wahl. Die Umsetzung laeuft nach der
Reihenfolge in Abschnitt 4.

---

## 1. Ausgangslage, im Code nachgesehen

### Der Baum

`src/modules/terminal/lib/panes.ts` (295 Zeilen). Ein Knoten ist entweder ein Leaf
(`id`, `cwd?`, `tmuxSession?`) oder ein Split (`dir: "row" | "col"`, `children[]`).
Vorhanden: `splitLeaf`, `removeLeaf` (kollabiert einkindrige Splits), `moveLeaf`,
`attachSubtree`, `siblingLeafOf`, `nextLeafId`, `countLeaves`, `flattenSplits`.
`DropEdge` = `left | right | top | bottom`, `EDGE_DIR` bildet sie auf `row`/`col` ab.

Wichtig: `attachSubtree` nimmt schon **einen ganzen Teilbaum**, nicht nur ein Leaf.
Der Tab-auf-Tab-Merge nutzt das. Fuer alles, was jetzt fehlt, reicht das vorhandene
Vokabular fast vollstaendig; wirklich neu ist nur ein Tausch.

### Ein Leaf ist ein PTY. Aber nicht jedes Leaf ist eine tmux-Session.

Korrektur gegenueber der Uebergabe. `managedSessionForNewLocalTab()` wird an genau
zwei Stellen gerufen, `useTabs.ts:414` (`newTabInSpace`) und `useTabs.ts:521`
(`newTab`). `splitActivePane` (`useTabs.ts:1162`) ruft `splitLeaf` **ohne**
`tmuxSession`. Der Kommentar an der Fabrik sagt es auch so:

> Only the primary leaf gets one, so a split pane stays a plain shell.

Folge:

- In einem restart-safe Tab laeuft Pane 1 in `terax-rs-<hex>`, Pane 2 bis 4 nicht.
- Die Weggabelung "besitzen wir die Panes oder tmux" ist damit entschieden:
  **Terax besitzt sie.** tmux ist Restart-Sicherheit pro Tab, kein Layout-Modell.
- Ein tmux-Split *innerhalb* eines Panes bleibt moeglich und bleibt die Sache des
  Users. Terax sieht davon nichts und soll davon auch nichts sehen.
- Die Schieflage (Pane 1 ueberlebt einen Neustart, seine Geschwister nicht) ist ein
  eigenes Thema. Sie gehoert **nicht** in dieses Feature, aber jede Bewegung hier
  muss die `tmuxSession` am Leaf mitnehmen, sonst geht die Restart-Sicherheit beim
  Verschieben verloren. Das tut sie heute, weil das Feld am Leaf haengt.

### Die Grenze bei vier Panes ist keine Willkuer

`MAX_PANES_PER_TAB = 4` (`useTabs.ts:37`), Kommentar: "Matches the renderer slot pool
size". `POOL_MAX_SIZE = 5` (`rendererPool.ts:24`). Vier gleichzeitig sichtbare Panes
belegen vier xterm-Slots mit je einem WebGL-Kontext, der fuenfte ist die Reserve, aus
der ein Tab-Wechsel bedient wird. Wer die Grenze anhebt, hebt den Pool an und zahlt
in WebGL-Kontexten und Speicher.

### Wo die Gesten heute sitzen

| Geste | Ort | Mechanik |
|---|---|---|
| Pane ziehen | `useTerminalPaneDnd.ts` | pointer-basiert, Schwelle 6 px, Ghost folgt per DOM-Schreibzugriff |
| Ziel finden | dito, `edgeAt` | `elementFromPoint` -> `closest("[data-pane-leaf]")`, dann naechste Kante |
| Rueckmeldung | `paneDndStore` -> `PaneDropOverlay` | nur der markierte Pane rendert neu |
| Griff | `PaneTreeView.tsx:117` | 36 x 16 px Pille, `opacity-0` bis `group-hover` |
| Tab ziehen | `TabBar.tsx:186` | ein Durchlauf ueber die Tab-Rects entscheidet Luecke oder Merge |
| Merge-Zone | dito | inneres Viertel bis Dreiviertel eines Tabs, plus 8 px Schlupf nach oben und unten |

### Die eine harte Grenze: inaktive Tabs sind nicht anklickbar

`TerminalStack.tsx:70` setzt fuer jeden nicht aktiven Tab-Layer
`visibility: hidden` **und** `pointerEvents: none`. `document.elementFromPoint`
liefert deren Panes also nie. Ein Pane laesst sich nicht direkt auf einen Pane in
einem anderen Tab ziehen, solange dieser Tab nicht sichtbar ist. Das ist der Grund,
warum "Pane von Tab A nach Tab B" mehr ist als ein erweiterter Hit-Test, und es legt
die Loesung schon fest (siehe D3).

---

## 2. Vorbilder, nur als Vokabular

Das Ausprobieren bleibt beim User; ich kann fremde Apps nicht bedienen. Was hier
zaehlt, sind die Begriffe und das Muster, nicht die Detailtreue.

| Vorbild | Was wir uebernehmen |
|---|---|
| tmux | Die vier Verben: `break-pane`, `join-pane`, `swap-pane`, `move-pane`. Genau unsere vier Luecken, sauber getrennt. |
| iTerm2 | Die Pane-Titelleiste ist die Greifflaeche, nicht ein Griff bei Hover. Ziehen in einen anderen Tab ist eine Geste, kein Menuebefehl. |
| VS Code, Zed | Die Drei-Zonen-Grammatik: Kante teilt, Mitte legt hinein, Tab-Leiste macht einen eigenen Tab daraus. Der Nutzer lernt sie einmal. |
| WezTerm | Der Tastaturweg ist gleichberechtigt, nicht die Notloesung. |
| Upstream `d6e3491` | Hat sich fuer **Tausch** entschieden, nicht fuer Einfuegen: `Mod+Alt+Pfeil`, geometrischer Nachbar, Umlauf an der Kante. |

Der rote Faden: Kante = einfuegen, Mitte = tauschen, Tab-Leiste = ausbrechen. Drei
Bedeutungen, eine Geste, und jede hat in jedem der Vorbilder dieselbe Bedeutung.

---

## 3. Entscheidungen

### D1: Bewegt wird immer genau ein Pane

Ein Leaf, nie ein Teilbaum. Begruendung: der Griff sitzt am Leaf, es gibt keine
Flaeche, an der man einen Split anfassen wuerde, und tmux kennt es auch nicht anders.
`attachSubtree` bleibt trotzdem teilbaumfaehig, weil die Tab-auf-Tab-Geste einen
ganzen Baum bewegt.

Was mit dem Rest passiert: `removeLeaf` kollabiert einen einkindrigen Split von
selbst, `flattenSplits` verhindert gleichgerichtete Verschachtelung. Nichts zu tun.

### D2: Kante fuegt ein, Mitte tauscht

`edgeAt` teilt den Ziel-Pane heute per Diagonalen in vier Dreiecke auf, die naechste
Kante gewinnt. Neu: ein mittleres Drittel in beiden Achsen bedeutet Tausch.

```
+---------------------------------------+
| \               oben                / |
|   \                               /   |
|     \    +---------------------+ /    |
|       \  |                     |      |
| links    |   Mitte = TAUSCH    |rechts|
|       /  |                     |      |
|     /    +---------------------+ \    |
|   /                               \   |
| /              unten                \ |
+---------------------------------------+
```

Warum ueberhaupt tauschen, wo Einfuegen fast alles kann: bei zwei Panes ist es
dasselbe, ab drei nicht mehr. Vor allem bleiben beim Tausch die Groessen erhalten,
beim Einfuegen nicht. Genau deshalb heisst der Upstream-Nachzug `460657a`
"preserve pane layout during swaps".

Ruhe in der Anzeige: es leuchtet immer nur ein Ziel. Kante wie heute, halber Pane
gefuellt. Mitte bekommt eine eigene Form, damit die beiden Bedeutungen nicht
ineinander uebergehen:

```
Kante (heute)                      Mitte (neu)
+-------------------------+        +-------------------------+
|#########|               |        |   +-----------------+   |
|#########|   Ziel-Pane   |        |   |                 |   |
|#########|               |        |   |       <->       |   |
+-------------------------+        |   |                 |   |
 halbe Flaeche gefuellt            |   +-----------------+   |
                                   +-------------------------+
                                    Rahmen mit Doppelpfeil,
                                    Flaeche bleibt frei
```

Das mittlere Drittel ist gross genug, dass an der Grenze nichts flackert. Eine
Hysterese ist nicht noetig.

### D3: Die Tab-Leiste ist das dritte Drop-Ziel, und der Weg in einen anderen Tab

Weil ein inaktiver Tab keine Zeiger-Ereignisse annimmt (siehe oben), gibt es genau
eine ehrliche Loesung: waehrend eines Pane-Drags wird die Tab-Leiste selbst zum
Ziel, und das Verweilen ueber einem Tab wechselt dorthin.

```
   +-- Quelle              +-- verweilen (~400 ms) wechselt dorthin;
   |                       |   danach gilt wieder D2 im sichtbaren Baum
   v                       v
[ shell ] [ api ] [ logs ]              <-- Tab-Leiste
         ^        ^        ^
         |        |        +-- Luecke oder freie Flaeche:
         |        |            AUSBRECHEN in einen neuen Tab an dieser Stelle
         +--------+----------- die Luecken sind dieselben Ziele wie beim
                               Tab-Umsortieren, gleiche Optik
```

Zwei Bedeutungen, sauber getrennt durch die Flaeche unter dem Zeiger: **auf** einem
Tab heisst "dort hinein", **zwischen** Tabs heisst "neuer Tab hier".

Das Verweilen ist ein Seiteneffekt und braucht einen Rueckweg: der Tab, in dem der
Drag begann, wird gemerkt. Abbruch per Escape oder `pointercancel` kehrt dorthin
zurueck, ein Drop bleibt im Zieltab.

Ausbrechen, vorher und nachher:

```
vorher, Tab "api"                     nachher
+-----------+-----------+             Tab "api"            Tab (neu)
|           |     B     |             +---------+---+      +-----------+
|     A     +-----------+             |         | B |      |           |
|           |     C     |             |    A    |   |      |     C     |
+-----------+-----------+             |         |   |      |           |
      C auf die Tab-Leiste            +---------+---+      +-----------+
```

`removeLeaf` kollabiert `col(B, C)` zu `B`, das faellt gratis an.

### D4: Tastatur tauscht, sie fuegt nicht ein

`Cmd+Alt+Pfeil` tauscht den aktiven Pane mit dem Nachbarn in dieser Richtung, mit
Umlauf an der Kante. Uebernahme der Upstream-Grammatik aus `d6e3491` und `460657a`.

Gruende: Tausch ist verlustfrei und selbstinvers, man findet ohne Nachdenken zurueck.
Einfuegen per Tastatur braeuchte zusaetzlich eine Kantenwahl und damit einen zweiten
Modifikator. Und die Belegung ist frei: `Cmd+Pfeil hoch/runter` gehoert
`blocks.prev`/`blocks.next` (`shortcuts.ts:186,193`), `Cmd+Alt+Pfeil` ist unbelegt.
Die Gruppe `Panes` gibt es schon.

"In Tab 3 schicken" wird **nicht** gebaut. Das ist ein Befehl ohne Geste, er braucht
eine eigene Nummerierung im Kopf des Nutzers und loest ein Problem, das die
Tab-Leiste als Drop-Ziel schon loest.

Vorsicht bei der Uebernahme: Upstreams `paneRects` teilt Kinder **gleichmaessig**
auf (`width / count`) und ignoriert damit die tatsaechlich gezogenen Proportionen.
`460657a` ist genau deswegen nachgeschoben worden. Wenn wir echte Geometrie aus dem
DOM lesen, muss sie durch `src/lib/zoomResizeFix.ts`, sonst rechnet sie in der
falschen Skala (bekannter Fehler aus der Resize-Runde).

### D5: Der Fokus folgt dem Pane, das Label folgt dem Fokus

Einheitlich fuer alle vier Operationen: Wer einen Pane bewegt, will dort
weiterarbeiten. Also bleibt der Fokus auf dem bewegten Pane, und bei Tab-Wechsel
folgt der aktive Tab mit.

- Verschieben im Tab: `syncTabToLeaf(..., sourceLeafId)`. So ist es heute schon.
- Tauschen: derselbe Pane, nur an anderer Stelle. Nichts zu tun.
- Ausbrechen: neuer Tab wird aktiv, sein `activeLeafId` ist der ausgebrochene Pane.
  Der Quelltab bekommt `siblingLeafOf` als neuen Fokus, wie beim Schliessen.
- Tab zu Tab: Zieltab bleibt aktiv, Fokus auf dem angekommenen Pane. Der Quelltab
  faellt auf `siblingLeafOf` zurueck; war es sein letzter Pane, verschwindet er.

Das Label braucht keine eigene Regel. `labelFor` liest `findLeafNode(t.paneTree,
t.activeLeafId)` und faellt auf `t.cwd` zurueck. `syncTabToLeaf` zieht `cwd` und
`tmuxSession` des fokussierten Leafs auf die Tab-Ebene nach. Wer D5 einhaelt,
bekommt das Label geschenkt.

### D6: Die Grenze bleibt bei vier

Vier sichtbare Panes, fuenf Slots im Pool. Anheben hiesse den Pool anheben, also
mehr WebGL-Kontexte, und das ist eine Perf-Frage und keine UX-Frage. Sie steht in
keinem Verhaeltnis zum Nutzen, solange niemand nach fuenf Panes gefragt hat.

Aber: heute ist die Pruefung an zwei Stellen und beide Male mit einer Annahme, die
gleich faellt.

- `splitActivePane` prueft `leafIds(...).length >= MAX_PANES_PER_TAB`.
- `canMergeTabs` prueft die Summe beider Baeume.
- `movePane` prueft **nichts**, mit dem Kommentar "Pane count is unchanged".

Der Kommentar wird falsch, sobald ein Pane den Tab wechselt. Es braucht eine
gemeinsame Pruefung, die Umgebung (`workspace`, `private`, `blocks`) und Anzahl in
einem Zug beantwortet und die sowohl der Hit-Test als auch die Mutation benutzt,
genau wie `canMergeTabs` es heute vormacht. Ein unmoegliches Ziel darf gar nicht
erst aufleuchten.

Nebenbei: ein **Tausch** ueber Tab-Grenzen hinweg ist anzahlneutral und laeuft an der
Grenze komplett vorbei. Das ist ein Argument, den Tausch vor dem Tab-Wechsel zu
bauen (siehe Reihenfolge).

### D7: Rueckgaengig nur dort, wo ein Fehlgriff Suchen kostet

Kein `Cmd+Z`. In einem Terminal ist das eine Taste, die in die Shell gehoert.

Stattdessen ein Toast mit Knopf, sechs Sekunden, und nur bei den beiden Operationen,
die eine Tab-Grenze ueberschreiten: **Ausbrechen** und **Tab zu Tab**. Dort ist der
Pane nach einem Fehlgriff aus dem Blick. Die Rueckabwicklung merkt sich den Nachbarn
und die Seite (`panes.leafAnchor`) und haengt denselben Leaf dort wieder an. Sass der
Pane neben einem Pane, ist das exakt; sass er neben einem tieferen Teilbaum, stimmt
die Seite, aber nicht zwingend die alten Proportionen.

Innerhalb eines Tabs braucht es nichts. Der Pane ist sichtbar, und die Geste ist in
einer Sekunde wiederholt. Tauschen ist ohnehin selbstinvers.

Die Toast-Maschinerie steht schon (der 4-Pane-Toast aus PR #73).

### D8: Die Kopfzeile bleibt eine Einstellung, wird aber die Greifflaeche

Nein, nicht jeder Pane bekommt automatisch eine Kopfzeile, sobald es mehr als einen
gibt. Die Kopfzeile ist ein `absolute`-Overlay ueber der obersten Terminalzeile
(`PaneTreeView.tsx:166`), sie kostet also echte Terminalflaeche. Das ungefragt
einzuschalten waere ein Rueckschritt fuer jeden, der sie nicht will.

Was sich aendert:

- Ist die Kopfzeile an, wird **sie** der Griff: `pointer-events` an, `cursor-grab`,
  `onPointerDown` -> `onPaneDragStart`. Die Pille verschwindet dann, zwei Griffe
  uebereinander sind einer zu viel.
- Ist sie aus, bleibt die Pille bei Hover, wird aber breiter (etwa 64 px statt 36)
  und bekommt Hit-Schlupf nach unten. Sie ist heute schlicht zu klein zum Treffen.
- Der Text der Einstellung nennt den zweiten Zweck, sonst findet ihn niemand.

---

## 4. Inkremente

Pro Welle ein Branch und ein PR, Review-Gate `/code-review high`, dann die Gates.

| # | Inhalt | Umfang | Warum an dieser Stelle |
|---|---|---|---|
| A | **Ausbrechen** in einen eigenen Tab (D3 halb, D5, D7) | mittel | Groesster Nutzen, und es baut das dritte Drop-Ziel, auf dem B aufsetzt. |
| B | **Tauschen** per Drop-Mitte (D2) | klein | Vervollstaendigt die Grammatik *innerhalb* eines Tabs, bevor sie ueber Tabs hinweg gilt. Anzahlneutral, also ohne Grenzen-Mathematik. |
| C | **Pane von Tab A nach Tab B** (D3 ganz, D6) | mittel | Braucht A (Drop-Ziel Tab-Leiste) und erbt aus B den Tausch ueber Tab-Grenzen gratis. Bringt die gemeinsame Zulaessigkeitspruefung. |
| D | **Greifflaeche** (D8) | klein | Reine Optik und Treffsicherheit, keine Zustandslogik. |
| E | **Tastatur** `Cmd+Alt+Pfeil` (D4) | klein bis mittel | Handarbeit statt Cherry-Pick, funktioniert unabhaengig von allem anderen. |

Abweichung von der Uebergabe: dort stand Ausbrechen, Tab-Wechsel, Tauschen. Ich
ziehe den **Tausch vor den Tab-Wechsel**. Er ist klein, er schliesst die Grammatik
im sichtbaren Tab ab, und er kommt ohne die Grenzen-Pruefung aus, die der Tab-Wechsel
erst mitbringt. Wer C direkt nach A baut, baut die Mitte-Zone hinterher zweimal ein.

### Was A konkret anfasst

- `useTabs.ts`: neu `breakOutPane(leafId)`. Neuer Tab in derselben Space, direkt
  hinter dem Quelltab, erbt `workspace`, `private`, `blocks`. `paneTree` ist das
  gefundene Leaf-Objekt selbst, `activeLeafId` seine id, dann `syncTabToLeaf`.
  Quelltab: `removeLeaf` plus `siblingLeafOf`. No-op, wenn der Tab nur ein Leaf hat.
- `paneDndStore.ts`: das Ziel wird eine Variante, `{kind:"pane"} | {kind:"newTab"}`.
- `useTerminalPaneDnd.ts`: Hit-Test faellt auf die Tab-Leiste zurueck, wenn
  `elementFromPoint` keinen `[data-pane-leaf]` trifft.
- `TabBar.tsx`: liest den Store und zeigt denselben Luecken-Indikator wie beim
  Umsortieren.
- Tests: `useTabs`-Aktion direkt, wie bei `mergeTabInto`. Kein synthetischer Drag.

---

## 5. Fallstricke, die diese Arbeit teuer machen koennen

1. **`removedManagedSessions` darf hier nie laufen.** Es vergleicht zwei Baeume
   *eines* Tabs. Beim Ausbrechen und beim Tab-Wechsel verlaesst der Leaf den Baum,
   ueberlebt aber woanders. Ein Aufruf nach dem Muster von `closeActivePane`
   (`useTabs.ts:1307`) wuerde die tmux-Session des bewegten Panes toeten. Dasselbe
   gilt fuer `disposeSession`: `movePane` ruft es zurecht nicht.
2. **Inaktive Tabs sind `pointer-events: none`.** Jeder Hit-Test ueber Tab-Grenzen
   scheitert still. Das ist der Grund fuer das Verweilen und keine Umgehung wert.
3. **`nextIdRef` vergibt Tab- und Leaf-ids aus einem Zaehler.** Kollisionen sind
   ausgeschlossen, aber jede neue Aktion muss ihre ids **vor** `setTabs` ziehen, wie
   `mergeTabInto` es tut, sonst zieht ein doppelt laufender Updater zweimal.
4. **Der Verdikt-Vorlauf.** `mergeTabInto` prueft synchron gegen `tabsRef.current`
   und noch einmal im Updater. Das Muster gehoert uebernommen, sonst ist die
   Rueckmeldung an der Oberflaeche eine Runde zu alt.
5. **Nie `flex-col` im Pane-Leaf**, das bricht den Positions-Hittest von
   react-resizable-panels. Geometrie aus dem DOM immer durch `zoomResizeFix.ts`.
6. **Drag ist synthetisch kaum testbar.** Store-Aktionen direkt testen, Sichttest
   ueber die Test-Bridge, und die nur im Dev-Build (`import.meta.env.DEV`).
7. **`pnpm format` fasst rund 131 Dateien an.** Nur die eigenen formatieren:
   `npx biome format --write <pfade>`.

---

## 6. Was hier bewusst nicht drin ist

- **Restart-Sicherheit fuer Split-Panes.** Reale Luecke (siehe Abschnitt 1), aber ein
  eigenes Thema mit eigener Aufraeum-Logik fuer tmux-Sessions.
- **Panes in ein eigenes Fenster ziehen.** Terax ist eine Ein-Fenster-App
  (`TERAX.md`), das waere ein anderes Vorhaben.
- **Mehr als vier Panes**, siehe D6.
- **"Pane an Tab N schicken" per Tastatur**, siehe D4.
