# Design Conformance Report

**Feature:** HTML-Vorschau im Browser (Welle 1), Fan-out Teil 5: SSH-Lesen und Esc-Monitor gegen die Architektur, Verdrahtung in `lib.rs`, Rest
**Branch:** `html-preview-browser` (Code-Stand `f180fa8`, Diff gegen `cf07327`)
**Datum:** 2026-11-25
**Diff-Scope:** Prüfmenge: `src-tauri/src/modules/ssh.rs` (nur Feature-Diff), `src-tauri/src/modules/zen_escape.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/modules/mod.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tests/preview_contracts.rs`, `TERAX.md`; Gegenseite `src/modules/zen/lib/useZenEscape.ts`, `src/modules/zen/lib/zenEscape.ts`
**Modus:** full
**Architecture:** `specs/2026-11-25-html-preview-browser/architecture.md`
**Bindings:** — (keine `bindings.md`)

---

## Verdict

PASSED

Kein `decision`- und kein `refuted`-Befund. Drei `fix`, zwei `note`, eine `obligation`; nichts davon blockiert.

| Kategorie | Anzahl |
|---|---|
| Design Violations | 0 (blockierend) / 6 (nicht blockierend) |
| Bindings Net Hits | 0 |
| Exceptions Applied | 0 |

---

## Regel-ID · Fundstelle · Urteil

| Regel-ID | Fundstelle | Urteil |
|---|---|---|
| SVC-18 | `src-tauri/src/modules/zen_escape.rs:51-93` (lokaler Monitor `KeyDown`, Ereignis unverändert zurück `:71`, `:84`, Senden `:82`), `:30-42` (`ends_zen`), `:95-115` (Fenster), `src-tauri/src/lib.rs:373-375` | erfüllt. Zusätzlich der Fensterfilter `main` (OB-4). Laufzeit nur am Mac (AC 9 slice-02, N-10, N-21; dazu F5-06) |
| SVC-22 | `ssh.rs:1676-1683` (`RemoteReadError`), `:1731-1738` (Transport → Unreachable, TimedOut → TimedOut, Failed und Killed → Failed), `:1741-1751` (feste Art aus dem Umschlag, nicht in `helper_answer`), `:1754-1768` (`typed_answer`), `:1787-1857` (drei typisierte Funktionen); Helfer `:394-441`, `:452-474`, `:859-862` | erfüllt. Die Abweichung „`budget` statt erwarteter Größe“ steht in `build-plan.md:209` (technisch, zulässig). `RemoteError`, `From<RemoteError> for String`, `helper_answer`, `read_bytes`, `classify_ssh_error` und die Kopier-Muster haben keinen Diff-Hunk |
| API-3 | `zen_escape.rs:44-49`; `lib.rs:505`; `useZenEscape.ts:24-28`, `:58-62` | erfüllt. Der Schalter ist plattformneutral nach `build-plan.md:218`; außerhalb von macOS liest ihn niemand, nach außen also keine Wirkung |
| API-4 (Gegenseite der Naht) | `zen_escape.rs:10`, `:82` (`emit(…, ())`) ↔ `useZenEscape.ts:14`, `:88` (`listen<null>`) | erfüllt. Der Name ist auf beiden Seiten per Literal-Test gepinnt (`zen_escape.rs:160`, `useZenEscape.test.ts:43`); IPC-Schlüssel `armed` ebenso (`preview_contracts.rs:322`, `useZenEscape.test.ts:80`) |
| MIG-21 | `ssh.rs:1208-1215` (`run_remote_json` ruft `ssh_helper`, dann dieselbe `read_envelope`-Auswertung), `:1217-1327` (`HelperExit`, `HelperRun`, `Launcher`, `ssh_helper`, `run_remote_helper`) | erfüllt. Form und Verhalten von `run_remote_json` bleiben. `upstream/main` hat weiter kein `ssh.rs` (`git ls-tree upstream/main src-tauri/src/modules/`, Stand `b217c43`) |
| MIG-1 | `Cargo.toml:50-61`; `Cargo.lock:4772`, `:4776`, `:4786` | erfüllt. Jedes neue Feature und jede neue Crate ist genutzt (siehe Notes, Frage 3) |
| MIG-2 | `src-tauri/src/modules/mod.rs:10`, `:20` | erfüllt |
| MIG-3 | `lib.rs:6-7`, `:373-375`, `:396`, `:503-505` | erfüllt. Kein Diff-Hunk im Exit-Pfad |
| MIG-16 | `TERAX.md:46-47`, `:75`, `:79`, `:94-96` | jede geprüfte Aussage stimmt; es fehlen Verhaltensweisen, die erst nach slice-00 gebaut wurden: F5-02 |
| NFR-6 | `zen_escape.rs:7-49` ohne `cfg`, `:54`, `:97` (macOS-Arme); `lib.rs:374`; `Cargo.toml:67-77` | erfüllt für Linux (laut Kontext Clippy und Tests grün). Die neuen Quelltext-Tests hängen am Zeilenende (F5-01). x86_64-macOS ist nicht typgeprüft (F5-05) |
| Bedrohung 8 | `ssh.rs:451`, `:459`, `:475` (der Helfer meldet `real` und öffnet streng), `:409-441` (`_open_exact`), `:1771-1783` (`exact_target`) ↔ `preview_server/source.rs:483-497` (`check_target` auf `resolved_path`), `:349-355` (`Remote::ssh` mit den typisierten Funktionen) | an der Naht erfüllt. Was `_open_exact` nicht erkennt (`ssh.rs:413-418`), steht unter den bekannten Grenzen |
| Annahme „Python-Helfer liefert für Symlinks das aufgelöste Ziel“ | `ssh.rs:451`, `:475`; Test `the_typed_read_resolves_links_the_request_itself_names` (`ssh.rs:5355`) | erfüllt mit dem lokalen Helfer; N-19 am Mac |
| Risiko „SSH: Lesevorgänge nehmen Plätze im MaxSessions-Budget“ | `ssh.rs:1700-1705`, `:1756-1760` ↔ `source.rs:431-434`; `preview_server/mod.rs:76-81` | Gegenmittel umgesetzt: 1 Lesevorgang je Host, 8 insgesamt, eine Wiederholung nach `Unreachable`, Budget 60 s am `ssh`-Prozess. Die Wirkung misst N-25 |
| Risiko „Esc-Monitor greift in Terminal-Tabs“ | `zen_escape.rs:71`, `:84` (Ereignis geht unverändert weiter) ↔ `zenEscape.ts:16-26`, `useZenEscape.ts:65-76` | Gegenmittel umgesetzt, und zwar doppelt: das Frontend prüft jedes native Ereignis selbst nach. Den Fallback „Monitor-Schalter aus“ gibt es nur als Code-Änderung (Zeile `lib.rs:374-375`) |
| Constraint „Server liest nie über `fs_read_file`“ | `source.rs:349-355`; kein Treffer für `fs_read_file`, `ssh::read_bytes(`, `ssh::realpath(` oder `ssh::stat(` unter `preview_server/` | erfüllt |

