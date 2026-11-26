# Claim-Verifikation `slice-02-ssh-read-esc-monitor`

Stand: `b1b90f94ea4228a8a956410226c358bc8ec90644` über `712f137`. Prüfer-Worktree `…/html-preview-browser--s02-claim`.
Belege liegen im Ordner `<scratchpad>/claim-s02/` (Präfix `s02-claim-`).
Lokales `python3` 3.13.5; `os.open in os.supports_dir_fd` = True, `O_PATH` vorhanden; Dateisystem des Wegwerf-Ordners: tmpfs.

## Verdikte je Behauptung

| # | Behauptung | Verdikt | Beleg |
|---|---|---|---|
| 1 | OB-20: Komponente für Komponente mit `dir_fd`/`O_NOFOLLOW`, nie Bytes von außen, Tausch → `the path changed while it was read` | **bestätigt** | Wettlauf (Symlink-Tausch, `renameat2 RENAME_EXCHANGE`, ~390 000 Tausche/s): mit `exact` **0 Lecks in 561 551 Lesungen** im Prozess und **0 in 463** als eigener Prozess je Lesung (wie `run_helper`); Kontrolle ohne `exact`: **91 094 Lecks in 709 763** bzw. **172 in 463**. Lauf trifft Symlink als erste (`/lib`), mittlere und letzte Komponente → jedes Mal `the path changed while it was read` (`s02-claim-cases.json`). Code `ssh.rs:409-436`, `:453`. Restgrenze wie gemeldet, dazu S02-C4. |
| 2 | Host ohne `dir_fd`/`O_NOFOLLOW`/`O_DIRECTORY` → fester Grund; Bestand liest | **bestätigt** | Drei Stubs (`os.supports_dir_fd = set()`, `del os.O_NOFOLLOW`, `del os.O_DIRECTORY`): typisiert jeweils `{"ok": false, "error": "this host cannot open a file without following symlinks"}`, Bestand jeweils `ok: true` mit Inhalt (`s02-claim-cases.json`). Code `ssh.rs:413-415`. |
| 3 | Bestand Byte für Byte gleich, kein Test geändert, `run_remote_helper` = alter Rumpf | **bestätigt** | Alter und neuer Helfer, gleiche Anfragen, 81 Fälle (31 Bestand-`read_bytes`, 31 mit `exact`, 19 übrige Operationen): einzige Abweichung im Bestand (6 von 31) ist das angehängte `, "kind": "…"` in den `read_bytes`-Fehlern (fehlt, Zwischenordner fehlt, Ordner, FIFO, zu groß, `/`); `stat`, `realpath`, `exists`, `read_file` (4 Fälle), `read_dir`, `list_subdirs`, `search`, unbekannte Op, kaputtes JSON und `read_bytes` bei ENOTDIR/EACCES/Erfolg identisch. `kind` stört keinen Rust-Leser: `helper_answer` liest nur `ok`/`data`/`error` (`ssh.rs:1342-1352`), sonst liest nur `refusal_kind` (`ssh.rs:1687-1696`). Rumpf-Diff (`s02-claim-rumpf-diff.txt`): identisch bis auf das Ende (`read_envelope(…)` → `Ok(HelperExit {…, stderr: stderr.trim().to_string()})`); `run_remote_json` ruft `read_envelope` mit genau diesen Werten (`ssh.rs:1197-1204`). Test-Bereich: einziger Hunk `@@ -4651,0 +4871,443` (nur angehängt). |
| 4 | Drei Arten einmal als Konstanten und wörtlich im Helfer; Helfer-Test dekodiert über dieselbe Funktion; `missing` nur bei ENOENT | **bestätigt** | `ssh.rs:394-396` und `:1648-1650`; `typed_read_here` ruft `read_bytes_typed_with` (`ssh.rs:4908-4929`). Nur `FileNotFoundError` wird `missing` (`ssh.rs:428`, `:448`); gemessen: ENOTDIR → `[Errno 20] Not a directory…` ohne Art, EACCES → `[Errno 13]…` ohne Art. |
| 5 | Einordnung 255 → Unreachable, Budget → TimedOut, Signal/anderer Exit → Failed, ohne Art → Failed(text); MaxSessions in allen drei; `classify_ssh_error` unverändert | **bestätigt** (für alle AC-Fälle; Wortlaut „anderer Exit“ zu weit, S02-C2) | Lauf 1, 22 Umschläge × 3 Funktionen, keine Panik. Exit 137/143 → `Failed`, Exit 1/127/ohne Code → `Unreachable` (geerbt aus `exit_error`, `ssh.rs:1147-1172`). Abgelehnte Sitzung mit Exit 255 und ohne Code → MaxSessions-Text in allen drei; `classify_ssh_error` ohne Hunk. |
| 6 | PD-01/OB-22: Budget = Parameter, `realpath`/`stat` = `REMOTE_FS_TIMEOUT`, Test sieht das tatsächlich übergebene Budget | **widerlegt** (Teil „Test sieht“; Code selbst richtig) | Code: `ssh.rs:1751` reicht `Some(budget)` weiter, `ssh.rs:1268` gibt `timeout` unverändert an `wait_child`; `:1774`, `:1797` = 30 s. Gegenproben: M1 (öffentliche Funktion mit 60-s-Konstante) rot, M2 (stat mit 244 s) rot, **M4 (in `run_remote_helper` `timeout` vor `wait_child` auf 244 s überschattet) allein: 111 grün, 0 rot** (`s02-claim-run3.log`). → S02-C1. |
| 7 | OB-21: nicht absolut oder leeres/`.`/`..`-Segment → Failed; `/` exakt | **bestätigt** | `//a`, `/a/`, `/a/./b`, `a/b`, `""`, `/a//b`, `/.`, `/..`, `/a/.`, `/a/..`, ` /a` → `Failed("the host reported a path that is not absolute and normalized")`; `/`, `/a/.b`, `/a\b`, `/a/b\0` → Ok (Lauf 1). Code `ssh.rs:1717-1729`. |
| 8 | Texte ohne Steuerzeichen, ≤ 300 Zeichen | **bestätigt** (Steuerzeichen = Unicode Cc; S02-C6) | 301 × `x`, 301 × `ä`, 299 × `y` + `€tail` → 300 Zeichen ohne Panik; `\r\n\t\0`, ESC-Folgen, U+0085, U+007F → Leerzeichen; U+2028, U+202E, U+200B bleiben (keine Cc). Alle Fehlerwege laufen über `read_error`/`host_reason` (`ssh.rs:1668-1685`) oder feste Texte. |
| 9 | `ends_zen` nur Esc ohne Cmd/Shift/Control/Option bei scharfem Schalter in `main`; Schalter setzt/löscht; Linux ohne Monitor und Warnung | **bestätigt** (Linux-Teil); macOS-Laufzeit **nicht messbar** (S02-C11) | Lauf 2: Fenster `None`, `Main`, `main `, `""`, keyCode 309 und 65535 → false, Kontrolle → true; 8 Fäden × 10 000 Umschaltungen ohne Panik, danach true/false. Signatur lässt keine weiteren Flags zu (`zen_escape.rs:20-39`). Monitor nur unter `cfg(target_os = "macos")` (`zen_escape.rs:52`, `:95`, `lib.rs:374-375`). Clippy: Messung der Steuereinheit (nicht wiederholt). |
| 10 | Helfer-Tests laufen im Prüfabbild; Gegenproben des Bauers rot wie vorhergesagt (6, 9, 5, 3, 5) | **bestätigt** | Lauf 1: M5 (nur Helfer-Text `PATH_CHANGED` gekürzt) macht `the_typed_read_never_returns_bytes_from_a_folder_swapped_for_a_link` rot → der Helfer lief im Abbild. Logs des Bauers: A 6, B 9, C 5, D 3, E 5 rot, je ein `Compiling terax`. Ohne `python3` S02-C8. |
| 11 | Doc-Kommentare stimmen; kein „not implemented“; `Cargo.toml`/`Cargo.lock` unverändert | **bestätigt** mit Wortlaut-Mangel S02-C7 | `grep "not implemented"` in beiden Dateien leer; `git diff --stat 712f137 b1b90f9 -- Cargo.toml Cargo.lock` leer. |

