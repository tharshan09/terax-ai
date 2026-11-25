# Design Conformance Report

**Feature:** Vorschau im Browser öffnen (Mini-Server) und Vorschau in der App, Welle 1. Teil 4 des Fan-outs: das Frontend gegen Architektur und Anforderungen
**Branch:** `html-preview-browser` @ `f180fa8f87507a60f82a48a72c7235683d62e2c0` (Feature-Diff `cf07327...f180fa8`)
**Datum:** 2026-11-25
**Diff-Scope:** Prüfmenge: alle 32 Produktionsdateien des Features unter `src/` (Slices 00, 03, 04; Liste unter „Prüfmenge“)
**Modus:** full
**Architecture:** `specs/2026-11-25-html-preview-browser/architecture.md`
**Bindings:** —

---

## Verdict

PASSED

| Kategorie | Anzahl |
|---|---|
| Design Violations (Befunde gesamt) | 5 (0 `decision`, 0 `refuted`, 1 `obligation`, 4 `note`) |
| Bindings Net Hits | 0 (keine `bindings.md`) |
| Exceptions Applied | 0 |

Kein Befund blockiert. Im Frontend fand ich an keiner Naht zwischen den Slices eine Stelle, die einer bindenden Entscheidung, einer Architektur-Regel oder einer Aussage aus „Wie gebaut“ widerspricht.

---

## Design Violations

### F4-1 — obligation
- **Datei:** `src/modules/html/HtmlPreviewPane.tsx:194-202` (Server-Rahmen), `:41-42` (Sandbox-Konstanten)
- **Design Ref:** architecture.md → Sicherheitsmodell, Zeile 21 (`architecture.md:291`); „In-App-Vorschau über den Mini-Server“, Folgen (`architecture.md:690`)
- **Erwartet:** Eine Seite, die über den Mini-Server geladen wird, kann keine Terax-Befehle rufen. Belegt ist das bisher nur durch die Capabilities ohne `remote` (Guard-Test).
- **Aktuell:** Mit Baustein E (`htmlPreviewSource.ts:9`, Konstante an) läuft im App-Fenster ein `iframe` mit `allow-scripts`, das von `http://127.0.0.1:{port}` lädt. Über SSH laufen damit zum ersten Mal Inline- und CDN-Skripte in einem Rahmen der App (`architecture.md:690`). Ob Tauri einen IPC-Aufruf aus diesem Unterrahmen abweist, ist nicht gemessen (`gates/obligations.md:51`). Die Mac-Checkliste prüft es nicht (`mac-checkliste.md:41-54`), und die Messseite hat dafür keinen Punkt (`evidence/messseite/index.html:54-66`).
- **Klasse:** obligation

### F4-2 — note
- **Datei:** `src/modules/markdown/MarkdownPreviewPane.tsx:109`, `src/modules/editor/EditorPane.tsx:485`, `src/modules/editor/ImagePreview.tsx:54`
- **Design Ref:** architecture.md → SVC-15 (`architecture.md:177`); bindende Entscheidung 8 („Ränder, Rahmen weg“)
- **Erwartet:** Im Zen weichen Kopf, Statusleiste, Seitenleiste, Griff, das Polster der Arbeitsfläche und der Rahmen der Pane.
- **Aktuell:** Genau das weicht. HTML füllt das Fenster ohne jeden Rand (`HtmlPreviewPane.tsx:175-202`, `WorkspaceSurface.tsx:88-90`). Die inneren Polster der Flächen bleiben aber stehen: Markdown behält `px-8 py-6` um den Text, Bild und PDF behalten `p-4` um den Inhalt, und das Bild behält seinen eigenen Rahmen. Nach SVC-15 ist das zulässig. Ob „Ränder weg“ diese Polster mit meint, legt weder der Code noch Zeile 68 der Mac-Checkliste fest („die Vorschau füllt das Fenster“).
- **Klasse:** note

### F4-3 — note
- **Datei:** `src-tauri/src/modules/preview_server/mod.rs:590-591` und `:1364` gegen `src/modules/html/HtmlPreviewPane.tsx:76-104` und `src/modules/preview-server/lib/browserOpenText.ts:34-35`
- **Design Ref:** architecture.md → VAL-11 (`architecture.md:221`); Q&A 9 (`architecture.md:881`)
- **Erwartet:** Höchstens 256 Freigaben. Q&A 9 hat das dem User als „Browser-Links“ vorgelegt.
- **Aktuell:** Ein einziger Zähler gilt für beide Klassen (Testname `ac27_at_most_256_grants_over_both_classes`). Jede HTML-Datei, die in der App eingehängt wird, legt ohne Klick eine `frame`-Freigabe mit eigenem Listener an, und die bleibt bis Prozessende. Nach 256 verschiedenen In-App-Vorschauen in einem Lauf meldet „Open in Browser“ „Too many browser links are open. Restart Terax to free them.“, auch wenn der User nie einen Browser-Link geöffnet hat. Die In-App-Vorschau fällt dann still auf den heutigen Weg zurück; das deckt die Entscheidung des Users. Gegen VAL-11 ist das konform. Es ist aber an keiner Stelle als Folge von Baustein E benannt.
- **Klasse:** note

