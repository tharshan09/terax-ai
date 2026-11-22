# Feature: SSH Remote Workflow (Dateien hochladen, Ports freigeben, Server-Browser ansehen)

**Epic:** --
**Issue:** -- _(Issues sind im Fork `tharshan09/terax-ai` deaktiviert; Rückverfolgung über diesen Ordner und die PRs.)_
**Status:** Ready
**Mockups:** nicht erstellt - kein Bild-Dienst konfiguriert (`zip.config.json` fehlt); Ports-Liste per Text-Skizze entschieden (Q&A 9)
**Clickdummy:** nicht erstellt - Welle 1 hat kaum Oberfläche; für die Ports-Liste vor Welle 2 nachholbar (`/zip:clickdummy`)

Drei Wellen aus einer Discovery, je ein Branch und ein PR. Der erste Bau-Lauf baut nur Welle 1. Schreibweise der ID-freien Marker mit Bindestrich wie in `specs/2026-10-20-upstream-sync-090/` (Repo-Regel: kein Geviertstrich). UI-Texte sind Englisch wie die übrige App.

---

## Problem & Solution

> No requirement IDs - context

**Problem:**
- Der User arbeitet fast nur noch in SSH-Workspaces und lässt dort Claude-Code-Sessions laufen. Drei Dinge, die lokal selbstverständlich sind, fehlen dort.
- Bilder: Claude Code liest über SSH die Zwischenablage des Servers. Ein Screenshot vom Mac lässt sich nicht einfügen. Eine aus dem Finder aufs SSH-Terminal gezogene Datei fügt den Mac-Pfad ein, den es auf dem Server nicht gibt.
- Ports: Läuft auf dem Server etwas unter `localhost`, ist es vom Mac aus nicht erreichbar. Der Vorschau-Tab zeigt in SSH-Workspaces auf das `localhost` des Macs und damit ins Leere.
- Browser: Der vom Chrome DevTools MCP gesteuerte Chrome läuft auf dem Server ohne Bildschirm. Der User kann weder mitsehen noch selbst eingreifen (z. B. Anmeldung bei einem Anbieter).

**Solution:**
- Welle 1: In SSH-Terminals lädt Terax eingefügte Bilder und gezogene Dateien auf den Server und fügt den Server-Pfad ein.
- Welle 2: Terax holt Server-Ports auf Klick auf den Mac, erkennt Adressen in der Terminal-Ausgabe und führt eine Ports-Liste in der Statusleiste.
- Welle 3: Die Ports-Liste erkennt den Fernsteuer-Zugang eines Server-Chrome und öffnet dessen Live-Ansicht im Chrome auf dem Mac.

**Business Value:**
- Screenshot an eine Remote-Claude-Session geben: von "manuell hochladen und Pfad tippen" auf einen Tastendruck.
- Server-Seite ansehen: ein Klick statt eigener Tunnel-Befehle oder veröffentlichter Zwischenseiten.
- Anmeldungen im Server-Browser selbst vornehmen, statt Zugangsdaten an die Session zu geben.

---

## Scope & Boundaries

> No requirement IDs - context

| In Scope |
|----------|
| Welle 1: Cmd+V mit Bild in der Zwischenablage in einem SSH-Terminal |
| Welle 1: Ziehen von Dateien aller Typen aus dem Finder auf ein SSH-Terminal |
| Welle 1: Ablage in eigenem Ordner im Server-Home, Aufräumen nach 7 Tagen, Grenze 100 MB je Datei |
| Welle 2: Erkennen von lokalen Adressen in der Ausgabe von SSH-Terminals, Hinweis in der Statusleiste |
| Welle 2: Port-Freigabe auf Klick, per Klick auf die Adresse im Terminal und von Hand |
| Welle 2: Ports-Liste in der Statusleiste, Befehl in der Befehlspalette |
| Welle 2: Vorschau-Tab kennt in SSH-Workspaces die freigegebenen Ports |
| Welle 3: Machbarkeitsprüfung "Live-Ansicht mit einem Klick" auf dem Mac |
| Welle 3: Aktion "View browser" in der Ports-Liste, Sicherheitshinweis, Anleitung für Server und Rückfall |
| Welle 3: Einrichtung des Server-Chrome auf der Dev-Box durch eine Claude-Session (kein Terax-Code) |

| Out of Scope |
|--------------|
| Änderungen am Verhalten lokaler Terminals und lokaler Workspaces |
| WSL-Workspaces |
| Hochladen ganzer Ordner über das Terminal (bleibt Aufgabe des Explorers) |
| Automatische Freigabe ohne Klick |
| Freigaben über einen Neustart von Terax hinweg merken |
| Freigabe in die Gegenrichtung (Mac-Port auf dem Server sichtbar) |
| Eigener Browser-Tab in Terax mit selbst gezeichneter Server-Seite |
| Übertragung des ganzen Chrome-Fensters über einen virtuellen Bildschirm |
| Terax ändert Einstellungen von Claude Code oder Chrome auf dem Server |
| Windows und Linux als Client für Welle 1 Zwischenablage-Bilder und Welle 3 (macOS zuerst; Ziehen und Ports folgen der Plattform-Unterstützung der bestehenden SSH-Funktionen) |

---

## Current State Reference

> No requirement IDs - context