## Gegenproben

Alle Rust-Läufe über den Wrapper im Linux-Prüfabbild, jeweils mit genau einem `Compiling terax v0.8.7` nach der Änderung. Vorhersagen vor dem Lauf: `s02-claim-run{1,2,3}-vorhersage.txt`.

| Eingriff | erwartet | beobachtet | Beleg |
|---|---|---|---|
| Wettlauf Symlink-Tausch, `exact`, 20 s im Prozess | 0 Lecks | 561 551 Lesungen: 123 370 innen, 169 933 außen gemeldet + außen gelesen (Ziel folgt Link, Server weist ab), 268 248 `the path changed…`, **0 Lecks**; fd 8 → 8 | `s02-claim-race-inproc.json` |
| derselbe ohne `exact` (Kontrolle) | Lecks | **91 094 Lecks** (innen gemeldet, AUSSEN gelesen) in 709 763 | ebd. |
| Wettlauf als eigener Prozess je Lesung (wie `run_helper`), 15 s | 0 / >0 | mit `exact` 0 von 463; ohne 172 von 439 | `s02-claim-race-subproc.json` |
| (c) Tausch gegen echten Ordner `aussen` (kein Symlink), `exact` | Inhalt außen unter innerem Pfad möglich | 327 219 von 658 057 (ohne `exact` 480 944 von 950 144) | `s02-claim-race-inproc.json`, S02-C4 |
| (b) Lauf trifft Symlink als letzte / mittlere / erste Komponente (`realpath` als Identität) | `the path changed…` | dreimal so; alter Helfer: ELOOP-Text bzw. liest `/lib/os-release` und die Datei hinter dem Link | `s02-claim-cases.json` |
| (b) Symlink im angefragten Pfad (nach innen / nach außen) | `realpath` meldet das Ziel | gemeldet `…/bereich/sub/datei.txt` mit INNEN bzw. `…/aussen/datei.txt` mit AUSSEN | ebd. |
| (b) harter Link nach außen | liest | gemeldet `…/bereich/hart.txt`, Inhalt AUSSEN | ebd., S02-C4 |
| (b) `/` am Ende, `..` im Pfad, 300 und 420 Ebenen (~3 900 Zeichen) | liest | alle lesen, gemeldet normalisiert | ebd. |
| (b) `chmod 111` auf Linux | liest (O_PATH) | liest `DURCH` | ebd. |
| (b) wie oben, `O_PATH` entfernt (macOS-artig) | EACCES | `[Errno 13] Permission denied: 'durchgang'`, Bestand liest | ebd., S02-C3 |
| (b) FIFO, Ordner, `/`, fehlt, Zwischenordner fehlt, zu groß | not_regular / missing / too_large ohne `b64` | so; zu groß: kein `b64` im Umschlag | ebd. |
| (b) `realpath` liefert relativen Pfad (Stub) | Ablehnung | `not an absolute path: …` | ebd. |
| (d) 2 000 Aufrufe je Fehlerart in einem Prozess (ENOENT/ENOTDIR/ELOOP/EACCES mitten, nicht absolut, too_large, Erfolg) | kein Leck | fd 4 → 4 in allen 10 Fällen | `s02-claim-fdleak.json` |
| (d) Ordner nach der Vorprüfung an letzter Stelle (S_ISREG einmal getäuscht) | not_regular, kein Leck | `IsADirectoryError [Errno 21] Is a directory: <fd>` statt `not_regular`, **1 000 fd geleakt** in 2 000 Aufrufen | ebd., S02-C5 |
| Bestand alt vs. neu, 81 Anfragen | nur `kind` neu | so; `grep` hängt in beiden über dem FIFO | `s02-claim-cases.json`, S02-C10 |
| Rust Lauf 1: M1 öffentliche `read_bytes_typed` mit 60-s-Konstante | rot `ac5_…public…` | rot | `s02-claim-run1.log` |
| Lauf 1: M2 `stat_typed_with` mit `read_bytes_timeout(10485760, None)` | rot `ac10` | rot (`Some(244s)` statt `Some(30s)`) | ebd. |
| Lauf 1: M5 Helfer-Text `PATH_CHANGED` gekürzt | rot Tausch-Test | rot | ebd. |
| Lauf 1: 22 Umschläge × 3 typisierte Antworten, `exact_target`, `host_reason` | keine Panik, Werte laut Vorhersage | 114 Tests, 3 rot (nur M1/M2/M5), alle Ausgaben wie vorhergesagt; `b64` über `limit` 2 → Ok mit 3 Bytes | ebd., S02-C9 |
| Lauf 3: M4 allein (`timeout` in `run_remote_helper` vor `wait_child` auf 244 s) | 0 rot | **111 grün, 0 rot** | `s02-claim-run3.log`, S02-C1 |
| Lauf 2: `python3` im Testprozess unauffindbar (Name in `helper_output` und im Shell-Signal-Test) | still grün | 107 grün, 0 rot; **31 Tests prüfen nichts**, davon 6 neue | `s02-claim-run2.log`, `s02-claim-run2-skips.txt` |
| Lauf 2: `ends_zen`-Ränder, Schalter aus 8 Fäden | false / keine Panik | so | `s02-claim-run2.log` |

