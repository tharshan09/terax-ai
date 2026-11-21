# Slop-Dispositionen: Welle 3 (Browser-Ansicht)

Vor-Scan vom 2026-11-20, drei Funde, alle vom PM entschieden. Unterdrückt via Registry: 0 (keine Registry vorhanden). Dazu eine PM-Entscheidung zur Gestaltung und das Ergebnis der Machbarkeitsprüfung.

| # | class | subject | sites | existing_owner | decision | Begründung | Folge (Deliverable) |
|---|-------|---------|-------|----------------|----------|------------|---------------------|
| 1 | k4_pattern_fork | Lokalen HTTP-Endpunkt auf einem Loopback-Port abfragen | `src/modules/preview/PreviewAddressBar.tsx:109`, `:290`; `src-tauri/src/modules/net.rs:144`; `src-tauri/src/modules/net/clients.rs:121`; `src-tauri/src/modules/ports.rs:287` | zwei Schulen, keine Regel | adopt_school | Welle 3 muss den Inhalt der Antwort lesen; aus der Oberfläche heraus ist er nicht lesbar. | Verbindlich: Abfragen, deren Antwort gelesen wird, laufen im Rust-Teil über den abgesicherten Client (`guarded_client`, Profil wie `lm_ping`, private Adressen erlaubt, keine Redirects, Zeitgrenze). Der neue Befehl nimmt nur Host und Server-Port einer bestehenden Freigabe entgegen und fragt ausschließlich `localhost` mit deren Mac-Port ab; kein allgemeiner Loopback-Fetch. Guard: Test, der festhält, dass der Befehl keine freie URL annimmt und dass nichts unter `src/modules/ai` ihn erreicht; Registrier-Kommentar am Test (`GUARD`, `DISPOSITION`, `RULE: --`). Die Probe der Vorschau bleibt unverändert. |
| 2 | k2_knowledge_copy | Mac-Adresse einer Freigabe bilden | `src/modules/ports/lib/portDetect.ts:84`, `:91`; `src/modules/ports/lib/ports.ts:71`, `:406-408` | `macUrl` in portDetect.ts, daneben Kopien | consolidate | Der Server-Chrome vergleicht die Herkunft buchstabengenau; eine abweichende Schreibweise lässt die Ansicht scheitern. | Eine reine, getestete Funktionsgruppe liefert alle Mac-Adressen einer Freigabe: Basis-Adresse, Adresse der Live-Ansicht (mit Seiten-ID), Herkunft für die Prüfung. Die Kopien in `ports.ts` werden darauf umgestellt. Rust und Frontend verwenden denselben Host (`localhost`); ein Test hält die Gleichheit der Schreibweise fest. |
| 3 | k4_pattern_fork | Kleine Nutzer-Erinnerung über Neustarts merken (DF-8) | `src/modules/settings/store.ts:354`, `:362`; `src/modules/spaces/lib/store.ts:28`; `src/modules/command-palette/lib/mru.ts:1`, `:30`; `src/modules/sidebar/useSidebarPanel.ts:87` | zwei Schulen | adopt_school | Der Sicherheitshinweis soll verlässlich nur einmal je Server kommen. | Verbindlich für sicherheitsrelevante Bestätigungen: Einstellungs-Speicher (`writePref`-Muster), Schlüssel je Server über `workspaceScopeKey`. "Cancel" schreibt nichts (BR-21). Guard: Test, der festhält, dass die Bestätigung über den Einstellungs-Speicher läuft und einen Neustart (neu geladenen Speicher) übersteht; Registrier-Kommentar am Test. |

## PM-Entscheidung zur Gestaltung

| # | Frage | Entscheidung | Folge |
|---|-------|--------------|-------|
| Z1 | Wo erscheint die Anleitung (FL-18, EP-13, UI-13)? | Dialog in Terax | Ein Dialog zeigt die Schritte mit kopierbaren Befehlen, gefüllt mit Server und Port der Freigabe (die erlaubte Herkunft steht passend drin). Ohne Internet nutzbar. Kein externer Link, kein Markdown-Tab. |

## Ergebnis der Machbarkeitsprüfung (BR-24), bindend für den Bau

Belegt auf Linux mit zwei Chrome-Instanzen und simuliertem Tunnel; Rohdaten unter `/tmp/claude-1002/-home-claude-litha-produkte-terax/b11976f9-b056-4fd8-a6f2-c24d109a92e8/scratchpad/w3-probe` (Logs, Skripte, Screenshots).

