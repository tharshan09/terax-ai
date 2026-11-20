# Post-Implement Review Report

**Feature:** SSH Remote Workflow, Welle 2 (Ports)
**Branch:** ssh-remote-ports (Stand 75323d8)
**Default-Branch:** ssh-remote-workflow (Merge-Base ca87bfe, Welle 1 als Basis)
**Datum:** 2026-11-20
**Perspektive:** quality+alignment (Teil A + Teil B)
**Prüfmenge:** `git diff ssh-remote-workflow...ssh-remote-ports -- src src-tauri TERAX.md`, 32 Dateien, jede vollständig gelesen. Kontext: `wave-2/slim-spec.md`, `wave-2/slop-dispositions.md`, `discovery.md` (nur Welle-2-Kennungen).
**Nicht geprüft:** `specs/**` (außerhalb der Prüfmenge laut Auftrag); vitest und cargo test nicht ausgeführt (kein cargo auf dem Host, laut Auftrag nicht nötig); die QA-Akzeptanzkriterien S3 AC-9 und S4 AC-5 (nur in der macOS-App beobachtbar).
**Messungen:** Zwei Befunde (RV-1, RV-6) stützen sich auf Laufzeitmessungen mit den unveränderten Quelldateien `src/lib/loopback.ts`, `src/modules/ports/lib/portDetect.ts`, `src/modules/ports/lib/ports.ts` (nur Importpfade umgeschrieben), Node 22.23 mit `--experimental-strip-types`, 64-KB-Chunks, auf dem Review-Host. Die Werte in JavaScriptCore der App weichen ab, das Wachstumsverhalten nicht.

---

## Summary

**Verdict:** FAILED

### Part A: Code Quality

| Kriterium | Findings |
|-----------|----------|
| A.1 Logic Errors | 3 |
| A.2 Error Handling | 2 |
| A.3 Security | 0 |
| A.4 Anti-Patterns | 4 |
| **Subtotal** | **9** |

### Part B: Codebase Alignment

| Kriterium | Findings |
|-----------|----------|
| B.1 Duplicate Solution Paths | 0 |
| B.2 Abstraction Reuse | 0 |
| B.3 Schema Consistency | 0 |
| B.4 Dead Code / Unused Imports | 0 |
| B.5 Error Handling Divergence | 0 |
| B.6 Configuration Drift | 0 |
| B.7 Interface Inconsistency | 0 |
| B.8 Dependency Direction | 0 |
| B.9 Security Pattern Consistency | 0 |
| B.10 Performance Pattern Consistency | 1 |
| **Subtotal** | **1** |

| **Total** | **10** |

Nach Klasse: decision 3 (RV-1, RV-2, RV-4), fix 3 (RV-3, RV-5, RV-6), obligation 1 (RV-8), note 3 (RV-7, RV-9, RV-10). Blockierend nach G4: die drei decision-Befunde.

---

## Findings

### RV-1: Ausgabe kann Angebote unbegrenzt fluten, der Aufbau ist quadratisch

**Kategorie:** A.4
**Klasse:** decision

**Problem:**
BR-12 begrenzt Angebote nur je Pane und Port, nicht in der Zahl. `offerPorts` legt für jeden neuen Port ein Angebot an; `addOffer` prüft dazu linear (`findOffer`, `isPending`, `findForward`) und kopiert das ganze Array (`[...model.offers, ...]`), also O(n) je Angebot und O(n²) für n Angebote. `seenByPane` wächst je Pane bis 64512 Einträge.
Messung (Beleg Laufzeit): 1.023.216 Bytes `localhost:1024 ` bis `localhost:65535 ` in 16 Chunks durch `PortDetector.feed` und die `addOffer`-Schleife von `offerPorts`: 64512 Angebote in 29.174 ms, `offerView` zeigt `+64511`. In der App läuft das synchron in `deliverPtyBytes` auf dem Main-Thread.
Ohne böse Absicht: `ss -tan` oder `netstat -an` auf einem Server mit lokalen Verbindungen (App zu Datenbank über 127.0.0.1) gibt jede ephemere Gegenstelle als `127.0.0.1:4xxxx`/`5xxxx` aus; jede ist ein Angebot (alle über 1024).

