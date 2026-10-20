# Feature: Upstream-Sync Runde 4 (crynta v0.9.0, ohne Ghostty)

**Epic:** --
**Issue:** -- _(Issues sind im Fork `tharshan09/terax-ai` deaktiviert; Rückverfolgung über diesen Ordner und die PRs.)_
**Status:** Ready
**Wireframes:** -- (UI-Änderungen sind klein und folgen bestehenden Mustern)

Vorgänger: `specs/upstream-sync-0.8.6/` (Runde 3). Upstream-Stand dieser Bewertung: `upstream/main` = `5502f82` (19.10.2026), Release v0.9.0 vom 16.10.2026. Zuletzt bewertet: `47d3c8b`. Fork: `main` = `67120d9`, Version 0.8.6. merge-base bleibt `d77476e`.

---

## Problem & Solution

> No requirement IDs — context

**Problem:**
- Upstream v0.9.0 bringt 122 neue Commits (576 Dateien, +98k/−11k Zeilen). Der Kern ist der Austausch von xterm.js durch ein Ghostty-Terminal (WASM + WebGPU) mit neuem PTY-Transport.
- Genau diese Schicht trägt ~5,5k Zeilen Fork-Anpassungen (tmux pro Pane, SSH-Reconnect, Cmd+Klick-Pfade, OSC-52-Policy, Pane-Dimmen, Renderer-Pool). Ghostty zu übernehmen wäre ein Neuaufbau in 5–7 Wellen mit 105 Konfliktdateien.
- Ghostty ist upstream noch unreif auf macOS: #1372 (unscharf, Schrift ignoriert, keine Links, `:` in nvim tot), #1365 (langsamer), #1364 (Scrollen zu schnell), #1362 (Claude Code läuft bei Splits über). Laut Upstream-Doku verliert WebKit ab dem 9. Terminal den schnellen WASM-Speicher (~1,8× langsamer parsen); der User arbeitet mit >10 Claude-Code-Sessions.
- Daneben enthält 0.9.0 eigenständige Verbesserungen, die der Fork ohne Ghostty nutzen kann: eine offene SSRF-Lücke im AI-HTTP-Proxy, ⌘S-Zuverlässigkeit, Media-Previews, Einfügen aus dem Finder, Leerlauf- und Start-Perf.

**Solution:**
- Ghostty mit klaren Wiedervorlage-Kriterien parken (BR-14).
- Eine Sync-Welle mit Kern-Picks, Finder-Einfügen (lokal + SSH, Finder-Benennung) und vier Perf-Stücken in Fork-tauglicher Variante. Version 0.8.7.

**Business Value:**
- Sicherheitslücke geschlossen (SSRF über IPv6-verpackte Loopback-/Metadaten-Adressen).
- Weniger Leerlauf-CPU und schnellerer Start bei vielen parallelen Agent-Sessions.
- Dateien aus dem Finder per ⌘V in den Workspace, auch remote.
- Fork bleibt stabil auf dem bewährten Terminal, bis Ghostty reif ist.

---

## Scope & Boundaries

> No requirement IDs — context

| In Scope |
|----------|
| Clean Picks: `f885631` (grep-matcher raus), `d3c8fd7` (Inline-Code-Schrift Markdown), `e8f9fcd` (CI-Checkout ohne gespeicherte Credentials, HEAD-Seite behalten) |
| SSRF-Härtung aus `11343a1`, nur der `net/ip.rs`-Teil |
| ⌘S auf App-Ebene (`4cfc202`, Handarbeit) |
| Media-Previews pausieren und ausblenden (`5502f82`, Handarbeit) |
| Dateien aus der OS-Zwischenablage in den Explorer einfügen (`2723dc6`, Handarbeit), lokal und SSH |
| Finder-Benennung bei Namensgleichheit für Einfügen UND bestehenden Finder-Drop |
| Perf aus `f6f0004`: Animationen pausieren (Fork-Variante), Explorer-Watcher nur bei sichtbarem Explorer, `git status` nur für sichtbare Konsumenten, Lazy-Start (AI-SDK, Editor, Icon-Set) mit Build-Budget-Test |
| Test-Commits: `d766567` (iconResolver), `258d119` (applyTheme), `13ded38` (customThemes) |
| Deps auf v0.9.0-Niveau regenerieren (u.a. tauri 2.12, react 19.3, vite 8.3, `dirs` 6→7) |
| Version 0.8.7 |

