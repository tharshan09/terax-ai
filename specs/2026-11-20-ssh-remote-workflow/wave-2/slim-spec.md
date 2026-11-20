# Slim Spec: SSH Remote Workflow, Welle 2 (Ports)

**Discovery:** specs/2026-11-20-ssh-remote-workflow/discovery.md
**Architecture:** --
**Clickdummy:** --
**Slop-Dispositions:** specs/2026-11-20-ssh-remote-workflow/wave-2/slop-dispositions.md (sechs Entscheidungen, Z1, Z2 bindend)

Scope dieses Laufs: nur Discovery-Slices 2 und 3 (Welle 2), hier nach Dateibereich in vier Bau-Slices geschnitten (Teil "Oberfläche und Anbindung" wegen der Deliverable-Grenze in Statusleiste und Terminal/Vorschau geteilt). Beispiel-Server: `devbox` (Label `devbox`), zweiter Server `other`. "Haltefrist" = `ControlPersist` der geteilten Verbindung (heute 10 min). Schnittstelle zwischen Backend und Frontend (festgelegt): Befehle `ssh_port_forward(host, remotePort)`, `ssh_port_stop(host, remotePort)`, `ssh_port_list(host)`; Freigabe = `{remotePort, localPort, status: "active" | "disconnected"}`, Liste aufsteigend nach `remotePort`. `[Pruefweg: QA]` = nur in der laufenden macOS-App beobachtbar.

---

## Test-Strategy

| Key | Value |
|-----|-------|
| **Stack** | `TypeScript + Rust (Tauri 2, React 19, pnpm)` |
| **Test Command** | `pnpm test` (vitest, jsdom); Rust: `docker run --rm --user $(id -u):$(id -g) -e HOME=/tmp -v "$PWD":/work -v terax-cargo:/cargo -v terax-target:/target -w /work/src-tauri terax-rust:local cargo test --locked` |
| **E2E Command** | `--` (Weiterleitung gegen Wegwerf-sshd im Rust-Container, Vorbild e2e-w1-Skripte) |
| **Start Command** | `--` |
| **Health Endpoint** | `--` |
| **Mocking Strategy** | `mock_external` -- Frontend: Tauri-`invoke` wie in bestehenden vitest-Tests gemockt (Vorgabe des Auftrags, Muster `uploadStore.test.ts`); Rust: keine Mocks, echter `ssh` gegen Wegwerf-sshd |

---

## Dependencies

```
Slice 1: Backend Freigaben -> (none)
Slice 2: Frontend-Kern Ports -> Slice 1
Slice 3: Statusleiste, Ports-Liste, Befehl -> Slice 2
Slice 4: Terminal-Klick, Vorschau-Menue, Doku -> Slice 2, Slice 3
```

---

## Slice 1: Freigaben im Backend anlegen, beenden, auflisten

