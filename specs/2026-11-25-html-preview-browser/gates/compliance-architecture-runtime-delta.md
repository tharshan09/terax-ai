# Gate 1 — Architecture Compliance, Perspektive `runtime`, Delta-Lauf (Runde 2)

| Feld | Wert |
|------|------|
| Lauf | Delta gegen den Vorlauf-Report `gates/compliance-architecture-runtime.md` |
| Geprüfter Diff | `gates/architecture-r1-r2.diff` (513 Zeilen, `diff -u` alt → neu) |
| Aktueller Stand | `architecture.md` (Skript: 947 Zeilen), Abschnitt „Änderungen Runde 2" |
| Codebase | `/home/claude/litha/produkte/terax/terax-ai`, `main` @ `cf07327`, nur gelesen |
| Prüfdatum | 2026-11-25 |
| Prüfmenge | Laufzeit-Behauptungen im Diff, Vorlauf-Befunde RT-1 bis RT-28, im Vorlauf als NICHT GEMESSEN geführte Punkte |
| Messmittel | Lesen von Code; OpenSSH-portable `mux.c`, `ssh.c`, `session.c`, `serverloop.c` (master, per `curl` in den Scratchpad); Apple Safari 18.4 Release Notes (JSON der Doku-Seite); WebKit-Bug 160504; Mozilla-Bug 1220810; MDN `Access-Control-Allow-Origin`; WHATWG HTML `document.cookie`; Chromium security-dev; OWASP WSTG; docs.rs (tokio, percent-encoding). Nichts gebaut, gestartet oder installiert |

## Skript-Tabelle (Arch-Precheck Runde 2, übernommen)

Quelle: `gates/arch-precheck-r2.json`, `result: PASS`, 0 Befunde, 947 Zeilen. Nicht erneut geprüft (P5).

| ID | Prüfung | Status | Detail |
|----|---------|--------|--------|
| AR-1 | ID-Marker architecture.md | PASS | 27 h2 konform |
| AR-1d | ID-Marker discovery.md | PASS | konform |
| AR-2 | ID-Existenz | PASS | 100 definierte IDs, 164 referenziert |
| AR-3 | Anker pfad:zeile | PASS | 47 Anker aufgelöst |
| AR-4 | Invarianten-Zeilen | PASS | 13 INV-Zeilen mit gültigen Enums |
| AR-5 | Testnamen | PASS | 14 Testnamen in ihren Dateien gefunden |
| AR-6 | Versionen | PASS | 15 Zeilen mit Version |
| AR-7 | Scan-Plausibilität | SKIP | kein codebase-scan.md |
| AR-8 | Anti-Slop-Dispositionen | PASS | 0 Dispositionen formal vollständig |
| AR-9 | Bindings-Exceptions | SKIP | keine bindings.md |
| AR-10 | Migration Map | PASS | 21 MIG-Zeilen mit Dateipfad |
| AR-11 | Automatische Entscheide | PASS | 0 Assumptions „automatisch — zur PM-Durchsicht" |
| AR-12 | Register | PASS | kein neuer Fachbereich |
| AR-13 | Anker-Inhalt | PASS | 7 Bezeichner in ihren Ankerzeilen gefunden |
| AR-Q | Q&A Anforderungen | PASS | 3 automatische fachliche Entscheidung(en) mit Anforderungsbezug |

## Summary

| Klasse | neu | IDs |
|--------|-----|-----|
| `decision` | 0 | – |
| `refuted` | 1 | RT-D1 |
| `fix` | 6 | RT-D2, RT-D3, RT-D7, RT-D9, RT-D10, RT-D11 |
| `obligation` | 2 | RT-D4, RT-D6 (dazu RT-16 mit größerer Wirkung) |
| `note` | 2 | RT-D5, RT-D8 |

Vorlauf: alle drei blockierenden Befunde (RT-1, RT-2, RT-3) und alle sieben `fix`-Befunde (RT-4 bis RT-10) sind aufgelöst. Folgebefunde hängen an der Darstellung der neuen Optionen.

Prüfmenge: 50 erhoben (35 Behauptungen aus dem Diff, 15 im Vorlauf nicht gemessene), 34 gemessen, 16 nicht gemessen. Self-Check: 34 + 16 = 50.