| Out of Scope |
|--------------|
| Ghostty-Terminal, WebGPU/WebGL-Renderer, PTY-Transport v2 (`0a6e511`, `ddd42a9`, `d2b5f87`, `8463539`, PTY-Teil von `11343a1`) — geparkt, siehe BR-14 |
| Ghostty-Folgefixes: `86a230b`, `c8affd4`, `478ac27`, `5507dfb`, `a30b0fa`, `c69b07e`, `0d9937f` |
| AI-Teile: `f99105d` (AI-Transport, Persistenz), `ai_sessions.rs`, AI-Teil von `f6f0004` (content-visibility im Chat) — AI-Features depriorisiert |
| Settings-Webview schließen statt verstecken (`f6f0004`) — Risiko mit bekanntem Quit-Abbruch-Thema des Settings-Fensters |
| Vibrancy-Default aus (`f6f0004`) — reine Optik, UI-Redesign nicht im Fork |
| `fd21291` (Watcher-Listing-Filter) und `39fa919` (Suche nach Kopie invalidieren) — hängen am Watcher-/Index-Umbau aus `0a6e511` |
| `ff20d93` (natives Text-Clipboard) — Fork hat eigenen NSPasteboard-Weg |
| `e09c030` (Knip-Bereinigung), `a52d03a` (Page-Tile beim Fenster-Drag, gemessen nur mit WebGPU-Canvas) |
| Windows/Linux-Fixes (`a9c8a92`, `8e013b0`, `c510c96`, `d0b569c`, `815a53b`) |
| Offene Upstream-PRs #1368, #1369, #1370, #1367, #1371 — bewusst nicht in dieser Welle |
| Explorer-Mehrfachauswahl, CLI Control Plane, Nested Git, UI-Redesign (seit Runde 3 geparkt, unverändert) |
| Finder-Einfügen von Text/Bildern (nur Dateien und Ordner) |

---

## Current State Reference

> No requirement IDs — context

- Finder-Drop in den Explorer: `src/modules/explorer/lib/useExplorerFileDrop.ts` — Ziel = Ordner unter dem Zeiger, Datei → deren Ordner, freie Fläche → Wurzel; Zielmarkierung beim Ziehen; Fehler-Toast `Copy failed: {error}`.
- Kopieren lokal: `fs_copy` in `src-tauri/src/modules/fs/mutate.rs` — Ziel auf freigegebene Workspace-Wurzeln begrenzt, Quellen beliebige lokale Pfade, verweigert existierende Ziele inkl. hängender Symlinks, bricht beim ersten Fehler ab.
- Kopieren SSH: `ssh::copy` in `src-tauri/src/modules/ssh.rs` — lädt rekursiv hoch, verweigert existierende Ziele.
- Explorer-Watcher: `src/modules/explorer/lib/watch.ts` (`fs_watch_add`/`fs_watch_remove`, Event `fs:changed`).
- Git-Status-Konsumenten: Source-Control-Panel, Git-Tabs (Diff/History/Commit-Datei), Explorer-Git-Farben (`useGitStatus.ts`), Statusleisten-Widgets `git-branch`, `git-sync`, `git-changes`, `git-staged` (`statusbar/widgets/GitWidgets.tsx`, über `ctx.sourceControl`).
- Editor-Speichern: `Mod-s`-Keybinding im CodeMirror (`EditorPane.tsx:241`, `saveRef`).
- Media-Preview (Video/Audio) im Editor: `EditorPane.tsx`.
- Agent-Spinner in Tabs und Mission Control, Shimmer/Puls-Effekte: CSS-Animationen in `globals.css`.
- Versionsanzeige: About-Bereich der Einstellungen (Version + eingebetteter Commit, `build_info`).
- SSRF-Prüfung: `ip_kind` in `src-tauri/src/modules/net.rs` (alte Fassung ohne Auflösung eingebetteter IPv4).

---

## UI Patterns

> No requirement IDs — context

### Reused Patterns

| Pattern Type | Component | Usage in this Feature |
|--------------|-----------|----------------------|
| Context-Menü mit Shortcut-Hinweis | `ContextMenuShortcut` in `FileExplorer.tsx` | neuer Eintrag `Paste` mit `⌘V` |
| Toast | `sonner` (`toast.message`, `toast.error`) | Leere Zwischenablage, Teilfehler, Totalfehler |
| Explorer-Auswahl + Aufklappen | `FileExplorer.tsx` Selection-State | neu eingefügte Elemente markieren |

### New Patterns

| Pattern Type | Description | Rationale |
|--------------|-------------|-----------|
| Fenster-Sichtbarkeits-Zustand | App-weiter Zustand „Fenster unsichtbar“ (minimiert, verdeckt, anderer Space), an dem Animationen und Media-Previews hängen | Upstream koppelt an Fokus; der Fork braucht Sichtbarkeit (BR-9) |

---

## User Flow

### Einfügen aus dem Finder
1. FL-1: User kopiert im Finder eine oder mehrere Dateien/Ordner (⌘C).
2. FL-2: User fokussiert den Explorer und drückt ⌘V ODER wählt `Paste` im Kontextmenü einer Zeile bzw. der freien Fläche → System bestimmt den Zielordner nach BR-5.
3. FL-3: System liest die Dateipfade aus der Zwischenablage → kopiert jedes Element nach BR-1..BR-4 (lokal) bzw. lädt hoch (SSH).
4. FL-4: System liest den Zielordner neu ein, klappt ihn auf und markiert alle neu angelegten Elemente.

