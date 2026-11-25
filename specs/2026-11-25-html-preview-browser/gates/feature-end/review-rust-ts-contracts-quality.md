# Post-Implement Review Report

**Feature:** HTML-Vorschau im Browser, Welle 1. Fan-out Teil 2: die Naht zwischen Rust und TypeScript (Verträge, Texte, Listen, Ereignisse)
**Branch:** `html-preview-browser` (Worktree `.claude/worktrees/html-preview-browser`, Stand `f180fa8`)
**Default-Branch:** Basis des Feature-Diffs `cf07327`
**Datum:** 2026-11-25
**Perspektive:** quality+alignment (Teil A und Teil B)
**Prüfmenge:** Rust: `src-tauri/src/lib.rs`, `src-tauri/src/modules/preview_server/mod.rs`, `src-tauri/src/modules/preview_server/policy.rs`, `src-tauri/src/modules/zen_escape.rs`, `src-tauri/tests/preview_contracts.rs`, `src-tauri/capabilities/{default,desktop}.json`, `src-tauri/tauri.conf.json`. TypeScript: `src/modules/preview-server/{types.ts, lib/*.ts, OpenInBrowserButton.tsx, browserOpen.guard.test.ts, types.contract.test.ts}`, `src/modules/html/{HtmlPreviewPane.tsx, lib/htmlPreviewSource.ts}`, `src/modules/zen/lib/{useZenEscape.ts, zenEscape.ts}`. Dazu `TERAX.md` (Punkt 7). Die Gegenstellen außerhalb der Prüfmenge (`ssh.rs`, `source.rs`, `grant.rs`, `request.rs`, `fs/guard.rs`, `workspace.rs`, `App.tsx`, `DocStack.tsx`, `FileExplorer.tsx`) habe ich nur an den Stellen gelesen, die die Naht berühren.

---

## Summary

**Verdict:** PASSED

Ich habe die Urteilsregel aus dem gemeinsamen Kontext angewendet: FAILED genau dann, wenn es einen `decision`- oder `refuted`-Befund gibt. Hier gibt es keinen. Es bleiben 7 nicht blockierende Befunde: 1 × `fix`, 2 × `obligation`, 4 × `note`.

Kurz gesagt: Beide Seiten der Sprachgrenze passen am zusammengeführten Code zueinander. Das betrifft Command-Namen, IPC-Schlüssel, die Form von `workspace`, die Status-Drahtwerte, `reason`/`url` samt `null`, die Liste der öffnbaren Endungen, den Ereignisnamen, die App-CSP und die `frame-ancestors`-Herkünfte. Kein Fehlerweg trägt die Adresse oder das Geheimnis in einen Toast, ein Log oder einen Fehlertext. Ein Tastendruck kann den Zen nicht zweimal schalten, denn beide Wege rufen das idempotente `exitZen`.

### Part A: Code Quality

| Kriterium | Findings |
|-----------|----------|
| A.1 Logic Errors | 1 |
| A.2 Error Handling | 2 |
| A.3 Security | 0 |
| A.4 Anti-Patterns | 0 |
| **Subtotal** | **3** |

### Part B: Codebase Alignment

| Kriterium | Findings |
|-----------|----------|
| B.1 Duplicate Solution Paths | 0 |
| B.2 Abstraction Reuse | 1 |
| B.3 Schema Consistency | 0 |
| B.4 Dead Code / Unused Imports | 0 |
| B.5 Error Handling Divergence | 1 |
| B.6 Configuration Drift | 0 |
| B.7 Interface Inconsistency | 1 |
| B.8 Dependency Direction | 0 |
| B.9 Security Pattern Consistency | 1 |
| B.10 Performance Pattern Consistency | 0 |
| **Subtotal** | **4** |

| **Total** | **7** |

---

## Befunde (JSON)

