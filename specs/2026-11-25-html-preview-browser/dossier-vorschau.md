# Dossier Teil B: Vorschau in der App (Breite, Wischen, Scroll-Hänger, dynamische Artefakte)

Stand: `main` @ `cf07327`, gelesen am 25.11.2026. Nur Befunde, Hypothesen und offene Fragen; keine Entscheidung, kein Fix.
Teil A (Mini-Server, „Im Browser öffnen“) ist nicht untersucht; Abhängigkeiten dorthin stehen als Satz im Text.

Kennzeichen: **belegt** = im Code gelesen, mit Fundstelle. **ungeprüft** = Schluss aus Web-Plattform-Regeln oder fremdem Quelltext, auf der Werkbank nicht messbar. Externe Quellen stehen am Ende.

---

## 0. Prüfung der Behauptungen der Steuereinheit

| # | Urteil | Begründung mit Fundstelle |
|---|---|---|
| **B5** | **widerlegt** | Rechts vom Inhaltsbereich liegt **kein** Panel. Die horizontale Panel-Gruppe hat genau zwei Kinder: Seitenleiste (`src/app/App.tsx:1696-1750`) und Arbeitsfläche (`src/app/App.tsx:1752-1792`), dazwischen der 1-px-Griff (`src/app/App.tsx:1751`, `src/components/ui/resizable.tsx:36`). Die Arbeitsfläche ist das letzte Kind und reicht bis zum Fensterrand. Rechts nimmt die App nur **12 px Polster** (`px-3`, `src/app/components/WorkspaceSurface.tsx:153`) und **1 px Rahmen** (`border`, `src/modules/html/HtmlPreviewPane.tsx:98`). Die KI-Eingabe sitzt **unter** dem Inhalt (`src/app/App.tsx:1780-1790`), nicht rechts. „Wächst nach links, nicht nach rechts“ ist reine Geometrie: die eingeklappte Leiste lag links, rechts ist schon der Fensterrand. Dass die Seite „klein“ wirkt, kommt sehr wahrscheinlich aus dem Dokument selbst (`max-width`) oder aus der Fenstergröße; siehe 1.3. |
| B1 | bestätigt, mit Einschränkung | `DocTabLayer` hält jeden Doc-Tab gemountet und schaltet nur `invisible pointer-events-none` (`src/modules/doc/DocStack.tsx:69-74`). Ausnahmen: „kalte“ Tabs (aus der Sitzung wiederhergestellt, noch nie aktiviert) werden gar nicht gemountet (`src/modules/doc/DocStack.tsx:97-99`, `src/modules/tabs/lib/useTabs.ts:97-98`). Ein Wechsel auf Raw macht aus dem Tab einen Editor-Tab und hängt die Vorschau ab (`src/modules/tabs/lib/applyDocView.ts:4-14`). Über dem Doc-Layer liegt noch eine zweite Schicht mit derselben Klasse (`src/app/components/WorkspaceSurface.tsx:151-157`), und die Pane selbst setzt ein drittes Mal `pointer-events-none` (`src/modules/html/HtmlPreviewPane.tsx:99`). |
| B2 | bestätigt | lokal: `asset_allow` + `convertFileSrc` (`src/modules/html/HtmlPreviewPane.tsx:54-69`); remote: `fs_read_file` + `srcDoc` (`:71-93`, `:111-116`); beide `sandbox="allow-scripts allow-forms allow-popups allow-modals"` (`:35-36`). |
| B3 | bestätigt, mit wichtiger Ergänzung | `wheel`-Ereignisse verlassen ein `iframe`-Dokument nicht (DOM-Regel, keine Fundstelle im Repo nötig). Der Wisch-Erkenner sitzt nativ: ein lokaler AppKit-Monitor für `scrollWheel` (`src-tauri/src/lib.rs:58-131`, installiert `:372`). Er sieht jedes Trackpad-Ereignis im Fenster, auch über dem `iframe`. **Ergänzung:** Die Entscheidung „lieber scrollen als Tab wechseln“ fällt im Frontend (`src/modules/tabs/lib/useTabSwipe.ts:35-38`) und sieht nur das Eltern-Dokument. Über einem `iframe` ist das letzte `:hover`-Element höchstens das `iframe` selbst, dessen Vorfahren nicht waagerecht scrollen. Ergebnis: über der HTML-Vorschau wechselt das Wischen **immer** den Tab, auch wenn die Tabelle darin scrollen könnte. |
| B4 | nicht widerlegt, eher verschärft (ungeprüft) | Nach HTML-Spezifikation erbt ein `about:srcdoc`-Dokument den Policy-Container (also die CSP) des einbettenden Dokuments, unabhängig von der Sandbox. WebKit hat diese Vererbung umgesetzt (WebKit-Bug 224745, „resolved fixed“). Tauri setzt die CSP als HTTP-Header auf die Antworten seines `tauri://`-Protokolls (Upstream-Quelle `protocol/tauri.rs`, Branch `dev`, nicht gegen die gepinnte Version 2.12.5 geprüft). Trifft das zu, scheitern in der **Remote**-Vorschau nicht nur CDN-Skripte, sondern **alle** Inline-Skripte, denn `script-src 'self' 'wasm-unsafe-eval'` enthält kein `'unsafe-inline'` (`src-tauri/tauri.conf.json:28`). Siehe 4.2. |
| B6 | bestätigt, mit Einschränkung | `cargo` fehlt, `node_modules` und `src-tauri/target` fehlen (gemessen). `node` und `pnpm` liegen unter `~/.local/bin`, das ändert nichts: ohne Abhängigkeiten und Rust ist hier nichts lauffähig. |

---

## 1. Breite

### 1.1 Fensterlayout um den Tab-Inhalt (belegt)

Von außen nach innen:

1. App-Wurzel `relative flex h-screen flex-col overflow-hidden` (`src/app/App.tsx:1630-1633`).
2. Kopf mit Tab-Leiste `Header`, nur wenn `!zenMode` (`src/app/App.tsx:1634-1680`).
3. `main.zoom-content` (`src/app/App.tsx:1682`). App-Zoom über CSS `zoom: var(--app-zoom)` (`src/styles/globals.css:182-184`).
4. Horizontale `ResizablePanelGroup` (`src/app/App.tsx:1683-1793`):
   - Seitenleiste, einklappbar bis 0 px, 220–480 px breit (`src/app/App.tsx:1696-1711`, `src/modules/sidebar/useSidebarPanel.ts:12-13`), mit `border-r` (`src/app/App.tsx:1712`) und der Aktivitätsleiste `SidebarRail` **innerhalb** des Panels (`:1744-1748`). Eingeklappt verschwindet also auch die Aktivitätsleiste.
   - Griff 1 px (`src/app/App.tsx:1751`; Greiffläche 10 px per `::after`, `src/components/ui/resizable.tsx:40`).
   - Arbeitsfläche `defaultSize="78%" minSize="30%"` (`src/app/App.tsx:1752`) mit `WorkspaceSurface` (`:1754-1778`) und darunter `WorkspaceInputBar` (KI-Eingabe bzw. Block-Eingabe, `:1780-1790`; offen nur bei `panelOpen` oder Block-Tab, `src/app/components/WorkspaceInputBar.tsx:78`).