**Neuer Code:** `src/modules/ports/lib/portsStore.ts:109-127`, `src/modules/ports/lib/ports.ts:100-106`, `:121-137`, `src/modules/ports/lib/portDetect.ts:173`
**Bestehendes Pattern:** -- (Teil A)

**Erwartete Beobachtung:** `cat` einer 1-MB-Datei mit allen Ports in einem `devbox`-Pane friert die Oberfläche mehrere Sekunden ein und zeigt `Forward port 65535? +64511`; `ss -tan` mit 300 lokalen Verbindungen zeigt `+299` oder mehr.

**Empfehlung:**
Entscheiden, wie viele Angebote je Server gelten (zum Beispiel nur die neuesten 20 behalten, ältere verwerfen, `seenByPane` gleich begrenzen) und ob ephemere Ports (ab 32768) aus Erkennung ohne Schema ausgenommen werden. Unabhängig davon `addOffer` auf einen Index nach `scope:port` umstellen, damit das Anlegen O(1) bleibt.

---

### RV-2: Ein einmal gesehener Port wird im selben Pane nie wieder angeboten

**Kategorie:** A.1
**Klasse:** decision

**Problem:**
`offerPorts` trägt den Port in `seenByPane` ein, bevor `addOffer` entscheidet, und auch wenn `addOffer` ablehnt (Port gerade freigegeben, in Arbeit oder schon von einem anderen Pane angeboten). Der Eintrag wird nur bei `paneClosed` gelöscht. Folgen:
1. Port 3000 wird freigegeben, dann gestoppt (TR-10, Zustand `port_unknown`). Gibt der Dev-Server im selben Pane danach wieder `localhost:3000` aus, entsteht kein Angebot, obwohl TR-4 aus `port_unknown` ein Angebot vorsieht. Dasselbe nach angenommenem Angebot und Stop.
2. Pane 7 zeigt das Angebot 5173, Pane 8 gibt 5173 ebenfalls aus (kein Angebot, aber in `seen`). Wird das Angebot von Pane 7 verworfen, bekommt Pane 8 nie eins, obwohl BR-12 je Terminal zählt und Pane 8 nie eins gezeigt hat. Der Test zu S2 AC-3 deckt nur den Fall ab, dass Pane 8 den Port erst nach dem Verwerfen ausgibt.
Der Reinfunktions-Test `returns a stopped port to unknown` (`ports.test.ts:105`) belegt `portPhase`, nicht das Verhalten des Stores.

**Neuer Code:** `src/modules/ports/lib/portsStore.ts:121-125`, `:129-134`

**Erwartete Beobachtung:** Store-Test: `seed([active(3000)])`, `feed(7, "localhost:3000\r\n")`, `stopForward(DEVBOX, 3000)`, `feed(7, "localhost:3000\r\n")` ergibt `offers() == []` (nach TR-4 erwartet: `[[7, 3000]]`).

**Empfehlung:**
Entscheiden, ob nach Stop oder Annahme dasselbe Pane erneut anbieten soll (TR-10/TR-4 sagt ja; Gegenargument: ein TUI-Repaint bietet sofort wieder an). Technisch: in `seen` nur eintragen, wenn tatsächlich ein Angebot entstand oder verworfen wurde (ST-8), und den Eintrag bei Annahme entfernen.

---

### RV-3: Klick auf eine Loopback-URL mit `[` oder `]` im SSH-Pane öffnet den System-Browser des Macs

**Kategorie:** A.1
**Klasse:** fix

**Problem:**
`WEB_URL_REGEX` (wie der Addon-Standard) lässt `[` und `]` mitten in der URL zu, `ADDRESS` in `portDetect.ts` schließt sie im Pfad aus. `linkClickTarget` verlangt, dass `parseLoopbackAddress` den ganzen Linktext deckt. Für `http://localhost:3000/items?filter[status]=open` liefert der WebLinksAddon diesen ganzen Text, `parseLoopbackAddress` nur bis `?filter`, also `browser`. Der Klick öffnet `localhost:3000` des Macs im System-Browser ohne Freigabe, statt die Server-Seite in der Vorschau (FL-8). Gemessen (Beleg Laufzeit): `"http://localhost:3000/items?filter[status]=open" -> browser`, `"http://[::1]:4000/x" -> forward`.

