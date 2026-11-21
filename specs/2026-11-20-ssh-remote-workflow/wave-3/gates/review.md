# Post-Implement Review Report

**Feature:** SSH Remote Workflow, Welle 3 (Browser-Ansicht)
**Branch:** ssh-remote-browser (HEAD afa59c1)
**Default-Branch:** ssh-remote-ports (Welle 2 als Basis, Merge-Base d5960ad)
**Datum:** 2026-11-21
**Perspektive:** quality+alignment (Teil A + Teil B)
**Prüfmenge:** `git diff ssh-remote-ports...ssh-remote-browser -- src src-tauri TERAX.md`, 27 Dateien (Liste unter "Changed Files"), jede vollständig gelesen; dazu als Kontext slim-spec.md, slop-dispositions.md (inkl. "Ergebnis der Machbarkeitsprüfung"), discovery.md (Welle-3-IDs), die Rohdaten der Machbarkeitsprüfung (`w3-probe/logs`) und der Quelltext der Abhängigkeiten tauri-plugin-opener 2.7.2 und glob 0.3.4 (Versionen aus `src-tauri/Cargo.lock`).

---

## Summary

**Verdict:** FAILED

### Part A: Code Quality

| Kriterium | Findings |
|-----------|----------|
| A.1 Logic Errors | 1 |
| A.2 Error Handling | 0 |
| A.3 Security | 2 |
| A.4 Anti-Patterns | 1 |
| **Subtotal** | **4** |

### Part B: Codebase Alignment

| Kriterium | Findings |
|-----------|----------|
| B.1 Duplicate Solution Paths | 0 |
| B.2 Abstraction Reuse | 0 |
| B.3 Schema Consistency | 0 |
| B.4 Dead Code / Unused Imports | 0 |
| B.5 Error Handling Divergence | 1 |
| B.6 Configuration Drift | 0 |
| B.7 Interface Inconsistency | 0 |
| B.8 Dependency Direction | 0 |
| B.9 Security Pattern Consistency | 0 |
| B.10 Performance Pattern Consistency | 0 |
| **Subtotal** | **1** |

| **Total** | **5** |

Klassen: 1 x decision (RV-1), 3 x fix (RV-2, RV-3, RV-4), 1 x note (RV-5). Alle Befunde: `decision = pending_review`.

---

## Findings

### RV-1: Opener-Scope `http://localhost:*` ist weiter als dokumentiert (Klasse: decision)

**Kategorie:** A.3

**Problem:**
Der neue Eintrag `{ "url": "http://localhost:*", "app": "Google Chrome" }` erlaubt nicht nur localhost-Adressen. tauri-plugin-opener 2.7.2 prüft die unveränderte URL-Zeichenkette per Glob: `commands.rs` `open_url` reicht `url: String` ungeparst an `Scope::is_url_allowed`, `scope.rs` `Entry::matches_url` ruft `url.matches(u) && app.matches(a)`. glob 0.3.4 `Pattern::matches` (lib.rs:770-772) nutzt `MatchOptions::new()` mit `require_literal_separator: false` (lib.rs:1102-1107), `*` deckt also `/`, `@`, `?` ab. Damit passt `http://localhost:1@evil.example/` (Userinfo `localhost:1`, Host `evil.example`) ebenso wie jede `http://localhost:{port}/{pfad}`. Webview-Code beider Fenster, für die die Capability gilt (`main`, `settings`, default.json:5-8), kann `invoke("plugin:opener|open_url", { url, with: "Google Chrome" })` für jedes `http://`-Ziel in Google Chrome aufrufen.

Restrisiko konkret: Neu ist keine URL-Klasse. `opener:default` erlaubt schon `http://*` und `https://*` im Standardbrowser (`permissions/allow-default-urls.toml` des Plugins). Neu ist nur, dass Webview-Code Google Chrome als Ziel-App erzwingen kann; ist Chrome der Standardbrowser, ändert sich praktisch nichts. "Open in browser" bleibt unverändert: PortsList.tsx:156 ruft `openUrl(row.url)` ohne App, und `Application::Default` verlangt `with = None`, der neue Eintrag (`Application::App`) greift dort nicht. Das Risiko ist also gering, aber TERAX.md:45 ("The opener capability lets only `http://localhost:*` open in the app `Google Chrome`") und der Testname `chrome_may_open_only_localhost_urls_and_nothing_else_names_an_app` (chrome.rs:660) behaupten eine Enge, die das Muster nicht hat; der Test vergleicht nur das JSON-Literal (P3: der Name belegt die Aussage nicht).