### Finder-Drop (geändertes Verhalten)
5. FL-5: User zieht Dateien aus dem Finder auf den Explorer → bei Namensgleichheit entsteht eine Kopie nach BR-1 statt eines Abbruchs; Teilfehler nach BR-4.

### Fenster unsichtbar / sichtbar
6. FL-6: Fenster wird minimiert, vollständig verdeckt oder liegt auf einem anderen Space → alle CSS-Animationen pausieren, laufende Media-Previews pausieren.
7. FL-7: Fenster wird wieder sichtbar → Animationen laufen weiter; Media bleibt pausiert, bis der User Play drückt.

### Sidebar zu / auf
8. FL-8: User klappt die Sidebar zu → Explorer gibt seine Ordner-Watcher frei; Git-Status ruht, falls kein anderer Konsument sichtbar ist (BR-11).
9. FL-9: User klappt die Sidebar auf → Explorer registriert die Watcher neu und liest die offenen Ordner neu ein; Git-Status wird einmal aufgefrischt.

**Error Paths:**
- EP-1: Zwischenablage enthält keine Dateien → Toast `No files on the clipboard`, nichts passiert.
- EP-2: Einzelne Elemente scheitern (Rechte, Quelle verschwunden, Ordner in sich selbst, SSH-Fehler pro Datei) → übrige Elemente werden kopiert; Toast `Could not copy {N} item(s)` mit Beschreibung `{erste Quelle}: {Grund}`.
- EP-3: Gesamter Vorgang scheitert (Zwischenablage nicht lesbar, Ziel nicht freigegeben, SSH-Verbindung weg) → Toast `Paste failed: {error}`; Zielordner wird neu eingelesen, falls schon etwas kopiert wurde.
- EP-4: Workspace oder Wurzel wechselt während des Vorgangs → Ergebnis wird nicht markiert, keine Auswahl im neuen Workspace.
- EP-5: Kein Workspace offen (keine Wurzel) → ⌘V und `Paste` tun nichts.

---

## UI Layout & Context

> No requirement IDs — context

### Screen: Explorer (Sidebar)
**Position:** linke Sidebar, Ansicht Explorer
**When:** lokaler oder SSH-Workspace offen

**Layout:**
- Kontextmenü einer Zeile (Datei/Ordner): bestehende Einträge + neuer Eintrag `Paste` mit Hinweis `⌘V`
- Kontextmenü der freien Fläche (Wurzel): bestehende Einträge + `Paste` mit Hinweis `⌘V`
- Baum: nach dem Einfügen Zielordner aufgeklappt, neue Elemente markiert

### Screen: Einstellungen → About
**Position:** Einstellungsfenster, Bereich About
**When:** immer
**Layout:** Version `0.8.7` + Commit wie bisher

---

## UI Components & States

| ID | Element | Type | Location | States | Behavior |
|----|---------|------|----------|--------|----------|
| UI-1 | `paste_menu_item` | Context-Menü-Eintrag `Paste` (`⌘V`) | Explorer-Kontextmenü Zeile + freie Fläche | `enabled`, `busy` (während eines laufenden Einfügens ignoriert) | startet FL-2..FL-4 mit Ziel nach BR-5 |
| UI-2 | `paste_shortcut` | Tastenkürzel ⌘V | Explorer-Baum mit Fokus | `active` (Fokus im Explorer), `inactive` (Fokus woanders) | wie UI-1; ohne ⌥/⇧, ohne Ctrl |
| UI-3 | `toast_empty_clipboard` | Toast (Info) | global | `shown` | Text `No files on the clipboard` |
| UI-4 | `toast_partial_failure` | Toast (Fehler) | global | `shown` | Titel `Could not copy {N} item` / `items`, Beschreibung `{source}: {message}` des ersten Fehlers |
| UI-5 | `toast_paste_failed` | Toast (Fehler) | global | `shown` | Text `Paste failed: {error}` |
| UI-6 | `pasted_selection` | Baum-Auswahl | Explorer | `selected` | alle neu angelegten Elemente markiert, Zielordner aufgeklappt |
| UI-7 | `drop_copy` | Finder-Drop | Explorer | bestehend; geändert nur Ergebnis | Namensgleichheit → Kopie nach BR-1; Teilfehler → UI-4 statt `Copy failed` |
| UI-8 | `animations` | CSS-Animationen (Tab-Spinner, Mission-Control-Spinner, Shimmer, Puls) | global | `running`, `paused` | `paused` nur bei unsichtbarem Fenster (BR-9); Endlos-Animationen in Stufen (BR-10) |
| UI-9 | `media_preview` | Video/Audio-Vorschau | Editor-Tab | `playing`, `paused`, `hidden` | Tab im Hintergrund → pausiert + ausgeblendet; Fenster unsichtbar → pausiert; kein Auto-Resume (BR-12) |
| UI-10 | `about_version` | Text | Einstellungen → About | -- | zeigt `0.8.7` |

