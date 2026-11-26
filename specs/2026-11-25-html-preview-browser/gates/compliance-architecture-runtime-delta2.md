# Gate 1 — Architecture Compliance, Perspektive `runtime`, Delta 2 (Runde 3)

| Feld | Wert |
|------|------|
| Lauf | Delta 2 gegen den Vorlauf `gates/compliance-architecture-runtime-delta.md` |
| Geprüfter Diff | `gates/architecture-r2-r3.diff` (430 Zeilen, `diff -u` alt → neu) |
| Aktueller Stand | `architecture.md` (966 Zeilen), Abschnitt „Änderungen Runde 3" |
| Codebase | `/home/claude/litha/produkte/terax/terax-ai`, `main` @ `cf07327`, nur gelesen |
| Prüfdatum | 2026-11-25 |
| Zeilenangaben | „Z. n" bezieht sich auf `architecture-r2-r3.diff`; Ausnahme „Research Log Z. 855" = Zeile in `architecture.md` |
| Bindend (nicht als offene Weiche gemeldet) | Q&A 4 = A, Q&A 35 = A, Q&A 36 = A, Baustein E in Welle 1 ohne Vorab-Messung (User, 25.11.2026) |
| Messmittel | Lesen von Code (`HtmlPreviewPane.tsx`, `PreviewPane.tsx`, `tauri.conf.json`, `Cargo.toml`, `ssh.rs`), `grep` über `src/` und `architecture.md`; OpenSSH-portable-Quelle aus dem Vorlauf; W3C CSP3 Editor's Draft §6.4.2.1 und §6.7.2.8; docs.rs tauri 2.12.5 Features; Quellen der Vorläufe. Nichts gebaut, gestartet oder installiert |

## Skript-Tabelle (Arch-Precheck Runde 3, übernommen)

Quelle: `gates/arch-precheck-r3.json`, `result: PASS`, 966 Zeilen, 0 blockierend. Die Warnung AR-5 zu INV-13 ist laut Aufrufer geklärt. Nicht erneut geprüft (P5).

| ID | Prüfung | Status | Detail |
|----|---------|--------|--------|
| AR-1 | ID-Marker architecture.md | PASS | 28 h2 konform |
| AR-1d | ID-Marker discovery.md | PASS | konform |
| AR-2 | ID-Existenz | PASS | 100 definierte IDs, 164 referenziert |
| AR-3 | Anker pfad:zeile | PASS | 47 Anker aufgelöst |
| AR-4 | Invarianten-Zeilen | PASS | 13 INV-Zeilen mit gültigen Enums |
| AR-5 | Testnamen | WARN (geklärt) | INV-13: Testname steht in `src/modules/source-control/statusConsumers.test.ts` |
| AR-6 | Versionen | PASS | 15 Zeilen mit Version |
| AR-7 | Scan-Plausibilität | SKIP | kein codebase-scan.md |
| AR-8 | Anti-Slop-Dispositionen | PASS | 0 Dispositionen formal vollständig |
| AR-9 | Bindings-Exceptions | SKIP | keine bindings.md |
| AR-10 | Migration Map | PASS | 21 MIG-Zeilen mit Dateipfad |
| AR-11 | Automatische Entscheide | PASS | 0 Assumptions „automatisch — zur PM-Durchsicht" |
| AR-12 | Register | PASS | kein neuer Fachbereich |
| AR-13 | Anker-Inhalt | PASS | 3 Bezeichner in ihren Ankerzeilen gefunden |
| AR-Q | Q&A Anforderungen | PASS | keine automatische fachliche Entscheidung |

## Summary

| Klasse | neu | IDs |
|--------|-----|-----|
| `decision` | 0 | – |
| `refuted` | 0 | – |
| `fix` | 2 | RT-E1, RT-E3 |
| `obligation` | 0 | – |
| `note` | 2 | RT-E2, RT-E4 |