**Neuer Code:** `src-tauri/capabilities/default.json:24-27`; Doku `TERAX.md:45`; Test `src-tauri/src/modules/ports/chrome.rs:660-691`
**Bestehendes Pattern:** `src-tauri/capabilities/default.json:23` (`opener:default`, http/https im Standardbrowser)

**Erwartete Beobachtung:** `glob::Pattern::new("http://localhost:*").unwrap().matches("http://localhost:1@evil.example/")` ist `true`. In der laufenden macOS-App (QA) öffnet `invoke("plugin:opener|open_url", { url: "http://localhost:1@evil.example/", with: "Google Chrome" })` aus der Webview-Konsole `evil.example` in Chrome.

**Empfehlung:**
PM entscheidet zwischen:
- (a) Annehmen; TERAX.md:45 und den Testnamen korrigieren ("Glob `http://localhost:*`; über Userinfo passt auch ein anderer Host; nicht weiter als `opener:default`, nur die App ist neu").
- (b) Enger fassen: fünf Einträge statt einem, je Stellenzahl des Mac-Ports, die Host, Pfad und ws-Ziel festlegen, z. B. für vierstellige Ports `http://localhost:[0-9][0-9][0-9][0-9]/devtools/inspector.html[?]ws=localhost:[0-9][0-9][0-9][0-9]/devtools/page/*` (analog 1, 2, 3, 5 Stellen; `[?]` ist im Glob das wörtliche `?`). Nach den Ziffern muss `/` folgen, `@host` passt nicht mehr; `macViewerUrl` setzt in beide Stellen denselben Port, die Stellenzahl ist also gleich. Dazu ein Rust-Test, der die Einträge mit `glob::Pattern` gegen die echte Viewer-URL (passt) und gegen `http://localhost:1@evil.example/devtools/inspector.html?ws=localhost:1/devtools/page/A` und `http://localhost:9223/` (passen nicht) prüft.
- (c) Am sichersten: keine Webview-Capability. Ein Rust-Befehl (z. B. `ssh_port_view_browser(host, remote_port)`) löst die aktive Freigabe auf, prüft das Ziel und öffnet mit dem Opener-Plugin aus Rust (`app.opener().open_url(url, Some("Google Chrome"))`, unterliegt nicht der Webview-ACL), die URL aus dem Mac-Port und der geprüften ID gebaut. Erledigt zugleich RV-2. Weicht von Stolperstein 1 (Öffnen im Frontend über `openUrl`) ab, deshalb Entscheidung.

---

### RV-2: "View browser" handelt nach der Prüfung auf eine veraltete Freigabe (Klasse: fix)

**Kategorie:** A.1

**Problem:**
`openViewer` übernimmt `forward` vor `await invoke("chrome_installed")` und `await invoke("ssh_port_browser_target")` (Lookup inkl. `ssh -O check`, dann bis zu 2 x 2 s Netz) und prüft danach weder `activeChrome(scope, forward.remotePort)` noch den aktuellen Mac-Port. Stop bleibt während der Prüfung bedienbar (PortsList.tsx:215 sperrt nur bei `busy` oder `unavailable`, `opening` sperrt nicht). Folgen:
1. Stop während der Prüfung, Antwort `ready`: `openUrl(viewer, "Google Chrome")` läuft trotzdem und zeigt auf einen Mac-Port, der nicht mehr freigegeben ist (Verbindungsfehler oder ein Dienst, der den Port inzwischen belegt).
2. Stop während der Prüfung, Antwort `unreachable` (der übliche Ausgang, wenn der Listener weg ist): die Anleitung "Set up browser view" erscheint für eine eben gestoppte Freigabe; war die Liste zu, öffnet `showGuide` sie wieder (portsStore.ts:422).
3. Stop und neue Freigabe auf einem anderen Mac-Port während der Prüfung: die Anleitung wird mit dem alten Port gefüllt (portsStore.ts:499-502), `--remote-allow-origins=http://localhost:{alt}` würde nicht funktionieren.
Die Erkennung verwirft veraltete Antworten (`run` in `chromeProbeEnded`, ports.ts:434-445), der View-Ablauf prüft nach dem Hinweis erneut (portsStore.ts:457), nach der Ziel-Antwort aber nicht.