---

## Feature State Machine

### States Overview

| ID | State | UI | Available Actions |
|----|-------|----|--------------------|
| ST-1 | `paste_idle` | Explorer normal | ⌘V, `Paste`, Drop |
| ST-2 | `paste_busy` | Explorer normal, weitere ⌘V werden ignoriert | -- |
| ST-3 | `paste_done` | Zielordner aufgeklappt, neue Elemente markiert | ⌘V, `Paste`, Drop |
| ST-4 | `paste_partial` | wie ST-3 für erfolgreiche Elemente + UI-4 | ⌘V, `Paste`, Drop |
| ST-5 | `paste_failed` | UI-5, Baum ggf. neu eingelesen | ⌘V, `Paste`, Drop |
| ST-6 | `window_visible` | Animationen laufen | -- |
| ST-7 | `window_invisible` | Animationen pausiert, Media pausiert | -- |
| ST-8 | `explorer_armed` | Sidebar offen, Watcher aktiv | -- |
| ST-9 | `explorer_disarmed` | Sidebar zu, keine Watcher | -- |

### Transitions

| ID | Current State | Trigger | UI Feedback | Next State | Business Rules |
|----|---------------|---------|-------------|------------|----------------|
| TR-1 | `paste_idle` | `paste_shortcut`/`paste_menu_item` → Auslösen, Zwischenablage hat Dateien | -- | `paste_busy` | BR-5, BR-6 |
| TR-2 | `paste_idle` | wie TR-1, Zwischenablage ohne Dateien | UI-3 | `paste_idle` | EP-1 |
| TR-3 | `paste_busy` | alle Elemente kopiert | UI-6 | `paste_done` | BR-1..BR-3 |
| TR-4 | `paste_busy` | ≥1 Element gescheitert, ≥1 erfolgreich | UI-6 + UI-4 | `paste_partial` | BR-4 |
| TR-5 | `paste_busy` | Vorgang gescheitert oder alle Elemente gescheitert | UI-5 bzw. UI-4 | `paste_failed` | EP-3 |
| TR-6 | `paste_busy` | Workspace/Wurzel wechselt | keine Markierung | `paste_idle` | EP-4 |
| TR-7 | `window_visible` | Fenster minimiert / verdeckt / anderer Space | Animationen stehen | `window_invisible` | BR-9 |
| TR-8 | `window_invisible` | Fenster wieder sichtbar | Animationen laufen | `window_visible` | BR-9, BR-12 |
| TR-9 | `explorer_armed` | Sidebar zuklappen oder andere Sidebar-Ansicht | -- | `explorer_disarmed` | BR-11 |
| TR-10 | `explorer_disarmed` | Sidebar mit Explorer aufklappen | Baum zeigt aktuellen Stand | `explorer_armed` | BR-11 |

---

## Business Rules