Alle Befunde aus Delta 1 sind aufgelöst oder als Auflage weitergereicht (OB-12, OB-14, OB-15 in `gates/obligations.md`). Baustein E trägt in Welle 1: Die Laufzeitaussagen zu Sandbox, BR-24 und dem Weg zu IPC halten. Offen sind eine Lücke im Abbruchkriterium von M-C (RT-E1) und die nicht nachgezogene Neu-laden-Beschreibung (RT-E3).

Prüfmenge: 43 erhoben (27 aus dem Diff, 16 im Vorlauf nicht gemessen), 26 gemessen, 17 nicht gemessen. Self-Check: 26 + 17 = 43.

**Verdict:** APPROVED (keine `decision`, kein `refuted`; 2 × `fix`, 2 × `note`)

---

## Status der Vorlauf-Befunde (Delta 1)

| ID | Klasse | Status | Beleg im neuen Stand |
|----|--------|--------|----------------------|
| RT-D1 | refuted | aufgelöst | Option B ist in Bedrohung 24 und in Q&A 36 sachlich richtig dargestellt: `document.cookie` wirft `SecurityError`, Anfragen sind nie same-site, Cookies ohne `SameSite`-Schutz gehen weiter mit, `Access-Control-Allow-Origin: null` lässt jedes Dokument mit `null`-Herkunft lesen, ohne diese Antwort laden nur Bilder, Styles und klassische Skripte. Q&A 36 A nennt Worker nicht mehr. N-26 ist als „entfällt (Q&A 36 = A)" geführt; im Dokument steht keine weitere Aussage zu B oder C (`grep "null\|anonyme Herkunft\|zufall.localhost"`) |
| RT-D2 | fix | aufgelöst | Bedrohung 24 und Q&A 36: bei `localhost`-Diensten keine Cookie-Rechte und keine same-site-Anfragen, aber cross-site Anfragen wie von jeder Webseite, in Chrome ohne LNA-Nachfrage, und Cookies ohne `SameSite` gehen mit |
| RT-D3 | fix | aufgelöst; am OpenSSH-Verhalten richtig und an allen Stellen gleich | SEC-14 (Diff Z. 84), Error Handling (Z. 120), Q&A 35 (Z. 388). Die Wiederholung geht erneut über den Master (`ssh.c:1681-1686`, `mux.c:2558-2559`). Ist ein Platz frei geworden, gelingt sie. Sonst lehnt der Master wieder ab (`mux.c:1444-1448`), `ssh` baut erneut eine eigene Verbindung auf, und mit `BatchMode=yes` und Passphrase-Schlüssel ohne Agent endet der zweite Anmeldeversuch mit Exit 255 → `Transport` (`ssh.rs:1109`) → `502`. Risks, NFR-3, K7 und Bedrohung 18 sagen nur „eine Wiederholung" und widersprechen dem nicht |
| RT-D4 | obligation | offen, unverändert (weitergereicht als OB-14) | `gates/obligations.md:20` |
| RT-D5 | note | nicht übernommen (protokolliert) | `gates/obligations.md:41` |
| RT-D6 | obligation | offen, unverändert (weitergereicht als OB-15) | `gates/obligations.md:21` |
| RT-D7 | fix | aufgelöst | Bedrohung 11 (Z. 93): Skripte des Bereichs geben ihre Wirkung preis (OWASP WSTG-CLNT-13) |
| RT-D8 | note | umgesetzt | SVC-8, SVC-22, Error Handling: `Killed` → `Failed` → `502`, ohne Wiederholung (`ssh.rs:1105-1108`) |
| RT-D9 | fix | aufgelöst | Research Log (Z. 362): behoben ab macOS 26 in den Systembibliotheken, Kommentare 19, 20 |
| RT-D10 | fix | aufgelöst | Assumptions (Z. 195), Research Log (Z. 354), Q&A 4 (Z. 371): offizielle Apple-Notes zu Safari 18.4, Eintrag 141166987, nur Hauptdokument |
| RT-D11 | fix | aufgelöst | Q&A 4 B: zusätzliche Sperre im Betrachter nicht belegt (Chromium security-dev 2024-09-18) |
| RT-16 | obligation | offen, verändert (weitergereicht als OB-12) | `gates/obligations.md:18` |
| RT-11 bis RT-15, RT-18, RT-19 | obligation | offen, unverändert (weitergereicht) | `gates/obligations.md` |
| RT-20 bis RT-28 | note | unverändert, protokolliert | – |

