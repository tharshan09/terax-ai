# Post-Implement Review Report — Teil 3: Naht im Frontend (slice-03 Zen/Wischen × slice-04 Kopfzeile/Panes)

**Feature:** HTML-Vorschau im Browser, Welle 1
**Branch:** `html-preview-browser` (Code-Stand `f180fa8`)
**Default-Branch / Basis:** `cf07327`
**Datum:** 2026-11-25
**Perspektive:** `quality+alignment` (Teil A + Teil B), nur die Naht zwischen slice-03 und slice-04 am gemergten Code
**Prüfmenge:** `src/app/App.tsx`, `src/app/components/{WorkspaceSurface,WorkspaceInputBar}.tsx`, `src/modules/zen/**` (ohne Tests), `src/modules/tabs/lib/{tabSwipe,useTabSwipe}.ts`, `src/modules/sidebar/useSidebarPanel.ts`, `src/modules/doc/{PreviewHeader.tsx,lib/previewHeader.ts}`, `src/modules/html/HtmlPreviewPane.tsx`, `src/modules/markdown/MarkdownPreviewPane.tsx`, `src/modules/editor/{EditorPane,EditorStack,AiDiffPane,GitDiffPane}.tsx`, `src/modules/preview/PreviewPane.tsx`, `src/modules/doc/DocStack.tsx` (Bestand, Aufrufer)

---

## Summary

**Urteil (Fan-out-Maßstab): PASSED** — kein `decision`- und kein `refuted`-Befund.
(Nach der binären Regel des Reviewer-Vertrags hieße das wegen 9 nicht blockierender Befunde `FAILED`. Laut Brief gilt hier der Fan-out-Maßstab.)

Wichtigstes Ergebnis: Die beiden Slices passen an der Naht zusammen. Die Regel aus slice-03 „ist das ein Vorschau-Tab?“ (`zenEscape.ts`) und die Regel aus slice-04 „bekommt die Fläche eine Kopfzeile mit Zen-Taste?“ (`previewHeader.ts`) geben nur für eine Dateiklasse verschiedene Antworten, die keine bekannte Grenze schon abdeckt: SVG-Dateien, die der Editor als Bild zeigt (F3-01). Rahmen, Wisch-Attribut, Props und Scharfschalten stimmen. Die Vermutung aus Punkt 6 (viele wiederhergestellte HTML-Tabs fragen unsichtbar den Mini-Server an) trifft nicht zu (F3-09).

### Part A: Code Quality

| Kriterium | Findings |
|-----------|----------|
| A.1 Logic Errors | 3 (F3-02 fix, F3-04 obligation, F3-05 obligation) |
| A.2 Error Handling | 0 |
| A.3 Security | 0 |
| A.4 Anti-Patterns | 0 |
| **Subtotal** | **3** |

### Part B: Codebase Alignment

| Kriterium | Findings |
|-----------|----------|
| B.1 Duplicate Solution Paths | 1 (F3-01 fix) |
| B.2 Abstraction Reuse | 0 |
| B.3 Schema Consistency | 0 |
| B.4 Dead Code / Unused Imports | 0 |
| B.5 Error Handling Divergence | 0 |
| B.6 Configuration Drift | 0 |
| B.7 Interface Inconsistency | 4 (F3-03 obligation, F3-06 note, F3-07 note, F3-08 note) |
| B.8 Dependency Direction | 0 |
| B.9 Security Pattern Consistency | 0 |
| B.10 Performance Pattern Consistency | 1 (F3-09 note) |
| **Subtotal** | **5** |

| **Total** | **9** (0 blockierend · 2 fix · 3 obligation · 4 note) |

---

## Punkt 1: Tabelle Fläche × Zen-Verhalten (am gemergten Code)

Woher die Spalten kommen:
- **Kopfzeile mit Zen-Taste:** `previewHeaderModel` setzt `zen: true` für jede Fläche (`src/modules/doc/lib/previewHeader.ts:47-66`). Ob eine Fläche eine Kopfzeile bekommt, entscheiden `HtmlPreviewPane.tsx:183-192`, `MarkdownPreviewPane.tsx:98-107`, `EditorStack.tsx:82-104` über `rawHeaderSurface` (`previewHeader.ts:70-73`) und `EditorPane.tsx:464-481` über `binaryHeaderSurface` (`previewHeader.ts:79-84`, nutzt `IMAGE_EXTS` **mit** `svg`, `binaryPreview.ts:5-13`), und zwar nur im Zweig für Binärdateien und zu große Dateien (`EditorPane.tsx:448`).
- **Esc verlässt Zen** (gleichbedeutend mit „Monitor scharf“): `ESC_IN_ZEN` und `EDITOR_PREVIEW_EXTS` (`src/modules/zen/lib/zenEscape.ts:16-46`, `IMAGE_EXTS` **ohne** `svg`, dazu `pdf`). `useZenEscape.ts:47-62` ruft `zen_escape_arm` mit `zenEscapeArmed(on, activeTab)` (`App.tsx:976`).
- **Eingabezeile im Zen verborgen:** `INPUT_BAR_IN_ZEN` (`zenChrome.ts:35-45`). Das ergibt `hiddenInZen={!chrome.inputBar}` (`App.tsx:1833`) und das Attribut `hidden` (`WorkspaceInputBar.tsx:196`).
- **Rahmen im Zen weg:** `usePaneFrameClass` (`usePaneFrameClass.ts:12-15`) in jeder Pane; das Polster `px-3 pt-2 pb-2` fällt in `WorkspaceSurface.tsx:87-90` weg.
- **Wischen wechselt den Tab:** `useTabSwipe.ts:36-44`. Ziel ist das letzte Element von `:hover`; danach prüft `isInsideHorizontalScroller` (`tabSwipe.ts:25-44`, Attribut in Zeile 32) und dann `defersToActivePreview` (`tabSwipe.ts:52-57`, nur `html` mit Ziel `null`), siehe `App.tsx:1214-1220`.

