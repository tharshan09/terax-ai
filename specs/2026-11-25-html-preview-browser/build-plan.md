# Bauplan: Vorschau im Browser öffnen (Mini-Server) und Vorschau in der App, Welle 1

| Key | Value |
|-----|-------|
| **Spec** | `/home/claude/litha/produkte/terax/terax-ai/specs/2026-11-25-html-preview-browser` |
| **Issue** | -- |
| **Stand** | `cf07327e6d54231429cb8a75b1dcac8f1deca802` |
| **Stack** | TypeScript (React 19, Vite, Vitest/jsdom) und Rust (Tauri 2, `src-tauri/`) |

## Anforderungen

| ID | Slice | Nachweis |
|----|-------|----------|
| BR-1 | slice-01-preview-server | AC |
| BR-2 | slice-01-preview-server | AC |
| BR-3 | slice-01-preview-server | AC |
| BR-4 | slice-01-preview-server | AC |
| BR-5 | slice-01-preview-server | AC |
| BR-6 | slice-01-preview-server | AC |
| BR-7 | slice-04-preview-surfaces | AC |
| BR-8 | slice-01-preview-server | AC |
| BR-9 | slice-01-preview-server | AC |
| BR-10 | slice-01-preview-server | AC |
| BR-11 | slice-01-preview-server | AC |
| BR-12 | slice-01-preview-server | AC |
| BR-13 | slice-02-ssh-read-esc-monitor | AC |
| BR-14 | slice-01-preview-server | AC |
| BR-15 | slice-01-preview-server | AC |
| BR-16 | slice-04-preview-surfaces | AC |
| BR-17 | nach dem Merge | -- |
| BR-18 | slice-03-zen-swipe | AC |
| BR-19 | slice-03-zen-swipe | AC |
| BR-20 | slice-03-zen-swipe | AC |
| BR-21 | slice-04-preview-surfaces | AC |
| BR-22 | slice-04-preview-surfaces | AC |
| BR-23 | slice-04-preview-surfaces | AC |
| BR-24 | slice-04-preview-surfaces | AC |
| BR-25 | slice-04-preview-surfaces | AC |
| FL-1 | slice-04-preview-surfaces | AC |
| FL-2 | slice-01-preview-server | AC |
| FL-3 | slice-01-preview-server | AC |
| FL-4 | slice-04-preview-surfaces | AC |
| FL-5 | slice-03-zen-swipe | AC |
| FL-6 | slice-03-zen-swipe | AC |
| FL-7 | slice-03-zen-swipe | AC |
| FL-8 | nach dem Merge | -- |
| EP-1 | slice-01-preview-server | AC |
| EP-2 | slice-01-preview-server | AC |
| EP-3 | slice-01-preview-server | AC |
| EP-4 | slice-01-preview-server | AC |
| EP-5 | slice-01-preview-server | AC |
| EP-6 | slice-04-preview-surfaces | AC |
| UI-1 | slice-04-preview-surfaces | AC |
| UI-2 | slice-04-preview-surfaces | AC |
| UI-3 | slice-04-preview-surfaces | AC |
| UI-4 | slice-03-zen-swipe | AC |
| UI-5 | slice-04-preview-surfaces | AC |
| ST-1 | slice-01-preview-server | AC |
| ST-2 | slice-01-preview-server | AC |
| ST-3 | slice-03-zen-swipe | AC |
| ST-4 | slice-03-zen-swipe | AC |
| TR-1 | slice-01-preview-server | AC |
| TR-2 | slice-01-preview-server | AC |
| TR-3 | slice-03-zen-swipe | AC |
| TR-4 | slice-03-zen-swipe | AC |
| DF-1 | slice-01-preview-server | AC |
| DF-2 | slice-01-preview-server | AC |
| DF-3 | slice-01-preview-server | AC |
| DF-4 | slice-01-preview-server | AC |
| TG-1 | slice-04-preview-surfaces | AC |
| TG-2 | slice-04-preview-surfaces | AC |
| TG-3 | slice-01-preview-server | AC |
| TG-4 | slice-01-preview-server | AC |
| TG-5 | slice-04-preview-surfaces | AC |
| TG-6 | slice-03-zen-swipe | AC |
| TG-7 | slice-03-zen-swipe | AC |
| TG-8 | slice-04-preview-surfaces | AC |
| API-1 | slice-01-preview-server | AC |
| API-2 | slice-01-preview-server | AC |
| API-3 | slice-02-ssh-read-esc-monitor | AC |
| API-4 | slice-03-zen-swipe | AC |
| API-5 | slice-04-preview-surfaces | AC |
| API-6 | slice-04-preview-surfaces | AC |
| API-7 | slice-03-zen-swipe | AC |
| API-8 | slice-01-preview-server | AC |
| API-9 | slice-01-preview-server | AC |
| SVC-1 | slice-01-preview-server | AC |
| SVC-2 | slice-01-preview-server | AC |
| SVC-3 | slice-01-preview-server | AC |
| SVC-4 | slice-01-preview-server | AC |
| SVC-5 | slice-01-preview-server | AC |
| SVC-6 | slice-01-preview-server | AC |
| SVC-7 | slice-01-preview-server | AC |
| SVC-8 | slice-01-preview-server | AC |
| SVC-9 | slice-01-preview-server | AC |
| SVC-10 | slice-01-preview-server | AC |
| SVC-11 | slice-01-preview-server | AC |
| SVC-12 | slice-04-preview-surfaces | AC |
| SVC-13 | slice-04-preview-surfaces | AC |
| SVC-14 | slice-04-preview-surfaces | AC |
| SVC-15 | slice-03-zen-swipe | AC |
| SVC-16 | slice-03-zen-swipe | AC |
| SVC-17 | slice-03-zen-swipe | AC |
| SVC-18 | slice-02-ssh-read-esc-monitor | AC |
| SVC-19 | slice-04-preview-surfaces | AC |
| SVC-20 | nach dem Merge | -- |
| SVC-21 | slice-01-preview-server | AC |
| SVC-22 | slice-02-ssh-read-esc-monitor | AC |
| VAL-1 | slice-01-preview-server | AC |
| VAL-2 | slice-01-preview-server | AC |
| VAL-3 | slice-01-preview-server | AC |
| VAL-4 | slice-01-preview-server | AC |
| VAL-5 | slice-01-preview-server | AC |
| VAL-6 | slice-01-preview-server | AC |
| VAL-7 | slice-01-preview-server | AC |
| VAL-8 | slice-01-preview-server | AC |
| VAL-9 | slice-01-preview-server | AC |
| VAL-10 | slice-01-preview-server | AC |
| VAL-11 | slice-01-preview-server | AC |
| SEC-1 | slice-01-preview-server | AC |
| SEC-2 | slice-01-preview-server | AC |
| SEC-3 | slice-04-preview-surfaces | AC |
| SEC-4 | slice-01-preview-server | AC |
| SEC-5 | slice-01-preview-server | AC |
| SEC-6 | slice-01-preview-server | AC |
| SEC-7 | slice-01-preview-server | AC |
| SEC-8 | slice-04-preview-surfaces | AC |
| SEC-9 | slice-04-preview-surfaces | AC |
| SEC-10 | slice-01-preview-server | AC |
| SEC-11 | slice-01-preview-server | AC |
| SEC-12 | slice-01-preview-server | AC |
| SEC-13 | slice-01-preview-server | AC |
| SEC-14 | slice-01-preview-server | AC |
| SEC-15 | slice-01-preview-server | AC |
| SEC-16 | slice-01-preview-server | AC |
| NFR-1 | slice-01-preview-server | AC |
| NFR-2 | slice-00-contracts | Deliverable |
| NFR-3 | slice-01-preview-server | AC |
| NFR-4 | slice-01-preview-server | AC |
| NFR-5 | slice-01-preview-server | AC |
| NFR-6 | slice-02-ssh-read-esc-monitor | AC |
| NFR-7 | slice-01-preview-server | Deliverable |
| NFR-8 | slice-04-preview-surfaces | AC |
| MIG-1 | slice-00-contracts | Deliverable |
| MIG-2 | slice-00-contracts | Deliverable |
| MIG-3 | slice-00-contracts | Deliverable |
| MIG-4 | slice-01-preview-server | AC |
| MIG-5 | slice-04-preview-surfaces | AC |
| MIG-6 | slice-04-preview-surfaces | AC |
| MIG-7 | slice-04-preview-surfaces | AC |
| MIG-8 | slice-04-preview-surfaces | AC |
| MIG-9 | slice-04-preview-surfaces | AC |
| MIG-10 | slice-03-zen-swipe | AC |
| MIG-11 | slice-03-zen-swipe | Deliverable |
| MIG-12 | slice-03-zen-swipe | AC |
| MIG-13 | slice-03-zen-swipe | AC |
| MIG-14 | slice-03-zen-swipe | AC |
| MIG-15 | slice-04-preview-surfaces | AC |
| MIG-16 | slice-00-contracts | Deliverable |
| MIG-17 | slice-03-zen-swipe | Deliverable |
| MIG-18 | slice-03-zen-swipe | Deliverable |
| MIG-19 | slice-03-zen-swipe | Deliverable |
| MIG-20 | slice-03-zen-swipe | AC |
| MIG-21 | slice-02-ssh-read-esc-monitor | AC |
| INV-1 | -- | -- |
| INV-2 | -- | -- |
| INV-3 | -- | -- |
| INV-4 | -- | -- |
| INV-5 | -- | -- |
| INV-6 | -- | -- |
| INV-7 | -- | -- |
| INV-8 | -- | -- |
| INV-9 | -- | -- |
| INV-10 | -- | -- |
| INV-11 | -- | -- |
| INV-12 | -- | -- |
| INV-13 | -- | -- |
| OB-1 | slice-01-preview-server | AC |
| OB-2 | slice-02-ssh-read-esc-monitor | AC |
| OB-3 | slice-01-preview-server | AC |
| OB-4 | slice-02-ssh-read-esc-monitor | AC |
| OB-5 | slice-04-preview-surfaces | AC |
| OB-6 | slice-02-ssh-read-esc-monitor | AC |
| OB-7 | slice-01-preview-server | AC |
| OB-8 | slice-01-preview-server | AC |
| OB-9 | slice-01-preview-server | AC |
| OB-10 | slice-01-preview-server | AC |
| OB-11 | slice-01-preview-server | AC |
| OB-12 | slice-01-preview-server | AC |
| OB-13 | slice-01-preview-server | AC |
| OB-14 | slice-02-ssh-read-esc-monitor | AC |
| OB-15 | slice-01-preview-server | AC |
| OB-16 | nach dem Merge | -- |
| OB-17 | nach dem Merge | -- |
| OB-18 | slice-04-preview-surfaces | AC |
| OB-19 | -- | -- |

## Entscheidungen ohne Vorgabe