---

## Geänderte Bestandszeilen in `ssh.rs` außerhalb neuer Blöcke

Ermittelt mit `git diff -U0 cf07327...f180fa8 -- src-tauri/src/modules/ssh.rs`. Zeilen links Basis, rechts zusammengeführter Stand.

| Basis | neu | Funktion | Änderung |
|---|---|---|---|
| nach 396 | 446-448 | Helfer `read_bytes` | 3 Kommentarzeilen eingefügt |
| 400-401 | 452-457 | Helfer `read_bytes` | `os.stat` in `try` mit `FileNotFoundError` → `_Refused(READ_MISSING, …)`; `ValueError` → `_Refused(READ_NOT_REGULAR, …)`, Text gleich |
| 403-404 | 459-461 | Helfer `read_bytes` | `with os.fdopen(os.open(real, flags))` → `fd = _open_exact(real) if req.get("exact") else os.open(real, flags)`, `try:`, `os.fstat(fd)` |
| 406 | 463 | Helfer `read_bytes` | `ValueError` → `_Refused(READ_NOT_REGULAR, …)`, Text gleich |
| 408 | 465-471 | Helfer `read_bytes` | `ValueError` → `_Refused(READ_TOO_LARGE, …)`; dazu `os.fdopen(fd)`, `except BaseException: os.close(fd); raise`, `with f:` |
| 411 | 474 | Helfer `read_bytes` | `ValueError` → `_Refused(READ_TOO_LARGE, …)`, Text gleich |
| 796 | 859-862 | Helfer `main` | Fehlerumschlag bekommt bei `_Refused` den Schlüssel `kind` |
| nach 1146 | 1213-1258 | `run_remote_json` | neuer Zweizeilen-Körper, danach die neuen Elemente und die Signatur von `run_remote_helper`. Damit gehört der alte Körper (Basis 1147-1207) jetzt zu `run_remote_helper`, ohne dass seine Zeilen wandern |
| 1155-1156 | 1267-1269 | jetzt `run_remote_helper` | `Command::new("ssh")` → `Command::new(launcher.program)`, `cmd.args(launcher.args).arg("-T")` |
| 1208 | 1321-1326 | jetzt `run_remote_helper` | `read_envelope(…)` → `Ok(HelperExit { … })` |