| # | Fläche | Tab-Art (Eingang der Esc-Regel) | Kopfzeile mit Zen-Taste? | Esc verlässt Zen? (Monitor scharf) | Eingabezeile im Zen verborgen? | Rahmen im Zen weg? | Wischen wechselt den Tab? | Widerspruch an der Naht |
|---|---|---|---|---|---|---|---|---|
| 1 | HTML rendered (lokal/SSH, Server- oder Rückfall-Weg, auch „Loading…“/Fehler) | `html` | ja | ja | ja | ja (`HtmlPreviewPane.tsx:179`) | **nein**: `data-no-tab-swipe` nur an der sichtbaren Pane (`:176`), Rückfall bei Ziel `null` | – |
| 2 | HTML raw | `editor`, `*.html` | ja (Neu laden, Rendered/Raw, Open in Browser, Zen) | nein (Code-Tab nach Q&A 2) | ja | ja (`EditorStack.tsx:84-88`) | ja (außer CodeMirror kann waagerecht scrollen) | so gewollt (SVC-14 + SVC-16/Q&A 2), F3-06 |
| 3 | Markdown rendered | `markdown` | ja (ohne Open in Browser, Welle 1) | ja | ja | ja (`MarkdownPreviewPane.tsx:94`) | ja (außer breite Tabelle mit Platz) | – |
| 4 | Markdown raw | `editor`, `*.md` | ja | nein | ja | ja | ja | so gewollt, F3-06 |
| 5 | Bild im Editor (png/jpg/jpeg/gif/webp/ico, lokal) | `editor` | ja, sobald angezeigt; **nicht** während „Loading…“ und bei Lesefehler (`EditorPane.tsx:434-462`) | ja | ja | ja (`EditorStack.tsx:109-115`) | ja | – (Laden/Fehler ohne Kopfzeile ist bekannte Grenze von slice-04, Esc wirkt dort) |
| 6 | PDF im Editor (lokal, echt) | `editor`, `*.pdf` | ja | ja | ja | ja | ja (PDF-Rahmen ohne Attribut) | – (Esc bei Fokus in der PDF: F3-05) |
| 6a | PDF lokal, Echtheit nicht bestätigt (Karte) | `editor`, `*.pdf` | ja | ja | ja | ja | ja | – |
| 7 | PDF über SSH (Karte „preview not available over SSH“) / Bild über SSH | `editor` | ja (`EditorPane.tsx:524-547` bzw. `:486-493`) | ja | ja | ja | ja | – |
| 8 | Bild über der Lesegrenze (> 10 MiB) | `editor` | ja (lokal Bild, über SSH „File too large to preview over SSH“) | ja | ja | ja | ja | – |
| 9 | SVG als Text (gültiges UTF-8, ≤ 10 MiB) | `editor`, `*.svg` | nein (CodeMirror) | nein | ja | ja | ja | – (bekannte Grenze) |
| 10 | **SVG im Binärzweig** (kein gültiges UTF-8, NUL-Byte oder > 10 MiB; lokal als Bild, über SSH „Image preview unavailable“) | `editor`, `*.svg` | **ja** (`binaryHeaderSurface` gibt `"image"`) | **nein** (`svg` ausgenommen) | ja | ja | ja | **F3-01** |
| 11 | Datei mit Bild-/PDF-Endung, aber Text-Inhalt | `editor`, z. B. `*.png` | nein (CodeMirror) | **ja** | ja | ja | ja | bekannte Grenze „entscheidet nach der Endung“ (slice-03), an der Naht nicht schlimmer |
| 12 | Normale Code-Datei | `editor` | nein | nein | ja | ja | ja (außer lange Zeilen) | – (Ausweg nur das Kürzel, F3-07) |
| 13 | Video/Audio | `editor` | nein | nein | ja | ja | ja | – (F3-07) |
| 14 | Terminal | `terminal` | nein | nein (Programm) | **nein** (bleibt) | Pane hat keinen Rahmen; Polster weg | ja | – |
| 15 | Git-Diff (`git-diff`, `git-commit-file`) | `git-diff` | nein (eigene Leiste ohne Zen-Taste) | nein | ja | ja (`GitDiffPane.tsx:130`, `:250-252`) | ja | – |
| 16 | KI-Diff | `ai-diff` | nein (eigene Leiste) | nein | ja | ja (`AiDiffPane.tsx:95`, `:140-142`) | ja | – |
| 17 | Web-Vorschau | `preview` | nein (Adressleiste ohne Zen-Taste) | nein | ja | ja (`PreviewPane.tsx:38`, `:72-75`) | ja | – (F3-07) |
| 18 | Git-Verlauf (zur Vollständigkeit) | `git-history` | nein | nein | ja | Pane hat keinen Rahmen; nie Polster | ja | – |

Zu den Fragen im Brief:
- **Fläche mit Zen-Taste, in der Esc den Zen nicht verlässt:** Raw (Zeilen 2 und 4) ist so entworfen: SVC-14 gibt Raw die Zen-Taste, SVC-16/Q&A 2 geben Esc im Code-Tab an CodeMirror/Vim. Die Taste ist dort der sichtbare Ausgang (Q&A 1, Q&A 5). Ein echter Widerspruch zwischen den beiden Regeln besteht nur bei Zeile 10 (F3-01).
- **Umgekehrt (Esc verlässt Zen, keine Kopfzeile):** Zeile 11 und Bild/PDF während Laden/Fehler (Zeile 5). Beides steht als bekannte Grenze in „Wie gebaut“ und ist an der Naht nicht schlimmer.
- **Zählt die Raw-Ansicht als Vorschau?** Für die Kopfzeile ja (`PreviewSurface` enthält `"raw"`), für Esc, Eingabezeile und Wischen nein. Esc und Eingabezeile folgen der Tab-Art `editor`. Fürs Wischen fehlen das Attribut und die Tab-Art `html`.
- **Bild über der Lesegrenze:** stimmt überein (Zeile 8), außer bei SVG (Zeile 10).

## Punkt 2: Scharfschalten des macOS-Monitors

`zen_escape_arm` läuft nur aus `useZenEscape.ts:58-62`, mit Abhängigkeit `[armed]`. Scharf ist der Monitor genau für die Zeilen der Tabelle mit „Esc verlässt Zen: ja“. Er passt zur Kopfzeilen-Spalte bis auf die schon genannten Zeilen 2/4 (gewollt), 5 (Laden/Fehler), 10 (F3-01) und 11.

