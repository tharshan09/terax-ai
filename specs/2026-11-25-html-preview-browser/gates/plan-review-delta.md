# Plan-Review Delta: Bauplan Welle 1, Runde 2

| Key | Value |
|-----|-------|
| Vorlauf | `gates/plan-review.md` (Verdict FAILED, PR-01 `decision`, PR-02 `refuted`) |
| Prüfgegenstand | `gates/build-plan-r1-r2.diff` (283 Zeilen, `diff -u` alt → neu); `build-plan.md` (1017 Zeilen) nur an den Stellen, die der Diff berührt |
| Skript-Ergebnis | `gates/build-plan-precheck-r2.json`: `result: PASS`, übernommen (P5), nicht nachgezählt |
| Bindende Vorgaben | User 25.11.2026: Plan freigegeben, fachliche Zeilen bestätigt; PR-01: Abbruch eines SSH-Lesevorgangs nach 60 s (weicht ab von SEC-16); Rückfall der In-App-Vorschau bei Ablehnung. Steuereinheit: PR-02 nach Variante (a) |
| Code-Stand | `cf07327`, nur gelesen (Worktree `.claude/worktrees/html-preview-browser`, gleicher Commit) |
| Datum | 2026-11-25 |
| Verdict | **APPROVED** (kein `decision`, kein `refuted`) |

## Status der Vorlauf-Befunde

| Befund | Klasse | Status | Beleg im neuen Stand |
|--------|--------|--------|----------------------|
| PR-01 | `decision` | aufgelöst | Entscheidungszeile mit 60 s, „weicht ab: SEC-16", User-Entscheid (Diff Z. 17); technische Zeile zum Ort der Grenze (Z. 24); Vertrag `read_bytes_typed(…, budget: Duration)` (Z. 51, 63); slice-01 `ssh_read_budget` (Z. 83) und AC 34 (Z. 151-155); slice-02 Deliverable (Z. 183) und AC 5 (Z. 210-213). Hält am Code, siehe Punkt 1; eine Beweislücke im Inneren von `read_bytes_typed`: PD-01 |
| PR-02 | `refuted` | aufgelöst | Verträge `realpath_typed`, `stat_typed` (Z. 52-53); gemeinsame Einordnung (Z. 62); slice-01 Klickweg ohne `ssh::realpath`/`ssh::stat` (Z. 82), AC 28 (Z. 135-137), AC 35 (Z. 157-161); slice-02 Deliverables (Z. 184-185), AC 4 (Z. 204-205), AC 10 (Z. 221-225) |
| PR-03 | `fix` | aufgelöst, wie verlangt | slice-01 AC 11 mit drei Symlinks im Bereich auf `.env`, `.git/config`, `.ssh/id_ed25519` (Z. 108-111); AC 15 mit den Namen `id_ed25519`, `.ssh/config`, `.git/config` und den Zielen `/srv/p/.env`, `/srv/p/.git/config`, `/srv/p/keys/id_ed25519` (Z. 122-124) |
| PR-04 | `fix` | aufgelöst, wie verlangt | slice-01 AC 33 am echten Socket in `listener.rs` (Z. 145-149) |
| PR-05 | `fix` | aufgelöst, wie verlangt | Rümpfe mit `.to_string()` (Z. 40); `let _ = (…);` ohne Umbenennung, ohne `#[allow]` (Z. 42) |
| PR-06 | `obligation` | aufgelöst, in die Slice-Abschnitte übernommen | Vertrag `ZenToggleButton` mit `title`, ohne Radix (Z. 235); slice-03 AC 6 ohne `TooltipProvider` (Z. 244-247); slice-04 Deliverable (Z. 255), „Nicht in diesem Slice" (Z. 280), AC 20 (Z. 264-269) |
| PR-07 | `obligation` | aufgelöst, anders umgesetzt (trägt) | slice-01 Deliverable (Z. 87), Entscheidung `<link>` (Z. 26), AC 36 mit Test-Logger (Z. 163-167); slice-04 Deliverable (Z. 256), AC 21 (Z. 271-275) |
| PR-08 | `note` | offen unverändert | keine Pflicht |
| PR-09 | `note` | offen unverändert | keine Pflicht |
| PR-10 | `note` | offen unverändert | keine Pflicht |
| PR-11 | `note` | offen unverändert | keine Pflicht |
| PR-12 | `note` | offen unverändert | Rückfall vom User bestätigt; der Hinweis zu Neu laden auf dem Asset-Weg bleibt Hinweis |
| PR-13 | `note` | offen unverändert | keine Pflicht |
| PR-14 | `note` | offen unverändert | keine Pflicht |
| PR-15 | `note` | offen unverändert | keine Pflicht |
| PR-16 | `note` | offen unverändert | AC 20 prüft Imports, nicht das Zählen von `invoke`-Aufrufen; bleibt Hinweis |