### F4-4 — note
- **Datei:** `src/modules/doc/index.ts:2-9`, `src/app/components/WorkspaceSurface.tsx:5`, `src/modules/preview-server/index.ts:1-9`, `src/modules/doc/PreviewHeader.tsx:5`, `src/modules/doc/lib/previewHeader.ts:2-3`, `src/modules/zen/lib/zenEscape.ts:1`
- **Design Ref:** architecture.md → Nahtstellen, Abhängigkeiten der Bereiche (`architecture.md:401-410`); `TERAX.md:85` („exports a thin barrel via `index.ts`“); build-plan.md:745, :872
- **Erwartet:** Keine Zyklen. Aus dem Editor-Modul werden nur reine Dateien importiert. Laut der Tabelle „Abhängigkeiten der Bereiche“ bekommt die Kopfzeile die Tasten von C und E als Props.
- **Aktuell:** Es gibt keinen statischen Import-Zyklus: Ich habe die statischen Wert-Importe aller 438 Produktionsdateien geprüft und keine starke Zusammenhangskomponente gefunden. Gegenseitige Bezüge zwischen Modulen gibt es zwischen `doc` und `editor`, zwischen `zen` und `editor` sowie zwischen `doc` und `html`/`markdown`. Sie laufen nur über reine Dateien (`editor/lib/binaryPreview`) oder den Lazy-Import in `DocStack.tsx:26-37`, so wie im Plan vorgesehen. `doc` kennt `zen` (zenStore für `pl-20`) und `preview-server` (`browserOpenable`) direkt; das decken SVC-14 („nach SVC-12“) und Q&A 28 ab. Zwei Dinge fallen auf. Erstens hat der Barrel `preview-server/index.ts` keinen einzigen Konsumenten. Zweitens nutzt niemand die neuen Exporte des `doc`-Barrels über den Barrel. Weil `WorkspaceSurface` den `doc`-Barrel beim Start lädt, kommen `PreviewHeader`, `DocViewToggle`, `previewHeader` und `browserOpenable` in den Start-Graphen. Insgesamt wächst der Start-Graph von `src/main.tsx` um 14 kleine Dateien, aber um kein neues Paket und nichts aus der HEAVY-Liste von `eager-budget.test.ts`.
- **Klasse:** note

### F4-5 — note
- **Datei:** `TERAX.md:46`, `:79`, `:83-105`
- **Design Ref:** MIG-16; build-plan.md:227 (der Dirigent zieht Abweichungen vor dem PR nach)
- **Erwartet:** Die Doku beschreibt das Verhalten der neuen Flächen.
- **Aktuell:** `TERAX.md` beschreibt `preview-server/`, `zen/`, die Wisch-Ausnahme und `preview_frame_source`. Es beschreibt nicht, wie die In-App-HTML-Vorschau lädt: Konstante `HTML_PREVIEW_VIA_SERVER`, Rückfall je Datei bei jeder Antwort außer `ready` (`htmlPreviewSource.ts:55-77`), V1 „Neu laden fragt auf dem Rückfall-Weg erneut“ (`HtmlPreviewPane.tsx:162-172`). Auch die gemeinsame Kopfzeile im Modul `doc/` fehlt. Die Modulliste hat keinen Eintrag für `doc/` und `html/`; diese Lücke gab es schon vorher. MIG-16 verlangt das nicht ausdrücklich.
- **Klasse:** note

### Befunde als JSON