5. Statusleiste, nur wenn `!zenMode` (`src/app/App.tsx:1796-1814`).

In `WorkspaceSurface` liegt je Tab-Art eine Schicht `absolute inset-0 px-3 pt-2 pb-2` übereinander (`src/app/components/WorkspaceSurface.tsx:87-201`; HTML-Schicht `:151-164`). Ausnahme: Git-History ohne Polster (`:190`). Darin liegt die HTML-Pane mit `rounded-md border border-border/60` (`src/modules/html/HtmlPreviewPane.tsx:98`), darin das `iframe` `h-full w-full bg-white` (`:108`, `:115`).

### 1.2 (a) Platz, den die App nimmt (belegt)

| Wo | Was | Fundstelle |
|---|---|---|
| links | Seitenleiste 220–480 px + `border-r`, einklappbar | `src/app/App.tsx:1696-1712` |
| links | Griff 1 px (bleibt auch eingeklappt) | `src/app/App.tsx:1751` |
| links/rechts | je 12 px Polster | `src/app/components/WorkspaceSurface.tsx:153` |
| oben/unten | je 8 px Polster | ebd. |
| rundum | 1 px Rahmen, abgerundete Ecken | `src/modules/html/HtmlPreviewPane.tsx:98` |
| oben | Kopf mit Tab-Leiste | `src/app/App.tsx:1634-1680` |
| unten | KI-/Block-Eingabe (wenn offen) | `src/app/App.tsx:1780-1790` |
| unten | Statusleiste | `src/app/App.tsx:1796-1814` |
| im Inhalt | Umschalter Rendered/Raw als Overlay oben rechts (verdeckt Inhalt, nimmt keinen Platz) | `src/components/ui/DocViewToggle.tsx:19` |

Kein `max-width` im App-Teil der Vorschau: Suche nach `max-w-`/`max-width` in `src/modules/html`, `src/modules/doc`, `src/modules/markdown`, `DocViewToggle.tsx`, `src/app` ohne Treffer.

Rechts verliert die App also nur 13 px. Der Rest der „fehlenden Breite rechts“ ist der Fensterrand.

### 1.3 (b) Breite, die das Dokument selbst begrenzt

Von KI erzeugte Berichte setzen oft einen zentrierten Inhaltsblock (`max-width: …; margin: 0 auto`). Das ist kein App-Thema. Klappt man dann die Leiste ein, wird das `iframe` breiter, der Block bleibt gleich breit und rückt nur zur Mitte. Genau das liest sich wie „vergrößert sich nach links“. (Ungeprüft für die konkreten Dateien des Users.)

**Unterscheidung am Mac in einer Minute:**

1. Auf den Rand schauen: Das `iframe` hat immer weißen Grund (`bg-white`, `src/modules/html/HtmlPreviewPane.tsx:108`). Reicht die weiße (oder vom Dokument gefärbte) Fläche bis 12 px an den rechten Fensterrand und steht der Text trotzdem schmal in der Mitte, begrenzt das **Dokument**.
2. Raw einschalten und mit Cmd+F nach `max-width` bzw. `container` suchen.
3. Gegenprobe: dieselbe Datei in Safari öffnen und das Fenster breit ziehen. Bleibt sie dort auch schmal, liegt es am Dokument. (Remote bequem erst mit Teil A, „Im Browser öffnen“.)
4. App-Zoom prüfen: Cmd+0 setzt `--app-zoom` zurück (`src/modules/shortcuts/shortcuts.ts:312-314`). Ob CSS-`zoom` auf `.zoom-content` die CSS-Breite des `iframe`-Dokuments ändert, ist **ungeprüft** (WebKit-Eigenheit, siehe `src/lib/zoomResizeFix.ts:1-15` zu abweichenden Koordinaten).

### 1.4 Vollbild-, Zen-, Fokus-Modus (belegt)

- **Zen-Modus vorhanden:** Zustand `zenMode` (`src/app/App.tsx:962`), Kürzel Mod+Shift+' (`src/modules/shortcuts/shortcuts.ts:317-321`, Handler `src/app/App.tsx:1086`). Er blendet nur **Kopf und Statusleiste** aus (`src/app/App.tsx:1634`, `:1796`). Seitenleiste, Polster, Rahmen und KI-Eingabe bleiben. Er ist nicht dauerhaft (nur `useState`) und hat keinen Eintrag in der Befehlspalette (`src/modules/command-palette/commands.ts:52` nennt ihn nur als Grund, „Forward Port“ zu sperren, `:227`).
- Kein „Tab maximieren“ und kein „Pane maximieren“ gefunden (Suche nach `maximi`, `fullscreen`, `zen` in `src` und den Specs). Das native macOS-Vollbild (grüner Knopf) wirkt aufs ganze Fenster und ist nicht eigens verdrahtet.
- Seitenleiste ein/aus: `sidebar.toggle` (`src/app/App.tsx:1081`; Ctrl/Cmd+B wird im Terminal ans Terminal durchgereicht, Shift-Variante immer, `:1146-1157`).

### 1.5 Stellen, die „Vorschau über das ganze Fenster“ anfassen müsste (nur Liste)

- `src/app/App.tsx:962`, `:1086`: Zen-Zustand und Kürzel (Ausbau oder zweiter Modus).
- `src/app/App.tsx:1634`, `:1796`: Kopf und Statusleiste ausblenden.
- `src/app/App.tsx:1696-1751`: Seitenleisten-Panel und Griff (einklappen oder ausblenden; `useSidebarPanel` speichert den Einklapp-Zustand, `:1708-1710`, also nicht versehentlich dauerhaft überschreiben).
- `src/app/App.tsx:1780-1790`: KI-/Block-Eingabe unter dem Inhalt.
- `src/app/components/WorkspaceSurface.tsx:151-164`: Polster der HTML-Schicht (gleich für Markdown `:137-150`, Web-Vorschau `:123-136`).
- `src/modules/html/HtmlPreviewPane.tsx:96-102`: Rahmen, Ecken, Overlay-Umschalter.
- `src/modules/markdown/MarkdownPreviewPane.tsx:66-72` und `src/modules/editor/EditorStack.tsx:51-58`: dieselben Elemente bei Markdown und Raw-Ansicht.
- macOS-Fensterrahmen: `titleBarStyle: "Overlay"` (`src-tauri/tauri.conf.json:21-22`). Ohne Kopf liegen die Ampel-Knöpfe über dem Inhalt (Verhalten im heutigen Zen-Modus am Mac ansehen, ungeprüft).
- Rückweg: das Wischen und die App-Kürzel kommen nicht an, solange der Fokus im `iframe` steckt (siehe 4.7). Ein „Raus aus dem Vollbild“ nur per JS-Kürzel wäre dann nicht erreichbar.

---

## 2. Waagerechtes Wischen

### 2.1 Aufbau (belegt)

Es gibt **einen** Weg, nativ plus Frontend-Prüfung:

1. **Nativ (macOS):** `install_tab_swipe_monitor` (`src-tauri/src/lib.rs:68-131`), lokaler `NSEvent`-Monitor für `ScrollWheel` (`:128`). Regeln:
   - Schwung nach dem Loslassen (`momentumPhase` gesetzt) wird nie ausgewertet (`:88-91`).
   - Klassische Mausräder (keine präzisen Deltas) zählen nicht (`:92-95`).
   - Bei `Began` werden die Summen und `fired` zurückgesetzt, bei `Ended`/`Cancelled` ebenso (`:97-107`).
   - Feuern: waagerechte Summe ≥ 50 Punkte **und** größer als die senkrechte Summe seit Gestenbeginn (`:75`, `:110-113`). Einmal je Geste (`fired`, `:114`).
   - Richtung folgt dem natürlichen Scrollen (`:115-118`), Ausgabe `terax:tab-swipe` (`:119`).
   - Der Monitor gibt **jedes** Ereignis unverändert weiter (`return pass`, `:90`, `:94`, `:106`, `:122`). Er kann Scrollen nie schlucken.
   - Das Feuern passiert **mitten in der Geste**, die Finger liegen noch auf. Der Rest der Geste geht weiter an WebKit.
2. **Frontend:** `useTabSwipe` hört auf `terax:tab-swipe` (`src/modules/tabs/lib/useTabSwipe.ts:31`). Ziel ist das letzte Element aus `document.querySelectorAll(":hover")` (`:35-36`). `isInsideHorizontalScroller` läuft von dort bis zur App-Wurzel hoch und gibt nach, wenn ein Vorfahr `overflow-x: auto|scroll` hat, tatsächlich überläuft und in Wischrichtung noch Platz hat, oder `data-no-tab-swipe` trägt (`src/modules/tabs/lib/tabSwipe.ts:23-42`).
3. **App:** `swipeTab` (`src/app/App.tsx:1172-1185`): abschaltbar über die Einstellung `trackpadTabSwipe` (Standard an, `src/modules/settings/store.ts:343`; Schalter „Trackpad swipe to switch tabs“, `src/settings/sections/GeneralSection.tsx:351-356`), Reihenfolge der sichtbaren Tabs, am Rand Schluss, kein Umlauf.

Ein Frontend-`wheel`-Listener für den Tabwechsel existiert nicht. Der einzige `wheel`-Listener ist die Tab-Leiste: senkrechtes Rad scrollt sie waagerecht (`src/modules/tabs/TabBar.tsx:381-392`).

### 2.2 Wie ein Wischen über dem `iframe` den Code erreicht (belegt + ungeprüft)

Der AppKit-Monitor sieht das Ereignis, bevor WKWebView es bekommt (`src-tauri/src/lib.rs:64-65`), egal welches Dokument darunter liegt. Die Frontend-Prüfung läuft im Eltern-Dokument: `:hover` endet am `iframe`-Element (ob WebKit den Hover bis zum Eigentümer-Element hochreicht, ist ungeprüft; wenn nicht, ist das Ziel ein Vorfahr). Weder das `iframe` noch seine Vorfahren scrollen waagerecht: `HtmlPreviewPane` hat `overflow-hidden` (`src/modules/html/HtmlPreviewPane.tsx:98`). Also wechselt der Tab, **und gleichzeitig** scrollt WebKit die Tabelle im `iframe` ein Stück. Die Eltern-Seite kann den Scroll-Zustand im `iframe` nicht lesen: wegen fehlendem `allow-same-origin` hat es einen opaken Ursprung (`:30-36`).

Nebenbefund: Ein Trackpad-Scroll bewegt den Mauszeiger nicht. `:hover` kann nach einem Tabwechsel ohne Zeigerbewegung noch auf ein Element im jetzt unsichtbaren Tab zeigen (ungeprüft, ob WebKit den Hover nach dem Sichtbarkeitswechsel neu berechnet). Dann prüft das nächste Wischen das falsche Element.

### 2.3 Vorhandene Ausnahmen (belegt)

- Code-Editor: CodeMirror `.cm-scroller` scrollt waagerecht, wird von der Prüfung erkannt (Beispiel in `src/modules/tabs/lib/tabSwipe.ts:5-8`).
- Markdown-Vorschau: Scroll-Container `flex-1 overflow-auto` (`src/modules/markdown/MarkdownPreviewPane.tsx:73`) im Eltern-Dokument, also erkennbar. Ob Streamdown breite Tabellen zusätzlich in einen eigenen `overflow-x-auto`-Wrapper legt, ist ungeprüft (`node_modules` fehlt); erkannt würde beides.
- Tab-Leiste, wenn sie überläuft (`src/modules/tabs/lib/tabSwipe.ts:7`).
- Ausdrückliche Ausnahme `data-no-tab-swipe`: nur KI-Mini-Fenster (`src/modules/ai/components/AiMiniWindow.tsx:96`) und „Ask AI“-Popup (`src/modules/ai/components/SelectionAskAi.tsx:47`).
- **Keine** Ausnahme: HTML-Vorschau (`iframe`), Web-Vorschau (`iframe`, `src/modules/preview/PreviewPane.tsx:104-118`), PDF (`iframe`, `src/modules/editor/EditorPane.tsx:464`), Terminal (xterm scrollt nicht waagerecht).

### 2.4 Wege, damit waagerecht scrollbarer Vorschau-Inhalt Vorrang hat (Optionen, keine Wahl)

| Weg | Was er braucht | Was er kostet | Woran er scheitern kann |
|---|---|---|---|
| W1 Heute schon: Einstellung aus | nichts (Schalter existiert, `src/settings/sections/GeneralSection.tsx:351`) | Wischen überall weg | Der User will das Wischen sonst behalten. |
| W2 `data-no-tab-swipe` auf die HTML-Pane | ein Attribut in `src/modules/html/HtmlPreviewPane.tsx:96-101` | über der Vorschau nie Tabwechsel per Wischen, nur über Tab-Leiste, Seitenleiste, Ränder | Der User wischt gewohnheitsmäßig über dem Inhalt. Fehlende Rückmeldung, warum es dort nicht geht. |
| W3 Wischen nur, wenn die Geste über der Tab-Leiste oder einem Randstreifen beginnt | Ort bei `Began` im Rust-Monitor (`locationInWindow`) oder `:hover` beim ersten Ereignis | Rust-Änderung (`src-tauri/src/lib.rs:97-120`), auf der Werkbank nicht kompilierbar | Gewohnheit bricht für alle Tab-Arten, nicht nur für HTML. |
| W4 Vorschau meldet ihr Scrollen per `postMessage` | ein Hilfsskript im Dokument, das `wheel`/`scroll` im `iframe` beobachtet und „kann waagerecht scrollen / am Rand“ meldet; das Eltern-Dokument entscheidet danach | Eingriff in fremde Dokumente; beim Asset-Weg müsste die Datei umgeschrieben oder anders geladen werden; zeitlicher Wettlauf: das native Ereignis kommt vor dem Ereignis im `iframe` | Inline-Skript in `srcDoc` scheitert vermutlich an der vererbten CSP (4.2). Mit eigenem Origin über den Mini-Server aus Teil A ginge das Einschleusen nur über den Server, nicht über das Lesen des `iframe`-Zustands. Dokumente mit eigener Scroll-Logik melden falsch. |
| W5 Strengere Schwelle / Achsenregel | Zahlen in `src-tauri/src/lib.rs:75`, `:113` (z. B. waagerecht deutlich größer als senkrecht) | Rust-Änderung | Hilft gegen schräges Versehen, nicht gegen bewusstes Tabellen-Scrollen. |
| W6 Gleicher Ursprung mit der App | `allow-same-origin` | Sicherheitsrückschritt, dokumentiert abgelehnt (4.1) | nicht empfehlbar. Auch ein eigener Origin aus Teil A bleibt fremd zur App; lesen könnte die App den Zustand dann trotzdem nicht. |