Neue Blöcke (ohne Bestandszeilen): Helfer-Konstanten, `_Refused` und `_open_exact` (neu 394-442), Rust-Block nach `stat` (neu 1667-1858), Tests am Modulende (neu 4925-5469).

Urteil zum Schnitt: Der Rust-Eingriff ist minimal. Git sieht 3 geänderte Zeilen und eine Einfügung, und der alte Ausführungskörper bleibt an seinem Platz. Ein Fork-Zweig, der den Ausführungsteil ändert, führt sich deshalb meist ohne Konflikt zusammen; nur die Zeilen 1155-1156 und 1208 sowie die Nachbarschaft der Einfügung bei 1146 sind Konfliktfläche. Der größte Eingriff liegt im Helfer `read_bytes`: 7 der 13 Körperzeilen sind ersetzt. Für MIG-21 (feste Art) und OB-20 (strenges Öffnen, Deskriptor schließen bei jeder Ablehnung) ist das nicht kleiner zu haben. Die Texte für den Editor bleiben gleich, das pinnt `the_editor_read_keeps_its_error_texts_now_that_kinds_ride_along`. Gegenüber `upstream/main` gibt es keine Konfliktfläche, weil dort kein `ssh.rs` existiert. `Launcher` und `SSH_LAUNCHER` sind privat. Im Betrieb nutzt nur `ssh_helper` den Launcher, und zwar mit `program: "ssh"`, `args: &[]` (`ssh.rs:1230-1248`). `HUNG_LAUNCHER` gibt es nur in `#[cfg(test)]` unter `cfg(unix)`.

---

## Design Violations

### F5-01 — fix (nicht blockierend)
- **Datei:** `src-tauri/src/modules/zen_escape.rs:178-180`, `:196-198`; `src-tauri/src/modules/ssh.rs:5201-5202`, `:5213`
- **Design Ref:** NFR-6 („Windows/Linux brechen nicht“), Projekt-CI `.github/workflows/ci.yml:106-131`
- **Erwartet:** Die Quelltext-Tests laufen auf jeder Plattform der CI grün.
- **Aktuell:** Die drei Tests zerlegen per `include_str!` eingelesenen Text an einem Muster, das mit LF endet. `include_str!` übernimmt CRLF unverändert. Der Windows-Job hat keine `autocrlf`-Einstellung, und `.gitattributes` legt kein `eol` fest. `preview_contracts.rs:230-284` ist dagegen fest gegen Zeilenenden.
- **Klasse:** fix

### F5-02 — fix (nicht blockierend)
- **Datei:** `TERAX.md:46`, `:94`
- **Design Ref:** MIG-16; `build-plan.md:227` (der Dirigent zieht die Doku nach, sobald ein späterer Slice abweicht)
- **Erwartet:** `TERAX.md` beschreibt den Server so, wie er gebaut ist.
- **Aktuell:** Jede geprüfte Aussage stimmt. Es fehlen aber: das strenge Öffnen über SSH samt seinen zwei Ablehnungen, die Lese-Reihe (8 insgesamt, 30 s Wartefrist mit `504`, eine Wiederholung nach 250 ms) und der Rückfall der In-App-Vorschau (bindende Entscheidung 6). Der Abschnitt „Wie gebaut“ von slice-02 ist leer (`build-plan.md:727`), die Nachzug-Regel hat also keine Liste.
- **Klasse:** fix

### F5-03 — fix (nicht blockierend)
- **Datei:** `src/modules/zen/lib/useZenEscape.ts:41-42`; `src/modules/zen/lib/useZenEscape.test.ts:191`
- **Design Ref:** API-3, SVC-18 (gebaut in slice-02)
- **Erwartet:** Kommentare beschreiben den zusammengeführten Stand.
- **Aktuell:** Der Kommentar nennt „while the Rust command is a stub“, der Testname „stub command“. Seit slice-02 setzt `zen_escape_arm` den Schalter (`zen_escape.rs:46-49`), und der Monitor liest ihn (`:69`).
- **Klasse:** fix

### F5-04 — note
- **Datei:** `src-tauri/src/modules/zen_escape.rs:30-42` ↔ `src/modules/zen/lib/zenEscape.ts:76-86`, `useZenEscape.ts:78-91`
- **Design Ref:** SVC-16, SVC-18; bindende Entscheidung 8
- **Erwartet:** Beide Wege behandeln dasselbe Esc gleich.
- **Aktuell:** Der DOM-Weg nimmt ein Esc während einer IME-Komposition aus. Der native Weg kennt keine Komposition, und die 500-ms-Sperre greift nur nach einem schlichten DOM-Esc. Mit Fokus in der Seite beendet ein Esc, das eine Komposition abbricht, deshalb Zen. Entscheidung 8 deckt „Esc mit Fokus in der Seite“ ab, die Komposition nennt sie nicht.
- **Klasse:** note