```json
[
  {
    "id": "F2-01",
    "category": "B.2",
    "class": "note",
    "claim": "Nur ENTRY_EXTENSIONS ist über die Sprachgrenze gegeneinander geprüft. Für die Status-Drahtwerte, die IPC-Schlüssel (path, workspace, armed) und den Ereignisnamen terax:zen-escape hält jede Seite eigene, abgeschriebene Literale; kein Test liest den Quelltext der Gegenseite. Heute stimmen alle Werte überein (am Code verglichen, siehe Punkt 1, 2 und 6). Der Bestand hat für denselben Zweck ein Muster, das den Rust-Quelltext liest (chromeProbe.guard.test.ts).",
    "evidence": "src/modules/preview-server/types.contract.test.ts:9-29 (eigene Literale, kein Lesen von Rust) · src-tauri/tests/preview_contracts.rs:67-149 (serde-Werte gegen eigene Literale), :312-323 (Parameternamen nur gegen Rust-Literal) · src/modules/zen/lib/useZenEscape.ts:14 gegen src-tauri/src/modules/zen_escape.rs:10 und :158-163 · einzige Querlesung: src/modules/preview-server/browserOpen.guard.test.ts:161-174 → src-tauri/src/modules/preview_server/policy.rs:9-11 · Bestandsmuster: src/modules/ports/chromeProbe.guard.test.ts:11-16, :36-43, :103-117 (liest chrome.rs, prüft invoke-Schlüssel gegen die Rust-Parameter) und src/modules/ports/lib/portDetect.test.ts:186-199",
    "evidence_source": "code",
    "expected_observation": "Eine Umbenennung auf nur einer Seite (zum Beispiel FrameStatus::LimitReached per #[serde(rename = \"limit\")] samt Anpassung von preview_contracts.rs, oder ZEN_ESCAPE_EVENT in zen_escape.rs samt Test) lässt types.contract.test.ts, browserOpen.guard.test.ts und pnpm check-types grün.",
    "scenario": "Spätere Änderung einer Seite → beide Suiten bleiben grün. Die In-App-Vorschau landet dann im Zweig für unbekannte Status (htmlPreviewSource.ts:72-76), Open in Browser zeigt bei einem unbekannten Status gar keinen Toast (browserOpenText.ts:17-38 hat keinen default-Zweig, openInBrowser.ts:32), und Esc im Rahmen kommt nie an. Für die Status steht die Lücke schon als bekannte Grenze in slice-00 („Laufzeitteil des TS-Vertragstests vergleicht nur Testkonstanten“). IPC-Schlüssel und Ereignisname nennt die bekannte Grenze nicht.",
    "recommendation": "Ein Guard nach dem Muster von chromeProbe.guard.test.ts: Status-Varianten aus mod.rs (rename_all = snake_case) gegen die Unions in types.ts, Parameternamen der drei Commands gegen die invoke-Schlüssel, und ZEN_ESCAPE_EVENT gegen useZenEscape.ts:14."
  },
  {
    "id": "F2-02",
    "category": "A.2",
    "class": "fix",
    "claim": "Ein Symlink mit öffnbarem Namen, dessen Ziel keine Eintritts-Endung hat (zum Beispiel index.html → index.php oder ein Ziel ohne Endung), bekommt `unsupported` statt `refused` mit dem Grund „the link points to a different kind of file“. Das Frontend zeigt für diese Datei die Taste und den Menüeintrag, weil es nur den Namen prüft, und meldet nach dem Klick „Open in Browser is not available for this file.“. Das ist praktisch der einzige Weg, auf dem `unsupported` den User erreicht. Der Schwesterfall (Ziel mit anderer Eintritts-Art) bekommt den sprechenden Grund.",
    "evidence": "src-tauri/src/modules/preview_server/mod.rs:278-283 (Ziel ohne Art → Denial::Unsupported; Ziel mit anderer Art → Refused(OTHER_KIND_REASON)), :250, :214-217 · src/modules/preview-server/lib/browserOpenable.ts:33-40 (nur der Klickpfad) · src/modules/explorer/FileExplorer.tsx:806-816 · src/modules/preview-server/lib/browserOpenText.ts:20-21",
    "evidence_source": "code",
    "expected_observation": "Lokal `ln -s index.php index.html`, dann Open in Browser an index.html → Toast „Open in Browser is not available for this file.“. Bei `ln -s b.png a.html` kommt dagegen „a.html can't be opened in the browser: the link points to a different kind of file“.",
    "scenario": "Der User sieht die Taste an index.html und klickt. Der Toast behauptet, die Aktion gebe es für diese Datei nicht, obwohl sie eben angeboten wurde. Die Ursache (der Link) wird nicht genannt.",
    "recommendation": "In resolved_kind ein Ziel ohne Eintritts-Art ebenfalls als Refused(OTHER_KIND_REASON) melden, wenn die geklickte Art eine Eintritts-Art war. Die Sicherheit ändert sich nicht (beides lehnt ab), und die In-App-Vorschau fällt in beiden Fällen auf den heutigen Weg."
  },
  {
    "id": "F2-03",
    "category": "A.2",
    "class": "note",
    "claim": "In die Grenze von 256 Freigaben zählen auch die Rahmen-Freigaben der In-App-Vorschau. Jede HTML-Datei, die in der App gezeigt wird, hält eine eigene Freigabe samt Listener bis Prozessende. Ist die Grenze erreicht, meldet Open in Browser für eine neue Datei „Too many browser links are open. Restart Terax to free them.“, auch wenn der User kaum Browser-Links geöffnet hat. Die Vorschau selbst fällt still auf den heutigen Weg. Der Code folgt VAL-11 der Architektur („256 Freigaben“). Die Frage an den User (Q&A 9) und der Toast-Text sprechen aber von Browser-Links.",
    "evidence": "src-tauri/src/modules/preview_server/mod.rs:582-592 (eine Liste für beide Klassen, grants.len() >= limits.grants), :81, :472-481 · src/modules/html/HtmlPreviewPane.tsx:76-104 (fragt bei jedem Einhängen) · src/modules/html/lib/htmlPreviewSource.ts:9, :31-37 · src/modules/preview-server/lib/browserOpenText.ts:34-35 · specs/2026-11-25-html-preview-browser/architecture.md:221 (VAL-11), :881 (Q&A 9)",
    "evidence_source": "code",
    "expected_observation": "Nach 256 verschiedenen HTML-Dateien in der App-Vorschau, ohne einen einzigen Browser-Klick, liefert preview_open_in_browser für eine weitere Datei {status: \"limit_reached\", reason: null}.",
    "scenario": "Langer Terax-Lauf mit vielen KI-Berichten als HTML-Dateien, die in der App angesehen werden → nach 256 Berichten Open in Browser auf den nächsten → Toast „Too many browser links are open“, obwohl kein Browser-Tab offen ist.",
    "recommendation": "PM entscheidet: entweder eine eigene Grenze je Klasse, oder ein Wortlaut, der beide Arten deckt. Am Code ist nichts falsch gegenüber VAL-11."
  },
  {
    "id": "F2-04",
    "category": "B.5",
    "class": "note",
    "claim": "Fehlt die Datei beim Klick, verhält sich der Kern über SSH anders als lokal. Über SSH wird daraus `unreachable` mit dem rohen Python-Text des Helfers samt absolutem entferntem Pfad. Lokal wird daraus `refused` mit „the file cannot be found“. Der Grund: die Helfer-Operationen `realpath` und `stat` melden keine feste Fehlerart (die meldet nur `read_bytes`). Deshalb erreichen die Arme Missing, NotRegularFile und TooLarge von remote_reason den Klick nie. Umgekehrt liefert der lokale Kern nie `unreachable`; der Satz ohne Host in browserOpenText (`host === null`) wird also nie gezeigt.",
    "evidence": "src-tauri/src/modules/ssh.rs:371-373 (os.path.realpath ohne Existenzprüfung), :360-364 (stat wirft OSError ohne Art), :853-861 (kind nur für _Refused), :1741-1749, :1754-1767 · src-tauri/src/modules/preview_server/mod.rs:258-267, :536-541 (stat-Fehler → Unreachable), :312-338 (lokal kein Unreachable), :314-317 · src/modules/preview-server/lib/browserOpenText.ts:29-33",
    "evidence_source": "code",
    "expected_observation": "Über SSH liefert preview_open_in_browser für eine gelöschte Datei {status: \"unreachable\", reason: \"[Errno 2] No such file or directory: '/…/a.html'\"} (gekürzt nach 160 Zeichen). Der Toast lautet „Could not read a.html from devbox: [Errno 2] No such file or directory: '/home/…/a.html'“.",
    "scenario": "Veralteter Explorer-Stand, die Datei ist auf dem Host gelöscht → Klick → Toast mit Python-Errno und absolutem entferntem Pfad. Lokal steht in derselben Lage „a.html can't be opened in the browser: the file cannot be found“. Weder Link noch Geheimnis sind betroffen, und die Vorlage „Could not read …“ für eine gescheiterte Abfrage hat der User entschieden (build-plan Zeile 206).",
    "recommendation": "Entweder `realpath`/`stat` im Helfer strikt und mit fester Art (missing, not_regular) über _Refused melden, dann greifen die vorhandenen Arme, oder die toten Arme samt dem host-losen TS-Zweig als bewusst defensiv kommentieren."
  },
  {
    "id": "F2-05",
    "category": "A.1",
    "class": "obligation",
    "claim": "Esc während einer IME-Komposition behandeln die beiden Wege verschieden. Der DOM-Weg lässt den Tastendruck aus (`isComposing`) und setzt dann auch die 500-ms-Sperre nicht. Der native Weg prüft keine Komposition und reicht das Ereignis unverändert weiter. Daraus folgt am Code: Im Zen über einer HTML-Vorschau beendet Esc mit Fokus in einem Eingabefeld der Seite während einer offenen Komposition (zum Beispiel Kana) den Zen und erreicht zugleich die Seite bzw. das Eingabesystem. Das gilt in beiden Ankunftsreihenfolgen der zwei Wege.",
    "evidence": "src/modules/zen/lib/zenEscape.ts:77-86 · src/modules/zen/lib/useZenEscape.ts:78-83 (lastDomEscapeRef nur nach isPlainEscape), :88-91 · src-tauri/src/modules/zen_escape.rs:31-42, :62-85 · specs/2026-11-25-html-preview-browser/mac-checkliste.md:76 (dritter Fall „notieren“)",
    "evidence_source": "code",
    "expected_observation": "Am Mac: Messseite mit <input>, Zen an, Fokus ins Feld, Eingabe mit offener Komposition, Esc → der Zen endet. Beim Akzent-Wähler (langes Drücken) entscheidet die Fensternummer des Ereignisses: gehört sie zum Wähler-Fenster, liefert window_label None, und es kommt kein Ereignis (zen_escape.rs:80-81, :98-114).",
    "scenario": "User schreibt im Zen japanisch in ein Feld der Vorschau-Seite und bricht die Komposition mit Esc ab → der Zen endet unerwartet.",
    "recommendation": "Ergebnis in der Mac-Prüfung (Checkliste §5, Zeile 76) gegen diese Vorhersage notieren. Ist das Verhalten unerwünscht, entscheidet der User, ob der native Weg eine Komposition erkennen soll."
  },
  {
    "id": "F2-06",
    "category": "B.9",
    "class": "obligation",
    "claim": "Zur weißen Fläche sagt der Code Folgendes. Die App-CSP sperrt den Rahmen nicht (`frame-src 'self' http: …` deckt http://127.0.0.1:* und http://localhost:*). Die Kopfzeile frame-ancestors der Klasse frame nennt die Herkünfte, unter denen die App läuft: `tauri://localhost` im Release- und im dev-variant-Build, zusätzlich `http://localhost:1420` nur im Debug-Build, gleich devUrl mit strictPort. Die Herkunft der Elternseite hängt aber am Build. Ein Debug-Lauf mit `tauri dev` lädt die App von `http://localhost:1420` und prüft frame-ancestors gegen diese http-Herkunft, nicht gegen das eigene Schema `tauri://`. Eine Messung dort sagt nichts darüber, ob WebKit `tauri://localhost` in frame-ancestors anerkennt, und genau davon hängt der Release ab.",
    "evidence": "src-tauri/tauri.conf.json:7 (devUrl), :28 (csp mit frame-src … http:) · vite.config.ts:156-157 (port 1420, strictPort) · package.json:17 (tauri:build:dev-variant = tauri build, also Release) · src-tauri/src/modules/preview_server/policy.rs:20-40, :173-179, :199-201 · src-tauri/src/modules/preview_server/mod.rs:349-356, :472-481 · src/modules/html/HtmlPreviewPane.tsx:193-202 · specs/2026-11-25-html-preview-browser/gates/obligations.md:25 (OB-19: Ursache nur im Debug-Build oder mit Web Inspector sichtbar)",
    "evidence_source": "code",
    "expected_observation": "Release bzw. dev-variant: Elternherkunft tauri://localhost, CSP des Rahmens „frame-ancestors tauri://localhost http://tauri.localhost https://tauri.localhost“. `tauri dev`: Elternherkunft http://localhost:1420, CSP zusätzlich mit http://localhost:1420. Eine Sperre durch frame-src der App-CSP tritt in keiner Variante auf.",
    "scenario": "Die Ursache wird nach OB-19 im Debug-Build mit `tauri dev` gesucht → der Rahmen lädt dort, weil http://localhost:1420 in der Liste steht → der Release bleibt trotzdem weiß, weil `tauri://localhost` anders geprüft wird. Die Messung führt dann auf die falsche Fallback-Stufe oder auf keine.",
    "recommendation": "OB-19 ergänzen: die Ursache in einem Build messen, der von frontendDist lädt (`tauri build --debug`: Herkunft tauri://localhost, Web Inspector vorhanden). In der Konsole zuerst unterscheiden, ob eine frame-ancestors-Meldung steht (dann die Variante ohne frame-ancestors) oder ein Ladefehler zu 127.0.0.1 (dann der localhost-Fallback)."
  },
  {
    "id": "F2-07",
    "category": "B.7",
    "class": "note",
    "claim": "TERAX.md beschreibt die Commands, das Modul preview-server und den Esc-Monitor so, wie sie gebaut sind; ich habe es Satz für Satz am Code geprüft (Punkt 7). Es fehlt nur der In-App-Weg: Jede HTML-Vorschau (lokal und SSH) lädt über preview_frame_source hinter HTML_PREVIEW_VIA_SERVER. Jede Antwort außer ready und jeder gescheiterte Aufruf fällt auf den heutigen Weg. ready kommt nur für HTML. Rahmen-Freigaben zählen in die 256. Im Module layout fehlen dafür Einträge für html/ und doc/.",
    "evidence": "TERAX.md:46, :94 · src/modules/html/lib/htmlPreviewSource.ts:9, :31-37, :55-77 · src-tauri/src/modules/preview_server/mod.rs:503-504, :590 · specs/2026-11-25-html-preview-browser/build-plan.md:227 (der Dirigent zieht die Doku vor dem PR nach)",
    "evidence_source": "code",
    "expected_observation": "`grep -n HTML_PREVIEW_VIA_SERVER TERAX.md` findet nichts; unter „Module layout“ gibt es keinen Eintrag html/ oder doc/.",
    "scenario": "Wer nach TERAX.md arbeitet, hält für die In-App-HTML-Vorschau den Asset-/srcDoc-Weg für den einzigen und sucht bei einer weißen Fläche oder bei „Too many browser links“ nicht beim Mini-Server.",
    "recommendation": "Ein Satz unter preview-server/ oder ein Eintrag html/: In-App-Weg über preview_frame_source, Schalter HTML_PREVIEW_VIA_SERVER (UNTIL M-C), Rückfallregel nach frameRoute, ready nur für HTML, gemeinsame Grenze."
  }
]
```

---

## Findings

### F2-01: Verträge an der Sprachgrenze nur je Seite festgenagelt

**Kategorie:** B.2 · **Klasse:** note

**Problem:** Abgesehen von `ENTRY_EXTENSIONS` liest kein Test den Quelltext der Gegenseite. Status-Drahtwerte, IPC-Schlüssel und Ereignisname stehen auf beiden Seiten als eigene Literale und stimmen heute überein. Eine Änderung auf nur einer Seite bliebe grün.

**Neuer Code:** `src/modules/preview-server/types.contract.test.ts:9-29`, `src-tauri/tests/preview_contracts.rs:67-149`, `:312-323`, `src/modules/zen/lib/useZenEscape.ts:14`
**Bestehendes Pattern:** `src/modules/ports/chromeProbe.guard.test.ts:11-16`, `:36-43`, `:103-117`

**Empfehlung:** Ein Guard nach dem Bestandsmuster, siehe JSON.

---

### F2-02: Symlink auf ein Ziel ohne Eintritts-Endung meldet „not available for this file“

**Kategorie:** A.2 · **Klasse:** fix

**Problem:** `resolved_kind` gibt für ein Ziel ohne Art `Unsupported` zurück und für ein Ziel anderer Art `Refused(OTHER_KIND_REASON)`. Das Frontend bietet die Aktion nach dem Klicknamen an. Im ersten Fall widerspricht der Toast also der eben gezeigten Taste.

**Neuer Code:** `src-tauri/src/modules/preview_server/mod.rs:278-283` · `src/modules/preview-server/lib/browserOpenable.ts:33-40` · `src/modules/preview-server/lib/browserOpenText.ts:20-21`

**Empfehlung:** Ein Ziel ohne Art bei geklickter Eintritts-Art als `Refused(OTHER_KIND_REASON)` melden.

---

### F2-03: Rahmen-Freigaben zehren an den „Browser-Links“

**Kategorie:** A.2 · **Klasse:** note

**Problem:** Beide Klassen teilen sich eine Liste mit 256 Plätzen. Jede HTML-Vorschau in der App belegt einen Platz bis Prozessende. Ist die Grenze erreicht, spricht der Toast von Browser-Links.

**Neuer Code:** `src-tauri/src/modules/preview_server/mod.rs:582-592` · `src/modules/html/HtmlPreviewPane.tsx:76-104` · `src/modules/preview-server/lib/browserOpenText.ts:34-35`

**Empfehlung:** PM entscheidet über den Wortlaut oder eine eigene Grenze je Klasse; der Code folgt VAL-11.

---

### F2-04: Fehlende Datei über SSH: `unreachable` mit Python-Text; tote Fehlerarme auf beiden Seiten

**Kategorie:** B.5 · **Klasse:** note

**Problem:** Die Helfer-Operationen `realpath` und `stat` tragen keine feste Art. Der Klick über SSH meldet deshalb den rohen Errno-Text samt entferntem Pfad. Die Arme `Missing`, `NotRegularFile` und `TooLarge` in `remote_reason` sowie der host-lose `unreachable`-Satz im Frontend werden nie erreicht.

**Neuer Code:** `src-tauri/src/modules/preview_server/mod.rs:258-267`, `:536-541` · `src/modules/preview-server/lib/browserOpenText.ts:29-33`
**Bestehendes Pattern:** `src-tauri/src/modules/ssh.rs:1741-1749` (feste Art nur aus `read_bytes`), lokal `mod.rs:314-317`

**Empfehlung:** Eine feste Art im Helfer einführen oder die toten Arme als bewusst defensiv kennzeichnen.

---

### F2-05: Esc in IME-Komposition: der native Weg beendet den Zen

**Kategorie:** A.1 · **Klasse:** obligation

**Problem:** Der DOM-Weg prüft `isComposing`, der native Weg nicht. Mit Fokus in der Seite beendet Esc den Zen deshalb auch während einer Komposition.

**Neuer Code:** `src/modules/zen/lib/zenEscape.ts:77-86` · `src-tauri/src/modules/zen_escape.rs:31-42`

**Empfehlung:** Die Vorhersage in der Mac-Prüfung (Checkliste §5, Zeile 76) bestätigen oder widerlegen.

---

### F2-06: M-C misst unter `tauri dev` eine andere Elternherkunft als der Release

**Kategorie:** B.9 · **Klasse:** obligation

**Problem:** Die App-CSP und die `frame-ancestors`-Liste passen. Unter `tauri dev` ist die Elternseite aber `http://localhost:1420`, im Release `tauri://localhost`. Die Mac-Messung muss im Build mit eigenem Schema stattfinden.

