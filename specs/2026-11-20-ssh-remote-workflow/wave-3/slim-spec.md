# Slim Spec: SSH Remote Workflow, Welle 3 (Browser-Ansicht)

**Discovery:** specs/2026-11-20-ssh-remote-workflow/discovery.md
**Architecture:** --
**Clickdummy:** --
**Slop-Dispositions:** specs/2026-11-20-ssh-remote-workflow/wave-3/slop-dispositions.md (drei Entscheidungen, Z1, Machbarkeitsprüfung und Stolpersteine bindend)

Scope dieses Laufs: nur Discovery-Slice 5 (Welle 3), nach Auftrag in Backend/Regeln und Oberfläche geschnitten; Discovery-Slice 4 (BR-24) ist durch die Machbarkeitsprüfung erledigt, hier bleibt nur die Doku. Beispiel-Server `devbox` (Label `devbox`), zweiter Server `other`; Beispiel-Freigabe `9222 -> localhost:9223`. Schnittstelle (festgelegt): `ssh_port_chrome(host, remotePort) -> bool`, `ssh_port_browser_target(host, remotePort) -> {status: "ready" | "origin_refused" | "no_page" | "unreachable", pageId: string | null, origin: string}`, `chrome_installed() -> bool`. Zeitgrenze jeder Abfrage an den Server-Chrome: 2 s. `[Prüfweg: QA]` = nur in der laufenden macOS-App beobachtbar.

---

## Test-Strategy

| Key | Value |
|-----|-------|
| **Stack** | `TypeScript + Rust (Tauri 2, React 19, pnpm)` |
| **Test Command** | `pnpm test` (vitest, jsdom); Rust: `docker run --rm --user $(id -u):$(id -g) -e HOME=/tmp -v "$PWD":/work -v terax-cargo:/cargo -v terax-target:/target -w /work/src-tauri terax-rust:local cargo test --locked --no-fail-fast` |
| **E2E Command** | `--` (echter Chrome nur auf dem Host: Chrome-for-Testing unter `~/.cache/ms-playwright`, Skripte der Machbarkeitsprüfung) |
| **Start Command** | `--` |
| **Health Endpoint** | `--` |
| **Mocking Strategy** | `mock_external` -- Frontend: Tauri-`invoke` und Opener gemockt (Vorgabe des Auftrags, Muster wave-2 `portsStore.test.ts`); Rust: keine Mocks, Server-Chrome als `TcpListener`-Test-Server im selben Prozess, Freigabe über einen Test-Eintrag im Freigabe-Register |

---

## Dependencies

```
Slice 1: Chrome-Erkennung, Seite, Herkunft, Adressen -> (none)
Slice 2: Ports-Liste, Dialoge, Doku -> Slice 1
```

---

## Slice 1: Server-Chrome erkennen, Ziel prüfen, Adressen bilden

