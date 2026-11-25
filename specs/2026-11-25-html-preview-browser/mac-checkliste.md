# Mac-Checkliste: HTML-Vorschau im Browser (Welle 1)

Stand: 25.11.2026, Branch `html-preview-browser` im Fork `tharshan09/terax-ai` (Draft-PR #98). Auf der Linux-Werkbank ist alles gebaut, getestet und für macOS typgeprüft; gelinkt und gelaufen ist auf macOS noch nichts. Diese Liste ist die Abnahme am Mac. Jede Zeile: was tun, was muss zu sehen sein. Ein „nein" oder etwas Unerwartetes bitte mit einem Satz oder Screenshot notieren; die Kennungen (N-…, OB-…) verweisen auf `architecture.md`, `discovery.md` und `gates/obligations.md`.

**Die installierte Terax-App bleibt dabei offen.** Geprüft wird in der Zweit-App „Terax Dev" (`TERAX.md`, Abschnitt zur Dev-Variante): eigene Einstellungen, eigene SSH-Verbindungen, eigener Mini-Server.

## 0. Bauen und starten

- [ ] Branch holen: `git fetch origin html-preview-browser && git switch html-preview-browser`, dann `pnpm install --frozen-lockfile`.
- [ ] `pnpm tauri:build:dev-variant` läuft ohne Fehler durch. **Erster echter macOS-Build:** der Esc-Monitor (`zen_escape.rs`) und die Prüfung der geöffneten Datei (`F_GETPATH` in `preview_server/source.rs`) werden hier zum ersten Mal gelinkt. Bricht der Build ab: Fehlertext schicken, nichts weiter prüfen.
- [ ] Optional, 2 Minuten: `cd src-tauri && cargo test --locked -- --test-threads=2` (auf Linux 727 + Slice 02 grün; am Mac laufen zusätzlich die macOS-Zweige).
- [ ] „Terax Dev" startet, ein Terminal-Tab öffnet sich, die installierte App läuft unverändert weiter (N-15).
- [ ] Größe von `Terax Dev.app` notieren und mit der installierten App vergleichen (N-6).

## 1. „Open in Browser", lokale Dateien

- [ ] HTML-Datei mit CSS, Bild und Skript aus Nachbardateien öffnen, in der Kopfzeile „Open in Browser": Standard-Browser zeigt die Seite mit allem (N-2). Kein Firewall-Dialog (N-16).
- [ ] Derselbe Klick noch einmal: dieselbe Adresse (kein neuer Port).
- [ ] Datei ändern und speichern, im Browser neu laden: neuer Stand, auch für CSS (N-3), in Safari und Chrome.
- [ ] Im Explorer Rechtsklick auf die Datei: „Open in Browser" steht direkt unter „Open with Default App"; für eine `.txt` und für einen Ordner fehlt der Eintrag.
- [ ] Bild (png/jpg) und PDF: Kopfzeile mit Dateiname, „Open in Browser" und Zen-Taste; der Browser zeigt Bild bzw. PDF. PDF in der installierten Safari-Version (Version notieren) und in Chrome (N-8).
- [ ] SVG: öffnet in Terax als Code ohne Kopfzeile; „Open in Browser" nur im Kontextmenü des Explorers; im Browser erscheint das Bild.
- [ ] Reichweite (N-19): Seite mit `<img src="../x.png">` und `<img src="sub/y.png">`: nur `y` lädt. Im Ordner `ln -s ~/irgendein-bild.png link.png` und `<img src="link.png">`: lädt nicht. `fetch('.env')` in der Seite: 403.
- [ ] Groß-/Kleinschreibung (OB-24): `<img src="SUB/Y.PNG">` (Ordner heißt `sub`): notieren, ob es lädt; `fetch('.GIT/config')` in einem Git-Ordner: 403.
- [ ] Getarnte Datei: `ln -s seite.html harmlos.png`, „Open in Browser" auf `harmlos.png`: Meldung „… the link points to a different kind of file", kein Browser-Tab.
- [ ] Datei direkt im Home (`~/test.html` mit Nachbar `~/x.png`): Seite öffnet, das Nachbarbild lädt nicht (nur die Datei selbst wird freigegeben).
- [ ] Link nach dem Beenden (N-18): Adresse kopieren, „Terax Dev" beenden, im Browser neu laden: keine Verbindung. Wieder starten: alter Link bleibt tot, neuer Klick gibt eine neue Adresse.
- [ ] Vom iPhone im selben WLAN `http://{Mac-IP}:{port}/…`: keine Verbindung (N-16).
- [ ] Chrome: kein Dialog „Zugriff auf lokales Netzwerk" beim Öffnen (N-7); wenn doch, Wortlaut notieren.

## 2. „Open in Browser", Dateien auf dem SSH-Server

- [ ] Ordner `specs/2026-11-25-html-preview-browser/evidence/messseite` auf den Server kopieren, im Explorer „Open in Browser" auf `index.html`: Safari und Chrome zeigen bei 1–8 „ja" (N-17). Adresse auf `bild.svg` ändern: Bild sichtbar.
- [ ] Eine SVG mit `<script>alert(1)</script>` auf dem Server direkt per „Open in Browser": kein Alert (N-17).
- [ ] PDF auf dem Server: in Terax die Karte „preview not available over SSH" mit Kopfzeile; „Open in Browser" zeigt die PDF (N-24).
- [ ] Verbindung trennen (N-20): `ssh -O exit {host}`, Seite im Browser neu laden: Textseite mit Dateiname und Host, ohne rohen Fehlertext des Servers. Terminal-Tab zum Host öffnen, neu laden: Seite da.
- [ ] Last (N-25, N-4): auf dem Server `sshd -T | grep -i maxsessions` notieren. 7 SSH-Terminal-Tabs zum Host offen, dann eine Seite mit 30 Bildern per „Open in Browser": alle Bilder da; dabei einen weiteren Terminal-Tab öffnen und die Quellcodeverwaltung aktualisieren: beides ohne Fehler. Ladezeit notieren (ein Lesevorgang je Host zugleich: bei spürbarer Wartezeit melden, die Grenze ist einstellbar).
- [ ] Strenges Öffnen auf dem Server: eine HTML-Datei in einem Ordner, dessen Elternordner für dein Konto nur Durchgangsrecht hat (`chmod 711` beim Besitzer eines anderen Kontos; nur falls es so einen Ordner gibt): notieren, ob „Open in Browser“ die Seite zeigt. Auf einem macOS-Server wird hier eine Fehlerseite erwartet, obwohl der Editor die Datei lesen kann; auf Linux-Servern soll es gehen.
- [ ] Hängender Lesevorgang: nicht leicht nachzustellen; falls eine Seite über SSH einmal hängt, notieren, nach wie vielen Sekunden die Fehlerseite kommt (erwartet: spätestens rund 60 s je Datei).

## 3. HTML-Vorschau in Terax über den Mini-Server (Abnahme M-C, N-23, OB-19)

Die Konstante `HTML_PREVIEW_VIA_SERVER` ist an. Bleibt die Vorschau weiß, ist das der Abbruchfall unten, kein Grund zur Sorge.

- [ ] M-C lokal: Messseite (`evidence/messseite/index.html`) als HTML-Vorschau in Terax öffnen: Seite sichtbar, Punkte 1–6 „ja" (7 und 8 hängen an der Abschottung des Rahmens; Ergebnis notieren). Relatives CSS, Bild und Skript laden.
- [ ] M-C über SSH: dieselbe Messseite vom Server als HTML-Vorschau: sichtbar, mit Nachbardateien (das ging bisher über SSH gar nicht).
- [ ] Eine zweite HTML-Datei im selben Ordner, die `index.html` in einem `iframe` einbettet: Ergebnis notieren (darf leer sein; dann greift die Variante ohne `frame-ancestors`).
- [ ] **Wenn weiß oder Punkt 4 rot:** zuerst M-B zur Einordnung (im Ordner `python3 -m http.server 8765 --bind 127.0.0.1`, in Terax einen Web-Vorschau-Tab mit `http://127.0.0.1:8765/index.html`, danach mit `http://localhost:8765/index.html`; Punkte 1–6 notieren) und Ergebnis schicken. Dann stelle ich in dieser Reihenfolge um: Fallback-Adresse `localhost`, Variante ohne `frame-ancestors`, und erst wenn beides nicht hilft, die Konstante aus (HTML-Vorschau wie heute). Die Ursache ist nur im Debug-Build oder mit Web Inspector sichtbar.
- [ ] „Neu laden" in der Kopfzeile: Seite lädt neu, die Taste hört auf zu drehen (lokal und über SSH). Datei ändern, „Neu laden": neuer Stand.
- [ ] Neu laden bei Fehler: SSH-Verbindung trennen, „Neu laden": Fehlerseite im Rahmen oder Rückfall; die Taste darf nicht ewig drehen. Wieder verbinden, „Neu laden": Seite mit Nachbardateien da.
- [ ] Rückfall und zweiter Versuch: HTML-Tab auf einem Server öffnen, BEVOR die Verbindung steht (direkt nach App-Start): Vorschau erscheint evtl. ohne Bilder; „Neu laden": jetzt mit Bildern. Notieren, ob die Fläche dabei kurz leer ist und ob das stört.
- [ ] Popups (N-14): eine Seite mit `<a href="x.html" target="_blank">` und mit `window.open(location.href)`: notieren, was passiert (neues Fenster in Terax, im Browser, nichts) und ob dabei die Adresse der Vorschau sichtbar wird.
- [ ] Download-Link und Zwischenablage (`navigator.clipboard.writeText`) in der Vorschau: Verhalten notieren (N-14).
- [ ] WSL entfällt am Mac.

## 4. Kopfzeile

- [ ] HTML, Markdown, Raw (Markdown- oder HTML-Datei in der Raw-Ansicht): Kopfzeile mit Dateiname, Neu laden, Rendered/Raw, Zen; „Open in Browser" bei HTML, nicht bei Markdown (kommt in Welle 2).
- [ ] Die Kopfzeile liegt über dem Inhalt und verdeckt nichts; beim Scrollen in Markdown bleibt sie stehen.
- [ ] Raw mit ungespeicherten Änderungen: „Neu laden" und „Rendered" sind gesperrt, bis gespeichert ist.
- [ ] Normale Code-Datei (z. B. `main.rs`), Video, Audio: keine Kopfzeile, Editor sieht aus wie vorher (Höhe, ein Scrollbalken).
- [ ] Raw-, Bild- und PDF-Tab: Inhalt füllt die Fläche unter der Kopfzeile, kein doppelter Scrollbalken, PDF-Fläche in voller Höhe.
- [ ] Markdown „Neu laden": Inhalt bleibt stehen und springt nicht an den Anfang; nach einer Änderung der Datei erscheint der neue Stand.
- [ ] Langer Dateiname: wird abgeschnitten, Tasten bleiben sichtbar.

## 5. Zen-Modus und Esc

- [ ] Zen-Taste in der Kopfzeile bzw. Kürzel: Seitenleiste, Ränder, Rahmen, Kopf und Statusleiste weg; die Vorschau füllt das Fenster. Tooltip zeigt „Toggle zen mode · {Kürzel}".
- [ ] Ampelknöpfe (N-11): über Vorschau-Tabs rückt die Kopfzeile nach rechts (kein Überlappen mit dem Dateinamen); über Terminal-, Diff- und Web-Vorschau-Tabs notieren, ob sie die erste Zeile verdecken.
- [ ] Eingabezeile: in Vorschau- und Code-Tabs verborgen, im Terminal-Tab da.
- [ ] Esc über einer HTML-Vorschau, nach einem Klick IN die Seite: Zen endet (N-10). Das ist der macOS-Tastenmonitor.
- [ ] Esc im Einstellungsfenster, während das Hauptfenster im Zen über einer Vorschau steht: Zen bleibt (OB-4).
- [ ] Esc im Zen in einem Terminal-Tab mit laufendem Claude Code: Claude Code bricht ab, Zen bleibt (N-21).
- [ ] Esc bei offenem Dialog oder Menü über der Vorschau: schließt nur den Dialog, Zen bleibt.
- [ ] Im Zen über einer HTML-Vorschau mit Eingabefeld eine halbe Minute lang schnell in die Seite tippen: nichts hakt, nichts stürzt ab (der Tastenmonitor läuft im Zen bei jedem Tastendruck mit). Die Seite selbst bekommt Esc weiterhin (z. B. schließt ein Dialog IN der Seite).
- [ ] Esc mit Feststelltaste an, Esc gehalten, Esc während einer Eingabe mit Akzent-Auswahl (langes Drücken auf `e`): Zen endet in den ersten beiden Fällen; im dritten notieren, was passiert.
- [ ] Seitenleiste auf rund 300 px ziehen, Zen an und aus: wieder 300 px; im Zen lässt sich die Kante nicht ziehen; App neu starten: Leiste offen (N-22).
- [ ] KI-Leiste umschalten (Kürzel und Befehlspalette) im Zen über einer Vorschau: nichts passiert; nach Zen ist der Zustand wie vorher.
- [ ] Tab-Wechsel im Zen zwischen Vorschau und Terminal: Eingabezeile erscheint und verschwindet passend; Esc wirkt nur im Vorschau-Tab.

## 6. Wischen

- [ ] Über einer HTML-Vorschau waagerecht wischen: der Tab wechselt NICHT; eine breite Tabelle in der Seite scrollt waagerecht (N-12). Auch über der Kopfzeile der HTML-Vorschau wechselt der Tab nicht.
- [ ] Über Terminal-, Editor- und Markdown-Tabs: Wischen wechselt den Tab wie bisher.
- [ ] Scroll-Hänger (N-13): Tab per Wischen wechseln, sodass die Geste auf einem HTML-Tab endet; danach in der Vorschau hoch und runter scrollen: geht es sofort? Falls der alte Hänger noch auftritt: Abfolge notieren (die Experimente E1–E8 stehen in `dossier-vorschau.md`, Abschnitt 7; E1 = Wisch-Einstellung einen Tag aus).

## 7. Grenzen messen

- [ ] Offene Dateien (OB-23): `launchctl limit maxfiles` notieren. In „Terax Dev" rund 20 verschiedene Dateien per „Open in Browser" öffnen, dann `lsof -p $(pgrep -f "Terax Dev" | head -1) | wc -l` notieren. Die Obergrenze sind 256 Links; reicht das Limit dafür erkennbar nicht, lege ich die Grenze neu vor.
- [ ] Nach vielen Links: Terminal, Explorer und Git in „Terax Dev" arbeiten weiter normal.

## Zurückmelden

Am hilfreichsten: je Abschnitt „alles ja" oder die Zeilen mit „nein"; dazu die notierten Werte (Safari-Version, MaxSessions, Ladezeit mit 30 Bildern, `maxfiles`, `lsof`-Zahl, App-Größe) und für Abschnitt 3 ein Screenshot der Messseite in der Vorschau.