**Neuer Code:** `src/modules/ports/lib/portDetect.ts:14`, `:48-52`; `src/modules/terminal/lib/terminalLinks.ts:56-63`; `src/modules/terminal/lib/rendererPool.ts:282-287`

**Erwartete Beobachtung:** `linkClickTarget("http://localhost:3000/items?filter[status]=open", true) === "browser"`.

**Empfehlung:**
Für Links mit Schema das Ziel über `new URL(text)` bestimmen (Host über `isLoopbackHost(..., "detect")`, Port aus `url.port`, Rest aus `pathname + search + hash`); `parseLoopbackAddress` nur für die schemalose Form nutzen. Testfall mit Klammern in Query ergänzen.

---

### RV-4: Die Freigabe bindet nur 127.0.0.1; ein später auf [::1] gestarteter Mac-Dienst übernimmt `localhost:{Mac-Port}`

**Kategorie:** A.1
**Klasse:** decision

**Problem:**
Stolperstein 4 der Slop-Dispositionen beschreibt den Fall: WebKit versucht für `localhost` zuerst `::1`; belegt ein anderer Mac-Prozess `[::1]` mit derselben Nummer, lädt die falsche Seite. Die Umsetzung prüft `[::1]` nur beim Anlegen (`port_free`). Danach bleibt `[::1]:{Mac-Port}` frei. Ein danach gestarteter lokaler Dev-Server, der `localhost` bindet (Node ab 17 löst auf `::1` auf, zum Beispiel Vite auf 5173), bindet ohne Konflikt; Vorschau, "Open in browser" und die kopierte Adresse `http://localhost:5173` zeigen dann still die Mac-Seite statt der Server-Seite. TERAX.md beschreibt diese Restgrenze nicht.

**Neuer Code:** `src-tauri/src/modules/ports.rs:15`, `:88-90`, `:126-134`; `src/modules/ports/lib/portDetect.ts:54-57`

**Erwartete Beobachtung:** Freigabe Server 5173 auf Mac 5173, danach auf dem Mac `python3 -m http.server 5173 --bind ::1` startet ohne Fehler, und `curl http://localhost:5173/` auf dem Mac liefert die Mac-Seite.

**Empfehlung:**
Entscheiden: (a) zusätzlich `[::1]:{mac}:localhost:{server}` über denselben Master freigeben (zweites `-L`, beim Stop beide `cancel`), weiterhin nur Loopback (BR-15 bleibt erfüllt); oder (b) die Grenze in TERAX.md dokumentieren. Option (a) ändert den TERAX.md-Satz "never another bind address".

---

### RV-5: Die Halte-Sitzung gilt als gehalten, sobald der Prozess startet

**Kategorie:** A.2
**Klasse:** fix

**Problem:**
`Holder::spawn` meldet Erfolg nach `Command::spawn`; ob die Sitzung auf dem Master wirklich läuft, prüft niemand. Endet sie sofort (sshd `MaxSessions` erreicht, bei Default 10 Sitzungen je Verbindung mit mehreren Terminal-Panes plausibel; `ForceCommand`; Server beendet die Sitzung), meldet `ssh_port_forward` trotzdem `active`. `running()` wird nur bei der nächsten Freigabe gefragt, `list` vergleicht nur die pid (`:433`) und startet keine neue Halte-Sitzung. Nach dem Schließen der Terminals endet der Master nach `ControlPersist`, entgegen Z2.
Zweiter Aspekt: `ControlMaster=no` (`:116`) fällt bei fehlendem Master-Socket auf eine eigene Direktverbindung zurück (OpenSSH `muxclient` gibt bei `ENOENT` für den Befehl OPEN -1 zurück und ssh verbindet normal). Verschwindet der Master zwischen `master_pid_at` und dem Start der Halte-Sitzung, hält Terax still eine eigene SSH-Verbindung mit `cat`, die als Halter des alten Masters geführt wird.