**Goal:** Server-Ports über die bestehende geteilte Verbindung nur lokal auf den Mac holen, mit freier Mac-Nummer; Zustand je Freigabe aus der bestehenden Lebend-Prüfung; Verbindung hält, solange Freigaben bestehen (Z2); Beenden über `disconnect_all` (Slop #3, #4).
**Depends on:** --

### Acceptance Criteria

- **AC-1:** GIVEN Mac-Ports, deren Belegung vorgegeben ist
  WHEN die Mac-Nummer für Server-Port 3000 gewählt wird
  THEN ist sie 3000, wenn 3000 auf `127.0.0.1` und `[::1]` frei ist; 3001, wenn 3000 nur auf `[::1]` oder nur auf `127.0.0.1` belegt ist
  AND scheitert das Anlegen auf einer als frei geprüften Nummer mit Bind-Fehler, ist das Ergebnis die nächste freie Nummer
  AND ist 65535 belegt und Server-Port 65535 verlangt, lautet der Fehler `no free port on this Mac from 65535`
  [Source: BR-14, DF-6]

- **AC-2:** GIVEN `remotePort` 0 oder Host `-oProxyCommand=x`
  WHEN `ssh_port_forward` aufgerufen wird
  THEN endet er mit Fehler (`invalid port: 0` bzw. dem Text der Host-Prüfung) und es wird kein `ssh`-Prozess gestartet
  [Source: DF-5, EP-7]

- **AC-3:** GIVEN Wegwerf-sshd mit HTTP-Server auf Server-Port 18080, lebende Verbindung zu `devbox`, `~/.ssh/config` mit `GatewayPorts yes`
  WHEN `ssh_port_forward(devbox, 18080)` aufgerufen wird
  THEN ist das Ergebnis `{remotePort:18080, localPort:18080, status:"active"}` und `GET http://127.0.0.1:18080/` liefert die Server-Seite
  AND über eine Nicht-Loopback-Adresse des Rechners ist Port 18080 nicht erreichbar (Verbindung abgelehnt)
  [Source: FL-10, TR-8, ST-6, BR-15, TG-8]

- **AC-4:** GIVEN wie AC-3, aber ein fremder Prozess lauscht auf Mac-Port 18080
  WHEN freigegeben wird
  THEN ist `localPort` 18081, die Seite kommt über 18081, der fremde Prozess bleibt unberührt
  [Source: BR-14, DF-6]

- **AC-5:** GIVEN Freigaben 18080 und 18090 zu `devbox`
  WHEN `ssh_port_list(devbox)` und danach `ssh_port_stop(devbox, 18080)` aufgerufen werden
  THEN listet die erste Abfrage beide in der Reihenfolge 18080, 18090; danach nur 18090, und Mac-Port 18080 lehnt Verbindungen ab
  AND `ssh_port_stop` für einen nicht freigegebenen Port endet ohne Fehler
  [Source: FL-11, TR-10, TR-13, TG-8]

- **AC-6:** GIVEN keine lebende Verbindung zu `devbox`
  WHEN `ssh_port_forward(devbox, 18080)` aufgerufen wird
  THEN lautet der Fehler `not connected to devbox` und `ssh_port_list(devbox)` bleibt leer
  [Source: EP-9, TR-9, EP-11]

- **AC-7:** GIVEN aktive Freigabe 18080, dann wird die Verbindung beendet und eine neue Verbindung zu `devbox` aufgebaut
  WHEN `ssh_port_list(devbox)` nach dem Ende und nach dem Neuaufbau abgefragt wird
  THEN ist der Status beide Male `disconnected` (keine Wiederherstellung von selbst)
  AND ein erneutes `ssh_port_forward(devbox, 18080)` auf der neuen Verbindung liefert `active`, die Seite kommt wieder
  [Source: EP-10, TR-11, TR-12, ST-7, BR-17, TG-11]

- **AC-8:** GIVEN eine Freigabe zu `devbox` und kein weiterer Client der Verbindung (Terminal geschlossen); Haltefrist im Test verkürzt
  WHEN die doppelte Haltefrist verstrichen ist
  THEN lebt die Verbindung und die Seite kommt weiter über den Mac-Port
  AND nach `ssh_port_stop` der letzten Freigabe endet die Verbindung binnen Haltefrist plus 5 s
  [Source: BR-16]

- **AC-9:** GIVEN eine Verbindung, die nur durch eine Freigabe entstand oder gehalten wird
  WHEN `disconnect_all` läuft (Ende von Terax)
  THEN ist die Verbindung beendet und der Mac-Port lehnt Verbindungen ab; ein neuer Prozess listet für `devbox` keine Freigabe
  [Source: FL-14, TR-16, BR-18]

- **AC-10:** GIVEN zwei Control-Verzeichnisse (installierte App und Variante `dev`), beide verbunden mit `devbox`
  WHEN beide Server-Port 18080 freigeben
  THEN erhält die erste Mac-Port 18080, die zweite 18081; Beenden in der einen lässt die andere bestehen
  [Source: BR-14]

### Deliverables

- [ ] `src-tauri/src/modules/ports.rs` -- neu: Mac-Nummer wählen (IPv4 und IPv6), Freigabe-Register je Host, die drei Befehle, Bindung nur `127.0.0.1` (Stolperstein 4), Fehler auf Windows (Stolperstein 7)
- [ ] `src-tauri/src/modules/ssh.rs` -- Lebend-Prüfung liefert die Identität der Verbindung (Slop #4); Freigabe-Hosts für `disconnect_all` registriert (Slop #3); Halten der Verbindung nach Z2, Mechanismus erst am echten SSH geprüft
- [ ] `src-tauri/src/modules/mod.rs` -- Modul `ports`
- [ ] `src-tauri/src/lib.rs` -- die drei Befehle registrieren

---

## Slice 2: Erkennung, Freigaben-Store und Regeln im Frontend

**Goal:** Eine gemeinsame Loopback-Regel (Slop #1); Erkennung in der Rohausgabe mit Dedup; Store je Server (`workspaceScopeKey`) mit Zustandsmaschine, Texten und Lebend-Prüfung nur auf Anlass (Slop #4).
**Depends on:** Slice 1

### Acceptance Criteria

- **AC-1:** GIVEN die Hosts `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, `app.localhost`, `192.168.1.5`, `localhost.example.com`
  WHEN die Loopback-Regel in der Variante Erkennung bzw. Vorschau angewendet wird
  THEN gelten für Erkennung genau die ersten vier; für Vorschau zusätzlich `app.localhost` und `::1`
  AND `open_preview` und die Vorschau nehmen dieselben URLs an wie vorher (bestehende Tests grün)
  [Source: BR-10]

- **AC-2:** GIVEN Pane 7 auf `{kind:"ssh", host:"devbox"}`
  WHEN es die Ausgabe `\x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/`, `127.0.0.1:8000`, `0.0.0.0:3000`, `[::1]:4000`, `https://localhost:8443/x` liefert
  THEN entstehen Angebote für 5173, 8000, 3000, 4000, 8443
  AND für `localhost:80`, `localhost:70000`, `app.localhost:3000`, `example.com:3000` entsteht keins
  [Source: FL-6, TR-4, ST-4, BR-10, BR-11, TG-4]

- **AC-3:** GIVEN Pane 7 und 8 (SSH `devbox`), Pane 9 (lokal); 3000 ist für `devbox` freigegeben
  WHEN Pane 7 `http://local` und dann `host:5173/` liefert, dieselbe Zeile 50-mal (Repaint), das Angebot verworfen wird und 5173 danach in Pane 7, 8 und 9 erscheint, 3000 in Pane 8
  THEN gab es vor dem Verwerfen genau ein Angebot 5173; danach genau eins aus Pane 8; keins aus Pane 9, keins für 3000
  AND schließt Pane 8, sind seine Angebote entfernt
  [Source: BR-12, ST-3, ST-8, TR-6]

- **AC-4:** GIVEN Angebote 3000 und danach 5173 für `devbox`, eins für `other`; aktiver Server `devbox`
  WHEN die Angebotsanzeige berechnet und dann verworfen wird
  THEN lautet sie `Forward port 5173?` mit `+1`; nach dem Verwerfen `Forward port 3000?` ohne Zusatz
  [Source: UI-3, BR-19]

- **AC-5:** GIVEN Angebot 5173, `ssh_port_forward` antwortet `{5173, 5173, active}` bzw. `{5173, 5174, active}`
  WHEN das Angebot angenommen wird
  THEN ist es bis zur Antwort `working`; danach entfällt es, `devbox` hat Zeile `5173 -> localhost:5173`, Zähler 1, Vorschau öffnet `http://localhost:5173`, kein Toast
  AND bei 5174 Toast `Port 5173 is available at localhost:5174`, Vorschau `http://localhost:5174`
  [Source: FL-7, TR-5, TR-8, ST-5, ST-6, BR-14, DF-7, TG-5]

- **AC-6:** GIVEN die Eingaben `abc`, `0`, `65536`, `30.5`, `-1`, ` 3000 `, leer; 4000 ist schon aktiv auf Mac-Port 4001
  WHEN jede sowie `4000` von Hand bzw. `http://localhost:4000/a?b=1` aus einem `devbox`-Pane verlangt wird
  THEN zeigen die ersten fünf `Enter a port between 1 and 65535.` ohne `invoke`; ` 3000 ` gibt 3000 frei ohne Vorschau; leer tut nichts
  AND für 4000 folgt kein `ssh_port_forward`, die Zeile ist 2000 ms `highlighted`, der Adress-Weg öffnet `http://localhost:4001/a?b=1`
  [Source: EP-7, EP-8, DF-5, FL-10, UI-6, UI-8]

- **AC-7:** GIVEN keine Freigaben
  WHEN aus einem `devbox`-Pane `localhost:3000/docs?x=1`, `0.0.0.0:80` oder `https://127.0.0.1:8443/` gewählt wird
  THEN wird der Port freigegeben und die Vorschau öffnet `http://localhost:3000/docs?x=1`, `http://localhost:80/`, `https://localhost:8443/`
  [Source: FL-8, TR-7, DF-7, BR-11]

- **AC-8:** GIVEN `ssh_port_forward` scheitert mit `not connected to devbox`
  WHEN Angebot 5173 angenommen bzw. eine getrennte Zeile 8080 per Retry erneuert wird
  THEN Toast `Could not forward port 5173: not connected to devbox`, keine Zeile, kein Angebot; bei Retry Toast für 8080, Zeile bleibt `disconnected`
  [Source: EP-9, EP-11, TR-9]

- **AC-9:** GIVEN `ssh_port_list` liefert 3000 `active`, 8080 `disconnected`
  WHEN der Store aktualisiert, dann 8080 erfolgreich erneuert und 3000 beendet wird
  THEN zeigt 3000 die Aktionen Open, Open in browser, Copy, Stop; 8080 nur Retry, Stop; `attention` wahr; Zähler 2
  AND danach 8080 `active`, `attention` falsch, nach Stop Zähler 1
  [Source: EP-10, TR-10, TR-11, TR-12, TR-13, ST-7, UI-4, UI-7, TG-11]

- **AC-10:** GIVEN Freigaben bei `devbox`, Ports-Liste zu, 60 s vergehen
  WHEN nichts geschieht, dann die Liste öffnet, ein `devbox`-Pane und ein lokales Pane enden
  THEN 0 Lebend-Abfragen in den 60 s, je 1 bei Öffnen und beim Ende des `devbox`-Panes, 0 beim lokalen
  [Source: TG-11]

- **AC-11:** GIVEN Freigaben bei `devbox` und `other`, aktiver Server `devbox`, Terax-Agent im selben Workspace
  WHEN das auslösende Pane schließt, der Store neu erzeugt wird bzw. der Agent `open_preview` mit `http://localhost:3000` ruft
  THEN zeigt die Sicht nur `devbox` und behält die Freigabe; ein neuer Store ist leer und schreibt nichts in den Settings-Store
  AND die Werkzeug-Namensliste ist unverändert, kein Werkzeug ruft `ssh_port_*`, `open_preview` öffnet ohne Freigabe
  [Source: BR-13, BR-16, BR-18, BR-19]

### Deliverables

- [ ] `src/lib/loopback.ts` -- neu: eine Loopback-Regel mit Varianten Erkennung und Vorschau (Slop #1, consolidate)
- [ ] `src/modules/ai/tools/terminal.ts` -- `open_preview` nutzt die Regel; kein Freigabe-Pfad (Stolperstein 9)
- [ ] `src/modules/ports/lib/portDetect.ts` -- neu: Erkennung über ANSI und Chunk-Grenzen, anklickbare Adressen einer Zeile, Mac-Adresse
- [ ] `src/modules/ports/lib/ports.ts` -- neu: Port-Eingabe, Zustandsmaschine, Angebots- und Zeilensicht, Texte
- [ ] `src/modules/ports/lib/portsStore.ts` -- neu: Store je `workspaceScopeKey`, Aufrufe, Toasts, Lebend-Abfrage auf Anlass

---

## Slice 3: Statusleiste, Ports-Liste und Befehl anbinden

**Goal:** Angebot und Ports-Element fest in der rechten Zone (Z1), Ports-Liste als Popover, Befehl "Forward Port"; Server aus dem globalen Workspace-Store, der bei Vorschau-Tabs erhalten bleibt (Slop #6).
**Depends on:** Slice 2

### Acceptance Criteria

- **AC-1:** GIVEN aktiver Workspace `devbox` mit 2 Freigaben, mit 0, lokal, und Plattform Windows mit `devbox`
  WHEN die Statusleiste rendert
  THEN steht in der rechten Zone `ports-status` mit `Ports` und `2`; bei 0 nur `Ports`; lokal und auf Windows weder `ports-status` noch `port-offer`
  AND die Statusleisten-Konfiguration bietet keinen Eintrag zum Ausblenden
  [Source: UI-4, BR-19]

- **AC-2:** GIVEN eine getrennte Freigabe bei `devbox`
  WHEN die Statusleiste rendert
  THEN trägt `ports-status` den Zustand `attention`
  [Source: UI-4, ST-7, TG-11]

- **AC-3:** GIVEN Angebote 3000 und 5173
  WHEN `port-offer` rendert, angeklickt, im Zustand `working` erneut angeklickt bzw. das Kreuz geklickt wird
  THEN zeigt er `Forward port 5173?` und `+1` links von `ports-status`; Klick nimmt 5173 an, der zweite Klick bewirkt nichts; Kreuz verwirft 5173
  [Source: UI-3, ST-4, ST-5, TG-5]

- **AC-4:** GIVEN `devbox` mit 3000 -> 3000 und 9222 -> 9223
  WHEN `ports-status` geklickt wird
  THEN öffnet `ports-list` mit Kopf `PORTS` `devbox`, Zeilen `3000 -> localhost:3000` und `9222 -> localhost:9223` (9223 hervorgehoben), Fußzeile `Port` und `Forward`
  AND ohne Freigaben steht `No forwarded ports. Enter a port below or click a localhost link in the terminal.`; Escape und Klick außerhalb schließen
  [Source: FL-9, UI-5, UI-6, TG-7]

- **AC-5:** GIVEN die Liste aus AC-4, 8080 getrennt
  WHEN in Zeile 9222 Copy, Open, Open in browser bzw. Stop gewählt wird
  THEN Copy legt `http://localhost:9223` in die Zwischenablage mit Toast `Copied`; Open öffnet die Vorschau, Open in browser den System-Browser mit dieser Adresse; Stop entfernt die Zeile; die Liste bleibt offen
  AND Zeile 8080 zeigt `Disconnected` und nur `Retry`, `Stop`
  [Source: FL-11, UI-7, TG-8]

- **AC-6:** GIVEN offene Liste, Eingabe `abc`, dann `5173`
  WHEN Enter bzw. `Forward` gedrückt wird
  THEN zeigt das Feld `Enter a port between 1 and 65535.`; bei 5173 ist es bis zur Antwort `working` (nicht bedienbar), danach erscheint die Zeile 5173
  [Source: UI-8, FL-10, TG-8]

- **AC-7:** GIVEN aktiver Workspace `devbox` bzw. lokal
  WHEN die Befehlspalette nach `port` gefiltert und `Forward Port` ausgeführt wird
  THEN steht `Forward Port` bei `devbox` neben `New web preview`, lokal fehlt er; Ausführen öffnet die Liste mit Fokus im Feld `Port`
  [Source: FL-12, UI-9, TG-9]

- **AC-8:** GIVEN aktiver Terminal-Tab in `devbox` mit einer Freigabe
  WHEN auf einen Vorschau-Tab gewechselt wird
  THEN bleibt `ports-status` mit `1` sichtbar und die Liste zeigt den Kopf `devbox`
  [Source: BR-19]

- **AC-9:** GIVEN die macOS-App mit SSH-Workspace und Dev-Server auf dem Server
  WHEN der Dev-Server seine Adresse ausgibt und der User das Angebot klickt
  THEN steht das Angebot rechts in der Statusleiste, danach `Ports 1`, und der Vorschau-Tab lädt die Server-Seite
  [Source: FL-6, FL-7] [Pruefweg: QA]

### Deliverables

- [ ] `src/modules/ports/PortsStatus.tsx` -- neu: `port-offer` und `ports-status`
- [ ] `src/modules/ports/PortsList.tsx` -- neu: `ports-list`, `ports-row`, `ports-row-actions`, `ports-input`
- [ ] `src/modules/statusbar/StatusBar.tsx` -- feste Elemente rechts, nicht über die Widget-Registry (Z1)
- [ ] `src/modules/command-palette/commands.ts` -- Befehl `Forward Port` neben `tab.newPreview` (Stolperstein 10)
- [ ] `src/app/App.tsx` -- Vorschau-Öffner und Liste-Öffner an den Store reichen
- [ ] `src/modules/ports/activeServer.guard.test.tsx` -- Guard Slop #6 (adopt_school) mit Kopfkommentar `GUARD:` / `DISPOSITION: specs/2026-11-20-ssh-remote-workflow/wave-2/slop-dispositions.md` / `RULE: --`

---

## Slice 4: Terminal-Ausgabe, Klick-Weg, Vorschau-Menü und Doku anbinden

**Goal:** Erkennung an `deliverPtyBytes` (auch Panes ohne Slot), ein verzweigender Klick-Weg (Slop #2), Ports-Menü der Vorschau in SSH-Workspaces, Doku-Rückbau (Slop #5).
**Depends on:** Slice 2, Slice 3

### Acceptance Criteria

- **AC-1:** GIVEN `devbox`-Pane 7 ohne Renderer-Slot
  WHEN seine PTY-Bytes `localhost:5173` enthalten bzw. das Pane mit Code 255 endet
  THEN entsteht Angebot 5173 bzw. genau eine Lebend-Abfrage für `devbox`
  [Source: FL-6, TG-4, TG-11]

- **AC-2:** GIVEN eine Zeile `see localhost:3000 and https://github.com/x`
  WHEN die Links für ein `devbox`-Pane bzw. ein lokales Pane ermittelt werden
  THEN ist `localhost:3000` nur im `devbox`-Pane anklickbar; `https://github.com/x` in beiden
  [Source: FL-8, TG-6]

- **AC-3:** GIVEN die Links aus AC-2 und `http://localhost:3000` im lokalen Pane
  WHEN sie angeklickt werden
  THEN führt `localhost:3000` im `devbox`-Pane zu Freigabe und Vorschau ohne System-Browser; alle übrigen Klicks öffnen genau einmal den System-Browser ohne Freigabe
  [Source: FL-8, TR-7, BR-13, TG-6]

- **AC-4:** GIVEN aktiver Workspace `devbox` mit 3000 -> 3000, 9222 -> 9223 aktiv, 8080 getrennt
  WHEN das Ports-Menü der Vorschau-Adressleiste öffnet und `9222 -> localhost:9223` gewählt wird
  THEN zeigt es genau diese zwei Einträge, keine festen Ports; die Vorschau lädt `http://localhost:9223` ohne Port-Probe
  AND ohne Freigaben steht `No forwarded ports.`; lokal die festen Ports wie heute
  [Source: FL-13, UI-10, TG-10, BR-19]

- **AC-5:** GIVEN die macOS-App, Claude Code im SSH-Terminal gibt `localhost:3000/docs` aus
  WHEN der User die Adresse anklickt und danach Terax beendet
  THEN lädt der Vorschau-Tab `/docs` der Server-Seite; nach dem Beenden lehnt der Mac-Port Verbindungen ab
  [Source: FL-8, FL-14] [Pruefweg: QA]

### Deliverables

- [ ] `src/modules/terminal/lib/useTerminalSession.ts` -- Bytes je Pane an die Erkennung (Stolperstein 1), Pane-Ende an die Lebend-Abfrage
- [ ] `src/modules/terminal/lib/rendererPool.ts` -- ein Klick-Weg je Slot, Verzweigung nach `leafWorkspace` (Slop #2, consolidate)
- [ ] `src/modules/preview/PreviewAddressBar.tsx` -- Ports-Menü nach UI-10; Kommentar `:66` ersetzt (Slop #5, dismantle); `normalizeUrl` über die Loopback-Regel (Slop #1)
- [ ] `src/modules/preview/PreviewPane.tsx` -- `isLocalUrl` über die Loopback-Regel (Slop #1)
- [ ] `TERAX.md` -- Zeile `preview/` durch echtes Verhalten ersetzt (Slop #5, dismantle); Ports-Abschnitt mit Absturz-Grenze (Slop #3); "Side-by-side test build" um Freigaben ergänzt (Stolperstein 6)

---

## Traceability

| IDs | Abgedeckt in Slice |
|-----|--------------------|
| FL-6, FL-7, FL-8, FL-9, FL-10, FL-11, FL-12, FL-13, FL-14 | S1 AC-3, AC-5, AC-9; S2 AC-2, AC-5 bis AC-7; S3 AC-4 bis AC-7; S4 AC-1 bis AC-4 |
| EP-7, EP-8, EP-9, EP-10, EP-11 | S1 AC-2, AC-6, AC-7; S2 AC-6, AC-8, AC-9 |
| UI-3, UI-4, UI-5, UI-6, UI-7, UI-8, UI-9, UI-10 | S2 AC-4, AC-6, AC-9; S3 AC-1 bis AC-7; S4 AC-4 |
| ST-3, ST-4, ST-5, ST-6, ST-7, ST-8 | S1 AC-3, AC-7; S2 AC-2, AC-3, AC-5, AC-9; S3 AC-2, AC-3 |
| TR-4 bis TR-13, TR-16 | S1 AC-3, AC-5 bis AC-7, AC-9; S2 AC-2, AC-3, AC-5, AC-7 bis AC-9; S4 AC-3 |
| BR-10 bis BR-19 | S1 AC-1, AC-3, AC-4, AC-7 bis AC-10; S2 AC-1 bis AC-5, AC-7, AC-11; S3 AC-1, AC-8; S4 AC-3, AC-4 |
| DF-5, DF-6, DF-7 | S1 AC-1, AC-2, AC-4; S2 AC-5 bis AC-7 |
| TG-4 bis TG-11 | S1 AC-3, AC-5, AC-7; S2 AC-2, AC-5, AC-9, AC-10; S3 AC-2 bis AC-7; S4 AC-1 bis AC-4 |
| Slop #1 bis #6, Z1, Z2 | S2 AC-1 (#1); S4 AC-3 (#2); S1 AC-9 (#3); S1 AC-7, S2 AC-10 (#4); S4 Deliverables (#5); S3 AC-8 und Guard (#6); S3 AC-1 (Z1); S1 AC-8 (Z2) |
| FL-1 bis FL-5, EP-1 bis EP-6, UI-1, UI-2, ST-1, ST-2, TR-1 bis TR-3, BR-1 bis BR-9, DF-1 bis DF-4, TG-1 bis TG-3 | erledigt (Welle 1) |
| FL-15 bis FL-18, EP-12, EP-13, UI-11 bis UI-13, ST-9, TR-14, TR-15, BR-20 bis BR-24, DF-8, TG-12, TG-13 | nach Merge |