**Neuer Code:** `src-tauri/src/modules/preview_server/policy.rs:33-40`, `:173-179` · `src-tauri/tauri.conf.json:7`, `:28`

**Empfehlung:** OB-19 um `tauri build --debug` und um die Unterscheidung per Konsole ergänzen.

---

### F2-07: TERAX.md ohne den In-App-Weg der HTML-Vorschau

**Kategorie:** B.7 · **Klasse:** note

**Problem:** Die Beschreibung der Commands und des Monitors ist richtig. Es fehlen der Schalter, die Rückfallregel und die Module `html/` und `doc/`.

**Neuer Code:** `TERAX.md:46`, `:94` · `src/modules/html/lib/htmlPreviewSource.ts:9`, `:55-77`

**Empfehlung:** Einen Satz bzw. einen Eintrag ergänzen (build-plan Zeile 227 weist das dem Dirigenten zu).

---

## Antworten auf die Prüfpunkte

### 1. Commands

- **Namen:** `preview_open_in_browser`, `preview_frame_source` und `zen_escape_arm` sind im Handler registriert (`src-tauri/src/lib.rs:503-505`). Das Frontend ruft sie mit genau diesen Namen auf: `src/modules/preview-server/lib/openInBrowser.ts:20`, `src/modules/html/HtmlPreviewPane.tsx:83`, `src/modules/zen/lib/useZenEscape.ts:25`. Die Commands brauchen keine Capability, weil `build.rs` kein App-Manifest setzt und `removeUnusedCommands` damit nur Plugin-Commands betrifft. `core:event:allow-listen` steht in `capabilities/default.json` für `main`.
- **Parameter:** Rust hat `path: String, workspace: Option<WorkspaceEnv>` (`mod.rs:184-188`, `:195-199`) und `armed: bool` (`zen_escape.rs:47`). Die Namen bestehen aus einem Wort, die camelCase-Wandlung von Tauri ändert also nichts. TS sendet `{ path, workspace }` bzw. `{ armed }`. Das passt.
- **`workspace`:** `undefined` lässt den Schlüssel im JSON weg → `None` → `Local` (`workspace.rs:337-339`). `{kind:"local"}` → `Local`. `{kind:"ssh", host, label?}` → `Ssh { host }`; `label` wird ignoriert, weil `deny_unknown_fields` fehlt (`workspace.rs:320-334`). `{kind:"wsl", distro}` → `Wsl` → `unsupported` (`mod.rs:495`). Das Frontend sendet WSL nie: die Taste ist verborgen (`browserOpenable.ts:37-38`), und der Rahmen wird für WSL gar nicht erst angefragt (`htmlPreviewSource.ts:35`). Die fs-Commands im Bestand machen es genauso.
- **Fehlerweg `Err(String)`:**
  - Eine Blocking-Aufgabe bricht ab: „preview server task failed: …“ (`mod.rs:269-273`).
  - Bind oder Umwandlung des Listeners scheitert: „could not start the preview server: …“ (`mod.rs:598-611`).
  - Kein Zufall vom System: „no randomness from the OS: …“ (`grant.rs:74`, `mod.rs:613`).

  Daraus macht das Frontend beim Browser den Toast „Could not open the browser: {Fehlertext}“ (`browserOpenText.ts:42-44`, Wortlaut vom User entschieden, build-plan Zeile 204). Beim Rahmen gibt es ein `console.warn` mit dem Fehlertext und den Rückfall (`HtmlPreviewPane.tsx:93-99`).