---

## 3. Scroll-Hänger nach Tab-Wechsel

Auf der Werkbank **nicht messbar**. Rangliste nach Passung zum Zitat („… weil ich jetzt in einem anderen Tab drinne war“) und Beleglage.

### H1: Versehentlicher Tabwechsel mitten in der Geste, Rest der Geste hängt am alten Tab
- **Mechanismus:** Der Monitor feuert nach 50 Punkten waagerecht, **während die Finger noch liegen** (`src-tauri/src/lib.rs:110-119`). Über der HTML-Vorschau gibt das Frontend nie nach (2.2). Der Tab wechselt. WebKit hat die laufende Geste aber an den Scroller unter dem Zeiger im **alten** Tab gebunden („scroll latching“). Der Rest der Geste und ihr Schwung gehen an eine jetzt unsichtbare Fläche: der neue Tab bewegt sich nicht. Der User ist plötzlich in einem anderen Tab, wischt zurück, sucht seine Stelle.
- **Belege:** `src-tauri/src/lib.rs:110-119` (Feuern mitten in der Geste), `src/modules/tabs/lib/useTabSwipe.ts:35-38` (Prüfung blind für `iframe`-Inhalt), `src/app/App.tsx:1172-1181`.
- **Dagegen:** Latching endet normalerweise mit dem Loslassen; ein neuer Ansatz der Finger müsste sofort scrollen. Dauert der Hänger länger, reicht H1 allein nicht. Das Latching-Verhalten von WebKit ist ungeprüft.
- **Experiment:** E1 und E2.

### H2: Dokument scrollt nur in einem inneren Bereich
- **Mechanismus:** Viele erzeugte Seiten haben `body { height: 100vh; overflow: hidden }` und einen inneren Scroll-Container (Seitenmenü fest, Inhalt scrollt). Scrollen geht nur, wenn der Zeiger über diesem Bereich steht. Nach einem Tabwechsel steht der Zeiger irgendwo; der User muss „die Stelle finden“.
- **Belege:** keine im Repo (Dokument-Thema). Die App hat kein Scroll-Element um das `iframe` (`src/modules/html/HtmlPreviewPane.tsx:103-116`).
- **Dagegen:** erklärt nicht, warum es gerade nach einem Tabwechsel auftritt.
- **Experiment:** E3.

### H3: Unsichtbare Schicht darüber fängt das Scrollen ab
- **Mechanismus:** Alle Tab-Arten liegen als `absolute inset-0` übereinander, spätere im DOM liegen oben: Terminal < Editor < Web-Vorschau < Markdown < HTML < KI-Diff < Git-Diff < Git-History (`src/app/components/WorkspaceSurface.tsx:87-201`). In `DocStack` liegt ein später geöffneter HTML-Tab über einem früheren (`src/modules/doc/DocStack.tsx:106-115`). Hält sich WebKits asynchrones Scrollen beim Treffertest (im UI-Prozess) nicht an `visibility: hidden` / `pointer-events: none`, bekommt eine unsichtbare obere Schicht das Scrollen.
- **Belege:** Stapelordnung wie oben; dreifaches `pointer-events-none` (B1).
- **Dagegen:** Nach CSS-Regel und nach dem Treffertest im Hauptdokument sind solche Schichten nicht trefferfähig; `elementFromPoint` liefert sie nie (`specs/panes-ux/discovery.md:424`). Ein aktueller WebKit-Fehler dazu ist nicht belegt (ungeprüft).
- **Experiment:** E4.

### H4: Veralteter Hover-/Latch-Zustand des `iframe` nach Sichtbarkeitswechsel
- **Mechanismus:** Trackpad-Scrollen bewegt den Zeiger nicht. Nach dem Wechsel auf den HTML-Tab ist der Treffer- und Hover-Zustand in WKWebView womöglich noch der alte, bis der Zeiger sich bewegt. Erst die Bewegung („Stelle finden“) bindet das Scrollen ans sichtbare `iframe`.
- **Belege:** Sichtbarkeitswechsel nur per Klasse, kein Neuladen (`src/modules/doc/DocStack.tsx:69-74`). `:hover` wird für die Wisch-Prüfung genutzt (`src/modules/tabs/lib/useTabSwipe.ts:35`), zeigt aber nur, dass der Zustand eine Rolle spielt.
- **Dagegen:** reine WebKit-Vermutung, keine Fundstelle für einen solchen Fehler. Träfe nur `iframe`-Vorschauen, nicht Markdown.
- **Experiment:** E5 (Zeiger nicht bewegen vs. 1 px bewegen) und E6 (HTML gegen Markdown).

### H5: Fokus liegt noch im alten Tab
- **Mechanismus:** Nach einem Wechsel auf einen HTML-Tab setzt niemand den Fokus ins `iframe` (keine Fokus-Logik in `src/modules/html/HtmlPreviewPane.tsx`). Tastatur-Scrollen (Pfeile, Leertaste, Bild-ab) geht dann ins Leere oder an das zuletzt fokussierte Element im unsichtbaren Tab, etwa das xterm-Eingabefeld.
- **Belege:** keine Fokus-Behandlung in der Pane; App-Kürzel lauschen am Eltern-Fenster (`src/modules/shortcuts/lib/useGlobalShortcuts.ts:65`).
- **Dagegen:** Der User spricht von „swipen“, nicht von Tasten. Trackpad-Scrollen braucht keinen Fokus.
- **Experiment:** E7.

### H6: Überlagerungen (Popups, HUD, Drag-Zonen)
- **Mechanismus:** Eine Überlagerung liegt über der Vorschau und fängt Scrollen ab.
- **Belege:** `TabSwitcherHud` ist `pointer-events-none fixed inset-0` (`src/modules/tabs/TabSwitcherHud.tsx:34`), SpaceSwitcher-Overlay `pointer-events-none` (`src/modules/spaces/SpaceSwitcher.tsx:316`). Drop-Zonen der Panes gibt es nur in Terminal-Tabs und nur während eines Zugs (`specs/panes-ux/discovery.md:60-69`). Das KI-Mini-Fenster ist `fixed z-40` und fängt in seiner Fläche wirklich ab (`src/modules/ai/components/AiMiniWindow.tsx:96-98`).
- **Dagegen:** Keine dauerhafte, unsichtbare, trefferfähige Fläche gefunden. Nur das offene Mini-Fenster wäre ein Kandidat, und das sähe man.
- **Experiment:** E8.