```json
[
  {
    "id": "F4-1",
    "class": "obligation",
    "claim": "Mit Baustein E lädt die In-App-HTML-Vorschau lokale und SSH-Dateien als iframe mit allow-scripts aus http://127.0.0.1:{port}; über SSH laufen damit erstmals Inline- und CDN-Skripte in einem Rahmen des App-Fensters. Ob ein Skript in diesem Unterrahmen Tauri-IPC erreicht, ist weder getestet noch Teil der Mac-Checkliste; Bedrohung 21 ist nur über die Capability-Datei belegt.",
    "evidence": "src/modules/html/HtmlPreviewPane.tsx:194-202 (Server-Rahmen, sandbox aus :41-42 ohne allow-same-origin); src/modules/html/lib/htmlPreviewSource.ts:9 (HTML_PREVIEW_VIA_SERVER = true) | specs/.../architecture.md:291 (Bedrohung 21, Test nur Capability-Guard); architecture.md:690 (Inline- und CDN-Skripte laufen neu in Remote-Vorschauen); gates/obligations.md:51 (IPC aus Unterrahmen nicht gemessen); mac-checkliste.md:41-54 (Abschnitt 3 ohne IPC-Probe); evidence/messseite/index.html:54-66 (Punkte 1-9 ohne IPC-Probe)",
    "evidence_source": "code",
    "expected_observation": "In mac-checkliste.md Abschnitt 3 und in der Messseite steht keine Probe auf window.__TAURI_INTERNALS__ oder einen IPC-Aufruf aus dem Rahmen; HtmlPreviewPane.tsx:194-202 lädt eine http-Adresse mit allow-scripts.",
    "scenario": "HTML-Datei auf dem SSH-Server (etwa von einem Agenten erzeugt) mit Inline-Skript, das window.__TAURI_INTERNALS__ sucht und invoke(\"fs_read_file\", ...) versucht -> mit Baustein E läuft das Skript im App-Fenster; ob Tauri den Aufruf aus dem Unterrahmen mit opaker Herkunft abweist, zeigt erst der Mac. Empfehlung: Zeile in mac-checkliste.md Abschnitt 3 (Probe meldet typeof window.__TAURI_INTERNALS__ und das Ergebnis eines IPC-Versuchs; erwartet: nicht vorhanden bzw. abgewiesen; sonst Konstante aus)."
  },
  {
    "id": "F4-2",
    "class": "note",
    "claim": "Im Zen bleiben die inneren Polster der Vorschau-Flächen stehen: Markdown px-8 py-6, Bild- und PDF-Vorschau p-4, das Bild selbst mit Rahmen. HTML füllt das Fenster ohne Rand. Gegen SVC-15 ist das konform; ob 'Ränder weg' (Entscheidung 8) diese Polster meint, ist offen.",
    "evidence": "src/modules/markdown/MarkdownPreviewPane.tsx:109; src/modules/editor/EditorPane.tsx:485; src/modules/editor/ImagePreview.tsx:54 | ohne Rand: src/modules/html/HtmlPreviewPane.tsx:175-202, src/app/components/WorkspaceSurface.tsx:88-90 | architecture.md:177 (SVC-15); mac-checkliste.md:68",
    "evidence_source": "code",
    "expected_observation": "Die drei Klassen hängen nicht an zenChrome oder usePaneFrameClass und stehen im Zen unverändert im DOM.",
    "scenario": "Zen an über einer PDF -> 16 px Rand um den Betrachter; über Markdown -> 32 px links und rechts. Kein Defekt gegen die Architektur; der Mac-Prüfer achtet bei Zeile 68 darauf, der User entscheidet über einen Folgeschritt."
  },
  {
    "id": "F4-3",
    "class": "note",
    "claim": "Die Grenze von 256 Freigaben zählt Browser- und Rahmen-Freigaben gemeinsam. Jede in der App eingehängte HTML-Datei legt ohne Klick eine frame-Freigabe mit Listener an, die bis Prozessende bleibt. Nach 256 verschiedenen In-App-Vorschauen meldet 'Open in Browser' 'Too many browser links are open', obwohl womöglich kein Browser-Link offen ist.",
    "evidence": "src-tauri/src/modules/preview_server/mod.rs:590-591 (ein Zähler), mod.rs:1364 (ac27_at_most_256_grants_over_both_classes) | src/modules/html/HtmlPreviewPane.tsx:76-104 (Anfrage je eingehängter Datei); src/modules/preview-server/lib/browserOpenText.ts:34-35 | architecture.md:221 (VAL-11), architecture.md:881 (Q&A 9 als 'Browser-Links')",
    "evidence_source": "code",
    "expected_observation": "Ein Zähler über beide Klassen; der Toast-Text nennt nur Browser-Links.",
    "scenario": "Lange Sitzung, 256 verschiedene HTML-Berichte in der App angesehen -> Klick 'Open in Browser' auf Datei 257 -> Toast 'Too many browser links are open...'. Konform zu VAL-11; Hinweis für OB-23 (auch In-App-Vorschauen belegen Deskriptoren) und für die Rückmeldung an den User."
  },
  {
    "id": "F4-4",
    "class": "note",
    "claim": "Kein statischer Import-Zyklus; gegenseitige Modulbezüge (doc/editor, zen/editor, doc/html, doc/markdown) nur über reine Dateien oder den Lazy-Import, wie geplant. Der Barrel preview-server/index.ts hat keinen Konsumenten; die neuen Exporte des doc-Barrels nutzt niemand, ziehen aber PreviewHeader, DocViewToggle, previewHeader und browserOpenable über WorkspaceSurface in den Start-Graphen (+14 kleine Dateien, kein neues Paket, nichts aus HEAVY).",
    "evidence": "src/modules/doc/index.ts:2-9; src/app/components/WorkspaceSurface.tsx:5; src/modules/preview-server/index.ts:1-9; src/modules/doc/PreviewHeader.tsx:5; src/modules/doc/lib/previewHeader.ts:2-3; src/modules/zen/lib/zenEscape.ts:1; src/modules/doc/DocStack.tsx:26-37 | architecture.md:401-410; TERAX.md:85; build-plan.md:745, :872",
    "evidence_source": "code",
    "expected_observation": "grep 'from \"@/modules/preview-server\"' unter src: kein Treffer; grep 'from \"@/modules/doc\"': nur WorkspaceSurface.tsx:5.",
    "scenario": "Kein Fehlverhalten. Empfehlung: ungenutzte Barrel-Exporte entfernen oder über die Barrels importieren, damit TERAX.md:85 und die tatsächlichen Wege übereinstimmen."
  },
  {
    "id": "F4-5",
    "class": "note",
    "claim": "TERAX.md beschreibt nicht, wie die In-App-HTML-Vorschau lädt (HTML_PREVIEW_VIA_SERVER, Rückfall je Datei bei jeder Antwort außer ready, V1: erneute Frage beim Neu laden auf dem Rückfall-Weg), und nicht die gemeinsame Kopfzeile in doc/.",
    "evidence": "TERAX.md:46, :79, :83-105 | src/modules/html/lib/htmlPreviewSource.ts:9, :55-77; src/modules/html/HtmlPreviewPane.tsx:162-172; src/modules/doc/PreviewHeader.tsx:23-29 | build-plan.md:227, :1039",
    "evidence_source": "code",
    "expected_observation": "In TERAX.md kein Treffer für HTML_PREVIEW_VIA_SERVER, PreviewHeader oder doc/.",
    "scenario": "Ein späterer Sync oder Folge-Lauf ändert die Konstante oder die Kopfzeile, ohne zu wissen, dass jede abgelehnte Datei still auf den heutigen Weg geht -> Lücke in der Doku, kein Laufzeitfehler. Der Dirigent zieht die Doku vor dem PR nach (build-plan.md:227)."
  }
]
```