## Prüfmenge

### Punkt 1: PR-01, 60-s-Grenze (checked)

- **`wait_child` trägt, was ihm zugeschrieben wird.** Mit `Some(dur)` wartet es per `recv_timeout`; läuft die Zeit ab, ruft es `child.kill()` und `child.wait()` (beendet und eingesammelt) und gibt `Ok(None)` zurück (`src-tauri/src/modules/ssh.rs:999-1028`, `:1012-1017`). `run_remote_json` macht aus `None` den Fehler `RemoteError::TimedOut` und kehrt sofort zurück, ohne auf die Lese-Threads zu warten (`:1190-1202`). Den Abbruch belegt der bestehende Test `wait_child_kills_a_hung_child_after_the_budget` (`:2254`). Der Leser kehrt also kurz nach dem Budget zurück, und der Platz kann frei werden.
- **slice-01 AC 34 hat rote Fälle.**
  - Gibt `read_remote` ein anderes Budget als `ssh_read_budget` weiter, ist „Budget genau 300 ms" falsch.
  - Stünden 244 s in der Grenzen-Struktur, ist „im Betrieb `ssh_read_budget` = 60 s" falsch.
  - Würde der Platz nach dem Abbruch nicht frei, liefe `b.png` in die Wartegrenze von 5 s statt mit `200` zu laden.
  - Hinge der Ersatz länger, wäre „endet vor 1 s" falsch.
- **Naht slice-01 → slice-02:** Den Wert vom Server bis zur Signatur des Lesers belegen AC 34 und der Typ des Vertrags. Ob `read_bytes_typed` den Parameter wirklich an den Ausführungsteil weitergibt, belegt kein Test, der rot werden kann: PD-01.
- **SEC-16 vs. User-Entscheid:** Die Abweichung steht als „weicht ab: SEC-16" (Z. 17) und für SVC-8/SVC-22 in der technischen Zeile (Z. 24). OB-12 („nicht 244 s lang") ist erfüllt: Ein Hänger hält den Platz höchstens 60 s, wartende Dateien bekommen nach 30 s eine `504`.

### Punkt 2: PR-02, typisierter Klickweg (checked)

- **Der MaxSessions-Grund erreicht jetzt den Toast:**
  - `realpath_typed` und `stat_typed` ordnen über dieselbe Funktion ein (Z. 62, 184-185); slice-02 AC 4 prüft das für alle drei Funktionen.
  - slice-01 AC 35 erwartet `{ status: unreachable, reason: "the SSH server refused another session (MaxSessions limit)" }`.
  - slice-04 AC 4 (unverändert) macht daraus „Could not read a.html from devbox: {reason}".
- **`classify_ssh_error` bleibt für alle übrigen Aufrufer unverändert:** „Nicht in diesem Slice" in slice-02 schließt jede Änderung aus. slice-02 AC 4 verlangt für denselben stderr weiter den Anmelde-Hinweis. Der bestehende Test `ssh.rs:2212` (`contains("open a terminal")`) bleibt. `ssh::realpath` und `ssh::stat` bleiben für die übrigen Aufrufer unberührt.
- **Rückgabetyp:** `crate::modules::fs::file::FileStat` stimmt.
  - Der Typ ist `pub struct FileStat { pub size: u64, pub mtime: u64, pub kind: StatKind }` mit `#[derive(Serialize, Deserialize)]` (`src-tauri/src/modules/fs/file.rs:48-54`); `StatKind` hat `rename_all = "lowercase"` (`:40-46`); `fs::file` ist `pub mod` (`fs/mod.rs:4`).
  - Damit kann `preview_contracts.rs` den Typ für die Funktionszeiger-Prüfung (slice-00 AC 2) benennen.
  - Die Helfer-Antwort `{"size", "mtime", "kind": "file"}` (`ssh.rs:360-364`) passt zu slice-02 AC 10, ebenso `realpath` als Text (`ssh.rs:371-374`) und `REMOTE_FS_TIMEOUT` = 30 s (`ssh.rs:893`).
  - `FileStat` hat weder `Debug` noch `PartialEq`: PD-02.