- **Keine Adresse in Fehlertexten:** Die Adresse entsteht erst in `entry_url` (`mod.rs:349-356`), also nach allen `Err`-Stellen der Freigabe. Fehler des Openers gehen durch `scrub_link` (`mod.rs:363-375`). Bricht die Opener-Aufgabe ab, kommt der feste Grund (`mod.rs:384-393`). `console.info` nennt nur den Status (`HtmlPreviewPane.tsx:86-90`).
- **`zen_escape_arm(armed)`:** ein synchroner Command ohne Rückgabe; das Frontend fängt Fehler mit `console.warn` ab (`useZenEscape.ts:24-28`). Selbst wenn ein `false` verloren ginge oder später einträfe, bliebe das harmlos: der Handler prüft Zen und Tab-Art selbst neu (`useZenEscape.ts:65-76`).

### 2. Statuswerte und Felder

- **`BrowserOpenStatus`:** In Rust `Opened | Unsupported | Refused | TooLarge | Unreachable | LimitReached | OpenFailed` mit `rename_all = "snake_case"` (`mod.rs:134-144`). Das ergibt `opened | unsupported | refused | too_large | unreachable | limit_reached | open_failed`, genau die Union in `types.ts:4-11`.
- **`FrameStatus`:** `ready | unsupported | refused | too_large | unreachable | limit_reached` (`mod.rs:155-164`), gleich `types.ts:16-22`.
- **Felder:** Die Structs nutzen `rename_all = "camelCase"` auf einwortigen Feldern, also gleiche Schlüssel. `Option` hat kein `skip_serializing_if` und wird zu `null`, passend zu `string | null`.
- **`url` und `reason`:** `url` gibt es nur bei `Ready` (`mod.rs:474-478`), sonst `None` (`mod.rs:226-239`). `reason` ist nur bei `Refused`, `Unreachable` und `OpenFailed` gesetzt (`mod.rs:214-224`, `:388-406`). Das passt zu den Kommentaren `types.ts:13` und `:24`.
- **Testdeckung:** Die Tests prüfen die Seiten nicht gegeneinander, außer bei `ENTRY_EXTENSIONS` (F2-01).

