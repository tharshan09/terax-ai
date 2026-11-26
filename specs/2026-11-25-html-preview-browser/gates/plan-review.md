# Plan-Review „Taugt der Schnitt?": Bauplan Welle 1

| Key | Value |
|-----|-------|
| Prüfgegenstand | `specs/2026-11-25-html-preview-browser/build-plan.md` (958 Zeilen, 5 Slices) |
| Maßstäbe | `discovery.md` (gezielt: Business Rules, UI-Komponenten, Zustände, Trigger), `architecture.md` (vollständig), `gates/obligations.md` (OB-1 bis OB-19), `/home/claude/.claude/lt-pipeline/templates/build-plan.md` (nur als Formrahmen, Formales nicht geprüft) |
| Skript-Ergebnis | `gates/build-plan-precheck.json`: `result: PASS`, übernommen (P5); keine ID-Zählung, keine Disjunktheit, keine Zyklen selbst geprüft |
| Code-Stand | `main` @ `cf07327`, nur gelesen (`git log -1`: `cf07327 docs: tab groups merged, open topics after F2 (#97)`) |
| Prüfer | frischer Kontext, kein Vorlauf-Report, keine Läufe (kein cargo, kein pnpm, kein Build) |
| Datum | 2026-11-25 |
| Verdict | **FAILED** (1 × `decision`, 1 × `refuted`) |

## Prüfmenge

### Punkt 1: Baubarkeit je Slice am Code (checked)

