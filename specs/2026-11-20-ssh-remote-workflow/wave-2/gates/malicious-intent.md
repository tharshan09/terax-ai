# Malicious Intent Scan (L2)

**Feature:** 2026-11-20-ssh-remote-workflow / wave-2 · **Branch:** ssh-remote-ports (Basis ssh-remote-workflow) · **Date:** 2026-11-20 · **Scan Mode:** L2_semantic

## Summary
**Verdict:** PASS
**Findings:** 2 (0 HIGH, 0 MEDIUM, 2 LOW advisory) · **Files Scanned:** 39

| Lens | Status | Findings |
|---|---|---|
| Code Execution (MI-01/02/07/08) | PASS | 1 (LOW) |
| Data Exfiltration (MI-03/04/06) | PASS | 1 (LOW) |
| Supply Chain (MI-05/09/10) | PASS | 0 |

Gescannt: `git diff ssh-remote-workflow...ssh-remote-ports` (39 Dateien, +4997/-71). Keine Änderungen an `package.json`, Lockfiles, `Cargo.toml`/`Cargo.lock`, `.github/`, Tauri-Capabilities oder CSP.

## Gezielte Prüffragen des Auftrags

1. **Argument-Injection in ssh über Host oder Port:** Nein. `host` läuft in allen drei Commands (`ssh_port_forward`, `ssh_port_stop`, `ssh_port_list`) und erneut in `Registry::forward/stop/list` sowie `master_pid_at` durch `ssh::validate_ssh_host` (leer, führendes `-`, Whitespace und Steuerzeichen werden abgelehnt). Host wird als eigenes argv-Element übergeben (`Command::args`, keine Shell). Ports werden über `u16::try_from` und `!= 0` geprüft. Die `-L`-Spezifikation ist `format!("127.0.0.1:{u16}:localhost:{u16}")` und enthält nur Zahlen. Das Remote-Kommando der Halte-Sitzung ist die Konstante `cat >/dev/null`. Ein Test deckt `-oProxyCommand=x` ab.
2. **Löst unvertrauenswürdige Terminal-Ausgabe ohne Klick etwas aus?** Nein. `feedPaneOutput` -> `PortDetector.feed` -> `offerPorts` -> `addOffer` legt nur einen Eintrag im Speicher-Store an (Ports < 1024 und schon weitergeleitete Ports ausgenommen, pro Pane dedupliziert). `ssh_port_forward` wird nur über `ensureForward` erreicht, und das nur aus `acceptOffer` (Button `onClick` in `PortsStatus.tsx:74`), `forwardPortInput` (Eingabefeld der Liste), `retryForward` (Button Retry) und `openLoopbackAddress` (Link-Klick in `rendererPool.activateLink`). Das einzige `useEffect` (`PortsStatus.tsx:48`) ruft nur `ssh_port_list` auf, wenn die Liste geöffnet wird. Es gibt kein Polling und keine automatische Navigation.
3. **Ist eine Weiterleitung außerhalb von 127.0.0.1 erreichbar?** Nein. Die Bind-Adresse ist die Konstante `BIND_ADDRESS = "127.0.0.1"`. Mit expliziter Bind-Adresse hat `GatewayPorts` auf dem Client keine Wirkung. Das Ziel ist immer `localhost:{port}` auf dem Server, also kein Pivot zu Dritt-Hosts. Ein E2E-Test prüft, dass die LAN-Adresse die Verbindung ablehnt.
4. **Kann der KI-Agent die Weiterleitung auslösen?** Nein. `open_preview` in `src/modules/ai/tools/terminal.ts` nutzt nur noch die gemeinsame `isLoopbackHost(..., "preview")` mit derselben Host-Menge wie vorher und ruft `ctx.openPreview` auf. Kein Code im AI-Modul importiert `modules/ports` oder `ssh_port_*`, und `portsBoundary.test.ts` sichert das statisch ab. Bleibt nur ein indirekter Weg: Der Agent schreibt eine Adresse ins Terminal. Daraus entsteht aber nur ein Angebot, das ein Mensch anklicken muss.

## Findings