### H7 (verworfen): Wisch-Handler bleibt hängen
- **Mechanismus:** Achsensperre oder „Geste läuft“ bleibt stehen und blockiert Scrollen.
- **Dagegen (belegt):** Der Monitor gibt jedes Ereignis weiter (`src-tauri/src/lib.rs:83`, `:90`, `:94`, `:106`, `:122`) und setzt bei jedem `Began` zurück (`:97-101`). Ein hängendes `fired` verhindert höchstens den nächsten Tabwechsel, nie das Scrollen. Das Frontend hält keinen Gesten-Zustand (`src/modules/tabs/lib/useTabSwipe.ts:31-39`).
- **Experiment:** in E1 enthalten.

**Andere Vorschau-Arten:** H1, H2, H3 und H5 gelten für jede Tab-Art. H4 betrifft nur `iframe`-Arten (HTML, Web-Vorschau, PDF). Markdown scrollt im Eltern-Dokument (`src/modules/markdown/MarkdownPreviewPane.tsx:73`), dort gibt die Wisch-Prüfung bei breiten Tabellen nach (2.3).

---

## 4. Dynamische Artefakte

### 4.1 Sandbox ohne `allow-same-origin`: bewusste Sicherheitsentscheidung (belegt)

- Code-Kommentar mit Begründung: `src/modules/html/HtmlPreviewPane.tsx:30-34`.
- Commit `41f8936` (PR #47, FS-6): `allow-same-origin` lokal entfernt, „an opaque origin still renders and runs the file's own scripts“.
- Audit 2026-07, Fund FS-6 (Low): mit `allow-same-origin` konnte eine bösartige `index.html` jede Datei im Unterordner (`.env`, `config.pem`) lesen und hinausschicken. Der vorgeschlagene Fix nennt die Folge ausdrücklich: „bricht die Eigen-fetch der Seite, schließt aber das Read-back“ (`security-audit-2026-07.html:227-231`).
- Remote war schon vorher ohne `allow-same-origin`.

**→ Die Speicher-, Cookie- und `fetch`-Grenzen in 4.3 sind eine dokumentierte Entscheidung, kein Mangel.**

### 4.2 CSP der App und `srcDoc` (ungeprüft, hohe Tragweite)

- CSP: `script-src 'self' 'wasm-unsafe-eval'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: asset: https://asset.localhost blob:`, `font-src 'self' data:`, `connect-src … https: http://localhost:* http://127.0.0.1:*`, `frame-src 'self' http: https: asset: https://asset.localhost`, `base-uri 'self'`, `form-action 'self'` (`src-tauri/tauri.conf.json:28`). Kein `<meta>`-CSP in `index.html`.
- Die CSP schützt die App selbst und ist gewollt (Sicherheitsphase A, Commit `83cc304`). Dass sie in die Remote-Vorschau durchschlägt, ist **nirgends als Entscheidung dokumentiert** (kein Kommentar in `HtmlPreviewPane.tsx`, nichts in Audit oder `TERAX.md`). Der Code-Kommentar nennt nur „Relative resources can't resolve there“ (`src/modules/html/HtmlPreviewPane.tsx:22-25`).
- **Remote (`srcDoc`)**, wenn die Vererbung wie spezifiziert greift:
  - Inline-`<script>` und `onclick=`-Attribute laufen **nicht** (kein `'unsafe-inline'`). Eine interaktive Seite wirkt dann tot: Knöpfe, Tabs, Diagramme reagieren nicht.
  - CDN-Skripte (Chart.js, Tailwind-CDN, D3) laufen nicht (`'self'` ist der App-Ursprung).
  - Externe Stylesheets (Google Fonts, CDN-CSS) laden nicht; Inline-`<style>` geht.
  - Bilder von `https:` laden nicht; `data:` geht. Schriften nur `data:`.
  - `fetch` auf `https:`-APIs erlaubt die CSP (`connect-src https:`); dann entscheidet CORS.
- **Lokal (Asset-Protokoll):** Das `iframe` lädt ein eigenes Dokument von `asset://`. Dafür vererbt sich die CSP nicht; das Asset-Protokoll sendet laut Upstream-Quelle **keinen** CSP-Header. `frame-src … asset:` lässt das Laden zu. Inline- und CDN-Skripte laufen lokal also wahrscheinlich, remote nicht. **Der User arbeitet fast nur remote.**
- **Dev-Build ist kein Maßstab:** Unter `tauri dev` lädt der Desktop-Webview die Vite-Adresse direkt, die Tauri-CSP greift dort vermutlich nicht. Indiz: die dev-only Test-Bridge führt Schnipsel mit `new Function` aus (`src/lib/testBridge.ts:31`), was `script-src 'self' 'wasm-unsafe-eval'` verbieten würde. Die CSP-Wirkung lässt sich also nur in einem **Release-Build** messen (installierte App oder `pnpm tauri:build:dev-variant`, `TERAX.md:157`). Die Test-Bridge gibt es dort nicht (`src-tauri/src/modules/test_bridge.rs:16-21`).
- **Abhängigkeit Teil A:** Lädt die Remote-Vorschau künftig über einen eigenen Origin (Mini-Server) statt `srcDoc`, entfällt die Vererbung. Es gilt dann die CSP, die dieser Server mitschickt.

### 4.3 Einzelgrenzen

| Grenze | Was der User merkt | Fundstelle | Entscheidung? |
|---|---|---|---|
| `localStorage`/`sessionStorage`/IndexedDB werfen `SecurityError` (opaker Ursprung) | Seiten, die Zustand speichern (Checklisten, Hell/Dunkel), vergessen ihn oder brechen ihr Skript ab | `src/modules/html/HtmlPreviewPane.tsx:35-36` | ja, FS-6 (4.1) |
| Cookies nicht nutzbar | Anmeldung o. Ä. in der Seite geht nicht | ebd. | ja, FS-6 |
| `fetch('daten.json')` lokal | scheitert an CORS: das Asset-Protokoll antwortet mit `Access-Control-Allow-Origin: <Fenster-Ursprung>` (Upstream-Quelle), das opake `iframe` schickt `Origin: null` (ungeprüft für 2.12.5) | `src/modules/html/HtmlPreviewPane.tsx:54-61`; `src-tauri/tauri.conf.json:29-32` | ja, Folge von FS-6 („bricht die Eigen-fetch“) |
| `<script type="module" src=…>` lokal | lädt im CORS-Modus, scheitert wie `fetch` (ungeprüft); klassische `<script src>`, CSS und Bilder laden | ebd. | Folge von FS-6 |
| relative Pfade remote | `src="bild.png"` löst gegen den Basis-URL des Eltern-Dokuments auf (App-Ursprung), lädt also nicht die Datei vom Server | `src/modules/html/HtmlPreviewPane.tsx:22-25` | dokumentierte Grenze |
| CSP remote | 4.2: Skripte tot, CDN, Fonts und externe Bilder fehlen | `src-tauri/tauri.conf.json:28` | **nicht** dokumentiert (ungeprüft) |
| Downloads (`<a download>`, Blob-Export) | Export-Knöpfe tun nichts; Sandbox ohne `allow-downloads`, im Gegensatz zur Web-Vorschau (`src/modules/preview/PreviewPane.tsx:115`) | `src/modules/html/HtmlPreviewPane.tsx:35-36` | nicht kommentiert; Tauri-Download-Behandlung ungeprüft |
| Zwischenablage | „Kopieren“-Knöpfe scheitern womöglich; kein `allow="clipboard-write"`, im Gegensatz zur Web-Vorschau (`src/modules/preview/PreviewPane.tsx:117`) | `src/modules/html/HtmlPreviewPane.tsx:104-116` | nicht kommentiert; WebKit-Verhalten ungeprüft |
| `window.open`, `target=_blank` | `allow-popups` ist gesetzt, `allow-popups-to-escape-sandbox` nicht (Web-Vorschau hat es, `src/modules/preview/PreviewPane.tsx:115`). Kein `on_new_window`- oder Navigations-Handler im Rust-Teil (Suche in `src-tauri/src` leer), es gilt also das Tauri/wry-Standardverhalten: öffnet nichts, ein Tauri-Fenster oder den Browser (ungeprüft) | `src/modules/html/HtmlPreviewPane.tsx:35-36` | teilweise: Top-Navigation bewusst gesperrt (Begründung bei der Web-Vorschau `src/modules/preview/PreviewPane.tsx:109-114`) |
| Links ohne `target` | navigieren **im** `iframe`; externe Seiten laden dort (`frame-src http: https:`), ohne Zurück-Taste; Seiten mit X-Frame-Options bleiben leer | `src-tauri/tauri.conf.json:28` | nicht kommentiert |
| `alert`/`confirm` | Sandbox erlaubt sie (`allow-modals`); ob WKWebView unter Tauri sie anzeigt, ist ungeprüft | `src/modules/html/HtmlPreviewPane.tsx:35` | – |
| Tastatur-Fokus | Nach einem Klick in die Seite gehen Tasten ans `iframe`-Dokument. App-Kürzel (Cmd+W, Tabwechsel, Zen) lauschen am Eltern-Fenster und kommen nicht an, bis man außerhalb klickt. Natives Menü (Beenden) geht weiter (`src-tauri/src/modules/app_menu.rs:45-52`) | `src/modules/shortcuts/lib/useGlobalShortcuts.ts:65` | DOM-Regel, keine Entscheidung |
| Kein Neu laden, keine Dateibeobachtung | Wird die Datei auf dem Server neu erzeugt, zeigt die Vorschau den alten Stand. Neu laden geht heute nur per Raw → Rendered (Tab-Art wechselt, Pane wird neu gemountet: `src/modules/tabs/lib/applyDocView.ts:4-14`, Token je Mount `src/modules/html/HtmlPreviewPane.tsx:38-46`, Remote liest beim Mount, `:71-93`) | ebd. | – |
| Größe | Remote über 10 MB: Meldung statt Vorschau | `src-tauri/src/modules/fs/file.rs:16`, `src/modules/html/HtmlPreviewPane.tsx:133-136` | – |

---

## 5. Bedienelemente

### 5.1 Wer nutzt `DocViewToggle` (belegt)

- Definition: Overlay `absolute right-3 top-3 z-10` (`src/components/ui/DocViewToggle.tsx:19`), Props `mode`, `onChange`, `renderedDisabled`, `renderedHint` (`:5-10`).
- `src/modules/html/HtmlPreviewPane.tsx:102`: Modus `rendered`.
- `src/modules/markdown/MarkdownPreviewPane.tsx:72`: Modus `rendered`.
- `src/modules/editor/EditorStack.tsx:51-58`: Modus `raw` für `.md`/`.html`-Pfade; „Rendered“ gesperrt, solange ungespeichert („Save to preview“).
- Umschalten wechselt die Tab-Art bei gleicher Tab-ID (`src/modules/tabs/lib/applyDocView.ts:4-14`, verdrahtet über `onSetDocView`, `src/app/components/WorkspaceSurface.tsx:37`).

### 5.2 Eigene Kopf-/Bedienelemente je Vorschau-Art

| Art | Kopf | Fundstelle |
|---|---|---|
| HTML | nur Overlay-Umschalter | `src/modules/html/HtmlPreviewPane.tsx:102` |
| Markdown | nur Overlay-Umschalter | `src/modules/markdown/MarkdownPreviewPane.tsx:72` |
| Raw (Editor für .md/.html) | Overlay-Umschalter | `src/modules/editor/EditorStack.tsx:53-58` |
| Web-Vorschau | eigene Adressleiste mit Neu laden, Ports-Menü, „Open in system browser“ (`openUrl`) | `src/modules/preview/PreviewPane.tsx:75-80`, `src/modules/preview/PreviewAddressBar.tsx:138-139`, `:154`, `:220-222` |
| Bild/Audio/Video/PDF (im Editor-Tab) | kein Kopf | `src/modules/editor/EditorPane.tsx` (Binärvorschau, ab ca. `:370`) |

### 5.3 Dateien, die eine gemeinsame schmale Kopfzeile anfassen müsste (nur Liste)

- `src/components/ui/DocViewToggle.tsx` (aus dem Overlay in eine Zeile; Achtung: `src/components/ui/` gilt als shadcn-Ordner, „don't hand-edit“, `TERAX.md:121`, wobei diese Datei eine eigene ist, `672ce69`).
- `src/modules/html/HtmlPreviewPane.tsx:96-116` (Spaltenaufbau, `iframe` unter der Zeile).
- `src/modules/markdown/MarkdownPreviewPane.tsx:66-73`.
- `src/modules/editor/EditorStack.tsx:51-58` (Raw-Seite derselben Zeile).
- `src/modules/doc/DocStack.tsx:15-20`, `:76-81` (Props für Neu laden, Dateiname; heute nur `path`, `workspace`, `visible`, `onSetView`).
- `src/modules/tabs/lib/applyDocView.ts` (falls „Neu laden“ nicht mehr über den Kindwechsel laufen soll).
- `src/app/components/WorkspaceSurface.tsx:137-164` (Polster, falls die Zeile bündig sitzen soll).
- Vorbild für Tasten: `src/modules/preview/PreviewAddressBar.tsx` (Neu laden, Im-Browser-öffnen).
- **Abhängigkeit Teil A:** Die Taste „Im Browser öffnen“ hängt am Ergebnis von Teil A.

---

## 6. Tests

### 6.1 Bestand (belegt; 138 Testdateien im Repo)

| Bereich | Datei | Anzahl |
|---|---|---|
| Wisch-Prüfung | `src/modules/tabs/lib/isInsideHorizontalScroller.test.ts` | 9 (jsdom, Geometrie gestubbt, `:1-31`) |
| Doc-Umschalter | `src/modules/tabs/lib/applyDocView.test.ts` | 9 |
| Markdown-Vorschau | `src/modules/markdown/MarkdownPreviewPane.test.ts` | 2 (nur Streamdown-Konfiguration) |
| Web-Vorschau-Sandbox | `src/modules/preview/PreviewPane.test.ts` | 6 (Quelltext-Prüfung der Sandbox-Tokens) |
| Web-Vorschau-Adressleiste | `src/modules/preview/PreviewAddressBar.test.tsx` | 5 |
| Binärvorschau | `ImagePreview.test.tsx` (4), `MediaPreview.test.tsx` (≥3), `EditorStack.window-hidden.test.tsx` (3), `EditorPane.preview-env.test.tsx` (1), `binaryPreview.test.ts` | – |
| Tab-Wechsel/-Reihenfolge | `src/modules/tabs/lib/*.test.ts(x)` (u. a. `nextActiveInSpace`, `pickTabBySpaceIndex`, `useTabs.groups`, `useTabs.overview`) | mehrere Dateien |

**Ohne Test:** `HtmlPreviewPane.tsx`, `DocStack.tsx`, `WorkspaceSurface.tsx`, `useTabSwipe.ts`, `swipeTab` in `App.tsx` (INV-12 als „uncovered“ geführt, `specs/2026-11-23-tab-groups/codebase-scan.md:147`), der Rust-Monitor (`src-tauri/src/lib.rs:68-131`). Kein Test erwähnt `wheel` außer dem Dateinamen oben.

### 6.2 Was jsdom/Vitest abbilden kann

| Frage | jsdom/Vitest | nur laufende App |
|---|---|---|
| 1 Breite | Klassen und Aufbau (welche Schicht hat welches Polster, Zen blendet was aus) | echte Breiten, Zoom, Dokument-`max-width`, Ampel-Knöpfe |
| 2 Wischen | reine Entscheidungsregel (`isInsideHorizontalScroller`, eine künftige Regel „über Vorschau nachgeben“), `swipeTab`-Reihenfolge | Rust-Schwellen, Gestenphasen, Hover über `iframe`, gleichzeitiges Scrollen im `iframe` |
| 3 Hänger | nichts Wesentliches (jsdom hat kein Layout, kein Scrollen, kein Latching) | alles, siehe Experimente |
| 4 Artefakte | Sandbox-Tokens und `allow`-Attribut als Quelltext- oder DOM-Prüfung (wie `PreviewPane.test.ts`) | CSP-Vererbung, Speicher-Fehler, CORS, Popups, Downloads, Zwischenablage, Fokus |

---

## 7. Nicht messbar auf der Werkbank: Experimente für den Mac

Allgemein: CSP-Fragen (E9, E10) nur im **Release-Build** (installierte App oder `Terax Dev.app` aus `pnpm tauri:build:dev-variant`). Scroll-Fragen gehen in beiden. Die Test-Bridge gibt es nur im Debug-Build mit `TERAX_TEST_BRIDGE=<ordner>` (`src-tauri/src/modules/test_bridge.rs:1-21`): Schnipsel als `cmd-<id>.js` in den Ordner legen, Antwort kommt als `res-<id>.json`. Web Inspector: Safari → Entwickler → Terax (nur wenn der Build Inspektion zulässt, ungeprüft für Release).

- **E1 Wisch-Einstellung aus (prüft H1, H7):** Einstellungen → General → „Trackpad swipe to switch tabs“ aus. Einen Tag normal arbeiten. Kommt der Hänger nie mehr, hängt er am Wischen.
- **E2 Wischen mitten in der Geste (H1):** Zwei Tabs: A = HTML-Bericht mit breiter Tabelle (remote), B = Terminal. In A über der Tabelle waagerecht wischen und die Finger **liegen lassen**, dann senkrecht weiterziehen. Erwartung unter H1: Tab springt nach B, das senkrechte Weiterziehen bewegt nichts; Finger heben und neu ansetzen scrollt wieder. Zusätzlich: wechselt der Tab, obwohl die Tabelle noch Platz zum Scrollen hatte? (bestätigt 2.2)
- **E3 Dokument-Scrollbereich (H2):** Dieselbe Datei in Safari öffnen. Scrollt sie dort auch nur über einem Teilbereich, liegt es am Dokument.
- **E4 Stapel-Reihenfolge (H3):** HTML-Tab X öffnen, danach HTML-Tab Y. Auf X wechseln (per Klick in der Tab-Leiste, nicht per Wischen), Zeiger über die Mitte, senkrecht scrollen. Dann Y schließen und wiederholen. Hängt es nur, solange Y offen ist, ist H3 bestätigt. Gegenprobe mit einem offenen Git-History-Tab (oberste Schicht). Im Debug-Build zusätzlich per Test-Bridge: `const e=document.elementFromPoint(innerWidth/2, innerHeight/2); return e && (e.tagName + ' ' + (e.title||''))`; muss das `iframe` des aktiven Tabs zeigen.
- **E5 Zeiger nicht bewegen (H4):** Per Klick auf einen HTML-Tab wechseln, Zeiger danach **nicht** bewegen, Hand neu aufs Trackpad, senkrecht scrollen. Hängt es: Zeiger um 1 px bewegen, ohne zu klicken, erneut scrollen. Löst die Bewegung es, ist H4 bestätigt.
- **E6 Vorschau-Art (H4 vs. Rest):** E2 und E5 mit einer Markdown-Datei wiederholen. Tritt es nur bei HTML auf, spricht das für H4; bei beiden für H1/H3.
- **E7 Fokus (H5):** Nach dem Wechsel auf einen HTML-Tab Pfeil-ab und Leertaste drücken. Scrollt nichts, oder landen Zeichen im vorigen Terminal? Danach in die Seite klicken und wiederholen. Debug-Build: Test-Bridge `return document.activeElement?.outerHTML.slice(0,120)`.
- **E8 Überlagerungen (H6):** Prüfen, ob beim Hänger das KI-Mini-Fenster offen ist oder eine Gruppe gerade ein-/ausgeklappt wurde. Debug-Build: `return [...document.querySelectorAll('.fixed')].map(e=>e.className.slice(0,60))`.
- **E9 CSP in der Remote-Vorschau (B4, 4.2):** Auf dem Server eine Datei `csp-test.html` anlegen: `<p id=a>Inline aus</p><script>document.getElementById('a').textContent='Inline an'</script><script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js"></script><p id=b></p><script>setTimeout(()=>{document.getElementById('b').textContent= typeof dayjs})</script><img src="https://www.gstatic.com/images/branding/product/1x/googleg_48dp.png">`. Im Release-Build als Remote-Vorschau öffnen. Steht „Inline aus“, greift die vererbte CSP. Dieselbe Datei lokal öffnen und vergleichen.
- **E10 Speicher, fetch, Popups, Downloads, Zwischenablage (4.3):** Testseite mit je einem Knopf für `localStorage.setItem`, `fetch('csp-test.html')`, `window.open('https://example.com')`, `<a target=_blank>`, Blob-Download, `navigator.clipboard.writeText`, `alert`. Lokal **und** remote, Ergebnis je Knopf auf die Seite schreiben (remote nur, wenn E9 Inline-Skripte erlaubt). Ausgang je Zeile notieren.
- **E11 Breite (1.3):** Unterscheidung wie in 1.3, Schritte 1 bis 4; einmal mit eingeklappter Leiste und Zen-Modus (Mod+Shift+').

---

## Offene Fragen

1. **Wischen über der HTML-Vorschau** (`fachlich`). Heute wechselt ein waagerechtes Wischen über einer HTML-Seite immer den Tab, auch wenn du eigentlich eine breite Tabelle zur Seite schieben willst. Die App kann nicht in die Seite hineinsehen.
   - a) bleibt wie heute
   - b) über der HTML-Vorschau wechselt Wischen nie den Tab; Tabwechsel per Wischen über der Tab-Leiste, per Tastatur oder Klick
   - c) Tabwechsel per Wischen überall nur noch, wenn die Geste in der Tab-Leiste beginnt
   - d) die Seite meldet der App, ob sie gerade waagerecht scrollen kann (aufwendig, scheitert vermutlich an 4.2)
   - **Empfehlung: b**, weil sie den Konflikt mit einem Attribut beseitigt, das Wischen in allen anderen Tabs behält und nichts an Rust oder der Sicherheit ändert.