- BR-1: Namensgleichheit im Ziel → Kopie mit Finder-Suffix, nie überschreiben: Datei `a.txt` → `a copy.txt`, dann `a copy 2.txt`, `a copy 3.txt` …; nur die letzte Endung zählt (`archive.tar.gz` → `archive.tar copy.gz`); ohne Endung `Makefile` → `Makefile copy`; Dotfile `.env` → `.env copy`; Ordner ohne Endungslogik `v1.2` → `v1.2 copy`. Auch ein Ordner gleichen Namens zählt als Konflikt.
- BR-2: BR-1 gilt für Einfügen UND Finder-Drop, in lokalen UND SSH-Workspaces.
- BR-3: Ein Element erscheint im Ziel erst, wenn es vollständig kopiert ist (keine halben Kopien sichtbar, auch nicht bei Abbruch).
- BR-4: Teilfehler brechen den Vorgang nicht ab: jedes Element wird einzeln versucht, Erfolge bleiben, Fehler werden gesammelt gemeldet (UI-4).
- BR-5: Zielordner: markierter Ordner → in den Ordner; markierte Datei → in deren Ordner; nichts markiert oder Kontextmenü der freien Fläche → Workspace-Wurzel. Kontextmenü einer Zeile → wie Markierung dieser Zeile.
- BR-6: Ziel nur innerhalb freigegebener Workspace-Wurzeln (wie Drop); Quellen sind beliebige lokale Pfade, die der User im Finder gewählt hat.
- BR-7: Einen Ordner in sich selbst oder einen eigenen Unterordner zu kopieren wird pro Element verweigert (Grund `cannot copy a folder into itself`).
- BR-8: ⌘V löst nur mit Fokus im Explorer aus; Terminal, Editor und andere Eingabefelder behalten ihr eigenes ⌘V.
- BR-9: Animationen pausieren nur, wenn das Fenster unsichtbar ist (minimiert, vollständig verdeckt, auf anderem Space). Fokusverlust allein pausiert NICHT.
- BR-10: Endlos-Animationen (Spinner, Shimmer, Blinken) laufen in Stufen statt flüssig; `prefers-reduced-motion` schaltet sie wie bisher ab.
- BR-11: Explorer hält Ordner-Watcher nur, solange er sichtbar ist (Sidebar offen, Ansicht Explorer). Beim Wieder-Sichtbarwerden werden alle offenen Ordner neu eingelesen; Änderungen in der Zwischenzeit sind danach sichtbar.
- BR-12: Media-Preview pausiert und wird ausgeblendet, wenn ihr Tab nicht aktiv ist; sie pausiert, wenn das Fenster unsichtbar ist (BR-9-Regel). Sie startet nie von selbst wieder.
- BR-13: `git status` läuft nur, solange mindestens ein Konsument sichtbar ist: Source-Control-Panel, aktiver Git-Tab, Explorer mit Git-Farben, oder ein aktiviertes Git-Widget der Statusleiste (`git-branch`, `git-sync`, `git-changes`, `git-staged`). Wird ein Konsument sichtbar, wird einmal aufgefrischt.
- BR-14: Ghostty-Wiedervorlage beim nächsten Sync nur, wenn (a) ein 0.9.x-Release die macOS-Issues #1372, #1365, #1364, #1362 geschlossen hat UND (b) die Grenze von 8 schnellen WASM-Instanzen entschärft oder bei 20 Tabs als unkritisch belegt ist. Dann zuerst Probefahrt als getrennte Labor-App (eigener Name, eigene tmux-Sessions über `MANAGED_PREFIX`, laufende App unberührt), danach Entscheidung A (Umstieg) / C (nur PTY-Transport) / weiter parken.
- BR-15: Perf-Stücke werden vorher/nachher gemessen (Leerlauf-CPU mit 10 Tabs davon ≥3 mit laufendem Agent, Startzeit bis erstes Terminal); Zahlen stehen im PR. Ein Stück ohne messbaren Effekt bleibt, wird aber als solches benannt.
- BR-16: SSRF-Prüfung des AI-HTTP-Proxys behandelt IPv6-Adressen mit eingebetteter IPv4 (`::ffff:a.b.c.d`, `::a.b.c.d`, `::ffff:0:a.b.c.d`, NAT64 `64:ff9b::/96` und lokal `64:ff9b:1::/48`, 6to4 `2002::/16`, Teredo `2001::/32`) nach der eingebetteten IPv4; die gefährlichste Klasse gewinnt.
- BR-17: ⌘S speichert den aktiven Editor-Tab zuverlässig; das WebView darf ⌘S nicht als „Seite sichern“ abfangen.
- BR-18: Lazy-Start: AI-SDK, Editor und Icon-Set sind nicht Teil des Startpakets; ein Build-Test schlägt fehl, wenn sie wieder hineinrutschen. Erstes Öffnen eines Editors darf kurz nachladen.
- BR-19: Fork-Version nach dem Sync `0.8.7` (alle Versionsquellen synchron); 0.9.x bleibt für den Ghostty-Umstieg reserviert.

---

## Data

| ID | Field | Required | Validation | Notes |
|----|-------|----------|------------|-------|
| DF-1 | Zwischenablage-Dateipfade | Ja (für Einfügen) | nur absolute Pfade; leer → EP-1 | nur Datei-URLs, kein Text/Bild |
| DF-2 | Kopier-Ergebnis | Ja | Liste angelegter Pfade + Liste `{Quelle, Grund}` der Fehler | speist UI-4 und UI-6 |
| DF-3 | Suffix-Zähler | Ja | 1..10.000, darüber Fehler `no free copy name` | BR-1 |

---

## Compliance & Security Surface

> No requirement IDs — covered via BR-6

| Fläche | Berührt? | Notiz |
|--------|----------|-------|
| Auth | nein | -- |
| Sensible Daten at-rest | nein | Kopieren schreibt nur in freigegebene Workspace-Wurzeln (BR-6) |
| Externe Integrationen / Netzwerk | ja | SSRF-Härtung des AI-HTTP-Proxys (BR-16) schließt eine bestehende Lücke; SSH-Upload nutzt den bestehenden SSH-Weg |
| Privilegierte Aktionen | nein | Zwischenablage wird nur gelesen (Dateipfade), nur auf explizite User-Aktion |
| Pfadgrenzen | ja | Ziel gejailt wie Drop; Selbstkopie verweigert (BR-7); Symlink-Ziele nicht überschreiben (bestehende Regel, bleibt) |
| CI | ja | Checkout ohne persistierte Credentials (`e8f9fcd`) |
| Aufbewahrungspflichten | nein | -- |

---

## Trigger-Inventory