### Punkt 3: PR-03, PR-04, PR-05 (checked)

- **PR-03 und PR-04:** wie verlangt umgesetzt. `c.png` → `/srv/p/keys/id_ed25519` greift über das Muster für Geheimnis-Dateinamen, nicht über einen geschützten Ordner. Das ist der gewollte zweite Fall.
- **PR-05:** `let _ = (app, path, workspace);` verschiebt `AppHandle`, `String` und `Option<WorkspaceEnv>` in ein Tupel und kompiliert. `let _ = (host, path, limit, budget);` mit `&str`, `u64`, `Duration` kompiliert ebenso, `let _ = armed;` auch. Kein Rumpf hat `State` oder `&mut`-Parameter. Die Rümpfe von `realpath_typed` und `stat_typed` haben nur `&str`-Parameter. Rustc zählt `let _ =` als Nutzung, `unused_variables` entfällt. Die Clippy-Lints für `let _ = …` (`let_underscore_untyped`, `no_effect_underscore_binding`) sind nicht standardmäßig aktiv (restriction bzw. pedantic). `-D warnings` bleibt ruhig.
- **not_checked:** Clippy selbst nicht gelaufen (keine Läufe erlaubt); die Aussage stützt sich auf die Lint-Gruppen.

### Punkt 4: PR-06, PR-07 (checked)