### 3. Tabelle Lage × Command (echter Kern → Frontend)

Die Beispiele verwenden `a.html` und den Platzhalter-Host `devbox`. „Heutiger Weg“ heißt: lokal `asset`, über SSH `srcdoc` (`htmlPreviewSource.ts:21-25`, `:55-77`).

| Lage | Rust-Stelle | `preview_open_in_browser`: Status / Grund | Toast (`browserOpenText`) | `preview_frame_source` → `frameRoute` |
|---|---|---|---|---|
| Endung nicht öffnbar (`x.txt`) | `mod.rs:490-493` | `unsupported` / null | „Open in Browser is not available for this file.“ Kommt so nie: Taste und Menü sind verborgen (`browserOpenable.ts:33-40`, `FileExplorer.tsx:806-807`) | `unsupported` → heutiger Weg (HTML-Tabs gibt es nur für html/htm) |
| WSL | `mod.rs:495` | `unsupported` / null | wie oben, kommt so nie (`browserOpenable.ts:37-38`) | nicht gefragt (`htmlPreviewSource.ts:35`) → srcdoc |
| Gesperrter Name oder Ordner (`~/.ssh/…`, `.git`, Geheimnis-Muster) | lokal `mod.rs:313`, `:319`; SSH `:518-520`, `:529-531`; Texte `fs/guard.rs:183`, `:201`, `source.rs:28` | `refused` / „path is inside a protected directory (.ssh)“, „path is inside a .git folder“, „"{base}" matches a sensitive-file pattern“ | „a.html can't be opened in the browser: path is inside a protected directory (.ssh)“. Beim Muster steht der Name doppelt: „x.html can't be opened in the browser: "x.html" matches a sensitive-file pattern“ | `refused` → heutiger Weg (User-Entscheid, build-plan Zeile 201) |
| Symlink, Ziel mit anderer Eintritts-Art (neuer Grund) | `mod.rs:281-283`, `:250` | `refused` / „the link points to a different kind of file“ | „a.png can't be opened in the browser: the link points to a different kind of file“, liest sich richtig | `refused` → heutiger Weg |
| Symlink, Ziel ohne Eintritts-Endung | `mod.rs:280` | `unsupported` / null | „Open in Browser is not available for this file.“, obwohl die Taste sichtbar war (**F2-02**) | `unsupported` → heutiger Weg |
| Zielname nicht auslieferbar (Steuerzeichen, Backslash) | `mod.rs:284-286`, `request.rs:141-150` | `refused` / „the file name cannot be served“ | „… can't be opened in the browser: the file name cannot be served“ | `refused` → heutiger Weg |
| Zu groß | lokal `mod.rs:325-327`; SSH `:546-548` | `too_large` / null | „a.html is larger than 10 MB and can't be opened in the browser.“ | `too_large` → heutiger Weg (lokal lädt Asset die Datei trotzdem; SSH zeigt die toolarge-Meldung von `fs_read_file`) |
| Fehlt, lokal | `mod.rs:314-317` | `refused` / „the file cannot be found“ | „a.html can't be opened in the browser: the file cannot be found“ | `refused` → Asset |
| Fehlt, SSH | `ssh.rs:371-373` (realpath ohne Existenzprüfung), `:360-364`, `:853-861`; `mod.rs:536-541` | `unreachable` / „[Errno 2] No such file or directory: '/…/a.html'“ (bis 160 Zeichen) | „Could not read a.html from devbox: [Errno 2] No such file or directory: '/home/…/a.html'“ (**F2-04**) | `unreachable` → srcdoc → „Failed to read file: …“ |
| Ordner | lokal `mod.rs:322-324`; SSH `:543-545` | `refused` / „not a regular file“ | „a.html can't be opened in the browser: not a regular file“ (der Explorer bietet Ordner nicht an, `FileExplorer.tsx:806`) | `refused` → heutiger Weg |
| Unechte PDF | lokal `mod.rs:328-330`, `source.rs:29`; SSH erst beim Abruf | lokal `refused` / „not a real PDF“; SSH `opened`, der Browser zeigt die 403-Seite „Refused by Terax“ | „x.pdf can't be opened in the browser: not a real PDF“ | n/a |
| Lese- oder Metadatenfehler, lokal | `mod.rs:321`, `:328` | `refused` / io-Text (z. B. „Permission denied (os error 13)“) | „a.html can't be opened in the browser: Permission denied (os error 13)“ | `refused` → Asset |
| SSH nicht erreichbar | `ssh.rs:1158-1182`, `:1016-1046`; `mod.rs:524-527` | `unreachable` / z. B. „Connection refused — the host isn't accepting SSH on that address/port.“ | „Could not read a.html from devbox: Connection refused — the host isn't accepting SSH on that address/port.“ | `unreachable` → srcdoc (Lesefehler) |
| Abgelehnte Sitzung (MaxSessions) | `ssh.rs:1694`, `:1700-1705`, `:1756-1759` | `unreachable` / „the SSH server refused another session (MaxSessions limit)“ | „Could not read a.html from devbox: the SSH server refused another session (MaxSessions limit)“ | `unreachable` → srcdoc |
| SSH-Abfrage über 30 s (realpath/stat) | `ssh.rs:959`, `:1734`; `mod.rs:258-262` | `unreachable` / bereinigter Host-Text | „Could not read a.html from devbox: {Text}“ | `unreachable` → srcdoc |
| Home des Hosts nicht ermittelbar (nur HTML) | `mod.rs:549-553` | `unreachable` / Host-Text | wie oben | `unreachable` → srcdoc |
| 256 Links | `mod.rs:590-592` | `limit_reached` / null | „Too many browser links are open. Restart Terax to free them.“ Zählt auch Rahmen-Freigaben (**F2-03**) | `limit_reached` → heutiger Weg |
| Opener scheitert | `mod.rs:400-407`, `:363-375` | `open_failed` / Text ohne Link (`<link>`) oder fest „the default browser could not be started“ | „Could not open the browser: {Text}“ bzw. „Could not open the browser: the default browser could not be started“ (doppeltes „browser“, liest sich aber richtig) | n/a |
| Opener-Aufgabe bricht ab | `mod.rs:384-393` | `open_failed` / „the default browser could not be started“ | „Could not open the browser: the default browser could not be started“ | n/a |
| Innerer Fehler (Aufgabe, Bind, Zufall) | `mod.rs:269-273`, `:598-613` | `Err(String)` | „Could not open the browser: could not start the preview server: …“ bzw. „…: preview server task failed: …“ (Vorlage vom User entschieden) | `call_failed` → `console.warn` + heutiger Weg |
| Bild oder PDF als Rahmen | `mod.rs:503-504` | n/a | n/a | `unsupported` → heutiger Weg (kommt nicht vor: `HtmlPreviewPane` gibt es nur für HTML-Tabs) |
| Erfolg | `mod.rs:395-399`, `:474-478` | `opened` / null | kein Toast | `ready` + `url` → Server-Rahmen |