**Neuer Code:** `src/modules/ports/lib/portsStore.ts:467-503` (fehlende Nachprüfung nach Zeile 486)
**Bestehendes Pattern:** `src/modules/ports/lib/portsStore.ts:457` (Nachprüfung nach dem Hinweis), `src/modules/ports/lib/ports.ts:434-445` (veraltete Antwort verworfen)

**Erwartete Beobachtung:** Laufzeitbeleg mit dem Testgerüst aus BrowserView.test.tsx (Probe-Datei außerhalb des Repos: `/tmp/claude-1002/-home-claude-litha-produkte-terax/b11976f9-b056-4fd8-a6f2-c24d109a92e8/scratchpad/rv/race.test.tsx`): Bestätigung vorhanden, `seedDevbox()`, `ssh_port_browser_target` verzögert; "View browser" auf 9222, dann "Stop" auf 9222 (Zeilen danach `["3000","9333"]`), dann `READY` aufgelöst -> `openUrl` wurde mit `["http://localhost:9223/devtools/inspector.html?ws=localhost:9223/devtools/page/A1B2","Google Chrome"]` aufgerufen. Mit `unreachable` statt `READY` -> `browser-setup-guide` sichtbar, Text enthält `--remote-allow-origins=http://localhost:9223`.

**Empfehlung:**
In `openViewer` nach dem `try`-Block (und vor `showGuide` im Fehlerfall von `openUrl`) `const current = activeChrome(scope, forward.remotePort)` lesen; ist es `null` oder `current.localPort !== forward.localPort`, still beenden (kein `openUrl`, keine Anleitung). Den Probe-Test oben als Regressionstest in BrowserView.test.tsx aufnehmen (beide Antworten, dazu der Fall "neuer Mac-Port"). Mit Option (c) aus RV-1 entfällt das Fenster, weil Rust den Mac-Port einmal für Prüfung und Öffnen auflöst.

---

### RV-3: Die Umgehungsfestigkeit des Sicherheitshinweises ist nur im Happy Path durch Tests festgehalten (Klasse: fix)

**Kategorie:** A.3

**Problem:**
Das Verhalten ist heute korrekt (Laufzeitprobe, Datei wie in RV-2: zweiter Klick auf "View browser" bei offenem Hinweis -> weiterhin genau ein `view-browser-notice`; Liste geschlossen bei offenem Hinweis -> Dialog `null`, 0 Schreibvorgänge; Liste wieder geöffnet -> kein Hinweis). Kein Test hält aber die Pfade fest, die BR-21 und DF-8 außerhalb von Cancel und Escape sichern:
- Liste geschlossen oder Workspace gewechselt bei offenem Hinweis zählt als Cancel (PortsStatus.tsx:57-61, portsStore.ts:409-415);
- der Schutz `viewing`, der einen zweiten Klick und einen zweiten Ablauf ignoriert (portsStore.ts:383-384, 447, 450);
- `showGuide` öffnet die Liste wieder bzw. verwirft die Anleitung nach einem Workspace-Wechsel (portsStore.ts:417-423).
BrowserView.test.tsx bricht nur über den Knopf Cancel und Escape ab (Zeilen 393-422, 618-629), browserNotice.guard.test.ts ruft `answerBrowserNotice` direkt auf (Zeilen 117, 124, 146); kein neuer Test ruft `setPortsListOpen(false)` bei offenem Hinweis, wechselt den Workspace bei offenem Hinweis oder klickt zweimal.