Fehlschleife: der erste Lauf der Einzelfälle hing in Pythons `grep` über dem FIFO (Bestand); eigene Prozesse beendet, Fälle danach mit 5-s-Zeitgrenze je Aufruf gefahren.

## Befunde

### Blockierend

```json
{"id": "S02-C1", "class": "refuted",
 "claim": "PD-01/OB-22: der Test sieht das tatsächlich an wait_child übergebene Budget",
 "evidence": "Der Code reicht das Budget richtig durch (ssh.rs:1751 Some(budget) an den Ausführer, ssh.rs:1268 wait_child(&child, timeout)). Die Tests sehen aber nur das Argument an den Ausführer (ac5_the_typed_read_hands_its_own_budget_to_the_ssh_call über read_bytes_typed_with) und eine einzelne Quelltextzeile (ac5_the_public_typed_reads_delegate_their_arguments_unchanged pinnt 'letstatus=matchwait_child(&child,timeout).map_err(Transport)?'). Eine Zeile 'let timeout = timeout.map(|_| Duration::from_secs(244));' am Anfang von run_remote_helper lässt diese Zeile stehen: 111 Tests grün, 0 rot, obwohl wait_child dann 244 s statt 60 s bekommt.",
 "evidence_source": "<scratchpad>/claim-s02/s02-claim-run3.log (Compiling terax, test result: ok. 111 passed; 0 failed); ssh.rs:1220-1268, ssh.rs:5144-5157",
 "expected_observation": "Mit M4 wird mindestens ein Test rot, etwa weil der Pin den Rumpf von run_remote_helper von der Signatur bis zum wait_child-Aufruf abdeckt (kein erneutes Binden von timeout), oder weil wait_child hinter einer Naht steckt, die der Test beobachtet.",
 "scenario": "Eine spätere Änderung in run_remote_helper (Default-Budget, Mindestbudget, Umrechnung) verlängert den SSH-Lesevorgang des Mini-Servers über 60 s; kein Test meldet das, das Versprechen 'nach 60 s abgebrochen' bricht still."}
```