- Gelesen: `src-tauri/src/lib.rs` (Setup, `generate_handler!`, `.manage`, Exit-Pfad), `src-tauri/src/modules/mod.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (Einträge `tokio`, `terax`, `getrandom`, `httparse`, `percent-encoding`, `bytes`), `src-tauri/tests/` (Muster `use terax_lib::modules::…`), `ssh.rs` (`classify_ssh_error`, `RemoteError`, `exit_error`, `run_remote_json`, `read_envelope`, `helper_answer`, `realpath`, `read_bytes`, `read_bytes_timeout`, `stat`, Helfer `read_bytes`), `fs/file.rs` (`MAX_READ_BYTES`, `fs_read_remote_image_with`, `PDF_MAGIC`, Host-Ersatz `:753-764`), `fs/guard.rs` (`check_read_str`), `fs/mod.rs` (`to_canon`), `workspace.rs` (`WorkspaceEnv`), `ports/chrome.rs` (`view_with`).
- Frontend gelesen: `DocViewToggle.tsx`, `HtmlPreviewPane.tsx`, `MarkdownPreviewPane.tsx`, `DocStack.tsx`, `doc/index.ts`, `EditorStack.tsx`, `EditorPane.tsx:380-515`, `WorkspaceSurface.tsx`, `WorkspaceInputBar.tsx`, `useSidebarPanel.ts`, `useTabSwipe.ts`, `tabSwipe.ts`, `tabs/index.ts`, `App.tsx` (Zen, Wischen, Seitenleiste, Layout), `FileExplorer.tsx` (Kontextmenü, Imports), `binaryPreview.ts`, `tooltip.tsx`, `Header.tsx:130-138`, `PreviewAddressBar.tsx` (Symbole, `title`), `PortsList.tsx:155-159`, `useTabs.ts` (Tab-Arten), `tsconfig.json`, `package.json`.
- Bestandstests: alle 138 Testdateien unter `src/` per Muster durchsucht (`DocViewToggle`, `right-3`, `top-3`, `rounded-md border`, `border-border/60`, `zenMode`, `useTabSwipe`, `tabSwipe`, `data-no-tab-swipe`; `readFileSync`/`readdirSync`); die 12 quelltextlesenden Tests (`dist-budget`, `eager-budget`, `windowVisibility.guard`, `uploadBoundary`, `portsBoundary`, `chromeProbe.guard`, `browserNotice.guard`, `activeServer.guard`, `PreviewPane.test.ts`, `MarkdownPreviewPane.test.ts`, `motionBudget`, `statusConsumers.test.ts`) und die 7 Tests, die geänderte Komponenten rendern oder mocken (`EditorPane.preview-env.test.tsx`, `EditorStack.window-hidden.test.tsx`, `FileExplorer.test.tsx`, `useSidebarPanel.test.ts`, `markdown-math.test.tsx`, dazu `isInsideHorizontalScroller.test.ts`) geprüft. Rust: nach quelltextlesenden Tests gesucht (`include_str!`, `read_to_string`), keiner liest `lib.rs` oder `preview_server`.
- Ergebnis: Kein Bestandstest nagelt Overlay, Rahmen oder `useTabSwipe` fest; die Behauptung „bestehende Testdateien bleiben unverändert" hält am Code. Kein Slice braucht eine Datei außerhalb seines Bereichs (geprüft u. a. `tabs/index.ts`: `App.tsx` importiert schon tief aus `@/modules/tabs/lib/…`, `App.tsx:125`, `:137`; `DocStack.tsx` reicht `path`, `workspace`, `visible`, `onSetView` durch, `DocStack.tsx:76-81`; `editor/index.ts` wird nicht gebraucht). Restrisiko aus Teil-Mocks und fehlendem `TooltipProvider` in zwei Bestandstests: PR-06.
- not_checked: Windows- und macOS-`cfg`-Arme (nicht übersetzbar hier); Verhalten von Radix `Tooltip` ohne Provider nur nach Bibliotheksdoku, `node_modules` fehlt im Worktree.

### Punkt 2: Slice-00 (checked)

- Verträge gegen „Nahtstellen" und DTO-Tabelle (`architecture.md:346-359`, `:116-121`): alle 15 Zeilen der Tabelle „Liefert" stimmen in Namen, Feldern, `serde`-Schreibweise und Parametern (`path`, `workspace`, `armed`) überein; `FrameStatus` als eigener TS-Name ist eine zulässige Obermenge. `WorkspaceEnv` ist `Deserialize` mit `tag = "kind"`, `rename_all = "lowercase"` (`workspace.rs:319-334`), passt zu den TS-Werten der ACs.
- Kompilierbarkeit: `pub mod modules` (`lib.rs:1`) und `pub mod ssh` (`modules/mod.rs:14`) machen die Verträge für `src-tauri/tests/preview_contracts.rs` erreichbar und schützen sie vor `dead_code`; `serde_json` ist normale Abhängigkeit. Zwei Rümpfe sind so wie geschrieben nicht kompilier- bzw. clippy-fest: PR-05.
- Lockfile: Annahme trägt. `httparse 1.10.1` (`Cargo.lock:1780`), `getrandom 0.4.3` (`:1483`, Abhängigkeiten samt `rand_core 0.10.1` schon aufgelöst), `percent-encoding 2.3.2` (`:3020`) stehen darin; `tokio 1.54.1` hat `bytes`, `libc`, `mio`, `socket2`, `tokio-macros` schon in seiner Liste (für `io-util` und `net` nötig), `sync` bringt nichts mit. Es ändert sich nur die Liste von `terax`.
- Parallelität slice-01 ∥ slice-03: keine gemeinsame Naht außer den Slice-00-Rümpfen; reicht.
- not_checked: die Zahlen „629 grün, 13 ignoriert" und „578 `[[package]]`" (Formales, P5).

### Punkt 3: Nähte zwischen Slices (checked, 9 Nähte)

| Naht | Befund |
|------|--------|
| slice-01 ↔ slice-02 `read_bytes_typed` | trägt: slice-01 ruft im Betrieb den Slice-00-Rumpf, Tests nutzen den Host-Ersatz (`file.rs:753-764`); nach dem Merge von slice-02 ist ohne Umverdrahtung der echte Leser aktiv; Bedeutung der Varianten steht im Vertrag (`build-plan.md:277`) |
| slice-01 Klickweg ↔ OB-14 | widerlegt: PR-02 |
| slice-03 ↔ slice-04 (Zen-Store, Rahmen-Hook, Zen-Taste) | trägt: als Verträge `build-plan.md:696-698`, Konsumenten in slice-04 `:829-831` |
| slice-03 Wisch-Regel ↔ slice-04 `data-no-tab-swipe` | trägt: beide Hälften je mit AC (slice-03 AC 10, 11; slice-04 AC 16) |
| Rust-Commands ↔ TS-Aufrufer | trägt: Schlüssel `{ path, workspace }`, `{ armed }`, Fehlerform `Err(String)` → abgelehnte Promise → Toast „Could not open the browser: …" bzw. Rückfall; Event-Nutzlast `()` → `null` |
| Baustein-E-Konstante | trägt: `HTML_PREVIEW_VIA_SERVER` in slice-04 (`:804`, AC 12) |
| M-C-Varianten | trägt: nur Rust-Konstanten in slice-01 (`:340`, AC 10, 30); der TS-Weg übernimmt die `url` unverändert |
| `ENTRY_EXTENSIONS` ↔ `browserOpenable` | trägt: Guard liest `policy.rs` (slice-04 AC 2); Welle-2-Folge siehe PR-15 |
| App-Verdrahtung (Zen ↔ Seitenleiste, `useTabSwipe`-Rückfrage, `useZenEscape`) | ohne Linux-Test: PR-08 |

### Punkt 4: Abdeckung inhaltlich (checked)

- Sicherheitsmodell, alle 24 Zeilen: 1 (AC 1, 21), 2 (wie 1), 3 (AC 20, Mac N-16 in AC 32), 4 (AC 5, 10), 5 (AC 4, mit Abweichung 400 statt 421, PR-11), 6 (AC 6, 7, 8), 7 (AC 11, **teilweise**: PR-03), 8 (AC 15, **teilweise**: PR-03), 9 (AC 12, 15, 26, **teilweise**: PR-03), 10 (AC 2), 11 (AC 10; slice-00 AC 3; slice-04 AC 3), 12 (Mac N-18, AC 32), 13 (AC 21), 14 (AC 15), 15 (AC 9, 10), 16 (AC 13, 16), 17 (AC 10), 18 (AC 13, 16, 17, 22), 19 (AC 24), 20 (slice-04 AC 2), 21 (slice-04 AC 2, beide Capabilities), 22 (slice-04 AC 15), 23 (AC 5), 24 (kein Test laut Architektur). Jeder Test liegt im Dateibereich seines Slices.
- SEC-1 bis SEC-16: alle mit AC; „nie geloggt" (SEC-1) und „keine Speicherung in Tabs, Einstellungen oder Log" (SEC-8) ohne AC: PR-07.
- Auflagen OB-1 bis OB-15 und OB-18 (16): OB-1 AC 19 · OB-2 slice-02 AC 8 · OB-3 AC 3 · OB-4 slice-02 AC 6 · OB-5 slice-04 AC 15 · OB-6 slice-02 AC 1, 2 · OB-7 AC 6 · OB-8 AC 7 · OB-9 AC 24 · OB-10 AC 4, 5, nicht am echten Socket (PR-04) · OB-11 AC 23 · OB-12 AC 18, Auflösung trägt nicht (PR-01) · OB-13 AC 16 · OB-14 slice-02 AC 4, Toast-Behauptung widerlegt (PR-02) · OB-15 AC 7, 21 · OB-18 slice-04 AC 14.
- Stichprobe 38 weitere IDs: BR-1, BR-2, BR-6, BR-7, BR-9, BR-12, BR-13, BR-15, BR-16, BR-18, BR-19, BR-20, BR-21, BR-22, BR-23, BR-24, BR-25, FL-1, FL-4, FL-7, EP-1, EP-3, EP-5, EP-6, UI-3, UI-5, MIG-4, MIG-5, MIG-10, MIG-11, MIG-12, MIG-20, MIG-21, INV-1, INV-3, INV-4, INV-9, INV-13. Alle mit konkretem Fall und Wert, außer MIG-11 (Deliverable ohne Linux-Test, PR-08); INV-Zeilen über unveränderte Bestandstests gedeckt.

### Punkt 5: Ehrlichkeit der Prüfbarkeit (checked)

- Vier QA-ACs (slice-01 AC 32, slice-02 AC 9, slice-03 AC 12, slice-04 AC 19): auf Linux Testbares ist jeweils schon in Linux-ACs gezogen (Neuladen AC 20, Fehlerarten AC 16, Zen-Store AC 1–9, Quelle AC 12–14); Ausnahme ist die App-Verdrahtung in slice-03 (PR-08).
- Strukturell nicht rot werdende Teile: slice-02 AC 7 „kein Monitor, kein Event", slice-01 AC 10 Release-Hälfte (PR-13). `expectTypeOf` in slice-00 AC 3 wird nur über `pnpm check-types` rot; `tsconfig.json` nimmt `src` samt Tests auf, und AC 3 nennt den Lauf: trägt.

### Punkt 6: Reihenfolge und Größe (checked)

- Kette slice-00 → slice-01 ∥ slice-03 → slice-02 ∥ slice-04 trägt; slice-04 hängt nicht an slice-01, weil der Rückfall auf den heutigen Ladeweg die Rumpf-Antwort `unsupported` abfängt.
- Größe: siehe PR-14 (nur Hinweis).

### Punkt 7: Entscheidungen ohne Vorgabe (checked, 26 Zeilen)

- Wirkung: keine `technisch`-Zeile mit für den User sichtbarer Folge gefunden (geprüft u. a. 400/421, 64 Kopfzeilen, 250 ms, `pl-20`, `collapseForZen`).
- Die drei vom Brief genannten Auflösungen: 400 statt 421 trägt (PR-11); OB-12 trägt nicht (PR-01); Rückfall bei Ablehnung durch `preview_frame_source` trägt (PR-12). Die übrigen gemeldeten Lücken (Bildliste, SSH-Größenprüfung beim Klick, Fehlerseite, Toast-Grund, absolute-form, MaxSessions-Wortlaut) tragen, mit Ausnahme der Toast-Aussage in der MaxSessions-Zeile (PR-02).
- Stille Entscheidung: Grenze 256 über beide Klassen (PR-10, Hinweis, folgt VAL-11 wörtlich).

### Punkt 8: Welle 2 nicht verbaut (checked)

- Art `markdown`, Ordner-Bereich und Kopfzeilen-Zeile liegen bereit (slice-01 AC 2, Deliverable `:344`); kein Typ und keine Konstante sperrt den Markdown-Weg. W2 muss einige W1-Tests umstellen, die Architektur zählt sie nicht mit (PR-15).

## Befunde

### PR-01 · `decision`

- **claim:** `build-plan.md:202` (Entscheidung „Wie lange eine Datei über SSH auf den einzigen Lese-Platz ihres Servers wartet"): „Ein hängender Lesevorgang hält den Platz bis zu seinem eigenen Zeitbudget (bis 244 s, SEC-16); so lange fehlen weitere Dateien dieses Servers nach je 30 s … OB-12 verlangt nur eine Frist, die am Fortschritt der Reihe misst"; Feld „Anforderungen: OB-12, SEC-14, SEC-16, NFR-3" ohne „weicht ab". Umgesetzt in slice-01 `:339` und AC 18 (`:475-479`).
- **evidence:** `gates/obligations.md:18` (OB-12: „… ein hängender Lesevorgang blockiert den einzigen Platz des Hosts nicht 244 s lang für alle Links (`ssh.rs:1506-1509`)"); `src-tauri/src/modules/ssh.rs:1506-1509` (`read_bytes_timeout` mit `expected_size: None` budgetiert auf die Grenze); `architecture.md:170` (SVC-8 ruft `read_bytes_typed(host, pfad, MAX_READ_BYTES, None)`), `architecture.md:259` (SEC-14: 1 Lesevorgang je Host). Architektur (None-Budget, 1 je Host) und Auflage widersprechen sich; der Plan löst das, indem er den letzten Halbsatz von OB-12 nicht erfüllt.
- **evidence_source:** Spec-Dokumente, Code
- **expected_observation:** Mit dem Plan-Entwurf liefert jede weitere Anfrage an Host H, solange ein Lesevorgang auf H hängt, nach 30 s `504`, und zwar bis zum Ende von dessen Budget (bis 244 s). OB-12 sagt in seinem letzten Halbsatz, dass genau das nicht passiert. Die Entscheidung ist richtig als `fachlich` gekennzeichnet, aber das Feld nennt OB-12 nicht hinter „weicht ab" (gate-log-contract: „Sagt eine Kennung nach meiner Wahl etwas anderes als vorher? Dann steht sie hinter ‚weicht ab'.").
- **scenario:** Claude schreibt auf `devbox` einen Bericht mit 30 Bildern; der Lesevorgang des ersten Bildes hängt (langsames NFS). Im Browser fehlen für bis zu vier Minuten alle übrigen Bilder dieses Hosts, und jedes Neuladen zeigt wieder 504-Lücken.
- **Resolution:** Der PM entscheidet: (a) Verhalten wie geplant, dann im Plan „weicht ab: OB-12" setzen und die Auflage als bewusst gelockert melden; oder (b) den Platz wirklich freigeben (z. B. Budget je Datei über eine bekannte Größe, kostet eine zusätzliche Sitzung je Datei, oder den hängenden Lesevorgang ohne Fortschritt abbrechen, dann scheitern große Dateien über langsame Leitungen). Danach zieht der Plan-Schreiber Entscheidungszeile und AC 18 nach.

### PR-02 · `refuted`

- **claim:** `build-plan.md:203` (Entscheidung zu OB-14): „der Text erscheint auf der Fehlerseite im Browser und im Toast". Zusammen mit `:338` (Klick über SSH nutzt `ssh::realpath` und `ssh::stat`) und `:588` („`classify_ssh_error` bleibt, wie es ist").
- **evidence:** `src-tauri/src/modules/ssh.rs:1465-1472` (`realpath` → `run_remote_json` → Fehler als `String`), `:1540-1547` (`stat` ebenso), `:1213-1220` (`read_envelope`: Exit 255 → `exit_error`), `:1109` (`_ => RemoteError::Transport(classify_ssh_error(stderr)…)`), `:950-960` (`permission denied` → „SSH authentication failed — open a terminal to this host first so it can prompt for your key passphrase, then retry."); `architecture.md:259` (SEC-14: abgelehnte Sitzung → eigene Verbindung mit `BatchMode=yes` → Exit 255 nach dem Anmeldeversuch); `build-plan.md:628-631` (slice-02 AC 4 nimmt genau diesen stderr nur für den typisierten Leseweg).
- **evidence_source:** Code, Spec-Dokumente
- **expected_observation:** Mit dem stderr aus slice-02 AC 4 („…Session open refused by peer" gefolgt von „Permission denied (publickey).") liefert der Klick über SSH `{ status: "unreachable", reason: "SSH authentication failed — open a terminal to this host first …" }`, und der Toast lautet „Could not read a.html from devbox: SSH authentication failed — open a terminal to this host first …". Der Wortlaut „the SSH server refused another session (MaxSessions limit)" erreicht den Toast nie.
- **scenario:** Neun SSH-Terminal-Tabs zu `devbox` (MaxSessions 10), Schlüssel mit Passphrase ohne Agent. Der User klickt „Open in Browser" und bekommt den Rat, ein Terminal zu öffnen, obwohl neun offen sind. Genau diesen falschen Hinweis soll OB-14 vermeiden.
- **Resolution:** Plan-Schreiber: entweder (a) der Klickweg bekommt dieselbe Einordnung (z. B. eine reine Einordnungsfunktion oder typisierte Varianten von `realpath`/`stat` als Vertrag aus Slice-00, gefüllt in slice-02, genutzt in slice-01, mit AC), oder (b) die Aussage „und im Toast" fällt weg, und dass der Toast im MaxSessions-Fall den Anmelde-Hinweis zeigt, wird als fachliche Entscheidung geführt.

### PR-03 · `fix`

- **claim:** slice-01 AC 11 (`build-plan.md:433-437`), AC 12 (`:439-443`), AC 15 (`:457-461`) und die NFR-7-Zusage `:345` („Zu den Zeilen … 7, 8, 9 … mindestens einen `cargo test`"): jedes Symlink-Ziel auf ein Geheimnis (`key.png` → `.ssh/id_rsa` neben `p`; `pic.png` → `/home/u/.ssh/id_rsa`) liegt außerhalb des Bereichs; Geheimnis-Namen kommen nur als Pfad-Text vor; über SSH ist nur `.env` geprüft.
- **evidence:** `architecture.md:217` (VAL-7: „Pfad-Text **und aufgelöstes Ziel** bestehen die Sperrliste … zusätzlich kein Segment `.git`"); `architecture.md:277` (Sicherheitsmodell 7), `:278` (8), `:279` (9: „lokal und mit Host-Ersatz: `.env`, `id_ed25519`, `.ssh/config`, `.git/config` ergeben `403`").
- **evidence_source:** Spec-Dokumente
- **expected_observation:** Eine Umsetzung, die Sperrliste und `.git` nur auf dem Pfad-Text und auf dem Ziel nur den Bereich prüft, besteht AC 11, 12 und 15, liefert aber lokal `p/ok.png` → `p/.ssh/id_rsa` (Ziel im Bereich) und über SSH `link.png` mit gemeldetem Ziel `/srv/p/.git/config` aus. `.git/config` und `id_ed25519` über den Host-Ersatz fehlen ganz.
- **scenario:** Eine untergeschobene HTML-Seite im Projektordner bindet `logo.png` ein, das auf `.git/config` im selben Ordner zeigt (Token in der Remote-Adresse); ihr Skript liest es per gleicher Herkunft aus.
- **Resolution:** AC 11 um je einen Symlink im Bereich auf `p/.env` und `p/.ssh/id_rsa` ergänzen (`403` „Refused by Terax"); AC 15 um die Anfragen `id_ed25519` und `.git/config` (`403`, ohne Aufruf des Host-Ersatzes) und um Ziele `/srv/p/.env` und `/srv/p/.git/config` ergänzen (`403`).

### PR-04 · `fix`

- **claim:** slice-01 AC 4 (`build-plan.md:391-395`) und AC 5 (`:397-401`) prüfen fehlenden oder doppelten Host, `405` mit `Allow` und 65 Kopfzeilen nur über `parse_request` in `request.rs`; am echten Socket (AC 22, `:499-503`) kommt `431` nur über einen Kopf über 64 KiB vor.
- **evidence:** `gates/obligations.md:16` (OB-10, Nachweis: „Tests am echten Socket").
- **evidence_source:** Spec-Dokumente
- **expected_observation:** Kein Test schickt `POST` an einen echten Listener und liest `405` samt `Allow: GET, HEAD` vom Draht; ebenso fehlen fehlender Host → `400` und 65 Kopfzeilen → `431` am Socket. Ein Fehler beim Schreiben der Ablehnung (Kopfzeile fehlt, falscher Code in der Hülle) bliebe unentdeckt.
- **scenario:** Die Hülle in `listener.rs` bildet die Ablehnung aus `parse_request` versehentlich auf `400` ohne `Allow` ab; alle ACs bleiben grün.
- **Resolution:** Ein AC in `listener.rs` mit echtem Socket für `POST` (`405`, `Allow: GET, HEAD`, leerer Rumpf), fehlenden `Host` (`400`) und 65 Kopfzeilen (`431`).

### PR-05 · `fix`

- **claim:** Slice-00-Rümpfe `build-plan.md:249` („`read_bytes_typed` mit dem Rumpf `Err(RemoteReadError::Failed("not implemented"))`"), `:247` (Commands antworten nur `unsupported`), `:250` („`zen_escape_arm` ohne Wirkung"), dazu AC 4 `:306-310` (Clippy mit `-D warnings` endet mit Exit 0).
- **evidence:** `build-plan.md:266` (`Failed(String)`), `architecture.md:359`; Parameterlisten `build-plan.md:263`, `:264`, `:267`, `:268`.
- **evidence_source:** Spec-Dokumente
- **expected_observation:** `Failed("not implemented")` ist ein `&str` an einem `String`-Feld (E0308); Rümpfe ohne Nutzung von `app`, `path`, `workspace`, `armed`, `host`, `limit`, `expected_size` erzeugen `unused_variables`, was mit `-D warnings` AC 4 rot macht.
- **scenario:** Der Bauer von slice-00 übernimmt den Rumpf wörtlich; der erste Rust-Lauf scheitert, die Steuereinheit verliert einen seriellen Lauf.
- **Resolution:** Rumpf `Failed("not implemented".to_string())`; Parameter über `let _ = (…);` verbrauchen. Die Command-Parameter nicht in `_path`, `_workspace` oder `_armed` umbenennen, weil ihr Name die Schlüssel der Nahtstelle (`{ path, workspace }`, `{ armed }`) trägt.

### PR-06 · `obligation`

- **claim:** `build-plan.md:207` (Zen-Taste: „Tooltip und Name ‚Toggle zen mode'"), `:225` und `:812` (bestehende Testdateien bleiben unverändert); slice-04 setzt die Kopfzeile in `EditorPane.tsx` (`:807`) und importiert `preview-server` in `FileExplorer.tsx` (`:808`).
- **evidence:** `src/modules/editor/EditorPane.preview-env.test.tsx:51` rendert `<EditorPane path={PHOTO} />` ohne `TooltipProvider`; `src/components/ui/tooltip.tsx:21-25` (`Tooltip` ist nur `TooltipPrimitive.Root`, ohne eigenen Provider); der Provider steht nur in `src/app/App.tsx:1629`. `src/modules/explorer/FileExplorer.test.tsx:43-47` mockt `@/modules/workspace` nur mit `currentWorkspaceEnv` und `useWorkspaceEnvStore`, `:41` `sonner` nur mit `toast.message` und `toast.error`.
- **evidence_source:** Code; Radix-Verhalten („`Tooltip` must be used within `TooltipProvider`") nach Bibliotheksdoku, im Worktree nicht nachgelesen (kein `node_modules`).
- **expected_observation:** Nutzen `ZenToggleButton` oder `OpenInBrowserButton` den Radix-`Tooltip`, wirft `EditorPane.preview-env.test.tsx` beim Rendern des Bildes. Importiert `src/modules/preview-server/**` einen Wert (nicht nur einen Typ) aus `@/modules/workspace`, scheitert `FileExplorer.test.tsx` am Teil-Mock. In beiden Fällen müsste ein Bestandstest geändert werden, was der Plan ausschließt.
- **scenario:** Der Bauer von slice-03 folgt dem Wort „Tooltip" aus der Entscheidung, und slice-04 wird an einem fremden Test rot.
- **Resolution:** Auflage in die Briefs von slice-03 und slice-04: Tasten mit `title` wie `PreviewAddressBar.tsx:139`, `:222`, kein Radix-`Tooltip`; `preview-server` importiert aus `@/modules/workspace` nur Typen; Toasts nur über `toast.error`.

### PR-07 · `obligation`

- **claim:** `build-plan.md:342` („Kein Log und keine Fehlermeldung enthält Geheimnis oder Eintritts-Adresse") und `:804` („die Rahmen-Adresse lebt nur im Zustand der Pane, nie im Tab, in Einstellungen oder im Log") stehen als Deliverables ohne AC.
- **evidence:** `architecture.md:231` (SEC-1: „nie gespeichert, nie geloggt"), `:243` (SEC-8), `:691` (wiederhergestellte Tabs speichern nie eine Server-Adresse).
- **evidence_source:** Spec-Dokumente
- **expected_observation:** Ein `log::debug!` mit `url` oder ein Ablegen der Rahmen-Adresse im Tab macht keinen Test rot.
- **scenario:** Beim Debuggen von M-C wird `log::info!("frame url {url}")` eingefügt und bleibt stehen; das Geheimnis steht im Terax-Log.
- **Resolution:** Code-Review von slice-01 und slice-04 prüft jede `log::`-Zeile unter `preview_server/` und den Weg von `FrameSource.url` (nur Zustand der Pane). Wahlweise ein Quelltext-Guard nach dem Muster `chromeProbe.guard.test.ts`.

### PR-08 · `note`

- **claim:** slice-03 Deliverable `App.tsx` (`build-plan.md:685`, MIG-11 „Deliverable") verdrahtet `collapseForZen`/`restoreAfterZen` beim Ein- und Ausschalten, `hiddenInZen`, `useZenEscape()` und die dritte Rückfrage von `useTabSwipe`; geprüft wird das nur am Mac (AC 12, `:775-778`).
- **evidence:** `src/app/App.tsx:1185` (`useTabSwipe(appRootRef, swipeTab)`), `:1706-1710` (`onResize` → `persistSidebarCollapsed`); Quelltext-Guard-Muster `src/modules/ports/chromeProbe.guard.test.ts:15`.
- **evidence_source:** Code
- **expected_observation:** Vergisst `App.tsx` den Aufruf von `collapseForZen` oder die Rückfrage an `useTabSwipe`, bleiben alle Linux-Tests grün.
- **scenario:** –
- **Resolution:** Hinweis: Die Zen-Seitenleisten-Kopplung als kleiner Hook im Zen-Modul (mit Test) oder ein Quelltext-Test auf die `useTabSwipe`-Zeile holt das von N-12/N-22 auf Linux.

### PR-09 · `note`

- **claim:** MIG-3 (`build-plan.md:244`): `.manage(PreviewServer)`, drei Commands im `generate_handler!` und die Esc-Monitor-Zeile haben keinen Test.
- **evidence:** Muster „registers exactly the two commands" `src/modules/ports/chromeProbe.guard.test.ts:97-102` liest `lib.rs`.
- **evidence_source:** Code
- **expected_observation:** Ein fehlendes `.manage` fällt erst am Mac beim ersten Klick auf (Tauri-State fehlt).
- **scenario:** –
- **Resolution:** Hinweis: `browserOpen.guard.test.ts` kann `lib.rs` auf die drei Commands und `.manage(preview_server::PreviewServer::default())` prüfen.

### PR-10 · `note`

- **claim:** `build-plan.md:339` und AC 27 (`:529-533`): 256 Freigaben „über beide Klassen"; nicht unter „Entscheidungen ohne Vorgabe".
- **evidence:** `architecture.md:221` (VAL-11: „Höchstens 256 Freigaben zugleich"), `:881` (Q&A 9 fragte nach „Browser-Links", vor Baustein E); `build-plan.md:855` (Toast „Too many browser links are open. Restart Terax to free them.").
- **evidence_source:** Spec-Dokumente
- **expected_observation:** Jede in der App geöffnete HTML-Datei verbraucht eine `frame`-Freigabe bis Prozessende. Nach 256 verschiedenen In-App-Vorschauen meldet „Open in Browser" zu viele Browser-Links, obwohl kaum welche geöffnet wurden.
- **scenario:** –
- **Resolution:** Hinweis: Der Plan folgt VAL-11 wörtlich. Die Folge für den Toast-Text sollte als Entscheidung benannt werden (getrennte Grenzen oder anderer Text).

### PR-11 · `note`

- **claim:** `build-plan.md:208` (400 statt 421 bei fehlendem oder doppeltem Host, „weicht ab: VAL-1", technisch).
- **evidence:** `architecture.md:275` (Sicherheitsmodell 5, Test-Text „fehlender Host ergeben `421`"), `gates/obligations.md:16`.
- **evidence_source:** Spec-Dokumente
- **expected_observation:** Die Auflösung trägt: beide Antworten sind leer, der User merkt nichts, die Abweichung ist gekennzeichnet.
- **scenario:** –
- **Resolution:** Hinweis: Der Doc-Kommentar `/// Sicherheitsmodell 5` am Test aus AC 4 nennt die Abweichung, damit Review und Abschlussbericht sie nicht als Fehler lesen.

### PR-12 · `note`

- **claim:** `build-plan.md:201` (Rückfall auf den heutigen Ladeweg, wenn `preview_frame_source` nicht `ready` liefert) und `:804`.
- **evidence:** `architecture.md:664` („Einen automatischen Rückfall zur Laufzeit gibt es nicht", im Zusammenhang „Rahmen bleibt weiß"); `src/modules/html/HtmlPreviewPane.tsx:54-93` (heutiger Weg); API-6 `architecture.md:105` (lokal: neuer Asset-Zähler und erneutes `asset_allow`).
- **evidence_source:** Spec-Dokumente, Code
- **expected_observation:** Die Auflösung trägt. Sie zeigt nie weniger als heute und gibt nichts frei, was heute nicht schon frei ist. Sie widerspricht der Architektur nur im Wortlaut, nicht im geregelten Fall. Das Neu laden auf dem Asset-Rückfall hat mit Baustein an kein AC (AC 9 ist WSL, AC 14 der Server-Weg).
- **scenario:** –
- **Resolution:** Hinweis: AC 13 um „Reload" auf der dritten Pane ergänzen (zweites `asset_allow`, neue `?v=`-Adresse).

### PR-13 · `note`

- **claim:** slice-02 AC 7 (`build-plan.md:646-650`, „es wird kein Monitor installiert und kein Event gesendet"); slice-01 AC 10 (`:429`, „der letzte Eintrag nur im Debug-Build").
- **evidence:** `build-plan.md:268` (`zen_escape_arm(armed: bool)` ohne `AppHandle`), `:269` (Monitor nur unter `cfg(target_os = "macos")`).
- **evidence_source:** Spec-Dokumente
- **expected_observation:** Auf Linux gibt es weder einen Sendeweg noch einen Monitor. Dieser Teil von AC 7 kann nicht rot werden, prüfbar ist nur der Schalter. Die Release-Hälfte von AC 10 läuft im normalen `cargo test` nicht mit.
- **scenario:** –
- **Resolution:** Hinweis: Beides als Review-Punkt führen, nicht als Testaussage.

### PR-14 · `note`

- **claim:** slice-04 mit 29 Dateien aus den Bereichen C, D, F, G (`build-plan.md:795`); slice-01 mit 32 ACs (`:373-562`).
- **evidence:** `architecture.md:405-418` (C ohne den Rest baubar; G braucht D).
- **evidence_source:** Spec-Dokumente
- **expected_observation:** Ein Schnitt ohne neue geteilte Datei ist möglich, aber kein belegter Schaden: slice-04a = Bereich C (`src/modules/preview-server/**` mit 10 Dateien, `FileExplorer.tsx`, `FileExplorer.openInBrowser.test.tsx`), danach slice-04b = D, F, G (übrige 17 Dateien). Dann wandert die Aussage „genau eine Datei ruft `preview_frame_source`" aus `browserOpen.guard.test.ts` in einen Test von 04b, sonst ist 04a rot. slice-01 lässt sich nur teilen, wenn Slice-00 alle Untermodule in `preview_server/mod.rs` anlegt; Rust läuft ohnehin seriell, also kein Gewinn.
- **scenario:** –
- **Resolution:** Hinweis für die Steuereinheit, keine Pflicht.

### PR-15 · `note`

- **claim:** `build-plan.md:265` (`ENTRY_EXTENSIONS` „Name, Typ und Werte bleiben") und `:344` (laufende Welle als eigene Konstante in `policy.rs`).
- **evidence:** `architecture.md:645` („W2 ändert nur `policy.rs`, `markdown.rs`, `Cargo.toml`, `browserOpenable.ts`"); W1-Tests mit festen Welle-1-Werten: slice-00 AC 2 (`build-plan.md:296`), slice-01 AC 9 (`:423`, „`k.md` … nicht"), slice-04 AC 1 (`:836`), AC 7 (`:873`).
- **evidence_source:** Spec-Dokumente
- **expected_observation:** Welle 2 ist nicht verbaut. Sie muss aber diese vier Testdateien umstellen, und `policy.rs` hat dann zwei Quellen (Wellen-Konstante und flache Liste), die der Quelltext-Guard aus slice-04 nur als wörtliche Liste lesen kann.
- **scenario:** –
- **Resolution:** Hinweis für den W2-Lauf. Wahlweise leitet `ENTRY_EXTENSIONS` sich schon in W1 sichtbar aus der Wellen-Konstante ab, und der Guard liest das Ergebnis.

### PR-16 · `note`

- **claim:** slice-04 AC 2 (`build-plan.md:843`): „genau eine Datei ruft `preview_open_in_browser`".
- **evidence:** `build-plan.md:251` (Slice-00 schreibt `src/modules/preview-server/types.ts`); Muster mit Aufruf-Regex `src/modules/ports/chromeProbe.guard.test.ts:44-55`.
- **evidence_source:** Spec-Dokumente, Code
- **expected_observation:** Zählt der Guard Dateien per Textsuche, macht schon ein Doc-Kommentar mit dem Command-Namen in `types.ts` ihn rot.
- **scenario:** –
- **Resolution:** Hinweis: Der Guard zählt `invoke(…"preview_open_in_browser"…)`-Aufrufe wie `chromeProbe.guard.test.ts`, keine Textstellen.

## Verdict

**FAILED.** Blockierend sind PR-01 (`decision`: OB-12 wird teilweise nicht erfüllt, ohne dass „weicht ab" es sagt) und PR-02 (`refuted`: die Toast-Aussage zu OB-14 ist am Code widerlegt). Fix: PR-03, PR-04, PR-05. Auflagen: PR-06, PR-07. Hinweise: PR-08 bis PR-16.