- SSH-Workspaces mit einer geteilten, wiederverwendeten Verbindung je Server; sie bleibt etwa zehn Minuten nach dem letzten Terminal bestehen und endet mit der App.
- Dateien per SSH auf den Server kopieren (Explorer: Ziehen und Einfügen aus dem Finder, PR #84).
- Ziehen von Dateien aufs Terminal mit Drop-Overlay; fügt den Pfad als Einfügung ein, die Claude Code als Bild erkennt ("[Image #N]").
- Cmd+V mit Text im Terminal.
- Vorschau-Tab mit Adressleiste, Ports-Menü mit festen Entwickler-Ports, Knopf "im Browser öffnen", Aussetzen nach 30 s im Hintergrund.
- Statusleiste mit konfigurierbaren Elementen, Befehlspalette, Toast-Meldungen (Sonner).
- Klickbare Links und Pfade in der Terminal-Ausgabe.

---

## UI Patterns

> No requirement IDs - context

### Reused Patterns

| Pattern Type | Component | Usage in this Feature |
|--------------|-----------|----------------------|
| Drop-Overlay | `src/modules/terminal/lib/useTerminalFileDrop.ts`, `dropStore` | Unverändert beim Ziehen über ein SSH-Terminal |
| Toast | `src/components/ui/sonner.tsx` | Fehler beim Hochladen, Meldungen zur Freigabe |
| Statusleisten-Element | `src/modules/statusbar/` (`widgets`, `AgentStatusPill`) | Hinweis "Forward port" und Element "Ports" |
| Popover / Dropdown | `src/components/ui/` | Aufklapp-Liste der Ports |
| Vorschau-Tab | `src/modules/preview/` | Ziel beim Öffnen einer Freigabe |
| Befehlspalette | `src/modules/command-palette/commands.ts` | Befehl "Forward Port" |

### New Patterns

| Pattern Type | Description | Rationale |
|--------------|-------------|-----------|
| Hinweis im Terminal-Pane | Kleine, nicht blockierende Marke am Rand des Panes während eines Uploads | Ein Toast wäre nicht dem Pane zugeordnet; bei mehreren Panes muss klar sein, wohin der Pfad kommt |
| Angebots-Hinweis in der Statusleiste | Zeitweiliges Element mit Annehmen und Wegklicken | Bisher gibt es dort nur dauerhafte Anzeigen |

---

## User Flow

Welle 1
1. FL-1: User hat ein Bild in der Zwischenablage und drückt Cmd+V in einem SSH-Terminal -> im Pane erscheint der Hinweis "Uploading 1 file..."; die Eingabe bleibt frei.
2. FL-2: Upload beendet -> Hinweis verschwindet; der Server-Pfad wird als Einfügung an der aktuellen Eingabestelle eingefügt, gefolgt von einem Leerzeichen.
3. FL-3: User zieht eine oder mehrere Dateien aus dem Finder auf ein SSH-Terminal -> Drop-Overlay wie heute; beim Loslassen Hinweis "Uploading N files...".
4. FL-4: Alle Uploads beendet -> die Server-Pfade werden in Ablage-Reihenfolge, durch Leerzeichen getrennt, als eine Einfügung eingefügt.
5. FL-5: Bei jedem Upload -> Dateien im Upload-Ordner des Servers, die älter als 7 Tage sind, werden gelöscht; ohne Rückmeldung.

Welle 2
6. FL-6: In der Ausgabe eines SSH-Terminals erscheint eine lokale Adresse mit Port -> in der Statusleiste erscheint "Forward port {n}?" mit Annehmen und Schließen.
7. FL-7: User klickt den Hinweis an -> Port wird freigegeben; Hinweis verschwindet; Zähler am Element "Ports" steigt; die Mac-Adresse öffnet sich im Vorschau-Tab.
8. FL-8: User klickt die lokale Adresse in der Ausgabe eines SSH-Terminals an -> Port wird freigegeben, falls noch nicht geschehen; die Mac-Adresse (gleicher Pfad und Query) öffnet sich im Vorschau-Tab.
9. FL-9: User klickt auf "Ports" in der Statusleiste -> Liste klappt nach oben auf: Kopfzeile mit Servername, eine Zeile je Freigabe, unten Eingabefeld und Knopf "Forward".
10. FL-10: User gibt eine Port-Nummer ein und bestätigt -> Port wird freigegeben; neue Zeile erscheint; nichts öffnet sich.
11. FL-11: User nutzt eine Zeilen-Aktion -> "Open" öffnet im Vorschau-Tab; "Open in browser" öffnet im Standard-Browser des Macs; "Copy" kopiert die Mac-Adresse; "Stop" beendet die Freigabe und entfernt die Zeile.
12. FL-12: User wählt "Forward Port" in der Befehlspalette -> Ports-Liste öffnet sich mit Fokus im Eingabefeld.
13. FL-13: User öffnet in einem SSH-Workspace das Ports-Menü der Vorschau-Adressleiste -> es zeigt die freigegebenen Ports dieses Servers statt der festen Entwickler-Ports.
14. FL-14: User beendet Terax -> alle Freigaben enden.

Welle 3
15. FL-15: Ein freigegebener Port antwortet als Fernsteuer-Zugang eines Chrome -> die Zeile trägt die Marke "Chrome" und zusätzlich die Aktion "View browser".
16. FL-16: User klickt zum ersten Mal "View browser" -> einmaliger Hinweis-Dialog (Text siehe UI-12) mit "Continue" und "Cancel".
17. FL-17: User bestätigt -> die Live-Ansicht der Server-Seite öffnet sich im Chrome auf dem Mac; dort kann der User klicken und tippen.
18. FL-18: User klickt in der Ports-Liste auf "Set up browser view" -> die Anleitung öffnet sich (Server-Einrichtung; bei Rückfall zusätzlich die einmalige Einrichtung im Mac-Chrome).

**Error Paths:**
- EP-1: Datei größer als 100 MB -> Toast "{name} is larger than 100 MB and was not uploaded."; für diese Datei wird nichts eingefügt.
- EP-2: Upload scheitert (Verbindung weg, Speicher voll, keine Schreibrechte) -> Toast "Upload failed: {reason}"; nichts wird eingefügt; Hinweis im Pane verschwindet.
- EP-3: Bei mehreren Dateien scheitern einzelne -> die gelungenen werden eingefügt; ein Toast nennt die gescheiterten mit Grund.
- EP-4: Ein Ordner wird aufs SSH-Terminal gezogen -> Toast "Folders can't be uploaded to a terminal. Use the explorer."; Dateien derselben Ablage werden trotzdem hochgeladen.
- EP-5: Das Terminal wird während des Uploads geschlossen -> nichts wird eingefügt; kein Toast; bereits hochgeladene Dateien bleiben bis zum Aufräumen liegen.
- EP-6: Zwischenablage enthält Bild und Text zugleich -> Text wird wie heute eingefügt; kein Upload.
- EP-7: Port-Eingabe ist keine Zahl von 1 bis 65535 -> Feld zeigt "Enter a port between 1 and 65535."; keine Freigabe.
- EP-8: Port ist für diesen Server schon freigegeben -> keine zweite Freigabe; die bestehende Zeile wird hervorgehoben; bei FL-7/FL-8 öffnet sich die bestehende Mac-Adresse.
- EP-9: Freigabe scheitert (Verbindung weg, Server lehnt ab) -> Toast "Could not forward port {n}: {reason}"; keine Zeile.
- EP-10: Die Verbindung zum Server bricht ab -> betroffene Zeilen zeigen "Disconnected" und die Aktion "Retry"; "Open", "Open in browser", "Copy" und "View browser" sind dort nicht verfügbar; "Stop" bleibt.
- EP-11: "Retry" scheitert -> Toast wie EP-9; Zeile bleibt "Disconnected".
- EP-12: Auf dem Mac ist kein Google Chrome installiert -> statt FL-17 Meldung "Google Chrome is required on this Mac to view the remote browser."
- EP-13: Die Live-Ansicht lässt sich nicht mit einem Klick öffnen (Ergebnis der Machbarkeitsprüfung oder Fehlschlag im Einzelfall) -> die Anleitung aus FL-18 öffnet sich.

---

## UI Layout & Context

> No requirement IDs - context

### Screen: Terminal-Pane (SSH)
**Position:** Jeder Terminal-Pane eines SSH-Workspace
**When:** Während eines laufenden Uploads

**Layout:**
- Terminal-Inhalt unverändert, Eingabe frei
- Hinweis-Marke unten rechts im Pane: Lade-Symbol, Text "Uploading N file(s)..."
- Drop-Overlay beim Ziehen wie heute

### Screen: Statusleiste (SSH-Workspace)
**Position:** Unterer Fensterrand, rechte Seite
**When:** Aktiver Workspace ist ein SSH-Workspace

**Layout:**
- Angebots-Hinweis "Forward port {n}?" mit Schließen-Kreuz (nur solange ein Angebot offen ist)
- Element "Ports" mit Zähler der Freigaben dieses Servers; ohne Freigaben ohne Zähler
- Im lokalen Workspace sind beide nicht sichtbar

### Screen: Ports-Liste
**Position:** Klappt aus dem Element "Ports" nach oben auf
**When:** Klick auf "Ports" oder Befehl "Forward Port"

**Layout:**
- Kopfzeile: "PORTS" und Servername
- Je Freigabe eine Zeile: Server-Port, Pfeil, Mac-Adresse, Marke "Chrome" (nur Welle 3), Aktionen "Open", "Open in browser", "Copy", "Stop"; in Welle 3 zusätzlich "View browser"
- Zeile im Zustand getrennt: Server-Port, Text "Disconnected", Aktionen "Retry", "Stop"
- Leerer Zustand: "No forwarded ports. Enter a port below or click a localhost link in the terminal."
- Fußzeile: Eingabefeld "Port", Knopf "Forward"; in Welle 3 zusätzlich Link "Set up browser view"

```
+------------------------------------------+
| PORTS  litha-vps-xl                      |
|------------------------------------------|
| 3000 -> localhost:3000   [open][cp][x]   |
| 9222 -> localhost:9223   [open][cp][x]   |
| 8080    Disconnected     [retry]   [x]   |
|------------------------------------------|
| Port: [______]  [Forward]                |
+------------------------------------------+
| ~/projekt  main  [Forward port 5173?] [Ports 2] |
```

### Screen: Vorschau-Tab (SSH-Workspace)
**Position:** Bestehender Vorschau-Tab
**When:** Öffnen einer Freigabe oder manuelles Öffnen in einem SSH-Workspace

**Layout:**
- Adressleiste zeigt die Mac-Adresse
- Ports-Menü listet die Freigaben des Servers als "{Server-Port} -> localhost:{Mac-Port}"; ohne Freigaben der Text "No forwarded ports."

---

## UI Components & States

| ID | Element | Type | Location | States | Behavior |
|----|---------|------|----------|--------|----------|
| UI-1 | `terminal-upload-hint` | Marke | Terminal-Pane unten rechts | `hidden`, `uploading` | Zeigt "Uploading N file(s)..."; nicht klickbar; blockiert keine Eingabe; je Pane eigene Marke |
| UI-2 | `upload-error-toast` | Toast | Globale Toast-Fläche | `shown` | Texte nach EP-1 bis EP-4; schließt sich nach der Standardzeit |
| UI-3 | `port-offer` | Statusleisten-Hinweis | Statusleiste, links von "Ports" | `hidden`, `offering`, `working` | Klick gibt frei und öffnet (FL-7); Kreuz verwirft; bei mehreren offenen Angeboten zeigt er das jüngste und "+N" |
| UI-4 | `ports-status` | Statusleisten-Element | Statusleiste rechts | `hidden` (lokal), `empty`, `count`, `attention` | Klick öffnet die Ports-Liste; `attention` (Warnfarbe) wenn mindestens eine Freigabe getrennt ist |
| UI-5 | `ports-list` | Popover | über `ports-status` | `empty`, `listing` | Schließt bei Klick außerhalb oder Escape; bleibt bei Zeilen-Aktionen offen |
| UI-6 | `ports-row` | Listenzeile | Ports-Liste | `active`, `disconnected`, `highlighted` | Zeigt Server-Port und Mac-Adresse; weicht der Mac-Port ab, steht er hervorgehoben |
| UI-7 | `ports-row-actions` | Knopfgruppe | Ports-Zeile | je Aktion `enabled`, `disabled` | "Open", "Open in browser", "Copy" (Toast "Copied"), "Stop"; im Zustand `disconnected` nur "Retry" und "Stop" |
| UI-8 | `ports-input` | Eingabefeld mit Knopf | Fußzeile der Ports-Liste | `idle`, `invalid`, `working` | Enter oder "Forward" gibt frei; `invalid` zeigt den Text aus EP-7 |
| UI-9 | `palette-forward-port` | Befehl | Befehlspalette | `available` (SSH), `absent` (lokal) | Öffnet die Ports-Liste mit Fokus im Eingabefeld |
| UI-10 | `preview-ports-menu` | Dropdown | Vorschau-Adressleiste | `local` (wie heute), `remote-empty`, `remote-list` | In SSH-Workspaces Freigaben statt fester Ports; Auswahl lädt die Mac-Adresse |
| UI-11 | `view-browser-action` | Knopf | Ports-Zeile mit Marke "Chrome" | `enabled`, `disabled` (getrennt) | Öffnet die Live-Ansicht im Mac-Chrome (FL-16, FL-17) |
| UI-12 | `view-browser-notice` | Dialog | Mittig | `shown` | Titel "Remote browser access"; Text "Anyone who can reach this port can control the browser on {host}, including the accounts signed in there. Terax keeps it reachable from this Mac only."; Knöpfe "Continue", "Cancel"; erscheint einmal je Server |
| UI-13 | `browser-setup-link` | Link | Fußzeile der Ports-Liste | `shown` | Öffnet die Anleitung (FL-18) |

---

## Feature State Machine

### States Overview

| ID | State | UI | Available Actions |
|----|-------|----|--------------------|
| ST-1 | `upload_idle` | Kein Hinweis im Pane | Einfügen, Ziehen |
| ST-2 | `upload_running` | UI-1 `uploading` | Weiter tippen, weitere Dateien einfügen oder ziehen |
| ST-3 | `port_unknown` | Kein Angebot, keine Zeile | Von Hand freigeben, Adresse anklicken |
| ST-4 | `port_offered` | UI-3 `offering` | Annehmen, verwerfen, Adresse anklicken |
| ST-5 | `port_forwarding` | UI-3 oder UI-8 `working` | -- |
| ST-6 | `port_active` | UI-6 `active` | Open, Open in browser, Copy, Stop |
| ST-7 | `port_disconnected` | UI-6 `disconnected`, UI-4 `attention` | Retry, Stop |
| ST-8 | `port_dismissed` | Kein Angebot für diesen Port in diesem Terminal | Von Hand freigeben, Adresse anklicken |
| ST-9 | `browser_available` | UI-6 mit Marke "Chrome", UI-11 `enabled` | View browser, alle Aktionen aus ST-6 |

### Transitions

| ID | Current State | Trigger | UI Feedback | Next State | Business Rules |
|----|---------------|---------|-------------|------------|----------------|
| TR-1 | `upload_idle` | Cmd+V mit Bild oder Datei-Drop im SSH-Terminal | UI-1 erscheint | `upload_running` | BR-1, BR-2, BR-5 |
| TR-2 | `upload_running` | Alle Dateien beendet | UI-1 verschwindet; Pfade eingefügt; ggf. UI-2 | `upload_idle` | BR-3, BR-4, BR-6 |
| TR-3 | `upload_running` | Weitere Dateien eingefügt oder gezogen | Zähler in UI-1 steigt | `upload_running` | BR-7 |
| TR-4 | `port_unknown` | Lokale Adresse in der Terminal-Ausgabe | UI-3 `offering` | `port_offered` | BR-10, BR-11, BR-12 |
| TR-5 | `port_offered` | Klick auf UI-3 | UI-3 `working` | `port_forwarding` | BR-13 |
| TR-6 | `port_offered` | Klick auf das Kreuz | UI-3 verschwindet | `port_dismissed` | BR-12 |
| TR-7 | `port_unknown`, `port_offered`, `port_dismissed` | Klick auf die Adresse im Terminal oder Freigabe von Hand | UI-3 oder UI-8 `working` | `port_forwarding` | BR-13 |
| TR-8 | `port_forwarding` | Freigabe gelungen | Neue Zeile; Zähler steigt; bei FL-7/FL-8 öffnet der Vorschau-Tab | `port_active` | BR-14, BR-15 |
| TR-9 | `port_forwarding` | Freigabe gescheitert | Toast nach EP-9 | `port_unknown` | -- |
| TR-10 | `port_active` | "Stop" | Zeile verschwindet; Zähler sinkt | `port_unknown` | BR-16 |
| TR-11 | `port_active`, `browser_available` | Verbindung zum Server bricht ab | Zeile "Disconnected"; UI-4 `attention` | `port_disconnected` | BR-17 |
| TR-12 | `port_disconnected` | "Retry" gelungen | Zeile wieder aktiv | `port_active` | BR-14 |
| TR-13 | `port_disconnected` | "Stop" | Zeile verschwindet | `port_unknown` | -- |
| TR-14 | `port_active` | Port antwortet als Chrome-Fernsteuer-Zugang | Marke "Chrome"; UI-11 erscheint | `browser_available` | BR-20 |
| TR-15 | `browser_available` | "View browser" | Beim ersten Mal UI-12; danach Live-Ansicht im Mac-Chrome | `browser_available` | BR-21, BR-22 |
| TR-16 | alle Port-Zustände | Terax wird beendet | -- | `port_unknown` | BR-18 |

---

## Garantie

keine

---

## Business Rules

Welle 1
- BR-1: Hochgeladen wird nur in Terminals eines SSH-Workspace. Lokale Terminals verhalten sich wie heute.
- BR-2: Cmd+V lädt nur hoch, wenn die Zwischenablage ein Bild und keinen Text enthält. In allen anderen Fällen gilt das heutige Einfügen.
- BR-3: Eingefügt wird ausschließlich der Pfad der Datei auf dem Server. Der Mac-Pfad wird in SSH-Terminals nie eingefügt; es gibt keinen Schalter und keine Zusatztaste dafür.
- BR-4: Der Pfad wird erst eingefügt, wenn die Datei vollständig auf dem Server liegt, und zwar an der Stelle, an der die Eingabe in diesem Moment steht. Bei mehreren Dateien einer Ablage entsteht genau eine Einfügung.
- BR-5: Grenze 100 MB je Datei. Größere Dateien werden nicht übertragen.
- BR-6: Ablage in einem eigenen Ordner von Terax im Home des Server-Kontos, außerhalb jedes Projektordners. Der Ordner und die Dateien sind nur für das eigene Server-Konto lesbar.
- BR-7: Uploads blockieren weder die Terminal-Eingabe noch andere Panes. Mehrere Uploads im selben Pane laufen nacheinander ab; ihre Pfade erscheinen in der Reihenfolge der Auslösung.
- BR-8: Bei jedem Upload werden Dateien im Upload-Ordner gelöscht, die älter als 7 Tage sind. Dateien außerhalb dieses Ordners werden nie gelöscht.
- BR-9: Uploads löst nur der User durch Einfügen oder Ziehen aus. Der eingebaute Terax-Agent und seine Werkzeuge können keinen Upload auslösen.

Welle 2
- BR-10: Erkannt werden in der Ausgabe von SSH-Terminals Adressen mit den Hosts `localhost`, `127.0.0.1`, `0.0.0.0` und `[::1]` und einer Port-Nummer, mit oder ohne `http://` oder `https://`.
- BR-11: Für Ports unter 1024 wird kein Angebot gezeigt. Von Hand und per Klick auf die Adresse sind sie freigebbar.
- BR-12: Je Terminal und Port wird das Angebot höchstens einmal gezeigt, bis es angenommen oder verworfen wurde. Für einen bereits freigegebenen Port gibt es kein Angebot.
- BR-13: Kein Port wird ohne Klick des Users freigegeben. Der eingebaute Terax-Agent und seine Werkzeuge können keine Freigabe auslösen.
- BR-14: Terax nimmt auf dem Mac dieselbe Port-Nummer wie auf dem Server. Ist sie belegt, nimmt es die nächste freie höhere Nummer und zeigt die Abweichung in der Zeile und im Erfolgs-Toast "Port {n} is available at localhost:{m}".
- BR-15: Eine Freigabe ist nur vom Mac selbst erreichbar, nie aus dem Netz.
- BR-16: Freigaben gehören zum Server, nicht zum Terminal. Sie bleiben bestehen, wenn das auslösende Terminal geschlossen wird.
- BR-17: Bricht die Verbindung ab, stellt Terax Freigaben nicht von selbst wieder her; der User wählt "Retry".
- BR-18: Freigaben werden nicht gespeichert. Mit dem Beenden von Terax enden alle; nach dem Start gibt es keine.
- BR-19: Die Ports-Liste und das Ports-Menü der Vorschau zeigen nur die Freigaben des Servers des aktiven Workspace. Freigaben anderer Server bleiben bestehen und sind dort sichtbar.

Welle 3
- BR-20: "View browser" wird nur für Freigaben angeboten, die als Fernsteuer-Zugang eines Chrome antworten.
- BR-21: Der Hinweis UI-12 erscheint einmal je Server; "Cancel" öffnet nichts und der Hinweis erscheint beim nächsten Klick erneut.
- BR-22: Die Live-Ansicht läuft ausschließlich zwischen Mac und Server über die bestehende Verbindung. Seiteninhalte gehen an keinen Dritten.
- BR-23: Terax ändert keine Einstellungen auf dem Server. Voraussetzung (Chrome mit Fernsteuer-Zugang, an den sich der Chrome DevTools MCP hängt; Zugang nur auf dem Server selbst erreichbar) und Einrichtung stehen in der Anleitung.
- BR-24: Welle 3 beginnt mit der Machbarkeitsprüfung auf dem Mac des Users. Ergebnis "ein Klick" oder "einmalige Einrichtung im Mac-Chrome" wird in diesem Dokument nachgetragen, bevor gebaut wird.

---

## Data

| ID | Field | Required | Validation | Notes |
|----|-------|----------|------------|-------|
| DF-1 | Dateiname Zwischenablage-Bild | Yes | -- | `clipboard-{JJJJMMTT}-{HHMMSS}.png`, Ortszeit des Macs |
| DF-2 | Dateiname gezogene Datei | Yes | -- | Originalname; existiert er im Upload-Ordner schon, bekommt die neue Datei einen Zähler-Zusatz. Bestehende Dateien werden nie überschrieben |
| DF-3 | Dateigröße | Yes | höchstens 100 MB | Prüfung vor der Übertragung |
| DF-4 | Aufbewahrung | Yes | 7 Tage ab Upload | Aufräumen nach BR-8 |
| DF-5 | Server-Port (Eingabe) | Yes | ganze Zahl 1 bis 65535 | EP-7 |
| DF-6 | Mac-Port | Yes | frei auf dem Mac | BR-14 |
| DF-7 | Mac-Adresse (Anzeige, Kopieren) | Yes | -- | `http://localhost:{Mac-Port}`; bei Klick auf eine Terminal-Adresse mit deren Pfad und Query |
| DF-8 | Bestätigung Hinweis UI-12 | No | -- | Je Server gemerkt, übersteht den Neustart von Terax |

---

## Trigger-Inventory

> Terax hat keine Nutzungsmessung. Alle Zeilen: Signal bewusst keines.

| ID | Entry Point | Trigger | Signal today | Signal after | Notes |
|----|-------------|---------|--------------|--------------|-------|
| TG-1 | SSH-Terminal | Cmd+V mit Bild in der Zwischenablage | none | none - deliberate | Welle 1 |
| TG-2 | SSH-Terminal | Datei-Drop aus dem Finder | none | none - deliberate | Welle 1; geändertes Verhalten |
| TG-3 | Terminal-Pane | Hinweis "Uploading..." sichtbar | none | none - deliberate | Welle 1; Systemzustand |
| TG-4 | Ausgabe SSH-Terminal | Lokale Adresse erkannt, Angebot sichtbar | none | none - deliberate | Welle 2; Systemzustand |
| TG-5 | Statusleiste | Klick auf Angebot, Klick auf Kreuz | none | none - deliberate | Welle 2 |
| TG-6 | SSH-Terminal | Klick auf lokale Adresse | none | none - deliberate | Welle 2; geändertes Verhalten |
| TG-7 | Statusleiste | Klick auf "Ports" | none | none - deliberate | Welle 2 |
| TG-8 | Ports-Liste | "Forward", "Open", "Open in browser", "Copy", "Stop", "Retry" | none | none - deliberate | Welle 2 |
| TG-9 | Befehlspalette | "Forward Port" | none | none - deliberate | Welle 2 |
| TG-10 | Vorschau-Adressleiste | Ports-Menü in SSH-Workspace | none | none - deliberate | Welle 2; geändertes Verhalten |
| TG-11 | Verbindung | Abbruch, Zeile "Disconnected" | none | none - deliberate | Welle 2; Systemzustand |
| TG-12 | Ports-Liste | "View browser", "Set up browser view" | none | none - deliberate | Welle 3 |
| TG-13 | Dialog | "Continue", "Cancel" in UI-12 | none | none - deliberate | Welle 3 |

---

## Compliance & Security Surface

> No requirement IDs - covered via BR-6, BR-9, BR-13, BR-15, BR-22, BR-23

| Fläche | Berührt | Befund |
|--------|---------|--------|
| Auth | Nein | Keine neuen Anmeldungen oder Schlüssel; alles läuft über die bestehende, vom User aufgebaute SSH-Verbindung |
| Sensible Daten at-rest | Ja | Screenshots und Dateien liegen bis zu 7 Tage auf dem Server; Ordner nur für das eigene Konto lesbar (BR-6), Aufräumen nach BR-8 |
| Externe Integrationen / Webhooks | Nein | Keine neuen Dienste; die Live-Ansicht darf keinen Dritten einbeziehen (BR-22) |
| Privilegierte Aktionen | Ja | Freigabe öffnet einen Port auf dem Mac, nur lokal erreichbar (BR-15), nur auf Klick (BR-13). Der Chrome-Fernsteuer-Zugang erlaubt die Steuerung angemeldeter Konten: Hinweis UI-12, Zugang nur auf dem Server selbst (BR-23) |
| KI-Werkzeugfläche | Ja (Abgrenzung) | Upload und Freigabe sind dem eingebauten Agenten nicht zugänglich (BR-9, BR-13); die bestehende Sperrliste für Geheimnis-Pfade bleibt unberührt |
| Aufbewahrungspflichten | Nein | Keine Pflichten; 7-Tage-Löschung ist Komfort und Datensparsamkeit |

---

## Implementation Slices

> No requirement IDs - context

### Dependencies

```
Slice 1 (Welle 1)

Slice 2 -> Slice 3 (Welle 2) -> Slice 4 -> Slice 5 (Welle 3)
```

### Slices

| # | Name | Scope | Testability | Dependencies |
|---|------|-------|-------------|--------------|
| 1 | Upload in SSH-Terminals | FL-1 bis FL-5, EP-1 bis EP-6, UI-1, UI-2, ST-1, ST-2, TR-1 bis TR-3, BR-1 bis BR-9, DF-1 bis DF-4, TG-1 bis TG-3 | Regeln als reine Funktionen (Namensvergabe, Grenze, Reihenfolge, Teil-Fehler); in der App: Screenshot per Cmd+V in Claude Code über SSH ergibt "[Image #N]" | -- |
| 2 | Port-Freigabe und Ports-Liste | FL-9 bis FL-12, FL-14, EP-7 bis EP-11, UI-4 bis UI-9, ST-3, ST-5 bis ST-7, TR-7 bis TR-13, TR-16, BR-13 bis BR-19, DF-5 bis DF-7, TG-7 bis TG-9, TG-11 | Port von Hand freigeben, Seite im Mac-Browser laden; belegte Nummer; Verbindungsabbruch | -- |
| 3 | Erkennung, Angebot, Vorschau | FL-6 bis FL-8, FL-13, UI-3, UI-10, ST-4, ST-8, TR-4 bis TR-6, BR-10 bis BR-12, TG-4 bis TG-6, TG-10 | Erkennungsregeln als reine Funktionen; in der App: Dev-Server auf dem Server starten, Hinweis annehmen | 2 |
| 4 | Machbarkeitsprüfung Browser-Ansicht | BR-24; Server-Einrichtung auf der Dev-Box; Ergebnis im Dokument nachtragen | Live-Ansicht einer Server-Seite im Mac-Chrome bedienbar | 2 |
| 5 | Browser-Ansicht | FL-15 bis FL-18, EP-12, EP-13, UI-11 bis UI-13, ST-9, TR-14, TR-15, BR-20 bis BR-23, DF-8, TG-12, TG-13 | Anmeldung auf einer Seite im Server-Chrome vom Mac aus | 4 |

### Recommended Order

1. **Slice 1:** Upload in SSH-Terminals -- kleinster Umfang, täglicher Nutzen, unabhängig vom Rest; erster Bau-Lauf.
2. **Slice 2:** Port-Freigabe und Ports-Liste -- Grundlage für Slice 3 bis 5.
3. **Slice 3:** Erkennung, Angebot, Vorschau -- macht die Freigabe zum schnellen Wechsel.
4. **Slice 4:** Machbarkeitsprüfung -- entscheidet den Weg von Slice 5.
5. **Slice 5:** Browser-Ansicht.

### Nach dem Merge

| Welle | Slices | IDs |
|-------|--------|-----|
| 2 | 2, 3 | FL-6 bis FL-14, EP-7 bis EP-11, UI-3 bis UI-10, ST-3 bis ST-8, TR-4 bis TR-13, TR-16, BR-10 bis BR-19, DF-5 bis DF-7, TG-4 bis TG-11 |
| 3 | 4, 5 | FL-15 bis FL-18, EP-12, EP-13, UI-11 bis UI-13, ST-9, TR-14, TR-15, BR-20 bis BR-24, DF-8, TG-12, TG-13 |

---

## Context & Research

> No requirement IDs - context

### Similar Patterns in Codebase
| Feature | Location | Relevant because |
|---------|----------|------------------|
| Datei-Drop aufs Terminal | `src/modules/terminal/lib/useTerminalFileDrop.ts`, `quoteShellPath.ts` | Fügt heute ohne Blick auf den Workspace den lokalen Pfad ein; Stelle der Änderung für Welle 1 |
| Einfügen ins Terminal | `src/modules/terminal/lib/rendererPool.ts` (`pasteIntoLeaf`) | Einfügung, die Claude Code als Bildpfad erkennt |
| Kopieren auf den Server | `src-tauri/src/modules/ssh.rs` (`copy`), `fs::copy` | Upload über die geteilte Verbindung existiert für den Explorer |
| Finder-Zwischenablage | `src-tauri/src/modules/fs/clipboard.rs` | Liest heute nur Datei-Verweise, keine Bilddaten |
| Geteilte SSH-Verbindung | `src-tauri/src/modules/ssh.rs` (`control_args`, `master_alive`, `disconnect_all`) | Eine Verbindung je Server, endet mit der App; daran hängen Freigaben |
| Vorschau | `src/modules/preview/PreviewPane.tsx`, `PreviewAddressBar.tsx` | Kennt nur das `localhost` des Macs, feste Port-Liste |
| Statusleiste | `src/modules/statusbar/` | Ort für Angebot und Ports-Element |
| Workspace-Art | `src/modules/workspace/env.ts` | Unterscheidung lokal, WSL, SSH |

### Web Research
| Source | Finding |
|--------|---------|
| Claude Code Issues #42712, #47519 | Bild-Einfügen über SSH liest die Zwischenablage des Servers; kein eingebauter Weg |
| clipssh, claude-ssh-image-skill, cc-clip | Alle Hilfswerkzeuge laden das Bild hoch und fügen den Server-Pfad ein |
| VS Code Port Forwarding (Doku, Release Notes 1.49/1.54) | Erkennung über Terminal-Ausgabe ist der Standard bei SSH; Meldung bei Freigabe; Ports-Ansicht; abweichender lokaler Port bei Belegung |
| Chrome DevTools MCP Konfiguration (developer.chrome.com) | Startet standardmäßig einen eigenen Chrome mit dauerhaftem Profil; kann sich stattdessen an einen laufenden Chrome mit Fernsteuer-Zugang hängen; keine eigene Live-Ansicht |
| Browserless, Cloudflare Live View | Gehostete Dienste bieten Live-Ansichten; kein fertiges offenes Gegenstück gefunden |

---

## Frame

> No requirement IDs - context

| Question | Recommendation (from research) | Decision |
|----------|--------------------------------|----------|
| Legacy parity | not configured | not asked |
| Run boundary -- what does this run build, what comes after the merge? | Erster Lauf nur Welle 1 (Slice 1); Wellen 2 und 3 je eigener Lauf, IDs in "Nach dem Merge" | Wie empfohlen |
| Tolerated duplication -- may old and new path run side by side, until when? | Keine Doppelung: im SSH-Fall wird das alte Verhalten ersetzt, lokal bleibt alles unverändert | Wie empfohlen; kein Schalter, keine Zusatztaste |
| Open business rule -- which rule is undecided, who decides it? | none; Erkennungsregel BR-10 bis BR-12 gilt wie vorgeschlagen | Keine offene Regel. Technisch offen ist nur das Ergebnis der Machbarkeitsprüfung (BR-24) |

---

## Open Questions

> No requirement IDs - context

| # | Question | Options | Recommended | Decision |
|---|----------|---------|-------------|----------|
| 1 | Lässt sich die Live-Ansicht im Mac-Chrome mit einem Klick aus Terax öffnen? | A) Ja, ein Klick B) Nein, einmalige Einrichtung im Mac-Chrome mit Anleitung | A, Rückfall B | Offen bis Slice 4 (BR-24) |