**Neuer Code:** `src/modules/ports/lib/portsStore.ts:383-423, 447-450`; `src/modules/ports/PortsStatus.tsx:57-61`
**Bestehendes Pattern:** TERAX.md:25 ("needs a test that locks the invariant")

**Erwartete Beobachtung:** Entfernt man den Aufruf `closeBrowserDialog(scope)` in PortsStatus.tsx:60 oder die Bedingung `|| viewing` in portsStore.ts:447, bleibt die bestehende Suite grün (erwartet nach Durchsicht der Tests, nicht ausgeführt).

**Empfehlung:**
In BrowserView.test.tsx drei Fälle ergänzen: (1) Hinweis offen, `setPortsListOpen(false)` -> kein Hinweis, kein Schreiben, kein `invoke` außer `ssh_port_list`; Liste neu öffnen -> kein Hinweis; erneuter Klick -> Hinweis wieder da. (2) Dasselbe mit Workspace-Wechsel auf `other`. (3) Hinweis offen, zweiter Klick auf "View browser" -> ein Hinweis; nach Continue genau ein `ssh_port_browser_target` und ein `openUrl`. Dazu `showGuide` bei geschlossener Liste (Liste öffnet sich mit Anleitung) und nach Workspace-Wechsel (keine Anleitung).

---

### RV-4: Kommentar an `viewerPlan` widerspricht dem Code (Klasse: fix)

**Kategorie:** A.4 (CC-F10)

**Problem:**
Der Kommentar endet mit "Everything else falls back to the guide." (ports.ts:614). Zeile 619 liefert für `no_page` aber `{ kind: "noPage" }`, das zu einem Toast ohne Anleitung führt (portsStore.ts:488-491, TERAX.md:88).

**Neuer Code:** `src/modules/ports/lib/ports.ts:612-614`

**Erwartete Beobachtung:** `viewerPlan({ status: "no_page", pageId: null, origin: "http://localhost:9223" }, 9223)` ergibt `{ kind: "noPage" }`, nicht `{ kind: "guide" }` (so auch browserView.test.ts:199-201).

**Empfehlung:**
Satz anpassen, z. B. "A browser without a page gives noPage; everything else falls back to the guide.", oder streichen.

---

### RV-5: Grund eines gescheiterten `openUrl` geht verloren (Klasse: note)

**Kategorie:** B.5

**Problem:**
`openUrl(plan.url, CHROME_APP).then(() => true, () => false)` verwirft den Fehlergrund und zeigt die Server-Anleitung (portsStore.ts:493-497). Das bestehende Öffnen in derselben Liste nennt den Grund (`toast.error(\`Could not open ${row.url}: ${String(err)}\`)`, PortsList.tsx:156-158). Scheitert das Öffnen lokal (z. B. LaunchServices findet "Google Chrome" nicht, obwohl `chrome_installed` nur zwei Ordner prüft, oder die ACL lehnt ab), bekommt der User Server-Schritte ohne Hinweis auf die Ursache. AC-7 verlangt die Anleitung; abweichend ist nur, dass der Grund weder angezeigt noch protokolliert wird.

**Neuer Code:** `src/modules/ports/lib/portsStore.ts:493-497`
**Bestehendes Pattern:** `src/modules/ports/PortsList.tsx:156-158`

**Erwartete Beobachtung:** `openUrl` lehnt mit `"Google Chrome not found"` ab (Fall "a failed open" in BrowserView.test.tsx:494-500) -> Anleitung sichtbar, weder `toast.error` noch ein Log enthält den Text.

**Empfehlung:**
Anleitung beibehalten, den Grund aber protokollieren oder zusätzlich als Toast nennen, im Stil von PortsList.tsx:156-158.

---

## Changed Files