---

## Anforderungen und Regeln: Anforderungs-/Regel-ID · Fundstelle · Urteil

„Umgesetzt“ heißt hier: am gemergten Code gelesen. Tests habe ich nicht laufen lassen (das Gate hat sie gemessen). Wo nur der Mac etwas belegen kann, steht der Prüfpunkt dabei, der schon in der Mac-Checkliste steht.

### Slice 03 (laut build-plan.md:735)

| ID | Fundstelle | Urteil |
|---|---|---|
| BR-18 | `HtmlPreviewPane.tsx:176` (`data-no-tab-swipe` nur bei `visible`, auf der ganzen Pane samt Kopfzeile); `tabSwipe.ts:52-57`; `useTabSwipe.ts:42-43`; `App.tsx:1218-1220` | umgesetzt; Mac N-12 |
| BR-19 | `zenChrome.ts:53-67`; `App.tsx:974`, `:980`, `:1674`, `:1727`, `:1794`, `:1833`, `:1840`; `WorkspaceSurface.tsx:88-90`; `usePaneFrameClass.ts:12-15` | umgesetzt; innere Polster s. F4-2 |
| BR-20 | `zenEscape.ts:16-69`; `useZenEscape.ts:47-105`; `ZenToggleButton.tsx:21-46`; `App.tsx:1113` | abweichend wie Q&A 2 (vom User bestätigt): Esc nur in Vorschau-Tabs; so umgesetzt |
| FL-5 | `ZenToggleButton.tsx:33`; `App.tsx:1113` | umgesetzt |
| FL-6 | `useZenEscape.ts:64-99` | umgesetzt (Q&A 2) |
| FL-7 | wie BR-18 | umgesetzt |
| UI-4 | `ZenToggleButton.tsx:30-32` (`aria-pressed`, „Toggle zen mode · {Kürzel}“) | umgesetzt |
| ST-3, ST-4 | `zenStore.ts:16-25` | umgesetzt, nicht gespeichert |
| TR-3, TR-4 | `zenStore.ts:18-24`; `App.tsx:1113`; `useZenEscape.ts:74` | umgesetzt |
| TG-6, TG-7 | – | umgesetzt (bewusst kein Signal) |
| API-4 | `useZenEscape.ts:14`, `:88-98` | umgesetzt |
| API-7 | `zenStore.ts:16-25`; einzige Schreiber `ZenToggleButton.tsx:33`, `App.tsx:1113`, `useZenEscape.ts:74` | umgesetzt |
| SVC-15 | `zenChrome.ts:35-67` | umgesetzt |
| SVC-16 | `zenEscape.ts:52-69`, `:94-127` | umgesetzt |
| SVC-17 | `tabSwipe.ts:52-57` | umgesetzt |
| MIG-10 | `WorkspaceSurface.tsx:85-90` und die sieben Schichten | umgesetzt |
| MIG-11 | `App.tsx:971-982`, `:1088-1095`, `:1113`, `:1218-1220`, `:1548-1550`, `:1674`, `:1727`, `:1794`, `:1833`, `:1840` | umgesetzt; ohne eigenen Test (bekannte Grenze) |
| MIG-12 | `WorkspaceInputBar.tsx:43`, `:56`, `:196` | umgesetzt (`hidden`, bleibt eingehängt) |
| MIG-13 | `useTabSwipe.ts:18-44` | umgesetzt (Signatur nur erweitert) |
| MIG-14 | `tabSwipe.ts:25-44` unverändert, `:52-57` neu | umgesetzt (INV-1) |
| MIG-17, MIG-18, MIG-19 | `PreviewPane.tsx:38`, `:74`; `GitDiffPane.tsx:130`, `:251`; `AiDiffPane.tsx:95`, `:141` | umgesetzt |
| MIG-20 | `useSidebarPanel.ts:93-145`; `App.tsx:979-982` | umgesetzt; Mac N-22 |