2. **Was tust du, wenn das Scrollen hängt?** (`fachlich`). Die Ursache hängt davon ab, was den Hänger löst.
   - a) Zeiger ein Stück bewegen reicht
   - b) erst in die Seite klicken
   - c) Finger heben und neu ansetzen
   - d) erst zurück in den richtigen Tab wischen oder klicken
   - **Empfehlung:** zuerst E1 (Wisch-Einstellung einen Tag aus), denn verschwindet der Hänger damit, ist die wahrscheinlichste Ursache (H1) bestätigt und mit Frage 1 gleich mit gelöst.

3. **Vorschau über das ganze Fenster** (`fachlich`). Rechts ist nichts im Weg außer 12 px Rand; Platz gewinnt man nur, wenn Leiste, Kopf, Statusleiste, Eingabe und Ränder weichen. Ein Zen-Modus existiert (Mod+Shift+'), blendet aber nur Kopf und Statusleiste aus.
   - a) Zen-Modus ausbauen: zusätzlich Seitenleiste, Ränder und Eingabe weg
   - b) eigene Taste „Vorschau maximieren“ nur für Vorschau-Tabs
   - c) nur Ränder und Rahmen der Vorschau entfernen
   - d) nichts ändern; für volle Breite „Im Browser öffnen“ aus Teil A
   - **Empfehlung: a**, weil der Modus samt Kürzel schon da ist und dann für alle Tab-Arten gleich wirkt; vorher E11 am Mac, ob das Dokument selbst schmal ist.