- Offen: Für welche Bilddateien es „Open in Browser" gibt (Taste in der Kopfzeile und Eintrag im Explorer-Menü) · Wahl: `png`, `jpg`, `jpeg`, `gif`, `webp`, `ico` und `svg`, also genau die Bildarten, die Terax heute schon als Bild anzeigt; dazu `html`, `htm` und `pdf` · Grund: die Architektur sagt nur „Rasterbilder" (SVC-12); die Liste folgt der Bild-Vorschau des Editors (`src/modules/editor/lib/binaryPreview.ts:5-13`) · Alternative: zusätzlich `avif` und `bmp`; dann bietet das Explorer-Menü den Eintrag auch für Bilder an, die Terax selbst nur als „Binary file" zeigt (als Nachbardatei einer HTML-Seite liefert der Server beide Arten in jedem Fall aus) · Wirkung: fachlich · Anforderungen: SVC-12, SVC-5, BR-9, BR-25, UI-1, UI-5 · entschieden: User, 25.11.2026
- Offen: Was die HTML-Vorschau in Terax zeigt, wenn der Mini-Server die Datei für die Vorschau ablehnt oder nicht liefern kann (zum Beispiel eine Datei in einem geschützten Ordner wie `.aws`, eine lokale HTML-Datei über 10 MB, 256 offene Links, SSH-Server nicht erreichbar) · Wahl: diese eine Vorschau lädt auf dem heutigen Weg (lokal über das Asset-Protokoll, über SSH als Text ohne Nachbardateien), genau wie bei ausgeschalteter Konstante · Grund: die Architektur regelt nur den Fall „Rahmen bleibt weiß" (Konstante vor dem Merge), nicht die Antworten `refused`, `too_large`, `unreachable` und `limit_reached` von `preview_frame_source`; so zeigt die App nie weniger als heute · Alternative: eine Meldung statt der Vorschau; eine lokale HTML-Datei über 10 MB oder in einem geschützten Ordner wäre dann in der App nicht mehr zu sehen · Wirkung: fachlich · Anforderungen: SVC-19, API-8, BR-7, BR-24 · entschieden: User, 25.11.2026
- Offen: Wie lange eine Datei über SSH auf den einzigen Lese-Platz ihres Servers wartet und wie lange ein hängender Lesevorgang diesen Platz hält (Auflage OB-12, Befund PR-01) · Wahl: eine wartende Datei wartet höchstens 30 Sekunden ohne Fortschritt; jeder fertige Lesevorgang dieses Servers startet die Frist neu; danach bekommt der Browser für diese Datei die Textseite „Terax could not read {name} from {host}: timed out" (`504`). Der Mini-Server bricht jeden SSH-Lesevorgang nach 60 Sekunden ab (Antwort `504` mit demselben Text); ein Hänger hält den Platz also höchstens 60 s, danach laden die übrigen Dateien dieses Servers wieder. Das heutige Lesen im Editor (`read_bytes`, `fs_read_remote_image`) behält sein Budget · Grund: ein Lesevorgang je Server (Q&A 35) steht fest; OB-12 schließt aus, dass ein Hänger den Platz bis zum Budget von `read_bytes` (bis 244 s bei 10 MiB, `ssh.rs:1506-1509`, `:902-908`) blockiert · Alternative: Budget wie `read_bytes` (bis 244 s); dann fehlen bei einem Hänger bis zu vier Minuten alle übrigen Dateien dieses Servers · Wirkung: fachlich · Anforderungen: OB-12, SEC-14, SEC-16, NFR-3 · weicht ab: SEC-16 · entschieden: User, 25.11.2026 (Abbruch nach 60 s; hingenommen: eine große Datei über eine sehr langsame Leitung lädt nicht)
- Offen: Wortlaut des Grunds, wenn der SSH-Server eine weitere Sitzung ablehnt (Auflage OB-14); der Text erscheint auf der Fehlerseite im Browser und im Toast · Wahl: „the SSH server refused another session (MaxSessions limit)" · Grund: OB-14 verlangt nur, dass der Grund die Sitzungsgrenze des Servers nennt statt des Anmelde-Hinweises „open a terminal first" · Alternative: der rohe Fehlertext von `ssh` · Wirkung: fachlich · Anforderungen: OB-14, NFR-4, EP-6 · entschieden: User, 25.11.2026
- Offen: Welcher Grund im Toast „{name} can't be opened in the browser: {reason}" steht (Antwort `refused`) und was ein abgebrochener Aufruf zeigt · Wahl: der Text der Sperrliste ohne das vorangestellte „refused: " (zum Beispiel „path is inside a protected directory (.ssh)"), bei `.git` „path is inside a .git folder", bei einer unechten PDF „not a real PDF"; ein abgebrochener Aufruf (Fehler statt Antwort) zeigt „Could not open the browser: {Fehlertext}" · Grund: Q&A 11 legt nur die Vorlagen fest; die Sperrliste hat schon verständliche Texte (`src-tauri/src/modules/fs/guard.rs:172-207`) · Alternative: ein fester Grund „blocked by Terax" ohne Einzelheit · Wirkung: fachlich · Anforderungen: SVC-13, VAL-7, VAL-9, EP-6 · entschieden: User, 25.11.2026
- Offen: Wie die Fehlerseite im Browser aussieht, wenn eine Datei über SSH nicht lesbar ist · Wahl: `{name}` ist der Dateiname der angefragten Datei (letztes Pfadsegment), `{host}` der SSH-Host der Freigabe; die Seite ist reiner Text (`text/plain; charset=utf-8`) mit denselben Schutz-Kopfzeilen wie Bilder (Abschottung, `nosniff`, `no-store`, `no-referrer`) · Grund: die Fehlertabelle der Architektur nennt nur den Wortlaut; die Seite gibt einen Teil der Adresse wieder und darf nie als HTML laufen · Alternative: der relative Pfad im Ordner statt des Dateinamens · Wirkung: fachlich · Anforderungen: NFR-4, SEC-7, SVC-8 · entschieden: User, 25.11.2026
- Offen: Wie beim Klick „Open in Browser" eine Datei über SSH auf die 10-MB-Grenze geprüft wird · Wahl: nach dem Auflösen des Pfads (`ssh::realpath`) eine Größenabfrage (`ssh::stat`) auf das aufgelöste Ziel; über 10 MB kommt der Toast „{name} is larger than 10 MB and can't be opened in the browser.", scheitert eine der beiden Abfragen, der Toast „Could not read {name} from {host}: {reason}"; die PDF-Echtheit prüft über SSH erst jede Anfrage des Browsers · Grund: API-1 nennt die Größenprüfung, aber keinen Weg über SSH · Alternative: keine Größenprüfung beim Klick über SSH; dann öffnet sich der Browser und zeigt die Textseite „Larger than 10 MB" · Wirkung: fachlich · Anforderungen: API-1, VAL-8, BR-12, EP-6 · entschieden: User, 25.11.2026
- Offen: Name der Zen-Taste · Wahl: Tooltip und Name „Toggle zen mode" mit dem Kürzel aus den Einstellungen, wie der bestehende Befehl `view.zenMode` (`src/modules/shortcuts/shortcuts.ts:317-321`); ob Zen an ist, zeigt die Taste über `aria-pressed` · Grund: Discovery und Architektur nennen nur „Zen" · Alternative: „Zen" · Wirkung: fachlich · Anforderungen: UI-4 · entschieden: User, 25.11.2026
- Offen: Antwort bei fehlender oder doppelter `Host`-Kopfzeile · Wahl: `400` nach Auflage OB-10 (wie RFC 9112 §3.2); `421` bleibt für einen falschen Wert · Grund: VAL-1 und Sicherheitsmodell Zeile 5 nennen für den fehlenden Host `421`, die spätere Auflage OB-10 `400` · Alternative: `421` wie VAL-1 · Wirkung: technisch · Anforderungen: VAL-1, OB-10 · weicht ab: VAL-1
- Offen: Wo die 60-s-Grenze des SSH-Lesens technisch sitzt (Befund PR-01) · Wahl: als vierter Parameter `budget` von `ssh::read_bytes_typed` an Stelle der erwarteten Größe; der Mini-Server (slice-01-preview-server) übergibt den Wert `ssh_read_budget` aus seiner Grenzen-Struktur (60 s); `read_bytes_typed` (slice-02-ssh-read-esc-monitor) gibt genau dieses Budget an `wait_child` (`ssh.rs:999-1028`), das den `ssh`-Prozess danach beendet, und meldet `TimedOut`; der Server antwortet `504` und gibt den Platz des Hosts frei, sobald der Leser zurückkehrt · Grund: nur ein beendeter Prozess gibt die Sitzung am Server wirklich frei; ein Abbruch nur im Server ließe den `ssh`-Prozess weiterlaufen, und der nächste Lesevorgang wäre eine zweite Sitzung desselben Hosts (gegen SEC-14) · Alternative: Zeitgrenze nur im Server um den Blocking-Thread · Wirkung: technisch · Anforderungen: SEC-16, SVC-8, SVC-22, OB-12 · weicht ab: SVC-8, SVC-22
- Offen: Wie der MaxSessions-Grund aus OB-14 den Toast beim Klick über SSH erreicht (Befund PR-02) · Wahl: `ssh::realpath_typed` und `ssh::stat_typed` (Vertrag aus Slice-00, gebaut in slice-02-ssh-read-esc-monitor) laufen über dieselbe Ausführung und dieselbe Einordnung wie `read_bytes_typed`; der Klick und das Home des Hosts nutzen sie an Stelle von `ssh::realpath` und `ssh::stat` (gilt auch für die Zeile zur Größenprüfung beim Klick über SSH); `classify_ssh_error` bleibt für alle übrigen Aufrufer unverändert · Grund: `realpath` und `stat` laufen über `run_remote_json`, `read_envelope`, `exit_error` und `classify_ssh_error` (`ssh.rs:1465-1472`, `:1540-1547`, `:1213-1220`, `:1092-1115`, `:950-960`) und machen aus „Permission denied" den Anmelde-Hinweis · Alternative: die Aussage „und im Toast" streichen und den Anmelde-Hinweis im Toast als Entscheidung führen · Wirkung: technisch · Anforderungen: OB-14, API-1, SVC-2 · weicht ab: API-1, SVC-2
- Offen: Was mit einer Fehlermeldung des Openers geschieht, die die Eintritts-Adresse enthält (Auflage PR-07: Geheimnis nie in einem Toast) · Wahl: der Server ersetzt im Grund von `open_failed` jedes Vorkommen der Eintritts-Adresse durch `<link>`, bevor er antwortet; die Vorlage „Could not open the browser: {reason}" bleibt · Grund: ein Opener-Fehler kann die gestartete Kommandozeile samt Adresse nennen; `BrowserOpen` darf laut DTO-Tabelle nie Adresse oder Geheimnis tragen · Alternative: fester Grund ohne den Fehlertext des Openers · Wirkung: technisch · Anforderungen: SVC-11, SEC-1, SEC-8
- Offen: Grenze „zu viele Kopfzeilen" (OB-10) · Wahl: höchstens 64 Kopfzeilen je Anfrage, mehr ergibt `431` · Grund: OB-10 nennt keine Zahl; Browser schicken rund 15 · Alternative: 100 · Wirkung: technisch · Anforderungen: OB-10, SEC-13
- Offen: Zeichensatz des Dateinamens in der Eintritts-Adresse (OB-9) · Wahl: UTF-8, jedes Byte außer `A-Z`, `a-z`, `0-9`, `-`, `.`, `_`, `~` prozentkodiert (Leerzeichen `%20`, `ä` `%C3%A4`) · Grund: OB-9 verlangt eine Festlegung; die Menge entspricht den „unreserved" Zeichen aus RFC 3986 · Alternative: nur Leerzeichen, `%`, `?` und `#` kodieren · Wirkung: technisch · Anforderungen: OB-9, DF-1
- Offen: Pause vor der einen Wiederholung nach `Unreachable` (SEC-14) · Wahl: 250 ms · Grund: SEC-14 sagt nur „kurze Pause" · Alternative: 1 s · Wirkung: technisch · Anforderungen: SEC-14
- Offen: Anfragen in absolute-form (`GET http://127.0.0.1:{p}/…`) · Wahl: `400` (Hinweis RT-22 aus Gate 1) · Grund: Browser schicken an einen Ursprungs-Server nur die Pfad-Form · Alternative: Host aus der Anfrage-Zeile übernehmen · Wirkung: technisch · Anforderungen: VAL-3, SEC-10
- Offen: Wie Tests die Zeitgrenzen des Servers prüfen · Wahl: alle Zeiten (Kopf, Schreiben, Wartegrenze, Wiederholungs-Pause) sind Felder einer Grenzen-Struktur; der Betrieb nutzt die Architektur-Werte, Tests verkürzen sie auf Millisekunden · Grund: 10 s und 30 s je Testfall verlängern den seriellen Rust-Lauf · Alternative: echte Zeiten in Tests · Wirkung: technisch · Anforderungen: SEC-13, SEC-15, OB-12
- Offen: Wie die Varianten der Mac-Messung M-C ohne Umbau entstehen (OB-19) · Wahl: zwei Konstanten im Rust-Kern: Fallback-Adresse `localhost` für die Klasse `frame` (aus) und `frame-ancestors` an der Klasse `frame` (an); Umstellen ist je eine Zeile, beide Varianten haben Tests · Grund: die Architektur beschreibt die Folge-Schritte von M-C, nennt aber keinen Schalter · Alternative: die Varianten erst bei Bedarf bauen · Wirkung: technisch · Anforderungen: API-8, VAL-1, SVC-6
- Offen: Schalter des Esc-Monitors auf Linux und Windows · Wahl: `zen_escape_arm` setzt einen plattformneutralen Schalter, den nur der macOS-Monitor liest; die Entscheidung (Taste, Modifier, Schalter, Fenster) ist eine öffentliche reine Funktion außerhalb von `cfg` · Grund: so ist die Logik auf Linux testbar und Clippy warnt nicht (OB-2); nach außen tut der Command auf anderen Plattformen weiter nichts (API-3) · Alternative: Schalter nur unter `cfg(target_os = "macos")`; dann ist auf Linux nichts davon testbar · Wirkung: technisch · Anforderungen: API-3, SVC-18, OB-2, OB-4
- Offen: Test-Anker in Rust · Wahl: Rust-Testfunktionen beginnen mit `ac<n>_` (zum Beispiel `ac7_rejects_a_dotdot_segment`), weil Rust-Namen keine Klammern erlauben; Vitest-Tests tragen `[AC-n]` im Namen · Grund: Regel 13 der Vorlage · Alternative: Anker nur im Doc-Kommentar · Wirkung: technisch · Anforderungen: NFR-7
- Offen: Reihenfolge der Rust-Slices · Wahl: slice-02-ssh-read-esc-monitor startet erst nach dem Merge von slice-01-preview-server; der Code-Bezug ist die Linux-Prüfung (Clippy, volle Suite) über den ganzen Kern samt Esc-Monitor (OB-2, NFR-6) · Grund: Rust-Läufe teilen auf der Werkbank ein Target-Volume und laufen nur nacheinander (Vorgabe S2 der Steuereinheit) · Alternative: beide parallel; sie blockieren sich dann bei jedem Testlauf und bauen den Crate wechselnd neu · Wirkung: technisch · Anforderungen: NFR-6, OB-2
- Offen: Schnitt des Frontends · Wahl: zwei Slices, slice-03-zen-swipe (Zen, Wischen, App-Rahmen) und danach slice-04-preview-surfaces (Kopfzeile, „Open in Browser" im Frontend, Neu laden, Baustein E); der Bereich C der Architektur („Im Browser öffnen", Frontend) ist kein eigener Slice; slice-04 baut auf dem gemergten Zen-Code auf · Grund: `HtmlPreviewPane.tsx`, `MarkdownPreviewPane.tsx`, `EditorStack.tsx` und `EditorPane.tsx` ändern die Bereiche C, D, E, F und G gemeinsam (Architektur „Gemeinsam angefasste Datei"); die Kopfzeile setzt Zen-Taste, Zen-Zustand und Rahmen-Hook als echten Code ein · Alternative: Zen-Verträge als Rümpfe in Slice-00 und beide Frontend-Slices parallel; die Pane-Tests prüften Zen dann nur gegen Ersatz · Wirkung: technisch · Anforderungen: MIG-6, MIG-7, MIG-8, MIG-9, MIG-11
- Offen: Gemeinsamer Aufruf-Wrapper für die neuen Commands in Slice-00 (Vorschlag S4) · Wahl: keiner; Slice-00 legt nur die TS-Typen an (`src/modules/preview-server/types.ts`); die `invoke`-Aufrufe stehen in genau den Dateien, die die Architektur nennt · Grund: SEC-3 und „Nahtstellen" verlangen je Command genau eine Aufrufer-Datei, ein Guard-Test prüft das · Alternative: gemeinsamer Wrapper; dann wäre er der einzige Aufrufer und der Guard-Test müsste seine Nutzer zählen · Wirkung: technisch · Anforderungen: SEC-3, API-5
- Offen: Rahmen der Panes im Zen · Wahl: ein Hook `usePaneFrameClass` im Zen-Modul liefert die Rahmen- und Eckenklassen; alle sechs Panes (Web-Vorschau, Git-Diff, KI-Diff, HTML, Markdown, Editor) nutzen ihn · Grund: SVC-15 legt fest, was weicht, aber nicht, wie die Panes es lesen; die Klassen stehen so an einem Ort · Alternative: jede Pane liest Store und `zenChrome` selbst · Wirkung: technisch · Anforderungen: SVC-15, MIG-6, MIG-7, MIG-8, MIG-17, MIG-18, MIG-19
- Offen: Schnittstelle für die Seitenleiste im Zen ohne Speichern (MIG-20) · Wahl: `useSidebarPanel` bekommt `collapseForZen()` und `restoreAfterZen()`; dazwischen setzt `persistSidebarCollapsed` nur den Zustand und schreibt nicht nach `localStorage`; `restoreAfterZen` stellt die vorige Breite her, eine vorher eingeklappte Leiste bleibt zu · Grund: MIG-20 beschreibt das Ziel, nicht die Schnittstelle · Alternative: `App.tsx` merkt sich Breite und Zustand selbst · Wirkung: technisch · Anforderungen: MIG-20, MIG-11
- Offen: Signatur der Rückfrage in `useTabSwipe` (MIG-13) · Wahl: dritter, optionaler Parameter `shouldDefer(target: Element | null): boolean`, gefragt nach `isInsideHorizontalScroller` · Grund: MIG-13 verlangt nur eine additive Signatur · Alternative: die aktive Tab-Art als Parameter · Wirkung: technisch · Anforderungen: MIG-13, SVC-17
- Offen: Linker Abstand der Kopfzeile im Zen auf macOS (Q&A 28 der Architektur) · Wahl: `pl-20` wie der App-Kopf (`src/modules/header/Header.tsx:135`); das Maß prüft N-11 am Mac · Grund: die Architektur sagt nur „Maß am Mac" · Alternative: ein eigener Wert · Wirkung: technisch · Anforderungen: UI-2
- Offen: Wer `TERAX.md` schreibt (MIG-16) · Wahl: Slice-00 schreibt die Absätze nach der Architektur; weicht ein späterer Slice ab, steht das in seinem „Wie gebaut", und der Dirigent zieht die Doku vor dem PR nach · Grund: die Datei beschreibt Rust-Kern, Esc-Monitor, Zen und Kopfzeile, also mehrere Slices · Alternative: der letzte Slice schreibt die Doku über fremden Code · Wirkung: technisch · Anforderungen: MIG-16
- Offen: Tests zu geänderten Bestandsdateien · Wahl: neue Testdateien (`*.zen.test.tsx`, `*.header.test.tsx`, `FileExplorer.openInBrowser.test.tsx`, `useSidebarPanel.zen.test.ts`); bestehende Testdateien bleiben unverändert · Grund: Sweep-Kriterium der Migration Map: ein roter Bestandstest ist eine Entscheidung gegen eine INV-Zeile, kein Anlass zum Anpassen · Alternative: die bestehenden Testdateien erweitern · Wirkung: technisch · Anforderungen: INV-1, INV-4, INV-13

## Slices

### slice-00-contracts: Verträge, geteilte Dateien und Doku

| Key | Value |
|-----|-------|
| **Dateibereich** | `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/lib.rs`, `src-tauri/src/modules/mod.rs`, `src-tauri/tests/preview_contracts.rs`, `src/modules/preview-server/types.ts`, `src/modules/preview-server/types.contract.test.ts`, `TERAX.md`, `src-tauri/src/modules/preview_server/mod.rs`, `src-tauri/src/modules/preview_server/policy.rs`, `src-tauri/src/modules/ssh.rs`, `src-tauri/src/modules/zen_escape.rs` |
| **Abhängigkeiten** | `[]` |
| **Anforderungen** | `MIG-1, MIG-2, MIG-3, MIG-16, NFR-2` |

**Ziel.** Legt alle Verträge zwischen Rust-Kern, SSH-Lesen, Esc-Monitor und Frontend im Code an und ändert die Dateien, die sonst mehrere Slices anfassen müssten, genau einmal (Cargo, `lib.rs`, `modules/mod.rs`, `TERAX.md`). Die drei neuen Commands sind gegen neutrale Rümpfe verdrahtet; danach kompiliert das Projekt auf Linux, alle Bestandstests bleiben grün, und die App verhält sich wie auf `cf07327`.

**Deliverables**

- `src-tauri/Cargo.toml` (MIG-1): tokio zusätzlich mit den Features `net`, `io-util`, `sync`; direkte Einträge `httparse = "1"`, `getrandom = "0.4"`, `percent-encoding = "2"` (Architektur „Migration Map", MIG-1).
- `src-tauri/Cargo.lock` (NFR-2): nur die Abhängigkeitsliste des Pakets `terax` wächst um `getrandom 0.4.3`, `httparse` und `percent-encoding`; kein neuer `[[package]]`-Block (vorher und nachher 578, Prüfung `grep -c '^\[\[package\]\]' src-tauri/Cargo.lock`). Das Lockfile wird ohne Netz aus dem vorhandenen Register-Cache nachgezogen.
- `src-tauri/src/modules/mod.rs` (MIG-2): `pub mod preview_server;` und `pub mod zen_escape;`, beide ohne `cfg` (die Plattform-Arme stehen in den Dateien).
- `src-tauri/src/lib.rs` (MIG-3): `.manage(preview_server::PreviewServer::default())`; im `generate_handler!` die Commands `preview_server::preview_open_in_browser`, `preview_server::preview_frame_source` und `zen_escape::zen_escape_arm`; in `setup` unter `cfg(target_os = "macos")` direkt nach `install_tab_swipe_monitor` der Aufruf `zen_escape::install_zen_escape_monitor(_app.handle())`. Der Exit-Pfad (`lib.rs:502-508`) bleibt unverändert.
- `TERAX.md` (MIG-16): im Abschnitt „Two-process model" ein Eintrag `preview_server::*` (`preview_open_in_browser`, `preview_frame_source`: Freigabe je Ort, Datei und Klasse mit eigenem Listener auf `127.0.0.1:0`, Geheimnis als erstes Pfadsegment, Prüfkette ohne `trusted`, SSH über `ssh::read_bytes_typed` mit einem Lesevorgang je Host und Abbruch nach 60 s, Klick über SSH über `ssh::realpath_typed` und `ssh::stat_typed`, Kopfzeilen je Art, Adresse nie in der Webview, Ende mit dem Prozess) und ein Eintrag `zen_escape::zen_escape_arm`; im Abschnitt „Frontend" die Tab-Art `html` und das Zen-Verhalten samt Esc-Regel; in „Module layout" die Module `preview-server/` und `zen/` und bei `tabs/` die Wisch-Ausnahme über der HTML-Vorschau. Quelle: Architektur „Kernentscheidungen", „Nahtstellen", „Sicherheitsmodell". Ohne Gedankenstrich (Konvention in `TERAX.md`).
- Rümpfe in fremden Bereichen, neutral wie auf `cf07327`:
  - `preview_server/mod.rs` (Bereich slice-01): `PreviewServer` ohne Freigaben und ohne Socket; Typen und Commands der Tabelle „Liefert"; `preview_open_in_browser` antwortet `{ status: unsupported, reason: null }`, `preview_frame_source` `{ status: unsupported, url: null, reason: null }`; `pub mod policy;`.
  - `preview_server/policy.rs` (Bereich slice-01): nur `ENTRY_EXTENSIONS` mit den endgültigen Werten der Welle 1.
  - `ssh.rs` (Bereich slice-02): nur der Zusatz `RemoteReadError`, `read_bytes_typed`, `realpath_typed` und `stat_typed`, jeder Rumpf `Err(RemoteReadError::Failed("not implemented".to_string()))`; keine andere Zeile geändert.
  - `zen_escape.rs` (Bereich slice-02): `zen_escape_arm` ohne Wirkung, `install_zen_escape_monitor` nur unter `cfg(target_os = "macos")` und leer.
  - Clippy-fest mit `-D warnings` (PR-05): jeder Rumpf verbraucht seine Parameter mit einer ersten Zeile `let _ = (…);` (zum Beispiel `let _ = (app, path, workspace);`, `let _ = armed;`, `let _ = (host, path, limit, budget);`); die Parameter der Tauri-Commands behalten ihre Namen `app`, `path`, `workspace`, `armed`, weil `path`, `workspace` und `armed` die IPC-Schlüssel sind. Kein `#[allow(...)]` und kein Unterstrich-Präfix an Command-Parametern.
- `src/modules/preview-server/types.ts`: die TS-Typen der Tabelle „Liefert", wörtlich nach Architektur „Nahtstellen", Typen an der Grenze.
- Keine Änderung an `src-tauri/capabilities/*.json`, `src-tauri/tauri.conf.json` und `src-tauri/src/modules/fs/asset.rs` (Nahtstellen „Unverändert, bewusst"); keine bestehende Testdatei wird geändert.

**Liefert**

| Vertrag | Signatur | Datei | Konsumenten |
|---------|----------|-------|-------------|
| `PreviewServer` | `#[derive(Default)] pub struct PreviewServer` (Tauri-State, `.manage` in `lib.rs`) | `src-tauri/src/modules/preview_server/mod.rs` | slice-01-preview-server |
| `BrowserOpen (Rust)` | `#[derive(Debug, Clone, PartialEq, Eq, Serialize)] #[serde(rename_all = "camelCase")] pub struct BrowserOpen { pub status: BrowserOpenStatus, pub reason: Option<String> }` | `src-tauri/src/modules/preview_server/mod.rs` | slice-01-preview-server |
| `BrowserOpenStatus` | `#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)] #[serde(rename_all = "snake_case")] pub enum BrowserOpenStatus { Opened, Unsupported, Refused, TooLarge, Unreachable, LimitReached, OpenFailed }` | `src-tauri/src/modules/preview_server/mod.rs` | slice-01-preview-server |
| `FrameSource (Rust)` | `#[derive(Debug, Clone, PartialEq, Eq, Serialize)] #[serde(rename_all = "camelCase")] pub struct FrameSource { pub status: FrameStatus, pub url: Option<String>, pub reason: Option<String> }` | `src-tauri/src/modules/preview_server/mod.rs` | slice-01-preview-server |
| `FrameStatus` | `#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)] #[serde(rename_all = "snake_case")] pub enum FrameStatus { Ready, Unsupported, Refused, TooLarge, Unreachable, LimitReached }` | `src-tauri/src/modules/preview_server/mod.rs` | slice-01-preview-server |
| `preview_open_in_browser` | `#[tauri::command] pub async fn preview_open_in_browser(app: tauri::AppHandle, path: String, workspace: Option<WorkspaceEnv>) -> Result<BrowserOpen, String>` | `src-tauri/src/modules/preview_server/mod.rs` | slice-01-preview-server (Rumpf füllen), slice-04-preview-surfaces (einziger Aufrufer `openInBrowser.ts`) |
| `preview_frame_source` | `#[tauri::command] pub async fn preview_frame_source(app: tauri::AppHandle, path: String, workspace: Option<WorkspaceEnv>) -> Result<FrameSource, String>` | `src-tauri/src/modules/preview_server/mod.rs` | slice-01-preview-server (Rumpf füllen), slice-04-preview-surfaces (einziger Aufrufer `HtmlPreviewPane.tsx`) |
| `ENTRY_EXTENSIONS` | `pub const ENTRY_EXTENSIONS: &[&str]` mit genau `"html", "htm", "png", "jpg", "jpeg", "gif", "webp", "ico", "svg", "pdf"` (Bezugsdateien der Welle 1; Name, Typ und Werte bleiben, der Guard-Test in slice-04 liest sie aus dem Quelltext) | `src-tauri/src/modules/preview_server/policy.rs` | slice-01-preview-server, slice-04-preview-surfaces |
| `RemoteReadError` | `#[derive(Debug, Clone, PartialEq, Eq)] pub enum RemoteReadError { Unreachable(String), TimedOut(String), Failed(String), Missing, NotRegularFile, TooLarge }` | `src-tauri/src/modules/ssh.rs` | slice-01-preview-server, slice-02-ssh-read-esc-monitor |
| `read_bytes_typed` | `pub fn read_bytes_typed(host: &str, path: &str, limit: u64, budget: std::time::Duration) -> Result<RemoteFileBytes, RemoteReadError>` (synchron wie `read_bytes`; `budget` ist das ganze Zeitbudget des `ssh`-Aufrufs, danach `TimedOut`) | `src-tauri/src/modules/ssh.rs` | slice-01-preview-server (Leser im Betrieb, übergibt 60 s), slice-02-ssh-read-esc-monitor (Rumpf füllen) |
| `realpath_typed` | `pub fn realpath_typed(host: &str, path: &str) -> Result<String, RemoteReadError>` (Helfer-Operation `realpath`, Budget wie `realpath`) | `src-tauri/src/modules/ssh.rs` | slice-01-preview-server (Klick über SSH, Home des Hosts), slice-02-ssh-read-esc-monitor (Rumpf füllen) |
| `stat_typed` | `pub fn stat_typed(host: &str, path: &str) -> Result<crate::modules::fs::file::FileStat, RemoteReadError>` (Helfer-Operation `stat`, Budget wie `stat`) | `src-tauri/src/modules/ssh.rs` | slice-01-preview-server (Größe beim Klick über SSH), slice-02-ssh-read-esc-monitor (Rumpf füllen) |
| `zen_escape_arm` | `#[tauri::command] pub fn zen_escape_arm(armed: bool)` | `src-tauri/src/modules/zen_escape.rs` | slice-02-ssh-read-esc-monitor (Rumpf füllen), slice-03-zen-swipe (einziger Aufrufer `useZenEscape.ts`) |
| `install_zen_escape_monitor` | `#[cfg(target_os = "macos")] pub fn install_zen_escape_monitor(app: &tauri::AppHandle)` | `src-tauri/src/modules/zen_escape.rs` | slice-02-ssh-read-esc-monitor, `lib.rs` |
| `terax:zen-escape` | Tauri-Event Rust an Webview, Nutzlast `()`; TS `listen<null>("terax:zen-escape", …)` | `src-tauri/src/modules/zen_escape.rs` | slice-02-ssh-read-esc-monitor (sendet), slice-03-zen-swipe (hört, nur `useZenEscape.ts`) |
| `BrowserOpen (TS)` | `type BrowserOpenStatus = "opened" \| "unsupported" \| "refused" \| "too_large" \| "unreachable" \| "limit_reached" \| "open_failed"; type BrowserOpen = { status: BrowserOpenStatus; reason: string \| null }` | `src/modules/preview-server/types.ts` | slice-04-preview-surfaces |
| `FrameSource (TS)` | `type FrameStatus = "ready" \| "unsupported" \| "refused" \| "too_large" \| "unreachable" \| "limit_reached"; type FrameSource = { status: FrameStatus; url: string \| null; reason: string \| null }` | `src/modules/preview-server/types.ts` | slice-04-preview-surfaces |

**Bedeutung der Verträge**

- `reason` in `BrowserOpen` gibt es nur bei `refused`, `unreachable` und `open_failed`; `url` in `FrameSource` nur bei `ready`. Sonst tragen beide nie Adresse, Port oder Geheimnis (Architektur „DTOs"). `Err(String)` nur bei einem inneren Fehler (Aufgabe abgebrochen).
- `RemoteReadError`: `Missing`, `NotRegularFile` und `TooLarge` kommen aus der festen Art des Helfers, `Unreachable` aus `RemoteError::Transport`, `TimedOut` aus `RemoteError::TimedOut`, `Failed` aus `RemoteError::Failed` und `RemoteError::Killed` (SVC-22). `read_bytes_typed`, `realpath_typed` und `stat_typed` ordnen mit derselben Funktion ein; eine vom Server abgelehnte Sitzung wird `Unreachable("the SSH server refused another session (MaxSessions limit)")` (OB-14).
- `budget` in `read_bytes_typed`: der Mini-Server übergibt 60 s (Entscheidung des Users vom 25.11.2026); nach Ablauf ist der `ssh`-Prozess beendet und das Ergebnis `TimedOut`.
- `zen_escape_arm(true)` schaltet den Esc-Monitor scharf; nur dann sendet er `terax:zen-escape`, und zwar bei Esc ohne Modifier im Hauptfenster.

**Braucht**

| Vertrag | von Slice |
|---------|-----------|
| -- | -- |

**Akzeptanzkriterien**

1) GIVEN Slice-00 ist gemergt, alle neuen Funktionen sind Rümpfe
   WHEN `src-tauri/tests/preview_contracts.rs` im Linux-Prüfabbild läuft
   THEN serialisiert `BrowserOpen { status: TooLarge, reason: None }` zu `{"status":"too_large","reason":null}`, `BrowserOpen { status: OpenFailed, reason: Some("no handler") }` zu `{"status":"open_failed","reason":"no handler"}` und `FrameSource { status: Ready, url: Some("http://127.0.0.1:4711/t/a.html"), reason: None }` zu `{"status":"ready","url":"http://127.0.0.1:4711/t/a.html","reason":null}`; die sieben Werte von `BrowserOpenStatus` serialisieren zu `opened`, `unsupported`, `refused`, `too_large`, `unreachable`, `limit_reached`, `open_failed`, die sechs von `FrameStatus` zu `ready`, `unsupported`, `refused`, `too_large`, `unreachable`, `limit_reached`
   [Source: --]
   Test: `src-tauri/tests/preview_contracts.rs`

2) GIVEN dieselben Rümpfe
   WHEN `preview_contracts.rs` `ENTRY_EXTENSIONS` und `RemoteReadError` prüft
   THEN ist `ENTRY_EXTENSIONS` als Menge genau {`html`, `htm`, `png`, `jpg`, `jpeg`, `gif`, `webp`, `ico`, `svg`, `pdf`}, ein erschöpfendes `match` über die sechs Varianten `Unreachable`, `TimedOut`, `Failed`, `Missing`, `NotRegularFile`, `TooLarge` kompiliert ohne Platzhalter-Arm, und `read_bytes_typed`, `realpath_typed` und `stat_typed` lassen sich Funktionszeigern mit genau den Signaturen der Tabelle „Liefert" zuweisen (ohne sie aufzurufen)
   [Source: --]
   Test: `src-tauri/tests/preview_contracts.rs`

3) GIVEN `src/modules/preview-server/types.ts`
   WHEN `pnpm vitest run src/modules/preview-server/types.contract.test.ts --maxWorkers=1` und `pnpm check-types` laufen
   THEN sind beide grün; `BrowserOpen` hat genau die Schlüssel `status` und `reason`, `FrameSource` genau `status`, `url` und `reason` (`expectTypeOf`), und die beiden Status-Vereinigungen bestehen genau aus den Werten aus AC 1
   [Source: --]
   Test: `src/modules/preview-server/types.contract.test.ts`

4) GIVEN Slice-00 ist gemergt
   WHEN der volle Rust-Lauf (`test --locked --no-fail-fast -- --test-threads=2`) und Clippy (`clippy --locked -- -D warnings`) im Linux-Prüfabbild sowie `pnpm vitest run --maxWorkers=2` laufen
   THEN enden alle drei mit Exit 0; die 629 Rust-Bestandstests sind grün und 13 ignoriert wie auf `cf07327`, dazu die neuen Tests aus `preview_contracts.rs`; keine bestehende Testdatei ist geändert
   [Source: --]
   Test: `src-tauri/tests/preview_contracts.rs` (im vollen Lauf)

