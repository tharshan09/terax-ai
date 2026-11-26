# Design Conformance Report

**Feature:** HTML-Vorschau im Browser (Welle 1), Feature-Ende, Teil 1: Mini-Server gegen die Architektur und gegen das echte SSH-Lesen
**Branch:** `html-preview-browser`
**Datum:** 2026-11-25
**Diff-Scope:** Prüfmenge: `src-tauri/src/modules/preview_server/{grant,request,policy,source,listener,mod}.rs`, `src-tauri/src/modules/fs/file.rs` (Änderung), `src-tauri/src/modules/ssh.rs` (typisierter Weg und Helfer `read_bytes`/`_open_exact`), dazu die Verdrahtung `src-tauri/src/lib.rs`, `src-tauri/src/modules/mod.rs`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/*.json`, `src-tauri/build.rs`
**Modus:** full
**Architecture:** `specs/2026-11-25-html-preview-browser/architecture.md` (Maßstab dazu: `build-plan.md` „Wie gebaut“ slice-00/01, „Entscheidungen ohne Vorgabe“, `gates/obligations.md`; „Wie gebaut“ von slice-02 ist auf `f180fa8` noch leer, die slice-02-Grenzen stammen aus dem Kontext und `progress.md:328-346`)
**Bindings:** —
**Code-Stand:** `f180fa8`, nur gelesen

---

## Verdict

PASSED

Kein `decision`- und kein `refuted`-Befund. 8 nicht blockierende Befunde: 2 `obligation`, 6 `note`.

| Kategorie | Anzahl |
|---|---|
| Design Violations | 0 blockierend (8 nicht blockierend: F1-01 bis F1-08) |
| Bindings Net Hits | 0 (keine `bindings.md`) |
| Exceptions Applied | 0 |

---

## Design Violations

Keine blockierenden. Nicht blockierende Befunde:

| ID | Klasse | Kurz |
|---|---|---|
| F1-01 | obligation | IPC aus dem In-App-Rahmen (`http://127.0.0.1`) ist nicht gemessen; mit Baustein E laufen erstmals Skripte von SSH-Hosts in der App, App-Commands haben keine ACL |
| F1-02 | note | Die Wiederholung nach `Unreachable` hilft im echten Weg nur bei der abgelehnten Sitzung; sonst nutzlos oder doppelte Wartezeit, je Datei bis t₁ + 0,25 s + 60 s |
| F1-03 | note | Die 502-Seite sagt „the host could not be reached“ auch, wenn der Host erreicht wurde (python3 fehlt, Helfer startet nicht); Texte bis 300 Zeichen werden auf 160 gekürzt |
| F1-04 | note | ENOTDIR, EACCES, ENAMETOOLONG, ELOOP über SSH: 502 und `warn`; lokal: 404 und `debug`. Eine fehlende Zwischenkomponente ist dagegen richtig 404 |
| F1-05 | obligation | Klick und Einhängen der Vorschau (realpath, stat, Home) laufen außerhalb der Lese-Plätze; N-25 deckt das nicht |
| F1-06 | note | Der Klick prüft über SSH schwächer als das Lesen; wo nur das Lesen scheitert, kommt `opened`/`ready`, danach 502/404, ohne Rückfall der In-App-Vorschau |
| F1-07 | note | 502 wird mit `warn` geloggt, die Architektur sagt `info` |
| F1-08 | note | Ersatz-Host meldet beim Klick `Missing`, das echte `realpath_typed` nie; der Betriebswortlaut des Toasts für eine fehlende SSH-Datei ist von keinem Test gesehen |

```json
[
  {
    "id": "F1-01",
    "class": "obligation",
    "claim": "Ob eine Seite in der In-App-HTML-Vorschau (Baustein E, Rahmen mit Adresse http://127.0.0.1:{port}, Sandbox ohne allow-same-origin) Tauri-IPC erreicht, ist weder im Code entschieden noch gemessen. Neu mit Baustein E: Inline- und CDN-Skripte aus Dateien eines SSH-Hosts laufen jetzt in der App (vorher srcdoc unter der App-CSP `script-src 'self'`). Registrierte App-Commands haben keine eigene ACL (kein App-Manifest), eine Prüfung nach Herkunft hängt also allein an Tauri/wry.",
    "evidence": "Server-Seite: src-tauri/src/modules/preview_server/mod.rs:472-481 (frame_source gibt die Adresse an die Webview), policy.rs:173-179 und :201 (Rahmen-HTML trägt nur frame-ancestors, keine weitere CSP); Tauri-Seite: src-tauri/build.rs:5 (`tauri_build::build()` ohne App-Manifest; architecture.md:844 „App-Commands brauchen keine Capability“), src-tauri/capabilities/default.json und desktop.json unverändert ohne `remote`; Frontend: src/modules/html/HtmlPreviewPane.tsx:42 (REMOTE_SANDBOX mit allow-scripts); Spezifikation: architecture.md:690 (neu laufen in Remote-Vorschauen Inline- und CDN-Skripte), gates/obligations.md:51 („Wie Tauri IPC-Aufrufe aus Unterrahmen prüft, ist nicht gemessen“), mac-checkliste.md:41-50 (Abschnitt 3 ohne IPC-Probe)",
    "evidence_source": "code",
    "expected_observation": "Am Mac (Release-Build mit Baustein E): Eine HTML-Datei auf dem SSH-Host versucht per Skript `window.__TAURI_INTERNALS__`, `window.webkit.messageHandlers.ipc.postMessage(…)` und `fetch('ipc://localhost/preview_open_in_browser', {method: 'POST'})`. Das löst keinen Command aus: kein Browser öffnet sich, im Log steht nichts von `preview server`. Dieselbe Probe mit einer lokalen Datei (Asset-Weg und Server-Weg).",
    "scenario": "Jemand mit Schreibrecht auf einen Ordner des SSH-Hosts legt `bericht.html` mit Skript ab → der User öffnet sie in Terax als Vorschau → das Skript läuft im Rahmen der WKWebView → erreicht es IPC, ruft es App-Commands ohne ACL (Dateien, Terminal, Opener)."
  },
  {
    "id": "F1-02",
    "class": "note",
    "claim": "Die eine Wiederholung nach `Unreachable` (250 ms, Platz bleibt belegt, voller 60-s-Budget) hilft im echten Weg nur bei der abgelehnten Sitzung. Bei den übrigen Unreachable-Lagen (Anmeldung ohne Master, Hostschlüssel, DNS, Verbindung verweigert, python3 fehlt, Exit 1–127, keine Antwort, Antwort über 16 MiB) wiederholt sie deterministisch dasselbe. Ohne Master und ohne Netz verdoppelt sie die Wartezeit (2 × ConnectTimeout 10 s). Je Datei gilt deshalb t₁ + 0,25 s + 60 s mit t₁ < 60 s, nicht 60 s. Die Entscheidung build-plan.md:202 („jeden SSH-Lesevorgang nach 60 Sekunden“, „ein Hänger hält den Platz höchstens 60 s“) ist je ssh-Aufruf erfüllt, ein Hänger allein endet nach 60 s ohne Wiederholung. Der Ersatz-Host lieferte `Unreachable` immer sofort; AC 16 sah deshalb nur die Zahl der Aufrufe, nie die Zeit.",
    "evidence": "Server: src-tauri/src/modules/preview_server/source.rs:428-437 (Wiederholung bei jedem Unreachable, beide Plätze im Abschluss gehalten), mod.rs:78 und :82 (250 ms, 60 s); echter Weg: src-tauri/src/modules/ssh.rs:1161-1170 (Exit 127 mit python3 und Exit 1–127 → Transport), :1175-1181 (Exit 255 → Transport), :1272-1273 (ConnectTimeout=10), :1354-1366 (Antwort zu groß oder keine Antwort → Transport), :1733 (Transport → Unreachable), :1756-1758 (abgelehnte Sitzung → Unreachable); Ersatz: mod.rs:991-993 (Fehler aus dem Skript sofort); Spezifikation: architecture.md:259 (SEC-14), build-plan.md:202",
    "evidence_source": "code",
    "expected_observation": "Host ohne Master und ohne Route: jede angefragte Datei hält den Platz des Hosts rund 20 s und endet mit 502. Bricht die Verbindung mitten in einer langen Übertragung ab (Exit 255 nach z. B. 50 s) und hängt der zweite Versuch, endet die Datei erst nach rund 110 s mit 504.",
    "scenario": "Große Bilddatei über eine langsame Leitung, nach 50 s wird die Verbindung getrennt (Exit 255) → 250 ms Pause → zweiter Versuch baut eine Verbindung auf und hängt → 504 nach etwa 110 s; die übrigen Dateien desselben Hosts bekommen nach 30 s ohne Fortschritt 504. Vorschlag an die Steuereinheit: nur nach `SESSION_REFUSED` wiederholen oder dem zweiten Versuch nur das Restbudget geben (beides weicht von SVC-8 „Unreachable nach einer Wiederholung“ ab und braucht eine Entscheidung)."
  },
  {
    "id": "F1-03",
    "class": "note",
    "claim": "Die 502-Seite nennt für jedes `Unreachable` „the host could not be reached“, auch wenn der Host erreicht wurde und nur der Helfer nicht lief (python3 fehlt, Exit 1–126, keine Antwort). Klick-Grund und Log kürzen die typisierten Texte (bis 300 Zeichen) auf 160 Zeichen; beim Text „the remote helper could not start: {Auszug bis 200 Zeichen}“ fällt das Ende der Python-Meldung weg. Der Grund für die abgelehnte Sitzung (61 Zeichen) und die Anmelde- und Hostschlüssel-Hinweise (unter 160) kommen vollständig an.",
    "evidence": "Server: src-tauri/src/modules/preview_server/source.rs:100-106 (fester Satz je Gateway-Art), :32 und :117-127 (DETAIL_CHARS = 160), mod.rs:258-267 (Klick-Grund über clean_detail); echter Weg: src-tauri/src/modules/ssh.rs:1146 (stderr-Auszug bis 200 Zeichen), :1161-1170, :1697 (MAX_REASON_CHARS = 300)",
    "evidence_source": "code",
    "expected_observation": "Host ohne python3: der Browser zeigt „Terax could not read a.html from devbox: the host could not be reached“; der Toast beim Klick nennt richtig „python3 isn't installed on the host; …“.",
    "scenario": "Host mit kaputtem python3 (SyntaxError beim Start) → Klick: Toast „Could not read a.html from devbox: the remote helper could not start: …“ endet nach 160 Zeichen mit „…“, die Ursache steht im abgeschnittenen Teil; ist der Link schon offen, sagt die Seite, der Host sei nicht erreichbar."
  },
  {
    "id": "F1-04",
    "class": "note",
    "claim": "Eine fehlende Datei oder fehlende Zwischenkomponente wird über SSH richtig 404: realpath ist nicht strikt, os.stat wirft ENOENT, das wird `missing`. Das Beispiel „fehlende Zwischenkomponente → 502“ trifft nicht zu. Andere Lagen, die lokal 404 mit `debug` ergeben, werden über SSH `Failed` ohne Wiederholung und damit 502 „the read failed“ mit `warn`: eine Zwischenkomponente ist eine Datei (ENOTDIR), ein Ordner ohne Zugriff (EACCES), ein zu langer Name (ENAMETOOLONG), eine Link-Schleife (ELOOP). Für Skripte der Seite unterscheidet das über einen Symlink nach außen auch „vorhanden, aber kein Zugriff“ von „fehlt“. Das ist eine Stufe feiner als die bekannte Grenze „Fehlerart vor der Bereichsprüfung“, verrät aber keinen Inhalt.",
    "evidence": "Echter Weg: src-tauri/src/modules/ssh.rs:451-457 (realpath nicht strikt; os.stat: nur FileNotFoundError → missing), :432-438 (strenges Öffnen: ENOENT → missing, ELOOP/ENOTDIR → PATH_CHANGED, alles andere weiter), :858-862 (Fehler ohne Art → ok:false ohne kind), :1763-1764 (→ Failed); Server: src-tauri/src/modules/preview_server/source.rs:458-476 (Missing/NotRegularFile → 404, Failed → 502), listener.rs:249-250 (warn); lokal: source.rs:241-244 (jeder Auflösefehler → 404, debug); Spezifikation: architecture.md:330-333 (SSH-404 nur für `Missing`/`NotRegularFile`, also architekturgetreu)",
    "evidence_source": "code",
    "expected_observation": "`GET /T/a.html/x.png` (a.html ist eine Datei): lokal 404 „Not found“, über SSH 502 „Terax could not read x.png from devbox: the read failed“ und eine warn-Zeile; ebenso ein Bild in einem Unterordner, der auf dem Host einem anderen Konto gehört (0700).",
    "scenario": "HTML-Seite bindet 20 Bilder aus `data/` ein, das auf dem Host root gehört (0700) → 20-mal 502 und 20 warn-Zeilen; dieselbe Seite lokal: 20 stille 404."
  },
  {
    "id": "F1-05",
    "class": "obligation",
    "claim": "Die Platz-Regeln (1 Lesevorgang je Host, 8 gesamt) gelten nur für das Lesen (`ReadGate` in read_remote). Der Klick und das Einhängen einer SSH-HTML-Vorschau (preview_frame_source, Baustein E) rufen realpath_typed, stat_typed und einmal je Host das Home außerhalb der Plätze auf. Jeder Aufruf ist eine eigene ssh-Sitzung mit bis zu 30 s, auch während ein Lesevorgang desselben Hosts läuft. SEC-14 nennt nur Lesevorgänge, der Code verletzt also keinen Vertrag. Die Herleitung in SEC-14 (2 Plätze für Git, Explorer und Vorschau) und die Mac-Messung N-25 zählen diese Aufrufe aber nicht mit.",
    "evidence": "Server: src-tauri/src/modules/preview_server/mod.rs:521-542 (realpath, stat über `blocking` ohne ReadGate), :565-570 (Home), source.rs:371-441 (ReadGate nur in read_remote, :489-492); echter Weg: src-tauri/src/modules/ssh.rs:959, :1828, :1851 (REMOTE_FS_TIMEOUT 30 s je Aufruf); Frontend: src/modules/html/HtmlPreviewPane.tsx:76-104 (preview_frame_source je Einhängen); Spezifikation: architecture.md:259 (SEC-14), :738 (N-25 nur mit „Open in Browser“, Terminal-Tab und Git)",
    "evidence_source": "code",
    "expected_observation": "Am Mac, N-25 erweitert: 7 SSH-Terminal-Tabs und eine Port-Freigabe offen; während eine Seite mit 30 Bildern im Browser lädt, in Terax eine zweite HTML-Datei desselben Hosts als Vorschau öffnen und „Open in Browser“ auf eine dritte klicken, dazu Git aktualisieren: alle Bilder da, kein Terminal-Tab und kein Git-Aufruf scheitert.",
    "scenario": "Plätze des ControlMasters fast voll → die Seite belegt 1 Platz → das Einhängen der Vorschau belegt mit realpath/stat einen zweiten → ein gleichzeitiger Git- oder Explorer-Aufruf bekommt „Session open refused by peer“ und scheitert bei Passphrase-Schlüssel ohne Agent. Bei hängendem Host wartet der Klick bis 3 × 30 s auf seinen Toast."
  },
  {
    "id": "F1-06",
    "class": "note",
    "claim": "Der Klick prüft über SSH schwächer als das Lesen: realpath und stat statt strengem Öffnen, und stat meldet alles außer einem Ordner als `file` (auch FIFO, Socket, Gerät). Scheitert nur das Lesen, antwortet der Klick `opened` bzw. `ready`, und der Server liefert danach 502 oder 404. Die In-App-Vorschau fällt nur bei einer Antwort ungleich `ready` auf den heutigen Weg zurück, nicht nach einer gescheiterten Anfrage. Wo heute fs_read_file die Datei zeigt, zeigt sie dann eine Textseite. Fälle: macOS-Host ohne O_PATH und ein Zwischenordner ohne Leserecht (R-08 aus dem slice-02-Review), Host ohne dir_fd (POSIX-Hosts haben es), FIFO mit HTML-Namen. Sicherheitlich ohne Folge, weil das Lesen alles erneut prüft.",
    "evidence": "Klick: src-tauri/src/modules/preview_server/mod.rs:524 (realpath_typed), :538-545 (stat_typed, Art aus dem Helfer); echter Weg: src-tauri/src/modules/ssh.rs:360-364 (stat: isdir → dir, sonst file), :371-374 (realpath), :417-419 (EXACT_UNSUPPORTED), :423 (ohne O_PATH werden Ordner mit O_RDONLY geöffnet und brauchen Leserecht), :1803-1804 (Lesen mit exact); Lesen: source.rs:489-492; Rückfall: build-plan.md:201 (nur bei refused/too_large/unreachable/limit_reached), architecture.md:664 (kein Rückfall zur Laufzeit)",
    "evidence_source": "code",
    "expected_observation": "SSH-Host macOS, `p/a.html` unter einem Ordner mit Rechten `--x` für den SSH-User: preview_frame_source → `ready`, der Rahmen zeigt „Terax could not read a.html from devbox: the read failed“; vor Baustein E zeigte die Vorschau die Datei. Einzulösen mit OB-24 (SSH zu einem Mac-Host), wenn der User einen hat.",
    "scenario": "User öffnet eine HTML-Datei vom Mac-Host als Vorschau → Klickprüfung besteht → das strenge Öffnen scheitert an EACCES → Rahmen zeigt die 502-Textseite statt der Datei."
  },
  {
    "id": "F1-07",
    "class": "note",
    "claim": "Eine 502-Antwort (SSH nicht lesbar) wird mit `warn` geloggt; die Fehlertabelle der Architektur sagt `info`. „Wie gebaut“ nennt die Abweichung nicht. 504 ist richtig `warn`.",
    "evidence": "src-tauri/src/modules/preview_server/listener.rs:249-250 (BadGateway → log::warn!); architecture.md:333 (Logging `info` ohne Geheimnis), :334 (504 `warn`)",
    "evidence_source": "code",
    "expected_observation": "Bei getrennter SSH-Verbindung erscheint je Datei eine `WARN`-Zeile „preview server: could not read … from devbox (Unreachable): …“.",
    "scenario": "SSH-Verbindung weg, Seite mit 30 Bildern neu laden → 30 warn-Zeilen statt info."
  },
  {
    "id": "F1-08",
    "class": "note",
    "claim": "Der Ersatz-Host der Klick-Tests meldet für einen fehlenden Pfad bei realpath `Missing`. Das echte realpath_typed tut das nie (realpath ist nicht strikt). Im Betrieb fällt eine fehlende SSH-Bezugsdatei erst bei stat_typed als `Failed(\"[Errno 2] No such file or directory: '…'\")` auf, Status `unreachable` mit diesem Text und dem Pfad auf dem Host. Lokal ist es `refused` „the file cannot be found“. Die Entscheidung build-plan.md:206 deckt den Toast „Could not read …“. Den Betriebswortlaut sieht kein Test, und der Zweig `Missing → \"no such file\"` in remote_reason ist im Betrieb toter Code.",
    "evidence": "Ersatz: src-tauri/src/modules/preview_server/mod.rs:1020-1022 (realpath → Missing); echter Weg: src-tauri/src/modules/ssh.rs:371-374 (os.path.realpath ohne strict), :360-364 (stat wirft FileNotFoundError ohne Art), :1763-1764 (→ Failed); Server: mod.rs:538-541 (→ Denial::Unreachable), :263 (Missing-Zweig); lokal: mod.rs:314-317",
    "evidence_source": "code",
    "expected_observation": "„Open in Browser“ auf eine inzwischen gelöschte SSH-Datei: Toast „Could not read a.html from devbox: [Errno 2] No such file or directory: '/srv/p/a.html'“.",
    "scenario": "Datei im Explorer noch sichtbar, auf dem Host schon gelöscht → Klick → Toast meldet einen Lesefehler mit Python-Wortlaut statt „nicht gefunden“."
  }
]
```

---

## Bindings Net Hits

Keine.

---

## Exceptions Applied (Audit)

Keine.

---

## Sicherheitsmodell: Bedrohung für Bedrohung

Spalten „L/S/B/F“ = gilt lokal / SSH / Klasse Browser / Klasse Frame (✓ ja, – nicht zutreffend).

| # | Bedrohung | Gegenmaßnahme im Code (pfad:zeile) | L | S | B | F | Urteil |
|---|---|---|---|---|---|---|---|
| 1 | Lokale Prozesse fragen Ports ab | 256 Bit `grant.rs:72-76`; Vergleich ohne frühen Abbruch `grant.rs:80-89`; Geheimnis vor jedem Pfadschritt `request.rs:111-117`; leere `404` `listener.rs:217`; keine Listen, ein Ordner liefert nur `index.html` `source.rs:202-204` | ✓ | ✓ | ✓ | ✓ | erfüllt (Plätze vor dem Geheimnis: bekannte Grenze) |
| 2 | Anderes Konto auf dem Mac | wie 1, Bindung `127.0.0.1` `mod.rs:416` | ✓ | ✓ | ✓ | ✓ | erfüllt |
| 3 | Zugriff aus dem Netz | nur Loopback `mod.rs:413-447` (`127.0.0.1`, mit Fallback zusätzlich `[::1]`) | ✓ | ✓ | ✓ | ✓ | erfüllt; N-16 am Mac |
| 4 | CSRF, Port-Scan | nur `GET`/`HEAD` `request.rs:65-69`, `405` mit `Allow` `listener.rs:68-74`; keine CORS-Kopfzeilen `policy.rs:182-213`; der Server liest nur | ✓ | ✓ | ✓ | ✓ | erfüllt |
| 5 | DNS-Rebinding, falscher Host | genau ein `Host`, Bytevergleich `request.rs:57-64` gegen `grant.host_name.authority` `listener.rs:208`; fehlend oder doppelt `400` (Entscheidung `build-plan.md:208`) | ✓ | ✓ | ✓ | ✓ | erfüllt |
| 6 | Pfad-Ausbruch | Query vor dem Dekodieren, genau einmal dekodiert, Segmentregeln `request.rs:111-150`; Bereich nach dem Auflösen je Segment `source.rs:149-155`, `:213-223`; lokal `:241-247`; SSH auf dem gemeldeten Ziel `:493`, zusätzlich `exact_target` `ssh.rs:1771-1782` | ✓ | ✓ | ✓ | ✓ | erfüllt |
| 7 | Symlink lokal | `canonicalize` + `check_target` `source.rs:241-247`; nach dem Öffnen über den geöffneten Deskriptor `:267-287`, `opened_path` `:306-333` | ✓ | – | ✓ | ✓ | erfüllt (macOS-Zweig nur typgeprüft; Windows: bekannte Grenze) |
| 8 | Symlink über SSH | Prüfung auf dem gemeldeten Ziel `source.rs:493`; strenges Öffnen `ssh.rs:409-440`, `:459`, Anfrage mit `"exact": true` `ssh.rs:1803-1804` | – | ✓ | ✓ | ✓ | erfüllt (Tausch gegen einen echten Ordner: bekannte Grenze) |
| 9 | Geheimnis-Dateien | `check_blocklist` auf Text und Ziel samt `.git` `source.rs:131-146`, `:222`, `:240`, `:488`; Klick `mod.rs:313`, `:319`, `:518`, `:529`; nirgends `trusted` | ✓ | ✓ | ✓ | ✓ | erfüllt |
| 10 | Home, Wurzel, darüber | `grant_scope` `grant.rs:97-111`; Home lokal auf demselben Weg aufgelöst `mod.rs:292-309`; SSH `realpath_typed(host, "~")`, je Host gemerkt `mod.rs:565-578`; ohne Home nur die Datei (lokal) bzw. `unreachable` (SSH) | ✓ | ✓ | ✓ | ✓ | erfüllt (Groß-/Kleinschreibung: OB-24) |
| 11 | Geheimnis in Verlauf, Referer | `no-referrer` auf jeder Antwort `policy.rs:182-189`, auch leer `listener.rs:60-66`; `BrowserOpen` ohne Adresse `mod.rs:146-153`; Opener-Fehler bereinigt `mod.rs:363-375`; Log-Zeilen ohne Geheimnis `mod.rs:509`, `:629`, `listener.rs:244-257` | ✓ | ✓ | ✓ | ✓ (Adresse geht absichtlich ans `iframe`, API-8) | erfüllt |
| 12 | Alter Link nach dem Beenden | Freigaben nur im Speicher `mod.rs:110`; Listener enden mit dem Prozess | ✓ | ✓ | ✓ | ✓ | Mac N-18 (bestehend) |
| 13 | Link A liest Link B | eigener Port `mod.rs:599`, eigenes Geheimnis `:613`; der Listener prüft nur sein Geheimnis `listener.rs:215` | ✓ | ✓ | ✓ | ✓ | erfüllt |
| 14 | Anderer SSH-Host | Host nur aus `grant.location` `source.rs:484`; Klick: Host aus dem Workspace in `Location::Ssh` `mod.rs:558` | – | ✓ | ✓ | ✓ | erfüllt |
| 15 | Nicht-HTML führt Skript aus | `INERT_CSP` `policy.rs:26-27`, `:203-205`; feste Liste `:125-165`; eine Bild-Bezugsdatei ist immer träge `:106-113`; `nosniff` `:184` | ✓ | ✓ | ✓ | ✓ | erfüllt (Nachbarn nach dem angefragten Namen typisiert: bekannte Grenze) |
| 16 | Getarnte PDF | `finish` auf den gelesenen Bytes `source.rs:227-234`, beide Orte; Klick lokal `mod.rs:328-330`; Klick über SSH ohne Prüfung (Entscheidung `build-plan.md:206`) | ✓ | ✓ | ✓ | ✓ | erfüllt |
| 17 | Fremde Seite bettet ein | `frame-ancestors 'self'` `policy.rs:31`, `:200`; Frame: App-Herkünfte `:173-179`, `:201` | ✓ | ✓ | ✓ | ✓ | erfüllt |
| 18 | Erschöpfung | SEC-12 `listener.rs:135-142`; SEC-13 `listener.rs:158-185`, `request.rs:48-53`; SEC-14 `source.rs:371-441`; SEC-15 `listener.rs:267`; SEC-16 `source.rs:249-259`, `:494-496`, 60 s `mod.rs:82` → `ssh.rs:1805` → `wait_child` | ✓ | ✓ | ✓ | ✓ | erfüllt; Hinweise F1-02, F1-05 |
| 19 | Port-Übernahme über `[::1]` | IP in der Adresse `grant.rs:34-39`, `mod.rs:349-356`; Fallback bindet beide Loopbacks am selben Port `mod.rs:429-447` | ✓ | ✓ | ✓ | ✓ | erfüllt |
| 20 | Agent löst aus | Frontend (`browserOpen.guard.test.ts` vorhanden) | – | – | ✓ | – | nicht Teil dieser Prüfung |
| 21 | Seite ruft Terax-Befehle | Capabilities unverändert, kein `remote` (Diff leer); `build.rs:5` ohne App-Manifest | ✓ | ✓ | ✓ | offen | Browser erfüllt; Frame: F1-01 (obligation) |
| 22 | In-App-Sandbox gelockert | Frontend (`HtmlPreviewPane.tsx:41-42`, `HtmlPreviewPane.sandbox.test.ts` vorhanden) | – | – | – | ✓ | nicht Teil dieser Prüfung |
| 23 | Request-Smuggling | `httparse`; `Transfer-Encoding` → `400`, `Content-Length` ≠ `0` → `400` `request.rs:70-75`; es wird kein Rumpf gelesen; `Connection: close` `policy.rs:187` | ✓ | ✓ | ✓ | ✓ | erfüllt |
| 24 | Cookies anderer Dienste | benanntes Restrisiko (Q&A 36); der Server setzt keine Cookies | ✓ | ✓ | ✓ | ✓ | kein Befund |

**Regeln SVC/VAL/SEC (Server):** SVC-1 (`mod.rs:582-631`, Schlüssel Ort + Bezugsdatei + Klasse, 256 über beide Klassen, kein Socket vor der ersten Freigabe `mod.rs:450-458`), SVC-2 bis SVC-11, SVC-21 und SVC-22 sind vorhanden. Die Reihenfolge der Prüfkette stimmt: VAL-4 vor dem Dekodieren (`request.rs:115` vor `:124-131`), VAL-7 auf dem Text vor dem Auflösen bzw. Senden (`source.rs:240`, `:488`), VAL-6 und VAL-7 auf dem Ziel (`:247`, `:285`, `:493`), VAL-8 vor und nach dem Lesen (`:249`, `:257`, `:494`), VAL-9 auf den Bytes (`:230`). Die Grenzen in `Limits::PRODUCTION` (`mod.rs:69-84`) entsprechen SEC-12 bis SEC-16 mit den Entscheidungen 30 s Wartegrenze, 60 s Budget, 64 Kopfzeilen und 250 ms Pause. Abweichungen, die „Wie gebaut“ deckt: `400` beim fehlenden Host, Texte auf 403/404, `preview_frame_source` nur für HTML, fehlende lokale Datei beim Klick `refused`. Nicht gedeckt und als Hinweis gemeldet: die Log-Stufe bei 502 (F1-07).

---

## Kopfzeilen-Tabelle („DTOs“) gegen `policy.rs`

| Art × Klasse | `Content-Type` | CSP | Weitere | Code | Urteil |
|---|---|---|---|---|---|
| HTML × browser | `text/html` | `frame-ancestors 'self'` | `nosniff`, `no-store`, `no-referrer`, `Content-Length`, `Connection: close` | `policy.rs:134-137`, `:200`, `:182-189`, `listener.rs:98` | ✓ |
| Skript (`js`, `mjs`) | `text/javascript` | keine | wie oben | `policy.rs:138-141`, `:202` | ✓ |
| Träge (`css` … `wasm`, `svg`, Rasterbilder, Schriften, `txt`, `csv`, `md` roh, `map`) | je Endung | `sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'` | wie oben | `policy.rs:146-162`, `:26-27`, `:203-205` | ✓ (`map` → `application/json`, `md` → `text/plain` wie Welle-2-Abschnitt) |
| Unbekannt, ohne Endung | `application/octet-stream` | wie träge | wie oben | `policy.rs:130-132`, `:163` | ✓ |
| PDF (nach VAL-9) | `application/pdf` | wie träge | wie oben | `policy.rs:142-145`, `:114-117`, `source.rs:230` | ✓ |
| Markdown gerendert (W2) | `text/html` | wie träge | wie oben | `policy.rs:118-121`, `:203` | ✓ (in W1 nicht erreichbar, `policy.rs:80-85`) |
| HTML × frame | `text/html` | `frame-ancestors tauri://localhost http://tauri.localhost https://tauri.localhost`, im Debug-Build zusätzlich `http://localhost:1420` | wie oben | `policy.rs:35-40`, `:173-179`, `:201` | ✓ |
| übrige Arten × frame | wie browser | wie browser | wie oben | `policy.rs:202-205` | ✓ |
| Textseite 403/404/502/504 (Entscheidung) | `text/plain; charset=utf-8` | wie träge | wie oben | `policy.rs:168-171`, `listener.rs:76-82` | ✓ |
| Leere Ablehnung (400/405/421/431, falsches Geheimnis) | – | – | nur die vier Schutz-Kopfzeilen, `Allow` bei 405 | `listener.rs:60-74` | ✓ |

Keine Antwort trägt `Access-Control-*` oder `Set-Cookie`.

---

## Naht Server ↔ echtes SSH-Lesen

**Aufrufstellen im Betrieb.** `lib.rs:396` `.manage(PreviewServer::default())` → `mod.rs:123-126` → `Core::default` `mod.rs:115-118` → `Remote::ssh()` `source.rs:349-355` (`ssh::read_bytes_typed`, `ssh::realpath_typed`, `ssh::stat_typed`).

| Aufruf | Stelle | Argumente | Blocking-Thread | Plätze |
|---|---|---|---|---|
| `read_bytes_typed` | `source.rs:430`, Wiederholung `:433` | Host aus `grant.location` (`:484`), Pfad = Bereich + Segmente bzw. Bezugsdatei (`:186-209`), `MAX_READ_BYTES` = 10 485 760, `ssh_read_budget` = 60 s (`mod.rs:82`) → `Some(budget)` an `wait_child` (`ssh.rs:1805`, `:1303`) | ja, `spawn_blocking` `source.rs:428` | ja: 1 je Host, dann 1 von 8 (`:419-425`), gehalten bis zur Rückkehr samt Wiederholung |
| `realpath_typed` (Bezugsdatei) | `mod.rs:524` | Host aus dem Workspace, geklickter Pfad (vorher Sperrliste `:518`) | ja, `blocking` `mod.rs:269-273` | nein (F1-05) |
| `stat_typed` | `mod.rs:538` | aufgelöster Pfad | ja | nein (F1-05) |
| `realpath_typed(host, "~")` | `mod.rs:570` | einmal je Host, gemerkt nur bei Erfolg | ja | nein (F1-05) |

**Was der echte Weg als Ziel meldet.** Der Helfer meldet `real = os.path.realpath(path)` (`ssh.rs:451`, `:475`), immer absolut und normalisiert, weil der Server nur absolute, normalisierte Pfade schickt. `exact_target` (`ssh.rs:1771-1782`) weist alles andere als `Failed` ab, auch beim Klick (`:1834`). `is_normalized` (`source.rs:159-170`) ist mit `exact_target` verträglich und etwas strenger (lehnt `/` ab, das nie eine reguläre Datei ist). Ein unnormalisiertes Ziel erreicht `check_target` damit nie. OB-21 hält auf beiden Seiten.

**Ersatz-Host gegen echten Weg.**

| Eigenschaft | Ersatz-Host (`mod.rs:839-1052`) | Echter Weg (`ssh.rs`) | Folge im Server |
|---|---|---|---|
| gemeldetes Ziel | eine Link-Stufe (`:939-941`), Text wie gegeben | `realpath` + `exact_target` | doppelt geprüft, verträglich |
| `Missing` | jeder unbekannte Pfad (`:998`) | nur ENOENT (`:454-455`, `:432-433`) | gleich: 404 |
| `NotRegularFile` | eingetragene Ordner (`:995-997`) | `S_ISREG` vor und nach dem Öffnen (`:456-457`, `:462-463`) | gleich: 404 |
| `TooLarge` | `bytes.len() > limit` | `fstat` > Grenze und Lesen bis Grenze + 1 (`:464-466`, `:472-474`) | 403; der Server prüft die Länge selbst (`source.rs:494-496`) |
| `Failed` | nur per Skript | ENOTDIR, EACCES, ENAMETOOLONG, ELOOP, `PATH_CHANGED`, `EXACT_UNSUPPORTED`, Ziel nicht normalisiert, Exit 128–254, kaputte Antwort | 502 ohne Wiederholung, `warn` (F1-04, F1-07) |
| `Unreachable` | sofort per Skript | Exit 255 oder ohne Code, nach bis zu ConnectTimeout 10 s je Versuch; auch Exit 1–127, python3 fehlt, keine Antwort, über 16 MiB, abgelehnte Sitzung | Wiederholung bei jedem, Seitentext „could not be reached“ (F1-02, F1-03) |
| `TimedOut` | schläft genau das Budget (`:985-988`) | `wait_child` beendet nach dem Budget (`:1075-1084`), dazu eine warn-Zeile in `ssh.rs:1313` | 504 nach 60 s, ohne Wiederholung |
| realpath beim Klick | `Missing` für Unbekanntes (`:1020-1022`) | nicht strikt, nie `Missing` | F1-08 |
| stat beim Klick | Ordner oder Datei | alles außer Ordner ist `file` (`:360-364`) | F1-06 |
| Laufzeit | sofort | eigener `ssh`-Prozess samt Python-Start; realpath/stat bis 30 s | Klick wartet bis 3 × 30 s |

**Fehlerarten zu Antworten** (`source.rs:445-478`, `listener.rs:232-257`): `Missing`/`NotRegularFile` → 404 „Not found“, `debug`. `TooLarge` → 403 „Larger than 10 MB“, `debug`. `TimedOut` → 504 „… timed out“, `warn`. `Unreachable` nach einer Wiederholung → 502 „… the host could not be reached“, `warn`. `Failed` → 502 „… the read failed“, `warn`, ohne Wiederholung. Wartegrenze → 504, `warn`. Der Text des Hosts geht nur ins Log und in den Klick-Grund, gekürzt auf 160 Zeichen. Beim Klick wird jede typisierte Fehlerart `unreachable` mit dem Text der Variante. Der MaxSessions-Grund kommt vollständig an.

**60 s gegen die Wartegrenze 30 s.** Ein hängender Lesevorgang hält den Platz bis zum Budget. Wartende Dateien desselben Hosts bekommen nach 30 s ohne Fortschritt 504 (`source.rs:399-413`). Jeder fertige Lesevorgang, auch ein gescheiterter, startet die Frist neu (`:435`). Das entspricht der Entscheidung `build-plan.md:202`. Die Wiederholung kann einen Platz länger als 60 s halten (F1-02).

**PDF und Größe über SSH.** Die Echtheit wird auf den gelesenen Bytes geprüft (`source.rs:227-234`), für Bezugsdatei und Nachbarn. Die Länge prüft der Server selbst (`source.rs:494-496`), zusätzlich zur Grenze im Helfer.

**Klick gegen erstes Lesen.** Beim Klick fallen Ort, Bezugsdatei (aufgelöst), Bereich, Art und Klasse fest. Beim Lesen laufen erneut: Sperrliste auf dem Text, Auflösen und strenges Öffnen auf dem Host, Bereich und Sperrliste auf dem gemeldeten Ziel, reguläre Datei, Größe und PDF-Echtheit. Eine Nur-Datei-Freigabe nimmt nur genau die Bezugsdatei an (`source.rs:187-195`, `:216-217`); ein Tausch gegen einen Link wird dort abgewiesen. In einer HTML-Freigabe wird ein getauschter Eintrag nach dem angefragten Namen typisiert. Das ist dieselbe bekannte Grenze wie bei den Nachbarn, und sie gibt nichts frei, was im Bereich nicht ohnehin als `.html` liegen dürfte. Der Klick braucht das strenge Öffnen nicht, weil er keine Bytes ausliefert. Ohne es kann er aber `opened`/`ready` sagen, wo das Lesen danach scheitert (F1-06).

---

## Verdrahtung (`lib.rs`, `mod.rs`)

- `modules/mod.rs:10` und `:20`: `pub mod preview_server;` und `pub mod zen_escape;` ohne `cfg`. ✓
- `lib.rs:396`: `.manage(preview_server::PreviewServer::default())`; `lib.rs:503-505`: `preview_open_in_browser`, `preview_frame_source`, `zen_escape_arm` in `generate_handler!`. Die Commands holen den Zustand über `app.state::<PreviewServer>()` (`mod.rs:189`, `:200`). ✓
- Capabilities: `src-tauri/capabilities/*.json` und `tauri.conf.json` sind im Feature-Diff unverändert. Ohne App-Manifest (`build.rs:5`) darf die Webview beide Commands ohne Eintrag rufen. Der Opener läuft auf der Rust-Seite (`mod.rs:177-179`). ✓ Ob ein Rahmen von `http://127.0.0.1` Tauri-IPC erreicht, entscheidet Tauri zur Laufzeit: F1-01.
- Start: `Core::new` legt nur Semaphoren und die leere Freigabe-Liste an (`mod.rs:450-458`). Sockets entstehen nur in `grant()` (`mod.rs:599-627`), also beim ersten Klick oder beim ersten Einhängen einer HTML-Vorschau (API-8). Der Listener startet per `tokio::spawn` auf der Laufzeit des Commands (Tauri-Laufzeit). Alle Sockets werden umgewandelt, bevor ein Listener startet (`:602-611`). ✓
- Ende: Die Annahme-Schleifen laufen bis zum Prozessende (`listener.rs:124-149`). Der Exit-Pfad `lib.rs:512` ist unverändert. ✓
- `Cargo.toml`: tokio mit `net`, `io-util`, `sync`; `httparse`, `getrandom`, `percent-encoding` direkt. ✓ `fs/file.rs`: `is_pdf_magic` (`:198-200`) ist der einzige `%PDF-`-Vergleich außerhalb der Tests; `fs_is_pdf` verhält sich gleich (`:252`, `:265`). ✓

---

## Mess-Schalter

| Schalter | Stelle | Stellung im Betrieb | `UNTIL:` | Wirkung beim Umstellen |
|---|---|---|---|---|
| `FRAME_LOCALHOST_FALLBACK` | `mod.rs:37-40`, über `Config::default` `:93-101` | `false` (wie `build-plan.md:217`) | ja | Nur die Klasse `frame`: `HostName::Localhost` (`mod.rs:593-597`), Bindung an beide Loopbacks am selben Port (`:413-447`), Adresse `http://localhost:{port}/…` (`:349-356`), Host-Prüfung genau `localhost:{port}` (`listener.rs:208` → `request.rs:62`). Die Klasse `browser` bleibt bei `127.0.0.1`. ✓ |
| `FRAME_ANCESTORS` | `policy.rs:20-22`, über `Shared.frame_ancestors` | `true` | ja | Nur HTML der Klasse `frame` verliert die CSP (`policy.rs:201`). Textseiten und andere Arten bleiben unverändert. ✓ |
| `BIND_ATTEMPTS`, `HostName::Localhost`, `bind_both_loopbacks` | `mod.rs:42-44`, `grant.rs:29-30`, `mod.rs:428` | nur mit Fallback wirksam | ja | – |

---

## Prüfmenge

**Geprüft:** `src-tauri/src/modules/preview_server/mod.rs` (Produktion `:1-647`, Ersatz-Host und Testhilfen `:650-1060`), `grant.rs` (`:1-117`), `request.rs` (`:1-151`), `policy.rs` (`:1-214`), `source.rs` (`:1-499`), `listener.rs` (`:1-305`); `src-tauri/src/modules/fs/file.rs` (Änderung `:193-266`); `src-tauri/src/modules/ssh.rs`: Helfer `stat`/`realpath`/`read_bytes`/`_open_exact`/`main` (`:355-475`, `:853-865`), `control_args` (`:89-147`), `classify_ssh_error`, `wait_child`, `RemoteError`, `exit_error`, `run_remote_json`, `run_remote_helper`, `read_envelope`, Anfang `helper_answer` (`:1010-1368`), `read_bytes`/`RemoteFileBytes`/`parse_read_bytes` (`:1602-1643`), typisierter Weg (`:1667-1857`); `src-tauri/src/lib.rs` (Verdrahtung), `src-tauri/src/modules/mod.rs`, `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/capabilities/*.json` (Diff), `src-tauri/tauri.conf.json` (CSP, macOS-Bundle), `src-tauri/entitlements.plist`; `TERAX.md:46`; zur Einordnung `src/modules/html/HtmlPreviewPane.tsx:41-104`.

**Nicht geprüft:** Testfälle von `preview_server/*` und `ssh.rs` im Einzelnen (Grund: in den Slice-Gates geprüft; gelesen wurde nur der Ersatz-Host, um ihn mit dem echten Weg zu vergleichen). `src-tauri/src/modules/zen_escape.rs` (nicht in der Prüfmenge dieses Teils). Frontend außer den genannten Zeilen (anderer Teil des Fan-outs). Übriger Bestand von `ssh.rs` (unverändert). `src-tauri/tests/preview_contracts.rs` (Vertragstests aus slice-00). Laufzeitverhalten unter macOS, Tauri-IPC aus Unterrahmen und `F_GETPATH` (auf der Werkbank nicht ausführbar: F1-01, bestehende Auflagen OB-23, OB-24, N-18).

---

## Notes

- Grundlage für slice-02 sind die bekannten Grenzen aus dem Kontext und `progress.md:328-346`, weil der Abschnitt „Wie gebaut“ von slice-02 auf `f180fa8` noch leer ist (`build-plan.md:725-727`). Die Abweichung „`missing` nur bei ENOENT“ steht dort, ihre Folge an der Naht beschreibt F1-04.
- Alle Aufrufe des echten Wegs laufen auf Blocking-Threads (OB-1). Der Leser bekommt Host, Grenze und Budget genau wie vereinbart. Die Fehlerart entscheidet über die Antwort, der Text spielt dabei keine Rolle (OB-13). Das gemeldete Ziel ist auf beiden Seiten normalisiert (OB-21). Der Abbruch nach 60 s hängt am übergebenen Budget (OB-22).
- Am meisten Gewicht hat F1-01. Mit Baustein E laufen Skripte von Dateien eines SSH-Hosts erstmals in der App, und App-Commands haben keine ACL. Die Mac-Checkliste sollte eine IPC-Probe aus dem Rahmen bekommen, bevor Baustein E an bleibt.