### Slice 04 (laut build-plan.md:858)

| ID | Fundstelle | Urteil |
|---|---|---|
| BR-7 | `HtmlPreviewPane.tsx:56-104`, `:193-241` | umgesetzt (In-App-Vorschau bleibt, in W1 über den Server) |
| BR-16 | `openInBrowser.ts:20` (einziger Aufrufer); `FileExplorer.tsx:807-816`, `OpenInBrowserButton.tsx:33` (nur `onClick`/`onSelect`) | umgesetzt; kein Weg aus dem Agenten (s. „Eingebauter Agent“) |
| BR-21 | `PreviewHeader.tsx:40-83`; `HtmlPreviewPane.tsx:183-192`; `MarkdownPreviewPane.tsx:98-107`; `EditorStack.tsx:90-103` | umgesetzt (im Fluss, ohne Overlay) |
| BR-22 | `HtmlPreviewPane.tsx:162-172`; `MarkdownPreviewPane.tsx:85-88`; `EditorStack.tsx:55-59` | umgesetzt; abweichend wie V1/V2 in „Wie gebaut“ |
| BR-23 | `EditorPane.tsx:464-482` (Bild, PDF, Karte, auch über SSH) | umgesetzt; ohne Kopfzeile bei „Loading…“ und bei Lesefehler (bekannte Grenze) |
| BR-24 | `HtmlPreviewPane.tsx:41-42`, `:199`, `:207`, `:215` | umgesetzt; Mac M-C (N-23) |
| BR-25 | `browserOpenable.ts:6-40`; `previewHeader.ts:45` | umgesetzt (W1 ohne Markdown, ohne WSL) |
| FL-1 | `openInBrowser.ts:13-33`; `OpenInBrowserButton.tsx:33`; `FileExplorer.tsx:810-812` | umgesetzt; Mac N-2 |
| FL-4 | wie BR-22 | umgesetzt |
| EP-6 | `browserOpenText.ts:12-44`; `openInBrowser.ts:32` (`toast.error`) | umgesetzt, Wortlaut nach Q&A 11 |
| UI-1 | `OpenInBrowserButton.tsx:25` (`hidden`), `:39` (`LinkSquare02Icon`) | umgesetzt; SVG nur im Kontextmenü (bekannte Grenze) |
| UI-2 | `PreviewHeader.tsx:42-45` (`pl-20` im Zen auf macOS) | umgesetzt; Mac N-11 |
| UI-3 | `PreviewHeader.tsx:60`, `:69`; `HtmlPreviewPane.tsx:162`, `:200`, `:208`; `MarkdownPreviewPane.tsx:73`, `:78`; `EditorStack.tsx:60`, `:70`; `EditorPane.tsx:120-124` | umgesetzt (`aria-busy`) |
| UI-5 | `FileExplorer.tsx:798-816` (direkt unter „Open with Default App“, nur Dateien, Workspace aus `FileExplorer.tsx:225`) | umgesetzt |
| TG-1, TG-2, TG-5, TG-8 | – | umgesetzt (bewusst kein Signal) |
| API-5 | `openInBrowser.ts:13-33` (`Promise<void>`) | umgesetzt |
| API-6 | `HtmlPreviewPane.tsx:111-130`, `:134-159`, `:162-172`, `:196`; `MarkdownPreviewPane.tsx:50-88`; `EditorStack.tsx:53-73` | umgesetzt; Abweichungen V1/V2 durch „Wie gebaut“ gedeckt |
| SVC-12 | `browserOpenable.ts:6-40` | umgesetzt (Bildliste nach Entscheidung des Users) |
| SVC-13 | `browserOpenText.ts:12-39` | umgesetzt |
| SVC-14 | `previewHeader.ts:38-68` | umgesetzt |
| SVC-19 | `htmlPreviewSource.ts:21-37`, `:55-77` | umgesetzt (Rückfall je Datei nach Entscheidung des Users) |
| SEC-3 | `openInBrowser.ts:20`; keine Fundstelle unter `src/modules/ai/` | umgesetzt |
| SEC-8 | `HtmlPreviewPane.tsx:83-99` (die Adresse lebt nur in `route`, geloggt wird nur der Status bzw. `String(e)`); `serialize.ts:124-127`; Rust ersetzt die Adresse im Grund von `open_failed` (`mod.rs:359-367`) | umgesetzt |
| SEC-9 | `HtmlPreviewPane.tsx:41-42`, `:199`, `:207`, `:215` | umgesetzt |
| NFR-8 | `PreviewHeader.tsx:43`; `DocViewToggle.tsx:19` | umgesetzt |
| MIG-5 | `DocViewToggle.tsx:19`; einziger Nutzer `PreviewHeader.tsx:74` | umgesetzt (Sweep erfüllt) |
| MIG-6 | `HtmlPreviewPane.tsx:56-241` | umgesetzt |
| MIG-7 | `MarkdownPreviewPane.tsx:39`, `:50-107`, `:108` (Scroll-Container bleibt) | umgesetzt |
| MIG-8 | `EditorStack.tsx:49-118` (Tab ohne Kopfzeile behält die DOM-Form der Base) | umgesetzt |
| MIG-9 | `EditorPane.tsx:464-547` (PDF-Gate und Video/Audio unverändert) | umgesetzt |
| MIG-15 | `FileExplorer.tsx:58-59`, `:806-816` | umgesetzt |
| OB-5 | `HtmlPreviewPane.sandbox.test.ts` (Test vorhanden, Gate grün laut Kontext) | umgesetzt |
| OB-18 | `HtmlPreviewPane.tsx:196` (`key={reloadSeq}`), `:200` (`onLoad`) | umgesetzt |