**Nicht in diesem Slice**

- Kein Socket, keine Prüfkette, kein Lesen: die beiden Vorschau-Commands antworten nur `unsupported` (Verhalten baut slice-01-preview-server).
- Kein typisiertes Lesen und kein Esc-Monitor (slice-02-ssh-read-esc-monitor); kein Zen-Zustand und keine Wisch-Regel (slice-03-zen-swipe); keine Kopfzeile und kein Aufrufer der neuen Commands im Frontend (slice-04-preview-surfaces).
- Kein gemeinsamer Aufruf-Wrapper für die Commands im Frontend: laut Architektur „Nahtstellen" und SEC-3 hat jeder Command genau eine Aufrufer-Datei.
- Keine Änderung an Capabilities, `tauri.conf.json`, `asset.rs` und an bestehenden Testdateien.

**Wie gebaut**

- **Merge-Commit:** `f1b4f19` (Slice-Commit `946e60e` über `306abf8`, 12 Dateien, alle im Dateibereich).
- **Gate auf `946e60e`:** `cargo test` 640 grün (629 Bestand + 11 neu), 13 ignoriert; Clippy `--all-targets -D warnings` ohne Warnung; `pnpm check-types` Exit 0; Vitest 1508 grün in 139 Dateien; Lockfile weiter 578 Pakete. Rust-Läufe mit eigenem Target je Worktree und „Compiling terax" im Log.
- **Review:** Diff-Review, Claim-Verifikation und Mutationsstufe. Zwei blockierende Befunde, beide vom Nachprüfer bestätigt und in einer Fix-Runde behoben: (1) der Quelltext-Test der Verdrahtung war blind für auskommentierten Code; er entfernt jetzt Zeilen- und Blockkommentare und prüft im `generate_handler![…]`- bzw. `setup`-Block; (2) der Test der Status-Draht-Werte erzwang entgegen seinem Kommentar keinen Wert je Variante; jetzt bildet ein `match` ohne Platzhalter jede Variante auf ihren Draht-Wert ab. Dazu: `Eq` an `RemoteReadError` per Trait-Schranke erzwungen, zwei Stellen in `TERAX.md` berichtigt (`400`/`421` beim `Host`, voller CSP-Wert). Delta-Review ohne blockierenden Befund.
- **Abweichungen vom Plan:** `pub struct PreviewServer {}` mit leeren Klammern (sonst meldet Clippy voraussichtlich `default_constructed_unit_structs` an `.manage(PreviewServer::default())`); vier zusätzliche Vertragstests (Derives, Command-Signaturen, IPC-Schlüssel, Verdrahtung in `lib.rs`); keine Konstante für den Event-Namen `terax:zen-escape` (baut slice-02).
- **Bekannte Grenzen:** Eine neue Status-Variante, die im Test einen Arm bekommt, aber nicht in `ALL_*` eingetragen wird, bleibt ungeprüft (stabiles Rust kann Varianten nicht aufzählen). Die Quelltext-Tests nehmen feste Start-Texte an (`pubfnrun(){`, `.setup(|_app|{`, `tauri::generate_handler![`) und kennen keine Raw-Strings. Der Laufzeitteil des TS-Vertragstests vergleicht nur Testkonstanten; den Vertrag beweist `pnpm check-types`. Code unter `cfg(target_os = "macos")` (Aufruf in `setup`, leerer Monitor) ist auf der Build-Maschine nicht kompiliert.
- **An Folge-Slices:** slice-01 nutzt `httparse`, `getrandom` und `percent-encoding` (sonst meldet `cargo machete` sie) und ersetzt die Doc-Kommentare der Rümpfe, die Zielverhalten beschreiben; slice-02 und slice-04 ebenso für ihre Rümpfe.

### slice-01-preview-server: Rust-Kern des Mini-Servers

| Key | Value |
|-----|-------|
| **Dateibereich** | `src-tauri/src/modules/preview_server/mod.rs`, `src-tauri/src/modules/preview_server/grant.rs`, `src-tauri/src/modules/preview_server/request.rs`, `src-tauri/src/modules/preview_server/policy.rs`, `src-tauri/src/modules/preview_server/source.rs`, `src-tauri/src/modules/preview_server/listener.rs`, `src-tauri/src/modules/fs/file.rs` |
| **Abhängigkeiten** | `[slice-00-contracts]` |
| **Anforderungen** | `BR-1, BR-2, BR-3, BR-4, BR-5, BR-6, BR-8, BR-9, BR-10, BR-11, BR-12, BR-14, BR-15, FL-2, FL-3, EP-1, EP-2, EP-3, EP-4, EP-5, ST-1, ST-2, TR-1, TR-2, DF-1, DF-2, DF-3, DF-4, TG-3, TG-4, API-1, API-2, API-8, API-9, SVC-1, SVC-2, SVC-3, SVC-4, SVC-5, SVC-6, SVC-7, SVC-8, SVC-9, SVC-10, SVC-11, SVC-21, VAL-1, VAL-2, VAL-3, VAL-4, VAL-5, VAL-6, VAL-7, VAL-8, VAL-9, VAL-10, VAL-11, SEC-1, SEC-2, SEC-4, SEC-5, SEC-6, SEC-7, SEC-10, SEC-11, SEC-12, SEC-13, SEC-14, SEC-15, SEC-16, NFR-1, NFR-3, NFR-4, NFR-5, NFR-7, MIG-4, OB-1, OB-3, OB-7, OB-8, OB-9, OB-10, OB-11, OB-12, OB-13, OB-15` |

**Ziel.** Baut den Mini-Server im Rust-Teil: Freigaben je Ort, Datei und Klasse mit eigenem Listener auf `127.0.0.1`, das Geheimnis im ersten Pfadsegment, dieselbe Prüfkette für jede Datei, lokales Lesen und SSH-Lesen über einen übergebenen Leser, Kopfzeilen je Art und Klasse sowie die Commands `preview_open_in_browser` (API-1) und `preview_frame_source` (API-8, Rust-Teil von Baustein E). Quellen: Architektur „Server Logic", „Validation Rules", „Security", „Sicherheitsmodell", Kopfzeilen-Tabelle unter „DTOs", „Error Handling Strategy" und „In-App-Vorschau über den Mini-Server"; alles ist mit `cargo test` unter Linux prüfbar, SSH nur über einen Host-Ersatz.

**Deliverables**

- Dateien nach Architektur „Nahtstellen", Neue Dateien Bereich A: `grant.rs` (`Grant`, `grant_scope`, `new_token`, `token_matches`), `request.rs` (`parse_request`, `split_target`), `policy.rs` (`served_type`, `response_headers`, `ENTRY_EXTENSIONS` aus Slice-00 unverändert), `source.rs` (`read_local`, `read_remote`, `within`, `opened_path`), `listener.rs` (`serve_listener`), `mod.rs` (`PreviewServer`, beide Commands, `open_entry`). Freigaben werden bis zum Prozessende nie entfernt und nirgends gespeichert.
- `src-tauri/src/modules/fs/file.rs` (MIG-4): `is_pdf_magic` (SVC-21) ist der einzige Ort des `%PDF-`-Vergleichs; `fs_is_pdf` nutzt sie mit unverändertem Verhalten. Sweep-Kriterium der Migration Map: `grep -rn 'const PDF_MAGIC\|b"%PDF-"' src-tauri/src --include=*.rs` außerhalb von `#[cfg(test)]` genau ein Treffer in `file.rs`, `grep -rn '%PDF-' src-tauri/src/modules/preview_server` außerhalb von `#[cfg(test)]` keiner.
- Der Leser im Betrieb ist `ssh::read_bytes_typed` (Vertrag aus Slice-00, gebaut in slice-02-ssh-read-esc-monitor); Commands und Listener rufen ihn immer über einen Blocking-Thread (`spawn_blocking`, OB-1). Tests übergeben einen Host-Ersatz nach dem Muster `file.rs:753-764`. Das Öffnen des Browsers ist ebenfalls übergeben (Muster `view_with`, `ports/chrome.rs:509-527`), im Betrieb `tauri_plugin_opener::open_url(url, None::<&str>)`.
- Klick über SSH: `ssh::realpath_typed` für die Bezugsdatei, `ssh::stat_typed` auf das Ziel für die Größe, Home des Hosts über `ssh::realpath_typed(host, "~")` einmal je Host gemerkt (SVC-2); jeder Fehler daraus wird `unreachable` mit dem Text der Variante als Grund, so erreicht der MaxSessions-Grund den Toast (Befund PR-02). `ssh::realpath` und `ssh::stat` nutzt der Server nicht.
- Grenzen als benannte Werte einer Grenzen-Struktur, im Betrieb nach Architektur: 16 Verbindungen je Freigabe und 64 insgesamt (SEC-12); Kopf höchstens 64 KiB, 64 Kopfzeilen und 10 s (SEC-13, OB-10); 8 Lesevorgänge insgesamt, davon 1 je SSH-Host, eine Wiederholung nach `Unreachable` nach 250 ms (SEC-14); Wartegrenze auf den Platz eines Hosts 30 s ohne Fortschritt (OB-12); Schreiben 30 s (SEC-15); 256 Freigaben über beide Klassen (VAL-11). Dazu `ssh_read_budget` = 60 s (Entscheidung des Users vom 25.11.2026, weicht ab von SEC-16): `read_remote` übergibt diesen Wert als `budget` an `read_bytes_typed`; der Platz des Hosts bleibt belegt, bis der Leser zurückkehrt, und wird dann freigegeben. Tests verkürzen nur die Zeiten.
- Schalter für die Mac-Messung M-C (Architektur „In-App-Vorschau über den Mini-Server", Auflage OB-19) als Konstanten: Fallback-Adresse `localhost` für die Klasse `frame` (aus) und `frame-ancestors` an der Klasse `frame` (an). Mit Fallback bindet die Freigabe zusätzlich `[::1]` am selben Port; ist er dort belegt, wird der erste Socket freigegeben und ein Port gesucht, der auf beiden Adressen frei ist (Muster `TERAX.md:44`); ohne IPv6-Loopback nur `127.0.0.1`.
- Fehlerseiten für `502` und `504` als `text/plain; charset=utf-8` mit den Kopfzeilen der trägen Arten (Entscheidung); alle übrigen Ablehnungen ohne Rumpf; jede Antwort mit `Connection: close`.
- Geheimnis, Eintritts-Adresse und Rahmen-Adresse erscheinen nie in einem Log-Eintrag, in einem `reason` von `BrowserOpen` oder `FrameSource` und in keiner Fehlermeldung (Auflage PR-07, SEC-1); ein Opener-Fehler, der die Adresse enthält, bekommt sie im Grund als `<link>` ersetzt (Entscheidung); Log-Stufen nach „Error Handling Strategy". Das Code-Review prüft jede `log::`-Zeile unter `preview_server/`.
- Plattform-Arme: `opened_path` mit macOS (`F_GETPATH`), Linux (`/proc/self/fd`) und Windows (erneutes Auflösen); `within` und `opened_path` vergleichen unter Windows über `fs::to_canon`; Symlink-Tests stehen unter `cfg(unix)`. Das ist der Windows-Teil der Auflage OB-2; deren Nachweis per Clippy und Review der `cfg`-Zweige führt slice-02-ssh-read-esc-monitor.
- Welle-2-Vorbereitung nach Architektur „Welle 2: Markdown im Browser", Zeile „Was Welle 1 dafür bereithält": Art `markdown` und die laufende Welle als Konstante in `policy.rs`, Ordner-Bereich für die Art `markdown` in `grant_scope`, Kopfzeilen-Zeile für gerendertes Markdown in `response_headers`. In Welle 1 ist nichts davon über Adresse oder Command erreichbar (`md` ist keine Bezugsdatei).
- NFR-7: Zu den Zeilen 1, 3 bis 11, 13 bis 19 und 23 des Sicherheitsmodells gibt es mindestens einen `cargo test` in diesem Slice; ein Doc-Kommentar am Test nennt die Zeile (`/// Sicherheitsmodell 6`). Zeile 2 ist Zeile 1, Zeile 12 ist Mac N-18, die Zeilen 20 bis 22 prüft slice-04-preview-surfaces, Zeile 24 hat laut Architektur keinen Test.
- Rust-Tests tragen den Anker als Namensanfang `ac<n>_` (zum Beispiel `ac7_rejects_a_dotdot_segment`).

**Liefert**

| Vertrag | Signatur | Datei | Konsumenten |
|---------|----------|-------|-------------|
| -- | -- | -- | -- |

**Braucht**

| Vertrag | von Slice |
|---------|-----------|
| `PreviewServer` | slice-00-contracts |
| `BrowserOpen (Rust)` | slice-00-contracts |
| `BrowserOpenStatus` | slice-00-contracts |
| `FrameSource (Rust)` | slice-00-contracts |
| `FrameStatus` | slice-00-contracts |
| `preview_open_in_browser` | slice-00-contracts |
| `preview_frame_source` | slice-00-contracts |
| `ENTRY_EXTENSIONS` | slice-00-contracts |
| `RemoteReadError` | slice-00-contracts |
| `read_bytes_typed` | slice-00-contracts |
| `realpath_typed` | slice-00-contracts |
| `stat_typed` | slice-00-contracts |

**Akzeptanzkriterien**

Schreibweise: `T` ist das Geheimnis einer Freigabe (64 Hex-Zeichen), `{p}` ihr Port; der Host-Ersatz ist der übergebene Leser, der Bytes und gemeldetes Ziel vorgibt und jeden Aufruf mit Host, Pfad und Grenze notiert; „Ersatz-Opener" ist die übergebene Öffnen-Funktion.

1) GIVEN zwei Aufrufe von `new_token()`
   WHEN Ergebnis und Vergleich geprüft werden
   THEN sind beide 64 Zeichen aus `0-9a-f` lang und verschieden; `token_matches(T, T)` ist wahr; für jede der 64 Positionen ergibt `T` mit genau diesem einen geänderten Zeichen falsch, ebenso `T` ohne sein letztes Zeichen und der leere Text
   [Source: SVC-10, DF-2, BR-3]
   Test: `src-tauri/src/modules/preview_server/grant.rs`

2) GIVEN Home `/home/u`
   WHEN `grant_scope` für die HTML-Dateien `/home/u/p/a.html`, `/home/u/a.html`, `/a.html`, `/home/a.html`, für das Bild `/home/u/p/b.png`, die PDF `/home/u/p/c.pdf` und die vorgesehene Art `markdown` `/home/u/p/n.md` bestimmt wird
   THEN ist der Bereich `/home/u/p`, dann fünfmal „nur die Datei", dann `/home/u/p`
   [Source: SVC-2, SEC-2, BR-4, BR-9]
   Test: `src-tauri/src/modules/preview_server/grant.rs`