- **Widerlegte Aussage aus dem Auftrag:** Der Plan-Schreiber hat recht. `FileExplorer.tsx:58` importiert schon heute den Wert `useWorkspaceEnvStore`, und der Mock `FileExplorer.test.tsx:43-47` liefert genau ihn. Die Umsetzung („aus `preview-server/` nur `import type`, `FileExplorer.tsx` ohne weiteren Wert, nur `lib/browserOpenable` und `lib/openInBrowser`, nicht der Barrel") trägt für den Bestandstest:
  - `openInBrowser` braucht `invoke` (gemockt, `FileExplorer.test.tsx:32`) und `toast.error` (gemockt, `:41`).
  - `OpenInBrowserButton` und der Zen-Barrel bleiben aus dem Explorer heraus.
  - `EditorPane.preview-env.test.tsx` mockt `@tauri-apps/api/core` mit `invoke`, `convertFileSrc` und `@tauri-apps/api/event` mit `listen` (`:11-15`). Das reicht für Kopfzeile, Zen-Barrel und `OpenInBrowserButton`, solange beim Rendern nichts aufgerufen wird.
  - slice-04 AC 20 sichert das per Guard und führt beide Bestandstests unverändert aus.
- **PR-07 Rust, baubar im Dateibereich:**
  - Kein Test der Crate setzt bisher einen globalen Logger (`grep set_logger|set_boxed_logger|env_logger|set_max_level` in `src-tauri/src`, `src-tauri/tests`: kein Treffer). Ein eigener `log::Log` in `preview_server/mod.rs` kann also einmal je Test-Binary installiert werden.
  - Die Einträge paralleler Tests (`--test-threads=2`) landen mit darin. Das macht die Prüfung nur strenger, weil das Geheimnis zufällig ist.
  - Das Ersetzen durch `<link>` liegt in `open_entry` (`mod.rs`, Bereich slice-01).
- **PR-07 Frontend:** `serializeTabs` gibt es (`src/modules/spaces/lib/serialize.ts:133`), sie wird im Test nur importiert, nicht geändert. Die Hälfte zur Serialisierung in AC 21 kann nicht rot werden: PD-04.

### Punkt 5: Regression (checked)

- **Verträge:** Beide neuen Verträge haben einen Bauer (slice-02) und einen Konsumenten (slice-01); in „Braucht" von slice-01 und slice-02 sind sie eingetragen (Z. 95-96, 193-194). Slice-00 legt alle drei typisierten Rümpfe an (Z. 40).
- **Dateibereiche:** Kein neues AC verweist auf eine Datei außerhalb seines Bereichs.
  - slice-04 AC 20 nennt zwei Bestandstests ausdrücklich als „unverändert, außerhalb des Dateibereichs" und führt sie nur aus.
  - slice-04 AC 21 importiert `serialize.ts` nur.
  - slice-02 AC 10 würde für einen Vergleich mit `assert_eq!` Ableitungen an `file.rs` brauchen, also an einer Datei aus dem Bereich von slice-01: PD-02.
- **Bestätigte Entscheidungszeile mit `ssh::realpath`/`ssh::stat` (Z. 21):** Die Klarstellung reicht, siehe PD-03. Das Slice-Brief von slice-01 sagt ausdrücklich „`ssh::realpath` und `ssh::stat` nutzt der Server nicht" (Z. 82), AC 28 und AC 35 testen nur die typisierten Varianten, und `TERAX.md` nennt sie (Z. 35). Ein Bauer, der nach seinem Slice-Abschnitt baut, baut das Richtige.
- **Unverändert gültig:** slice-01 AC 15 bis 18 (Signatur des Lesers jetzt mit `budget`, AC 15 prüft weiter nur Host und Grenze), slice-02 AC 1 bis 3, 8; „Nicht in diesem Slice" von slice-01 und slice-02.
- **not_checked:** Stellen außerhalb des Diffs (im Vorlauf bestätigt); Laufzeitverhalten von sshd beim Beenden des Mux-Clients (nur am Mac messbar, PD-05).

## Neue Befunde

### PD-01 · `fix`

- **claim:** slice-02 AC 5 (`build-plan.md`, Diff Z. 210-213): „GIVEN `read_bytes_typed("devbox", …, Duration::from_secs(60))` WHEN Anfrage und Zeitbudget bestimmt werden THEN … das Budget des `ssh`-Aufrufs genau 60 s"; Deliverable Z. 183 („gibt genau den übergebenen Parameter `budget` an den Ausführungsteil und damit an `wait_child`").
- **evidence:** `src-tauri/src/modules/ssh.rs:1490-1502` (`read_bytes` reicht das Budget direkt an `run_remote_json`, ohne Naht für einen Test); `:1190` (`wait_child(&child, timeout)` im Ausführungsteil); `src-tauri/src/modules/fs/file.rs:176-191` (Muster `…_with` mit übergebenem Ausführer).
- **evidence_source:** Code, Spec-Dokumente
- **expected_observation:** Der Plan schreibt keine Naht vor, an der ein Test das Budget sieht, das der Ausführungsteil wirklich bekommt. Eine Umsetzung, die eine reine Funktion für Anfrage und Budget testet, im echten Aufruf aber `read_bytes_timeout(limit, None)` oder `REMOTE_FS_TIMEOUT` weitergibt, besteht AC 5. slice-01 AC 34 nutzt einen Host-Ersatz und deckt diesen Weg nicht.
- **scenario:** Bei der Teilung von `run_remote_json` bleibt im typisierten Zweig `Some(read_bytes_timeout(limit, None))` stehen. Alle Tests sind grün, ein Hänger hält den Platz wieder bis 244 s, und die User-Entscheidung zu PR-01 wirkt nicht.
- **Resolution:** AC 5 konkret machen: `read_bytes_typed` delegiert an eine Funktion mit übergebenem Ausführer (Muster `fs_read_remote_image_with`, `file.rs:176-191`). Der Test übergibt einen Ersatz-Ausführer, der das empfangene Budget notiert, und erwartet genau 60 s. Alternativ als Review-Auflage: Der Reviewer von slice-02 prüft die Zeile, an der der typisierte Zweig `wait_child` sein Budget gibt.

### PD-02 · `obligation`