| Punkt | Befund |
|-------|--------|
| Ein-Klick-Weg | Der Server-Chrome liefert die Ansicht selbst aus: `http://{host}:{macport}/devtools/inspector.html?ws={host}:{macport}/devtools/page/{id}`, an einen laufenden Chrome übergeben. Bild, Klick und Tippen kommen an. Keine Dritten. |
| Seiten-ID | Aus `GET /json/list`, nur Ziele mit `type == "page"`. Eine Webseite kann die Liste nicht selbst lesen; Terax holt sie. `webSocketDebuggerUrl` nicht übernehmen, die Adresse aus Mac-Port und ID neu bauen. |
| Erkennung | `GET /json/version`: Feld `Browser` beginnt mit `Chrome/` oder `HeadlessChrome/`. Andere Fernsteuer-Endpunkte (Node, Electron) antworten ähnlich und zählen nicht. Der Server-Chrome nimmt als Host-Header nur IP oder `localhost` an. |
| Herkunft | Der Server-Chrome prüft bei der Ansicht die Herkunft buchstabengenau; `localhost` und `127.0.0.1` sind verschiedene Herkünfte. Fremde Herkunft: 403. Ohne Herkunfts-Angabe: zugelassen. Die eigene Herkunft (gleicher Port wie der Server-Port) lässt Chrome 156 ohne Startargument zu, Chrome 151 nicht. Sonst braucht der Server-Chrome `--remote-allow-origins={herkunft}`. |
| Prüfung vor dem Öffnen | Ein WebSocket-Handshake mit der Herkunft der Mac-Adresse zeigt 101 (zugelassen) oder 403 (abgelehnt). Bei 403 öffnet sich die Anleitung statt der Ansicht (EP-13). |
| Verworfene Wege | Gehostete Ansicht und "Geräte untersuchen" laden Code von einem Google-Host (BR-22); `devtools://`-Adressen lassen sich nicht von außen öffnen. |
| Zwei Clients | Automatisierung und Betrachter stören sich nicht. Setzt die Automatisierung eine andere Fenstergröße, folgt der Betrachter. |
| Nur lokal | Der Fernsteuer-Port lauscht bei Chrome 151 und 156 (voll und Headless) nur auf `127.0.0.1` des Servers. |
| Ungeprüft | Alles macOS-Spezifische: Übergabe der Adresse an Google Chrome, Erkennung "Chrome nicht installiert", Tastenbelegung; Verhalten über eine echte SSH-Freigabe (auf Linux nachholbar). |

## Stolpersteine aus dem Vor-Scan (Eingabe für ACs und Implementierung)

| # | Thema | Befund | Stelle |
|---|-------|--------|--------|
| 1 | Gezielt in Chrome öffnen | Es gibt heute keinen Weg, eine URL in einer bestimmten App zu öffnen. Die Opener-API kann es (`openUrl(url, openWith)`); derselbe Besitzer wie "Open in browser", kein zweiter Öffnen-Pfad über einen eigenen `open`-Aufruf. Die Capability enthält nur `opener:default`; für Chrome braucht es einen eng gefassten Scope (nur `http://localhost:*`, nur diese App). | `src/lib/openWith.ts:60-79`; `src-tauri/capabilities/default.json:23` |
| 2 | Chrome installiert? (EP-12) | Es gibt keine Prüfung, ob eine App installiert ist. Ein Fehlschlag des Öffnens ist als Nachweis zu unscharf, weil er sich nicht von EP-13 trennen lässt. Eine eigene, schmale Prüfung ist nötig (macOS). | `src-tauri/Cargo.toml:67` |
| 3 | Herkunfts-Prüfung | Nur im Rust-Teil möglich: Die Oberfläche darf keine WebSocket-Verbindung dorthin aufbauen und setzt die Herkunft selbst. Kleiner eigener Handshake mit Zeitgrenze, nicht blockierend. | `tauri.conf.json:28`; `net.rs:16-24`; `ports.rs:22`, `:287` |
| 4 | Wann wird geprüft | Kein Polling. Die Chrome-Erkennung läuft höchstens einmal je Freigabe (Server, Server-Port, Mac-Port): nach erfolgreichem Freigeben und beim Öffnen der Liste, und bleibt gemerkt, bis die Freigabe endet oder der Mac-Port wechselt. Sie blockiert die Liste nicht; die Marke erscheint nachträglich. | `portsStore.ts:152-158`, `:192`; `PortsStatus.tsx:49` |
| 5 | Zustand | Die Liste der Freigaben wird beim Auffrischen vollständig ersetzt; das Chrome-Merkmal braucht einen eigenen Zustand, der mit der Freigabe verfällt. | `ports.ts:288`, `:306-318` |
| 6 | Kosten für Nicht-Chrome | Die Abfrage landet bei jeder Freigabe im Dienst des Users (404 im Dev-Server, bei Nicht-HTTP-Diensten als unverständliche Verbindung) und kann bis zur Zeitgrenze hängen. Einmal je Freigabe, kurze Zeitgrenze. | `net/clients.rs:121-123` |
| 7 | Kein Agent-Zugang | "View browser" und die neuen Befehle sind dem eingebauten Agenten nicht zugänglich. | `src/modules/ai/tools/terminal.ts:63` |
| 8 | Dialog aus dem Popover | Hinweis-Dialog und Anleitung öffnen sich aus der Ports-Liste; deren Fokus-Logik hält das Popover offen. Zusammenspiel von Fokus und Schließen prüfen. Dialog-Schule: `AlertDialog`. | `PortsList.tsx:47-64`; `src/app/components/CloseDialogs.tsx:62` |
| 9 | Plattform | Ports sind unter Windows ausgeblendet; Welle 3 ist macOS zuerst. Auf anderen Plattformen ist "View browser" nicht sichtbar. | `portsStore.ts:106` |
| 10 | Doku | TERAX.md (Abschnitt ports und `ports::*`) im selben PR ergänzen. | `TERAX.md:44`, `:86` |
