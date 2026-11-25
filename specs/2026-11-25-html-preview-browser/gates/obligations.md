# Auflagen aus Gate 1: Vorschau im Browser öffnen

Auflagen für Bau und QA. Quelle sind die `obligation`-Befunde der Gate-1-Perspektiven `code` und `runtime` samt ihrer Delta-Läufe (Stand 2026-11-25). Auflagen werden nicht in `architecture.md` zurückgeschrieben; sie gehen in den Bauplan, in den Brief des zuständigen Slices und in die Mac-Checkliste.

| ID | Auflage | Nachweis | Ziel-Schritt | Quelle |
|----|---------|----------|--------------|--------|
| OB-1 | Das SSH-Lesen des Servers läuft auf einem Blocking-Thread (der Aufruf in `ssh.rs:1142-1209` ist synchron, Vorbild `file.rs:162-166`); die App bleibt bei mehreren wartenden SSH-Lesevorgängen ansprechbar | Test: Lesevorgang über blockierenden Ersatz-Host hält die Laufzeit nicht an | Implementierung | code O-1 |
| OB-2 | `clippy -D warnings` läuft auf Linux ohne Warnung aus dem Esc-Monitor (Muster `_text` in `lib.rs:163`); auf Windows vergleichen `within`/`opened_path` über `fs::to_canon`, Symlink-Tests stehen unter `cfg(unix)` | Clippy im Prüfabbild Exit 0; Windows nur per Review der `cfg`-Zweige | Implementierung | code O-2 |
| OB-3 | Das Home wird lokal auf demselben Weg aufgelöst wie die Bezugsdatei: bei einem verlinkten Home-Ordner ergibt eine Datei direkt darin trotzdem „nur die Datei" | Test mit Symlink auf das Home; QA am Mac | Implementierung, QA | code O-3 |
| OB-4 | Der Esc-Monitor reagiert nur auf Ereignisse des Hauptfensters (der lokale Monitor meldet alle Fenster, `lib.rs:128`; es gibt ein Settings-Fenster, `lib.rs:357`): Esc im Einstellungsfenster beendet Zen nicht | QA am Mac | Implementierung, QA | code O-4 |
| OB-5 | Der Sandbox-Test der HTML-Vorschau liest die Konstanten (`HtmlPreviewPane.tsx:35-36`) und nicht ein wörtliches `sandbox="…"`: er wird rot, sobald `allow-same-origin` an eine Stelle kommt, an der die Architektur es ausschließt | Test mit roter Gegenprobe | Implementierung | code O-5 |
| OB-6 | Der Helfer-Test dekodiert die Fehlerantwort über dieselbe Rust-Funktion wie `read_bytes_typed` und erwartet `Missing`, `NotRegularFile`, `TooLarge` (Vorbild `parse_read_bytes` `ssh.rs:2407`, Konstanten-Abgleich `ssh.rs:2462-2467`): ein umbenanntes Literal auf einer Seite macht den Test rot | Test mit roter Gegenprobe | Implementierung | code-Delta O-6 |
| OB-7 | Die Query wird abgetrennt, bevor der Pfad dekodiert wird | Test mit `?` im kodierten Pfad | Implementierung | runtime RT-11 |
| OB-8 | Ein dekodiertes `%2F` in einem Segment wird abgewiesen | Test | Implementierung | runtime RT-12 |
| OB-9 | Der Zeichensatz für den kodierten Dateinamen im Link ist festgelegt; Umlaute und Leerzeichen im Dateinamen ergeben einen Link, der die Datei ausliefert | Test mit Umlaut und Leerzeichen | Implementierung | runtime RT-13 |
| OB-10 | Andere Methoden als GET/HEAD ergeben 405 mit `Allow`; fehlender oder doppelter `Host` ergibt 400; zu viele Kopfzeilen ergeben 431 | Tests am echten Socket | Implementierung | runtime RT-14 |
| OB-11 | Die Verbindung wird mit Halbschluss abgebaut: die Antwort kommt vollständig an, auch wenn der Client noch sendet | Test am echten Socket | Implementierung | runtime RT-15 |
| OB-12 | Die Wartezeit auf den Lese-Platz eines Hosts ist begrenzt und endet mit 504. Bei einem Lesevorgang je Host (User-Entscheid Q&A 35) wird die Frist je Datei bzw. am Fortschritt der Reihe gemessen, nicht als Gesamtfrist; ein hängender Lesevorgang blockiert den einzigen Platz des Hosts nicht 244 s lang für alle Links (`ssh.rs:1506-1509`) | Test mit blockiertem Ersatz-Host: die wartende Datei bekommt nach der Grenze 504, die nächste lädt nach Freigabe | Implementierung | runtime RT-16, Delta |
| OB-13 | Fehler des SSH-Helfers werden über die feste Art auf 403 bzw. 404 abgebildet, nicht über Textvergleich | Tests je Fehlerart über Ersatz-Host | Implementierung | runtime RT-17 |
| OB-14 | Scheitert ein Lesevorgang, weil der Server die Sitzung ablehnt, nennt die Meldung den Grund (Sitzungsgrenze des Servers) und nicht den Anmelde-Hinweis „open a terminal first" | Test über Ersatz-Host mit dem Text „Session open refused by peer" | Implementierung | runtime-Delta RT-D4 |
| OB-15 | `/{token}` ohne abschließenden Schrägstrich ergibt 404; nichts wird unter falscher Basis-Adresse ausgeliefert | Test am echten Socket | Implementierung | runtime-Delta RT-D6 |
| OB-16 | Welle 2: Rohes HTML in Markdown wird als Text ausgegeben, nicht roh durchgereicht | Test mit `<script>` im Markdown | Implementierung | runtime RT-18 |
| OB-17 | Welle 2: Bilder im gerenderten Markdown laden unter der Abschottungs-Kopfzeile in Safari und Chrome | QA am Mac | QA | runtime RT-19 |
| OB-18 | Mit Baustein E baut „Neu laden" in der HTML-Vorschau den Rahmen neu auf; der Zustand `loading` gilt bis zum `load`-Ereignis des Rahmens, lokal und über SSH (die Architektur beschreibt in API-6/UI-3 nur den Rückfall-Weg) | Test: nach Klick auf Neu laden entsteht ein neuer Rahmen, `loading` endet mit `load` | Implementierung | runtime-Delta2 RT-E3 |
| OB-19 | Abbruchkriterium M-C am Mac: bleibt die oberste Vorschau-Fläche über den Mini-Server weiß, wird nach dem `localhost`-Fallback auch die Variante ohne `frame-ancestors` geprüft, erst danach die Konstante auf aus gestellt. Die Ursache ist im Release-Build nicht sichtbar (Tauri-Feature `devtools` fehlt, `Cargo.toml:22`); gemessen wird im Debug-Build oder mit Web Inspector | QA am Mac, Ergebnis in den PR | QA | runtime-Delta2 RT-E1 |