**Goal:** Rust fragt über den abgesicherten Client nur den Mac-Port einer bestehenden aktiven Freigabe ab (Slop #1), erkennt Chrome, wählt die Seite und prüft die Herkunft per Handshake; Chrome-Prüfung für macOS; eine Adress-Funktionsgruppe (Slop #2); eng gefasster Opener-Scope.
**Depends on:** --

### Acceptance Criteria

- **AC-1:** GIVEN aktive Freigabe `devbox 9222 -> {p}`, Test-Server auf `{p}` antwortet auf `GET /json/version` mit 200 und `Browser` = `Chrome/156.0.7000.0` bzw. `HeadlessChrome/151.0.1.0` bzw. `node.js/v22.11.0` bzw. mit 404 bzw. mit `not json`
  WHEN `ssh_port_chrome(devbox, 9222)` aufgerufen wird
  THEN ist das Ergebnis `true`, `true`, `false`, `false`, `false`; der Test-Server sah je genau eine Anfrage `GET /json/version` mit Host `localhost:{p}`
  [Source: FL-15, TR-14, ST-9, BR-20]

- **AC-2:** GIVEN wie AC-1, der Test-Server nimmt die Verbindung an und antwortet nie bzw. schließt sofort ohne Antwort bzw. antwortet mit 302 auf `http://127.0.0.1:{q}/json/version`
  WHEN `ssh_port_chrome(devbox, 9222)` aufgerufen wird
  THEN ist das Ergebnis `false`, im ersten Fall nach höchstens 2,5 s; der Redirect wird nicht verfolgt (`{q}` sieht keine Anfrage)
  [Source: BR-20]

- **AC-3:** GIVEN keine Freigabe von 9222 für `devbox` bzw. Freigabe 9222 im Zustand `disconnected`, Test-Server auf dem Mac-Port
  WHEN `ssh_port_chrome` oder `ssh_port_browser_target` mit `(devbox, 9222)` bzw. `(devbox, 0)` aufgerufen wird
  THEN lautet der Fehler `no active forward of port 9222 on devbox` bzw. `invalid port: 0`; der Test-Server sah keine Verbindung
  [Source: BR-22]

- **AC-4:** GIVEN `GET /json/list` liefert in dieser Reihenfolge `{type:"service_worker", id:"W1"}`, `{type:"page", id:"D1", url:"devtools://devtools/x"}`, `{type:"page", id:"a/b"}`, `{type:"page", id:"A1B2", webSocketDebuggerUrl:"ws://evil.example:1/devtools/page/A1B2"}`, `{type:"page", id:"C3"}`; der Handshake antwortet 101
  WHEN `ssh_port_browser_target(devbox, 9222)` aufgerufen wird
  THEN ist das Ergebnis `{status:"ready", pageId:"A1B2", origin:"http://localhost:{p}"}`; `evil.example` wird nie kontaktiert
  AND enthält die Liste keine gültige Seite (nur `W1`, `D1`, `a/b`), ist es `{status:"no_page", pageId:null}` ohne Handshake
  [Source: FL-17, BR-22]

- **AC-5:** GIVEN wie AC-4; der Test-Server prüft den Handshake auf `GET /devtools/page/A1B2` mit `Upgrade: websocket`
  WHEN er mit 101 bzw. 403 antwortet bzw. 2 s schweigt
  THEN ist `status` `ready` bzw. `origin_refused` bzw. `unreachable` (nach höchstens 2,5 s); der Handshake trug genau den Header `Origin: http://localhost:{p}`
  AND antwortet `/json/list` nicht oder mit 500, ist `status` `unreachable` ohne Handshake
  [Source: FL-17, TR-15, EP-13]

- **AC-6:** GIVEN Mac-Port 9223 und Seiten-ID `A1B2` bzw. `a/b` bzw. leer
  WHEN die Adress-Funktionen aufgerufen werden
  THEN liefern sie `http://localhost:9223` (Basis), `http://localhost:9223` (Herkunft) und `http://localhost:9223/devtools/inspector.html?ws=localhost:9223/devtools/page/A1B2` (Live-Ansicht); für `a/b` und leer ist die Live-Ansicht `null`
  AND die Live-Ansicht enthält keinen Host außer `localhost:9223`
  [Source: BR-22]

- **AC-7:** GIVEN Home `/Users/u` bzw. ein Temp-Verzeichnis als Wurzel, das nur `Users/u/Applications/Google Chrome.app` bzw. nichts enthält
  WHEN die Kandidaten bzw. die Prüfung "Chrome installiert" berechnet werden
  THEN sind die Kandidaten genau `/Applications/Google Chrome.app` und `/Users/u/Applications/Google Chrome.app`; die Prüfung ist `true` bzw. `false`
  AND `chrome_installed` liefert außerhalb von macOS `false`
  [Source: EP-12]

- **AC-8:** GIVEN die macOS-App auf einem Mac mit bzw. ohne Google Chrome
  WHEN `chrome_installed` läuft
  THEN ist das Ergebnis `true` bzw. `false`
  [Source: EP-12] [Prüfweg: QA]

- **AC-9:** GIVEN `src-tauri/capabilities/default.json`
  WHEN die Opener-Rechte gelesen werden
  THEN gibt es genau einen Eintrag mit App-Angabe: `opener:allow-open-url` mit `url` `http://localhost:*` und `app` `Google Chrome`; `opener:default` bleibt unverändert
  [Source: BR-22]

- **AC-10:** GIVEN der Quellbaum
  WHEN der Guard läuft
  THEN nehmen `ssh_port_chrome` und `ssh_port_browser_target` in Rust genau die Parameter `host` und `remote_port` (keine URL, kein Pfad); kein Aufruf im Frontend übergibt andere Schlüssel als `host`, `remotePort`
  AND keine Datei unter `src/modules/ai` enthält `ssh_port_chrome`, `ssh_port_browser_target` oder `chrome_installed`
  [Source: --]

### Deliverables

- [ ] `src-tauri/src/modules/ports/chrome.rs` -- neu: Erkennung, Seitenwahl, Handshake, Kandidaten und Prüfung "Chrome installiert", drei Befehle; Abfragen über `guarded_client` (Profil wie `lm_ping`, Zeitgrenze 2 s)
- [ ] `src-tauri/src/modules/ports.rs` -- `mod chrome`; Mac-Port einer aktiven Freigabe nachschlagen; Test-Eintrag im Register
- [ ] `src-tauri/src/lib.rs` -- die drei Befehle registrieren
- [ ] `src-tauri/capabilities/default.json` -- Opener-Scope nur `http://localhost:*` für `Google Chrome` (Stolperstein 1)
- [ ] `src/modules/ports/lib/portDetect.ts` -- Adress-Gruppe beim bestehenden Owner `macUrl`: Basis, Herkunft, Live-Ansicht (Slop #2, consolidate)
- [ ] `src/modules/ports/chromeProbe.guard.test.ts` -- Guard Slop #1 (adopt_school) mit Kopfkommentar `GUARD:` / `DISPOSITION: specs/2026-11-20-ssh-remote-workflow/wave-3/slop-dispositions.md` / `RULE: --`

---

## Slice 2: Marke, Aktion, Dialoge und Doku anbinden

**Goal:** Chrome-Merkmal je Freigabe mit eigenem, verfallendem Zustand (Stolpersteine 4, 5); "View browser" mit Hinweis je Server im Einstellungs-Speicher (Slop #3); Anleitung als Dialog mit kopierbaren Befehlen (Z1); Fehlerpfade EP-12, EP-13; nur macOS (Stolperstein 9).
**Depends on:** Slice 1

### Acceptance Criteria

- **AC-1:** GIVEN macOS, `devbox` ohne Freigaben
  WHEN 9222 erfolgreich freigegeben, die Liste zweimal geöffnet, 9222 per Retry auf Mac-Port 9224 erneuert, dann gestoppt und neu freigegeben wird
  THEN folgt je genau ein `ssh_port_chrome(devbox, 9222)` nach dem Freigeben, nach dem Retry und nach dem neuen Freigeben; beim Öffnen der Liste keiner, außer für eine aktive Freigabe, deren Erkennung mit Fehler endete (dann einmal); für `disconnected`-Zeilen keiner
  AND die Zeilen sind sichtbar, bevor die Antwort da ist; auf Windows und Linux gibt es 0 Aufrufe
  [Source: FL-15, TR-14]

- **AC-2:** GIVEN `devbox` mit `3000 -> 3000` (kein Chrome), `9222 -> 9223` (Chrome), `9333` getrennt mit Chrome-Merkmal; danach liefert `ssh_port_list` dieselben Freigaben neu
  WHEN die Liste rendert
  THEN trägt nur Zeile 9222 die Marke `Chrome` und die Aktionen `Open`, `Open in browser`, `Copy`, `View browser`, `Stop`; Zeile 3000 wie in Welle 2; Zeile 9333 zeigt `Disconnected`, `Retry`, `Stop` und `View browser` als `disabled`
  AND nach dem Neu-Laden bleibt das Merkmal erhalten; Adressen und Labels kommen aus der Adress-Gruppe (`9222 -> localhost:9223`)
  [Source: ST-9, UI-11, BR-20]

- **AC-3:** GIVEN Zeile 9222 aus AC-2, keine Bestätigung für `ssh:devbox`
  WHEN `View browser` geklickt, dann `Cancel` gewählt und erneut `View browser` geklickt wird
  THEN erscheint `view-browser-notice` mit Titel `Remote browser access`, Text `Anyone who can reach this port can control the browser on devbox, including the accounts signed in there. Terax keeps it reachable from this Mac only.` und Knöpfen `Continue`, `Cancel`
  AND nach `Cancel` gab es kein `invoke`, kein `openUrl`, keinen Schreibvorgang im Einstellungs-Speicher; der zweite Klick zeigt den Dialog erneut
  [Source: FL-16, UI-12, BR-21, TG-12, TG-13]

- **AC-4:** GIVEN wie AC-3, `chrome_installed` = `true`, Ziel `{ready, "A1B2", "http://localhost:9223"}`
  WHEN `Continue` gewählt, danach `View browser` erneut geklickt und dann in `other` eine Chrome-Zeile geklickt wird
  THEN enthält die Einstellung `browserNoticeConfirmed` `ssh:devbox`; `openUrl` lief je Öffnen genau einmal mit `http://localhost:9223/devtools/inspector.html?ws=localhost:9223/devtools/page/A1B2` und `Google Chrome`
  AND der zweite Klick öffnet ohne Dialog; in `other` erscheint der Dialog
  [Source: FL-17, TR-15, BR-21, DF-8, TG-13]

- **AC-5:** GIVEN `Continue` für `ssh:devbox` wurde gewählt
  WHEN der Einstellungs-Speicher neu geladen wird (Neustart nachgestellt) und `View browser` in `devbox` geklickt wird
  THEN erscheint kein Dialog; der Speicher enthält keine Freigaben
  [Source: DF-8, BR-21]

- **AC-6:** GIVEN Bestätigung vorhanden, `chrome_installed` = `false`
  WHEN `View browser` geklickt wird
  THEN Toast `Google Chrome is required on this Mac to view the remote browser.`; kein `ssh_port_browser_target`, kein `openUrl`
  [Source: EP-12]

- **AC-7:** GIVEN Bestätigung vorhanden, Chrome installiert; Ziel `origin_refused` bzw. `unreachable` bzw. `ready` mit `origin` `http://127.0.0.1:9223` bzw. `openUrl` scheitert bzw. Ziel `no_page`
  WHEN `View browser` in Zeile 9222 geklickt wird
  THEN öffnet sich in den ersten vier Fällen die Anleitung für `devbox` 9222 -> 9223 (im dritten ohne `openUrl`); bei `no_page` Toast `No page is open in the remote browser.` ohne Anleitung
  [Source: EP-13, FL-18]

- **AC-8:** GIVEN die Anleitung für `devbox`, Server-Port 9222, Mac-Port 9223
  WHEN sie rendert und je Befehl `Copy` gewählt wird
  THEN Titel `Set up browser view`, Schritte und Befehle wörtlich: `google-chrome --headless=new --remote-debugging-port=9222 --user-data-dir="$HOME/.cache/terax-remote-chrome" --remote-allow-origins=http://localhost:9223`; `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222`; `ss -ltn 'sport = :9222'`; Schritt `In Terax, forward port 9222. If it is already forwarded, stop it and forward it again.`; Sicherheitshinweis `Keep the debugging port reachable on the server only. Never start Chrome with --remote-debugging-address=0.0.0.0 or open the port in a firewall.`
  AND `Copy` legt den Befehl in die Zwischenablage, Toast `Copied`; der Dialog enthält keinen Link und löst kein `invoke` aus
  [Source: FL-18, UI-13, BR-23]

- **AC-9:** GIVEN macOS, offene Liste von `devbox` mit Zeile 9222 aus AC-2 bzw. ohne Chrome-Zeile bzw. leer
  WHEN `Set up browser view` in der Fußzeile geklickt, dann Escape zweimal gedrückt wird
  THEN öffnet die Anleitung mit 9222 -> 9223 bzw. 9222 -> 9222; der Fokus liegt im Dialog; das erste Escape schließt nur den Dialog, das zweite die Liste
  AND auf Windows und Linux fehlen `Set up browser view`, die Marke und `View browser`
  [Source: UI-13, FL-18, TG-12]

- **AC-10:** GIVEN die macOS-App, `devbox` mit eingerichtetem Server-Chrome nach der Anleitung, Port freigegeben
  WHEN der User `View browser` klickt und bestätigt
  THEN öffnet Google Chrome die Live-Ansicht der Server-Seite; Klick und Tippen kommen an; eine Anmeldung auf einer Seite gelingt; kein Request an einen Google-Host
  [Source: FL-17, BR-22] [Prüfweg: QA]

### Deliverables

- [ ] `src/modules/ports/lib/ports.ts` -- Chrome-Merkmal je (Server, Server-Port, Mac-Port), Zeilensicht mit Marke und `view-browser`, Texte, Anleitungs-Schritte als reine Funktion; Kopien auf die Adress-Gruppe umgestellt (Slop #2)
- [ ] `src/modules/ports/lib/portsStore.ts` -- Erkennung nach Freigabe und Retry, Ablauf "View browser" (Hinweis, Chrome-Prüfung, Ziel, Öffnen, Rückfall)
- [ ] `src/modules/ports/PortsList.tsx` -- Marke, `View browser` über `openUrl(url, "Google Chrome")` (derselbe Opener wie "Open in browser"), Link `Set up browser view`, Fokus zum Dialog (Stolperstein 8)
- [ ] `src/modules/ports/BrowserDialogs.tsx` -- neu: `view-browser-notice` und Anleitung auf `AlertDialog`
- [ ] `src/modules/settings/store.ts` -- `browserNoticeConfirmed` je `workspaceScopeKey` über `writePref` (Slop #3)
- [ ] `src/modules/ports/browserNotice.guard.test.ts` -- Guard Slop #3 (adopt_school) mit Kopfkommentar `GUARD:` / `DISPOSITION: specs/2026-11-20-ssh-remote-workflow/wave-3/slop-dispositions.md` / `RULE: --`
- [ ] `TERAX.md` -- `ports::*` um die drei Befehle; `ports/` um Marke, Aktion, Dialoge; Ergebnis der Machbarkeitsprüfung und Voraussetzung auf dem Server (Stolperstein 10, BR-24)

---

## Traceability

| IDs | Abgedeckt in Slice |
|-----|--------------------|
| FL-15, FL-16, FL-17, FL-18 | S1 AC-1, AC-4, AC-5; S2 AC-1, AC-3, AC-4, AC-7 bis AC-10 |
| EP-12, EP-13 | S1 AC-5, AC-7, AC-8; S2 AC-6, AC-7 |
| UI-11, UI-12, UI-13 | S2 AC-2, AC-3, AC-8, AC-9 |
| ST-9 | S1 AC-1; S2 AC-2 |
| TR-14, TR-15 | S1 AC-1, AC-5; S2 AC-1, AC-4 |
| BR-20, BR-21, BR-22, BR-23 | S1 AC-1 bis AC-4, AC-6, AC-9; S2 AC-2 bis AC-5, AC-8, AC-10 |
| BR-24 | S2 Deliverable `TERAX.md` (Prüfung selbst: slop-dispositions.md, Research Log) |
| DF-8 | S2 AC-4, AC-5 |
| TG-12, TG-13 | S2 AC-3, AC-4, AC-9 |
| Slop #1, #2, #3, Z1 | S1 AC-3, AC-10 (#1); S1 AC-6, S2 AC-2 (#2); S2 AC-4, AC-5 und Guard (#3); S2 AC-8 (Z1) |
| FL-1 bis FL-5, EP-1 bis EP-6, UI-1, UI-2, ST-1, ST-2, TR-1 bis TR-3, BR-1 bis BR-9, DF-1 bis DF-4, TG-1 bis TG-3 | erledigt (Welle 1) |
| FL-6 bis FL-14, EP-7 bis EP-11, UI-3 bis UI-10, ST-3 bis ST-8, TR-4 bis TR-13, TR-16, BR-10 bis BR-19, DF-5 bis DF-7, TG-4 bis TG-11 | erledigt (Welle 2) |