### F5-05 — note
- **Datei:** `.github/workflows/release.yml:17-22`; `src-tauri/Cargo.toml:67-77`
- **Design Ref:** NFR-6, Constraint „macOS zuerst“
- **Erwartet:** Der macOS-Code ist für beide Release-Ziele geprüft.
- **Aktuell:** Typgeprüft ist nur `aarch64-apple-darwin`, der Release baut auch `x86_64-apple-darwin`. Auf Cargo-Ebene löst nichts anders auf (siehe JSON).
- **Klasse:** note

### F5-06 — obligation
- **Datei:** `src-tauri/src/modules/zen_escape.rs:69-83`, `:98-115`; `useZenEscape.ts:16-22`, `:78-91`
- **Design Ref:** SVC-18, SVC-16; `build-plan.md:708-711` (AC 9 slice-02)
- **Erwartet:** Was nur am Mac messbar ist, wird dort gemessen.
- **Aktuell:** AC 9 deckt Esc im iframe, im Einstellungsfenster und im Terminal ab. Nicht abgedeckt sind: Tippen bei scharfem Schalter (jede Taste läuft durch `window_label`), ein natives `<select>`-Menü der Seite, IME-Abbruch (F5-04) und die Reihenfolge der beiden Wege.
- **Klasse:** obligation

### Befunde als JSON