## Hinweise ohne Handlungspflicht (Protokoll, keine Kennungen)

- code N-1: Neu laden in der Raw-Ansicht über das vorhandene `EditorPaneHandle.reload()` (`EditorPane.tsx:58-59`, `:352`) statt Neuaufbau über einen Schlüssel.
- code N-2: Mit `expected_size: None` hat jede SSH-Lesung ein Budget von 244 s (`ssh.rs:1506-1509`, `:897-909`); deckt sich mit OB-12.
- code N-3: Restrisiko über SSH: zwischen `realpath` und `open` im Helfer (`ssh.rs:399-403`) wird das geöffnete Ziel nicht erneut geprüft.
- code N-4: Der Guard aus Bedrohung 21 sollte auch `capabilities/desktop.json` prüfen.
- code N-5: SVG öffnet im Editor-Tab als Code, deshalb keine Kopfzeile; „Open in Browser" für SVG nur im Explorer.
- code N-6: Der Anker `ssh.rs:2364` zeigt auf `run_helper`; der Symlink-Test steht bei `ssh.rs:2425`.
- runtime RT-20: `open_url` braucht `None::<&str>`.
- runtime RT-21: Die Adresse mit Geheimnis steht in der Argumentliste von `/usr/bin/open` und ist für Prozesse desselben Users lesbar.
- runtime RT-22: Anfragen in absolute-form bewusst mit 400 abweisen.
- runtime RT-23: `Date`-Kopf optional. RT-24: `charset=utf-8` für Text-Arten erwägen.
- runtime RT-25: `img-src` in der Abschottungs-Kopfzeile ist eine eigene Ergänzung, nicht das Upstream-Muster.
- runtime RT-26: Verbindungsplätze erst nach gültigem Geheimnis zählen, sonst kann eine fremde Seite in Safari sie belegen.
- runtime RT-27: Chrome plant Local Network Access auch für lokale Server gegenüber `localhost`.
- runtime RT-28: pulldown-cmark ist aktuell 0.13.6.
- runtime-Delta RT-D5: Für `read_bytes_typed` `ControlMaster=no`/`ProxyCommand=false` erwägen, damit eine abgelehnte Sitzung nicht still eine eigene Verbindung aufbaut.
- runtime-Delta2 RT-E2: Eine verschachtelte Nachbar-HTML (Seite bettet eine zweite Seite des Ordners per `iframe` ein) ist in der App-Vorschau nach CSP3 mit der App-Herkunftsliste immer gesperrt; im Browser nicht.
- runtime-Delta2 RT-E4: Research Log der Architektur nennt noch „Baustein E nur nach Messung".
- runtime-Delta2: In der App-Vorschau scheitert `fetch` der Seite auf Nachbardateien weiter (Sandbox ohne `allow-same-origin`, Anfrage mit `Origin: null` ohne CORS-Freigabe); das entspricht BR-24. Wie Tauri IPC-Aufrufe aus Unterrahmen prüft, ist nicht gemessen.