3) GIVEN (Unix) ein Ordner `home-real`, ein Symlink `home-link` darauf als Home und die Dateien `home-link/a.html` und `home-real/p/b.html`
   WHEN je eine Freigabe für `home-link/a.html` und `home-real/p/b.html` angelegt wird
   THEN ist der Bereich der ersten „nur die Datei", weil Home und Bezugsdatei auf demselben Weg aufgelöst werden, und der der zweiten der aufgelöste Ordner `home-real/p`
   [Source: OB-3]
   Test: `src-tauri/src/modules/preview_server/mod.rs`

4) GIVEN ein Listener auf Port 4711
   WHEN `parse_request` Köpfe mit `Host: 127.0.0.1:4711`, `Host: evil.example`, `Host: localhost:4711`, `Host: 127.0.0.1:4712`, ohne `Host` und mit zwei `Host`-Zeilen liest
   THEN gilt für die Klasse `browser` und für `frame` ohne Fallback: angenommen, `421`, `421`, `421`, `400`, `400`; für `frame` mit Fallback-Adresse wird nur `localhost:4711` angenommen, `127.0.0.1:4711` und `evil.example` ergeben `421`; jede Ablehnung hat einen leeren Rumpf
   [Source: SVC-3, VAL-1, OB-10, BR-1]
   Test: `src-tauri/src/modules/preview_server/request.rs`

5) GIVEN ein gültiger Host
   WHEN `POST`, `PUT`, `OPTIONS` oder `DELETE` kommt, ein `GET` mit `Content-Length: 5`, ein `GET` mit `Transfer-Encoding: chunked`, ein Kopf mit 65 Kopfzeilen, der Kopf `GARBAGE\r\n\r\n` und `GET http://127.0.0.1:4711/T/a.html` (absolute-form)
   THEN antwortet der Server `405` mit `Allow: GET, HEAD`, `400`, `400`, `431`, `400` und `400`, jeweils ohne Rumpf
   [Source: VAL-2, VAL-3, SEC-10, OB-10]
   Test: `src-tauri/src/modules/preview_server/request.rs`

6) GIVEN eine Freigabe mit Geheimnis `T`
   WHEN `split_target` die Ziele `/T/a.html`, `/T/`, `/T/sub/`, `/T/a.html?v=1`, `/T/a%3Fb.html`, `/T/Bericht%20M%C3%A4rz.html` und `/T/%252e%252e/x` zerlegt
   THEN ergibt das `[a.html]`, Ordner (leerer Pfad), Ordner `[sub]`, `[a.html]` (Query vor dem Dekodieren abgetrennt), `[a?b.html]`, `[Bericht März.html]` und `[%2e%2e, x]` (genau einmal dekodiert)
   [Source: SVC-4, SEC-11, OB-7]
   Test: `src-tauri/src/modules/preview_server/request.rs`

7) GIVEN dieselbe Freigabe
   WHEN `split_target` die Ziele `/T/sub%2Fy.png`, `/T/../x`, `/T/%2e%2e/x`, `/T/./a`, `/T/a//b`, `/T/a%5Cb`, `/T/a%00b`, `/X/a.html` (falsches Geheimnis), `/a.html` und `/T` zerlegt
   THEN wird jedes abgewiesen: die sieben Pfadfehler mit `404` „Not found", falsches oder fehlendes Geheimnis und `/T` ohne Schrägstrich mit `404` ohne Rumpf
   [Source: SVC-4, VAL-4, VAL-5, OB-8, EP-1]
   Test: `src-tauri/src/modules/preview_server/request.rs`

8) GIVEN `proptest` mit mindestens 1000 Zielen hinter `/T/` aus den Zeichen `/`, `.`, `%`, `2`, `5`, `e`, `E`, `f`, `F`, `c`, `C`, `\`, `a`
   WHEN `split_target` ein Ziel annimmt
   THEN ist kein Segment `.`, `..` oder ein leeres Segment in der Mitte, keins enthält `/`, `\` oder ein Steuerzeichen, und `root` mit den Segmenten verbunden bleibt lexikalisch unter `root`
   [Source: VAL-5, BR-4, EP-3]
   Test: `src-tauri/src/modules/preview_server/request.rs`

9) GIVEN `served_type` mit der festen Liste aus Architektur „DTOs"
   WHEN die Namen `a.html`, `b.HTM`, `c.js`, `d.mjs`, `e.css`, `f.json`, `g.svg`, `h.PNG`, `i.woff2`, `j.wasm`, `k.md`, `l.pdf`, `m.xyz` und `n` bestimmt werden
   THEN ergeben sie `text/html`, `text/html`, `text/javascript`, `text/javascript`, `text/css`, `application/json`, `image/svg+xml`, `image/png`, `font/woff2`, `application/wasm`, `text/plain` (träge Rohdatei), `application/pdf`, `application/octet-stream` und `application/octet-stream`; als Bezugsdatei gilt nur eine Endung aus `ENTRY_EXTENSIONS`, `k.md` und `x.txt` nicht
   [Source: SVC-5, BR-9]
   Test: `src-tauri/src/modules/preview_server/policy.rs`

10) GIVEN `response_headers`
    WHEN die Kopfzeilen für HTML, Skript, CSS, SVG, PNG, Rohdatei `md`, Unbekanntes und PDF in der Klasse `browser` und für HTML und PNG in der Klasse `frame` bestimmt werden
    THEN trägt HTML (`browser`) `Content-Security-Policy: frame-ancestors 'self'` ohne `sandbox`, Skript keine CSP, alle trägen Arten und PDF `Content-Security-Policy: sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'`; HTML (`frame`) trägt `Content-Security-Policy: frame-ancestors tauri://localhost http://tauri.localhost https://tauri.localhost http://localhost:1420` (der letzte Eintrag nur im Debug-Build) ohne `sandbox`, mit ausgeschaltetem `frame-ancestors`-Schalter gar keine CSP, PNG (`frame`) wie in `browser`; jede Art trägt `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer` und `Connection: close`, keine trägt `Access-Control-*` oder `Set-Cookie`
    [Source: SVC-6, SEC-7, BR-14, API-9]
    Test: `src-tauri/src/modules/preview_server/policy.rs`

11) GIVEN (Unix) eine HTML-Freigabe mit Bereich `p`, darin `sub/y.png`, `in.png` als Symlink auf `sub/y.png`, `out.png` als Symlink auf `../x.png`, `key.png` als Symlink auf `.ssh/id_rsa` neben `p`, `linkdir` als Symlink auf einen Ordner außerhalb, und drei Symlinks, deren Ziel im Bereich liegt, aber auf der Sperrliste steht: `ok.png` auf `p/.env`, `logo.png` auf `p/.git/config` und `icon.png` auf `p/.ssh/id_ed25519`
    WHEN `read_local` `sub/y.png`, `in.png`, `out.png`, `key.png`, `linkdir/z.png`, `ok.png`, `logo.png` und `icon.png` liest
    THEN liefert es zweimal die Bytes von `y.png` und dann sechsmal `403` „Refused by Terax" (die letzten drei, weil die Sperrliste auf dem aufgelösten Ziel greift, obwohl der Bereich stimmt); `opened_path` der über `in.png` geöffneten Datei ist der aufgelöste Pfad von `sub/y.png`
    [Source: SVC-7, VAL-6, VAL-7, BR-11, EP-3]
    Test: `src-tauri/src/modules/preview_server/source.rs`

12) GIVEN eine HTML-Freigabe mit `.env`, `id_ed25519`, `.ssh/config` und `.git/config` im Bereich und eine Bild-Freigabe nur für `b.png`
    WHEN `read_local` diese vier Dateien und in der Bild-Freigabe `c.png` daneben liest
    THEN ist jede der fünf Antworten `403` „Refused by Terax"
    [Source: VAL-7, SEC-6, BR-10]
    Test: `src-tauri/src/modules/preview_server/source.rs`

13) GIVEN eine HTML-Freigabe mit einer Datei von 10 485 761 Byte, einer von genau 10 485 760 Byte, `report.pdf` mit dem Inhalt `<html><script>`, einer echten PDF (`%PDF-1.7`), dem Ordner `sub` mit `index.html` und dem Ordner `leer` ohne `index.html`
    WHEN `read_local` die große Datei, die 10-MiB-Datei, `report.pdf`, die echte PDF, `sub` ohne Schrägstrich, `sub/`, `leer/` und `fehlt.png` liest
    THEN ergibt das `403` „Larger than 10 MB", die Bytes mit 10 485 760 Byte, `403` „Refused by Terax", die PDF als `application/pdf`, `404` „Not found", die Bytes von `sub/index.html`, `404` „Not found" und `404` „Not found"
    [Source: VAL-8, VAL-9, SVC-21, BR-12, DF-4, EP-5]
    Test: `src-tauri/src/modules/preview_server/source.rs`

14) GIVEN `is_pdf_magic`
    WHEN es die Bytes `%PDF-1.7\n`, `%PDF`, `<html>` und leere Bytes prüft
    THEN ergibt es wahr, falsch, falsch und falsch; die bestehenden Tests `is_pdf_*` in `file.rs` laufen unverändert grün
    [Source: SVC-21, MIG-4]
    Test: `src-tauri/src/modules/fs/file.rs`

15) GIVEN eine SSH-Freigabe für Host `devbox` mit Bereich `/srv/p` und ein Host-Ersatz
    WHEN `read_remote` `sub/y.png` (gemeldetes Ziel `/srv/p/sub/y.png`), `link.png` (Ziel `/srv/other/x.png`), `pic.png` (Ziel `/home/u/.ssh/id_rsa`), die Namen `.env`, `id_ed25519`, `.ssh/config` und `.git/config` sowie `a.png` (Ziel `/srv/p/.env`), `b.png` (Ziel `/srv/p/.git/config`) und `c.png` (Ziel `/srv/p/keys/id_ed25519`) liest
    THEN liefert es Bytes, `403` „Refused by Terax", `403` „Refused by Terax", für `.env`, `id_ed25519`, `.ssh/config` und `.git/config` je `403`, ohne den Host-Ersatz aufzurufen (Sperrliste auf dem Pfad-Text vor dem Senden), und für `a.png`, `b.png` und `c.png` je `403`, obwohl das gemeldete Ziel im Bereich liegt (Sperrliste auf dem gemeldeten Ziel); jeder Aufruf des Host-Ersatzes nennt Host `devbox` und Grenze 10 485 760
    [Source: SVC-8, SEC-5, SEC-6, VAL-7, DF-3, BR-5, BR-10, BR-11]
    Test: `src-tauri/src/modules/preview_server/source.rs`

16) GIVEN dieselbe SSH-Freigabe und die Anfrage `y.png`
    WHEN der Host-Ersatz `Missing`, `NotRegularFile`, `TooLarge`, `TimedOut("budget")`, `Failed("boom")`, zweimal `Unreachable("gone")`, einmal `Unreachable("gone")` und danach Bytes, und für `report.pdf` HTML-Bytes liefert
    THEN antwortet der Server `404` „Not found", `404` „Not found", `403` „Larger than 10 MB", `504` „Terax could not read y.png from devbox: timed out", `502` „Terax could not read y.png from devbox: boom" nach genau einem Aufruf, `502` „Terax could not read y.png from devbox: gone" nach genau zwei Aufrufen, `200` nach zwei Aufrufen und `403` „Refused by Terax"; die Zuordnung hängt nur an der Variante, nie am Text
    [Source: SVC-8, OB-13, SEC-14, SEC-16, NFR-4, VAL-9]
    Test: `src-tauri/src/modules/preview_server/source.rs`

17) GIVEN je 30 gleichzeitige Anfragen an Freigaben der Hosts `devbox` und `box2` und ein Host-Ersatz, der gleichzeitige Aufrufe je Host zählt
    WHEN alle beantwortet sind
    THEN liefen je Host höchstens 1 und insgesamt höchstens 8 Lesevorgänge zugleich, und alle 60 Antworten sind `200`
    [Source: SEC-14, NFR-3]
    Test: `src-tauri/src/modules/preview_server/source.rs`

18) GIVEN der Host-Ersatz hält den ersten Lesevorgang für `devbox` an, die Wartegrenze ist im Test 200 ms
    WHEN eine zweite Anfrage (`b.png`) für `devbox` wartet und eine Anfrage für `box2` kommt
    THEN bekommt die zweite nach der Wartegrenze `504` „Terax could not read b.png from devbox: timed out", die für `box2` ohne Warten `200`; nach Freigabe des ersten Lesevorgangs bekommt eine dritte Anfrage für `devbox` `200`
    [Source: OB-12, SEC-14]
    Test: `src-tauri/src/modules/preview_server/source.rs`

19) GIVEN eine tokio-Laufzeit mit genau einem Arbeits-Thread und ein Host-Ersatz, der synchron bis zur Freigabe blockiert
    WHEN eine SSH-Anfrage blockiert und währenddessen eine lokale Freigabe angefragt wird
    THEN antwortet die lokale Anfrage `200`, bevor der blockierte Lesevorgang freigegeben wird
    [Source: OB-1]
    Test: `src-tauri/src/modules/preview_server/listener.rs`

20) GIVEN eine HTML-Freigabe auf Ordner `p` mit `a.html`, `index.html` und `sub/y.png` und ein echter Socket
    WHEN der Test mit `Host: 127.0.0.1:{p}` `GET /T/a.html`, `HEAD /T/a.html`, `GET /T/`, `GET /T/fehlt.png` und danach `GET /T/sub/y.png` schickt, `a.html` ändert und `GET /T/a.html` wiederholt
    THEN ist die lokale Adresse des Sockets `127.0.0.1` mit einem Port ungleich 0; `GET` ergibt `200`, `Content-Type: text/html`, die Kopfzeilen aus AC 10 und die Datei als Rumpf; `HEAD` dieselben Kopfzeilen mit `Content-Length` der Datei ohne Rumpf; `/T/` liefert `index.html`; `fehlt.png` ergibt `404` „Not found" und `sub/y.png` danach `200`; der wiederholte Abruf liefert den neuen Inhalt
    [Source: SVC-9, API-2, SEC-4, BR-1, BR-2, BR-6, FL-2, FL-3, NFR-4, NFR-5, TG-3, EP-2]
    Test: `src-tauri/src/modules/preview_server/listener.rs`

21) GIVEN zwei Freigaben A (Geheimnis `TA`, Port `{a}`) und B (Geheimnis `TB`, Port `{b}`) mit echtem Socket
    WHEN auf `{a}` `GET /a.html`, `GET /falsch/a.html`, `GET /TB/a.html` und `GET /TA` kommt
    THEN ist jede Antwort `404` ohne Rumpf und ohne Hinweis, ob die Datei existiert; die Ports `{a}` und `{b}` sind verschieden
    [Source: VAL-4, SEC-1, SEC-4, EP-1, BR-3, BR-14, OB-15]
    Test: `src-tauri/src/modules/preview_server/listener.rs`

22) GIVEN eine Freigabe mit verkürzten Zeitbudgets
    WHEN ein Kopf über 64 KiB, ein Kopf mit 20 KiB `Cookie`, ein Kopf ohne Abschluss, 17 gleichzeitige Verbindungen ohne Kopf auf diese Freigabe und 65 gleichzeitige Verbindungen über fünf Freigaben kommen
    THEN antwortet der Server `431` und `200`, schließt die Verbindung ohne Abschluss nach dem Kopf-Budget, schließt die 17. Verbindung sofort (vor Ablauf des Kopf-Budgets) und ebenso die 65.
    [Source: SEC-12, SEC-13, VAL-3]
    Test: `src-tauri/src/modules/preview_server/listener.rs`

23) GIVEN eine Freigabe mit einer Datei von 10 MiB und einem Schreib-Budget von 300 ms im Test
    WHEN ein Client die Antwort nicht liest und ein zweiter Client nach dem Kopf weiter Bytes sendet und dann liest
    THEN schließt der Server die erste Verbindung nach dem Schreib-Budget; der zweite Client erhält die Antwort vollständig (`Content-Length` Bytes, kein Verbindungs-Reset), weil der Server erst halb schließt
    [Source: SEC-15, OB-11]
    Test: `src-tauri/src/modules/preview_server/listener.rs`

24) GIVEN die lokale Datei `Bericht März 2026.html` und ein Ersatz-Opener
    WHEN `preview_open_in_browser` über die innere Funktion läuft und danach `GET` auf die geöffnete Adresse kommt
    THEN bekam der Ersatz-Opener genau `http://127.0.0.1:{p}/T/Bericht%20M%C3%A4rz%202026.html`, die Antwort ist `{ status: opened, reason: null }` ohne Adresse, und der `GET` liefert die Datei mit `200`; meldet der Ersatz-Opener `Err("no handler")`, ist die Antwort `{ status: open_failed, reason: "no handler" }`
    [Source: SVC-11, API-1, DF-1, BR-8, OB-9]
    Test: `src-tauri/src/modules/preview_server/mod.rs`

25) GIVEN ein neuer `PreviewServer`
    WHEN er angelegt wird und danach zweimal `preview_open_in_browser` für dieselbe Datei `a.html` läuft
    THEN hat er vor dem ersten Aufruf keine Freigabe und keinen Socket; nach beiden Aufrufen hat er genau eine Freigabe, der Ersatz-Opener bekam zweimal dieselbe Adresse, und der Link antwortet nach dem zweiten Klick weiter mit `200`
    [Source: SVC-1, NFR-1, ST-1, ST-2, TR-1, TG-4, BR-15]
    Test: `src-tauri/src/modules/preview_server/mod.rs`

26) GIVEN ein `PreviewServer` und ein Temp-Ordner `h`
    WHEN `preview_open_in_browser` für `notes.txt`, für `a.html` im Workspace `wsl`, für `h/.ssh/notiz.html`, für ein lokales Bild mit 10 485 761 Byte und für `fake.pdf` mit HTML-Inhalt läuft
    THEN ist die Antwort `unsupported`, `unsupported`, `refused` mit Grund, `too_large` und `refused` mit Grund; in keinem dieser Fälle entsteht eine Freigabe
    [Source: API-1, VAL-10, VAL-7, VAL-8, VAL-9]
    Test: `src-tauri/src/modules/preview_server/mod.rs`

27) GIVEN 256 Freigaben über beide Klassen
    WHEN `preview_open_in_browser` für eine neue Datei, `preview_frame_source` für eine neue Datei und `preview_open_in_browser` für eine der 256 Dateien läuft
    THEN ist die Antwort `limit_reached`, `limit_reached` und `opened` mit derselben Adresse wie zuvor; alle 256 Links antworten weiter
    [Source: VAL-11, BR-15]
    Test: `src-tauri/src/modules/preview_server/mod.rs`

28) GIVEN die SSH-Dateien `/srv/p/report.html` und `/srv/p/zwei.html` auf Host `devbox` und ein Host-Ersatz für `realpath_typed`, `stat_typed` und das Lesen
    WHEN `preview_open_in_browser` für beide Dateien läuft, danach für eine Datei, deren `realpath_typed` mit `Unreachable("gone")` scheitert, und für eine, deren `stat_typed` 10 485 761 Byte meldet
    THEN sind die ersten beiden Antworten `opened`, die Freigabe hat den Bereich `/srv/p` und den Host `devbox`, `realpath_typed("~")` lief für `devbox` genau einmal; danach `unreachable` mit Grund `gone` und `too_large`
    [Source: API-1, SVC-2, BR-5, DF-3]
    Test: `src-tauri/src/modules/preview_server/mod.rs`

29) GIVEN die lokale HTML-Datei `a.html` mit einer Browser-Freigabe
    WHEN `preview_frame_source` zweimal für `a.html` läuft, `GET` mit `Host: 127.0.0.1:{p}` auf die gelieferte Adresse kommt und `preview_frame_source` für `notes.txt` läuft
    THEN ist die Antwort `{ status: ready, url: "http://127.0.0.1:{p}/T/a.html", reason: null }` mit eigenem Port und eigenem Geheimnis, beide verschieden von der Browser-Freigabe, beim zweiten Aufruf dieselbe `url`; der `GET` ergibt `200` mit den `frame`-Kopfzeilen aus AC 10; `notes.txt` ergibt `unsupported` mit `url: null`
    [Source: API-8, API-9, SVC-1]
    Test: `src-tauri/src/modules/preview_server/mod.rs`

30) GIVEN der Schalter „Fallback-Adresse `localhost`" ist im Test an
    WHEN `preview_frame_source` für `a.html` läuft und Anfragen mit `Host: localhost:{p}` und `Host: 127.0.0.1:{p}` kommen
    THEN beginnt die `url` mit `http://localhost:{p}/`, die erste Anfrage ergibt `200`, die zweite `421`; ist `[::1]` im Prüfabbild verfügbar, nimmt derselbe Port dort ebenfalls Verbindungen an
    [Source: API-8, VAL-1]
    Test: `src-tauri/src/modules/preview_server/mod.rs`

