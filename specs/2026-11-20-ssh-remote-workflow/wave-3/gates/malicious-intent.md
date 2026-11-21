# Malicious Intent Scan (L2)

**Feature:** ssh-remote-workflow (Welle 3) · **Branch:** ssh-remote-browser (Basis ssh-remote-ports) · **Date:** 2026-11-21 · **Scan Mode:** L2_semantic

## Summary
**Verdict:** PASS
**Findings:** 3 (0 HIGH, 0 MEDIUM, 3 LOW advisory) · **Files Scanned:** 33

| Lens | Status | Findings |
|---|---|---|
| Code Execution (MI-01/02/07/08) | PASS | 0 |
| Data Exfiltration (MI-03/04/06) | PASS | 1 (LOW) |
| Supply Chain (MI-05/09/10) | PASS | 2 (LOW) |

Gescannt: `git diff ssh-remote-ports...ssh-remote-browser`, nur hinzugefügte Zeilen. Kein `eval`/`new Function`, keine Prozessstarts, keine kodierten Nutzlasten, keine Verschleierung, keine neuen Abhängigkeiten, keine Lock-, Workflow- oder Install-Hook-Änderungen, keine Zugangsdaten. Die Konstante `WEBSOCKET_KEY = "dGhlIHNhbXBsZSBub25jZQ=="` ist die Beispiel-Nonce aus RFC 6455 und wird nur als Handshake-Header gesendet.

## Geprüfte Angriffswege (Auftrag)

1. **Bösartige Serverantwort lenkt die geöffnete Adresse um (kein Befund).**
   - Die Rust-Seite fragt nur `http://localhost:{mac}` des aktiven Forwards (`registry().active_local_port`). Der Port kommt aus der Registry, nicht vom Aufrufer.
   - Der Ping-Client folgt keinen Redirects (`Policy::none()`, `net/clients.rs:121-123`). Ein Test deckt den Fall 302 ab.
   - `webSocketDebuggerUrl` und `url` aus `/json/list` werden nie verwendet. Nur `id` wird übernommen, und zwar nur bei `^[A-Za-z0-9]{1,128}$`, geprüft in Rust (`valid_page_id`) und noch einmal in TS (`macViewerUrl`).
   - `origin` baut Rust aus dem Port. `viewerPlan` öffnet nur bei `status === "ready"` und `origin === macOrigin(localPort)`.
   - Host, Pfad, `ws`-Parameter und App (`CHROME_APP` fest „Google Chrome“) sind fest verdrahtet. Der Server kann daher weder eine fremde Adresse noch eine andere App erzwingen.
   - Der Body ist auf 1 MiB begrenzt, jede Anfrage hat ein Timeout von 2 s.
2. **Allgemeiner Loopback-/SSRF-Zugang (kein Befund).**
   - Die Commands `ssh_port_chrome` und `ssh_port_browser_target` nehmen nur `host: String, remote_port: u32`. `validate_request` weist Hosts wie `-oProxyCommand=…` und Port 0 ab.
   - Ohne aktiven Forward gibt es keine Verbindung (getestet: `connections() == 0`).
   - Angefragt werden nur feste Pfade: `/json/version`, `/json/list` und `/devtools/page/{validierte id}`. Die Antwort kommt nicht roh zum Aufrufer zurück, nur als Bool oder Enum, plus validierte id und rekonstruierter Origin. Als Lese-Orakel taugen die Commands daher nicht.
3. **Capability breiter als nötig.** Siehe MIS-1 (LOW).
4. **Anleitungsbefehle (kein unsicherer Rat, ein Hinweis).**
   - `--remote-allow-origins` wird exakt auf `http://localhost:{mac}` gesetzt, nie `*`.
   - Chrome läuft `--headless=new` mit eigenem `--user-data-dir`. Es gibt kein `--remote-debugging-address`, also bindet Chrome nur an Loopback.
   - Die Anleitung warnt ausdrücklich vor `0.0.0.0` und Firewall-Freigabe. Ein `ss -ltn`-Befehl prüft die Bindung.
   - Einziger Punkt ist der ungepinnte MCP-Aufruf, siehe MIS-3 (LOW).
5. **KI-Agent (kein Befund).**
   - Im Diff ist kein Aufruf aus `src/modules/ai` zu sehen. Aufrufer der drei Commands sind nur `portsStore.ts` (Nutzeraktion „View browser“ bzw. Liste öffnen).
   - Der Guard-Test `chromeProbe.guard.test.ts` verbietet die Command-Namen im AI-Modul.
   - `viewBrowser` verlangt eine aktive Chrome-Zeile und die bestätigte Hinweis-Abfrage (pro Server, Cancel schreibt nichts).

## Findings