### MIS-1: ssh-Prozessstart mit geprüften, nicht wörtlichen Argumenten
**Pattern:** MI-07 (Process Spawning) · **Lens:** Code Execution · **Severity:** LOW · **Confidence:** LOW · **OWASP:** ASI05, LLM05
**Location:** `src-tauri/src/modules/ports.rs:223` (`run_ssh`), `:258` (`Holder::spawn`), `src-tauri/src/modules/ssh.rs:1316` (`master_pid_at`)
**Matched content:** ```let mut cmd = Command::new("ssh"); cmd.args(args)```
**Analysis:** Das Frontend liefert `host` und `remote_port` über Tauri IPC. Die Taint-Kette ist `invoke(host, remotePort)` -> `validate_request` (Host-Allowlist-Negativprüfung, u16-Port) -> argv. Es gibt keine Shell und keine String-Verkettung des Hosts. Der Port gelangt nur als Ganzzahl in die `-L`-Spezifikation. `validate_ssh_host` blockt Option-Injection (`-o...`) und Whitespace. Werte wie `%`-Token oder `user@host` sind für ssh legitim und ohne Wirkung auf die Argumentgrenzen. Kein bösartiges Muster, nur ein Hinweis, weil Prozessstart mit variablen Argumenten.
**Recommendation:** Optional als Defense-in-Depth `--` vor dem Host einfügen (`... -L spec -- host`). Nötig ist das nicht, solange `validate_ssh_host` führende `-` ablehnt.

### MIS-2: Server-kontrollierter Inhalt im eingebetteten Vorschau-iframe nach Link-Klick
**Pattern:** MI-06 (Hidden/Indirect Data Flow) · **Lens:** Data Exfiltration · **Severity:** LOW · **Confidence:** LOW · **OWASP:** LLM02, ASI03
**Location:** `src/modules/terminal/lib/rendererPool.ts:282` (`activateLink`), `src/modules/ports/lib/portsStore.ts:235` (`openLoopbackAddress`)
**Matched content:** ```if (linkClickTarget(text, portsAvailable(env)) === "forward") void openLoopbackAddress(env, text);```
**Analysis:** Neu ist, dass ein Klick auf eine Loopback-Adresse in einem SSH-Pane die Seite nicht mehr im Systembrowser öffnet. Stattdessen wird der Server-Port weitergeleitet und `http(s)://localhost:{mac}{rest}` im eingebetteten iframe geladen (`allow-scripts` + `allow-same-origin`, ohne `allow-top-navigation`, schon vor diesem Diff so). Der Server bestimmt damit Inhalt, der in der App-Webview läuft. Pfad und Query kommen aus der Ausgabe, aber der Host ist fest `localhost` (`macUrlFor` setzt `/` davor), ein Host-Wechsel über `@` oder `\` ist also nicht möglich. Die Tauri-Capabilities erlauben keine Remote-Origins, also hat das iframe keinen IPC-Zugriff. Es ist eine andere Origin als die App (`tauri://localhost` bzw. `http://tauri.localhost`). Einschränkung nur im Dev-Build (`devUrl http://localhost:1420`): Cookies trennen nicht nach Port. Die App nutzt dort aber keine erkennbaren Cookies. Das Verhalten folgt der Spezifikation (FL-8) und ist an einen Nutzerklick gebunden.
**Recommendation:** Kein Fix nötig. Optional im Review bestätigen, dass `capabilities/*.json` auch künftig keine `remote.urls` für `localhost:*` bekommen.

## Weitere geprüfte und verworfene Punkte
- `String.fromCharCode(...this.token...)` in `portDetect.ts:171` wandelt Bytes in Text um, damit die Erkennung sie lesen kann. Das ist keine Obfuskation (MI-08).
- Der Detektor-Puffer ist begrenzt (`TOKEN_CAP` 256). Die Angebote sind pro Pane und Port dedupliziert. Ein Server kann viele Angebote erzeugen, das ist aber nur UI-Rauschen und keine Ausführung.
- `holder_args`: `BatchMode=yes` + `ControlMaster=no` vor den Control-Args, daher gibt es keinen Prompt und keinen neuen Master. Remote läuft nur `cat >/dev/null`.
- In den Spec- und Evidence-Dateien (`slim-spec.md`, `slop-dispositions.md`, `evidence/*.json`) und in `TERAX.md` (CLAUDE.md verweist darauf) wurden keine Agent-Direktiven und keine Prompt-Injection gefunden.
- Es gibt keine Credentials, keine externen Hosts und keine neuen Netzwerk-Sinks außer Loopback.

## Notes
- LOW-confidence findings are advisory; they do not trigger FAIL.
- L1 (GitHub Action, regex) complements this scan — both layers coexist.