```json
[
  {
    "id": "F5-01",
    "class": "fix",
    "claim": "Drei neue Quelltext-Tests zerlegen per include_str! eingelesenen Quelltext an einem Muster, das mit LF endet. include_str! übernimmt die Zeilenenden der Datei unverändert; anders als bei Stringliteralen im Quelltext macht der Compiler hier aus CRLF kein LF. Auf einem CRLF-Checkout schlagen die Tests fehl, und der Windows-Job der Projekt-CI führt genau diese Suite aus, ohne dass .gitattributes ein eol festlegt.",
    "evidence": "src-tauri/src/modules/zen_escape.rs:178-180 (split_once am macOS-cfg-Gate mit LF, expect „a macOS arm“) und :196-198 (dasselbe mit unwrap); src-tauri/src/modules/ssh.rs:5201-5202 (split an „#[cfg(test)]“ + LF + „mod tests {“), danach :5213 (count == 1). Gegenseite: .github/workflows/ci.yml:106-131 (Job rust-platforms auf windows-latest, cargo nextest run --locked, kein autocrlf-Schritt); .gitattributes:1-5 (nur linguist-generated). Fest gegen Zeilenenden dagegen src-tauri/tests/preview_contracts.rs:230-284 (code_only verwirft jedes Leerzeichen, CR eingeschlossen).",
    "evidence_source": "code; Annahme: GitHub-Windows-Runner checken mit core.autocrlf=true aus (Standard von Git für Windows), auf der Werkbank nicht prüfbar",
    "expected_observation": "In den drei Tests steht ein Trennmuster mit LF ohne Behandlung von CR. Mit einer CRLF-Kopie von zen_escape.rs liefert split_once None. Mit einer CRLF-Kopie von ssh.rs greift der Split nicht, und das Muster {read_bytes_typed_with(host,path,limit,budget,ssh_helper)} kommt im ganzen Text zweimal vor (Produktionscode und Testliteral).",
    "scenario": "PR öffnen → CI-Job rust-test (windows-latest) checkt mit CRLF aus → zen_escape::tests::ac7_only_the_macos_arm_installs_a_monitor_or_emits und ac8_switch_and_decision_build_on_every_platform brechen mit Panic ab, ssh::tests::ac5_the_public_typed_reads_delegate_their_arguments_unchanged zählt 2 statt 1 → der Windows-Job ist rot, obwohl Produktcode und Linux-Lauf grün sind. Abhilfe ohne Entscheidung: vor dem Zerlegen CR entfernen oder wie preview_contracts.rs Text ohne Leerzeichen vergleichen."
  },
  {
    "id": "F5-02",
    "class": "fix",
    "claim": "TERAX.md (MIG-16, von slice-00 vor dem Bau geschrieben) stimmt in jeder geprüften Aussage mit dem Code überein. Es fehlen aber Verhaltensweisen, die erst danach gebaut wurden und die man für die Fehlersuche braucht: (1) Das SSH-Lesen des Servers öffnet streng. Ein Host, dessen Python os.open ohne dir_fd, O_NOFOLLOW oder O_DIRECTORY hat, lehnt jedes Browser-Lesen ab („this host cannot open a file without following symlinks“), der Editor liest dort weiter. Ein unterwegs gegen einen Link getauschter Ordner ergibt „the path changed while it was read“ (502). (2) Lese-Reihe: 8 Lesevorgänge insgesamt, 30 s Wartefrist ohne Fortschritt mit 504, eine Wiederholung nach Unreachable nach 250 ms. (3) Rückfall der In-App-HTML-Vorschau: HTML_PREVIEW_VIA_SERVER; lehnt der Server ab oder scheitert der Aufruf, lädt diese Vorschau auf dem heutigen Weg (bindende Entscheidung 6). Der Abschnitt „Wie gebaut“ von slice-02 ist leer, die Nachzug-Regel hat dafür also keine Liste.",
    "evidence": "TERAX.md:46 (der SSH-Satz nennt nur read_bytes_typed, Host aus der Freigabe, einen Lesevorgang je Host und 60 s; zu preview_frame_source nur „gives the in-app HTML preview its iframe address“), TERAX.md:94 (preview-server/ ohne Rückfall). Gegenseite: src-tauri/src/modules/ssh.rs:397-398, :409-441, :459; src-tauri/src/modules/preview_server/mod.rs:76-81 (reads_total 8, retry_pause 250 ms, host_wait 30 s, ssh_read_budget 60 s); src-tauri/src/modules/preview_server/source.rs:418-440; src/modules/html/lib/htmlPreviewSource.ts:9, :19-37; build-plan.md:201, :202, :214, :227, :727.",
    "evidence_source": "code",
    "expected_observation": "In TERAX.md kommen „exact“, „dir_fd“, die Wartefrist von 30 s, die Zahl 8, die Wiederholung und HTML_PREVIEW_VIA_SERVER oder der Rückfall nicht vor. Im Code stehen sie an den genannten Stellen.",
    "scenario": "Ein Host mit eingeschränktem Python liefert im Browser für jede Datei 502 „Terax could not read …“, während dieselbe Datei im Editor aufgeht. Wer TERAX.md als Architektur-Doku liest (TERAX.md:3), findet keinen Hinweis auf das strenge Öffnen und sucht den Fehler bei der Verbindung."
  },
  {
    "id": "F5-03",
    "class": "fix",
    "claim": "Der Doc-Kommentar von useZenEscape nennt einen Zustand, den es auf dem zusammengeführten Stand nicht mehr gibt („The event never comes on other platforms or while the Rust command is a stub“), ebenso der Testname. slice-03 wurde gegen den Rumpf aus slice-00 gebaut; seit slice-02 setzt zen_escape_arm den Schalter, und der macOS-Monitor sendet.",
    "evidence": "src/modules/zen/lib/useZenEscape.ts:41-42; src/modules/zen/lib/useZenEscape.test.ts:191 („… (Windows, Linux, stub command)“). Gegenseite: src-tauri/src/modules/zen_escape.rs:46-49 (ARMED.store), :69-83 (der Monitor liest ARMED und sendet).",
    "evidence_source": "code",
    "expected_observation": "Kommentar und Testname nennen „stub“; zen_escape_arm hat einen Körper mit Wirkung, und ein Rumpf ist im Code nicht mehr vorhanden.",
    "scenario": "Wer am Mac einen ausbleibenden Esc im iframe untersucht, liest den Kommentar und hält den Rust-Command für noch nicht gebaut. Er sucht dann im Rust-Teil statt am Schalter oder an der Fensterzuordnung."
  },
  {
    "id": "F5-04",
    "class": "note",
    "claim": "Der native Weg kennt die Ausnahmen des DOM-Wegs nicht. isPlainEscape schließt ein Esc während einer IME-Komposition aus; der Monitor entscheidet nur nach Taste, Modifiern, Schalter und Fenster; die 500-ms-Sperre greift nur, wenn der DOM-Weg vorher ein schlichtes Esc gesehen hat. Mit Fokus in der Seite beendet deshalb ein Esc, das eine Komposition in einem Formularfeld der HTML-Seite abbricht, auch Zen. Die bindende Entscheidung 8 deckt „Esc mit Fokus in der Seite“ ab, eine Komposition nennt sie nicht.",
    "evidence": "src/modules/zen/lib/zenEscape.ts:76-86 (isPlainEscape mit !isComposing); src/modules/zen/lib/useZenEscape.ts:78-83 (lastDomEscapeRef nur bei schlichtem Esc), :88-91 (natives Ereignis → exitIfPreview). Gegenseite: src-tauri/src/modules/zen_escape.rs:30-42 (ends_zen ohne Kompositionsbezug), :62-84.",
    "evidence_source": "code",
    "expected_observation": "Im Rust-Weg gibt es keinen Bezug auf eine Texteingabe oder Komposition, im DOM-Weg schon. Ob AppKit das Esc einer Komposition an den lokalen Monitor gibt, ist nur am Mac messbar (F5-06).",
    "scenario": "Zen über einer HTML-Vorschau, Formularfeld der Seite, japanische Eingabe läuft, Esc zum Abbrechen der Komposition → der Monitor sieht keyDown und sendet terax:zen-escape → useZenEscape: kein DOM-Esc in den letzten 500 ms → exitIfPreview → Zen endet zusammen mit dem Abbruch."
  },
  {
    "id": "F5-05",
    "class": "note",
    "claim": "Die macOS-Typprüfung lief nur für aarch64-apple-darwin, der Release baut auch x86_64-apple-darwin. Auf Cargo-Ebene löst für x86_64 nichts anders auf: Die Ziel-Tabellen hängen nur an target_os oder unix; in src-tauri gibt es kein target_arch und kein target_pointer_width; die Features von objc2-app-kit sind durch das Feature unverändert (NSEvent war schon aktiv); Cargo.lock speichert keine Features und hat je Paket dieselbe Version für jedes Ziel. Die Typen, die der Monitor liest (keyCode als c_ushort, windowNumber als NSInteger), sind auf beiden 64-Bit-Zielen gleich breit. Ob objc2-app-kit intern Elemente nach Architektur sperrt, ist ohne Crate-Quelle nicht lesbar; die liegt nur im Docker-Volume.",
    "evidence": ".github/workflows/release.yml:17-22; src-tauri/Cargo.toml:67, :70-77, :79, :93; src-tauri/src/modules/zen_escape.rs:73-81, :112; lib.rs:82-128 (der Wisch-Monitor nutzt dieselben Typen und wird für x86_64 schon gebaut).",
    "evidence_source": "code",
    "expected_observation": "grep nach target_arch und target_pointer_width unter src-tauri bleibt leer; die cfg-Tabellen in Cargo.toml nennen nur target_os bzw. unix.",
    "scenario": "Erst der Release-Tag baut den Code für x86_64. Eine Abweichung zeigte sich also erst im Release. Absichern lässt sich das mit einem einmaligen cargo check --target x86_64-apple-darwin, wie er für aarch64 schon lief."
  },
  {
    "id": "F5-06",
    "class": "obligation",
    "claim": "Am Mac ist zusätzlich zu AC 9 (slice-02) und OB-4 zu prüfen: (a) Bei scharfem Schalter läuft jede Taste durch window_label (webview_windows, ns_window je Fenster, windowNumber), das soll beim Tippen in einem Formularfeld der HTML-Seite im Zen nicht spürbar verzögern; (b) ein natives <select>-Menü der Seite mit Esc schließen: Zen bleibt an; (c) mit japanischer Eingabe eine Komposition per Esc abbrechen und das Ergebnis notieren (F5-04); (d) bei Fokus außerhalb der Seite notieren, ob das native Ereignis vor oder nach dem DOM-keydown ankommt. Bei offener Überlagerung geben beide Reihenfolgen dasselbe Ergebnis, die Reihenfolge entscheidet nur über F5-04.",
    "evidence": "src-tauri/src/modules/zen_escape.rs:69-83, :98-115; src/modules/zen/lib/useZenEscape.ts:16-22, :78-91; build-plan.md:708-711 (AC 9 nennt iframe, Einstellungsfenster und Terminal, nicht (a) bis (d)).",
    "evidence_source": "code",
    "expected_observation": "Am Mac: (a) kein Hänger, keine Verzögerung; (b) das Menü schließt und Zen bleibt; (c) und (d) als Messwert im Protokoll der Mac-Prüfung.",
    "scenario": "Auf der Werkbank nicht messbar: Der macOS-Arm wird hier nicht übersetzt, und die App startet nicht."
  }
]
```