### MIS-1: Opener-Capability erlaubt jede localhost-URL in Google Chrome
**Pattern:** MI-09 (Permission broadening) · **Lens:** Supply Chain · **Severity:** LOW · **Confidence:** LOW · **OWASP:** ASI04, LLM03
**Location:** `src-tauri/capabilities/default.json:24-27`
**Matched content:** ```{ "identifier": "opener:allow-open-url", "allow": [{ "url": "http://localhost:*", "app": "Google Chrome" }] }```
**Analysis:**
- Statisch lässt sich die Freigabe nicht auf Forward-Ports begrenzen. Das Muster erlaubt jeden Port und jeden Pfad auf `http://localhost` in Chrome, nicht nur den Mac-Port eines Forwards.
- Ein im Webview laufender fremder Code (etwa nach XSS) könnte damit beliebige lokale Dienste in Chrome öffnen.
- Der Zuwachs gegenüber dem Bestand ist klein: `opener:default` erlaubt schon `http(s)://*` im Standardbrowser. Neu ist nur die App-Bindung, und die ist auf „Google Chrome“ fest. Nur `localhost` ist erlaubt, nicht `127.0.0.1` und nicht https.
- Der Rust-Test hält fest, dass kein anderer Opener-Eintrag eine App nennt.
- Laut `evidence/slice-01.json` ist das Scope-Matching zur Laufzeit ungeprüft („unchecked: opener scope at runtime“). Ob das URLPattern auch Pfad und Query der Inspector-URL abdeckt, ist nur eine Frage der Funktion. Die Sicherheitsfrage dazu: Der Host-Vergleich muss über den geparsten Hostnamen laufen, nicht über einen String-Glob (Userinfo-Trick `http://localhost:1@evil.example/`).
**Recommendation:** In der macOS-QA mit `openUrl("http://localhost:1@example.com/", "Google Chrome")` prüfen, ob das Scope ablehnt. Optional einen Kommentar ergänzen, warum die Breite nötig ist.

### MIS-2: Vom Server ausgelieferter Viewer läuft im Haupt-Chrome-Profil auf `localhost`
**Pattern:** MI-06 (Data exposure / Side channel) · **Lens:** Data Exfiltration · **Severity:** LOW · **Confidence:** LOW · **OWASP:** LLM02, ASI03
**Location:** `src/modules/ports/lib/portDetect.ts:909-913`, `src/modules/ports/lib/portsStore.ts:720`
**Matched content:** ```return `http://${host}/devtools/inspector.html?ws=${host}/devtools/page/${pageId}`;```
**Analysis:**
- `inspector.html` und sein JavaScript stammen vom Server-Chrome. Ein kompromittierter oder bösartiger Server kann dort beliebiges JS ausliefern.
- Dieses JS läuft im alltäglichen Chrome-Profil des Nutzers unter dem Origin `http://localhost:{mac}`. Cookies für `localhost` sind nicht nach Port getrennt, sodass dieses JS Cookies anderer lokaler Dev-Dienste lesen oder setzen kann (sofern nicht HttpOnly).
- Das ist die gleiche Risikoklasse wie das bestehende „Open in browser“. Der Diff bringt keinen neuen Weg zu Daten und keinen neuen Sink.
**Recommendation:** Kein Code-Fix nötig. Optional im Hinweis-Text erwähnen, dass die Seite vom Server kommt. Alternativ später ein eigenes Chrome-Profil nutzen (`open -na "Google Chrome" --args --user-data-dir=…`), was aber eine breitere Capability bräuchte.

### MIS-3: Anleitung empfiehlt `npx -y chrome-devtools-mcp@latest` ungepinnt
**Pattern:** MI-05 (Dependency manipulation / unpinned) · **Lens:** Supply Chain · **Severity:** LOW · **Confidence:** LOW · **OWASP:** LLM03, AST02
**Location:** `src/modules/ports/lib/ports.ts` (`browserGuide`, Schritt 2)
**Matched content:** ```claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:${remotePort}```
**Analysis:**
- Der Befehl wird nur kopiert, nicht ausgeführt. Er ist als „Example“ gekennzeichnet und entspricht dem offiziell dokumentierten Aufruf des Pakets `chrome-devtools-mcp` (ChromeDevTools).
- `@latest` zusammen mit `-y` zieht bei jedem Start ungeprüft die neueste Version. Ein kompromittiertes Release würde auf dem Server mit Zugriff auf die Browser-Sitzung laufen.
- Kein Typosquatting erkennbar. Alter und Maintainer des Pakets lassen sich aus dem Diff nicht prüfen.
**Recommendation:** Optional eine feste Version nennen oder einen Hinweis „Version pinnen“ ergänzen.

## Notes
- LOW-confidence findings are advisory; they do not trigger FAIL.
- L1 (GitHub Action, regex) complements this scan — both layers coexist.
- Test-Dateien (`*.test.ts(x)`, Rust `#[cfg(test)]`) enthalten `evil.example`-Adressen nur als Negativ-Fixtures.