### Übrige (je eine Zeile)

- **S02-C2 · note** — Behauptung 5 im Wortlaut zu weit: Exit 1–127 und Exit ohne Code werden `Unreachable` (z. B. `the remote helper could not start (exit 1)`, `ssh command failed`), nur 128–254 `Failed`; geerbt aus `exit_error` (`ssh.rs:1147-1172`), deckt AC 3 und die Vorgabe „dieselbe Einordnung“ (Lauf 1).
- **S02-C3 · obligation (Mac)** — Ohne `O_PATH` öffnet der Weg jeden Ordner mit `O_RDONLY`: ein Ordner nur mit Durchgangsrecht ergibt im typisierten Weg `[Errno 13] Permission denied: '<name>'`, der Bestand liest (macOS-artig nachgestellt). Am Mac messen: diesen Fall, den Wettlauf (`s02-claim-py/race.py`) und ob `O_RDONLY|O_DIRECTORY|O_NOFOLLOW` auf einem Symlink ELOOP oder ENOTDIR gibt (beide werden abgefangen).
- **S02-C4 · note** — Wird `bereich/sub` gegen einen ECHTEN Ordner von außen getauscht (kein Symlink), liefert auch der `exact`-Weg dessen Inhalt unter dem inneren Pfad (327 219 von 658 057). Ein harter Link liefert genauso. Das ist von der Zusage gedeckt, weil die Datei beim Öffnen unter dem gemeldeten Pfad lag. Es setzt Schreibrecht in beiden Elternordnern auf demselben Dateisystem voraus. Als zweite Restgrenze neben „verschoben nach dem Betreten“ dokumentieren.
- **S02-C5 · note** — Liegt nach der Vorprüfung ein Ordner an letzter Stelle, wirft `os.fdopen` schon vor der `fstat`-Prüfung `IsADirectoryError`. Das Ergebnis ist `Failed("[Errno 21] Is a directory: <fd>")` statt `NotRegularFile` (Server 502 statt 404), und der Deskriptor leakt (1 000 von 2 000 im Prozess). Bei einem Helfer-Prozess je Anfrage ist das folgenlos. Der Bestand hat dasselbe Muster.
- **S02-C6 · note** — `host_reason` ersetzt nur Unicode-Cc; U+2028, U+202E und U+200B bleiben im Text (Lauf 1). Für Log und Toast ist das die Sache von `clean_detail` im Server.
- **S02-C7 · fix** — Der Doc-Kommentar von `RemoteReadError` (`ssh.rs:1633-1635`) nennt die Texte von Unreachable/TimedOut/Failed „the host's or ssh's own words“. Sie tragen auch Terax' eigene Texte (`classify_ssh_error`-Hinweise, `the host reported a path that is not absolute and normalized`, MaxSessions-Grund, `remote helper exited with status 137`, `bad realpath response: …`). Den Wortlaut ergänzen. Nicht als `refuted` gesetzt: die Kernaussage (Host-/ssh-Wörter möglich, ohne Cc, ≤ 300) stimmt.
- **S02-C8 · note (Bestand)** — Ohne `python3` laufen 31 Helfer-Tests still grün und prüfen nichts. 6 davon sind neu: `ac1_…`, `a_host_without_dir_fd_…`, `the_editor_read_keeps_…`, `the_typed_read_never_returns_…`, `the_typed_read_passes_a_search_only_folder_on_linux`, `the_typed_read_resolves_links_…`. AC 1 erlaubt das; im Abbild laufen sie (M5).
- **S02-C9 · note** — `read_bytes_typed` prüft die Länge der Antwort nicht gegen `limit` (ein `b64` über der Grenze ergibt Ok mit 3 Bytes bei `limit` 2). Der Server prüft `file.bytes.len() > MAX_READ_BYTES` selbst (`preview_server/source.rs:494`, Feature-Worktree).
- **S02-C10 · note (Bestand, außerhalb des Slices)** — Die Helfer-Operation `grep` blockiert auf einem FIFO im Baum, alter wie neuer Helfer (5-s-Zeitgrenze gerissen).
- **S02-C11 · obligation (Mac, AC 9)** — Die Laufzeit des Monitors ist auf Linux nicht messbar. Am Mac prüfen: die Zuordnung über `windowNumber` bei Fokus im iframe, Esc bei aktivem CapsLock oder Fn (diese Flags wertet der Monitor nicht, Zen endet), gehaltenes Esc (`isARepeat`, mehrfaches `emit`), Esc während einer IME-Komposition. `emit` geht an alle Fenster, nicht nur an `main`.