- **Rendered → Raw:** `applyDocView` macht aus `html` ein `editor` mit derselben Id (`applyDocView.ts:30-43`). `armed` kippt auf `false`, die Aufräumfunktion schickt `zen_escape_arm(false)`. Raw → Rendered schickt `true`. Das stimmt.
- **Neu laden (HTML):** `armed` ändert sich nicht, also kein IPC und der Schalter in Rust bleibt `true`. Der Rahmen wird neu aufgebaut: auf dem Server-Weg über `key={reloadSeq}` (`HtmlPreviewPane.tsx:194-196`), beim Asset-Weg über `setAssetSrc(null)` und den Platzhalter (`:116`, `:203`), bei `srcDoc` über `status: loading` (`:137`, `:211`). Ein Fokus im alten Rahmen fällt dabei ans App-Dokument zurück, dann greift der DOM-Weg (`useZenEscape.ts:78-84`). Es entsteht keine Lücke.
- **Wechsel des Ladewegs (Server ↔ Rückfall):** Es entsteht ein anderes `iframe`-Element, `armed` bleibt gleich. Das stimmt.
- **Zweite Datei im Zen:** `armed` wird aus dem aktiven Tab neu berechnet. Von HTML zu HTML bleibt der Schalter ohne IPC an, von HTML zu Code geht er aus, von Terminal zu einer per Link geöffneten HTML-Datei geht er an. Das stimmt.
- **Zen über die Zen-Taste aus** führt zu `armed=false` und schaltet den Monitor ab.

## Punkt 3: Zen-Taste in der Kopfzeile, `pl-20`, Ziehbereich