Bekannt und nicht gemeldet: Q&A 4, 35 und 36 liegen dem User vor, Entwurfsstand = Empfehlung. Bei Wahl B in Q&A 36 widerspricht diese Option SEC-7, VAL-2 und Bedrohung 4 („keine CORS-Kopfzeilen"), das ist bekannt.

**Verdict:** FAILED (1 × `refuted`: RT-D1, die Darstellung von Option B in Q&A 36 und Bedrohung 24)

---

## Status der Vorlauf-Befunde

| ID | Klasse | Status | Beleg im neuen Stand | Anmerkung |
|----|--------|--------|----------------------|-----------|
| RT-1 | decision | aufgelöst | SEC-14 (Diff Z. 94) leitet das Budget her: Default 10 (sshd_config(5)), dazu die Nutzer des Masters `pty/shell_init.rs:153`, `git/process.rs:345`, `ssh.rs:1161`, `ports.rs:167-186`; Rechnung „7 Tabs + Halte-Sitzung → 2 Plätze" stimmt; Zahl liegt als Q&A 35 beim User; Zeiten in NFR-3 und Q&A 35 als „geschätzt, nicht gemessen" gekennzeichnet; N-25 neu | Wie sich eine Verweigerung zeigt, ist falsch beschrieben → RT-D3, RT-D4, RT-D5. Mein Vorlauf-Szenario „ein neuer Terminal-Tab startet nicht" war ungenau: OpenSSH baut dann eine eigene Verbindung auf (RT-D3) |
| RT-2 | decision | aufgelöst (Weiche dem User vorgelegt) | Bedrohung 24 (Diff Z. 126), Q&A 36 (Diff Z. 480), K2, Trade-off, N-26 | Option B ist in ihrer Sicherheitswirkung falsch dargestellt → RT-D1; die Eingrenzung auf `localhost` ist zu absolut → RT-D2 |
| RT-3 | refuted | aufgelöst | Alle Fundstellen berichtigt: K8, DTO-Zeile PDF, Assumptions, Trade-off, Open Question 2, Research Log, Q&A 4 (`grep -i pdf` über `architecture.md`, Z. 71, 581, 625, 729, 762, 859, 882); keine Stelle trägt die alte Aussage mehr. INV-3 betrifft die In-App-Vorschau | Herkunft des Safari-Belegs jetzt an der offiziellen Quelle geklärt → RT-D10; die Darstellung der Option B in Q&A 4 überzeichnet den Unterschied → RT-D11 |
| RT-4 | fix | aufgelöst | VAL-1 je Klasse; Bedrohung 5 je Klasse; Schnitt: belegter `[::1]`-Port nach Muster `TERAX.md:44` | – |
| RT-5 | fix | aufgelöst, anders als vorgeschlagen | VAL-5, VAL-8, API-2, Q&A 21: Schrägstrich am Ende → `index.html`; Ordner ohne Schrägstrich → `404` statt `308` | Trägt: mit `404` wird nichts unter falscher Basis-Adresse ausgeliefert, relative Verweise können nicht falsch auflösen; `href="sub"` scheitert sichtbar (in Q&A 21 benannt). Randfall `/{token}` ohne Schrägstrich → RT-D6 |
| RT-6 | fix | aufgelöst | SEC-13 64 KiB, `Cookie` nie ausgewertet; Test mit 20 KiB `Cookie` in Bedrohung 18 | Zahl der Kopfzeilen bleibt Auflage RT-14 |
| RT-7 | fix | aufgelöst | Bedrohung 11 benennt `<meta name="referrer">`/`referrerpolicy` | Folgesatz „ohne CORS aber nicht lesen" stimmt für Skripte nicht → RT-D7 |
| RT-8 | fix | aufgelöst | K2, Bedrohung 13, Trade-off | – |
| RT-9 | fix | aufgelöst | M-C mit den echten `frame`-Kopfzeilen und verschachteltem `iframe`; N-23 | – |
| RT-10 | fix | aufgelöst | Integrations-Zeile und Welle 2: `default-features = false, features = ["html"]` | – |
| RT-11 bis RT-15 | obligation | offen, unverändert (weitergereicht) | `gates/obligations.md`, Stand „offen" | – |
| RT-16 | obligation | offen, verändert | SEC-14 jetzt 1 je Host, Strafe weiter „Warten in der Reihe" ohne Grenze; Budget je Lesung mit `expected_size = None` 244 s (`ssh.rs:897-909`, `:1506-1509`) | Wirkung größer: ein einziger hängender Lesevorgang hält 244 s lang alle Lesungen dieses Hosts auf, auch die anderer Links. Auflage bleibt: begrenzte Wartezeit, danach `504` |
| RT-17 | obligation | im Entwurf umgesetzt (SVC-8, SVC-22, MIG-21); Nachweis bleibt Auflage | Abbildung `Missing`/`NotRegularFile` → 404, `TooLarge` → 403, `TimedOut` → 504, `Unreachable`/`Failed` → 502; Helfer-Arten machbar (`ssh.rs:394-412`: `os.stat` wirft bei fehlender Datei, `ValueError` bei „not a regular file" `:401`, `:406` und „too large" `:408`, `:411`) | `Killed` fehlt in der Abbildung → RT-D8 |
| RT-18, RT-19 | obligation | offen, unverändert (W2) | `gates/obligations.md` | – |
| RT-20 bis RT-28 | note | unverändert, protokolliert | `gates/obligations.md`; SVC-11 nennt weiter `open_url(url, None)` (RT-20) | – |

---

## Neue Befunde

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution |
|----|--------|-------|-----------|-------|-------|-------------|----------------------|------------|
| RT-D1 | refuted | Sicherheitsmodell, Q&A 36 | architecture.md (Bedrohung 24, Q&A 36 Option B, N-26) | Bedrohung 24: „Q&A 36 B (HTML mit `sandbox`-CSP ohne `allow-same-origin`, Nachladen im Bereich über `Access-Control-Allow-Origin: null` nur bei gültigem Geheimnis)"; Q&A 36 B: „fremde Dienste sind geschützt, Skripte laufen und laden Nachbardateien weiter; dafür kann sich die Seite im Browser nichts merken, Web-Worker gehen nicht"; N-26: „`document.cookie` … ist aus der Seite leer" | MDN `Access-Control-Allow-Origin`: „It may seem safe to return `Access-Control-Allow-Origin: "null"`; however, the origin of resources that use a non-hierarchical scheme (such as `data:` or `file:`) and sandboxed documents is serialized as `null`. … any origin can create a hostile document with a `null` origin." Unter B prüft CORS also keine Herkunft mehr, die einzige Sperre ist das Geheimnis. Damit wird die Zusage aus Bedrohung 11 („ohne CORS aber nicht lesen") unter B falsch: wer das Geheimnis kennt, liest den Bereich aus einem eigenen sandboxed `iframe`. WHATWG HTML `document.cookie`: bei opaker Herkunft „the user agent must throw a "SecurityError" DOMException" (Lesen und Setzen), also nicht „leer". Opake Herkunft macht Anfragen cross-site; Cookies mit `SameSite=None` (in Safari und Firefox auch ohne Attribut) gehen weiter mit, und Chrome LNA prüft Loopback zu Loopback nicht | dependency (MDN, WHATWG) | Unter B lädt eine fremde Seite, die das Geheimnis kennt, Inhalte des Bereichs per `fetch` aus einem `<iframe sandbox="allow-scripts">` und liest sie. `document.cookie` wirft in der abgeschotteten Seite einen `SecurityError` | Option B in Q&A 36 und Bedrohung 24 berichtigen, bevor der User entscheidet: (1) `ACAO: null` öffnet das Lesen für jedes Dokument mit `null`-Herkunft, Schutz nur noch durch das Geheimnis; Bedrohung 11 gilt unter B nicht mehr; (2) „fremde Dienste geschützt" einschränken: Cookie-Lesen und -Setzen sowie same-site entfallen, Cookies ohne `SameSite`-Schutz gehen bei Anfragen an sie weiter mit, wie bei jeder Webseite; (3) N-26: `document.cookie` wirft `SecurityError`. Möglicher Ersatz für `null`: Nachladen nur über `no-cors` (Bilder, Styles, klassische Skripte), dann aber ohne `fetch` |
| RT-D2 | fix | Sicherheitsmodell, Q&A 36 | architecture.md (Bedrohung 24, Q&A 36 Frage) | Bedrohung 24: „Dienste unter `localhost` (so öffnet Terax auch Port-Freigaben, `TERAX.md:44`) sind nicht betroffen, `127.0.0.1` und `localhost` sind verschiedene Sites"; Q&A 36: „Dienste unter `localhost`, auch die Port-Freigaben von Terax, sind nicht betroffen." | Richtig ist der Teil zu Cookies und same-site: RFC 6265 §5.1.3 (Z. 874-888 der Textfassung) prüft den Host als Zeichenkette, eine IP nur auf Gleichheit; Site = (Schema, Host). Nicht abgedeckt: die ausgelieferte Seite liegt im Loopback-Adressraum, Chrome LNA erfasst nur Anfragen „from the public network to local or loopback destinations" (developer.chrome.com/blog/local-network-access). Eine Seite unter `127.0.0.1` schickt also cross-site Anfragen an `http://localhost:{port}` ohne die LNA-Nachfrage, die eine Internet-Seite in Chrome bekäme | dependency | Eine ausgelieferte Seite schickt in Chrome ein Formular an eine Port-Freigabe `http://localhost:3000`, ohne Nachfrage; Cookies mit `SameSite=Lax` gehen nicht mit, Cookies mit `SameSite=None` schon | „nicht betroffen" eingrenzen auf „keine Cookie-Lese- und -Schreibrechte, keine same-site-Anfragen"; als Restrisiko für alle drei Optionen benennen: cross-site Anfragen an lokale Dienste wie von jeder Webseite, in Chrome aber ohne LNA-Nachfrage |
| RT-D3 | fix | B, D (sshd) | architecture.md (SEC-14 Strafe, Error Handling Strategy, Q&A 35 Optionen B und C) | SEC-14: „eine verweigerte oder abgerissene Sitzung (`Unreachable`) wird einmal nach kurzer Pause wiederholt, dann `502`"; Error Handling: „`Unreachable` (… von sshd verweigerte Sitzung)"; Q&A 35 C: „schlechter Fall: ab 5 bis 6 Tabs fehlen Bilder, oder ein neuer Terminal-Tab startet nicht" | OpenSSH-portable master: Verweigert sshd den Kanal, antwortet der Master `MUX_S_FAILURE` „Session open refused by peer" (`mux.c:1444-1448`); `session_open` meldet serverseitig „no more sessions" (`session.c:1767-1770`). Der Client gibt „session request failed: %s" aus (`mux.c:2105`) und `muxclient()` kehrt mit `-1` zurück (`mux.c:2558-2559`). `ssh.c:1681-1686` geht nur bei `sock >= 0` an der Verbindung vorbei, sonst baut `ssh` eine eigene TCP-Verbindung auf. Terax ruft mit `BatchMode=yes`, `ConnectTimeout=10`, `ControlMaster=auto` (`ssh.rs:1156-1162`). Folgen: mit Agent oder Schlüssel ohne Passphrase gelingt das Lesen über die eigene Verbindung, es gibt keinen Fehler; mit Passphrase-Schlüssel ohne Agent endet es mit Exit 255 und „Permission denied" → `exit_error` → `Transport` (`ssh.rs:1109`) mit dem Text aus `classify_ssh_error` (`ssh.rs:952-961`) „SSH authentication failed — open a terminal to this host first …". Terminal-Tabs laufen mit `-tt` ohne `BatchMode` (`pty/shell_init.rs:152`) und fallen ebenfalls auf eine eigene Verbindung zurück; sie starten, fragen aber gegebenenfalls erneut nach der Passphrase. Die Halte-Sitzung verhindert genau diesen Rückfall mit `ControlMaster=no`, `ProxyCommand=false` (`ports.rs:167-186`; `TERAX.md:44` „the holder never opens a connection of its own") | dependency, code | Verweigerung bei Passphrase-Schlüssel: Lesen scheitert nach Verbindungsaufbau und Anmeldeversuch (nicht sofort) mit Auth-Text; bei Agent-Schlüssel: Lesen gelingt über eine zusätzliche Verbindung. Ein verweigerter Terminal-Tab startet über eine eigene Verbindung | SEC-14 und Error Handling: Fehlerbild nach der OpenSSH-Quelle beschreiben (Rückfall auf eigene Verbindung, Fehler nur ohne nutzbaren Schlüssel, dann `Transport` → `Unreachable`). Q&A 35 B und C: „ein neuer Terminal-Tab startet nicht" ersetzen durch „ein neuer Terminal-Tab öffnet eine eigene Verbindung und fragt ggf. erneut nach der Passphrase; Git und Bilder scheitern bei Passphrase-Schlüsseln" |
| RT-D4 | obligation | D | implement | Error Handling: „`502` mit Text „Terax could not read {name} from {host}: {reason}"" | Bei verweigerter Mux-Sitzung und Passphrase-Schlüssel liefert `classify_ssh_error` „open a terminal to this host first", obwohl ein Terminal offen ist (`ssh.rs:952-961`); stderr enthält zugleich „Session open refused by peer" (`mux.c:1447`, `:2105`) | code, dependency | Bei verweigerter Sitzung nennt die `502`-Seite das Sitzungslimit des Servers (z. B. „the server refused another session (MaxSessions)"), nicht den Anmelde-Hinweis | Erkennung über stderr in `read_bytes_typed` (bzw. RT-D5); Test mit Host-Ersatz, der diesen stderr-Text liefert |
| RT-D5 | note | D | – | SVC-22: „wie `read_bytes`" | `ports.rs:167-186`: Halte-Sitzung mit `ControlMaster=no`, `ProxyCommand=false`, damit eine Verweigerung sofort ein Fehler ist und keine eigene Verbindung entsteht | code | – | Für `read_bytes_typed` dieselben Optionen erwägen: dann ist die Verweigerung sofort erkennbar, die Wiederholung aus SEC-14 greift wie beschrieben, und Lesungen öffnen keine zusätzlichen, nicht gezählten Verbindungen (sonst auch zusätzliche fehlgeschlagene Anmeldungen am Server) |
| RT-D6 | obligation | C2 | implement | VAL-5: „ein leerer `relpath` und genau ein leeres Schluss-Segment (Schrägstrich am Ende) bedeuten „Ordner"" | `/{token}` (ohne Schrägstrich) und `/{token}/` haben beide einen leeren `relpath`; wird `/{token}` mit `index.html` beantwortet, lösen deren relative Verweise gegen `/` auf und verlieren das Geheimnis | artifact | `GET /{token}` ergibt `404` (wie ein Ordner ohne Schrägstrich), `GET /{token}/` die `index.html` der Wurzel | in `split_target` unterscheiden und testen |
| RT-D7 | fix | Sicherheitsmodell | architecture.md (Bedrohung 11) | „eine fremde Seite könnte Dateien des Bereichs per `<script>` oder `<img>` einbinden, ohne CORS aber nicht lesen" | OWASP WSTG-CLNT-13 (Testing for Cross Site Script Inclusion): eingebundene Skripte laufen im Kontext der einbindenden Seite; setzt das Skript z. B. `window.secret = …`, liest die einbindende Seite den Wert (https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/11-Client-side_Testing/13-Testing_for_Cross_Site_Script_Inclusion.html) | dependency | Eine fremde Seite, die Port und Geheimnis kennt, bindet `daten.js` mit `window.DATA = {…}` ein und liest `window.DATA` | Satz berichtigen: Bilder und Styles nicht lesbar; Skripte (`.js`) des Bereichs geben ihre Wirkung (globale Werte) an die einbindende Seite preis |
| RT-D8 | note | D | – | SVC-22: „die Rust-Seite übernimmt die Art aus … `RemoteError` (`Transport`, `Failed`, `Killed`, `TimedOut`)"; `RemoteReadError { Unreachable, TimedOut, Failed, Missing, NotRegularFile, TooLarge }` | `ssh.rs:1047-1052`: `Killed` = Helfer durch Signal beendet (Exit 128-254, `ssh.rs:1105-1108`), z. B. OOM auf dem Host | code | – | Abbildung `Killed` → `Failed` (502) ausdrücklich festhalten |
| RT-D9 | fix | D | architecture.md (Research Log Runde 2) | „Safari löst `*.localhost` über den Systemresolver auf; vor macOS 26 laut Berichten unzuverlässig (WebKit-Bug 160504, offen)" | https://bugs.webkit.org/show_bug.cgi?id=160504: Status RESOLVED MOVED, letzte Änderung 2025-09-19; Kommentar 19: „This seems to be fixed in macOS 26 Tahoe" (Test scheitert auf macOS 15.7, läuft auf 26.0); Kommentar 20: „Indeed, this was implemented in OS frameworks below WebKit." | dependency | – | Status berichtigen: behoben ab macOS 26 in den Systembibliotheken; vor macOS 26 (Terax-Mindestversion 13.0, `tauri.conf.json:50`) nicht verlässlich. Die Aussage in Q&A 36 C bleibt sachlich richtig |
| RT-D10 | fix | D | architecture.md (Assumptions PDF-Zeile Z. 581, Research Log Z. 859, Q&A 4) | Assumptions: „Safari ab 18.4 laut WebKit-Notes (Safari Technology Preview 212) und Nutzerbericht zu den 18.4-Notes nur zitiert" | Offizielle Quelle erreichbar: Apple Developer, Safari 18.4 Release Notes (JSON der Seite https://developer.apple.com/tutorials/data/documentation/safari-release-notes/safari-18_4-release-notes.json, Titel „Safari 18.4 Release Notes"), Eintrag: „Fixed main frame PDFs served with a CSP sandbox header not loading. (141166987)" | dependency (Hersteller) | – | Beleg auf die offiziellen Safari-18.4-Release-Notes (141166987) umstellen; der Fix gilt nur für „main frame", eingebettete PDFs bleiben bei N-8 offen (dort schon geführt) |
| RT-D11 | fix | Q&A 4 | architecture.md (Q&A 4 Option B, Trade-off PDF) | Q&A 4 B: „schlechter Fall: eine PDF mit eingebettetem Skript läuft im PDF-Betrachter ohne die zusätzliche Sperre" | Kein Beleg, dass `sandbox` am PDF-Response Skripte im eingebauten Betrachter sperrt. Chromium security-dev, Charlie Reis, 2024-09-18 (https://groups.google.com/a/chromium.org/g/security-dev/c/Xje-1Vp8iLk): „I'm curious if it would let us stop stripping CSP from PDF responses as well" (crbug 41494478). Danach entfernt Chrome die CSP von PDF-Antworten; A und B verhalten sich im Chrome-Betrachter dann gleich. Redmine #40647 (Holger Just): Firefox und Chromium lösten den alten Fehler, indem sie ihre eingebauten Betrachter von der CSP ausnahmen | dependency | In Chrome läuft eine PDF mit eingebettetem Skript unter A genauso wie unter B | Option B fachlich korrekt fassen: Unterschied zu A ist vor allem die wörtliche Erfüllung von BR-14; eine zusätzliche Sperre im Betrachter ist für Chrome nicht belegt (Quelle: CSP wird von PDF-Antworten entfernt), für Safari nicht gemessen. Die Empfehlung A kann bleiben |

## Blockierende Befunde (JSON)

```json
{"id":"RT-D1","class":"refuted","claim":"architecture.md Sicherheitsmodell Bedrohung 24: \"Q&A 36 B (HTML mit `sandbox`-CSP ohne `allow-same-origin`, Nachladen im Bereich über `Access-Control-Allow-Origin: null` nur bei gültigem Geheimnis)\"; Q&A 36 Option B: \"fremde Dienste sind geschützt, Skripte laufen und laden Nachbardateien weiter; dafür kann sich die Seite im Browser nichts merken, Web-Worker gehen nicht\"; N-26: \"`document.cookie` eines Dienstes auf `127.0.0.1:8000` ist aus der Seite leer\"","evidence":"MDN Access-Control-Allow-Origin (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin): \"It may seem safe to return Access-Control-Allow-Origin: \"null\"; however, the origin of resources that use a non-hierarchical scheme (such as data: or file:) and sandboxed documents is serialized as null. Many browsers will grant such documents access to a response with an Access-Control-Allow-Origin: null header, and any origin can create a hostile document with a null origin.\" WHATWG HTML document.cookie (https://html.spec.whatwg.org/multipage/dom.html#dom-document-cookie): \"Otherwise, if the Document's origin is an opaque origin, the user agent must throw a \"SecurityError\" DOMException.\" (Lesen und Setzen). architecture.md Bedrohung 11 sagt zugleich: \"eine fremde Seite könnte Dateien des Bereichs per <script> oder <img> einbinden, ohne CORS aber nicht lesen\" — unter B gibt es CORS für null.","evidence_source":"dependency","expected_observation":"Unter Option B liest eine fremde Seite, die Port und Geheimnis kennt, Dateien des Bereichs per fetch aus einem eigenen <iframe sandbox=\"allow-scripts\"> (Origin: null, Antwort mit Access-Control-Allow-Origin: null). In der abgeschotteten Terax-Seite wirft document.cookie einen SecurityError statt einen leeren Text zu liefern.","scenario":"1. User wählt in Q&A 36 Option B, weil sie als 'fremde Dienste geschützt' und sonst nur als Komfortverlust beschrieben ist. 2. Eine ausgelieferte HTML-Seite lockert no-referrer per <meta name=\"referrer\" content=\"unsafe-url\"> (Bedrohung 11) und lädt ein Bild von einem CDN; das CDN erhält http://127.0.0.1:{A}/{token}/bericht.html. 3. Der Betreiber stellt eine Seite ins Netz, die ein <iframe sandbox=\"allow-scripts\" srcdoc=\"…\"> erzeugt; darin ruft ein Skript fetch('http://127.0.0.1:{A}/{token}/daten.json') auf. 4. Der User öffnet diese Seite in Safari (kein LNA); die Anfrage trägt Origin: null, Host 127.0.0.1:{A} besteht VAL-1, das Geheimnis VAL-4, die Antwort trägt Access-Control-Allow-Origin: null. 5. Das fremde Skript liest den Inhalt, was unter Option A ohne CORS-Freigabe nicht ginge."}
```

---

## Prüfmenge

### Behauptungen aus dem Diff (35)

| # | Behauptung (Stelle) | Beleg | Verdikt |
|---|---------------------|-------|---------|
| D-01 | Budget-Herleitung SEC-14 (Default 10, Nutzer des Masters) | sshd_config(5) (Vorlauf); `ssh.rs:122-127` `ControlMaster=auto`, `ControlPersist=10m`, `ControlPath`; Anker wie Vorlauf | bestätigt |
| D-02 | „bei 7 Tabs und einer Halte-Sitzung bleiben 2 Plätze" | 10 − 7 − 1 = 2 | bestätigt |
| D-03 | Verweigerte Sitzung = `Unreachable`, eine Wiederholung | `mux.c:1444-1448`, `:2105`, `:2558-2559`; `ssh.c:1681-1686`; `ssh.rs:1109`, `:952-961` | teilweise → RT-D3, RT-D4, RT-D5 |
| D-04 | Zeiten als Schätzung gekennzeichnet (NFR-3, Q&A 35) | „Geschätzt, nicht gemessen: 0,1 bis 0,5 s je Datei …"; „geschätzt 3 bis 15 Sekunden (N-25 misst)" | bestätigt |
| D-05 | Q&A 35 B/C: „ein neuer Terminal-Tab startet nicht" | `pty/shell_init.rs:152` (`-tt`, kein `BatchMode`) + Rückfall `ssh.c:1681-1686` | widerlegt → RT-D3 |
| D-06 | Q&A 35 A: Terminal-Tabs und Git werden nicht verdrängt | höchstens 1 Platz je Host belegt | bestätigt |
| D-07 | SEC-13 64 KiB, `Cookie` nie ausgewertet | RFC 6265 §6.1, §8.5 (Vorlauf) | bestätigt |
| D-08 | VAL-1 je Freigabe-Klasse | Browser setzt `Host` aus der URL-Autorität | bestätigt |
| D-09 | belegter `[::1]`-Port → Muster `TERAX.md:44` | `TERAX.md:44` | bestätigt |
| D-10 | VAL-5/VAL-8 Ordner mit und ohne Schrägstrich | Auflösung relativer Verweise gegen die Basis | bestätigt; Randfall → RT-D6 |
| D-11 | Bedrohung 11: „ohne CORS aber nicht lesen" | OWASP WSTG-CLNT-13 | widerlegt für Skripte → RT-D7 |
| D-12 | Bedrohung 11: nutzbar nur aus dem Browser des Macs, Host-Prüfung bleibt | Loopback-Bindung, VAL-1 | bestätigt |
| D-13 | Bedrohung 13: Speicher über Läufe; Service Worker auf Pfad begrenzt | Herkunft mit Port (WHATWG, Vorlauf); Geheimnis im Pfad | bestätigt |
| D-14 | Bedrohung 24: Cookies ohne Port-Trennung, same site ohne Port | RFC 6265 §8.5; WHATWG HTML (Vorlauf) | bestätigt |
| D-15 | „Dienste unter `localhost` … nicht betroffen" | RFC 6265 §5.1.3; Chrome LNA | teilweise → RT-D2 |
| D-16 | B: kein `document.cookie`, kein Speicher | WHATWG HTML `document.cookie` (SecurityError bei opaker Herkunft) | bestätigt (Speicher: opake Herkunft, Messseite Punkt 7) |
| D-17 | B: `ACAO: null` nur bei gültigem Geheimnis als Schutz | MDN ACAO | widerlegt → RT-D1 |
| D-18 | B: Anfragen an andere 127.0.0.1-Dienste ohne deren same-site-Cookies | opake Herkunft ist nie same site (WHATWG HTML) | bestätigt; `SameSite=None` bleibt → RT-D1 |
| D-19 | B: „Web-Worker gehen nicht" | – | NICHT GEMESSEN — Worker-Regeln für opake Herkunft (inkl. `blob:`/`data:`) nicht nachgelesen |
| D-20 | C: Firefox löst `*.localhost` auf | Mozilla-Bug 1220810 „let-localhost-be-localhost", behoben in Firefox 84 | bestätigt |
| D-21 | C: Chrome löst `*.localhost` auf | – | NICHT GEMESSEN — Chromium-Quelle nicht abgerufen |
| D-22 | C: Safari vor macOS 26 unzuverlässig | WebKit-Bug 160504, Kommentare 19, 20 | bestätigt; Status „offen" falsch → RT-D9 |
| D-23 | RT-3 an jeder Stelle berichtigt | `grep -i pdf` über `architecture.md` | bestätigt |
| D-24 | Chrome 156 öffnet PDF mit `sandbox` (Nachprüfer) | – | NICHT GEMESSEN — fremde Messung, Browserstart in diesem Lauf nicht erlaubt |
| D-25 | Safari 18.4 behebt PDF mit CSP sandbox | offizielle Safari 18.4 Release Notes, 141166987 | bestätigt → RT-D10 (Quelle) |
| D-26 | Q&A 4 B: Skript im Betrachter „ohne die zusätzliche Sperre" | Chromium security-dev 2024-09-18 (CSP-Entfernung bei PDF) | unbelegt, für Chrome widersprochen → RT-D11 |
| D-27 | N-8 erweitert (`target="_blank"`, eingebettet) | Diff Z. 330 | bestätigt |
| D-28 | Helfer meldet `missing`, `not_regular`, `too_large` | `ssh.rs:394-412` | bestätigt (machbar) |
| D-29 | `RemoteReadError` deckt alle `RemoteError`-Arten | `ssh.rs:1047-1052`, `:1105-1108` | Lücke `Killed` → RT-D8 |
| D-30 | W2-Cargo-Zeile pulldown-cmark | pulldown-cmark 0.13.6 Features (Vorlauf) | bestätigt |
| D-31 | M-C misst `frame-ancestors` und verschachtelten `iframe` | Diff Z. 304, 312 | bestätigt |
| D-32 | N-26 B: `document.cookie` „leer" | WHATWG HTML: SecurityError | widerlegt → RT-D1 |
| D-33 | SEC-14 1 je Host mit Warten ohne Grenze | `ssh.rs:897-909`, `:1506-1509`: 244 s je Lesung | gemessen → RT-16 verändert |
| D-34 | Bedrohung 24: Chrome LNA prüft Loopback zu Loopback nicht | Chrome-Blog LNA (Vorlauf) | bestätigt |
| D-35 | K2: eigene Herkunft nur innerhalb eines Laufs | wie D-13 | bestätigt |

### Im Vorlauf nicht gemessen (15)

| # | Punkt | Stand jetzt |
|---|-------|-------------|
| C-05 | tauri-Laufzeit hat IO-Treiber | gemessen: tauri `TokioRuntime::new()` (Vorlauf); tokio 1.54.1 `Runtime::new`: „This results in the multi threaded scheduler, I/O driver, and time driver being initialized." (docs.rs) → bestätigt |
| C-12 | `percent_decode_str`, `utf8_percent_encode` | gemessen: docs.rs percent-encoding 2.3.2 listet beide → bestätigt |
| C-18 | tauri „neueste 2.12.6" | NICHT GEMESSEN — ohne Bezug zum Entwurf |
| C-30 | Betriebssystem schließt Sockets nach Absturz | NICHT GEMESSEN — nur am Mac (N-18) |
| C-49 | Safari `Sec-Fetch-Site`-Fehler | NICHT GEMESSEN — WebKit-Bugs nicht abgerufen |
| C-50 | `nosniff` + `sandbox` für träge Arten | NICHT GEMESSEN — Mac N-17 |
| C-51 | SVG mit Skript führt nichts aus | NICHT GEMESSEN — Mac N-17 |
| C-53 | `frame-ancestors 'self'` sperrt fremde Einbettung | NICHT GEMESSEN — CSP3 §6.4.2 nicht im abgerufenen Ausschnitt |
| C-55 | keine CSP an Skripten wegen Worker | NICHT GEMESSEN — CSP3 nicht abgerufen |
| C-56 | `no-store` → Neuladen aktuell | NICHT GEMESSEN — Mac N-3 |
| C-68 | AppKit-Monitor sieht `keyDown` bei Fokus im `iframe` | NICHT GEMESSEN — Mac N-10 |
| C-69 | `127.0.0.1` gegen `localhost` im App-Rahmen | NICHT GEMESSEN — Mac N-23 |
| C-70 | keine Firewall-Nachfrage | NICHT GEMESSEN — Mac N-16 |
| C-71 | `open_url` öffnet die Adresse | NICHT GEMESSEN — Mac N-2 |
| C-72 | Port vom Betriebssystem zufällig | NICHT GEMESSEN — macOS-Portvergabe nicht nachgelesen |

Zählung: Diff 35 (32 gemessen, 3 nicht gemessen) + Vorlauf 15 (2 gemessen, 13 nicht gemessen) = 50 erhoben, 34 gemessen, 16 nicht gemessen.

Außerhalb der Perspektive (Perspektive `code`/`ui`, nicht gezählt): MIG-17 bis MIG-21 als Code-Anker, INV-5, INV-13, API-6 (Zustände der Taste), Guard-Muster Bedrohung 20, `FrameSource`-Serde, Sweep-Kriterium, „`upstream/main` hat kein `ssh.rs`".

## Rückgabe

```
VERDICT: FAILED
BLOCKING_ISSUES: [RT-D1 · refuted · Sicherheitsmodell/Q&A 36 · architecture.md Bedrohung 24, Q&A 36 Option B, N-26 · „Nachladen … über Access-Control-Allow-Origin: null nur bei gültigem Geheimnis"; „fremde Dienste sind geschützt"; „document.cookie … leer" · MDN ACAO: „any origin can create a hostile document with a null origin"; WHATWG document.cookie: SecurityError bei opaker Herkunft · dependency · unter B liest eine fremde Seite mit bekanntem Geheimnis den Bereich aus einem sandboxed iframe; document.cookie wirft · Option B und Bedrohung 24 berichtigen (null öffnet Lesen für jede null-Herkunft, Bedrohung 11 gilt unter B nicht; SameSite=None-Cookies gehen weiter mit; N-26-Erwartung SecurityError), bevor der User entscheidet]
FIX_ITEMS: [RT-D2 Bedrohung 24/Q&A 36: „localhost nicht betroffen" eingrenzen, cross-site ohne LNA als Restrisiko aller Optionen | RT-D3 SEC-14, Error Handling, Q&A 35 B/C: Fehlerbild nach OpenSSH (Rückfall auf eigene Verbindung; Terminal-Tab startet über eigene Verbindung) | RT-D7 Bedrohung 11: Skripte des Bereichs geben ihre Wirkung an die einbindende Seite preis (XSSI) | RT-D9 Research Log: WebKit 160504 RESOLVED MOVED, behoben ab macOS 26 | RT-D10 Assumptions/Research Log/Q&A 4: Beleg auf offizielle Safari-18.4-Notes (141166987) | RT-D11 Q&A 4 B: zusätzliche Sperre im Betrachter für Chrome nicht belegt (CSP wird von PDF-Antworten entfernt)]
OBLIGATIONS: [RT-D4 bei verweigerter Mux-Sitzung nennt die 502-Seite das Sitzungslimit, nicht den Anmelde-Hinweis · Host-Ersatz mit stderr „Session open refused by peer" · implement | RT-D6 GET /{token} ohne Schrägstrich ergibt 404, /{token}/ die index.html · Test split_target · implement | RT-16 (verändert) Wartezeit auf den einen Lese-Platz je Host begrenzt, danach 504 · Host-Ersatz, der nie antwortet · implement]
DATA_TYPE_VERDICTS: [Anfragekopf 64 KiB OK (RT-6 aufgelöst) | Host je Klasse OK (RT-4 aufgelöst) | Request-Target /{token} ohne Schrägstrich offen (RT-D6) | übrige unverändert aus dem Vorlauf]
PATTERN_CONSISTENCY: [N/A — kein codebase-scan.md]
BINDINGS_COVERAGE: [N/A — keine bindings.md]
RECOMMENDATIONS: [RT-D5 read_bytes_typed mit ControlMaster=no/ProxyCommand=false wie die Halte-Sitzung | RT-D8 Killed → Failed (502) festhalten | RT-20 bis RT-28 unverändert]
CLAIMS: {erhoben: 50, gemessen: 34, nicht_gemessen: 16}
```

## Quellen außerhalb des Repos

- OpenSSH-portable `mux.c`, `ssh.c`, `session.c` (Branch master): https://raw.githubusercontent.com/openssh/openssh-portable/master/mux.c, …/ssh.c, …/session.c
- Safari 18.4 Release Notes (Apple Developer, JSON der Doku-Seite): https://developer.apple.com/tutorials/data/documentation/safari-release-notes/safari-18_4-release-notes.json
- WebKit-Bug 160504: https://bugs.webkit.org/show_bug.cgi?id=160504
- Mozilla-Bug 1220810: https://bugzilla.mozilla.org/show_bug.cgi?id=1220810
- MDN Access-Control-Allow-Origin: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin
- WHATWG HTML `document.cookie`: https://html.spec.whatwg.org/multipage/dom.html#dom-document-cookie
- Chromium security-dev (CSP bei PDF-Antworten, 2024): https://groups.google.com/a/chromium.org/g/security-dev/c/Xje-1Vp8iLk
- Redmine #40647: https://www.redmine.org/issues/40647
- OWASP WSTG-CLNT-13: https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/11-Client-side_Testing/13-Testing_for_Cross_Site_Script_Inclusion.html
- Chrome Local Network Access: https://developer.chrome.com/blog/local-network-access
- tokio 1.54.1 `Runtime`: https://docs.rs/tokio/1.54.1/tokio/runtime/struct.Runtime.html
- percent-encoding 2.3.2: https://docs.rs/percent-encoding/2.3.2/percent_encoding/
- RFC 6265 (Textfassung, §5.1.3 Z. 874-888): https://www.rfc-editor.org/rfc/rfc6265.txt