31) GIVEN eine Freigabe für `a.html` in einem ersten `PreviewServer` mit Geheimnis `T1`
    WHEN ein zweiter `PreviewServer` (ein neuer Terax-Lauf) eine Freigabe für dieselbe Datei anlegt und auf dessen Port `GET /T1/a.html` kommt
    THEN hat die neue Freigabe ein anderes Geheimnis `T2`, und die Antwort ist `404` ohne Rumpf
    [Source: TR-2, EP-4, SEC-1, BR-15]
    Test: `src-tauri/src/modules/preview_server/mod.rs`

32) GIVEN die installierte App am Mac (Release-Build) mit lokalen und SSH-HTML-Dateien
    WHEN „Open in Browser" gewählt, die Datei geändert und neu geladen, Terax beendet und neu gestartet wird
    THEN öffnet der Standard-Browser `http://127.0.0.1:{port}/…` ohne Firewall-Nachfrage, vom iPhone über die LAN-IP gibt es keine Verbindung (N-2, N-16); Neuladen zeigt den neuen Stand (N-3); nach dem Beenden lädt der Link nicht, nach dem Neustart braucht es einen neuen Klick (N-18); Messseite, PDF-Betrachter, Reichweite und Symlinks verhalten sich wie in N-8, N-17 und N-19
    [Source: BR-8, EP-2, EP-4, TR-2, BR-6, BR-14, BR-12] [Prüfweg: QA]

33) GIVEN eine Freigabe mit echtem Socket
    WHEN der Test `POST /T/a.html`, `GET /T/a.html` ohne `Host`, `GET /T/a.html` mit zwei `Host`-Zeilen und `GET /T/a.html` mit 65 Kopfzeilen an den Listener schickt
    THEN liest er vom Draht `405` mit `Allow: GET, HEAD`, `400`, `400` und `431`, jeweils mit leerem Rumpf und `Connection: close`
    [Source: OB-10, VAL-1, VAL-2, VAL-3, SEC-10]
    Test: `src-tauri/src/modules/preview_server/listener.rs`

34) GIVEN eine SSH-Freigabe für `devbox`, `ssh_read_budget` im Test 300 ms, Wartegrenze 5 s, und ein Host-Ersatz, der das übergebene Budget notiert, beim ersten Lesevorgang hängt, bis genau dieses Budget abgelaufen ist, und dann `TimedOut` meldet
    WHEN `a.png` und gleich danach `b.png` von `devbox` angefragt werden
    THEN bekam der Host-Ersatz als Budget genau 300 ms; `a.png` endet nach dem Budget und vor 1 s mit `504` „Terax could not read a.png from devbox: timed out"; danach ist der Platz frei, und `b.png` lädt mit `200`, ohne die Wartegrenze zu erreichen; die Grenzen-Struktur hat im Betrieb `ssh_read_budget` = 60 s, Wartegrenze 30 s, Kopf 10 s, Schreiben 30 s, Pause 250 ms, 16 und 64 Verbindungen, 8 Lesevorgänge, 1 je Host, 64 KiB, 64 Kopfzeilen und 256 Freigaben
    [Source: OB-12, SEC-14, SEC-16]
    Test: `src-tauri/src/modules/preview_server/source.rs`

35) GIVEN ein Host-Ersatz, dessen `realpath_typed` für `devbox` `Unreachable("the SSH server refused another session (MaxSessions limit)")` meldet, und ein zweiter Fall, in dem erst `stat_typed` so scheitert
    WHEN `preview_open_in_browser` jeweils für `/srv/p/a.html` auf `devbox` läuft
    THEN ist die Antwort beide Male `{ status: unreachable, reason: "the SSH server refused another session (MaxSessions limit)" }` (Grund aus OB-14, kein Anmelde-Hinweis), und es entsteht keine Freigabe
    [Source: API-1, BR-5]
    Test: `src-tauri/src/modules/preview_server/mod.rs`

36) GIVEN ein Test-Logger, der alle `log`-Einträge ab `trace` sammelt, und ein Ersatz-Opener, der `Err("Launcher \"open\" \"<Eintritts-Adresse>\" failed")` mit der vollen Eintritts-Adresse meldet
    WHEN `preview_open_in_browser` für `a.html`, `preview_frame_source` für `a.html`, ein `GET` mit falschem Geheimnis, ein `GET` auf eine Datei außerhalb des Bereichs (`403`) und ein `GET` mit SSH-Fehler (`502`) laufen
    THEN enthält kein gesammelter Log-Eintrag das Geheimnis `T` einer der Freigaben, die Eintritts-Adresse oder die Rahmen-Adresse; die Klick-Antwort ist `open_failed` mit einem Grund, in dem die Adresse durch `<link>` ersetzt ist und `T` nicht vorkommt
    [Source: SEC-1, SVC-11, API-1]
    Test: `src-tauri/src/modules/preview_server/mod.rs`

**Nicht in diesem Slice**

- Keine Änderung an `ssh.rs`: das typisierte Lesen baut slice-02-ssh-read-esc-monitor; bis zu dessen Merge antwortet der Leser im Betrieb mit dem Rumpf aus Slice-00. Ebenso keine Änderung an `asset.rs`, `guard.rs`, Capabilities und `tauri.conf.json`.
- Kein Range, kein Keep-Alive, keine Verzeichnis-Listen, keine Cookies, keine CORS-Kopfzeilen und keine Verweise ab der Seitenwurzel (`/assets/app.js`, Architektur Q&A 7).
- Kein Markdown-Rendern (Welle 2: SVC-20, `markdown.rs`, `pulldown-cmark`); nur die Vorbereitung aus den Deliverables.
- Kein Frontend und kein Aufrufer der Commands in der Webview (slice-04-preview-surfaces).

**Wie gebaut**

- **Merge-Commit:** `6088849` (Slice-Commits `41dc6d7`, `1df17a5`, `c69bc26` über `b474bca`; 7 Dateien, alle im Dateibereich; `Cargo.lock` unverändert bei 578 Paketen).
- **Gate auf `c69bc26`:** im Linux-Prüfabbild frisch gebaut (`clean -p terax`, `Compiling terax` im Log): `cargo test` 727 grün, 13 ignoriert (640 Bestand + 87 neu); Clippy `--all-targets -D warnings` Exit 0; kein Geheimnis im Diff. Typprüfung des Frontends im Feature-Worktree nach dem Merge Exit 0.
- **Review:** vier Diff-Reviews nach Dateibereich, Claim-Verifikation, Prüfung am echten Socket (382 Fälle, in der Nachmessung 428), Mutationsstufe (9 von 10 getötet; der Überlebende ist durch die zweistufige Prüfung erklärt). Runde 1: elf blockierende Befunde, alle von Nachprüfern oder durch zwei unabhängige Messungen bestätigt, in einer Fix-Runde behoben (`1df17a5`). Runde 2 (Delta): drei Reviews ohne blockierenden Befund, einer mit einem Kommentar-Befund, die Socket-Nachmessung mit einem Zielkonflikt; beide bestätigt. Runde 3 (`c69bc26`): diktierte Kommentar-Korrekturen und ein gehärteter Fehlerweg, am Diff und mit frischem Lauf geprüft.
- **Was die Fix-Runden geändert haben:** (1) Die Art der Bezugsdatei folgt dem aufgelösten Ziel; ein Symlink, dessen Name eine andere Art hat als sein Ziel, wird mit „the link points to a different kind of file" abgelehnt (vorher lieferte ein Bild- oder PDF-Name auf eine HTML-Datei aktives HTML ohne Abschottung, und der erste Klick legte Art und Reichweite fest). (2) Ohne ermittelbares, auflösbares UTF-8-Home gibt eine Freigabe nur die Datei frei. (3) `HEAD` bekommt an einer Stelle nie einen Rumpf. (4) `nosniff`, `no-store`, `no-referrer` stehen auf jeder Antwort, auch den leeren. (5) Das Leerlesen nach der Antwort ist auf 500 ms und 64 KiB begrenzt; ohne Geheimnis hält eine Gegenstelle einen Platz höchstens rund 10,5 s statt rund 40 s. (6) Ein vom Host gemeldetes Ziel muss absolut und normalisiert sein; der Bereichsordner selbst ist kein Ziel. (7) Die 502-/504-Seite trägt einen festen Satz mit Dateiname und Host; der Text des Hosts geht bereinigt und gekürzt nur ins Log und in den Grund der Klick-Antwort. (8) Scheitert die Opener-Aufgabe selbst, kommt der feste Grund zurück, nicht ihr Fehlertext. (9) Wartende SSH-Lesevorgänge behalten ihren Platz in der Reihe; das Log unterscheidet Wartegrenze und Lese-Budget.
- **Abweichungen vom Plan:** Kurze feste Texte auf 403/404 für Dateien (leer bleiben falsches Geheimnis, Host, Methode, Protokollfehler). `preview_frame_source` antwortet nur für HTML mit `ready`. Fehlende lokale Datei und Nicht-Datei beim Klick: `refused` mit Grund. Die Wiederholung nach `Unreachable` hält den Platz des Hosts über die Pause; erst der Platz des Hosts, dann einer der acht gesamt. `Content-Length: 0` bei GET wird angenommen. Der Wortlaut der 502-Seite weicht von AC 16 ab (fester Satz statt Host-Text, von der Steuereinheit angeordnet). `grant_scope` ohne Home gibt nur die Datei frei (der Plan regelte den Fall nicht). Die Frist des Leerlesens ist eine feste Konstante, kein Feld der Grenzen.
- **Auflage OB-11 zugeschnitten (Entscheidung der Steuereinheit nach Messung):** Die Antwort kommt vollständig an, solange der Client nach dem Kopf höchstens 64 KiB sendet und nach dem Schreibende binnen 500 ms schließt oder schweigt. Ein Client, der länger oder mehr sendet und langsam liest, kann den Rest an einen Reset verlieren (gemessen: 3 362 816 von 4 194 304 Byte). Der Server nimmt nur `GET` und `HEAD` ohne Rumpf an; ein Browser sendet danach nichts.
- **Bekannte Grenzen:** Ein lokaler Prozess oder eine Seite, die Ports durchprobiert, kann mit 16 gehaltenen Verbindungen einen Link und mit 64 alle Links sperren, bis die Fristen ablaufen (Plätze werden vor der Prüfung des Geheimnisses vergeben, weil es im Pfad steht). Unter Windows wird ein Tausch zwischen Öffnen und Nachprüfung nicht erkannt (dort wird erneut aufgelöst; hier nicht kompilierbar). Ein harter Link im Bereich auf eine Datei außerhalb wird ausgeliefert. Nachbar-Dateien werden nach dem angefragten Namen typisiert. Bare-Repos (`repo.git/`), Null-Breite-Zeichen und Homoglyphen fallen nicht unter die `.git`-Sperre. `scrub_link` erkennt keine Stücke des Geheimnisses unter 8 Byte und kein Geheimnis in anderer Groß-/Kleinschreibung. Testlücken ohne weitere Runde: die zweite Eigenschaft von AC 8 prüft keine UTF-8-Ersatzzeichen; der Wortlaut zweier neuer Gründe wird nur gegen die Konstante geprüft und der Frame-Weg dafür nicht; `is_normalized` hat keine Positivfälle mit Punkten im Namen; „kein Socket vor dem ersten Klick" zählt nur Freigaben.
- **An slice-02:** OB-20 (Fenster zwischen Auflösen und Öffnen im SSH-Helfer schließen), OB-21 (gemeldetes Ziel absolut und normalisiert), OB-22 (Abbruch nach 60 s hängt allein am übergebenen Budget). Offen bleibt danach: Über SSH wird die Fehlerart vor der Bereichsprüfung zur Antwort; für einen Symlink nach außen kann ein Skript der Seite erkennen, ob das Ziel existiert, ob es eine Datei ist und ob es über 10 MB liegt, nicht aber den Inhalt.
- **Nur am Mac:** der macOS-Zweig von `opened_path` (`F_GETPATH`) ist hier nie gebaut worden; OB-23 (Deskriptor-Limit bei bis zu 256 Listenern), OB-24 (Groß-/Kleinschreibung auf APFS), AC 32 und M-C.

### slice-02-ssh-read-esc-monitor: Typisiertes SSH-Lesen und Esc-Monitor

| Key | Value |
|-----|-------|
| **Dateibereich** | `src-tauri/src/modules/ssh.rs`, `src-tauri/src/modules/zen_escape.rs` |
| **Abhängigkeiten** | `[slice-00-contracts, slice-01-preview-server]` |
| **Anforderungen** | `BR-13, API-3, SVC-18, SVC-22, NFR-6, MIG-21, OB-2, OB-4, OB-6, OB-14` |

**Ziel.** Füllt die Rümpfe in Rust-Dateien außerhalb des Server-Moduls: `ssh::read_bytes_typed` mit Fehlerart aus dem Antwort-Umschlag des Helfers und übergebenem Zeitbudget (SVC-22, MIG-21), dazu `ssh::realpath_typed` und `ssh::stat_typed` für den Klickweg mit derselben Einordnung (Befund PR-02), und den macOS-Esc-Monitor samt Schalter (SVC-18, API-3). Die Änderung an der Kerndatei `ssh.rs` bleibt auf den neuen Weg begrenzt und vom übrigen Server-Code getrennt. Der Slice läuft nach slice-01-preview-server, weil Rust-Läufe auf der Werkbank seriell laufen und seine Linux-Prüfung (OB-2, NFR-6) dann den ganzen Server-Kern mit erfasst.

**Deliverables**

- `ssh.rs` (MIG-21, Architektur SVC-22 und Migration Map MIG-21): Die Helfer-Operation `read_bytes` meldet bei fehlendem Pfad, bei einer Nicht-Datei und bei Überschreitung der Grenze zusätzlich eine feste Art (`missing`, `not_regular`, `too_large`) im Antwort-Umschlag; alle übrigen Helfer-Operationen bleiben unverändert. Der Ausführungsteil von `run_remote_json` (`ssh.rs:1142-1209`) wird intern so geteilt, dass `read_bytes_typed` Exit-Code, stdout und stderr erreicht; `read_bytes_typed` liest die Art selbst aus dem Umschlag. `RemoteError`, `helper_answer` und `run_remote_json` behalten Form und Verhalten, ebenso `read_bytes`, `fs_read_remote_image`, `classify_ssh_error` und die Kopier-Muster (`ssh.rs:1910-1925`, `:1990-1994`, `:2045-2054`). Die drei Art-Texte stehen einmal als Rust-Konstanten (Muster Konstanten-Abgleich `ssh.rs:2462-2467`).
- Zeitbudget (Entscheidung des Users vom 25.11.2026, Befund PR-01): `read_bytes_typed` gibt genau den übergebenen Parameter `budget` an den Ausführungsteil und damit an `wait_child` (`ssh.rs:999-1028`), nicht `read_bytes_timeout`; nach dem Budget ist der `ssh`-Prozess beendet und das Ergebnis `TimedOut`. Der Mini-Server übergibt 60 s. `read_bytes` und `fs_read_remote_image` behalten `read_bytes_timeout`.
- `realpath_typed` und `stat_typed` (Befund PR-02): dieselbe Ausführung und dieselbe Einordnung wie `read_bytes_typed`, Budget `REMOTE_FS_TIMEOUT` wie `realpath` und `stat` (`ssh.rs:1465-1472`, `:1540-1547`); ein Helfer-Fehler ohne feste Art wird `Failed` mit dem Text des Helfers.
- Der Grund für eine abgelehnte Sitzung (OB-14) entsteht in der gemeinsamen Einordnung der drei typisierten Funktionen; `classify_ssh_error` bleibt für alle übrigen Aufrufer, wie es ist.
- `zen_escape.rs` (SVC-18, API-3): Schalter als plattformneutrales `AtomicBool`; die reine Entscheidung (Taste, Modifier, Schalter, Fenster) ist eine öffentliche Funktion außerhalb von `cfg`; macOS-Arm: lokaler Monitor für `KeyDown` nach dem Muster `install_tab_swipe_monitor` (`lib.rs:58-131`), der nur Ereignisse des Hauptfensters `main` wertet (OB-4), jedes Ereignis unverändert weitergibt und bei positiver Entscheidung `terax:zen-escape` ohne Nutzlast sendet; auf anderen Plattformen kein Monitor.
- Rust-Tests tragen den Anker als Namensanfang `ac<n>_`.

**Liefert**

| Vertrag | Signatur | Datei | Konsumenten |
|---------|----------|-------|-------------|
| -- | -- | -- | -- |

**Braucht**

| Vertrag | von Slice |
|---------|-----------|
| `RemoteReadError` | slice-00-contracts |
| `read_bytes_typed` | slice-00-contracts |
| `realpath_typed` | slice-00-contracts |
| `stat_typed` | slice-00-contracts |
| `zen_escape_arm` | slice-00-contracts |
| `install_zen_escape_monitor` | slice-00-contracts |
| `terax:zen-escape` | slice-00-contracts |

**Akzeptanzkriterien**

1) GIVEN der eingebettete Helfer läuft lokal mit `python3` wie in `run_helper` (ohne `python3` überspringt der Test wie die bestehenden Helfer-Tests)
   WHEN `read_bytes` für einen fehlenden Pfad, für einen Ordner und für eine Datei über der Grenze angefragt und die Antwort mit derselben Rust-Funktion dekodiert wird, die `read_bytes_typed` nutzt
   THEN ergibt das `Missing`, `NotRegularFile` und `TooLarge`; die Antwort für die zu große Datei enthält kein `b64` (Ablehnung vor der Übertragung)
   [Source: OB-6, SVC-22, MIG-21, BR-13]
   Test: `src-tauri/src/modules/ssh.rs`

2) GIVEN die drei festen Arten stehen einmal als Rust-Konstanten
   WHEN der Abgleich-Test sie gegen den Text des Helfers prüft und derselbe Prüfer auf eine Kopie des Helfer-Texts mit umbenanntem `not_regular` angewandt wird
   THEN steht jede Konstante wörtlich im Helfer, und für die Kopie meldet der Prüfer die fehlende Art (rote Gegenprobe)
   [Source: OB-6, MIG-21]
   Test: `src-tauri/src/modules/ssh.rs`

3) GIVEN die reine Einordnung von Exit-Code, stdout und stderr im typisierten Weg
   WHEN sie Exit 255 mit `ssh: connect to host devbox port 22: Connection refused`, eine Budget-Überschreitung, Exit 137 (Helfer durch Signal beendet), Exit 0 mit `{"ok": false, "error": "boom"}` ohne Art und Exit 0 mit `{"ok": true, "data": {"real": "/srv/p/a.png", "b64": "Zm9v"}}` einordnet
   THEN ergibt das `Unreachable(…)`, `TimedOut(…)`, `Failed(…)`, `Failed("boom")` und die Bytes `foo` mit dem Ziel `/srv/p/a.png`
   [Source: SVC-22, MIG-21]
   Test: `src-tauri/src/modules/ssh.rs`

4) GIVEN Exit 255 und stderr `mux_client_request_session: session request failed: Session open refused by peer` gefolgt von `Permission denied (publickey).`
   WHEN die gemeinsame Einordnung der typisierten Funktionen das für `read_bytes_typed`, `realpath_typed` und `stat_typed` einordnet
   THEN ist das Ergebnis jedes Mal `Unreachable("the SSH server refused another session (MaxSessions limit)")`, und der Grund enthält nicht `open a terminal`; `classify_ssh_error` liefert für denselben stderr weiter den heutigen Anmelde-Hinweis
   [Source: OB-14]
   Test: `src-tauri/src/modules/ssh.rs`

5) GIVEN `read_bytes_typed("devbox", "/srv/p/a.png", 10485760, Duration::from_secs(60))`
   WHEN Anfrage und Zeitbudget bestimmt werden
   THEN ist die Anfrage die Helfer-Operation `read_bytes` mit `limit` 10485760 und das Budget des `ssh`-Aufrufs genau 60 s, nicht `read_bytes_timeout(10485760, None)` (244 s); `read_bytes` budgetiert weiter mit `read_bytes_timeout`; der bestehende Test `wait_child_kills_a_hung_child_after_the_budget` belegt das Beenden nach dem Budget; die bestehenden Tests `embedded_helper_read_bytes_returns_exact_bytes_within_the_cap`, `read_bytes_budgets_for_the_known_size_and_falls_back_to_the_cap` und alle übrigen Tests in `ssh.rs` laufen unverändert grün
   [Source: BR-13, MIG-21]
   Test: `src-tauri/src/modules/ssh.rs`

6) GIVEN die reine Entscheidung des Esc-Monitors außerhalb von `cfg`
   WHEN sie für Esc (keyCode 53) ohne Modifier bei scharfem Schalter im Hauptfenster, für Esc bei nicht scharfem Schalter, für Esc mit Cmd, Shift, Control oder Option, für Return (keyCode 36) und für Esc im Einstellungsfenster entscheidet
   THEN sendet sie nur im ersten Fall `terax:zen-escape`
   [Source: SVC-18, OB-4]
   Test: `src-tauri/src/modules/zen_escape.rs`