**Lesbarkeit der Toasts:** Alle zusammengesetzten Sätze lesen sich richtig. Auffällig sind nur drei Stellen: der doppelte Name beim Geheimnis-Muster, das doppelte „browser“ beim festen Opener-Grund und der rohe Errno-Text über SSH. Host-Texte werden zweimal bereinigt: `host_reason` ersetzt Steuer- und Richtungszeichen und kürzt auf 300 Zeichen (`ssh.rs:1709-1729`), danach kürzt `clean_detail` auf 160 Zeichen mit „…“ (`source.rs:117-127`).

**Status ohne Lage oder Lage ohne passenden Text:** Jeder der sieben Browser-Status kommt im echten Kern vor. `unsupported` erreicht den User aber nur über den Symlink-Fall (F2-02). `unreachable` kommt lokal nie vor; der host-lose Satz `browserOpenText.ts:31` bleibt toter Code (F2-04). Bei einem unbekannten Status auf dem Draht zeigt `openInBrowser` gar keinen Toast, denn `browserOpenText` hat keinen default-Zweig und `if (text)` greift nicht. `frameRoute` dagegen warnt und fällt auf den heutigen Weg (F2-01, Szenario).

### 4. „Öffnbar“ auf beiden Seiten

- **Listen:** Die Listen sind gleich: `browserOpenable.ts:6-8` und `policy.rs:9-11`.
- **Regel für die Endung:** Beide nehmen das letzte Segment, trennen an `/` und `\`, verlangen einen nicht leeren Stamm vor dem letzten Punkt und schreiben klein. TS nutzt `toLowerCase`, Rust `to_ascii_lowercase`; für die zehn ASCII-Endungen ist das dasselbe (`browserOpenable.ts:22-26`, `policy.rs:71-76`). Fälle wie `.html`, `a.`, `x.HTML` und `..html` behandeln beide Seiten gleich.
- **Arten:** Jede Endung der Liste hat eine Art in `entry_kind` (`policy.rs:86-91`). Der Rust-Test `ac9_only_entry_extensions_are_entries_in_wave_one` (`policy.rs:255-283`) hält das fest.
- **Abweichungen:** Taste sichtbar, aber `unsupported` vom Kern gibt es nur beim Symlink auf ein Ziel ohne Eintritts-Endung (F2-02). Ein Ordner mit `.html`-Namen bekommt `refused`; der Explorer bietet Ordner nicht an. Den umgekehrten Fall, dass der Kern annähme und das Frontend die Taste verbirgt, gibt es nicht.
- **Guard-Test am echten `policy.rs`:** Ich habe den regulären Ausdruck aus `browserOpen.guard.test.ts:161-174` mit Node gegen die gemergte Datei ausgewertet. Er liefert genau die zehn Werte. Die Datei enthält kein `/*`, und `ENTRY_EXTENSIONS` steht vor dem ersten String mit `//` (`"tauri://localhost"`, `policy.rs:36`). Der Kommentar-Entferner kennt keine Strings und schneidet jene Zeile ab, das wirkt aber erst hinter der Konstante. Der Test liest also nicht still etwas anderes.

### 5. Die Rahmen-Adresse

- **Form der Adresse:** `http://127.0.0.1:{port}/{token}/{Name kodiert}` (`mod.rs:349-356`, `grant.rs:34-39`); mit dem Mess-Schalter `localhost:{port}` (`mod.rs:593-597`, aus, `mod.rs:40`).
- **Was `HtmlPreviewPane` damit tut:** Die Adresse geht nur in `src` des Rahmens. `key={reloadSeq}` baut beim Neuladen einen neuen Rahmen mit derselben Adresse; `no-store` erzwingt ein neues Lesen. `title` trägt den Pfad, nicht die Adresse (`HtmlPreviewPane.tsx:193-202`). Relative Verweise lösen unter `/{token}/` auf.
- **App-CSP:** `frame-src 'self' http: https: asset: https://asset.localhost` deckt `http://127.0.0.1:*` und `http://localhost:*` (`tauri.conf.json:28`). Die App-CSP sperrt den Rahmen also nicht. Mixed Content entsteht nicht, weil `tauri://` kein https ist.
- **`frame-ancestors` der Klasse `frame`:** `tauri://localhost http://tauri.localhost https://tauri.localhost`, im Debug-Build zusätzlich `http://localhost:1420` (`policy.rs:33-40`, `:173-179`). Unter macOS läuft die App im Release und im dev-variant-Build (`package.json:17`, `tauri build`) unter `tauri://localhost`, unter `tauri dev` unter `http://localhost:1420` (`tauri.conf.json:7`, `vite.config.ts:156-157`, strictPort). Die Liste passt in beiden Fällen.
- **Wo die weiße Fläche entstehen kann:** Ob WebKit `tauri://localhost` als Quellausdruck in `frame-ancestors` gegen die Herkunft des eigenen Schemas anerkennt, ist am Code nicht zu sehen. Unter `tauri dev` wird es nicht gemessen (F2-06).
- **Fehlerpages:** Fehlerseiten der Klasse `frame` tragen die träge CSP ohne `frame-ancestors` (`listener.rs:76-89`, `policy.rs:203-205`) und dürfen deshalb im Rahmen erscheinen.

### 6. Esc-Ereignis

- **Name:** Beide Seiten verwenden `terax:zen-escape` (`zen_escape.rs:10`, `useZenEscape.ts:14`). Die Nutzlast `()` kommt als `null` an (`listen<null>`).
- **Scharfschalten:** Scharf nur bei `zenOn && showsPreview(activeTab)` (`zenEscape.ts:52-57`): `html`, `markdown`, Editor mit Bild ohne SVG oder mit PDF. Die Raw-Ansicht ist ein `editor`-Tab mit `.html` und bleibt deshalb unscharf (`applyDocView.ts:30-43`).
- **Entschärfen:** Beim Verlassen des Zen, beim Tab-Wechsel und beim Aushängen über das Cleanup des Effekts (`useZenEscape.ts:58-62`). Der einzige Aufruf steht in `App.tsx:976`.
- **Listener:** Genau ein Listener, im Effekt mit `[]`. `disposed` und `unlisten` decken StrictMode, Remount und Fast Refresh ab (`useZenEscape.ts:86-104`).
- **Zweimal wirken:** Das geht nicht. Beide Wege rufen `exitZen`, und das ist idempotent (`zenStore.ts`: setzt nur, wenn `on`). Ein Tastendruck kann den Zen also nicht wieder einschalten. Die 500-ms-Sperre schützt den Fall, dass der DOM-Weg zuerst ankommt (Dialog per Esc geschlossen, das IPC-Ereignis kommt danach). Kommt das native Ereignis zuerst, ist der Dialog noch offen, und `isOverlayOpen` hält den Zen.
- **Reihenfolge der Wege:** Welche Reihenfolge Tauri und WebKit wirklich liefern, war hier nicht prüfbar; der Quelltext von `tauri-runtime-wry` liegt auf der Werkbank nicht vor. Das Ergebnis ist in beiden Reihenfolgen gleich, und Checkliste §5 Zeile 74 prüft es am Mac.
- **Ein hängender Schalter in Rust** (Neuladen, verlorenes `false`) wirkt nicht: der Handler prüft neu.
- **Einzige Abweichung zwischen den Wegen:** die IME-Komposition (F2-05).

### 7. Alignment `TERAX.md`

Ich habe jeden Satz der neuen Absätze am Code geprüft. Diese Aussagen stimmen:

- Schlüssel der Freigabe und Wiederverwendung, 256 Freigaben, Listener je Freigabe, kein Socket vor der ersten Nutzung (`mod.rs:582-631`).
- Form der Adresse, 404 bei falschem Geheimnis, 400/421 zum `Host`, nur GET/HEAD (`request.rs:22-40`, `listener.rs:217`).
- Reichweite und Prüfkette.
- SSH-Lesen mit 60 s und die Klickprüfung über `realpath_typed`/`stat_typed`.
- Kopfzeilen je Art (`policy.rs`).
- Opener auf der Rust-Seite, Antwortformen und Status.
- „No capability entry is needed“.
- `zen_escape_arm` samt Monitor nach dem Wisch-Monitor (`lib.rs:373-375`).
- Zen-Absatz und Esc-Regel.
- `preview-server/` mit Guard und einzigem Aufrufer.
- Wisch-Ausnahme mit `data-no-tab-swipe` (`HtmlPreviewPane.tsx:176`) und `defersToActivePreview` (`tabSwipe.ts:52-57`).

Der Text von slice-00 gilt also auch nach dem Bau. Es fehlt nur der In-App-Weg (F2-07). Ungenau, aber kein Befund: Ohne ermittelbares Home gibt eine HTML-Freigabe nur die Datei frei (`mod.rs:292-309`); `TERAX.md:46` nennt dafür nur Home, Wurzel und „oberhalb des Home“.

---

## Prüfmenge

**checked** (gegen alle Kriterien A.1–A.4 und B.1–B.10 an der Naht):
`src-tauri/src/lib.rs`, `src-tauri/src/modules/preview_server/mod.rs` (Produktionsteil vollständig, Testkit nur angesehen), `src-tauri/src/modules/preview_server/policy.rs`, `src-tauri/src/modules/zen_escape.rs`, `src-tauri/tests/preview_contracts.rs`, `src-tauri/capabilities/default.json`, `src-tauri/capabilities/desktop.json`, `src-tauri/tauri.conf.json`, `src/modules/preview-server/types.ts`, `src/modules/preview-server/lib/browserOpenText.ts`, `src/modules/preview-server/lib/browserOpenable.ts`, `src/modules/preview-server/lib/openInBrowser.ts`, `src/modules/preview-server/lib/browserOpenText.test.ts`, `src/modules/preview-server/OpenInBrowserButton.tsx`, `src/modules/preview-server/browserOpen.guard.test.ts` (Abschnitte Quelltext-Auslesen, Aufrufer, Capabilities), `src/modules/preview-server/types.contract.test.ts`, `src/modules/html/HtmlPreviewPane.tsx`, `src/modules/html/lib/htmlPreviewSource.ts`, `src/modules/zen/lib/useZenEscape.ts`, `src/modules/zen/lib/zenEscape.ts`, `TERAX.md` (neue Absätze).

**not_checked:**

| Datei / Bereich | Grund |
|---|---|
| `src/modules/preview-server/lib/{browserOpenable,openInBrowser}.test.ts`, `src/modules/zen/lib/useZenEscape.test.ts` | Nur nach Namen und Schlüsseln durchsucht, nicht vollständig gelesen; die Tests sind im Slice-Gate geprüft |
| `listener.rs`, `request.rs`, `source.rs`, `grant.rs`, `ssh.rs`, `fs/guard.rs`, `workspace.rs` | Außerhalb der Prüfmenge; nur die Stellen gelesen, die Gründe, Fehlerarten und Formen der Naht liefern (Slice-Reviews, 428 Socket-Fälle) |
| `App.tsx`, `DocStack.tsx`, `applyDocView.ts`, `FileExplorer.tsx`, `EditorPane.tsx`, `EditorStack.tsx` | Außerhalb der Prüfmenge; nur Verdrahtung von `useZenEscape`, `workspace` und Taste angesehen |
| macOS-Verhalten (Monitor, Rahmen, CSP-Auswertung in WebKit, Reihenfolge von Ereignis und `keydown`) | Die App startet auf der Werkbank nicht; kein Build erlaubt. Als `obligation` geführt (F2-05, F2-06) |
| Quelltext von `tauri`, `tauri-runtime-wry`, `tauri-plugin-opener` | Liegt auf der Werkbank nicht vor (kein Register-Cache). Fehlertext des Openers und Ausführungsreihenfolge von `emit` sind daher nicht am Abhängigkeitscode belegt |

**Beobachtung außerhalb der Prüfmenge (kein Befund):** Im Bauplan steht für slice-02 unter „Wie gebaut“ noch „(leer bis zum Merge)“ (`build-plan.md:725-727`), obwohl `f180fa8` der Merge von slice-02 ist.

---

## Changed Files

Zahlen aus `git diff --numstat cf07327...f180fa8`:

| File | Lines Changed | Findings |
|------|---------------|----------|
| `src-tauri/src/lib.rs` | +9 −2 | 0 |
| `src-tauri/src/modules/preview_server/mod.rs` | +1877 −0 | F2-02, F2-03, F2-04 |
| `src-tauri/src/modules/preview_server/policy.rs` | +375 −0 | F2-06 |
| `src-tauri/src/modules/zen_escape.rs` | +208 −0 | F2-05 |
| `src-tauri/tests/preview_contracts.rs` | +355 −0 | F2-01 |
| `src-tauri/capabilities/*`, `src-tauri/tauri.conf.json` | unverändert | F2-06 (Bezug) |
| `src/modules/preview-server/types.ts` | +29 −0 | 0 |
| `src/modules/preview-server/types.contract.test.ts` | +94 −0 | F2-01 |
| `src/modules/preview-server/browserOpen.guard.test.ts` | +443 −0 | F2-01 (Bezug) |
| `src/modules/preview-server/lib/browserOpenText.ts` | +44 −0 | F2-02, F2-03, F2-04 |
| `src/modules/preview-server/lib/browserOpenable.ts` | +40 −0 | F2-02 |
| `src/modules/preview-server/lib/openInBrowser.ts` | +33 −0 | 0 |
| `src/modules/preview-server/OpenInBrowserButton.tsx` | +42 −0 | 0 |
| `src/modules/html/HtmlPreviewPane.tsx` | +138 −37 | F2-03, F2-06 |
| `src/modules/html/lib/htmlPreviewSource.ts` | +77 −0 | F2-07 |
| `src/modules/zen/lib/useZenEscape.ts` | +106 −0 | F2-01, F2-05 |
| `src/modules/zen/lib/zenEscape.ts` | +128 −0 | F2-05 |
| `TERAX.md` | +8 −2 | F2-07 |