**Neuer Code:** `src-tauri/src/modules/ports.rs:108-124`, `:257-273`, `:290-298`, `:426-437`

**Erwartete Beobachtung:** sshd mit `MaxSessions 1`, ein Terminal offen: `ssh_port_forward(devbox, 18080)` liefert `active`, auf dem Server läuft kein `cat`; Terminal schließen, nach `ControlPersist` plus 5 s liefert `ssh_port_list(devbox)` den Status `disconnected`.

**Empfehlung:**
Nach dem Start kurz (`try_wait` nach 300 bis 500 ms) prüfen und ein sofortiges Ende als Fehler von `keep_open` behandeln (der vorhandene Fehlerpfad nimmt die Freigabe zurück); in `list` eine beendete Halte-Sitzung bei lebendem Master neu starten. Für den zweiten Aspekt die Direktverbindung ausschließen, etwa mit `-o ProxyCommand=false` vor `control` (der Mux-Pfad wird vor dem ProxyCommand versucht), und das mit dem e2e-Test belegen.

---

### RV-6: Erkennung im heißen Pfad kostet bei Ausgabe mit `:Ziffer` ein Vielfaches

**Kategorie:** B.10
**Klasse:** fix

**Problem:**
`PortDetector.feed` läuft für jede Byte-Folge eines SSH-Panes auf dem Main-Thread (`deliverPtyBytes`). Für jedes Wort mit `:` gefolgt von einer Ziffer baut `endWord` per `String.fromCharCode(...subarray)` einen String und ruft den Regex. Messung (Beleg Laufzeit), je 100 MB: Fließtext 427 ms; Log-Zeilen `2026-11-20T12:34:56.789Z INFO server.ts:123 ...` 3.354 ms; mit vorgeschaltetem Host-Substring-Test immer noch 2.429 ms, die Kosten liegen also im String-Bau. Typische Ausgaben dieser Art: Logs mit Uhrzeit, `grep -n`, Compiler-Fehler `datei.ts:12:5`. Bei `cat` eines großen Logs oder `tail -f` verdoppelt das grob die JS-Arbeit je Chunk.

**Neuer Code:** `src/modules/ports/lib/portDetect.ts:149-177`, `src/modules/terminal/lib/useTerminalSession.ts:561`
**Bestehendes Pattern:** `src-tauri/src/modules/pty/agent_detect.rs:84-86` (der bestehende Detektor im PTY-Pfad überspringt einen Chunk ohne ESC sofort und baut keine Strings aus Rohausgabe; TERAX.md Quality bar "Performance ... wasted work").

**Erwartete Beobachtung:** Dieselbe Messung mit den Quelldateien des Branches ergibt für 100 MB Log-Zeilen etwa das 8-fache der Fließtext-Zeit.

**Empfehlung:**
Vor dem String-Bau auf Bytes entscheiden: beim `push` die Position des letzten `:` merken und nur dann einen String bauen, wenn die Bytes davor auf `localhost`, `127.0.0.1`, `0.0.0.0` oder `::1]` enden. Ziel: Log-Fall nahe am Fließtext-Fall.

---

### RV-7: Ein globaler Mutex für alle Hosts liegt über ungetakteten `ssh -O`-Aufrufen

**Kategorie:** A.4
**Klasse:** note

**Problem:**
`forward`, `stop` und `list` halten `Registry::hosts` (ein Mutex für alle Hosts) über `ssh::master_pid_at`, das `cmd.output()` ohne Budget aufruft (`ssh.rs:1316-1323`), und `forward` zusätzlich über bis zu 16 `ssh -O forward` mit je 6 s Budget, die Port-Proben und den Start der Halte-Sitzung. Der Main-Thread ist nicht betroffen (`spawn_blocking`). Hängt ein Master (die Codebase kennt den Fall, `tmux.rs:375-379`), blockieren alle Port-Befehle aller Server, jeder belegt einen Blocking-Thread, und Stop/Retry/Forward zeigen dauerhaft den Spinner.