7) GIVEN Linux
   WHEN `zen_escape_arm(true)` und danach `zen_escape_arm(false)` gerufen werden
   THEN zeigt der Schalter erst `true`, dann `false`; es wird kein Monitor installiert und kein Event gesendet
   [Source: API-3]
   Test: `src-tauri/src/modules/zen_escape.rs`

8) GIVEN slice-01-preview-server und dieser Slice sind gemergt
   WHEN im Linux-Prüfabbild `clippy --locked -- -D warnings` und `test --locked --no-fail-fast -- --test-threads=2` laufen
   THEN enden beide mit Exit 0; der macOS-Arm von `zen_escape.rs` wird dort nicht übersetzt, Schalter und Entscheidung erzeugen keine Warnung; im Review der `cfg`-Zweige vergleichen die Windows-Arme von `within` und `opened_path` über `fs::to_canon`, und die Symlink-Tests stehen unter `cfg(unix)` (Windows wird hier nicht übersetzt)
   [Source: OB-2, NFR-6]
   Test: `src-tauri/src/modules/zen_escape.rs` (im vollen Lauf mit dem ganzen Crate)

9) GIVEN die installierte App am Mac
   WHEN im Zen über einer HTML-Vorschau nach einem Klick in die Seite Esc gedrückt wird, im Einstellungsfenster Esc gedrückt wird, im Zen in einem Terminal-Tab mit laufendem Claude Code Esc gedrückt wird, eine Seite mit 30 Bildern vom SSH-Server bei 7 offenen Terminal-Tabs geladen und danach die Verbindung mit `ssh -O exit` getrennt wird
   THEN endet Zen im ersten Fall, im zweiten nicht, im dritten bricht Claude Code ab und Zen bleibt (N-10, N-21); alle Bilder laden, kein Terminal-Tab und kein Git-Aufruf scheitert, nach der Trennung zeigt der Browser „Terax could not read …" (N-4, N-20, N-25)
   [Source: SVC-18, OB-4, BR-13] [Prüfweg: QA]

10) GIVEN die Antwort-Einordnung von `realpath_typed` und `stat_typed`
    WHEN sie Exit 0 mit `{"ok": true, "data": "/srv/p/a.html"}` (realpath), Exit 0 mit `{"ok": true, "data": {"size": 2048, "mtime": 1, "kind": "file"}}` (stat), Exit 0 mit `{"ok": false, "error": "[Errno 2] No such file or directory"}` und Exit 255 mit `ssh: connect to host devbox port 22: Connection refused` einordnet
    THEN ergibt das `Ok("/srv/p/a.html")`, einen `FileStat` mit `size` 2048 und Art Datei, `Failed("[Errno 2] No such file or directory")` und `Unreachable(…)`; das Budget beider Aufrufe ist `REMOTE_FS_TIMEOUT` (30 s)
    [Source: OB-14, SVC-22]
    Test: `src-tauri/src/modules/ssh.rs`

**Nicht in diesem Slice**

- Keine Änderung an `read_bytes`, `fs_read_remote_image`, `classify_ssh_error` und den übrigen Helfer-Operationen; kein neuer Leseweg (Range, Streaming) und keine Änderung an den `ControlMaster`-Argumenten (Hinweis RT-D5 aus Gate 1 bleibt Hinweis).
- Keine Zuordnung von Fehlerarten zu HTTP-Codes (slice-01-preview-server) und kein Frontend-Teil von Esc (slice-03-zen-swipe).
- Kein Test, der den macOS-Monitor auf Linux vortäuscht: was nur am Mac prüfbar ist, steht in AC 9.

**Wie gebaut**

- **Merge-Commit:** `f180fa8` (Slice-Commits `b1b90f9`, `f4daf19` über `712f137`; 2 Dateien, beide im Dateibereich; keine Bestandsfunktion und keine bestehende Testfunktion in `ssh.rs` entfernt; `Cargo.toml`/`Cargo.lock` unverändert). Der Slice lief parallel zu den Gates von slice-01 und slice-04 statt danach (die Sperre stellt die Rust-Läufe in eine Reihe; die Dateibereiche sind getrennt).
- **Gate:** auf `f4daf19` frisch gebaut 663 grün, 13 ignoriert (640 Bestand + 23 neu), Clippy Exit 0. **Auf dem zusammengeführten Stand `f180fa8` (AC 8, mit dem ganzen Server-Kern):** `cargo test` 750 grün, 13 ignoriert; Clippy `--all-targets -D warnings` Exit 0; macOS-Typprüfung (`cargo check --lib --target aarch64-apple-darwin`, ohne Linken) Exit 0 ohne Warnung; Frontend unverändert grün (Typprüfung, 1826 Tests, Lint). Die Helfer-Tests laufen im Prüfabbild wirklich (Python 3.11).
- **Review:** Diff-Review (ohne blockierenden Befund), Claim-Verifikation mit echtem Wettlauf, Mutationsstufe (10 von 10 getötet). Ein blockierender Befund aus der Claim-Verifikation, vom Nachprüfer bestätigt, in einer Fix-Runde behoben (`f4daf19`); Delta-Review ohne blockierenden Befund.
- **OB-20 gelöst (Fenster zwischen Auflösen und Öffnen):** Der typisierte Weg setzt in der Anfrage `"exact": true`; der Helfer öffnet das aufgelöste Ziel dann Komponente für Komponente über `dir_fd` mit `O_NOFOLLOW` (Ordner mit `O_PATH` bzw. `O_RDONLY` und `O_DIRECTORY`). Gemessen mit `renameat2 RENAME_EXCHANGE`: mit `exact` 0 Lecks in 561 551 Lesungen (268 248 abgelehnt), ohne `exact` 91 094 Lecks in 709 763 — der Wettlauf trifft, der neue Weg hält. Tausch erkannt → `Failed("the path changed while it was read")`; Host ohne `dir_fd`, `O_NOFOLLOW` oder `O_DIRECTORY` → `Failed("this host cannot open a file without following symlinks")`. Der Bestand (`read_bytes` ohne `exact`, Bilder im Editor) öffnet wie bisher.
- **Was die Fix-Runde geändert hat:** (1) Kein Test bemerkte, wenn das Budget innerhalb von `run_remote_helper` vor `wait_child` verändert wird. `run_remote_helper` bekommt jetzt das zu startende Programm als Wert (privater `Launcher`, im Betrieb `ssh` ohne Zusatzargumente — dasselbe Kommando wie vorher); ein Test führt den echten Rumpf mit einem hängenden `sh -c 'exec sleep 30'` und 300 ms Budget aus und erwartet `TimedOut`. (2) Kommentare nennen jetzt Garantie und Restgrenzen des strengen Öffnens, beide Herkünfte der Fehlertexte und was der Esc-Monitor tut; Prozess-Kennungen sind aus dem Produktionscode entfernt. (3) Liegt nach der Vorprüfung ein Ordner an letzter Stelle, kommt die Art `not_regular`, und kein Deskriptor bleibt offen. (4) Die Bereinigung der Fehlertexte ersetzt auch Zeilentrenner und Richtungszeichen (U+2028 ff.).
- **Abweichungen vom Plan:** Anfrage-Feld `exact` und `_open_exact` im Helfer (OB-20, von der Steuereinheit angeordnet). `missing` nur bei `ENOENT`; ein Pfad durch eine Datei (`ENOTDIR`) bleibt `Failed` mit Text (im Browser 502 statt 404). `/` selbst gilt als exaktes Ziel. Steuer- und Formatzeichen werden durch Leerzeichen ersetzt, Texte auf 300 Zeichen gekürzt. Neue öffentliche Elemente in `zen_escape.rs` (`Modifiers`, `ends_zen`, `ZEN_ESCAPE_EVENT`, `ESCAPE_KEY_CODE`, `MAIN_WINDOW_LABEL`). `fstat` vor `fdopen` gilt auch für den Bestandsweg: sichtbar nur im Wettlauf „Ordner an letzter Stelle" (anderer Fehlertext, kein offener Deskriptor) — als Abweichung von „Bestand unverändert" hingenommen.
- **Bekannte Grenzen:** Das strenge Öffnen erkennt nicht (1) einen Ordner, der verschoben wird, nachdem er betreten ist, und (2) den Tausch gegen einen anderen echten Ordner, eine andere echte Datei oder einen harten Link (dann wird gelesen, was beim Öffnen unter dem gemeldeten Pfad liegt; setzt Schreibrecht im freigegebenen Ordner voraus). Auf einem macOS-Host (kein `O_PATH`) braucht der strenge Weg Leserecht auf jedem Zwischenordner; ein Ordner mit nur Durchgangsrecht ergibt dort eine Fehlerseite, obwohl der Editor die Datei liest. Liegt das aufgelöste Ziel außerhalb des Bereichs, liest der Helfer trotzdem und überträgt die Bytes an die App; erst dort lehnt der Server ab (wie entworfen). Für die Bild-Vorschau des Editors über SSH (`fs_read_remote_image`, Bestand) bleibt das Fenster zwischen Auflösen und Öffnen offen. Exit 1–127 des Helfers wird `Unreachable` (aus `exit_error` geerbt). Rust setzt den Esc-Schalter nie selbst zurück; lädt die Webview neu, während er scharf ist, bleibt er scharf (das Frontend verwirft das Ereignis). Ohne `python3` laufen 31 Helfer-Tests still grün, 6 davon neu (Bestandsmuster; im Prüfabbild ist Python da). Der Laufzeit-Budgettest erkennt kein Überschreiben mit einem anderen Wert unter 1 s.
- **Nur am Mac:** der macOS-Arm des Esc-Monitors ist typgeprüft, aber nie gelinkt oder gelaufen (Fenster-Zuordnung über `windowNumber`, Aufrufe je Tastendruck bei scharfem Schalter, Esc mit Feststelltaste, gehaltenes Esc, Eingabe mit Akzent-Auswahl); AC 9; auf macOS-Hosts `dir_fd` in Python und die Fehlernummer beim Öffnen eines Symlinks mit `O_DIRECTORY|O_NOFOLLOW`.

### slice-03-zen-swipe: Zen-Modus und Wisch-Ausnahme

| Key | Value |
|-----|-------|
| **Dateibereich** | `src/modules/zen/index.ts`, `src/modules/zen/lib/zenStore.ts`, `src/modules/zen/lib/zenStore.test.ts`, `src/modules/zen/lib/zenChrome.ts`, `src/modules/zen/lib/zenChrome.test.ts`, `src/modules/zen/lib/usePaneFrameClass.ts`, `src/modules/zen/lib/usePaneFrameClass.test.ts`, `src/modules/zen/lib/zenEscape.ts`, `src/modules/zen/lib/zenEscape.test.ts`, `src/modules/zen/lib/useZenEscape.ts`, `src/modules/zen/lib/useZenEscape.test.ts`, `src/modules/zen/ZenToggleButton.tsx`, `src/modules/zen/ZenToggleButton.test.tsx`, `src/app/App.tsx`, `src/app/components/WorkspaceSurface.tsx`, `src/app/components/WorkspaceSurface.zen.test.tsx`, `src/app/components/WorkspaceInputBar.tsx`, `src/app/components/WorkspaceInputBar.zen.test.tsx`, `src/modules/sidebar/useSidebarPanel.ts`, `src/modules/sidebar/useSidebarPanel.zen.test.ts`, `src/modules/preview/PreviewPane.tsx`, `src/modules/editor/GitDiffPane.tsx`, `src/modules/editor/AiDiffPane.tsx`, `src/modules/tabs/lib/tabSwipe.ts`, `src/modules/tabs/lib/defersToActivePreview.test.ts`, `src/modules/tabs/lib/useTabSwipe.ts`, `src/modules/tabs/lib/useTabSwipe.test.ts` |
| **Abhängigkeiten** | `[slice-00-contracts]` |
| **Anforderungen** | `BR-18, BR-19, BR-20, FL-5, FL-6, FL-7, UI-4, ST-3, ST-4, TR-3, TR-4, TG-6, TG-7, API-4, API-7, SVC-15, SVC-16, SVC-17, MIG-10, MIG-11, MIG-12, MIG-13, MIG-14, MIG-17, MIG-18, MIG-19, MIG-20` |

**Ziel.** Baut den ausgebauten Zen-Modus (eigener Store, was im Zen weicht, Esc in Vorschau-Tabs, Zen-Taste, Seitenleiste ohne Speichern) und die Wisch-Regel für die aktive HTML-Vorschau, samt Verdrahtung in `App.tsx`, `WorkspaceSurface.tsx`, `WorkspaceInputBar.tsx` und den Rahmen von Web-Vorschau, Git-Diff und KI-Diff. Quellen: Architektur API-4, API-7, SVC-15 bis SVC-17, MIG-10 bis MIG-14, MIG-17 bis MIG-20, Q&A 1 bis 3. Der Slice liefert Zen-Zustand, Rahmen-Hook und Zen-Taste an slice-04-preview-surfaces.

**Deliverables**

- `src/app/App.tsx` (MIG-11): Zen kommt aus `useZenStore`; `useState` für `zenMode` und `setZenMode` entfallen; das Kürzel `view.zenMode` ruft `toggleZen`; die Leser (`App.tsx:975`, `:1497`, `:1539`) lesen den Store; im Zen nach `zenChrome`: Kopf (`:1634`) und Statusleiste (`:1796`) weg, Seitenleiste über `collapseForZen` und `restoreAfterZen` (MIG-20), Griff `ResizableHandle` weg, `WorkspaceInputBar` bekommt `hiddenInZen`; `useZenEscape()` genau einmal eingebunden; `useTabSwipe(appRootRef, swipeTab, (target) => defersToActivePreview(activeTab?.kind, target))`. Sweep-Kriterium: `grep -rn "zenMode" src` ohne Testdateien zeigt nur Leser, geschrieben wird nur in `zenStore.ts`.
- `src/modules/preview/PreviewPane.tsx` (MIG-17), `src/modules/editor/GitDiffPane.tsx` (MIG-18), `src/modules/editor/AiDiffPane.tsx` (MIG-19): die Rahmen- und Eckenklassen kommen aus `usePaneFrameClass()`; sonst keine Änderung (Sandbox, Adressleiste und `referrerPolicy` bleiben; `PreviewPane.test.ts` bleibt grün, INV-4).
- `src/modules/tabs/lib/tabSwipe.ts` (MIG-14): `defersToActivePreview` neben dem unveränderten `isInsideHorizontalScroller` (INV-1).
- `src/modules/zen/index.ts`: Barrel mit `useZenStore`, `zenChrome`, `usePaneFrameClass`, `useZenEscape` und `ZenToggleButton`.
- Das Zen-Modul importiert aus dem Editor-Modul nur reine Dateien (zum Beispiel `@/modules/editor/lib/binaryPreview`), nie den Barrel `@/modules/editor`; `src/app/eager-budget.test.ts` bleibt grün.
- Bestehende Testdateien bleiben unverändert (`isInsideHorizontalScroller.test.ts`, `useSidebarPanel.test.ts`, `statusConsumers.test.ts`, `PreviewPane.test.ts`, `shortcuts.test.ts`, `commands.test.ts`); neue Tests stehen in neuen Dateien.

**Liefert**

| Vertrag | Signatur | Datei | Konsumenten |
|---------|----------|-------|-------------|
| `useZenStore` | zustand-Hook; Zustand `{ on: boolean }`; Aktionen `enterZen(): void`, `exitZen(): void`, `toggleZen(): void`; einziger Schreiber des Zen-Zustands (API-7) | `src/modules/zen/lib/zenStore.ts` | slice-04-preview-surfaces (Kopfzeile im Zen), `App.tsx` |
| `usePaneFrameClass` | `() => string`: außerhalb von Zen `"rounded-md border border-border/60"`, im Zen `""` | `src/modules/zen/lib/usePaneFrameClass.ts` | slice-04-preview-surfaces (HTML, Markdown, Editor), Web-Vorschau, Git-Diff, KI-Diff |
| `ZenToggleButton` | `(props: { className?: string }) => JSX.Element`; `aria-pressed` gleich Zen an, Klick ruft `toggleZen`; Name und `title` „Toggle zen mode" als HTML-Attribut wie `PreviewAddressBar.tsx:139`, kein Radix-`Tooltip` (braucht einen `TooltipProvider`, den `EditorPane.preview-env.test.tsx` nicht hat; Auflage PR-06), kein Tauri-Aufruf beim Rendern | `src/modules/zen/ZenToggleButton.tsx` | slice-04-preview-surfaces (Slot der Kopfzeile) |

**Braucht**

| Vertrag | von Slice |
|---------|-----------|
| `zen_escape_arm` | slice-00-contracts |
| `terax:zen-escape` | slice-00-contracts |

**Akzeptanzkriterien**

1) GIVEN der frische Zen-Store
   WHEN nacheinander `enterZen`, `toggleZen`, `toggleZen`, `exitZen` und noch einmal `exitZen` gerufen werden
   THEN ist `on` vorher `false` (`zen_off`), danach `true`, `false`, `true`, `false` und `false`
   [Source: API-7, ST-3, ST-4, TR-3, TR-4]
   Test: `src/modules/zen/lib/zenStore.test.ts`

2) GIVEN `zenChrome`
   WHEN es für Zen aus mit jeder Tab-Art, für Zen an mit `terminal` und für Zen an mit `editor`, `html`, `markdown`, `preview`, `ai-diff`, `git-diff`, `git-history`, `git-commit-file` und ohne aktiven Tab bestimmt wird
   THEN ist bei Zen aus alles sichtbar; bei Zen an mit `terminal` sind `header`, `statusBar`, `sidebar`, `resizeHandle`, `surfacePadding` und `paneFrame` aus und `inputBar` an; in allen übrigen Fällen mit Zen an ist alles aus, auch `inputBar`
   [Source: SVC-15, BR-19, FL-5]
   Test: `src/modules/zen/lib/zenChrome.test.ts`

3) GIVEN `usePaneFrameClass` in einer Test-Komponente
   WHEN Zen aus ist, eingeschaltet und wieder ausgeschaltet wird
   THEN liefert der Hook `"rounded-md border border-border/60"`, dann `""`, dann wieder `"rounded-md border border-border/60"`
   [Source: SVC-15, BR-19]
   Test: `src/modules/zen/lib/usePaneFrameClass.test.ts`

4) GIVEN `zenEscapeArmed` und `shouldExitZenOnEscape`
   WHEN Zen an ist und der aktive Tab `html`, `markdown`, `editor` mit `a.png`, `a.jpg` oder `doc.pdf`, `editor` mit `main.rs` oder `icon.svg`, `terminal` oder `preview` ist, wenn Zen aus ist mit `html`, und wenn Zen an ist mit `html` bei offenem Dialog oder Menü
   THEN ist der Monitor bei `html`, `markdown`, `a.png`, `a.jpg` und `doc.pdf` scharf und sonst nicht; `shouldExitZenOnEscape` ist nur in den scharfen Fällen ohne offene Überlagerung wahr
   [Source: SVC-16, BR-20, TR-4, FL-6]
   Test: `src/modules/zen/lib/zenEscape.test.ts`

5) GIVEN `useZenEscape` mit ersetztem `invoke` und `listen`, Zen an und aktiver Tab `html`
   WHEN der aktive Tab zu `terminal` wechselt, `terax:zen-escape` bei Tab `html` eintrifft, im Dokument Escape bei Tab `markdown`, bei Tab `terminal` und bei Tab `markdown` mit offenem Element `[role="dialog"]` gedrückt wird
   THEN ruft der Hook zuerst `invoke("zen_escape_arm", { armed: true })` und beim Wechsel `invoke("zen_escape_arm", { armed: false })`; das Event setzt `on` auf `false`; Escape bei `markdown` beendet Zen, bei `terminal` und bei offenem Dialog bleibt Zen an
   [Source: API-4, FL-6, TR-4, TG-6, BR-20]
   Test: `src/modules/zen/lib/useZenEscape.test.ts`

6) GIVEN `ZenToggleButton` bei Zen aus, gerendert ohne `TooltipProvider`
   WHEN die Taste zweimal geklickt wird
   THEN hat sie den Namen „Toggle zen mode", das Attribut `title` mit diesem Text und `aria-pressed="false"` (`off`), nach dem ersten Klick ist Zen an und `aria-pressed="true"` (`on`), nach dem zweiten wieder aus
   [Source: UI-4, TR-3, FL-5, TG-6]
   Test: `src/modules/zen/ZenToggleButton.test.tsx`