---

## Bindings Net Hits

Keine (keine `bindings.md`).

---

## Exceptions Applied (Audit)

Keine.

---

## Prüfmenge

**Geprüft (`checked`):**
- `src-tauri/src/modules/ssh.rs`: Feature-Diff vollständig (7 Hunks), dazu `run_remote_json`, `run_remote_helper`, `read_envelope`, `exit_error` und Helfer `realpath` und `stat` auf dem zusammengeführten Stand
- `src-tauri/src/modules/zen_escape.rs`: vollständig
- `src-tauri/src/lib.rs`: Diff, `install_tab_swipe_monitor`, `setup`, Settings-Fenster (`open_settings_window`), Handler-Liste
- `src-tauri/src/modules/mod.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`: Diff samt Eintrag `tokio` im Lockfile
- `src-tauri/tests/preview_contracts.rs`: vollständig
- `TERAX.md`: Diff samt Abgleich jeder neuen Aussage mit dem Code (Kopfzeilen, Konstanten, Grenzen, Aufrufer, Wischen, Zen)
- Gegenseite: `src/modules/zen/lib/useZenEscape.ts`, `zenEscape.ts`, `zenStore.ts`, `index.ts`; Aufrufstellen `src/app/App.tsx:970-982`, `:1113`, `ZenToggleButton.tsx`; Einstiegspunkt des Einstellungsfensters (`settings.html:28`, `src/settings/**` ohne Zen-Bezug); `src-tauri/capabilities/default.json` (Fenster `main`, `settings`)
- Naht zum Server-Kern, nur lesend: `preview_server/source.rs:335-497` (Leser, Reihe, Fehlerart → Antwort), `preview_server/mod.rs:60-130` (Grenzen, Zustand), Nutzung der neuen Crates in `grant.rs`, `request.rs`, `listener.rs`, `htmlPreviewSource.ts`
- Upstream: `git ls-tree upstream/main src-tauri/src/modules/` (kein `ssh.rs`) und `upstream/main:src-tauri/Cargo.toml` (gleiche Zeilen `getrandom`, `percent-encoding`)
- CI-Konfiguration: `.github/workflows/ci.yml`, `release.yml`, `.gitattributes`