| File | Lines Changed | Findings |
|------|---------------|----------|
| TERAX.md | +4 -1 | 0 (Nebenbeleg RV-1) |
| src-tauri/capabilities/default.json | +4 -0 | 1 (RV-1) |
| src-tauri/src/lib.rs | +3 -0 | 0 |
| src-tauri/src/modules/net.rs | +3 -2 | 0 |
| src-tauri/src/modules/ports.rs | +49 -0 | 0 |
| src-tauri/src/modules/ports/chrome.rs | +746 -0 | 0 (Nebenbeleg RV-1) |
| src/modules/ports/BrowserDialogs.tsx | +171 -0 | 0 |
| src/modules/ports/BrowserView.test.tsx | +630 -0 | 0 (Lücken siehe RV-2, RV-3) |
| src/modules/ports/PortsList.test.tsx | +1 -1 | 0 |
| src/modules/ports/PortsList.tsx | +91 -29 | 0 |
| src/modules/ports/PortsStatus.test.tsx | +1 -1 | 0 |
| src/modules/ports/PortsStatus.tsx | +14 -3 | 0 (Nebenbeleg RV-3) |
| src/modules/ports/activeServer.guard.test.tsx | +1 -1 | 0 |
| src/modules/ports/browserNotice.guard.test.ts | +192 -0 | 0 |
| src/modules/ports/chromeProbe.guard.test.ts | +114 -0 | 0 |
| src/modules/ports/lib/browserView.test.ts | +320 -0 | 0 |
| src/modules/ports/lib/portDetect.test.ts | +44 -1 | 0 |
| src/modules/ports/lib/portDetect.ts | +24 -3 | 0 |
| src/modules/ports/lib/ports.ts | +299 -21 | 1 (RV-4) |
| src/modules/ports/lib/portsList.ts | +7 -1 | 0 |
| src/modules/ports/lib/portsStore.test.ts | +1 -1 | 0 |
| src/modules/ports/lib/portsStore.ts | +204 -2 | 3 (RV-2, RV-3, RV-5) |
| src/modules/preview/PreviewAddressBar.test.tsx | +1 -1 | 0 |
| src/modules/settings/store.ts | +20 -0 | 0 |
| src/modules/terminal/lib/paneOutput.test.ts | +1 -1 | 0 |
| src/modules/terminal/lib/terminalLinks.test.ts | +1 -1 | 0 |
| src/modules/terminal/lib/uploadStore.test.ts | +1 -1 | 0 |

Zeilenzahlen aus `git diff --numstat`.

---

## Geprüft ohne Befund (zu den Prüfpunkten des Auftrags)