**Neuer Code:** `src-tauri/src/modules/ports.rs:324-329`, `:358-361`, `:405-414`, `:426-432`

**Erwartete Beobachtung:** Master von `devbox` mit `kill -STOP` anhalten, `ssh_port_list(devbox)` kehrt nicht zurück, ein danach gestartetes `ssh_port_list(other)` ebenfalls nicht.

**Empfehlung:**
Die Lebend-Prüfung in `ports.rs` mit dem vorhandenen Budget laufen lassen (wie `run_ssh` mit `MUX_TIMEOUT`) und den Mutex je Host führen.

---

### RV-8: Fehlende Tests für Akzeptanzkriterien von Slice 4 und für `normalizeUrl`

**Kategorie:** A.4
**Klasse:** obligation

**Problem:**
TERAX.md verlangt für Änderungen an einem Kernsystem (Terminal, IPC) einen Test, der die Invariante festhält. Ohne Test:
- S4 AC-1: dass `deliverPtyBytes` auch ohne Renderer-Slot an `feedPaneOutput` liefert, mit `paneWorkspace(s)` (nicht dem globalen Workspace), und dass `onExit` mit Code 255 genau eine `ssh_port_list` auslöst. Getestet ist nur `feedPaneOutput` selbst (`portsStore.test.ts`).
- S4 AC-3: dass `rendererPool.activateLink` im SSH-Pane bei einer Loopback-Adresse `openUrl` nicht ruft und sonst genau einmal. `terminalLinks.test.ts` prüft nur die reine Funktion `linkClickTarget`; die Verdrahtung (`rendererPool.ts:282-287`, `:298-300`, `:352-371`) ist ungetestet.
- S4 AC-4: Ports-Menü der Vorschau (`data-status` `local`, `remote-empty`, `remote-list`, nur aktive Freigaben, Laden ohne Probe). Kein Test rendert `PreviewAddressBar`.
- S2 AC-1 ("Vorschau nimmt dieselben URLs an wie vorher"): `normalizeUrl` (`PreviewAddressBar.tsx:303-312`) ändert sich für `app.localhost:3000` (vorher `https://`, jetzt `http://`) und `[::1]:3000` (vorher unverändert, jetzt `http://`); es gibt dafür keinen Test.

**Neuer Code:** `src/modules/terminal/lib/useTerminalSession.ts:553-562`, `:651-652`; `src/modules/terminal/lib/rendererPool.ts:282-287`; `src/modules/preview/PreviewAddressBar.tsx:124-129`, `:251-287`, `:303-312`

**Erwartete Beobachtung:** `grep -rl "preview-ports-menu\|activateLink\|normalizeUrl\|deliverPtyBytes" src --include=*.test.*` findet keinen Test.

**Empfehlung:**
Je ein Test für die vier Punkte; `normalizeUrl` dafür exportieren oder über die Komponente prüfen. Die beiden Verhaltensänderungen von `normalizeUrl` sind laut Prüfung unkritisch (frühere Ergebnisse waren fehlerhaft: `https://` für einen `*.localhost`-Dev-Server, ein relativer iframe-`src` für `[::1]:3000`), sollen aber festgehalten werden.

---

### RV-9: Wieder eingefügter Geviertstrich im Leertext der Vorschau

**Kategorie:** A.4
**Klasse:** note

**Problem:**
Der Diff fügt die Zeile `often block embedding <U+2014> open them in your browser via the link` (Geviertstrich U+2014) neu ein (in den lokalen Zweig verschoben). TERAX.md Conventions: "No em-dash anywhere".

**Neuer Code:** `src/modules/preview/PreviewPane.tsx:187`

**Erwartete Beobachtung:** `grep -n $'\u2014' src/modules/preview/PreviewPane.tsx` trifft Zeile 187; die Zeile ist eine `+`-Zeile des Diffs.

**Empfehlung:**
Satz mit Doppelpunkt oder Punkt schreiben, wenn die Zeile ohnehin angefasst wird.

---

### RV-10: Das Port-Feld wird auch nach gescheiterter Freigabe geleert