- Alle vier Kopfzeilen setzen `<ZenToggleButton />` ein (`HtmlPreviewPane.tsx:191`, `MarkdownPreviewPane.tsx:106`, `EditorStack.tsx:103`, `EditorPane.tsx:475`). `model.zen` ist immer `true`, und `PreviewHeader.tsx:82` rendert den Slot. Die Taste schaltet `useZenStore.toggleZen` (`ZenToggleButton.tsx:22-33`), also denselben Store wie das Kürzel (`App.tsx:972`, `:1113`) und Esc (`useZenEscape.ts:66-75`). **Einen Eintrag in der Befehlspalette gibt es nicht** (so geplant, slice-03 „Nicht in diesem Slice“). Die Annahme im Brief („… und die Befehlspalette“) trifft daher nicht zu.
- Es gibt Flächen ohne Kopfzeile, ohne Esc und ohne sichtbaren Hinweis: die Zeilen 9 und 12–18. Q&A 2 hat das entschieden (Ausgang Mod+Shift+'). Siehe F3-07.
- `pl-20` gilt bei `zenOn && IS_MAC` (`PreviewHeader.tsx:38`, `:44`). `IS_MAC` kommt aus `platform()` von `@tauri-apps/plugin-os` beim Laden des Moduls und fällt bei einem Fehler auf „nicht Mac“ zurück (`src/lib/platform.ts:3-11`). Der Abstand wächst und schrumpft aber mit dem App-Zoom, der App-Kopf als Vorbild nicht (F3-02).
- Ziehbereich: Im Zen gibt es keinen. Alle `data-tauri-drag-region` liegen im App-Kopf (`Header.tsx:133`, `:174`, `:213`; `TabBar.tsx:887`), und der fehlt im Zen (`App.tsx:1674`). Die Kopfzeile trägt keinen. Es überdeckt also nichts das andere, das Fenster lässt sich im Zen aber nicht ziehen. Das war schon auf der Basis so (`cf07327:src/app/App.tsx:1634`). F3-08.

## Punkt 4: Rahmenklassen

Keine feste Rahmenklasse ist stehen geblieben, keine ist doppelt. Alle sechs Panes nehmen Rahmen und Ecken aus `usePaneFrameClass`: `PreviewPane.tsx:38/74`, `GitDiffPane.tsx:130/250-252`, `AiDiffPane.tsx:95/140-142`, `HtmlPreviewPane.tsx:57/179`, `MarkdownPreviewPane.tsx:39/94`, `EditorStack.tsx:49/86/112`. Die äußeren Schichten tragen keinen Rahmen: `WorkspaceSurface.tsx` hat nur Polster, `DocStack.tsx:69-75` und die Stacks für Web-Vorschau, Git-Diff und KI-Diff ebenfalls keinen. Die Kopfzeile von Bild und PDF in `EditorPane.tsx:469` liegt im Rahmen des `EditorStack` und hat keinen eigenen. Eine doppelte Kopfzeile ist unmöglich: `rawHeaderSurface` (md/markdown/mdx/html/htm) und `binaryHeaderSurface` (Bild/PDF) schließen sich nach der Endung gegenseitig aus. Was im Zen an Linien bleibt, sind Trennlinien und keine Rahmen: `border-b` der Kopfzeile, der Umschalter `DocViewToggle.tsx:19` und `ImagePreview.tsx:54` am Bild selbst.

## Punkt 5: Wischen

Der Weg im Code: Rust schickt `terax:tab-swipe`, dann bildet `useTabSwipe.ts:40-41` das Ziel als `document.querySelectorAll(":hover")` des **App-Dokuments** und nimmt davon das letzte, also tiefste Element. Es gibt kein `elementFromPoint`. Steht der Zeiger über dem Rahmen und nimmt WebKit das `iframe`-Element in die Hover-Kette des App-Dokuments auf, ist das `iframe` das Ziel. Sein `parentElement` ist direkt das äußere Pane-Element mit `data-no-tab-swipe` (`HtmlPreviewPane.tsx:175-176`, `:193-217`), sodass `isInsideHorizontalScroller` das Attribut im ersten Schritt nach oben findet, lange vor der Grenze `appRootRef` (`App.tsx:1671`). Liefert `:hover` nichts, greift `defersToActivePreview("html", null)`. Über der Kopfzeile und dem Platzhalter liegt das Ziel ebenfalls in der Pane. Ungedeckt bleibt nur ein Ziel, das nicht `null` ist, aber außerhalb der Pane liegt, etwa ein veraltetes Hover-Ziel. Das lässt sich nur am Mac klären (F3-04).

- Raw-Ansicht einer HTML-Datei: Tab-Art `editor`, kein Attribut, Wischen wechselt (außer CodeMirror kann waagerecht scrollen). Laut Architektur ist das so (K15, Q&A 25: das Attribut sitzt an der HTML-Pane). F3-06.
- Markdown: kein Attribut, `defersToActivePreview` ist `false`, Wischen wechselt; breite Tabellen bleiben über `isInsideHorizontalScroller` erkannt (`MarkdownPreviewPane.tsx:108`). Das stimmt.
- Mehrere eingehängte HTML-Panes: Das Attribut hängt an `visible` (`HtmlPreviewPane.tsx:176`), und `visible = t.id === activeId` (`DocStack.tsx:112`). Es trägt also nur die sichtbare Pane. Versteckte Schichten haben zusätzlich `invisible pointer-events-none` (`DocStack.tsx:70-73`, `HtmlPreviewPane.tsx:180`) und können gar nicht unter dem Zeiger liegen.

## Punkt 6: `DocStack`/`EditorStack` als Aufrufer

- Props: `DocStack.tsx:76-81` reicht `path`, `workspace` (Tab-Wert, beim Öffnen festgelegt), `visible` je Tab und `onSetView` (je Tab, ruft `onSetDocView(tab.id, mode)`, das ist `setDocView` → `applyDocView`, wechselt die Tab-Art). Das passt zu `Props` in `HtmlPreviewPane.tsx:25-30` und `MarkdownPreviewPane.tsx:21-29`. `EditorStack.tsx:61-73` reicht `visible` und `workspace` an `EditorPane`, die Raw-Kopfzeile bekommt `tab.workspace` und `setView`. Das stimmt.
- Anfragen an den Mini-Server: Jede eingehängte HTML-Pane fragt beim Einhängen einmal an, sichtbar oder nicht (`HtmlPreviewPane.tsx:76-104`). **Nach einem Neustart hängt aber höchstens eine HTML-Pane ein.** Alle wiederhergestellten Tabs sind `cold` (`src/modules/spaces/lib/serialize.ts:261-269`), `DocStack` filtert `!t.cold` (`DocStack.tsx:96-100`), und warm wird nur der gerade aktivierte Tab (`useTabs.ts:770-779`). Jede versteckte eingehängte Pane war also beim Einhängen sichtbar. Für dieselbe Datei verwendet der Server die Freigabe wieder, und die Grenze von 256 zählt nur neue Freigaben (`preview_server/mod.rs:582-592`). Neue Anfragen entstehen nur beim Umschalten Rendered ↔ Raw (Pane wird neu eingehängt) und bei Neu laden auf dem Rückfall-Weg (V1). F3-09.

## Punkt 7: Eingabezeile, Seitenleiste, KI-Leiste, Fokus

- Keine Fläche ist doppelt oder fehlt. Im Zen bleibt über der Vorschau genau eine Leiste, nämlich die Kopfzeile. Der App-Kopf (`App.tsx:1674`), die Statusleiste und der Griff fallen weg. Die Eingabezeile bleibt eingehängt und ist nur verborgen; das `[hidden]` aus dem Tailwind-Preflight mit `!important` schlägt `.terax-reveal{display:grid}`. Die KI-Umschaltung ist dort gesperrt (`App.tsx:1088-1095`, `:1546-1549`). Die Seitenleiste klappt ein, ohne den Zustand zu speichern (`useSidebarPanel.ts:113-145`). Keine der neuen Kopfzeilen bietet eine KI- oder Seitenleisten-Taste.
- Fokus beim Zen-Ende: Ein Zen-Wechsel ändert in den Panes nur Klassen und hängt nichts neu ein. Die Zen-Taste in der Kopfzeile behält deshalb den Fokus über Ein- und Austritt (gleiches Element). Esc lässt den Fokus, wo er war, auch im `iframe`. Der Rahmen bleibt beim Zen-Wechsel derselbe Knoten, also gibt es keine neue Anfrage an den Mini-Server.
- Beobachtung ohne Befund (betrifft nur slice-03, keine zweite Seite an der Naht): Liegt der Fokus beim Eintritt in den Zen in der KI-Eingabe eines Vorschau- oder Code-Tabs, wird das Feld per `hidden` ausgeblendet (`WorkspaceInputBar.tsx:196`). Es gibt keine Fokus-Führung, und nach dem Zen-Ende bekommt das Feld den Fokus nicht zurück. Am Mac lohnt eine Zeile: „Wohin gehen Tastendrücke?“

---

## Befunde (JSON)

```json
[
  {
    "id": "F3-01",
    "category": "B.1",
    "class": "fix",
    "claim": "Für eine SVG-Datei, die der Editor als Bild zeigt (kein gültiges UTF-8, NUL-Byte oder über 10 MiB), antworten die beiden Regeln auf „ist das eine Vorschau?“ verschieden: slice-04 zeigt eine Kopfzeile mit Zen-Taste (binaryHeaderSurface nimmt IMAGE_EXTS samt svg), slice-03 schaltet den Monitor nicht scharf, Esc verlässt den Zen nicht (EDITOR_PREVIEW_EXTS ohne svg). Der Kommentar in zenEscape.ts („SVG … is text, so the editor opens it in CodeMirror“) und die Grenzen „Eine SVG öffnet im Editor als Text und hat deshalb keine Kopfzeile“ (build-plan.md:1040, obligations.md:38) sind für diese Dateien falsch. Nicht blockierend: Die Esc-Seite fällt unter die bekannte Grenze „Die Esc-Regel entscheidet nach der Endung“ (build-plan.md:849), und die Zen-Taste der Kopfzeile ist dort ein sichtbarer Ausgang. An der Naht ist es also nicht schlimmer als beschrieben.",
    "evidence": "slice-03: src/modules/zen/lib/zenEscape.ts:28-36 (Kommentar und Set ohne svg), :38-46, :52-57; slice-04: src/modules/doc/lib/previewHeader.ts:75-84 (IMAGE_EXTS mit svg), src/modules/editor/EditorPane.tsx:448-454, :464-493; gemeinsame Quelle: src/modules/editor/lib/binaryPreview.ts:5-13 (svg in IMAGE_EXTS), :85, :90 (svg → \"image\" lokal und über SSH); Einordnung: src-tauri/src/modules/fs/file.rs:109-114 (> 10 MiB → TooLarge), :122-133 (NUL oder kein UTF-8 → Binary)",
    "evidence_source": "code",
    "expected_observation": "zenEscapeArmed(true, { kind: \"editor\", path: \"a.svg\" }) === false, während EditorPane für a.svg mit doc.status \"binary\" oder \"toolarge\" eine Kopfzeile mit [data-preview-header] und der Taste „Toggle zen mode“ rendert (lokal über ImagePreview als Bild). Kein Test auf einer der beiden Seiten deckt die Binär-SVG ab (slice-03 AC 4 prüft icon.svg nur gegen die Regel, slice-04 AC 17 nimmt kein svg).",
    "scenario": "SVG in ISO-8859-1 mit einem Umlaut (oder > 10 MiB) im Editor öffnen → Terax zeigt sie als Bild mit Kopfzeile → Zen per Zen-Taste an → Esc: Zen bleibt (Monitor nicht scharf, DOM-Weg entscheidet „Code“), obwohl die Fläche eine Bild-Vorschau ist (Q&A 2: Esc in Vorschauen „HTML, Markdown, Bild, PDF“).",
    "recommendation": "Eine Regel für beide Fragen. Am besten meldet der Editor, was er zeigt (zum Beispiel die Fläche aus binaryHeaderSurface im Binärzweig), und die Esc-Regel liest das statt der Endung; das behebt auch die bekannte Gegenrichtung (Zeile 11). Mindestens den Kommentar in zenEscape.ts:28-32 und die beiden SVG-Grenzsätze auf „SVG als Text“ einschränken und den Fall in der Mac-Liste nennen."
  },
  {
    "id": "F3-02",
    "category": "A.1",
    "class": "fix",
    "claim": "Der linke Abstand der Kopfzeile im Zen auf macOS (pl-20) wächst und schrumpft mit dem App-Zoom, die Ampelknöpfe nicht. Die Kopfzeile liegt in main.zoom-content, der App-Kopf, dessen Maß die Wahl übernimmt, liegt außerhalb und ist ungezoomt. Bei Zoom unter etwa 0,75 rückt der Dateiname unter die Ampelknöpfe, bei 0,5 ist die Kopfzeile nur 18 px hoch und die Knöpfe ragen in den Inhalt. Das Mac-Maß N-11 prüft nur bei Zoom 1 sicher.",
    "evidence": "slice-04: src/modules/doc/PreviewHeader.tsx:40-45 (pl-20 bei zenOn && IS_MAC, h-9); slice-03: src/app/App.tsx:1674 (App-Kopf außerhalb von main, im Zen weg), :1722 (main.zoom-content um WorkspaceSurface und alle Panes); src/styles/globals.css:182-184 (zoom: var(--app-zoom)); src/lib/useZoom.ts:6-8 (Zoom 0,5 bis 2,0 in Schritten von 0,1); Vorbild ungezoomt: src/modules/header/Header.tsx:131-136; Wahl: specs/…/build-plan.md:226 („pl-20 wie der App-Kopf“)",
    "evidence_source": "code",
    "expected_observation": "Der Abstand links ist im Fenster 80 px × --app-zoom groß (bei 0,7 also 56 px). Kein Vorfahre der Kopfzeile trägt .zoom-exempt (nur der CodeMirror-Wrapper EditorPane.tsx:551 unterhalb der Raw-Kopfzeile).",
    "scenario": "Am Mac dreimal Zoom out (1,0 → 0,7), HTML-Tab, Zen an → der Dateiname beginnt unter dem dritten Ampelknopf; bei 0,5 überlappen die Knöpfe zusätzlich die oberste Zeile der Vorschau.",
    "recommendation": "Den Abstand vom Zoom entkoppeln, zum Beispiel style={{ paddingLeft: \"calc(5rem / var(--app-zoom))\" }} nur im Zen auf macOS, und die Höhe ebenso prüfen. Den Fall in N-11 als Zeile mit Zoom 0,7 aufnehmen."
  },
  {
    "id": "F3-03",
    "category": "B.7",
    "class": "obligation",
    "claim": "Im Zen bekommen auf macOS nur die Flächen mit Kopfzeile Platz für die Ampelknöpfe. Die bekannte Grenze von slice-03 und die Mac-Zeile N-11 nennen als Flächen ohne Platz nur Terminal, Diff-Ansichten und Web-Vorschau. slice-04 hat aber auch normalen Code-Tabs, SVG als Text, Video/Audio, Git-Verlauf und Bild/PDF während „Loading…“ oder bei Lesefehler keine Kopfzeile gegeben. Dort liegen die Knöpfe ebenfalls über der ersten Zeile; im Code-Tab ist das die Zeilennummern-Spalte von CodeMirror.",
    "evidence": "slice-03: src/modules/zen/lib/zenChrome.ts:53-67 (Kopf und Polster im Zen weg), src/app/components/WorkspaceSurface.tsx:87-90, specs/…/build-plan.md:849 (Liste der Grenze), specs/…/mac-checkliste.md:69; slice-04: src/modules/editor/EditorStack.tsx:107-118 (Code-Tab ohne Kopfzeile), src/modules/doc/lib/previewHeader.ts:70-84, src/modules/editor/EditorPane.tsx:434-462 (Laden und Fehler ohne Kopfzeile), :550-560 (CodeMirror ganz oben)",
    "evidence_source": "code",
    "expected_observation": "Am Mac, Zen an in einem Tab mit main.rs: die drei Ampelknöpfe liegen über der ersten Zeile und den Zeilennummern; ein Klick dort trifft die Knöpfe.",
    "scenario": "Code-Datei öffnen → Zen per Kürzel → Ampelknöpfe über Zeile 1 des Editors; die Mac-Liste fragt das nicht ab.",
    "recommendation": "Mac-Zeile N-11 um Code-Tab, Video/Audio, Git-Verlauf und Bild während „Loading…“ erweitern und die Grenze in „Wie gebaut“ von slice-03 entsprechend nachziehen."
  },
  {
    "id": "F3-04",
    "category": "A.1",
    "class": "obligation",
    "claim": "„Über einer HTML-Vorschau wechselt Wischen nie den Tab“ hält im Code für zwei Fälle: wenn :hover das iframe-Element enthält (dann trifft der Weg nach oben das Attribut) und wenn :hover leer ist (Rückfall). Ein drittes Ergebnis deckt der Code nicht: ein Ziel, das nicht null ist, aber außerhalb der Pane liegt, etwa das Polster oder die Seitenleiste als veraltetes Hover-Ziel, wenn WebKit das Hover des App-Dokuments beim Eintritt in den Rahmen fremder Herkunft nicht nachführt. Dann wechselt der Tab.",
    "evidence": "slice-03: src/modules/tabs/lib/useTabSwipe.ts:40-44 (letztes :hover-Element, dann Scroller-Prüfung, dann shouldDefer), src/modules/tabs/lib/tabSwipe.ts:52-57 (nur target === null), src/app/App.tsx:1214-1220; slice-04: src/modules/html/HtmlPreviewPane.tsx:175-176 (Attribut am äußeren Element), :193-202 (iframe direkt darunter, Server-Rahmen http://127.0.0.1); Annahme: specs/…/architecture.md:583",
    "evidence_source": "code",
    "expected_observation": "Am Mac, Zen aus, HTML-Tab auf dem Server-Weg: Zeiger aus der Seitenleiste zügig über das Polster px-3 in den Rahmen bewegen, ohne Pause waagerecht wischen → der Tab wechselt nicht. In Web Inspector ist document.querySelectorAll(':hover') dabei das iframe.",
    "scenario": "Falls WebKit beim Eintritt in den fremden Rahmen die Hover-Kette des App-Dokuments nicht auf das iframe setzt: letztes Ziel = Schicht mit Polster (WorkspaceSurface.tsx:87-90) → kein Attribut, Ziel nicht null → Tab wechselt über der Vorschau.",
    "recommendation": "N-12 (mac-checkliste.md:83) um genau diesen Weg erweitern: Eintritt von der Seite, Server-Rahmen und Asset-Rahmen. Bei einem Treffer weitet man SVC-17 auf „aktiver Tab html, Ziel außerhalb jeder Pane“ aus (Folge-Schritt laut architecture.md:583)."
  },
  {
    "id": "F3-05",
    "category": "A.1",
    "class": "obligation",
    "claim": "Für die PDF im Editor (Rahmen ohne sandbox, PDFKit) hängt Esc bei Fokus in der PDF allein am nativen Monitor. Auch das Kürzel erreicht dann das App-Dokument nicht; sichtbarer Ausgang ist nur die Zen-Taste der neuen Kopfzeile. slice-03 schaltet den Monitor für pdf scharf, die Mac-Liste prüft Esc mit Fokus im Rahmen aber nur für HTML (N-10).",
    "evidence": "slice-03: src/modules/zen/lib/zenEscape.ts:33-36 (pdf in EDITOR_PREVIEW_EXTS), src/modules/zen/lib/useZenEscape.ts:58-62, :88-91; slice-04: src/modules/editor/EditorPane.tsx:464-481 (Kopfzeile mit Zen-Taste über der PDF), :501-519 (PDF-iframe ohne sandbox); specs/…/mac-checkliste.md:71",
    "evidence_source": "code",
    "expected_observation": "Am Mac: echte PDF im Editor-Tab, Zen an, in die PDF klicken, Esc → Zen endet (terax:zen-escape kommt an).",
    "scenario": "Fängt PDFKit die Taste ab, bevor der lokale Monitor sie sieht, bleibt der Zen an, und nur die Zen-Taste führt hinaus.",
    "recommendation": "Eine Zeile in Abschnitt 5 der Mac-Liste: „Esc nach Klick in eine PDF im Zen“."
  },
  {
    "id": "F3-06",
    "category": "B.7",
    "class": "note",
    "claim": "Die Raw-Ansicht von HTML und Markdown trägt dieselbe Kopfzeile mit Zen-Taste wie die gerenderte Ansicht und dieselbe Tab-Id. Esc verlässt den Zen dort aber nicht, der Monitor geht beim Umschalten aus, und Wischen wechselt den Tab, auch über der Kopfzeile. Das ist so entworfen (SVC-14, SVC-16/Q&A 2: Vim braucht Esc, K15/Q&A 25: Attribut nur an der HTML-Pane). Für den User wechselt das Verhalten aber mit einem Klick auf „Raw“, und die Mac-Liste prüft Esc und Wischen in Raw im Zen nicht.",
    "evidence": "slice-03: src/modules/zen/lib/zenEscape.ts:19 (editor → media), :33-46; src/modules/tabs/lib/tabSwipe.ts:52-57; slice-04: src/modules/doc/lib/previewHeader.ts:56-63, :70-73, src/modules/editor/EditorStack.tsx:82-104 (kein data-no-tab-swipe); Umschalten: src/modules/tabs/lib/applyDocView.ts:30-43",
    "evidence_source": "code",
    "expected_observation": "In Vitest: zenEscapeArmed(true, { kind: \"editor\", path: \"a.html\" }) === false; EditorStack rendert für a.html eine Kopfzeile mit „Toggle zen mode“, das Element trägt kein data-no-tab-swipe.",
    "scenario": "HTML-Tab im Zen → „Raw“ → Esc: Zen bleibt (Esc geht an CodeMirror); Wischen über der Kopfzeile wechselt jetzt den Tab.",
    "recommendation": "Kein Code-Eingriff; eine Zeile in den Mac-Abschnitten 5 und 6 (Raw im Zen: Esc bleibt beim Editor, Wischen wechselt), damit das nicht als Fehler gemeldet wird."
  },
  {
    "id": "F3-07",
    "category": "B.7",
    "class": "note",
    "claim": "Im Zen gibt es Flächen ohne Kopfzeile, ohne Esc und ohne sichtbaren Hinweis: Code, SVG als Text, Video/Audio, Terminal, Git-Diff, KI-Diff, Git-Verlauf, Web-Vorschau. Der einzige Ausgang ist das Kürzel Mod+Shift+' (Q&A 2, entschieden). Die Befehlspalette hat keinen Zen-Eintrag (so geplant), anders als im Brief angenommen. In der Web-Vorschau mit Fokus im fremden iframe erreicht auch das Kürzel die App nicht (DOM-Tastenkürzel, kein natives Menü-Kürzel); Ausweg ist ein Klick in die Adressleiste. Auf der Basis war das genauso.",
    "evidence": "slice-03: src/modules/zen/lib/zenEscape.ts:16-26, src/app/App.tsx:1113 (einzige Kürzel-Bindung), specs/…/build-plan.md:840 („Kein Eintrag in der Befehlspalette“), src/modules/command-palette/commands.ts (kein view.zenMode); slice-04: Kopfzeile nur auf den Flächen aus src/modules/doc/lib/previewHeader.ts:11, :70-84; src-tauri/src/modules/app_menu.rs:12 (nur Command+Q als Menü-Kürzel); Basis: cf07327:src/app/App.tsx:1086",
    "evidence_source": "code",
    "expected_observation": "grep \"view.zenMode\" in src/modules/command-palette findet nichts; im Zen über einem Code-Tab ist kein Element mit aria-label „Toggle zen mode“ im DOM.",
    "scenario": "Zen in einem Code-Tab → ein User, der das Kürzel nicht kennt, sieht keinen Weg zurück.",
    "recommendation": "Nur zur Kenntnis (Entscheidung Q&A 2). Optional: Zen-Eintrag in der Befehlspalette als Folge-Thema vorlegen."
  },
  {
    "id": "F3-08",
    "category": "B.7",
    "class": "note",
    "claim": "Kopfzeile und Ziehbereich überdecken einander im Zen nicht, weil es im Zen keinen Ziehbereich gibt: Alle data-tauri-drag-region liegen im App-Kopf, der im Zen fehlt, und die Kopfzeile, die im Zen oben am Fenster sitzt, trägt keinen. Das Fenster lässt sich im Zen nicht verschieben, wie schon auf der Basis. Nebenbei: pl-20 gilt auch, wenn der User die Seitenleiste im Zen von Hand öffnet (die Kopfzeile liegt dann nicht am linken Fensterrand) und im Vollbild (ohne Ampelknöpfe). Das ist nur kosmetisch.",
    "evidence": "slice-03: src/app/App.tsx:1674 (Header nur bei chrome.header); src/modules/header/Header.tsx:133, :174, :213; src/modules/tabs/TabBar.tsx:887; slice-04: src/modules/doc/PreviewHeader.tsx:40-45 (kein data-tauri-drag-region, pl-20 nur nach zenOn && IS_MAC); Basis: cf07327:src/app/App.tsx:1634",
    "evidence_source": "code",
    "expected_observation": "Im Zen findet document.querySelector('[data-tauri-drag-region]') nichts.",
    "scenario": "Zen an → Fenster an der Kopfzeile ziehen → nichts passiert.",
    "recommendation": "Bei Bedarf data-tauri-drag-region auf die freie Fläche der Kopfzeile (Dateiname) im Zen; sonst nur Hinweis."
  },
  {
    "id": "F3-09",
    "category": "B.10",
    "class": "note",
    "claim": "Die Vermutung aus Punkt 6 trifft nicht zu: Nach einem Neustart hängt höchstens eine HTML-Pane ein (der aktive Tab), weil alle wiederhergestellten Tabs cold sind und erst beim Aktivieren eingehängt werden. Jede versteckte eingehängte HTML-Pane war beim Einhängen sichtbar. Wiederholte Anfragen entstehen nur durch Rendered ↔ Raw (Neu-Einhängen) und Neu laden auf dem Rückfall-Weg; für dieselbe Datei gibt der Server dieselbe Freigabe, die Grenze von 256 zählt nur neue Freigaben. Über SSH kostet jedes Neu-Einhängen trotzdem eine realpath- und eine stat-Abfrage, weil die Prüfung vor der Wiederverwendung läuft. Das fällt nicht auf.",
    "evidence": "Bestand: src/modules/spaces/lib/serialize.ts:261-269 (cold: true), src/modules/doc/DocStack.tsx:96-100 (!t.cold), :112 (visible je Tab), src/modules/tabs/lib/useTabs.ts:770-779 (warm nur beim Aktivieren); slice-04: src/modules/html/HtmlPreviewPane.tsx:76-104 (eine Anfrage je Einhängen, Abhängigkeiten path/workspace/source/askSeq); slice-01: src-tauri/src/modules/preview_server/mod.rs:484-511, :517-563 (Prüfung vor der Wiederverwendung), :582-592 (Wiederverwendung, Grenze)",
    "evidence_source": "code",
    "expected_observation": "Mit 20 wiederhergestellten HTML-Tabs ruft der Start preview_frame_source höchstens einmal; jeder weitere Aufruf folgt auf eine Aktivierung durch den User.",
    "scenario": "–",
    "recommendation": "Keine."
  }
]
```

---

## Findings (Kurzform)

### F3-01: SVG im Binärzweig: Kopfzeile mit Zen-Taste, Esc verlässt Zen nicht
**Kategorie:** B.1 · **Klasse:** fix
**Problem:** Zwei Regeln für „zeigt der Editor eine Vorschau?“ laufen auseinander: `binaryHeaderSurface` nimmt `IMAGE_EXTS` mit `svg`, `EDITOR_PREVIEW_EXTS` ohne `svg`. Für SVG mit ungültigem UTF-8 oder über 10 MiB gibt das eine Bild-Vorschau mit Zen-Taste, in der Esc nichts tut. Drei Texte behaupten „SVG öffnet als Text, ohne Kopfzeile“.
**Neuer Code:** `src/modules/doc/lib/previewHeader.ts:79-84` · `src/modules/zen/lib/zenEscape.ts:28-36`
**Bestehendes Pattern:** `src/modules/editor/lib/binaryPreview.ts:5-13`, `:85-90`
**Empfehlung:** eine Regel (der Editor meldet, was er zeigt); mindestens Kommentar und Grenzsätze richtigstellen.

### F3-02: `pl-20` skaliert mit dem App-Zoom
**Kategorie:** A.1 · **Klasse:** fix
**Problem:** Die Kopfzeile liegt in `.zoom-content`, der App-Kopf als Vorbild nicht. Unter etwa Zoom 0,75 liegt der Dateiname unter den Ampelknöpfen.
**Neuer Code:** `src/modules/doc/PreviewHeader.tsx:44`
**Bestehendes Pattern:** `src/modules/header/Header.tsx:134-136` (ungezoomt, `App.tsx:1674` vor `:1722`)
**Empfehlung:** Abstand durch `var(--app-zoom)` teilen; N-11 bei Zoom 0,7 prüfen.

### F3-03: Ampelknöpfe über kopfzeilenlosen Flächen, Liste unvollständig
**Kategorie:** B.7 · **Klasse:** obligation
**Neuer Code:** `src/modules/editor/EditorStack.tsx:107-118` · `src/modules/zen/lib/zenChrome.ts:53-67`
**Empfehlung:** N-11 um Code, Video/Audio, Git-Verlauf und Bild beim Laden erweitern.

### F3-04: Wischen: Hover-Ziel außerhalb der Pane ist nicht gedeckt
**Kategorie:** A.1 · **Klasse:** obligation
**Neuer Code:** `src/modules/tabs/lib/useTabSwipe.ts:40-44` · `src/modules/html/HtmlPreviewPane.tsx:176`
**Empfehlung:** N-12 mit Eintritt von der Seite und Server-Rahmen prüfen.

### F3-05: Esc mit Fokus in der PDF hängt allein am Monitor
**Kategorie:** A.1 · **Klasse:** obligation
**Neuer Code:** `src/modules/editor/EditorPane.tsx:501-519` · `src/modules/zen/lib/zenEscape.ts:33-36`
**Empfehlung:** eigene Mac-Zeile.

### F3-06: Raw im Zen: gleiche Kopfzeile, anderes Esc- und Wischverhalten (gewollt)
**Kategorie:** B.7 · **Klasse:** note

### F3-07: Flächen ohne sichtbaren Zen-Ausgang; kein Eintrag in der Befehlspalette
**Kategorie:** B.7 · **Klasse:** note

### F3-08: Im Zen kein Ziehbereich (Bestand), `pl-20` auch bei offener Seitenleiste
**Kategorie:** B.7 · **Klasse:** note

### F3-09: Neustart hängt höchstens eine HTML-Pane ein; die Vermutung aus Punkt 6 trifft nicht zu
**Kategorie:** B.10 · **Klasse:** note

---

## Prüfmenge

**checked** (jede Datei vollständig gelesen, gegen A.1–A.4 und B.1–B.10 an der Naht):
`src/app/App.tsx` (Zen-, Wisch-, Layout- und KI-Abschnitte), `src/app/components/WorkspaceSurface.tsx`, `src/app/components/WorkspaceInputBar.tsx`, `src/modules/zen/index.ts`, `src/modules/zen/lib/zenStore.ts`, `src/modules/zen/lib/zenChrome.ts`, `src/modules/zen/lib/usePaneFrameClass.ts`, `src/modules/zen/lib/zenEscape.ts`, `src/modules/zen/lib/useZenEscape.ts`, `src/modules/zen/ZenToggleButton.tsx`, `src/modules/tabs/lib/tabSwipe.ts`, `src/modules/tabs/lib/useTabSwipe.ts`, `src/modules/sidebar/useSidebarPanel.ts` (Zen-Teil), `src/modules/doc/PreviewHeader.tsx`, `src/modules/doc/lib/previewHeader.ts`, `src/modules/doc/index.ts`, `src/modules/html/HtmlPreviewPane.tsx`, `src/modules/html/lib/htmlPreviewSource.ts` (Ladeweg, für Punkt 2), `src/modules/markdown/MarkdownPreviewPane.tsx`, `src/modules/editor/EditorPane.tsx` (Binärzweig, Kopfzeile, `onLoaded`), `src/modules/editor/EditorStack.tsx`, `src/modules/editor/AiDiffPane.tsx`, `src/modules/editor/GitDiffPane.tsx`, `src/modules/preview/PreviewPane.tsx`, `src/modules/doc/DocStack.tsx`.
Zum Nachweis mitgelesen (Bestand, nicht Prüfgegenstand): `src/modules/editor/lib/binaryPreview.ts`, `src/modules/editor/ImagePreview.tsx`, `src/modules/editor/lib/useDocument.ts` (`readEnv`), `src/modules/tabs/lib/applyDocView.ts`, `src/modules/tabs/lib/useTabs.ts` (Tab-Typen, `cold`, `setDocView`), `src/modules/spaces/lib/serialize.ts`, `src/components/ui/DocViewToggle.tsx`, `src/modules/preview-server/OpenInBrowserButton.tsx`, `src/lib/platform.ts`, `src/lib/useZoom.ts`, `src/styles/globals.css` (Zoom, `.terax-reveal`), `src/modules/header/Header.tsx`, `src-tauri/tauri.conf.json`, `src-tauri/src/modules/zen_escape.rs`, `src-tauri/src/modules/fs/file.rs` (Einordnung Text/Binär), `src-tauri/src/modules/preview_server/mod.rs` (Freigabe-Wiederverwendung); Maßstab: `build-plan.md` (slice-03/04 samt „Wie gebaut“, Entscheidungen), `architecture.md` (SVC-14 bis SVC-17, K11 bis K16, Q&A 1 bis 5, 25, 28, Annahmen), `mac-checkliste.md`, `gates/obligations.md`.

**not_checked:**
- Testdateien der Prüfmenge: laut Brief ausgenommen; nur auf Abdeckung der SVG-Binärfälle durchsucht (AC-Texte).
- Laufzeitverhalten am Mac (echtes `:hover` über `iframe`, echter Fokus in PDFKit und `iframe`, Lage der Ampelknöpfe, Wischgeste): auf der Linux-Werkbank nicht ausführbar, als `obligation` F3-03/F3-04/F3-05 und Mac-Hinweis in F3-02 weitergegeben.
- Rust-Seite außer den zitierten Stellen, `preview-server/**` außer `OpenInBrowserButton.tsx`, `FileExplorer.tsx`: außerhalb dieses Teils des Fan-outs.

## Changed Files

| File | Lines Changed (git numstat) | Findings |
|------|---------------|----------|
| `src/app/App.tsx` | +56 −9 | F3-02, F3-03, F3-04, F3-07, F3-08 (Naht-Seite) |
| `src/app/components/WorkspaceInputBar.tsx` | +5 −0 | – |
| `src/app/components/WorkspaceSurface.tsx` | +21 −7 | F3-03, F3-04 (Naht-Seite) |
| `src/modules/doc/PreviewHeader.tsx` | +85 −0 | F3-02, F3-08 |
| `src/modules/doc/lib/previewHeader.ts` | +84 −0 | F3-01, F3-06 |
| `src/modules/editor/AiDiffPane.tsx` | +6 −1 | – |
| `src/modules/editor/EditorPane.tsx` | +42 −4 | F3-01, F3-03, F3-05 |
| `src/modules/editor/EditorStack.tsx` | +70 −21 | F3-03, F3-06 |
| `src/modules/editor/GitDiffPane.tsx` | +6 −1 | – |
| `src/modules/html/HtmlPreviewPane.tsx` | +138 −37 | F3-04, F3-09 |
| `src/modules/markdown/MarkdownPreviewPane.tsx` | +42 −7 | – |
| `src/modules/preview/PreviewPane.tsx` | +7 −1 | – |
| `src/modules/sidebar/useSidebarPanel.ts` | +42 −0 | – |
| `src/modules/tabs/lib/tabSwipe.ts` | +15 −0 | F3-04, F3-06 |
| `src/modules/tabs/lib/useTabSwipe.ts` | +9 −3 | F3-04 |
| `src/modules/zen/ZenToggleButton.tsx` | +46 −0 | F3-07 |
| `src/modules/zen/index.ts` | +5 −0 | – |
| `src/modules/zen/lib/usePaneFrameClass.ts` | +15 −0 | – |
| `src/modules/zen/lib/useZenEscape.ts` | +106 −0 | F3-05 |
| `src/modules/zen/lib/zenChrome.ts` | +79 −0 | F3-03 |
| `src/modules/zen/lib/zenEscape.ts` | +128 −0 | F3-01, F3-05, F3-06 |
| `src/modules/zen/lib/zenStore.ts` | +25 −0 | – |
| `src/modules/doc/DocStack.tsx` | unverändert (Bestand) | F3-09 |