## Prüfmenge

- **checked:** Diff `712f137...b1b90f9` beider Dateien. Helfer alt und neu direkt ausgeführt (81 Anfragen, Byte-Vergleich). Wettlauf Symlink- und Ordnertausch mit und ohne `exact`, im Prozess und als eigener Prozess. Deskriptor-Zählung über 11 Fehlerwege. Host-Stubs für `dir_fd`/`O_NOFOLLOW`/`O_DIRECTORY`/`O_PATH`. 22 Umschläge × 3 typisierte Antworten, `exact_target` mit 15 Fällen, `host_reason` mit 8 Fällen. Budget-Mutationen M1, M2, M4 (allein) und M5. Tests ohne `python3`. `ends_zen`-Ränder und Schalter aus Fäden. Rumpf-Diff `run_remote_helper`. Hunks im Testbereich. `Cargo.*`. `lib.rs` unverändert. Server-Naht (`source.rs:420-497`, Feature-Worktree) gelesen.
- **not_checked:**
  - macOS-Laufzeit von Monitor und `_open_exact`: nicht verfügbar → S02-C3, S02-C11.
  - Clippy und volle Suite: formal gemessen von der Steuereinheit, laut Brief nicht nachzählen.
  - Echte SSH-Verbindung: verboten.
  - Windows-Arme: gehören zu slice-01.
  - `clean_detail` im Server: anderer Slice.

## Zustand des Worktrees

`git status --porcelain`: leer. `git rev-parse HEAD`: `b1b90f94ea4228a8a956410226c358bc8ec90644` (detached). Probe-Branch `s02-claim-proben` gelöscht. Wegwerf-Ordner `s02-claim-fs-*` entfernt. Keine eigenen Prozesse laufen mehr.