**Kategorie:** A.2
**Klasse:** note

**Problem:**
`forwardPortInput` gibt nach `ensureForward` immer `null` zurück, auch wenn die Freigabe scheiterte (`ensureForward` liefert dann `null`, Toast nach EP-9). `PortInput` leert bei `null` das Feld. Nach "not connected" oder einem Bind-Fehler muss der User die Nummer neu tippen, um es noch einmal zu versuchen.

**Neuer Code:** `src/modules/ports/lib/portsStore.ts:222-231`; `src/modules/ports/PortsList.tsx:262-265`

**Erwartete Beobachtung:** Liste offen, `5173` eingeben, `ssh_port_forward` scheitert: Toast erscheint, das Feld ist leer.

**Empfehlung:**
Erfolg an `PortInput` zurückgeben und das Feld nur bei Erfolg leeren.

---

## Geprüft ohne Befund

- **ports.rs, Register gegen Wirklichkeit:** Master stirbt oder Reconnect: Status über die pid aus `ssh -O check`, alte Freigaben `disconnected`, Retry legt auf dem neuen Master neu an, eine alte Halte-Sitzung wird bei `list` oder beim nächsten Forward ersetzt. Zwei gleichzeitige Forwards desselben Ports und Stop während Forward sind durch den Mutex serialisiert; der zweite Forward bekommt die bestehende Freigabe. Halte-Sitzung endet beim Stop der letzten Freigabe (`release_idle_holder`, `Drop` mit `kill` und `wait`, kein Zombie), bei `disconnect_all` (Master endet, Mux-Client endet), bei Fehlern im Start (Fehlerpfad nimmt die Freigabe zurück) und nach Absturz (stdin-Pipe schließt). Wahl der Mac-Nummer: IPv4 und IPv6 geprüft, `u16::MAX` ohne Überlauf, höchstens 16 Bind-Versuche. Host über `validate_ssh_host`, Port als `u16` formatiert: keine Argument-Injektion. Bindung explizit `127.0.0.1` (schlägt `GatewayPorts`). `ssh -O cancel` endet bei OpenSSH immer mit 0, `cancel_outcome` passt dazu.
- **master_alive/master_pid:** OpenSSH schreibt `Master running (pid=N)` bei `-O check` unabhängig vom LogLevel per `fprintf(stderr)`; `master_alive` urteilt für `tmux.rs` und `claude.rs` damit wie vorher.
- **portDetect, Chunk-Grenzen:** Zustand überlebt Chunks; UTF-8-Bytes ab 0x80 trennen Wörter, ein geteiltes Zeichen ist daher harmlos; SGR und OSC sind durchlässig, andere CSI trennen. Lokale und WSL-Panes kehren in `feedPaneOutput` sofort zurück (ein `kind`-Vergleich je Chunk); Speicher je Pane ohne Flut: 256 Byte Token.
- **WEB_URL_REGEX:** gleichwertig zum Standard von `@xterm/addon-web-links` 0.12.0 (`WebLinksAddon.ts:21`); Vergleich über alle Einzelzeichen U+0000 bis U+2FFF an drei Positionen: 0 Abweichungen, beide ohne Flags. Nicht-Loopback-URLs öffnen in lokalen und SSH-Panes wie vorher über `openUrl`; lokale Panes bekommen keine zusätzlichen Links. Ein Link mit Schema, der über eine umbrochene Zeile läuft, kann in der zweiten Zeile zusätzlich einen schemalosen Link bekommen; xterm wählt den Link des zuerst registrierten Providers (WebLinksAddon), das Ziel ist gleich.
- **portsStore, Races:** Generationszähler verwirft eine Liste, die vor einem Forward oder Stop begann; parallele Anfragen je Port teilen sich einen Aufruf; Stop und Retry derselben Zeile sperren sich gegenseitig (`PortRow.busy`); ein schließendes Pane entfernt nur seine Angebote. Kein Polling: `ssh_port_list` nur bei Öffnen der Liste und beim Ende eines SSH-Terminals mit bekannten Freigaben. Server-Quelle je Fläche wie in Slop #6 (Status, Liste, Angebot, Befehl, Vorschau-Menü aus `useWorkspaceEnvStore`; Erkennung, Klick und Terminal-Ende aus der Pane-Umgebung).
- **Komponenten:** keine Render-Schleife (Store-Selektor gibt den Zustand selbst zurück, Sichten in `useMemo`, `commit` setzt nur bei Änderung); `SshPortsStatus` abonniert erst in SSH-Workspaces; Zustände UI-3 bis UI-10 vorhanden (`data-status`), Knöpfe mit `aria-label`, Fehler mit `role="alert"`.
- **Teil B:** Loopback-Regel und Klick-Weg konsolidiert (Slop #1, #2); Fehler als `String` und Toasts wie im Bestand (`uploadStore`); `spawn_blocking` wie `ssh_prepare_upload_dir` (`ssh.rs:1607-1611`); Halte-Argumente wie `run_remote_capture` (`ssh.rs:1358-1368`); keine Abhängigkeit von `ports` nach `terminal`; AI-Modul erreicht `ssh_port_*` nicht (`portsBoundary.test.ts`). Unbenutzte Barrel-Exporte in `ports/index.ts` überlässt dieser Bericht `knip` (im Projekt eingerichtet).

---

## Changed Files

| File | Lines Changed | Findings |
|------|---------------|----------|
| TERAX.md | +4 -1 | 0 |
| src-tauri/src/lib.rs | +5 -2 | 0 |
| src-tauri/src/modules/mod.rs | +1 -0 | 0 |
| src-tauri/src/modules/ports.rs | +1079 -0 | 3 (RV-4, RV-5, RV-7) |
| src-tauri/src/modules/ssh.rs | +38 -8 | 0 (Beleg in RV-7) |
| src/app/App.tsx | +14 -0 | 0 |
| src/lib/loopback.test.ts | +57 -0 | 0 |
| src/lib/loopback.ts | +28 -0 | 0 |
| src/modules/ai/tools/portsBoundary.test.ts | +80 -0 | 0 |
| src/modules/ai/tools/terminal.ts | +2 -9 | 0 |
| src/modules/command-palette/commands.test.ts | +101 -0 | 0 |
| src/modules/command-palette/commands.ts | +21 -0 | 0 |
| src/modules/ports/PortsList.test.tsx | +333 -0 | 0 |
| src/modules/ports/PortsList.tsx | +328 -0 | 1 (RV-10) |
| src/modules/ports/PortsStatus.test.tsx | +279 -0 | 0 |
| src/modules/ports/PortsStatus.tsx | +143 -0 | 0 |
| src/modules/ports/activeServer.guard.test.tsx | +169 -0 | 0 |
| src/modules/ports/index.ts | +36 -0 | 0 |
| src/modules/ports/lib/portDetect.test.ts | +144 -0 | 0 |
| src/modules/ports/lib/portDetect.ts | +178 -0 | 3 (RV-1, RV-3, RV-6) |
| src/modules/ports/lib/ports.test.ts | +163 -0 | 0 |
| src/modules/ports/lib/ports.ts | +375 -0 | 1 (RV-1) |
| src/modules/ports/lib/portsList.ts | +25 -0 | 0 |
| src/modules/ports/lib/portsStore.test.ts | +405 -0 | 0 |
| src/modules/ports/lib/portsStore.ts | +281 -0 | 3 (RV-1, RV-2, RV-10) |
| src/modules/preview/PreviewAddressBar.tsx | +92 -24 | 1 (RV-8) |
| src/modules/preview/PreviewPane.tsx | +23 -23 | 1 (RV-9) |
| src/modules/statusbar/StatusBar.tsx | +2 -0 | 0 |
| src/modules/terminal/lib/rendererPool.ts | +53 -3 | 2 (RV-3, RV-8) |
| src/modules/terminal/lib/terminalLinks.test.ts | +104 -0 | 0 |
| src/modules/terminal/lib/terminalLinks.ts | +63 -0 | 1 (RV-3) |
| src/modules/terminal/lib/useTerminalSession.ts | +7 -1 | 2 (RV-6, RV-8) |