| ID | Entry Point | Trigger | Signal today | Signal after | Notes |
|----|-------------|---------|--------------|--------------|-------|
| TG-1 | Explorer | ⌘V mit Explorer-Fokus | none | none — deliberate | Terax hat keine Telemetrie |
| TG-2 | Explorer | Kontextmenü `Paste` | none | none — deliberate | -- |
| TG-3 | Explorer | Finder-Drop | none | none — deliberate | geändertes Konfliktverhalten |
| TG-4 | Fenster | Sichtbarkeit wechselt | none | none — deliberate | steuert Animationen + Media |
| TG-5 | Sidebar | zu-/aufklappen, Ansicht wechseln | none | none — deliberate | steuert Watcher + git status |
| TG-6 | Editor | ⌘S | none | none — deliberate | -- |

---

## Implementation Slices

> No requirement IDs — context

### Dependencies

```
1 Kern-Picks ─┬─> 2 Media-Pause ──> 5 Animationen (teilen Fenster-Sichtbarkeit)
              ├─> 3 Einfügen + Drop (lokal + SSH)
              ├─> 4 Watcher + git status sichtbar
              └─> 6 Lazy-Start
1..6 ─────────────> 7 Deps + 0.8.7
```

### Slices

| # | Name | Scope | Testability | Dependencies |
|---|------|-------|-------------|--------------|
| 1 | Kern-Picks | `f885631`, `d3c8fd7`, `e8f9fcd`, SSRF `net/ip.rs` (BR-16), ⌘S (BR-17), 3 Test-Commits | `cargo test` (ip-Tests aus Upstream), vitest, e2e ⌘S über Test-Bridge | -- |
| 2 | Media-Pause | BR-12, Fenster-Sichtbarkeits-Zustand | vitest; e2e: Video starten, Tab wechseln, Fenster minimieren | 1 |
| 3 | Einfügen + Finder-Benennung | FL-1..FL-5, BR-1..BR-8, EP-1..EP-5, lokal + SSH | Rust-Tests Benennung/Konflikt/Selbstkopie/Teilfehler; vitest Ziel-Auflösung; e2e lokal + SSH `litha-claude` | 1 |
| 4 | Sichtbare Konsumenten | BR-11, BR-13 | vitest Konsumenten-Logik; Messung BR-15; e2e Sidebar zu → Datei ändern → auf | 1 |
| 5 | Animationen | BR-9, BR-10 | CSS-Budget-Test (Endlos nur mit Stufen); e2e Fenster minimieren; Messung BR-15 | 2 |
| 6 | Lazy-Start | BR-18 | Build-Budget-Test; Startzeit-Messung BR-15 | 1 |
| 7 | Deps + Version | Deps auf v0.9.0-Niveau, BR-19 | alle Gates (`check-types`, `lint`, `vitest`, `cargo test`, `clippy -D warnings`, Build) | 1–6 |

### Recommended Order

1. **Slice 1:** Kern-Picks — schließt die Sicherheitslücke zuerst, kleinstes Risiko.
2. **Slice 3:** Einfügen + Drop — größter Nutzwert, unabhängig von Perf.
3. **Slice 2 → 5:** Media-Pause, dann Animationen — teilen den Fenster-Sichtbarkeits-Zustand.
4. **Slice 4:** Sichtbare Konsumenten — mit Messung.
5. **Slice 6:** Lazy-Start — größter Konfliktbrocken (`vite.config`, `App.tsx`) zuletzt vor Deps.
6. **Slice 7:** Deps + 0.8.7 — Abschluss, alle Gates.

---

## Context & Research

> No requirement IDs — context

### Ghostty-Bewertung (Fork-Feature-Matrix, Kurzfassung)