4. **Skripte in Remote-Artefakten (CSP)** (`technisch`). Wahrscheinlich laufen in der Remote-Vorschau gar keine Skripte, weil die Schutzregel der App auf die eingebettete Seite durchschlägt. Lokal laufen sie.
   - a) erst E9 messen, dann entscheiden
   - b) Remote-Vorschau über einen eigenen Ursprung laden (hängt an Teil A, Mini-Server) statt `srcDoc`
   - c) Remote-Datei auf dem Mac zwischenspeichern und über das Asset-Protokoll laden wie lokal
   - d) die App-CSP lockern (nicht ratsam, schwächt den Schutz der App)
   - **Empfehlung: a, dann b**, weil b mit Teil A ohnehin entsteht und lokal und remote gleich macht, ohne die App-CSP anzufassen.

5. **Speicher und `fetch` für Artefakte** (`technisch`). Seiten können sich nichts merken und keine Nachbardateien nachladen. Das ist eine dokumentierte Sicherheitsentscheidung (FS-6), kein Fehler.
   - a) bleibt so; solche Seiten im Browser öffnen
   - b) in der eigenen Vorschau-Herkunft aus Teil A Speicher erlauben, getrennt von der App
   - c) `allow-same-origin` wieder setzen (widerspricht FS-6)
   - **Empfehlung: a**, bis Teil A steht, weil b davon abhängt und c eine bewusst geschlossene Lücke wieder öffnet.