7) GIVEN `WorkspaceSurface` mit ersetzten Stacks
   WHEN es mit Zen aus und mit Zen an gerendert wird
   THEN tragen bei Zen aus die sieben Schichten für Terminal, Editor, Web-Vorschau, Markdown, HTML, KI-Diff und Git-Diff `px-3 pt-2 pb-2`, bei Zen an keine dieser Klassen; die Git-Verlauf-Schicht ist in beiden Fällen ohne Polster
   [Source: MIG-10, BR-19]
   Test: `src/app/components/WorkspaceSurface.zen.test.tsx`

8) GIVEN `WorkspaceInputBar` mit ersetzten KI- und Terminal-Modulen, offenem KI-Panel und geladenen Schlüsseln
   WHEN es mit `hiddenInZen` an, mit `hiddenInZen` aus und ohne die Prop gerendert wird
   THEN bleibt die Eingabe bei `hiddenInZen` an im DOM (nicht ausgehängt, ein Entwurf bleibt erhalten) und ist verborgen (`hidden`); bei aus und ohne Prop ist sie sichtbar wie auf `cf07327`
   [Source: MIG-12, BR-19]
   Test: `src/app/components/WorkspaceInputBar.zen.test.tsx`

9) GIVEN `localStorage` mit `terax.sidebar.width` gleich `300` und `terax.sidebar.collapsed` gleich `0`, die Seitenleiste offen mit 300 px (ersetztes Panel-Handle)
   WHEN `collapseForZen()` läuft und das Panel danach 0 px meldet, dann `restoreAfterZen()` läuft, und ein zweiter Durchlauf mit vorher eingeklappter Leiste folgt
   THEN ist `sidebarCollapsed` nach dem Einklappen `true`, `terax.sidebar.collapsed` bleibt `0` und die Breite `300`; nach dem Wiederherstellen ist das Panel auf `300px` gesetzt und `sidebarCollapsed` `false`; war die Leiste vorher eingeklappt, bleibt sie es ohne Größenaufruf
   [Source: MIG-20, BR-19]
   Test: `src/modules/sidebar/useSidebarPanel.zen.test.ts`

10) GIVEN `defersToActivePreview`
    WHEN es mit `("html", null)`, `("html", <div>)`, `("markdown", null)`, `("terminal", null)` und `(undefined, null)` gerufen wird
    THEN ist es nur im ersten Fall wahr; `isInsideHorizontalScroller` ist unverändert, seine Tests in `isInsideHorizontalScroller.test.ts` laufen ohne Änderung grün
    [Source: SVC-17, MIG-14, BR-18, FL-7, TG-7]
    Test: `src/modules/tabs/lib/defersToActivePreview.test.ts`

11) GIVEN `useTabSwipe` mit ersetztem `listen` und nichts unter dem Zeiger
    WHEN `terax:tab-swipe` mit Richtung `1` eintrifft, während `shouldDefer` `true` liefert, dann während es `false` liefert, und in einem dritten Aufbau ohne `shouldDefer`
    THEN wird `onSwipe` im ersten Fall nicht gerufen, im zweiten mit `1` und im dritten mit `1` wie heute
    [Source: MIG-13, BR-18, FL-7]
    Test: `src/modules/tabs/lib/useTabSwipe.test.ts`

12) GIVEN die installierte App am Mac
    WHEN Zen per Mod+Shift+' und per Taste in einem Terminal- und einem HTML-Tab ein- und ausgeschaltet wird, die Seitenleiste vorher auf 300 px gezogen und Terax danach neu gestartet wird, und waagerecht über einer HTML-Vorschau, in einem Code-Tab und mit ausgeschalteter Einstellung „Trackpad swipe to switch tabs" gewischt wird
    THEN verschwinden im Zen Kopf, Statusleiste, Seitenleiste, Griff, Polster und Rahmen, die Eingabezeile bleibt nur im Terminal-Tab, die Ampelknöpfe stören nicht (N-11); danach ist die Leiste wieder 300 px breit und nach dem Neustart offen (N-22); über der HTML-Vorschau wechselt kein Tab, im Code-Tab wie heute, mit ausgeschalteter Einstellung nie (N-12)
    [Source: BR-18, BR-19, BR-20, FL-5, FL-6, FL-7] [Prüfweg: QA]

**Nicht in diesem Slice**

- Kein Rust: den Esc-Monitor baut slice-02-ssh-read-esc-monitor; bis dahin wirkt Esc nur mit Fokus außerhalb der Seite.
- Keine Änderung an `HtmlPreviewPane.tsx`, `MarkdownPreviewPane.tsx`, `EditorStack.tsx` und `EditorPane.tsx`: Rahmen, Kopfzeile und `data-no-tab-swipe` dort baut slice-04-preview-surfaces.
- Kein Eintrag in der Befehlspalette und kein Speichern des Zen-Zustands über einen Neustart (Discovery: Zen ist nicht dauerhaft).
- Kein Fix des Scroll-Hängers über die Wisch-Ausnahme hinaus (H2 bis H6, Mac N-13).

**Wie gebaut**

- **Merge-Commit:** `a5b5753` (Slice-Commit `a61c5c6` über `b474bca`, 27 Dateien, alle im Dateibereich; keine bestehende Testdatei geändert).
- **Gate auf `a61c5c6`:** `pnpm check-types` Exit 0; Vitest 1676 grün in 150 Dateien (1508 Bestand + 168 neu); kein Rust im Slice.
- **Review:** zwei Diff-Reviews (Zen-Modul, App-Teil), Claim-Verifikation, Mutationsstufe. Fünf blockierende Befunde, alle vom Nachprüfer bestätigt, in zwei Fix-Runden behoben, beide Delta-Reviews ohne offenen blockierenden Befund: (1) Kommentare behaupteten, die HTML-Pane melde sich schon per `data-no-tab-swipe` vom Wischen ab; sie beschreiben jetzt nur, was dieser Code tut. (2) Seitenleiste: im Zen ließ sich die Kante trotz ausgehängtem Griff ziehen (react-resizable-panels baut die Ziehzone auch ohne Separator), Anzeige und Speicher liefen auseinander; jetzt stellt `restoreAfterZen` die gespeicherte Breite her, und die Panel-Gruppe ist im Zen `disabled`. (3) `ai.toggle` schaltete im Zen über Vorschau- und Code-Tabs unsichtbar um; jetzt tut es dort nichts, über Kürzel und Befehlspalette (reine Funktion `aiToggleAllowed`). (4) `isOverlayOpen` übersah Überlagerungen ohne Dialog-/Menü-Rolle (Streamdown-Link-Dialog, KI-Mini-Fenster); jetzt hält jede der 14 erhobenen Esc-Überlagerungen den Zen (`ESC_OVERLAY_SELECTORS`). (5) `title` der Zen-Taste ohne Kürzel, entgegen der Entscheidung des Users; jetzt „Toggle zen mode · {Kürzel}" über `useShortcutLabel`.
- **Abweichungen vom Plan:** `useZenEscape(activeTab)` bekommt den aktiven Tab als Parameter (Plan: ohne). Der `title` der Zen-Taste trägt das Kürzel aus den Einstellungen; „Liefert" und AC 6 dieses Abschnitts nennen noch den nackten Text, maßgeblich ist die Entscheidungszeile des Users. Zusätzliche Esc-Regeln: zwei Wege (DOM-`keydown` in der Capture-Phase, natives Event), 500-ms-Sperre gegen doppelte Erkennung desselben Tastendrucks, kein Verlassen bei offener Überlagerung. Die Eingabezeile wird über das Attribut `hidden` verborgen (eine CSS-Regel außerhalb der Layer schlüge die Tailwind-Klasse). Bild-Endungen der Esc-Regel aus `IMAGE_EXTS` ohne `svg`, dazu `pdf`.
- **Bekannte Grenzen:** Die Verdrahtung in `App.tsx` (Kopf, Statusleiste, Seitenleisten-Effekt, Griff, Eingabezeile, `useZenEscape`, drittes Argument von `useTabSwipe`, `disabled` an der Panel-Gruppe, Zen-Regel der KI-Leiste) hat keinen eigenen Test; sechs eingebaute Verdrahtungsfehler ließen alle Tests grün, die Typprüfung fing drei. Sie ist nur am Mac prüfbar (AC 12, je Punkt eine Zeile der Checkliste). „Ask selection" (`ai.askSelection`) setzt im Zen über Vorschau- und Code-Tabs weiter unsichtbar den Panel-Zustand (Stelle in `chatStore.ts`, außerhalb des Dateibereichs). Esc in einem Eingabefeld des Explorers beendet über einer Vorschau den Zen. Die Esc-Regel entscheidet nach der Endung, nicht danach, was der Editor zeigt. Die Hülle `data-esc-overlay` um den Tab-Wechsler entscheidet nie selbst (der Tab-Wechsler stoppt das Esc vorher). Im Zen liegen ohne Kopf die Ampelknöpfe über der ersten Zeile von Terminal, Diff-Ansichten und Web-Vorschau (Mac N-11).
- **An slice-04:** Die Entscheidung „über einer HTML-Vorschau wechselt Wischen nie den Tab" ist erst erfüllt, wenn `HtmlPreviewPane` `data-no-tab-swipe` trägt; bis dahin hält nur der Fall ohne gehovertes Element. `ZenToggleButton` rendert ohne `TooltipProvider` und läuft mit den Mocks von `EditorPane.preview-env.test.tsx`.

### slice-04-preview-surfaces: Kopfzeile, Open in Browser, Neu laden und Vorschau über den Mini-Server

| Key | Value |
|-----|-------|
| **Dateibereich** | `src/modules/preview-server/index.ts`, `src/modules/preview-server/lib/browserOpenable.ts`, `src/modules/preview-server/lib/browserOpenable.test.ts`, `src/modules/preview-server/lib/browserOpenText.ts`, `src/modules/preview-server/lib/browserOpenText.test.ts`, `src/modules/preview-server/lib/openInBrowser.ts`, `src/modules/preview-server/lib/openInBrowser.test.ts`, `src/modules/preview-server/OpenInBrowserButton.tsx`, `src/modules/preview-server/OpenInBrowserButton.test.tsx`, `src/modules/preview-server/browserOpen.guard.test.ts`, `src/modules/doc/index.ts`, `src/modules/doc/PreviewHeader.tsx`, `src/modules/doc/PreviewHeader.test.tsx`, `src/modules/doc/lib/previewHeader.ts`, `src/modules/doc/lib/previewHeader.test.ts`, `src/components/ui/DocViewToggle.tsx`, `src/modules/html/HtmlPreviewPane.tsx`, `src/modules/html/HtmlPreviewPane.test.tsx`, `src/modules/html/HtmlPreviewPane.sandbox.test.ts`, `src/modules/html/lib/htmlPreviewSource.ts`, `src/modules/html/lib/htmlPreviewSource.test.ts`, `src/modules/markdown/MarkdownPreviewPane.tsx`, `src/modules/markdown/MarkdownPreviewPane.header.test.tsx`, `src/modules/editor/EditorStack.tsx`, `src/modules/editor/EditorStack.header.test.tsx`, `src/modules/editor/EditorPane.tsx`, `src/modules/editor/EditorPane.header.test.tsx`, `src/modules/explorer/FileExplorer.tsx`, `src/modules/explorer/FileExplorer.openInBrowser.test.tsx` |
| **Abhängigkeiten** | `[slice-00-contracts, slice-03-zen-swipe]` |
| **Anforderungen** | `BR-7, BR-16, BR-21, BR-22, BR-23, BR-24, BR-25, FL-1, FL-4, EP-6, UI-1, UI-2, UI-3, UI-5, TG-1, TG-2, TG-5, TG-8, API-5, API-6, SVC-12, SVC-13, SVC-14, SVC-19, SEC-3, SEC-8, SEC-9, NFR-8, MIG-5, MIG-6, MIG-7, MIG-8, MIG-9, MIG-15, OB-5, OB-18` |

**Ziel.** Bringt alles, was die Vorschau-Flächen zeigen: „Open in Browser" im Frontend (Taste, Explorer-Eintrag, Toasts, Guard-Test), die gemeinsame Kopfzeile über HTML, Markdown, Raw, Bild und PDF mit Neu laden, Rendered/Raw und Zen-Taste, die Wisch-Ausnahme am HTML-Pane-Element und die In-App-HTML-Vorschau über den Mini-Server (Baustein E) mit dem heutigen Ladeweg als Rückfall hinter einer Konstante. Quellen: Architektur API-5, API-6, SVC-12 bis SVC-14, SVC-19, SEC-3, SEC-8, SEC-9, MIG-5 bis MIG-9, MIG-15, „In-App-Vorschau über den Mini-Server" und Q&A 5, 11, 24, 25; die Rust-Seite erreicht der Slice nur über `invoke`, in den Tests ist `invoke` ersetzt.

**Deliverables**

- `src/components/ui/DocViewToggle.tsx` (MIG-5): ohne die Positionsklassen `absolute right-3 top-3 z-10`; Props und die Sperre „Save to preview" bleiben. Sweep-Kriterium: `grep -rn "DocViewToggle" src --include=*.tsx` ohne Testdateien trifft nur noch `PreviewHeader.tsx` und die eigene Datei.
- `src/modules/html/HtmlPreviewPane.tsx` (MIG-6): Kopfzeile über dem Rahmen; Ladeweg nach `htmlPreviewSource(workspace, HTML_PREVIEW_VIA_SERVER)` mit der Konstante in Welle 1 an; der heutige Weg (Asset-Protokoll lokal, `srcDoc` für SSH und WSL) bleibt im Code; liefert `preview_frame_source` nicht `ready` oder scheitert der Aufruf, lädt die Pane auf dem heutigen Weg (Entscheidung); Neu-laden-Zähler in allen Lese-Wegen; `data-no-tab-swipe` auf dem ganzen Pane-Element samt Kopfzeile, nur bei `visible`; Rahmen über `usePaneFrameClass`; jedes `iframe` nutzt eine Sandbox-Konstante ohne `allow-same-origin` (`LOCAL_SANDBOX` und `REMOTE_SANDBOX` bleiben unverändert); die Rahmen-Adresse lebt nur im Zustand der Pane, nie im Tab, in Einstellungen oder im Log.
- `src/modules/markdown/MarkdownPreviewPane.tsx` (MIG-7): Kopfzeile, Neu-laden-Zähler im Lese-Effekt, Rahmen über `usePaneFrameClass`; der Scroll-Container `flex-1 overflow-auto` bleibt, damit die Wisch-Prüfung Tabellen weiter erkennt; „Open in Browser" ist in Welle 1 verborgen; `MarkdownPreviewPane.test.ts` bleibt grün.
- `src/modules/editor/EditorStack.tsx` (MIG-8): Kopfzeile der Raw-Ansicht für Markdown und HTML; Neu laden baut `EditorPane` über einen Schlüssel neu auf, gesperrt bei `dirty`; Rahmen über `usePaneFrameClass`; `EditorStack.window-hidden.test.tsx` bleibt grün (INV-9).
- `src/modules/editor/EditorPane.tsx` (MIG-9): Kopfzeile mit Dateiname, „Open in Browser" und Zen über Bild- und PDF-Vorschau und über der Karte von Bild und PDF, auch über SSH; das PDF-Gate (`EditorPane.tsx:397-409`, `:463-481`) und Video/Audio bleiben unverändert (INV-3, `binaryPreview.test.ts` grün).
- `src/modules/explorer/FileExplorer.tsx` (MIG-15): Eintrag „Open in Browser" direkt unter „Open with Default App", nur für Dateien, für die `browserOpenable(path, Explorer-Workspace)` wahr ist; Workspace aus `useWorkspaceEnvStore` (`FileExplorer.tsx:223`).
- `src/modules/preview-server/index.ts`: Barrel mit `openInBrowser`, `browserOpenable`, `OpenInBrowserButton` und den Typen aus `types.ts`; `browserOpenable.ts` hält die laufende Welle als Konstante (Welle 1).
- Kopfzeile: Symbole und Wortwahl wie `src/modules/preview/PreviewAddressBar.tsx` („Reload" mit `ArrowReloadHorizontalIcon`, „Open in Browser" mit `LinkSquare02Icon`); Toasts mit `toast.error` aus `sonner` wie `PortsList.tsx:155-159`.
- `preview-server/`, `doc/` und die Panes importieren aus dem Editor-Modul nur reine Dateien, nie den Barrel `@/modules/editor`; `src/app/eager-budget.test.ts` bleibt grün (`FileExplorer` lädt beim Start).
- Bestandstests mit Teil-Mocks (Auflage PR-06): `EditorPane.preview-env.test.tsx` rendert `EditorPane` ohne `TooltipProvider` (`:51`), `FileExplorer.test.tsx` ersetzt `@/modules/workspace` nur mit `currentWorkspaceEnv` und `useWorkspaceEnvStore`, `sonner` nur mit `toast.message` und `toast.error`, `@/lib/platform` nur mit `IS_MAC`, `@/modules/settings/preferences` ohne `shortcuts` und `@/modules/shortcuts` nur mit `useGlobalShortcuts` (`FileExplorer.test.tsx:41-52`). Deshalb: alle neuen Tasten (Reload, „Open in Browser", Rendered/Raw) nutzen `title` wie `PreviewAddressBar.tsx:139`, `:222`, keinen Radix-`Tooltip`; Dateien unter `src/modules/preview-server/` importieren aus `@/modules/workspace` nur mit `import type`; Toasts nur über `toast.error`; `FileExplorer.tsx` importiert direkt `@/modules/preview-server/lib/browserOpenable` und `@/modules/preview-server/lib/openInBrowser` (nicht den Barrel, nicht `OpenInBrowserButton`, nicht `ZenToggleButton`) und aus `@/modules/workspace` keinen weiteren Wert neben dem schon vorhandenen `useWorkspaceEnvStore` (`FileExplorer.tsx:58`).
- Geheimnis und Rahmen-Adresse (Auflage PR-07, SEC-8): `FrameSource.url` lebt nur im Zustand der Pane; sie kommt in keinen Tab, keine Einstellung, keinen Toast und kein `console.*`; Fehler aus `preview_frame_source` führen nur zum Rückfall, ohne die Adresse zu melden. Das Code-Review prüft den Weg von `FrameSource.url`.
- Bestehende Testdateien bleiben unverändert; neue Tests stehen in neuen Dateien.

**Liefert**

| Vertrag | Signatur | Datei | Konsumenten |
|---------|----------|-------|-------------|
| -- | -- | -- | -- |

**Braucht**

| Vertrag | von Slice |
|---------|-----------|
| `BrowserOpen (TS)` | slice-00-contracts |
| `FrameSource (TS)` | slice-00-contracts |
| `preview_open_in_browser` | slice-00-contracts |
| `preview_frame_source` | slice-00-contracts |
| `ENTRY_EXTENSIONS` | slice-00-contracts |
| `useZenStore` | slice-03-zen-swipe |
| `usePaneFrameClass` | slice-03-zen-swipe |
| `ZenToggleButton` | slice-03-zen-swipe |

**Akzeptanzkriterien**

1) GIVEN `browserOpenable`
   WHEN es für `report.html`, `a.HTM`, `p.png`, `p.jpg`, `p.jpeg`, `p.gif`, `p.webp`, `p.ico`, `p.svg` und `doc.pdf` jeweils mit Workspace `{ kind: "local" }`, mit `{ kind: "ssh", host: "devbox" }` und ohne Workspace gefragt wird, für `report.html` mit `{ kind: "wsl", distro: "Ubuntu" }` und für `notes.md`, `notes.markdown`, `x.mdx`, `a.txt`, `clip.mp4` und `pic.avif` lokal
   THEN ist es in den ersten drei Gruppen wahr und sonst falsch
   [Source: SVC-12, BR-25, UI-1, UI-5]
   Test: `src/modules/preview-server/lib/browserOpenable.test.ts`

2) GIVEN der Quelltext unter `src/` ohne Testdateien, `src-tauri/src/modules/preview_server/policy.rs` und die Capabilities
   WHEN `browserOpen.guard.test.ts` läuft
   THEN trifft das Muster `preview_open_in_browser|modules/preview-server` keine Datei unter `src/modules/ai/`; genau eine Datei ruft `preview_open_in_browser` (`src/modules/preview-server/lib/openInBrowser.ts`) und genau eine `preview_frame_source` (`src/modules/html/HtmlPreviewPane.tsx`); die Endungen von `browserOpenable` sind als Menge gleich `ENTRY_EXTENSIONS` aus `policy.rs`; `src-tauri/capabilities/default.json` und `src-tauri/capabilities/desktop.json` enthalten keinen Schlüssel `remote`
   [Source: SEC-3, SEC-8, BR-16, SVC-12]
   Test: `src/modules/preview-server/browserOpen.guard.test.ts`