| Fork-Feature | Mit Ghostty | Aufwand |
|---|---|---|
| Renderer-Pool/LRU (#65), PTY-Backpressure (#67) | überflüssig, Upstream löst es selbst (Präsentationsklassen focused/visible/hidden/occluded) | S (wegwerfen) |
| Emoji-Breite (#1119) | überflüssig (Ghostty rechnet Grapheme) | S |
| OSC 777 / DCS-Marker für Agent-Notifications | bleibt, wird in Rust geparst (`agent_detect.rs`) | S |
| Trackpad-Swipe, tmux-Switcher, Panes-Baum, DnD-Logik | bleiben weitgehend | S–M |
| OSC 52 mit Policy + Toasts | teilweise; Upstream schreibt immer ohne Policy | S |
| Cmd+Klick-Dateipfade | neu bauen; Upstream nur URLs, öffnet ohne Modifier | M |
| tmux-Copy mit ⌥ | Upstream nutzt ⇧; ⌥ = Rechteck-Auswahl | S |
| Pane-Fokus dim/desaturate | bricht (Pixel im gemeinsamen Canvas unter dem DOM) | M |
| SSH/tmux pro Pane, Reconnect-Hinweis | fehlt upstream, neu verdrahten | M |
| Eigene OSC/DCS-Hooks in JS | nicht möglich, nur feste Ereignisliste; neue Codes brauchen Zig + WASM-Rebuild | — |
| Gesamt | 105 Konfliktdateien; A = 5–7 Wellen, C (nur PTY-Transport) = 2 Wellen | — |

### Similar Patterns in Codebase
| Feature | Location | Relevant because |
|---------|----------|------------------|
| Finder-Drop | `src/modules/explorer/lib/useExplorerFileDrop.ts` | gleiche Zielregel, gleicher Kopierweg |
| SSH-Upload | `src-tauri/src/modules/ssh.rs` `copy` | SSH-Zweig von Einfügen/Drop |
| Upstream-Kopierlogik | `upstream/main:src-tauri/src/modules/fs/copy.rs` | Benennung, Staging, no-replace-Publish |
| Upstream-Konsumentenlogik | `f6f0004:src/modules/source-control/statusConsumers.ts`, `src/modules/explorer/lib/watchRegistry.ts` | Vorlage für BR-11/BR-13 |

### Web Research
| Source | Finding |
|--------|---------|
| [gpuweb Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status) | WebGPU ab macOS 26 standardmäßig an |
| [Apple Developer Forums 770862](https://developer.apple.com/forums/thread/770862) | Safari-Flags wirken nicht auf WKWebView; WKWebView-WebGPU erst, wenn default an — für Tauri nicht direkt belegt |
| [coder/ghostty-web](https://github.com/coder/ghostty-web) | vergleichbarer Ansatz (Ghostty-WASM als xterm-Ersatz), jung, offiziell nur Chrome |
| Upstream-Issues #1372, #1365, #1364, #1362, #1357 | macOS-Regressionen von 0.9.0 (Unschärfe, Speed, Scroll, Overflow, Links) |

---

## Open Questions

> No requirement IDs — context

| # | Question | Options | Recommended | Decision |
|---|----------|---------|-------------|----------|
| 1 | Ghostty jetzt übernehmen? | A) parken B) Probefahrt C) Hybrid D) Umstieg | A | parken mit BR-14 |
| 2 | Lokales `main` trackt `upstream/main` (crynta); `git pull` auf `main` würde Upstream 0.9.0 hereinmergen | A) auf `origin/main` umstellen B) lassen | A | -- (User-Entscheidung außerhalb dieser Discovery) |

---

## Nebenfunde

> No requirement IDs — context

| Befund | Beleg |
|--------|-------|
| Upstream #1309 ist derselbe `panic=abort`-SIGABRT unter macOS 27, den der Fork in `ea901ca` behoben hat | `gh issue view 1309 --repo crynta/terax-ai` |
| Upstream #1319 wünscht Pane-Verschieben zwischen Tabs/Splits ohne Neustart — im Fork mit Panes-Wellen A+B gebaut | `gh issue view 1319 --repo crynta/terax-ai` |
| Upstream-0.9.0-Update setzt `terminalRenderer: "webgl"` still auf `"auto"` | Kommentar in #1372 |
| Dry-Run-Agent nahm an, Finder-Einfügen bräuchte für SSH einen eigenen Weg — falsch, `fs_copy` leitet SSH schon an `ssh::copy` | `src-tauri/src/modules/fs/mutate.rs:227-229` |

---

## Research Log

> No requirement IDs — context