### Weitere Regeln aus dem Brief

| Regel | Fundstelle | Urteil |
|---|---|---|
| API-8 | `HtmlPreviewPane.tsx:83` (einziger Aufrufer, `{ path, workspace }`); Rust `mod.rs:195-201` | konform (Signatur und IPC-Schlüssel passen) |
| Nahtstellen: `zen_escape_arm`, `terax:zen-escape` | `useZenEscape.ts:25`, `:88`; Rust `zen_escape.rs:10`, `:47`, `:82` | konform (je eine Aufrufer-Datei, Name und Schlüssel `armed` gleich) |
| Nahtstellen: Typen an der Grenze | `types.ts:4-29` gegen Rust `mod.rs` (Status-Werte `snake_case`) | konform |
| Nahtstellen „Unverändert, bewusst“ | `git diff --stat` über `tauri.conf.json`, `capabilities/`, `DocStack.tsx`, `asset.rs`, `PreviewAddressBar.tsx`: leer | konform |
| In-App-Vorschau: Schnitt, Rückfall, Wiederhergestellte Tabs, Neu laden, Wisch-Ausnahme | `htmlPreviewSource.ts:9`, `:31-37`; `HtmlPreviewPane.tsx:76-104`, `:176`, `:196`; `serialize.ts:124-127` | konform; IPC aus dem Rahmen s. F4-1 |
| INV-1 | `tabSwipe.ts:25-44` unverändert | konform |
| INV-2 | `PreviewHeader.tsx:73-80` → `onSetView`; `previewHeader.ts:59-60` (`renderedDisabled` = `dirty`) | konform |
| INV-3, INV-9 | `EditorPane.tsx:485-519` (Rumpf unverändert, nur eingehüllt); `EditorStack.tsx:108-118` | konform |
| INV-4 | `PreviewPane.tsx` (nur die Rahmen-Klasse geändert) | konform |
| INV-10, INV-11 | `App.tsx:1113`, `:1674`, `:1840`; `swipeTab` unverändert | konform (ohne Test, bekannte Grenze) |
| INV-12 | `HtmlPreviewPane.tsx:41-42` | konform |
| INV-13 | `useSidebarPanel.ts:98-111`, `:117-145` (im Zen kein Schreiben; Breite aus `sidebarWidthRef`) | konform; Mac N-22 |
| Q&A 1, 2 (Esc) | `zenEscape.ts:16-26`, `:33-36`; `useZenEscape.ts:58-99`; Überlagerungen `zenEscape.ts:94-127` | konform |
| Q&A 3 (Eingabezeile) | `zenChrome.ts:35-45`, `:65`; `App.tsx:1833`; `ai.toggle` gesperrt `App.tsx:1088-1095`, `:1548-1550` | konform |
| Q&A 5, 11, 25, 27, 28 | `previewHeader.ts:64-66`; `browserOpenText.ts`; `HtmlPreviewPane.tsx:176`; `useSidebarPanel.ts:117-145`; `PreviewHeader.tsx:44` | konform |

---

## Sonderfragen des Briefs

**(a) Volle Breite im Zen.** Über einer HTML-Vorschau bleibt kein Rand und kein `max-width`. Seitenleiste auf 0 px (`useSidebarPanel.ts:117-126`), Griff ausgehängt und Gruppe gesperrt (`App.tsx:1727`, `:1794`), Polster der Arbeitsfläche weg (`WorkspaceSurface.tsx:88-90`), kein Rahmen an der Pane (`HtmlPreviewPane.tsx:179`), `iframe` mit `w-full flex-1 border-none` (`:201`), Eingabezeile verborgen (`App.tsx:1833`). Was oben bleibt, ist nur die Kopfzeile mit der Zen-Taste als Rückweg, wie es die Discovery vorsieht. Nirgends im App-Teil gibt es ein `max-width`; in Streamdown gibt es nur `max-w-full` und `max-w-md` an einzelnen Elementen. Bei Markdown, Bild und PDF bleiben die inneren Polster der Fläche stehen (F4-2).

**(b) Wisch-Ausnahme.** Das Attribut sitzt auf der ganzen sichtbaren HTML-Pane samt Kopfzeile. Liefert `:hover` nichts, greift die Rückfallregel. Die Raw-Ansicht ist ein Code-Tab und wechselt wie bisher. Markdown-Tabellen erkennt weiter `isInsideHorizontalScroller`, weil der Scroll-Container (`MarkdownPreviewPane.tsx:108`) erhalten bleibt. Über dem Rahmen fremder Herkunft prüft das der Mac (N-12).