---

## Research Log

> No requirement IDs - context

| Date | Area | Finding |
|------|------|---------|
| 2026-11-20 | GitHub | Issues im Fork deaktiviert; `gh` löst ohne Angabe auf das Upstream-Repo auf; dort wird nichts angelegt |
| 2026-11-20 | Codebase | Datei-Drop aufs Terminal prüft die Workspace-Art nicht und fügt in SSH-Terminals den Mac-Pfad ein (aus dem Code gelesen, nicht in der App nachgestellt) |
| 2026-11-20 | Codebase | Upload über SSH, Einfügung ins Terminal und Auslesen der Finder-Zwischenablage existieren; Bilddaten aus der Zwischenablage werden noch nicht gelesen |
| 2026-11-20 | Codebase | Keine Port-Weiterleitung im Code; Vorschau lädt in SSH-Workspaces das `localhost` des Macs |
| 2026-11-20 | Codebase | Keine Nutzungsmessung in Terax |
| 2026-11-20 | Server (Dev-Box) | Kein Bildschirm; Profilordner des Chrome DevTools MCP vorhanden; vier Chrome-Builds installiert (151 und 156, je Voll- und Headless-Variante) |
| 2026-11-20 | Server (Dev-Box) | Test mit allen vier Builds: Fernsteuer-Zugang antwortet und listet Seiten; die Ansichts-Seite wird nicht mitgeliefert (Platzhalter mit 990 Bytes), der Verweis zeigt auf eine von Google gehostete Seite. Folge: Die Ansicht muss der Mac-Chrome selbst stellen; Ein-Klick-Weg unbelegt |
| 2026-11-20 | Web | Siehe Web Research |
| 2026-11-20 | Werkzeug | Mockup-Werkzeug nicht nutzbar: `zip.config.json` fehlt im Projekt und unter `~/litha` |