**Nicht geprüft (`not_checked`):**
- Laufzeit des macOS-Monitors, die Ereignis-Reihenfolge und der Helfer auf einem echten SSH-Host: nur am Mac bzw. Host messbar (F5-06, AC 9 slice-02, N-4, N-19, N-20, N-25)
- Quellen der Abhängigkeiten (`tauri-runtime-wry` für `ns_window()` auf dem Hauptthread, `objc2-app-kit` für Architektur-Sperren): liegen nur im Docker-Volume, Docker ist nicht erlaubt. Ersatzbeleg: Der bestehende Wisch-Monitor ruft aus demselben Monitor-Kontext `emit` auf, und `emit` nimmt denselben Weg über den Hauptthread (`lib.rs:119`)
- Builds und Tests (Rust, Vitest, Windows-CI): laut Kontext nicht erlaubt; Messwerte übernommen aus dem Kontext (Rust-Tests, Clippy, `cargo check --target aarch64-apple-darwin` grün)
- Interne Logik von `_open_exact`, Prüfkette, Listener: schon im Slice-Gate geprüft, hier nur die Naht
- Zählungen (Pakete im Lockfile, Testzahlen): formal, nicht selbst gezählt; übernommen aus `build-plan.md:329`, `:611`

---

## Notes

### Frage 2: Der Esc-Weg über die Sprachgrenze

- **Installation:** in `setup`, direkt nach dem Wisch-Monitor, nur unter `cfg(target_os = "macos")` (`lib.rs:370-375`), einmal beim Start auf dem Hauptthread. Der Monitor merkt sich kein Fenster und sucht es bei jeder Taste neu (`zen_escape.rs:80`, `:98-115`), deshalb erfasst er auch ein später geöffnetes Einstellungsfenster.
- **Zwei lokale Monitore:** Die Masken sind getrennt (`ScrollWheel`, `lib.rs:128`; `KeyDown`, `zen_escape.rs:90`), und jeder gibt das Ereignis unverändert zurück (`lib.rs:122`, `zen_escape.rs:71`, `:84`). Sie stören sich nicht.
- **Entscheidung in Rust:** Schalter, Esc (53) ohne Cmd, Shift, Control, Option, Fenster `main` (`zen_escape.rs:30-42`). Das Label `main` ist auf macOS die Vorgabe, weil `tauri.conf.json` keins setzt; `lib.rs:352` verlässt sich schon darauf. Native Sheets und Panels haben kein Tauri-Label und ergeben `None`, also kein Senden.
- **Frontend:** Der einzige Hörer und der einzige Aufrufer ist `useZenEscape` (App.tsx:976). Es entprellt 500 ms gegen den DOM-Weg und prüft bei jedem nativen Ereignis selbst erneut `shouldExitZenOnEscape(on, activeTab, isOverlayOpen(document))` (`useZenEscape.ts:65-76`). Danach ruft es `exitZen`.
- **Wer schaltet scharf und ab:** nur der Effekt auf `armed = zenEscapeArmed(on, activeTab)` (`useZenEscape.ts:49`, `:58-62`). Zen an oder aus über Kürzel, Palette, Zen-Taste oder Esc läuft immer über `zenStore` (`App.tsx:1113`, `ZenToggleButton.tsx:33`, `zenStore.ts:16-25`) und wirkt über `on`. Tab-Wechsel, Tab schließen und Space-Wechsel wirken über `activeTab`. Verliert das Fenster den Fokus, ändert sich nichts; ein lokaler Monitor sieht ohnehin nur Ereignisse dieser App. Lädt die Webview neu, bleibt der Schalter scharf (bekannte Grenze).
- **Scharf ohne Zen über einer Vorschau** (nach Neuladen oder fehlgeschlagenem `sendArm(false)`): Die schlimmste Folge ist ein überflüssiges IPC-Ereignis je Esc im Hauptfenster. Das Frontend verwirft es, weil `zenEscapeArmed` aus dem eigenen Zustand falsch ist, und Terminal- und Code-Tabs sind `program` (`zenEscape.ts:16-26`). Der Monitor schluckt und ändert kein Ereignis, das Esc erreicht also das Terminal, Claude Code oder Vim wie ohne Monitor. Die bekannte Grenze ist an der Naht nicht schlimmer als beschrieben.
- **`emit` an alle Fenster:** Das Einstellungsfenster lädt `settings.html` → `src/settings/main.tsx`, ohne Bezug auf `@/modules/zen` und ohne Hörer für `terax:zen-escape`. Es täte nichts. Die Architektur schreibt `app.emit` vor (`architecture.md:350`).
- **Überlagerungen:** Kommt das native Ereignis zuerst, ist die Überlagerung noch offen, Zen bleibt also. Kommt der DOM-Weg zuerst, sperrt er das native Ereignis. Beide Reihenfolgen geben dasselbe Ergebnis; Ausnahme ist F5-04. Ein natives Menü der Menüleiste sieht der lokale Monitor nicht, weil Ereignisse der Menü-Tracking-Schleife nicht über `sendEvent:` laufen. Am Mac bestätigen (F5-06 b).