**(c) Scroll-Hänger.** Er steht weiter nur als Beobachtung da (`architecture.md:760`, `discovery.md:612-617`). Kein Slice hat Code am Scrollen oder an der Sichtbarkeit der Schichten geändert: In `WorkspaceSurface.tsx` sind nur die Polster-Klassen neu, in `useTabSwipe.ts` nur die zusätzliche Rückfrage, der Markdown-Scroll-Container ist unverändert. Die einzige Wirkung ist die gewollte: Gesten, die über einer HTML-Vorschau beginnen, wechseln den Tab nicht mehr, damit fällt H1 für diese Gesten weg. Der Mac-Punkt N-13 steht in `mac-checkliste.md:85`.

**(d) „Per Localhost im Browser öffnen“.** Der Menüeintrag erscheint für alle zehn Endungen der Welle 1, lokal und über SSH, für Dateien und nicht für Ordner, direkt unter „Open with Default App“ (`FileExplorer.tsx:798-816`). Die Taste in der Kopfzeile gibt es für `html`/`htm` (gerendert und Raw), für Rasterbilder und `ico` (Vorschau und Karte) und für `pdf` (Vorschau und SSH-Karte). Bei `svg` fehlt nur die Taste, das ist eine bekannte Grenze aus „Wie gebaut“.

## Modulgrenzen und Startlast

Diese Import-Kanten über Modulgrenzen hinweg sind neu (ohne Tests):
- `zen` → `tabs` (nur Typ), `editor/lib/binaryPreview`, `shortcuts/lib/useShortcutLabel`
- `doc` → `zen/lib/zenStore`, `preview-server/lib/browserOpenable`, `editor/lib/binaryPreview`
- `html` und `markdown` → `doc/PreviewHeader`, `doc/lib/previewHeader`, `preview-server/OpenInBrowserButton`, `zen`
- `editor` → `doc`, `preview-server/OpenInBrowserButton`, `zen`
- `explorer` → `preview-server/lib/{browserOpenable,openInBrowser}`
- `preview`, `app` → `zen`
- `preview-server` → `workspace` (nur Typ)

`preview-server` kennt weder `zen` noch `doc`, `tabs` kennt `zen` nicht. Es gibt keinen Zyklus auf Dateiebene. Den Editor-Barrel importiert keine neue Datei. Der Start-Graph von `src/main.tsx` (statisch, ohne `import()`) wächst gegenüber `cf07327` um diese 14 Dateien: `components/ui/DocViewToggle.tsx`, `modules/doc/PreviewHeader.tsx`, `modules/doc/lib/previewHeader.ts`, `modules/editor/lib/binaryPreview.ts`, drei Dateien aus `preview-server/lib`, sieben aus `zen/`. Neue npm-Pakete kommen nicht dazu. Die schweren Stacks bleiben draußen. Barrel-Auffälligkeiten: F4-4.

## Einstellungen und Persistenz

Der Zen-Zustand ist flüchtig (`zenStore.ts:4`, kein `persist`). Das passt zu Discovery und Plan; die Architektur verlangt keine Speicherung. Nach Zen kommt die Seitenleiste mit der zuletzt vom User gesetzten Breite zurück (`useSidebarPanel.ts:142-144`). Im Zen wird weder `terax.sidebar.collapsed` noch die Breite geschrieben (`:102`, `shouldPersistSidebarWidth`). Gespeicherte Tabs und Spaces enthalten für `html` nur `path` und `workspace` (`serialize.ts:124-127`, Datei im Feature unverändert). Die Rahmen-Adresse lebt nur im Zustand `route` der Pane.

## Eingebauter Agent

Ich habe keinen Weg zu `preview_open_in_browser`, `preview_frame_source` oder `openInBrowser` gefunden:
- Unter `src/modules/ai/**` kommt keiner der Namen und kein Import aus `preview-server` vor.
- Die Werkzeuge in `src/modules/ai/tools/tools.ts:31-42` sind `fs`, `edit`, `search`, `shell`, `subagent`, `terminal`, `todo` und `agent`. Keines davon ruft frei wählbare Tauri-Commands. Die `invoke`-Aufrufe in `ai/lib/native.ts` stehen fest auf `fs_*`, `shell_*` und `git_*`.
- `open_preview` (`terminal.ts:65-93`) öffnet nur einen In-App-Web-Vorschau-Tab auf einer Loopback-Adresse. Den Browser des Systems öffnet es nicht, und eine Adresse mit Geheimnis kann es nicht kennen: Browser-Adressen erreichen die Webview nie, Rahmen-Adressen stehen nur im `src` des `iframe` und sind für kein Werkzeug lesbar.
- `run_command` braucht die Zustimmung des Users und hätte ebenfalls keine Adresse.
- `<terax-command>` (`slashCommands.ts:72-77`) wird nur in Nachrichten des Users ausgewertet.
- Die Test-Brücke (`test_bridge.rs`) gibt es nur im Debug-Build und nur mit einer Umgebungsvariable. Sie gehört nicht zum Agenten und steht nicht im Feature-Diff.