1. **chrome.rs / net.rs:** Beide Prüf-Befehle nehmen nur `host` und `remote_port` (chrome.rs:39-56), validieren beide (`validate_request`, chrome.rs:87) und fragen nur `mac_origin(port)` mit dem Mac-Port aus `active_local_port` (ports.rs:608-633: Host-Lock nur zum Lesen, `ssh -O check` außerhalb des Locks, ohne Eintrag kein `ssh`-Aufruf). Netzaufrufe laufen nach dem Lookup und ohne Lock. Antwort: nur Status 200 zählt, Body auf 1 MiB begrenzt (`read_capped`), `serde_json` mit Standard-Rekursionsgrenze, nur `id` (alphanumerisch, höchstens 128) verlässt Rust, `webSocketDebuggerUrl` wird nie gelesen, Redirects aus (Ping-Profil `Policy::none`, clients.rs:121-123; Test mit 302). Zeitgrenze 2 s je Abfrage über `within` inkl. DNS und Body. Handshake: `Connection: Upgrade`, `Upgrade: websocket`, `Sec-WebSocket-Version: 13`, Key, `Origin`; 101 -> ready, 403 -> origin_refused, sonst und bei Schweigen -> unreachable (Tests mit echtem TCP-Server). `localhost` wird über den Systemresolver aufgelöst und auf alle Loopback-Ergebnisse gepinnt; die Freigabe bindet 127.0.0.1 und [::1], beide Wege treffen. Host-Header `localhost:{p}` erfüllt Chromes Host-Prüfung (`origin-matrix-noflag.log`).
2. **Capability:** siehe RV-1; "Open in browser" unverändert.
3. **portsStore.ts / ports.ts:** Der einzige `openUrl`-Aufruf mit App ist portsStore.ts:493 mit `viewerPlan(...).url`; `viewerPlan` öffnet nur bei `ready`, Herkunft exakt `macOrigin(localPort)` und gültiger ID (browserView.test.ts:204-236 prüft Kombinationen mit `@`, `#`, `?`, `/`). Zwei gleichzeitige Abläufe verhindert `viewing`. Erkennung: höchstens einmal je Freigabe, veraltete Antworten über `run` verworfen, kein Timer, kein Polling. Außerhalb von macOS gibt es keine Abfrage (`browserViewAvailable()` an allen vier Einstiegen). Offen: die Antwort nach Stop oder Portwechsel (RV-2).
4. **Hinweis (DF-8, BR-21):** erscheint vor dem ersten Öffnen je `ssh:{host}`; Cancel, Escape, Schließen der Liste und Workspace-Wechsel schreiben nichts; keine Befehlspalette und kein Agent erreicht `viewBrowser`; Speicherung über `writePref`, je Server, übersteht den Neustart (Guard-Test). Testlücken: RV-3.
5. **Dialoge:** beide `AlertDialog` hängen im React-Baum der Liste; erstes Escape schließt nur den Dialog (getestet); Anfangsfokus bei Radix auf Cancel bzw. Close. Anleitung: immer `--remote-allow-origins={macOrigin}`, nur lokal lauschen (Prüfschritt und Warnung), MCP mit `--browserUrl http://127.0.0.1:{server}`, Schritte 1 und 2 als Beispiel markiert, kein Link, kein `invoke`. Keine Aussage gefunden, die zu einer unsicheren Einrichtung verleitet.
6. **BR-20, BR-22, BR-23:** nur `Browser` mit `Chrome/` oder `HeadlessChrome/`; die Ansicht kommt vom Server-Chrome über die Freigabe; Terax sendet nur zwei GET und einen Handshake ohne CDP-Befehl. Dass jede Freigabe auf dem Mac einmal mit `GET /json/version` angefragt wird, ist als Stolperstein 6 vom PM angenommen.
7. **Tests und Welle-2-Code:** Rust-Tests laufen gegen einen echten TCP-Server und den echten Client (kein Mock), die reinen Regeln sind direkt getestet; Guard-Tests sind Quelltext-Prüfungen. Welle-2-Änderungen (`dropChrome` in `forwardSucceeded`/`forwardStopped`, `keepListedChrome`, Labels über `macAddress` mit gleicher Ausgabe, `portsListOpened` statt `refreshForwards`, breitere Liste nur auf macOS) ohne Nebenwirkung auf Nicht-Mac. Die 8 Test-Dateien ergänzen nur den nötigen Export `IS_MAC: false` und testen damit weiter den Nicht-Mac-Pfad; den Mac-Pfad der Welle-2-Abläufe (Freigabe, Retry, Liste öffnen) decken BrowserView.test.tsx und browserNotice.guard.test.ts ab. Konventionen: keine Spec-Kennungen in Produktiv-Kommentaren, keine Geviertstriche, keine Emojis im Diff.

## Nicht geprüft

- Volle Testläufe (vitest, cargo) nicht ausgeführt (laut Auftrag nicht nötig, kein cargo auf dem Host); ausgeführt wurden nur die Laufzeitproben zu RV-2 und RV-3 in der Probe-Datei außerhalb des Repos.
- macOS-Verhalten (`open -a "Google Chrome"`, echte `chrome_installed`-Prüfung, AC-8, AC-10): nur in der laufenden App prüfbar (QA).
- Ein altes macOS-`/etc/hosts` mit `fe80::1%lo0 localhost` würde `localhost` im abgesicherten Client als Link-Local und damit gesperrt einstufen (net/ip.rs:80-83) und die Erkennung immer `false` liefern lassen; gilt genauso für `lm_ping`, auf einem echten Mac nicht nachgeprüft, daher kein Befund.
- Wiederverwendung gepoolter Keep-alive-Verbindungen des Ping-Clients nach Stop und Neubelegung desselben Mac-Ports: ohne Beleg, ob der Server-Chrome Verbindungen offen hält; kein Befund.
- `specs/2026-11-20-ssh-remote-workflow/wave-3/evidence/*` und andere Gate-Berichte: außerhalb der Prüfmenge.