### Frage 3: Abhängigkeiten

- **Genutzt:** tokio `net` (`listener.rs:8`, `preview_server/mod.rs:608`), `io-util` (`listener.rs:7`), `sync` (`grant.rs:6`, `listener.rs:9`, `source.rs:16`, `preview_server/mod.rs:26`); `httparse` (`request.rs:48-53`); `getrandom` (`grant.rs:74`); `percent-encoding` (`request.rs:4`, `preview_server/mod.rs`).
- **Lockfile:** Die drei Zeilen erweitern nur die Abhängigkeitsliste des Pakets `terax` (`Cargo.lock:4772`, `:4776`, `:4786`). `getrandom` trägt die Version, weil im Lockfile drei Versionen stehen (0.2.17, 0.3.4, 0.4.3); `httparse` und `percent-encoding` gibt es nur einmal. tokio-Features schreibt Cargo nicht ins Lockfile, und die Kanten, die `net` und `io-util` brauchen (`bytes`, `mio`, `socket2`, `libc`, `windows-sys`), stehen schon in tokios Liste (`Cargo.lock:4898-4910`). Es gibt keinen neuen `[[package]]`-Block im Diff.
- **objc2-app-kit:** durch das Feature unverändert (`Cargo.toml:76`). `NSEvent`, `NSEventMask::KeyDown`, `NSEventModifierFlags`, `keyCode`, `modifierFlags` und `windowNumber` hat die aarch64-Typprüfung bestätigt. Für x86_64 löst kein `cfg` anders auf (F5-05).

### Frage 5: `TERAX.md`

Der Abgleich ergab keine falsche Aussage: Host-Regel `400`/`421`, CSP-Werte (`policy.rs:22-31`), Konstante `FRAME_LOCALHOST_FALLBACK` aus (`preview_server/mod.rs:40`), `realpath_typed`/`stat_typed` beim Klick, Monitor nach dem Wisch-Monitor, Tab-Art `html`, `data-no-tab-swipe` (`HtmlPreviewPane.tsx:176`), Zen-Taste in den Kopfzeilen, Esc-Regel. Die Lücken stehen in F5-02. Werkbank-spezifische Hinweise enthält `TERAX.md` nicht, und die Prüfbefehle (`TERAX.md:12-13`, `:25`) ändert das Feature nicht.

### Frage 6: `tests/preview_contracts.rs`

Nach dem Füllen der Rümpfe pinnt die Datei weiter Sinnvolles und nichts, was nur für Rümpfe galt: Draht-Werte und Serialisierung beider DTOs und Status-Enums, Derives, die Menge `ENTRY_EXTENSIONS`, die sechs Varianten von `RemoteReadError` (erschöpfendes `match`), die Signaturen der drei typisierten SSH-Funktionen und der drei Commands, IPC-Schlüssel per Quelltext, Verdrahtung in `lib.rs`. Kein Test ruft einen Command auf oder erwartet `unsupported`. `PreviewServer::default()` (`:157`) baut jetzt den echten Zustand, öffnet aber keinen Socket (`preview_server/mod.rs:115-130`). Der Zeilenende-feste Vergleich (`code_only`) ist sogar das Vorbild für F5-01. Den Event-Namen pinnt die Datei nicht, das tun beide Seiten getrennt per Literal (siehe Tabelle, API-4).
