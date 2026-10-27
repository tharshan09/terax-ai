# DECISION: Staging-Prädikat an jeder Aufzählungs-Primitive (Gate 1, Durchgang 4)

| Feld | Wert |
|---|---|
| Datum | 2026-10-27 |
| Kategorie | `derived` |
| Anlass | Gate 1 (Architecture Compliance) nach `DECISION-gate1-staging-search.md`, Korrekturrunde E-1..E-5 und Delta-Lauf 3 weiter FAILED: F-1 `refuted` (CONFIRMED), F-3 `decision` (CONFIRMED), F-2/F-4/F-5 `fix`, O-1 `obligation`, F-6/F-7 `note` |
| Ebene | Spec-Artefakte `architecture.md` und `gates/obligations.md` (Phase Grundlage, kein `build-plan.md`); kein Projekt-Code |
| Betroffene Slices | Slice 3 (Einfügen + Finder-Benennung: SEC-4, MIG-14, MIG-19, MIG-73, MIG-74, MIG-75, neue MIG-76, Risiko-Zeile, Q&A #7/#28/#31, NFR-3, BR-3-Traceability, Sweep) |
| Vorige DECISION | `gates/DECISION-gate1-staging-search.md`; deren Wurzel-These ist durch E-1 und F-1 widerlegt und wird hier revidiert (Abschnitt 1.2) |

## 1. Wurzel-Trace

### 1.1 Befunde über alle vier Runden

| Runde | Befund | Stelle | Verankerung der Regel, die versagt hat |
|---|---|---|---|
| 1 | B3 (`decision`, CONFIRMED) | `tree.rs:204`, Helper `read_dir` `ssh.rs:299` | gar keine; PM-Entscheid: Explorer blendet immer aus |
| 1 → Korrektur | MIG-73 (`fs_read_dir`), MIG-19 (Helper `read_dir`) | | Regel als Eigenschaft eines Commands |
| 2 | D-1 (`refuted`, CONFIRMED), N-4 (`note`) | `search.rs:104`, `ssh.rs:487,490`; `tree.rs:271`, `ssh.rs:318` | Regel nur am Baum-Command; weitere Stellen, die `show_hidden` lesen, offen |
| 2 → Resolver | DECISION 1: Prädikat „an jeder Stelle, die `show_hidden` auswertet"; Ausnahme: `grep.rs:81,355` `.hidden(true)` „fest verborgen" | | Klassifikator `show_hidden`-Lesestelle; Ausnahme auf Fremdmechanik gestützt |
| 3 | E-1 (`refuted`, CONFIRMED) | `git/operations.rs:137-153` `git status --untracked-files=all`, `parser.rs:61-63` | `git status` liest kein `show_hidden`, lag außerhalb des Klassifikators |
| 3 → Dirigent | MIG-75: Parser lässt jeden Eintrag mit Staging-Segment weg, „alle vier Eintragsarten" | | Regel auf den ganzen Parser-Ausgang angewendet, nicht auf die Aufzählung darin |
| 4 | F-1 (`refuted`, CONFIRMED) | `grep.rs:80-88` (`search_tree`, genutzt von `fs_grep :227`, `fs_grep_interactive :297`), `grep.rs:354-361` (`fs_glob_impl`) | Ausnahme `.hidden(true)` hält nicht: `ignore 0.4.32` `dir.rs:490` wendet die Hidden-Regel nur ohne Ignore-/Whitelist-Treffer an |
| 4 | F-3 (`decision`, CONFIRMED) | MIG-75 filtert `1 `, `2 `, `u `; Panel-Commit `operations.rs:438-443` ohne Pfadliste, `git diff --cached` ohne Pfad `useSourceControlPanel.ts:886` | Regel greift über die Aufzählung hinaus auf Index-Zustand |
| 4 | F-2 (`fix`) | `walk.rs:1150-1152` (Wurzel nie gefiltert), `useWorkspaceCwd.ts:103-108`, `pathComplete.ts:36-46` | Absolutaussage „nie aufgezählt" verspricht mehr als eine Eintrags-Regel leistet |
| 4 | F-4 (`fix`) | Sweep Z.356 `git_diff`-Begründung | Begründung an „gefiltertem Status" festgemacht statt an „zählt keinen Dateisystem-Inhalt auf" |
| 4 | F-5, F-6, F-7 | NFR-3, Research-Log, MIG-75-Test | Folgeänderungen |

### 1.2 Selbst-Check: vorige These widerlegt

DECISION 1 benannte als Wurzel: „Regel als Eigenschaft eines Commands statt der Regel ‚versteckter Name' an allen `show_hidden`-Stellen". Diese These erklärt B3, D-1 und N-4, aber nicht E-1 (`git status` liest kein `show_hidden`) und nicht F-1 (`grep.rs` liest kein `show_hidden` und wurde deshalb ausgenommen). Beide Funde sind Gegenbeweise: Der Klassifikator „Stelle, die `show_hidden` liest" war selbst wieder eine Verankerung an einem Verbergungs-Mechanismus, also derselbe Fehler eine Ebene höher. Die Ausnahme für `grep.rs` beruhte auf einer Annahme über die `ignore`-Crate (`.hidden(true)` verbirgt jeden Punkt-Namen samt Inhalt), die nicht gemessen war. Die These wird revidiert, nicht verteidigt.

### 1.3 Die eine Wurzel

**Die Architektur verankert die Staging-Regel an Verbergungs-Mechanismen (Flag `show_hidden`, `ignore`-Option `.hidden(true)`, Eintragsarten des Git-Parsers) statt an dem Objekt, um das es geht: die Aufzählung von Dateisystem-Inhalt des Workspace durch die App.** Jede Verankerung an einem Mechanismus verfehlt die Klasse in eine von drei Richtungen:

- (a) sie übersieht Aufzählungen, die den Mechanismus nicht nutzen (E-1: `git status`; B3/D-1/N-4: Commands ohne die Regel);
- (b) sie verlässt sich auf eine Fremdmechanik, deren Semantik angenommen statt gemessen war (F-1: `.hidden(true)` der `ignore`-Crate greift nur, wenn keine Ignore- oder Whitelist-Regel den Eintrag trifft, `dir.rs:490`);
- (c) sie greift über die Aufzählung hinaus auf Zustand, der keine Aufzählung ist (F-3: Index-Einträge `1 `, `2 `, `u ` sind Git-Zustand, den der User außerhalb der App erzeugt hat), oder verspricht mehr, als eine Eintrags-Regel leisten kann (F-2: die Wurzel einer Aufzählung wählt der User, sie wird nie gefiltert).

### 1.4 Test der Wurzel gegen jeden Fund

| Fund | Richtung | erklärt |
|---|---|---|
| B3, D-1, N-4 | (a) Aufzählung ohne die Regel | ja |
| E-1 | (a) Aufzählung außerhalb des Klassifikators `show_hidden` | ja |
| F-1 | (b) Ausnahme auf ungemessene Fremdmechanik gestützt | ja |
| F-3 | (c) Regel auf Nicht-Aufzählung (Index) ausgedehnt | ja |
| F-2 | (c) Absolutaussage über die Wurzel | ja |
| F-4 | Sweep-Begründung an „gefiltertem Status" statt an „keine Dateisystem-Aufzählung" | ja (Folge von (c)) |
| F-5, F-6, F-7 | Folgeänderungen der Regel-Menge | ja |
| O-1 | fehlender Test genau für Richtung (b) | ja |

Die Wurzel erklärt jeden gemeldeten Fund. Sie ist auch der Grund, warum sich die Klasse über vier Runden wiederholt hat: Jede Runde hat eine Instanz geschlossen und den Klassifikator beibehalten.

### 1.5 Messung: Inventar aller Aufzählungs-Primitiven (Stand `68d45d0`)

Klassifikator neu: nicht „wo wird `show_hidden` gelesen", sondern „womit zählt die App Dateisystem-Inhalt des Workspace auf".

| Primitive | Stelle | Command / Oberfläche | Prädikat heute geplant | Ziel |
|---|---|---|---|---|
| `WalkBuilder::new` | `tree.rs:47` `git_non_ignored_names` | Flag `gitignored` im Baum | keins (Ausnahme im Sweep) | Prädikat (MIG-73) |
| `WalkBuilder::new` | `search.rs:103` `fs_search` | Explorer-Suche (`ExplorerSearch.tsx:115`) | MIG-74 | bleibt, Whitelist-Test (OB-28) |
| `WalkBuilder::new` | `search.rs:298` `fs_list_files` | AI-Dateiliste (`useWorkspaceFiles.ts:36`) | MIG-74 | bleibt, Whitelist-Test |
| `WalkBuilder::new` | `grep.rs:80` `search_tree` (`fs_grep :227`, `fs_grep_interactive :297`) | Inhaltssuche (`useContentSearch.ts:31`), AI-`grep` (`native.ts:213`) | keins, Ausnahme widerlegt (F-1) | neue MIG-76 |
| `WalkBuilder::new` | `grep.rs:354` `fs_glob_impl` | AI-`glob` (`native.ts:224`) | keins, Ausnahme widerlegt (F-1) | MIG-76 |
| `std::fs::read_dir` | `tree.rs:167` `fs_read_dir` | Baum (`useFileTree.ts:133`), Pfadvervollständigung (`pathComplete.ts:43`), AI `list_directory` (`native.ts:200`) | MIG-73 | bleibt |
| `std::fs::read_dir` | `tree.rs:256` `list_subdirs` | Unterordner-Menü (`CwdBreadcrumb.tsx:187`) | MIG-73 | bleibt |
| `os.scandir` (Helper) | `ssh.rs:297` `read_dir` | Baum SSH | MIG-19 | bleibt |
| `os.scandir` (Helper) | `ssh.rs:316` `list_subdirs` | Unterordner-Menü SSH | MIG-19 | bleibt |
| `os.walk` (Helper) | `ssh.rs:484` `search` | Explorer-Suche SSH | MIG-19 | bleibt |
| `os.walk` (Helper) | `ssh.rs:518` `grep` | Inhaltssuche SSH (`grep.rs:278`) | MIG-19 | bleibt |
| Git-Status, ungetrackt | `parser.rs:62` (`? `) | Source-Control-Panel, Git-Dekoration, Änderungszahl | MIG-75 | bleibt |
| Git-Status, Index/HEAD | `parser.rs:44,51,57` (`1 `, `2 `, `u `) | dito | MIG-75 (alle vier) | **kein Prädikat** (F-3) |
| `std::fs::read_dir`, keine Workspace-Aufzählung | `mutate.rs:198`, `ssh.rs:1172` (Rekursion über die vom User gewählte Kopierquelle), `history/mod.rs:76` (App-interner Verlauf), `test_bridge.rs:40` (dev-only) | keine Oberfläche | | Ausnahme mit Grund im Sweep |

Weitere Commands aus `lib.rs:382-479` zählen keinen Workspace-Inhalt auf (pfadgebunden: `fs_stat`, `fs_read_file`, `git_diff_content`, `git_show_commit`, `git_commit_file_diff`; aus Commits: `git_log`, `git_commit_files`; Index ohne Dateisystem: `git_diff`); `fs_watch_add` ist nicht rekursiv (`watch.rs:186`) und löst nur Refetch aus. Die Liste des Prüfers (Check D, Delta 3) ist damit bestätigt und auf Primitive abgebildet.

Mechanik-Belege (`ignore 0.4.32`, `Cargo.lock:2010-2011`):

- `dir.rs:489-491` `matched_dir_entry`: `if m.is_none() && opts.hidden && is_hidden_entry(dent)`; ein Whitelist-Treffer (z.B. `!*/` in `.gitignore`, `!.terax-copy-*/` in `.ignore`) setzt die Hidden-Regel außer Kraft. `.hidden(true)` und `.hidden(!show_hidden)` sind deshalb keine Garantie.
- `walk.rs:1150-1152`: die Wurzel (`depth == 0`) wird nie gefiltert, weder von Ignore-Regeln noch vom Filter-Prädikat.
- Seriell `walk.rs:1162` (`should_skip_entry`), danach `:1177-1180` Filter-Prädikat; parallel `walk.rs:1904`, danach `:1927-1934`: ein vom Prädikat abgelehnter Eintrag wird nicht als `Work` gesendet, ein Ordner also nicht betreten. Das Prädikat wirkt an beiden Walker-Arten nach der Ignore-/Whitelist-Auswertung und verhindert das Betreten. Beide Walker-Arten sind im Einsatz (`grep.rs:88`, `search.rs:121` parallel; `grep.rs:362`, `search.rs:316`, `tree.rs:56` seriell).
- Git (Probe des Prüfers, Delta 3): ungetrackter Staging-Ordner → `git diff --cached` 0 Zeilen; nach externem `git add -A` → `1 A. … .terax-copy-x/report.txt` im Index, `git commit -m` ohne Pfadliste (`operations.rs:438-443`) nimmt ihn mit. Die App stagt nur Pfade aus dem gefilterten Status (`useSourceControlPanel.ts:716,776-784,834`); App-eigene Staging-Reste sind daher immer `? `-Einträge.

## 2. Entscheid

**Das Staging-Prädikat `is_staging_name` (MIG-14) ist die einzige Garantie der Staging-Sichtbarkeit. Es wirkt an jeder Primitive, mit der die App Dateisystem-Inhalt des Workspace aufzählt (jeder `WalkBuilder`, jedes Verzeichnis-Listing, jede Helper-Listing-Op, der Parser-Pfad für ungetrackte Git-Einträge), ohne Ausnahme und unabhängig davon, ob die Stelle `show_hidden`, `.hidden(true)` oder Ignore-Regeln nutzt. Die Garantie gilt für Aufzählungen, deren Wurzel außerhalb eines Staging-Ordners liegt. Der Git-Status filtert nur ungetrackte Einträge; Index-Einträge mit Staging-Segment bleiben sichtbar, damit ein Panel-Commit nie einen Pfad enthält, den das Panel nicht als gestagt zeigt.**

Herleitung (`derived`):

- BR-3 (Discovery Z.208, PM): „Ein Element erscheint im Ziel erst, wenn es vollständig kopiert ist (keine halben Kopien sichtbar, auch nicht bei Abbruch)". Objekt der Regel ist das von der App kopierte Element im Zielordner. Das bestimmt (1) die Klasse der Stellen: jede App-Aufzählung von Dateisystem-Inhalt, ohne Einschränkung auf eine Oberfläche (PM-Entscheid B3, Resolver-Entscheid 1, Dirigent E-1); (2) die Grenze F-2: „im Ziel" meint den Zielordner, nicht einen Pfad, in den der User selbst hineinwechselt; (3) die Grenze F-3: ein Index-Eintrag, den der User im Terminal gestagt hat, ist kein von der App kopiertes Element.
- Dirigent-Entscheid E-1 (Gate-Log 15:17:54), Begründung: der Rest „koennte mit Stage all versehentlich committet werden". Das Filtern von Index-Einträgen erzeugt genau diesen Fehler auf anderem Weg (unsichtbarer Commit, Probe des Prüfers). Die eigene Begründung des Entscheids bestimmt den Umfang: nur ungetrackte Einträge.
- User-Intent des Laufs: Sicherheits- und Datenintegrität vor Kosmetik. Ein Panel, das Index-Einträge verbirgt und sie trotzdem committet, verletzt Datenintegrität; ein sichtbarer Index-Eintrag mit Staging-Präfix ist Kosmetik.
- F-1 ist Messung, keine Abwägung: Die Ausnahme in SEC-4 und Sweep war eine falsche Tatsachenbehauptung über `ignore 0.4.32`; nach BR-3 und Resolver-Entscheid 1 (Inhalte unterhalb eines Staging-Ordners werden nie durchsucht) ist das Prädikat an `grep.rs` die einzige verbleibende Auflösung.
- Keine Alternative offen; kein PM-Review nötig.

Verworfen:

- Alle vier Eintragsarten filtern und die Folge „Panel-Commit enthält ausgeblendete Index-Einträge" annehmen (Alternative des Prüfers zu F-3): widerspricht der Begründung des E-1-Entscheids und der Integritäts-Priorität.
- SEC-4 um die Inhaltssuche eingrenzen (Alternative zu F-1): die vom PM in B3 verworfene Abschwächung.
- Die Wurzel einer Aufzählung ebenfalls sperren (Alternative zu F-2): kein BR verlangt es; die App zeigte an einem vom User gewählten Pfad etwas anderes als das Terminal; außerhalb des Feature-Zuschnitts. Bleibt Known Limitation (Abschnitt 5).
- `show_hidden`-Sweep als Klassifikator beibehalten und Ausnahmen erweitern: ist die Wurzel; jede Erweiterung der Ausnahmeliste wäre die nächste Instanz.

## 3. Bindende Anforderungen für die Umsetzung (WHAT)

Umsetzung in `architecture.md` und `gates/obligations.md` durch die nächste Korrekturrunde (Architekt). Artefakt-Sprache de, ohne em-dash, ohne Emoji. Zeilenangaben beziehen sich auf den Stand nach Delta 3 (`architecture.md` 713 Zeilen).

### A. Strukturregel (die Wurzel)

1. **SEC-4** (Z.207) formuliert die Regel über die Primitive, nicht über Mechanismen: Das Prädikat `is_staging_name` (MIG-14) ist die einzige Garantie; es wirkt an jeder Primitive, mit der die App Dateisystem-Inhalt des Workspace aufzählt: jeder `WalkBuilder` (`tree.rs:47`, `search.rs:103`, `search.rs:298`, `grep.rs:80`, `grep.rs:354`), jedes Verzeichnis-Listing (`tree.rs:167`, `:256`), jede Helper-Listing-Op (`ssh.rs:297`, `:316`, `:484`, `:518`), der Parser-Pfad für ungetrackte Git-Einträge (`parser.rs:62`); unabhängig von `showHidden`, `.hidden(true)` und Ignore-Regeln, lokal und SSH; Verweis MIG-73, MIG-74, MIG-75, MIG-76, MIG-19, Q&A #7, #28, #31. Begründung im Text: in `ignore 0.4.32` greift die Hidden-Regel nur ohne Ignore-/Whitelist-Treffer (`dir.rs:490`); das Prädikat wirkt nach dieser Auswertung und verhindert das Betreten (`walk.rs:1162,1177` seriell, `:1904,1927-1934` parallel). Geltungsbereich: Aufzählungen, deren Wurzel außerhalb eines Staging-Ordners liegt; die Wurzel wird nie gefiltert (`walk.rs:1150-1152`); steuert der User einen Pfad darin selbst an (cd im Terminal `useWorkspaceCwd.ts:103-108`, getippter Pfad `pathComplete.ts:36-46`), zeigt die App ihn wie das Terminal. Git: nur ungetrackte Einträge werden gefiltert; Invariante: ein Panel-Commit enthält nie einen Pfad, den das Panel nicht als gestagt zeigt. Der Satz „Ausnahmen ohne eigenes Prädikat: `fs_grep`, `fs_glob`, `fs_grep_interactive` lokal (`.hidden(true)` …)" entfällt ersatzlos. Notes: „bleibt auf der Platte; keine App-Aufzählung mit Wurzel außerhalb zeigt ihn (Baum, Suche, Inhaltssuche, Unterordner-Menü, Dateiliste, Git-Status), auch nicht bei `showHidden` oder einer Whitelist-Regel in `.gitignore`; sichtbar nur außerhalb (`ls -a`, `git status` im Terminal) oder nach eigenem Hineinwechseln".
2. **Risiko-Zeile „SSH: Staging-Rest"** (Z.517): Mitigation „Prädikat an jeder Aufzählungs-Primitive (SEC-4; MIG-73, MIG-74, MIG-75, MIG-76, MIG-19)" statt der Aufzählung von Oberflächen; Fallback „Rest liegt nur auf der Platte; keine App-Aufzählung mit Wurzel außerhalb zeigt ihn; User löscht ihn im Terminal (Q&A #7, #28, #31)".
3. **Sweep „Staging-Sichtbarkeit"** (Z.356) wird auf den Klassifikator Primitive umgestellt; `show_hidden` ist nur noch Kreuzprobe:
   - (a) `grep -rn "WalkBuilder::new" src-tauri/src` → genau 5 Stellen (`tree.rs:47`, `search.rs:103`, `search.rs:298`, `grep.rs:80`, `grep.rs:354`), jede wendet das Prädikat an, keine Ausnahme;
   - (b) `grep -rn "fs::read_dir(" src-tauri/src` → `tree.rs:167`, `:256` mit Prädikat; Ausnahmen mit Grund: `mutate.rs:198`, `ssh.rs:1172` (Rekursion über die vom User gewählte Kopierquelle, keine Aufzählung für den User), `history/mod.rs:76` (App-interner Verlauf außerhalb des Workspace), `test_bridge.rs:40` (dev-only Bridge);
   - (c) `grep -n "os.scandir(\|os.walk(" src-tauri/src/modules/ssh.rs` → 4 Stellen, jede wendet den Helper-Spiegel an (bei `os.walk` auf `dirnames` vor dem Abstieg und auf `filenames`);
   - (d) `grep -n "files.push" src-tauri/src/modules/git/parser.rs` → `:62` (`? `) mit Segment-Prädikat; `:44`, `:51`, `:57` ohne, Grund: Index-/HEAD-Zustand, Invariante aus SEC-4;
   - (e) Kreuzprobe `grep -rn "show_hidden\|showHidden" src-tauri/src/modules/fs src-tauri/src/modules/ssh.rs` → jede Auswertungsstelle liegt an einer Stelle aus (a) bis (c); `show_hidden`, `.hidden(…)` und Ignore-Regeln sind keine Garantie und begründen keine Ausnahme.
   - Gestrichen: Ausnahme `grep.rs:81,355 .hidden(true)`; Ausnahme `git_non_ignored_names` (bekommt das Prädikat, Anforderung 5). **F-4**: Begründung für `git_diff`/`git_commit_files` ersetzen durch „`git_diff` zählt keinen Dateisystem-Inhalt auf: ohne Pfad `git diff --cached` über den Index (`operations.rs:203-218`), ungetrackte Dateien nie; Index-Einträge werden nicht gefiltert (MIG-75), daher zeigt `git_diff` nichts, was das Panel nicht zeigt; `git_commit_files` liest aus Commits (`operations.rs:675-707`)".

### B. Migration Map

4. **MIG-14** (Z.289): Leser-Liste um MIG-76 ergänzen („einzige Quelle für MIG-73, MIG-74, MIG-75, MIG-76 und den Pin-Test aus MIG-19").
5. **MIG-73** (Z.348): Current ergänzen: `git_non_ignored_names` (`:46-54`, `.hidden(!show_hidden)`, kein Prädikat). Target ergänzen: der Walker in `git_non_ignored_names` wendet das Prädikat an (Staging-Namen sind nie in der Menge); Test: Repo mit `.gitignore` `*`/`!*/`, `show_hidden = true`, `.terax-copy-x` nicht in der Menge, `.hidden` enthalten. Bestehende Tests bleiben.
6. **MIG-74** (Z.349): Target: das Prädikat wirkt unabhängig von Ignore-/Whitelist-Regeln und `show_hidden`; Test ergänzen (Whitelist-Fall, OB-28): Wurzel mit `.terax-copy-x/src/report.txt` und Whitelist-Regel, die den Ordner trifft (`.gitignore` `*`/`!*/`/`!*.txt` im `git init`-Repo oder `.ignore` mit `!.terax-copy-*/`), `show_hidden = true`: `fs_search` `report` → kein Treffer; `fs_list_files` → `report.txt` nicht gelistet; Kontrolle: eine Datei außerhalb des Staging-Ordners wird gefunden.
7. **Neue MIG-76** `src-tauri/src/modules/fs/grep.rs`: Current: `search_tree` (`:80-88`, genutzt von `fs_grep` `:227` und `fs_grep_interactive` `:297`) und `fs_glob_impl` (`:354-361`) verlassen sich auf `.hidden(true)`; in `ignore 0.4.32` greift das nur ohne Ignore-/Whitelist-Treffer (`dir.rs:490`); Probe mit `.gitignore` `*`/`!*/`/`!*.txt` liefert `.terax-copy-x/src/report.txt`. Target: beide Walker wenden das Prädikat an (Staging-Ordner wird weder betreten noch geliefert, unabhängig von Ignore-Regeln); `.hidden(true)` bleibt für übrige Punkt-Namen; Tests im bestehenden Testmodul (Muster `:430-434`): Whitelist-Repo mit `.terax-copy-x/src/report.txt` (Inhalt trifft das Muster) → `search_tree` kein Treffer; `fs_glob_impl` `**/*.txt` → kein Treffer; Kontrolle: `src/other.txt` wird in beiden gefunden. Spalte: S3, SEC-4, Q&A #28. SSH-Zweig von `fs_grep_interactive` (`:278` → Helper `grep`) bleibt bei MIG-19.
8. **MIG-75** (Z.350): Target eingrenzen: nur `? `-Einträge (`:62`) werden gefiltert (Segment-Prädikat wie bisher); `1 `, `2 `, `u ` (`:44`, `:51`, `:57`) bleiben ungefiltert; Invariante im Target: ein Panel-Commit enthält nie einen Pfad, den das Panel nicht als gestagt zeigt. Tests: bestehende drei bleiben; neu: Index-Eintrag `1 A. N... 100644 100644 100644 <h> <h> .terax-copy-x/report.txt` → bleibt in der Liste (gestagt sichtbar); `2 `-Eintrag mit Staging-Segment und Ursprungs-Token gefolgt von einem normalen Eintrag → beide korrekt (Token-Ausrichtung). **F-7** entfällt damit als Hinweis.
9. **MIG-19** (Z.294): Current/Target um die Primitive ergänzen: `os.scandir` (`:297`, `:316`), `os.walk` (`:484`, `:518`; Spiegel wirkt auf `dirnames` vor dem Abstieg und auf `filenames`); Hinweis, dass der Helper keine Ignore-Semantik hat (kein Whitelist-Fall), der Pin-Test bleibt der eine Nachweis der Spiegelung. Übrige Inhalte unverändert.

### C. Wortlaut und Traceability

10. **Q&A #7** (Z.689): „keine App-Aufzählung zeigt ihn (…)" → „keine App-Aufzählung, deren Wurzel außerhalb liegt, zeigt ihn (Baum, Suche, Inhaltssuche, Unterordner-Menü, Dateiliste, Source-Control-Panel und Git-Dekoration), auch nicht mit ‚versteckte Dateien zeigen' und auch nicht bei einer Whitelist-Regel in `.gitignore`; wechselt der User selbst hinein, zeigt die App ihn wie das Terminal (Q&A #28)".
11. **Q&A #28** (Z.710): Recommendation: Prädikat an jeder Aufzählungs-Primitive, Stellen nach Primitive gelistet (Walker, Verzeichnis-Listing, Helper-Ops, ungetrackte Git-Einträge), Geltungsbereich Wurzel außerhalb; Decision: „ausgeblendet an jeder Aufzählungs-Primitive (Entscheidung des Dirigenten, erweitert nach D-1 und F-1; `gates/DECISION-gate1-staging-search.md`, `gates/DECISION-gate1-staging-search-2.md`)"; Alternatives ergänzen: „Verlass auf `.hidden(true)` oder Ignore-Regeln: in `ignore 0.4.32` hebt eine Whitelist-Regel die Hidden-Regel auf (F-1)"; Folge der Entscheidung bleibt (echter Ordner des Users mit Präfix erscheint in keiner App-Aufzählung mit Wurzel außerhalb).
12. **Q&A #31** (Z.713): Recommendation: „nur ungetrackte Einträge (`? `)"; Decision: „ausgeblendet für ungetrackte Einträge (Entscheidung des Dirigenten E-1, eingegrenzt nach F-3), MIG-75"; Alternatives: „alle vier Eintragsarten filtern: ein außerhalb der App gestagter Staging-Pfad (`git add -A` im Terminal) verschwände aus dem Panel und würde beim nächsten Panel-Commit unsichtbar mitcommittet (`operations.rs:438-443` Commit ohne Pfadliste); verworfen wegen Datenintegrität"; Folge der Entscheidung: „ein echter Ordner des Users mit dem Präfix fehlt im Git-Status der App nur, solange er ungetrackt ist; gestagte oder getrackte Pfade darin bleiben sichtbar".
13. **Traceability BR-3** (Z.613): „Prädikat an jeder Aufzählungs-Primitive (SEC-4; MIG-73, MIG-74, MIG-75, MIG-76, MIG-19), NFR-3".
14. **NFR-3** (Z.475, **F-5**): Measure: „mit `showHidden = true` und mit einer Whitelist-Regel in `.gitignore` findet weder Explorer-Baum, Explorer-Suche, Inhaltssuche, Unterordner-Menü, AI-Dateiliste, AI-`grep`/`glob` noch der Git-Status (Source-Control-Panel, Git-Dekoration, Änderungszahl) etwas im Staging (MIG-73, MIG-74, MIG-75, MIG-76, MIG-19; OB-21, OB-28, OB-29)".
15. **Research-Log**: Zeile Z.671 (**F-6**) präzisieren: „`fs_grep_interactive` (`useContentSearch.ts:31`) auf SSH über Helper-`grep` (`grep.rs:278`); AI-`grep`/`glob` (`native.ts:213,224`) auf SSH nicht verfügbar (`native.ts:158-166` `guardSsh`); lokal MIG-76". Neue Zeile: „2026-10-27 | Gate 1 Delta 3 | F-1: `ignore 0.4.32` `.hidden(true)` greift nur ohne Whitelist-Treffer (`dir.rs:490`), Probe mit `.gitignore` `*`/`!*/`/`!*.txt` → MIG-76, Sweep auf Aufzählungs-Primitive umgestellt; F-3: Git-Status filtert nur `? ` (MIG-75), Invariante Panel-Commit; F-2: Geltungsbereich Wurzel außerhalb; siehe `gates/DECISION-gate1-staging-search-2.md`".

### D. `gates/obligations.md`

16. **OB-21** anpassen: Auflage um die Inhaltssuche und um den Whitelist-Fall erweitern, Absolutaussage eingrenzen: „… weder im Explorer-Baum, in der Explorer-Suche, in der Inhaltssuche, im Unterordner-Menü der Statusleiste noch im Source-Control-Panel oder in der Explorer-Git-Dekoration; nach einem SSH-Abbruch bleibt ein Rest in keiner App-Aufzählung sichtbar, deren Wurzel außerhalb des Staging-Ordners liegt". Nachweis: „e2e lokal + SSH; zusätzlich Rest künstlich anlegen (auch in einem Git-Repo mit `.gitignore` `*`/`!*/`/`!*.txt`), Explorer-Suche nach dem Dateinamen und Inhaltssuche nach dem Dateiinhalt → kein Treffer, Unterordner-Menü ohne den Staging-Ordner, Source-Control-Panel ohne Eintrag, keine Git-Farbe". Quelle um „delta3 F-1, F-2" ergänzen.
17. **OB-28** (aus O-1): Whitelist-Probe als Rust-Test an jeder Walker-Stelle: Wurzel mit Whitelist-Regel, die den Staging-Ordner trifft (`.gitignore` `*`/`!*/`/`!*.txt` im `git init`-Repo; wo `.ignore(true)` gesetzt ist, genügt `.ignore` mit `!.terax-copy-*/`), und `.terax-copy-x/src/report.txt`: `search_tree` (über `fs_grep_interactive`) kein Treffer; `fs_glob_impl` `**/*.txt` kein Treffer; `fs_search` `report` mit `show_hidden = true` kein Treffer; `fs_list_files` nicht gelistet; `git_non_ignored_names` enthält `.terax-copy-x` nicht; je Fall eine Kontrolldatei außerhalb des Staging-Ordners, die gefunden wird. Nachweis: Rust-Tests in `grep.rs`, `search.rs`, `tree.rs`. Ziel-Schritt: implement, test. Quelle: delta3 O-1, F-1.
18. **OB-29** (aus F-3): Invariante Panel-Commit: nach `git add -A` im Terminal mit liegendem Staging-Rest zeigt das Source-Control-Panel `.terax-copy-x/report.txt` als gestagt; ein Panel-Commit enthält genau die als gestagt gezeigten Pfade; der ungetrackte Rest vor dem `git add` ist im Panel unsichtbar. Nachweis: Parser-Test (Index-Eintrag mit Staging-Segment bleibt, `? `-Eintrag fällt weg) und e2e im Scratch-Repo (Panel nach externem `git add -A`, Commit, `git show --stat`). Ziel-Schritt: implement, test, qa. Quelle: delta3 F-3.

Optional (Architekt entscheidet, nicht bindend): ein Quelltext-Wächtertest nach dem Muster von `eager-budget.test.ts`, der die Sweep-Kriterien (a) und (d) automatisiert prüft (jede `WalkBuilder::new`-Stelle trägt das Prädikat), damit künftige Walker nicht ohne Prädikat entstehen.

## 4. Betroffene Verträge

Kein Contracts-Ledger vorhanden. Betroffen sind nur Spec-Artefakte: `architecture.md` (Anforderungen 1 bis 15), `gates/obligations.md` (16 bis 18). `discovery.md` bleibt unverändert: BR-3 trägt die Regel und ihre Grenze („im Ziel") bereits; die Spur steht in Q&A #28 und #31 der Architektur. Kein Projekt-Code.

## 5. Abgrenzung

Kein Scope-Cut, keine Doc-Lücke: BR-3, PM-Entscheid B3, Resolver-Entscheid 1 und Dirigent-Entscheid E-1 (mit seiner Begründung) bestimmen die Auflösung vollständig; F-1 ist eine gemessene Tatsache über `ignore 0.4.32`.

Known Limitation (F-2, aus BR-3 „im Ziel" abgeleitet, kein Scope-Cut): Wechselt der User selbst in einen Staging-Ordner (cd im Terminal, getippter Pfad), zeigen Explorer-Baum, Suche, Inhaltssuche und Unterordner-Menü dessen Inhalt wie das Terminal. Die Wurzel einer Aufzählung wird nie gefiltert; BR-3 bleibt erfüllt, weil unter dem Zielnamen nie etwas Halbes erscheint.

Abschluss der Klasse: Mit dem Klassifikator „Aufzählungs-Primitive" und dem Sweep ohne mechanismus-basierte Ausnahmen gibt es keine Stelle mehr, die eine Verbergungs-Annahme statt des Prädikats trägt. Ein künftiger Delta-Lauf kann nur noch eine neue Primitive finden (die der Sweep (a) bis (d) mechanisch aufdeckt), nicht eine weitere Instanz der heutigen Klasse.