---

## Q&A Log

> No requirement IDs - context

| # | Question | Recommendation | Answer | Alternative & consequence | Mode |
|---|----------|----------------|--------|---------------------------|------|
| 1 | Auf dem Fork sind Issues abgeschaltet, bisherige Specs laufen ohne Issue-Nummer. Wie soll diese Discovery geführt werden? | Ohne Issue weiter, wie bei den bisherigen Specs | Ohne Issue weiter | Issues am Fork einschalten: Branch und Ordner mit Nummer, dauerhafte Änderung am Fork | interaktiv |
| 2 | Wie gründlich soll vor den Fragen recherchiert werden? | Umfassend zuerst, weil eine Aufwands-Einschätzung gewünscht ist | Umfassend zuerst | Essenzielle Fragen direkt: schneller im Dialog, gröbere Einschätzung | interaktiv |
| 3 | Wie tief soll das Dokument gehen? | Standard, weil noch offen ist, ob alle drei Themen gebaut werden | Detailliert | Standard oder kurz: weniger Fragen, Nachklärung vor dem Bau | interaktiv |
| 4 | Wie sollen die drei Themen geführt werden? | Eine Discovery, drei Wellen mit je eigenem PR | Eine Discovery, drei Wellen | Drei getrennte Discoverys: dreimal Fragerunde; ein Bau-Lauf: später Nutzen, gegenseitige Blockade | interaktiv |
| 5 | Welche Wege für Bilder soll Welle 1 abdecken? | Cmd+V und Ziehen für alle Dateien, weil der Mac-Pfad im SSH-Tab nie stimmt | Cmd+V und Ziehen, alle Dateien | Nur Bilder: andere Dateien fügen weiter den toten Mac-Pfad ein; nur Cmd+V: Ziehen bleibt kaputt | interaktiv |
| 6 | Wo sollen hochgeladene Dateien auf dem Server liegen und wie lange? | Eigener, nur für das Konto lesbarer Ordner im Home, 7 Tage | Eigener Ordner im Home, 7 Tage | Temporärer Systemordner: Bilder verschwinden beim Neustart; Projektordner: tauchen in git status auf; nie löschen: Ordner wächst | interaktiv |
| 7 | Wie soll sich Terax während und nach dem Hochladen verhalten? | Hinweis im Pane, weiter tippen möglich, Pfad am Ende, Fehlermeldung mit Grund, Grenze 100 MB | Hinweis im Pane, Pfad am Ende | Terminal sperren: Pfad garantiert an der Einfügestelle, aber Wartezeit; still: keine Rückmeldung bei langsamer Leitung | interaktiv |
| 8 | Wodurch soll eine Port-Freigabe ausgelöst werden? | Erkennen und anbieten plus Handweg; nichts ohne Klick | Erkennen und anbieten, plus Handweg | Sofort freigeben: auch ungewollte Ports; nur von Hand: kein schneller Wechsel; Befehl für Claude: Einrichtung je Server | interaktiv |
| 9 | Wo soll eine freigegebene Adresse aufgehen? | Vorschau-Tab, Mac-Browser per Knopf | Vorschau-Tab, Browser per Knopf | Immer Mac-Browser: Fensterwechsel; nur freigeben: ein Klick mehr; Einstellung: mehr Pflege | interaktiv |
| 10 | Was passiert, wenn die Port-Nummer auf dem Mac belegt ist? | Nächste freie Nummer nehmen und deutlich anzeigen | Nächste freie Nummer nehmen | Ablehnen: Nummern stimmen immer, aber erst etwas schließen; nachfragen: Dialog im schnellen Wechsel | interaktiv |
| 11 | Wie lange soll eine Freigabe bestehen? | Bis der User sie schließt oder Terax endet; bei Abbruch "erneut freigeben" | Bis du sie schließt oder Terax endet | Je Server merken: Ports öffnen sich ungefragt, braucht Verwaltung; nur solange das Terminal offen ist: Vorschau bricht beim Aufräumen weg | interaktiv |
| 12 | Wo soll die Ports-Liste sitzen? | Statusleiste mit Aufklapp-Liste | Erst Mockups ansehen | -- | interaktiv |
| 13 | Bild-Mockups sind hier nicht erzeugbar (Bild-Dienst nicht konfiguriert); Text-Skizzen dreier Varianten. Wo soll die Ports-Liste sitzen? | Statusleiste mit Aufklapp-Liste: immer sichtbar, kein Platz in der Seitenleiste | Statusleiste mit Aufklapp-Liste (Skizze gewählt) | Seitenleisten-Panel: mehr Platz, weiteres Symbol; nur im Vorschau-Tab: Freigaben erst nach Öffnen eines Vorschau-Tabs sichtbar | interaktiv |
| 14 | Welchen Weg soll die Browser-Ansicht gehen? | Chromes Fernansicht im Mac-Chrome: kleinster Umfang, baut auf Welle 2 auf | Chromes Fernansicht im Mac-Chrome | Eigener Browser-Tab in Terax: bequemer, eigenes großes Feature; ganzes Fenster übertragen: Server-Arbeit in litha-infra; weglassen: Port von Hand | interaktiv |
| 15 | Der Server-Chrome liefert die Ansichts-Seite nicht mit; ob ein Klick aus Terax reicht, ist unbelegt. Wie damit umgehen? | Erst prüfen, dann bauen; Rückfall auf einmalige Einrichtung im Mac-Chrome mit Anleitung | Erst prüfen, dann bauen | Gleich einmalige Einrichtung: sicher, kein Ein-Klick-Weg; eigener Browser-Tab: eigene Discovery | interaktiv |
| 16 | Wer richtet auf dem Server ein, dass Chrome mit Fernsteuer-Zugang läuft und der Chrome DevTools MCP sich daran hängt? | Anleitung, Einrichtung von Hand je Server; Terax ändert nichts auf dem Server | Freitext: "können wir direkt von hier aus machen, ist unsere Dev-Box". Gelesen als: eine Claude-Session auf der Dev-Box richtet es als Teil von Welle 3 ein; Terax ändert nichts auf dem Server. Im Sign-off bestätigt | Terax richtet per Klick ein: greift in die Konfiguration der Claude-Sessions ein; litha-infra: einheitlich, aber Welle 3 wartet darauf | interaktiv |
| 17 | Was soll der erste Bau-Lauf umfassen? | Nur Welle 1, Rest nach dem Merge; pro Welle ein PR hat sich bewährt | Nur Welle 1, Rest nach Merge | Wellen 1 und 2 zusammen: schwereres Review; alle drei: Machbarkeitsprüfung mitten im Lauf | interaktiv |
| 18 | Soll das alte Verhalten im SSH-Fall irgendwo erhalten bleiben? | Nein, im SSH-Fall ersetzen; lokal unverändert | Nein, im SSH-Fall ersetzen | Schalter in den Einstellungen oder Zusatztaste: zwei Wege dauerhaft pflegen | interaktiv |
| 19 | Ist noch eine Geschäftsregel offen? Vorschlag für die Erkennung: localhost, 127.0.0.1, 0.0.0.0, [::1] mit Port; Hinweis je Terminal und Port einmal | Vorschlag gilt, nichts offen | Vorschlag gilt, nichts offen | Erkennung offen bis Welle 2: Entscheidung nach Erfahrung mit Welle 1 | interaktiv |
| 20 | Soll jetzt ein Clickdummy entstehen? | Ohne Clickdummy: Welle 1 hat kaum Oberfläche, Ports-Aufbau per Skizze gewählt | Ohne Clickdummy weiter | Clickdummy erstellen: Ports-Abläufe vor dem Bau erlebbar, dauert spürbar länger | interaktiv |
| 21 | Sign-off: Gibst du die Discovery wie zusammengefasst frei (inklusive der vom Agenten ergänzten Details und der Lesart zu Frage 16)? | Freigeben, Branch anlegen, committen, auf den Fork pushen | Freigeben | Nicht pushen: Zweig bleibt lokal; Entwurf: Status Draft; ändern: neue Runde | interaktiv |