- **claim:** slice-02 AC 10 (Diff Z. 221-225): „ergibt … einen `FileStat` mit `size` 2048 und Art Datei, `Failed("[Errno 2] …")` und `Unreachable(…)`".
- **evidence:** `src-tauri/src/modules/fs/file.rs:40-54` (`StatKind` und `FileStat` nur mit `#[derive(Serialize, Deserialize)]`, ohne `Debug` und `PartialEq`); `file.rs` liegt im Dateibereich von slice-01 (`build-plan.md`, Tabelle slice-01).
- **evidence_source:** Code
- **expected_observation:** `assert_eq!` auf `Result<FileStat, RemoteReadError>` und `unwrap_err()` kompilieren nicht, weil `FileStat` weder `PartialEq` noch `Debug` hat. Ein Bauer, der dafür `#[derive(Debug, PartialEq)]` an `FileStat` setzt, ändert eine fremde Datei (Planbruch).
- **scenario:** Der Bauer von slice-02 schreibt den Test aus AC 10 mit `assert_eq!`, der Build scheitert, und er ergänzt die Ableitung in `file.rs`.
- **Resolution:** In das Brief von slice-02: Ergebnisse von `stat_typed` per `match`/`matches!` und über die Felder (`size`, `matches!(kind, StatKind::File)`) prüfen, `Err` mit `.err()` statt `unwrap_err()` auspacken; `file.rs` bleibt unberührt.

### PD-03 · `note`

- **claim:** Entscheidungszeile zur Größenprüfung beim Klick über SSH (Diff Z. 21, „entschieden: User") nennt weiter „`ssh::realpath`" und „`ssh::stat`".
- **evidence:** Diff Z. 25 (technische Zeile: „gilt auch für die Zeile zur Größenprüfung beim Klick über SSH"), Z. 82 (slice-01: „`ssh::realpath` und `ssh::stat` nutzt der Server nicht"), Z. 135-137 (AC 28 nur typisiert).
- **evidence_source:** Spec-Dokumente
- **expected_observation:** Es gibt keinen Widerspruch im Slice-Abschnitt; der Bauer baut nach slice-01 das Richtige. Nur wer die Entscheidungszeile allein liest, sieht die alten Namen.
- **scenario:** –
- **Resolution:** Hinweis: Ein Klammervermerk „(typisiert, siehe Zeile ‚Wie der MaxSessions-Grund …')" in der bestätigten Zeile ändert ihren fachlichen Inhalt nicht.

### PD-04 · `note`

- **claim:** slice-04 AC 21 (Diff Z. 271-275): „die Serialisierung des Tabs enthält `path` und `workspace`, aber weder `127.0.0.1` noch `T`".
- **evidence:** `src/modules/doc/DocStack.tsx:76-81` (die Pane bekommt nur `path`, `workspace`, `visible`, `onSetView`, keinen Tab und keinen Setter); `src/modules/spaces/lib/serialize.ts:133` (`serializeTabs(tabs)`).
- **evidence_source:** Code
- **expected_observation:** Der Test baut den Tab selbst, und die Pane kann ihn nicht ändern. Diese Hälfte kann nicht rot werden. Die Hälfte zu `console.*` und `toast` kann rot werden.
- **scenario:** –
- **Resolution:** Hinweis: Diese Hälfte als Review-Punkt führen (keine Adresse in einem Tab-Feld) oder streichen.

### PD-05 · `note`

- **claim:** Technische Zeile zum Ort der 60-s-Grenze (Diff Z. 24): „nur ein beendeter Prozess gibt die Sitzung am Server wirklich frei".
- **evidence:** `src-tauri/src/modules/ssh.rs:1012-1017` (beendet wird der lokale `ssh`-Prozess, beim ControlMaster ein Mux-Client); `architecture.md:259` (SEC-14, Herleitung über `MaxSessions` je Netzverbindung).
- **evidence_source:** Code, Spec-Dokumente
- **expected_observation:** Dass der Master die Sitzung beim Ende des Mux-Clients sofort schließt und der Platz am Server frei wird, ist plausibel, aber hier nicht messbar.
- **scenario:** –
- **Resolution:** Hinweis für die Mac-Checkliste: N-20/N-25 um einen hängenden Lesevorgang ergänzen (z. B. eine FIFO-Nachbardatei oder ein `sleep`-Helfer) und prüfen, dass nach 60 s die übrigen Bilder laden und ein neuer Terminal-Tab startet.

## Verdict

**APPROVED.** PR-01 bis PR-07 sind aufgelöst. Die Hinweise PR-08 bis PR-16 bleiben offen und verpflichten zu nichts. Neue Befunde: PD-01 (`fix`), PD-02 (`obligation`), PD-03 bis PD-05 (`note`); keiner blockiert.