3) GIVEN ersetztes `invoke` und ersetztes `toast`
   WHEN `openInBrowser("/p/a.html", { kind: "local" })` mit der Antwort `{ status: "opened", reason: null }` läuft, dann mit `{ status: "too_large", reason: null }`, dann mit einem abgelehnten Aufruf `"task aborted"`
   THEN ruft es je genau einmal `invoke("preview_open_in_browser", { path: "/p/a.html", workspace: { kind: "local" } })` und löst zu `undefined` auf; im ersten Fall kommt kein Toast, im zweiten `toast.error("a.html is larger than 10 MB and can't be opened in the browser.")`, im dritten `toast.error("Could not open the browser: task aborted")`
   [Source: API-5, FL-1, SEC-8, EP-6]
   Test: `src/modules/preview-server/lib/openInBrowser.test.ts`

4) GIVEN `browserOpenText` mit Name `a.html` und Host `devbox`
   WHEN es die Status `opened`, `unsupported`, `refused` mit Grund `path is inside a protected directory (.ssh)`, `too_large`, `unreachable` mit Grund `connection refused`, `limit_reached` und `open_failed` mit Grund `no handler` übersetzt
   THEN ergibt das `null`, „Open in Browser is not available for this file.", „a.html can't be opened in the browser: path is inside a protected directory (.ssh)", „a.html is larger than 10 MB and can't be opened in the browser.", „Could not read a.html from devbox: connection refused", „Too many browser links are open. Restart Terax to free them." und „Could not open the browser: no handler"
   [Source: SVC-13, EP-6]
   Test: `src/modules/preview-server/lib/browserOpenText.test.ts`

5) GIVEN `OpenInBrowserButton` für `/p/a.html` lokal und für `/p/notes.md` lokal, ersetztes `invoke`
   WHEN beide gerendert werden und die erste Taste geklickt wird
   THEN zeigt die erste eine Taste mit Titel „Open in Browser" und dem Symbol `LinkSquare02Icon` (`available`), die zweite nichts (`hidden`); der Klick ruft `preview_open_in_browser` genau einmal mit Pfad und Workspace
   [Source: UI-1, TG-1, FL-1]
   Test: `src/modules/preview-server/OpenInBrowserButton.test.tsx`

6) GIVEN der Explorer mit lokalem Workspace und den Einträgen `report.html`, `notes.txt` und Ordner `sub`, ersetztes `invoke`
   WHEN das Kontextmenü auf `report.html`, auf `notes.txt` und auf `sub` geöffnet und bei `report.html` „Open in Browser" gewählt wird, danach dasselbe im Workspace `{ kind: "wsl", distro: "Ubuntu" }`
   THEN steht „Open in Browser" bei `report.html` direkt unter „Open with Default App" (`shown`), bei `notes.txt` und `sub` nicht (`absent`); die Wahl ruft `preview_open_in_browser` genau einmal mit dem Pfad von `report.html` und dem Explorer-Workspace; im WSL-Workspace fehlt der Eintrag
   [Source: MIG-15, UI-5, TG-2]
   Test: `src/modules/explorer/FileExplorer.openInBrowser.test.tsx`

7) GIVEN `previewHeaderModel`
   WHEN es für `html` lokal, `markdown` lokal, `raw` von `a.html` ohne und mit ungespeicherten Änderungen, `image` lokal und über SSH, `pdf` lokal, `pdf` über SSH (Karte) und `html` in WSL bestimmt wird
   THEN zeigt `html` Dateiname, Neu laden, Rendered/Raw, „Open in Browser" und Zen; `markdown` dasselbe ohne „Open in Browser" (Welle 1); `raw` dasselbe wie `html`, ungespeichert sind Neu laden und „Rendered" gesperrt; `image` und `pdf` zeigen nur Dateiname, „Open in Browser" und Zen; `html` in WSL zeigt kein „Open in Browser"
   [Source: SVC-14, BR-21, BR-23, BR-25, UI-2]
   Test: `src/modules/doc/lib/previewHeader.test.ts`

8) GIVEN `PreviewHeader` mit Dateiname `a.html`, Ansicht `rendered` und Slots für „Open in Browser" und Zen
   WHEN es gerendert, „Raw" geklickt, mit `renderedDisabled` gerendert und bei Zen an mit macOS (`IS_MAC` ersetzt) gerendert wird
   THEN tragen weder Kopfzeile noch Umschalter `absolute`, `fixed`, `top-3`, `right-3` oder `z-10`, und die Kopfzeile steht im Fluss über dem Inhalt; „Raw" ruft `onSetView("raw")`; mit `renderedDisabled` ist „Rendered" `disabled` mit Titel „Save to preview"; bei Zen an auf macOS trägt die Kopfzeile `pl-20` (`zen`), bei Zen aus nicht (`default`)
   [Source: UI-2, NFR-8, MIG-5, TG-8, BR-21]
   Test: `src/modules/doc/PreviewHeader.test.tsx`

9) GIVEN `HtmlPreviewPane` für `/p/a.html` im Workspace `{ kind: "wsl", distro: "Ubuntu" }`, `fs_read_file` liefert erst `v1`, dann `v2`
   WHEN „Reload" geklickt wird
   THEN zeigt die Taste vom Klick bis zur Antwort `loading` (`aria-busy="true"`) und danach `idle`; `fs_read_file` lief genau zweimal, das `srcDoc` enthält `v2`, und `onSetView` wurde nicht gerufen (kein Tab-Wechsel)
   [Source: API-6, BR-22, FL-4, UI-3, TG-5]
   Test: `src/modules/html/HtmlPreviewPane.test.tsx`

10) GIVEN `MarkdownPreviewPane` für `/p/a.md`, `fs_read_file` liefert erst `# v1`, dann `# v2`, beim dritten Mal einen Fehler
    WHEN „Reload" zweimal geklickt wird
    THEN zeigt die Pane erst `v1`, dann `v2`, dann „Failed to read file: …"; `loading` endet jeweils mit der Antwort, auch beim Fehler; die Kopfzeile steht über dem Scroll-Container und überdeckt ihn nicht
    [Source: MIG-7, API-6, BR-22, FL-4, UI-3]
    Test: `src/modules/markdown/MarkdownPreviewPane.header.test.tsx`

11) GIVEN `EditorStack` mit einem Raw-Tab `a.html` und einem Tab `main.rs` (ersetztes `EditorPane`, das seine Aufbauten zählt)
    WHEN beim gespeicherten Raw-Tab „Reload" und dann „Rendered" geklickt wird und der Tab danach als ungespeichert gerendert wird
    THEN baut Neu laden `EditorPane` genau einmal neu auf (zwei Aufbauten), `loading` gilt, bis der neue Editor die Datei gelesen hat; „Rendered" ruft `onSetDocView(id, "rendered")`; ungespeichert sind „Reload" und „Rendered" gesperrt, „Rendered" mit Titel „Save to preview"; der Tab `main.rs` hat keine Kopfzeile
    [Source: MIG-8, BR-22, BR-21]
    Test: `src/modules/editor/EditorStack.header.test.tsx`

12) GIVEN `htmlPreviewSource`
    WHEN es mit Baustein an für `local`, `ssh`, `wsl` und ohne Workspace und mit Baustein aus für dieselben vier gefragt wird
    THEN ergibt das `server`, `server`, `srcdoc`, `server` und `asset`, `srcdoc`, `srcdoc`, `asset`; die Konstante `HTML_PREVIEW_VIA_SERVER` ist `true`
    [Source: SVC-19, BR-7]
    Test: `src/modules/html/lib/htmlPreviewSource.test.ts`

13) GIVEN `HtmlPreviewPane` für `/p/a.html` lokal und für `/srv/p/b.html` auf `{ kind: "ssh", host: "devbox" }`, `preview_frame_source` liefert `{ status: "ready", url: "http://127.0.0.1:5000/T/a.html", reason: null }`; dazu eine dritte Pane für `/p/big.html`, für die es `{ status: "too_large", url: null, reason: null }` liefert
    WHEN die drei Panes einhängen
    THEN zeigt der Rahmen der ersten beiden die gelieferte `url` mit dem Sandbox-Wert von `LOCAL_SANDBOX` bzw. `REMOTE_SANDBOX` ohne `allow-same-origin`, für sie läuft weder `asset_allow` noch `fs_read_file`, und es gibt kein `srcDoc`; die dritte lädt auf dem heutigen Weg (`asset_allow` mit `directory: true`, Rahmen über `convertFileSrc`); die Taste „Open in Browser" bleibt in allen drei Kopfzeilen
    [Source: SVC-19, BR-7, BR-24]
    Test: `src/modules/html/HtmlPreviewPane.test.tsx`

14) GIVEN der Server-Weg aus AC 13 mit Rahmen A
    WHEN „Reload" geklickt wird
    THEN ersetzt ein neuer Rahmen B (nicht derselbe Knoten) mit derselben `url` den Rahmen A; die Taste zeigt `loading` bis zum `load`-Ereignis von B, danach `idle`; `preview_frame_source` läuft nicht erneut
    [Source: OB-18, API-6, UI-3]
    Test: `src/modules/html/HtmlPreviewPane.test.tsx`

15) GIVEN der Quelltext von `HtmlPreviewPane.tsx`
    WHEN `HtmlPreviewPane.sandbox.test.ts` ihn prüft und denselben Prüfer auf zwei Kopien anwendet, eine mit ` allow-same-origin` am Ende von `REMOTE_SANDBOX` und eine mit einem `iframe` mit `sandbox="allow-scripts allow-same-origin"`
    THEN hat jedes `iframe` der Datei `sandbox={…}` mit einer der deklarierten Konstanten, jede Konstante enthält `allow-scripts` und keine `allow-same-origin`; für beide Kopien meldet der Prüfer einen Verstoß (rote Gegenprobe)
    [Source: SEC-9, OB-5, BR-24]
    Test: `src/modules/html/HtmlPreviewPane.sandbox.test.ts`

16) GIVEN `HtmlPreviewPane` mit `visible` an und mit `visible` aus
    WHEN gerendert wird
    THEN trägt das äußere Pane-Element bei `visible` an `data-no-tab-swipe` und enthält die Kopfzeile; bei `visible` aus fehlt das Attribut
    [Source: MIG-6]
    Test: `src/modules/html/HtmlPreviewPane.test.tsx`

17) GIVEN `EditorPane` mit ersetzter Dokument-Lesung für `a.png` lokal, `a.png` über SSH, `doc.pdf` lokal mit bestätigter Echtheit, `doc.pdf` über SSH und `clip.mp4` lokal
    WHEN gerendert wird
    THEN zeigen die vier Bild- und PDF-Fälle eine Kopfzeile mit Dateiname, „Open in Browser" und Zen-Taste, ohne Neu laden und ohne Rendered/Raw, bei der SSH-PDF über der Karte „preview not available over SSH"; `clip.mp4` hat keine Kopfzeile; die lokale PDF bleibt der Rahmen ohne `sandbox` wie heute
    [Source: MIG-9, BR-23]
    Test: `src/modules/editor/EditorPane.header.test.tsx`

18) GIVEN `HtmlPreviewPane`, `MarkdownPreviewPane` und `EditorStack` mit einem Raw-Tab
    WHEN sie mit Zen aus und mit Zen an (`useZenStore`) gerendert werden
    THEN trägt ihr Rahmen bei Zen aus `rounded-md border border-border/60` und bei Zen an keine dieser Klassen; die Kopfzeile mit der Zen-Taste bleibt im Zen sichtbar
    [Source: MIG-6, MIG-7, MIG-8, UI-2]
    Test: `src/modules/html/HtmlPreviewPane.test.tsx`, `src/modules/markdown/MarkdownPreviewPane.header.test.tsx`, `src/modules/editor/EditorStack.header.test.tsx`

19) GIVEN die installierte App am Mac (Release-Build, Baustein an)
    WHEN die Messseite `evidence/messseite/index.html` lokal und vom SSH-Server als HTML-Vorschau geöffnet wird und eine PDF aus einem SSH-Workspace geöffnet und dort „Open in Browser" gewählt wird
    THEN sind in der App die Punkte 1, 2, 4, 5 und 6 grün, 7 und 8 rot (die Sandbox bleibt), Bilder, Styles und klassische Skripte aus dem Ordner laden auch über SSH (M-C, N-23; Abbruchkriterium nach Auflage OB-19 bei der QA); die SSH-PDF zeigt die Karte mit Kopfzeile, „Open in Browser" zeigt sie im Browser (N-24); Popups, Downloads und Zwischenablage sind notiert (N-14)
    [Source: BR-24, BR-7, BR-23] [Prüfweg: QA]

20) GIVEN slice-04 ist gemergt
    WHEN `browserOpen.guard.test.ts` die Imports prüft und `pnpm vitest run src/modules/editor/EditorPane.preview-env.test.tsx src/modules/explorer/FileExplorer.test.tsx --maxWorkers=1` läuft
    THEN importieren alle Dateien unter `src/modules/preview-server/` aus `@/modules/workspace` nur mit `import type`, `OpenInBrowserButton.tsx` und `PreviewHeader.tsx` importieren nichts aus `@/components/ui/tooltip`, und `FileExplorer.tsx` importiert aus `preview-server` nur `lib/browserOpenable` und `lib/openInBrowser`; beide Bestandstests laufen ohne jede Änderung grün
    [Source: MIG-9, MIG-15]
    Test: `src/modules/preview-server/browserOpen.guard.test.ts`
    Bestand (unverändert, außerhalb des Dateibereichs): `src/modules/editor/EditorPane.preview-env.test.tsx`, `src/modules/explorer/FileExplorer.test.tsx`

21) GIVEN `HtmlPreviewPane` auf dem Server-Weg aus AC 13 mit `url` `http://127.0.0.1:5000/T/a.html`, Spione auf `console.log`, `console.info`, `console.warn`, `console.error` und `toast`, dazu ein HTML-Tab für `/p/a.html` mit Workspace `local`
    WHEN die Pane einhängt, „Reload" geklickt, `preview_frame_source` in einer zweiten Pane mit einem abgelehnten Aufruf beantwortet und danach `serializeTabs([tab])` aus `src/modules/spaces/lib/serialize.ts` gerufen wird
    THEN enthält kein Aufruf von `console.*` oder `toast` die `url`, `127.0.0.1:5000` oder `T`; die zweite Pane lädt auf dem heutigen Weg; die Serialisierung des Tabs enthält `path` und `workspace`, aber weder `127.0.0.1` noch `T`
    [Source: SEC-8, SVC-19]
    Test: `src/modules/html/HtmlPreviewPane.test.tsx`

**Nicht in diesem Slice**

- Keine Rust-Änderung: Kopfzeilen, Prüfkette und Freigaben des Servers gehören slice-01-preview-server.
- Kein Radix-`Tooltip` in den neuen Tasten und keine Werte-Importe, die die Teil-Mocks von `EditorPane.preview-env.test.tsx` und `FileExplorer.test.tsx` nicht bedienen (Auflage PR-06; Einzelheiten unter Deliverables); diese Bestandstests werden nicht angepasst.
- Kein Markdown im Browser (Welle 2: BR-17, FL-8, SVC-20); die Taste in der Markdown-Kopfzeile bleibt verborgen.
- Keine Änderung an `src/modules/doc/DocStack.tsx` (Props bleiben), `PreviewAddressBar.tsx`, `asset.rs` und der App-CSP.
- Keine Lockerung der Sandbox (FS-6): kein `allow-same-origin`, keine neuen Sandbox-Tokens; Popups, Downloads und Zwischenablage bleiben wie heute (N-14).
- Kein automatischer Rückfall, wenn der Rahmen weiß bleibt: das entscheidet die Konstante nach M-C am Mac (QA, OB-19).

**Wie gebaut**

- **Merge-Commit:** `0bdf653` (Slice-Commits `160a113`, `444180a` über `712f137`; 29 Dateien, alle im Dateibereich; keine bestehende Testdatei geändert).
- **Gate:** auf `444180a` und erneut auf dem zusammengeführten Stand `0bdf653` (mit dem gemergten Server-Kern): `pnpm check-types` Exit 0; Vitest 1826 grün in 164 Dateien (1676 Bestand + 150 neu); `pnpm lint` Exit 0 mit 97 Warnungen wie auf der Base; kein Geheimnis im Diff. Kein Rust im Slice.
- **Review:** drei Diff-Reviews nach Dateibereich (alle ohne blockierenden Befund), Claim-Verifikation mit 22 eigenen Proben, Mutationsstufe (9 von 10 getötet). Zwei blockierende Befunde aus der Claim-Verifikation, beide vom Nachprüfer bestätigt, in einer Fix-Runde behoben (`444180a`); alle drei Delta-Reviews ohne blockierenden Befund.
- **Was die Fix-Runde geändert hat:** (1) Der Test „Adresse nie im Log" löste Objekte nicht auf (ein geloggtes Antwort-Objekt mit der Adresse blieb unentdeckt); er wandelt jetzt jedes Argument mit `inspect` um und prüft zusätzlich, dass die Adresse im DOM der Pane nur im `src` des Rahmens steht. (2) `EditorStack` gab jedem Tab eine Hülle und eine Flex-Spalte; jetzt nur, wenn eine Kopfzeile gerendert wird — ein Tab ohne Kopfzeile hat die DOM-Form der Base. (3) Ein Dateiname mit Punkt am Anfang ohne Stamm (`.html`) gilt wie im Rust-Kern nicht als öffnbar. (4) Der Aufrufer-Guard zählt zusätzlich, in wie vielen Dateien der Command-Name als Literal steht. (5) Der Sandbox-Test nagelt die genaue Token-Menge fest, ohne Rücksicht auf Groß-/Kleinschreibung. (6) Ein zur Laufzeit unbekannter Status der Server-Antwort führt auf den heutigen Weg statt zu einer leeren App. (7) Tests für die überlebende Mutante (zwei Einhängevorgänge bekommen verschiedene Asset-Adressen), für späte Antworten, gescheitertes `asset_allow`, „erst gespeichert, dann ungespeichert", `onLoaded` genau einmal.
- **Abweichungen vom Plan:** **V1 (von der Steuereinheit angeordnet):** „Neu laden" fragt den Mini-Server erneut, wenn die Vorschau auf dem Rückfall-Weg ist (der Plan beschrieb Neu laden nur als neues Lesen auf dem aktuellen Weg); während eine Anfrage läuft, fragt ein Klick nicht erneut. **V2 (angeordnet):** Markdown behält beim Neu laden den sichtbaren Inhalt, bis der neue da ist. Dazu: neue optionale Prop `onLoaded` an `EditorPane`; zusätzliche Exporte `frameRoute` (die eine Stelle für den Ladeweg je Status, mit `call_failed` und einer Warnzeile bei unbekanntem Status), `builtInSource`, `browserCallFailedText`; Asset-Token je Ladevorgang statt je Einhängen; `DocViewToggle` ohne Overlay-Stile; AC 13 mit Tests in zwei Dateien.
- **Bekannte Grenzen:** Eine SVG öffnet im Editor als Text und hat deshalb keine Kopfzeile; „Open in Browser" gibt es für sie nur im Kontextmenü des Explorers (die Entscheidungszeile nennt für svg die Taste in der Kopfzeile). Bei der erneuten Frage nach V1 bleibt die Fläche auf dem SSH-Rückfall kurz leer bzw. zeigt nach einem Fehler kurz die alte Meldung; der Endzustand stimmt. Lädt ein Server-Rahmen nie (`load` bleibt aus), bleibt die Reload-Taste auf „busy", ist aber klickbar. Doppelklick auf „Open in Browser" öffnet zweimal. Bild und PDF zeigen während „Loading…" und bei Lesefehler keine Kopfzeile. Neu laden im Raw-Tab baut den Editor neu auf (Cursor und Undo gehen verloren, vom Plan so vorgegeben). Der Aufrufer-Guard sieht keinen aus Stücken zusammengesetzten Command-Namen, keinen Namen als Bezeichner und keine `.json`-Dateien. Testlücken ohne weitere Runde: der Test „warns with the status only" löst Objekte nicht auf; zwei Testnamen sagen „refused" und prüfen `unreachable` bzw. `limit_reached`; `type="button"` ungeprüft; der Kommentar an `onLoaded` ist für einen Statuswechsel beim Neu-Lesen ungenau.
- **Nur am Mac:** AC 19 (M-C: lädt der Rahmen `http://127.0.0.1` im App-Fenster, löst er `load` aus, auch bei einer 502-/504-Seite), Layout der Kopfzeile und `pl-20` neben den Ampelknöpfen, Höhen und ein einziger Scrollbalken unter der Raw-, Bild- und PDF-Kopfzeile, Wischen über dem Server-Rahmen fremder Herkunft (N-12), ob Markdown beim Neu laden die Scrollposition hält, und ob eine Seite mit `allow-popups` ihre Adresse samt Geheimnis in ein neues Fenster tragen kann (N-14).