## Regression: frühere PDF-Entscheidung und „Entwurfsstand"

| Prüfung | Ergebnis |
|---------|----------|
| „PDF ohne `sandbox`" als Entscheidung | keine Stelle mehr: K8 (Z. 26), DTO-Zeile PDF (Z. 53), Trade-off (Z. 213), Assumptions (Z. 195) und Q&A 4 (Z. 371) sagen einheitlich „mit `sandbox`, nur echte PDFs"; „ohne Abschottung" steht nur noch als verworfene Option B und als widerlegte erste Antwort in Q&A 4 |
| „Entwurfsstand", „beim User" | keine Treffer im Fließtext; Open Questions enthält nur noch den Scroll-Hänger |
| Baustein E „optional" / „nach Messung" | SVC-19, K16, MIG-3, MIG-6, Neue Dateien G, Zuordnung und N-23 sind auf W1 umgestellt; ein Rest im Research Log (Z. 855) → RT-E4; die Neu-laden-Beschreibung ist nicht nachgezogen → RT-E3 |

## Baustein E in Welle 1: Laufzeit-Behauptungen

| Behauptung | Messung | Verdikt |
|------------|---------|---------|
| (a) Sandbox unverändert ohne `allow-same-origin` | `HtmlPreviewPane.tsx:35-36`: `allow-scripts allow-forms allow-popups allow-modals` für lokal und remote | bestätigt |
| (a) `fetch` auf Nachbardateien bleibt gesperrt | Das `iframe`-Dokument hat eine opake Herkunft, `fetch` an den Server ist eine CORS-Anfrage mit `Origin: null`; die Klasse `frame` sendet keine CORS-Kopfzeilen (SEC-7, VAL-2) | bestätigt: Skripte der Seite bekommen beim `fetch` einen Netzwerkfehler, Modul-Skripte laden nicht (Folgen-Tabelle nennt das) |
| (a) `frame-ancestors` der Klasse `frame` | DTO-Tabelle: `tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost`, Debug `http://localhost:1420` (= `devUrl`, `tauri.conf.json:8`). CSP3 §6.4.2.1 Schritt 6: jeder Vorfahre wird geprüft („While current is a child navigable … Let origin be the result of executing the URL parser on the ASCII serialization of document's origin"); §6.7.2.8: „If url's host is null, return "Does Not Match"" | Oberster Rahmen: ob WebKit `tauri://localhost` als host-source trifft, ist nur am Mac messbar (M-C). Verschachtelte Nachbar-HTML: Ihr Eltern-Dokument ist das opake Vorschau-Dokument, also nach Spezifikation immer gesperrt → RT-E2 |
| (a) Host-Prüfung mit `localhost`-Fallback | VAL-1 Klasse `frame`: genau `localhost:{port}`; Schnitt: `[::1]` am selben Port, belegter Port nach `TERAX.md:44` | bestätigt, stimmig |
| (b) Speicher und Cookies gesperrt | WHATWG HTML `document.cookie`: SecurityError bei opaker Herkunft (Vorlauf) | bestätigt; BR-24 gilt wörtlich |
| (b) In Remote-Vorschauen laufen neu Inline- und CDN-Skripte | Folgt daraus, dass eine per URL geladene Seite ihre eigene CSP hat und `srcdoc` die App-CSP erbt (`tauri.conf.json:28` `script-src 'self' 'wasm-unsafe-eval'`); die Vererbungsregel wurde nicht nachgelesen | NICHT GEMESSEN — Policy-Container-Regel nicht abgerufen; M-C Punkte 1 und 3 messen es |
| (b) Ein neuer Weg zu Tauri-IPC oder zum Eltern-Fenster | Im Frontend lauscht kein Code auf `message`-Ereignisse (`grep` über `src/`: nur `Channel.onmessage` in `proxyFetch.ts:98`, `pty-bridge.ts`). Dieselbe Art Rahmen gibt es heute schon: Die Web-Vorschau lädt beliebige `http`-Adressen mit `allow-scripts allow-same-origin` (`PreviewPane.tsx:115`). Bisher neu: nur, dass entfernte Inhalte im opaken Rahmen Skripte ausführen; lokale Inhalte tun das heute schon (`LOCAL_SANDBOX`). App-CSP und Capabilities bleiben unverändert (keine `remote`) | kein neuer Weg gegenüber heute (gemessen am Bestand); wie Tauri IPC-Aufrufe aus Unterrahmen behandelt, ist nicht gemessen (C-E17) |
| (c) Rückfall hinter einer Konstante, weiße Fläche ohne Meldung | Schnitt „Wenn der Rahmen nicht lädt"; SVC-19; MIG-6 | stimmig |
| (c) Abbruchkriterium M-C am Mac messbar | Ergebnis-Tabelle (Diff Z. 260-268); `Cargo.toml:22` `tauri = { version = "~2.12", features = ["protocol-asset"] }`; docs.rs tauri 2.12.5: Feature `devtools` nicht in den Standard-Features | Lücke → RT-E1 |

---

## Neue Befunde

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution |
|----|--------|-------|-----------|-------|-------|-------------|----------------------|------------|
| RT-E1 | fix | Mac-Prüfpunkte (N-23) | architecture.md (Abschnitt „Mac-Prüfung und Abbruchkriterium", Ergebnis-Tabelle) | „Weiße Fläche oder Punkt 4 rot mit `127.0.0.1`, M-B mit `localhost` grün → Fallback-Adresse `localhost` einschalten"; „Nur die verschachtelte Nachbar-HTML leer → `frame-ancestors` für die Klasse `frame` weglassen"; „Abbruch: nach diesen Anpassungen weiter weiße Fläche oder Punkt 4 rot → Konstante vor dem Merge auf aus" | Eine weiße Fläche im obersten Rahmen hat zwei mögliche Ursachen: Sperre von `http://127.0.0.1` (Mixed Content) oder ein `frame-ancestors`, das WebKit für das Eltern-Dokument `tauri://localhost` nicht trifft (CSP3 §6.4.2.1 prüft auch den obersten Vorfahren). Die Tabelle wendet „ohne `frame-ancestors`" nur an, wenn allein die verschachtelte HTML leer ist. Eine weiße oberste Fläche führt über `localhost` direkt zum Abbruch. Die Ursache ist im Release-Build nicht sichtbar: Tauri ist nur mit `protocol-asset` eingebunden (`src-tauri/Cargo.toml:22`), das Feature `devtools` gehört nicht zu den Standard-Features (docs.rs tauri 2.12.5) | code, dependency | Trifft WebKit `tauri://localhost` nicht, bleibt die Vorschau mit `127.0.0.1` und mit `localhost` weiß; das Kriterium schaltet Baustein E ab, obwohl ein Build ohne `frame-ancestors` lädt | Ergebniszeile für die weiße oberste Fläche um den Schritt „ohne `frame-ancestors`" ergänzen (Reihenfolge: `localhost`, dann ohne `frame-ancestors`, dann Abbruch), wie der Aufrufer es versteht; oder M-C mit einem Build mit Web Inspector (Feature `devtools`) ausführen, damit die Ursache in der Konsole steht |
| RT-E2 | note | Baustein E | – | DTO-Tabelle: „HTML: `frame-ancestors` mit den App-Herkünften"; M-C: „dazu eine Nachbar-HTML, die die Messseite in einem eigenen `iframe` einbettet" | CSP3 §6.4.2.1 Schritt 6 prüft jeden Vorfahren; der direkte Vorfahre einer verschachtelten Nachbar-HTML ist das opake Vorschau-Dokument; §6.7.2.8: „If url's host is null, return "Does Not Match"" | dependency (Spezifikation) | Mit der App-Herkunftsliste bleibt jede in der In-App-Vorschau verschachtelte Nachbar-HTML leer | Ergebnis absehbar: `frame-ancestors` für die Klasse `frame` gleich weglassen (das Geheimnis schützt, die Adresse kennt nur die App) oder verschachtelte HTML in der App als nicht unterstützt benennen |
| RT-E3 | fix | Kohärenz (Regression) | architecture.md (API-6, Zustände UI-3; MIG-6) | API-6: „HTML lokal neuer Asset-Zähler und erneutes `asset_allow`, HTML und Markdown über SSH erneutes `fs_read_file` … `loading` vom Klick bis HTML lokal: `load`-Ereignis des neuen `iframe`; HTML über SSH und Markdown: Antwort von `fs_read_file`"; MIG-6: „Neu-laden-Zähler in beiden Lese-Effekten (`:54-69`, `:71-93`)" | Mit Baustein E in W1 lädt HTML lokal und über SSH über den Server (SVC-19, K16). Folgen-Tabelle: „Neu laden: Neuaufbau des `iframe`; kein Zähler in der Adresse nötig (`no-store`)". API-6 beschreibt nur den Rückfall-Weg | artifact | – | API-6 und UI-3 für HTML auf den Weg mit Baustein E umstellen (Neuaufbau des `iframe`, `loading` bis zu dessen `load`-Ereignis, lokal und SSH); den bisherigen Text als Rückfall kennzeichnen; MIG-6 entsprechend |
| RT-E4 | note | Kohärenz | architecture.md (Research Log Z. 855) | „WebKit behandelt Loopback-Inhalte uneinheitlich als Mixed Content …: Baustein E nur nach Messung" | User 25.11.2026: Baustein E in W1 ohne Vorab-Messung (Q&A 29, Diff Z. 380) | artifact | – | Folgerung im Research Log auf „Abnahme über M-C" anpassen oder als überholt markieren |

Keine blockierenden Befunde, daher kein JSON-Block.

---

## Prüfmenge

### Behauptungen aus dem Diff (27)

| # | Behauptung | Beleg | Verdikt |
|---|------------|-------|---------|
| E-01 | Bedrohung 24: Darstellung von B | MDN ACAO, WHATWG `document.cookie` (Vorlauf) | bestätigt |
| E-02 | Q&A 36 B und C | wie E-01; WebKit 160504 | bestätigt |
| E-03 | N-26 entfällt | Q&A 36 = A | bestätigt |
| E-04 | SEC-14: Fehlerbild der Verweigerung und Wirkung der Wiederholung | `mux.c:1444-1448`, `:2558-2559`; `ssh.c:1681-1686`; `ssh.rs:1109`, `:1156-1162` | bestätigt |
| E-05 | Error Handling SSH-Zeile | wie E-04 | bestätigt |
| E-06 | Q&A 35 Folgen A, B, C | `pty/shell_init.rs:152` (`-tt`, kein `BatchMode`); `git/process.rs:340-344` (`BatchMode=yes`) | bestätigt |
| E-07 | Bedrohung 11, XSSI | OWASP WSTG-CLNT-13 (Vorlauf) | bestätigt |
| E-08 | Research Log zu WebKit 160504 | WebKit-Bug 160504 (Vorlauf) | bestätigt |
| E-09 | Beleg Safari 18.4 auf die offiziellen Notes | Apple Safari 18.4 Release Notes, 141166987 (Vorlauf) | bestätigt |
| E-10 | Q&A 4 B: Sperre unbelegt | Chromium security-dev 2024-09-18 (Vorlauf) | bestätigt |
| E-11 | PDF überall „mit `sandbox`" | `grep -i pdf` über `architecture.md` | bestätigt |
| E-12 | keine Reste „Entwurfsstand"/„beim User"/„nach Messung" | `grep` | bis auf Research Log Z. 855 → RT-E4 |
| E-13 | `Killed` → `Failed` | `ssh.rs:1105-1108` | bestätigt |
| E-14 | E: Speicher, Cookies, `fetch` gesperrt | `HtmlPreviewPane.tsx:35-36`; WHATWG; keine CORS-Kopfzeile | bestätigt |
| E-15 | E: remote Inline- und CDN-Skripte laufen neu | – | NICHT GEMESSEN — CSP-Vererbung bei `srcdoc` nicht abgerufen; M-C misst |
| E-16 | E: kein neuer Weg zum Eltern-Fenster | `grep` nach `message`-Lauschern; `PreviewPane.tsx:115` | bestätigt |
| E-17 | E: Tauri-IPC aus Unterrahmen | – | NICHT GEMESSEN — Tauri-Interna zur IPC-Herkunftsprüfung nicht gelesen; Bestand hat dieselbe Rahmenart |
| E-18 | E: `frame-ancestors` trifft `tauri://localhost` in WKWebView | – | NICHT GEMESSEN — nur am Mac (M-C) |
| E-19 | E: verschachtelte Nachbar-HTML unter App-Herkunftsliste | CSP3 §6.4.2.1, §6.7.2.8 | gemessen → RT-E2 |
| E-20 | M-C-Abbruchkriterium am Mac anwendbar | `Cargo.toml:22`; docs.rs tauri Features | Lücke → RT-E1 |
| E-21 | VAL-1 mit `localhost`-Fallback | VAL-1, Schnitt | bestätigt |
| E-22 | App erfährt nicht, warum der Rahmen weiß ist | opake Herkunft, kein lesbarer Inhalt | bestätigt |
| E-23 | Neu laden mit E | API-6 gegen Folgen-Tabelle | widersprüchlich → RT-E3 |
| E-24 | Debug-Herkunft `http://localhost:1420` | `tauri.conf.json:8` `devUrl` | bestätigt |
| E-25 | SEC-14: Zahl nach N-25 änderbar | Q&A 35 | bestätigt |
| E-26 | BR-24 gilt wörtlich weiter | wie E-14 | bestätigt |
| E-27 | Rückfall: `asset_allow`/`srcDoc` bleiben | SVC-19, Schnitt, MIG-6 | bestätigt |

Diff: 24 gemessen, 3 nicht gemessen (E-15, E-17, E-18).

### Im Vorlauf nicht gemessen (16)

| # | Punkt | Stand jetzt |
|---|-------|-------------|
| D-19 | B: Web-Worker gehen nicht | entfallen, Aussage gestrichen (Q&A 36) — als erledigt gezählt |
| D-21 | Chrome löst `*.localhost` auf | NICHT GEMESSEN — Chromium-Quelle nicht abgerufen; Option C verworfen |
| D-24 | Chrome 156 (Nachprüfer) | NICHT GEMESSEN — fremde Messung, kein Browserstart erlaubt |
| C-53 | `frame-ancestors 'self'` sperrt fremde Einbettung (Klasse `browser`) | gemessen: CSP3 §6.4.2.1 Schritt 6 prüft jeden Vorfahren gegen die Quellliste; eine fremde Herkunft trifft `'self'` nicht → bestätigt |
| C-18 | tauri „neueste 2.12.6" | NICHT GEMESSEN — ohne Bezug |
| C-30 | Sockets nach Absturz | NICHT GEMESSEN — Mac N-18 |
| C-49 | Safari `Sec-Fetch-Site` | NICHT GEMESSEN — WebKit-Bugs nicht abgerufen |
| C-50 | `nosniff` + `sandbox` träge Arten | NICHT GEMESSEN — Mac N-17 |
| C-51 | SVG mit Skript | NICHT GEMESSEN — Mac N-17 |
| C-55 | keine CSP an Skripten wegen Worker | NICHT GEMESSEN — CSP3-Worker-Abschnitt nicht abgerufen |
| C-56 | `no-store` → Neuladen aktuell | NICHT GEMESSEN — Mac N-3 |
| C-68 | AppKit-Monitor bei Fokus im `iframe` | NICHT GEMESSEN — Mac N-10 |
| C-69 | `127.0.0.1` gegen `localhost` im App-Rahmen | NICHT GEMESSEN — Mac M-C/N-23 |
| C-70 | keine Firewall-Nachfrage | NICHT GEMESSEN — Mac N-16 |
| C-71 | `open_url` öffnet die Adresse | NICHT GEMESSEN — Mac N-2 |
| C-72 | Port vom Betriebssystem zufällig | NICHT GEMESSEN — macOS-Portvergabe nicht nachgelesen |

Vorlauf: 2 erledigt (D-19 entfallen, C-53 gemessen), 14 nicht gemessen.

Summe: 43 erhoben, 26 gemessen (24 + 2), 17 nicht gemessen (3 + 14).

Außerhalb der Perspektive (nicht gezählt): MIG-21-Aufteilung von `run_remote_json` und Kopier-Muster `ssh.rs:1910-2054` (Perspektive `code`), INV-13-Tests.

## Rückgabe

```
VERDICT: APPROVED
BLOCKING_ISSUES: []
FIX_ITEMS: [RT-E1 Abbruchkriterium M-C: bei weißer oberster Fläche nach localhost auch „ohne frame-ancestors" prüfen, erst dann Abbruch; oder M-C mit Web Inspector (Feature devtools) | RT-E3 API-6/UI-3 und MIG-6: Neu laden für HTML mit Baustein E = Neuaufbau des iframe, loading bis zum load-Ereignis, lokal und SSH; bisheriger Text als Rückfall]
OBLIGATIONS: [unverändert weitergereicht: OB-12 (RT-16), OB-14 (RT-D4), OB-15 (RT-D6), RT-11 bis RT-15, RT-18, RT-19]
DATA_TYPE_VERDICTS: [unverändert aus Vorlauf und Delta 1]
PATTERN_CONSISTENCY: [N/A — kein codebase-scan.md]
BINDINGS_COVERAGE: [N/A — keine bindings.md]
RECOMMENDATIONS: [RT-E2 verschachtelte Nachbar-HTML in der App ist mit der App-Herkunftsliste nach CSP3 immer gesperrt; frame-ancestors für Klasse frame gleich weglassen oder Grenze benennen | RT-E4 Research Log „Baustein E nur nach Messung" anpassen | RT-D5 und RT-20 bis RT-28 protokolliert]
CLAIMS: {erhoben: 43, gemessen: 26, nicht_gemessen: 17}
```

## Quellen außerhalb des Repos

- W3C CSP3 Editor's Draft, §6.4.2.1 `frame-ancestors` Navigation Response Check, §6.7.2.8: https://w3c.github.io/webappsec-csp/
- docs.rs tauri 2.12.5 Features (`devtools` nicht Standard): https://docs.rs/crate/tauri/2.12.5/features
- OpenSSH-portable `mux.c`, `ssh.c` (master): https://raw.githubusercontent.com/openssh/openssh-portable/master/mux.c, …/ssh.c
- übrige Quellen wie im Vorlauf (MDN ACAO, WHATWG HTML, WebKit-Bug 160504, Apple Safari 18.4 Release Notes, Chromium security-dev, OWASP WSTG-CLNT-13)