---

## Bindings Net Hits

Keine.

---

## Exceptions Applied (Audit)

Keine.

---

## Prüfmenge

**Geprüft (checked), 32 Produktionsdateien:** `src/app/App.tsx`, `src/app/components/WorkspaceInputBar.tsx`, `src/app/components/WorkspaceSurface.tsx`, `src/components/ui/DocViewToggle.tsx`, `src/modules/doc/PreviewHeader.tsx`, `src/modules/doc/index.ts`, `src/modules/doc/lib/previewHeader.ts`, `src/modules/editor/AiDiffPane.tsx`, `src/modules/editor/EditorPane.tsx`, `src/modules/editor/EditorStack.tsx`, `src/modules/editor/GitDiffPane.tsx`, `src/modules/explorer/FileExplorer.tsx`, `src/modules/html/HtmlPreviewPane.tsx`, `src/modules/html/lib/htmlPreviewSource.ts`, `src/modules/markdown/MarkdownPreviewPane.tsx`, `src/modules/preview-server/OpenInBrowserButton.tsx`, `src/modules/preview-server/index.ts`, `src/modules/preview-server/lib/browserOpenText.ts`, `src/modules/preview-server/lib/browserOpenable.ts`, `src/modules/preview-server/lib/openInBrowser.ts`, `src/modules/preview-server/types.ts`, `src/modules/preview/PreviewPane.tsx`, `src/modules/sidebar/useSidebarPanel.ts`, `src/modules/tabs/lib/tabSwipe.ts`, `src/modules/tabs/lib/useTabSwipe.ts`, `src/modules/zen/ZenToggleButton.tsx`, `src/modules/zen/index.ts`, `src/modules/zen/lib/usePaneFrameClass.ts`, `src/modules/zen/lib/useZenEscape.ts`, `src/modules/zen/lib/zenChrome.ts`, `src/modules/zen/lib/zenEscape.ts`, `src/modules/zen/lib/zenStore.ts`.

**Als Gegenseite der Nähte mitgelesen (nicht im Diff oder außerhalb des Frontends):** `src/modules/spaces/lib/serialize.ts`, `src/modules/doc/DocStack.tsx`, `src/modules/editor/lib/useDocument.ts`, `src/modules/editor/lib/binaryPreview.ts`, `src/modules/tabs/lib/applyDocView.ts`, `src/modules/ai/tools/{tools,terminal}.ts`, `src/modules/ai/lib/{useAiLiveBridge,slashCommands,native}.ts`, `src/app/eager-budget.test.ts` (nur gelesen), `src-tauri/src/modules/zen_escape.rs`, `src-tauri/src/modules/preview_server/mod.rs` (Commands, Grenze, Ersetzen der Adresse), `src-tauri/src/modules/preview_server/policy.rs` (Endungsregel), `src-tauri/src/modules/test_bridge.rs` (Kopf), `TERAX.md`, `react-resizable-panels` 4.15.0 (`disabled` gegen imperatives `collapse`/`resize`). Eigene Analysen, nur lesend, im Scratchpad: statischer Import-Graph über 438 Dateien (Zyklen) und Vergleich des Start-Graphen mit `cf07327` (Basis per `git archive` in den Scratchpad entpackt).

**Nicht geprüft (not_checked):**
- `src/**/*.test.*`: nicht Gegenstand des Briefs; das Gate hat sie gemessen, und Tests laufen zu lassen war ausgeschlossen.
- Rust-Kern über die genannten Nahtstellen hinaus (`grant`, `request`, `policy` jenseits der Endungsregel, `source`, `listener`, `ssh.rs`): andere Teile des Fan-outs.
- `specs/**`: nicht Prüfmenge, nur als Maßstab gelesen.
- Laufzeitverhalten am Mac (WKWebView, Monitor, Layout): auf der Werkbank nicht startbar; offen in F4-1 und in der vorhandenen Mac-Checkliste.

---

## Notes

- Die Fassung „Wie gebaut“ habe ich als maßgeblich genommen, wo sie vom Plan abweicht: V1, V2, `useZenEscape(activeTab)`, Kürzel im `title`, `hidden` statt Klasse, Esc-Endungen ohne `svg`. Keine dieser Abweichungen ist an der Naht schlimmer als beschrieben.
- V1 im Detail: Fragt „Neu laden“ auf dem Rückfall-Weg erneut, setzt das zuerst `route` auf `pending`. Dadurch läuft der Lese-Effekt des Rückfall-Wegs neu, auch wenn die Antwort wieder auf denselben Weg führt (`HtmlPreviewPane.tsx:82`, `:112`, `:135`). Die Taste dreht also nicht dauerhaft.
- Prüfer-Regel P5 eingehalten: Zählungen von Tests und Selektoren habe ich nicht selbst geführt. Die Zahlen zum Start-Graphen und zu den Zyklen stammen aus einer statischen Analyse und sind als solche ausgewiesen.