6. **Popups, Downloads, Zwischenablage** (`technisch`). Die HTML-Vorschau darf weniger als die Web-Vorschau (kein Download, kein Ausbruch für Popups, keine Zwischenablage-Freigabe). Was genau geht, ist ungemessen.
   - a) erst E10 messen
   - b) an die Web-Vorschau angleichen (`allow-downloads`, `allow-popups-to-escape-sandbox`, `clipboard-write`)
   - c) bleibt; dafür „Im Browser öffnen“
   - **Empfehlung: a**, weil jede Freigabe eine Sicherheitsabwägung braucht und erst die Messung zeigt, welche Grenze dich wirklich trifft.

7. **Gemeinsame Kopfzeile für Vorschauen** (`fachlich`). Heute schwebt Rendered/Raw über dem Inhalt und verdeckt ihn oben rechts; Neu laden gibt es nur über Raw → Rendered.
   - a) schmale Zeile über HTML, Markdown und Raw: Dateiname, Neu laden, Rendered/Raw, Im Browser öffnen
   - b) Overlay bleibt, nur eine Neu-laden-Taste dazu
   - c) Overlay nur bei Mausbewegung einblenden
   - **Empfehlung: a**, weil die Zeile den Platz für Teil A ohnehin braucht und das Verdecken beendet; sie kostet eine Zeilenhöhe.

8. **Absicherung durch Tests** (`technisch`). Die meisten Fragen lassen sich nur in der laufenden App prüfen.
   - a) Entscheidungsregeln als reine Funktionen mit Vitest plus Mac-Checkliste E1–E11
   - b) zusätzlich Skripte über die Test-Bridge (nur Debug-Build, ohne CSP)
   - c) nur manuell
   - **Empfehlung: a**, weil die Regel billig abzusichern ist und Gesten wie CSP ohnehin nur am Mac und teils nur im Release-Build messbar sind.

---

## Quellen außerhalb des Repos

- Tauri, Asset-Protokoll (Branch `dev`, Header `Access-Control-Allow-Origin: <window_origin>`, kein CSP-Header): https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri/src/protocol/asset.rs
- Tauri, `tauri://`-Protokoll (CSP als Antwort-Header; Dev-Proxy nur `all(dev, mobile)`): https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri/src/protocol/tauri.rs
- WebKit-Bug 224745 „Adhere to policy inheritance according to policy container“ (resolved fixed): https://bugs.webkit.org/show_bug.cgi?id=224745
- WebKit-Bug 223848 (Sandbox ohne `allow-same-origin` und `'self'`, laut Melder in Safari 17 behoben): https://bugs.webkit.org/show_bug.cgi?id=223848
- Mozilla-Bug 1280308 (CSP bei sandboxed `srcdoc`, historisch): https://bugzilla.mozilla.org/show_bug.cgi?id=1280308

Alle drei Tauri/WebKit-Aussagen sind gegen den Upstream-Stand gelesen, nicht gegen Tauri 2.12.5 / wry 0.57.1 aus `src-tauri/Cargo.lock`, und gelten bis E9/E10 als ungeprüft.