| Date | Area | Finding |
|------|------|---------|
| 2026-10-20 | Git | `git fetch upstream`: Tags v0.9.0-beta, v0.9.0; 122 Commits `47d3c8b..upstream/main`, davon 19 `build(deps)` + ~14 `test(...)` |
| 2026-10-20 | Codebase | Fork: 5.540 Zeilen Änderungen in `src/modules/terminal` + `src-tauri/src/modules/pty` seit `d77476e`; 18 Dateien importieren `@xterm` |
| 2026-10-20 | Codebase | Upstream löscht `useTerminalSession.ts`, `rendererPool.ts`, `dormantRing.ts`, `imeBridge.ts`, `block/lib/*` |
| 2026-10-20 | Codebase | merge-tree `main` vs `upstream/main`: 105 Konfliktdateien, ~11k Konfliktzeilen (überzeichnet durch Cherry-Pick-Historie) |
| 2026-10-20 | Codebase | cherry-pick-Dry-Run aller Nicht-Ghostty-Kandidaten: CLEAN nur `f885631`, `d3c8fd7`, `e8f9fcd` (1 Hunk), Tests `d766567`/`258d119`/`13ded38` |
| 2026-10-20 | Codebase | `11343a1`: `net/ip.rs` (263 Z.) eigenständig, nur `std`; Fork-`ip_kind` ist alte Fassung → Lücke besteht |
| 2026-10-20 | Codebase | `2723dc6` baut auf übersprungener Batch-Mutations-Härtung auf; Handarbeit; Upstream-Benennung in `fs/copy.rs` (`copy_name`, Limit 10.000, Staging + no-replace) |
| 2026-10-20 | Codebase | `f6f0004` pausiert Animationen bei Fokusverlust (`html[data-window-inactive]`); Konsumentenlogik kennt keine Statusleisten-Widgets |
| 2026-10-20 | Codebase | Fork-Statusleiste hat 4 Git-Widgets über `ctx.sourceControl` → zählen als Konsumenten; Ersparnis von BR-13 gering, solange aktiv |
| 2026-10-20 | Codebase | Deps-Majors: `dirs` 6→7 (Fork nutzt nur `home_dir`, 13 Stellen), `getrandom` 0.3→0.4 transitiv, `wasmparser` nur Ghostty |
| 2026-10-20 | Web/GitHub | macOS-Regressionen 0.9.0 (#1372, #1365, #1364, #1362); neue offene PRs #1367–#1371 |
| 2026-10-20 | Web | WebGPU in WKWebView ab macOS 26 default (Safari belegt, Tauri abgeleitet, nicht geprüft) |

---

## Q&A Log

> No requirement IDs — context

| # | Question | Answer |
|---|----------|--------|
| 1 | Gibt es ein GitHub-Issue zum Vorhaben? | Nicht gestellt: Issues sind im Fork deaktiviert (`gh issue list` → „repository has disabled issues“); Flow C ohne Issue. |
| 2 | Wie gründlich soll recherchiert werden, bevor Entscheidungen fallen — essenzielle Fragen direkt oder umfassende Recherche zuerst? | Umfassend zuerst: jeden Kandidaten per cherry-pick-Dry-Run prüfen, jede Fork-Anpassung auf Ghostty mappen, WebGPU-Stand recherchieren. |
| 3 | Wie tief soll das Discovery-Dokument werden — kurz, Standard oder detailliert? | Standard: Kandidatentabelle, Wellen, Skip-Liste, Ghostty-Feature-Matrix. |
| 4 | Upstream 0.9.0 ersetzt das Terminal komplett; Umsteigen hieße, Cmd+Klick-Pfade, tmux pro Pane, SSH-Reconnect, Pane-Dimmen und OSC-52-Policy neu aufzubauen (5–7 Wellen), bei aktuellen macOS-Regressionen und Verlangsamung ab 9 Terminals. Wie gehen wir damit um — parken mit Kriterien, Probefahrt als Labor-App, Hybrid nur PTY-Transport, oder kompletter Umstieg? | Parken mit Wiedervorlage-Kriterien (BR-14). |
| 5 | Was kommt in die Sync-Welle — Kern (SSRF, ⌘S, Media-Pause, clean Picks, Tests, Deps), Finder-Einfügen, Perf-Stücke, offene Upstream-PRs? | Kern + Finder → Explorer einfügen + Perf-Stücke; offene Upstream-PRs nicht. |
| 6 | Bei Namensgleichheit bricht der Finder-Drop heute mit „already exists“ ab, Upstreams Einfügen legt „Datei copy.txt“ / „copy 2“ an. Wie sollen Einfügen und Drop sich verhalten — beide wie Finder, nur Einfügen umbenennen, oder beide abbrechen/überspringen? | Beide wie Finder (BR-1, BR-2). |
| 7 | Der Finder-Drop lädt in SSH-Workspaces schon hoch, Upstream kennt kein SSH. Soll ⌘V aus dem Finder auch in SSH-Workspaces hochladen, oder nur lokal mit Hinweis? | Ja, wie der Drop, inklusive copy-Umbenennung auf dem Remote-Host. |
| 8 | Welche der vier Perf-Stücke aus Upstreams Perf-Commit sollen rein — Animationen pausieren, Watcher nur sichtbar, git status nur sichtbar, schnellerer Start? | Alle vier. |
| 9 | Upstream pausiert Animationen schon bei Fokusverlust; bei mehreren Spaces und Terax neben dem Browser würden Agent-Spinner einfrieren, während man hinschaut. Pause nur bei unsichtbarem Fenster oder wie Upstream? | Nur wenn unsichtbar (minimiert, verdeckt, anderer Space); dieselbe Regel für Media-Previews (BR-9, BR-12). |
| 10 | Bisher übernahm der Fork die Upstream-Version; diesmal fehlt das Kernstück von 0.9.0. Version 0.8.7, 0.9.0 wie Upstream, oder bei 0.8.6 bleiben? | 0.8.7 (BR-19). |
| 11 | Sign-off: Zusammenfassung mit 7 Entscheidungen, 6 Defaults (Teilfehler sammeln, Toast bei leerer Zwischenablage, ⌘V nur mit Explorer-Fokus, Zielregel, Git-Widgets als Konsumenten mit Hinweis auf geringe Ersparnis, Messung vorher/nachher), Skip-Liste und 7 Slices — passt das, Git-Status-Stück streichen, oder als Draft sichern? | Passt, schreiben; Status Ready. |
