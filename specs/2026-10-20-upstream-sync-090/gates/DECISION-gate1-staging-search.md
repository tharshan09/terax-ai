# DECISION: Staging-Präfix in jeder App-Aufzählung verborgen (Gate 1, Durchgang 2)

| Feld | Wert |
|---|---|
| Datum | 2026-10-27 |
| Kategorie | `derived` |
| Anlass | Gate 1 (Architecture Compliance) nach Korrekturrunde und Delta-Lauf weiter FAILED: D-1 `refuted` (CONFIRMED), X-A..X-D `fix`, O-1/O-2 `obligation`, N-4 `note` derselben Mechanik |
| Ebene | Spec-Artefakt `architecture.md` (Phase Grundlage, kein `build-plan.md`); kein Projekt-Code |
| Betroffene Slices | Slice 3 (Einfügen + Finder-Benennung: SEC-4, MIG-19, MIG-73, neue MIG-74), Slice 1 (Kern-Picks: MIG-5, MIG-6, VAL-8, API-4, Test Strategy), Slice 5 nur Wortlaut (Q&A #24) |
| Vorige DECISION | keine |

## 1. Wurzel-Trace

### Befunde über beide Runden

| Runde | Befund | Mechanik |
|---|---|---|
| 1 | B3 (`decision`, CONFIRMED): `tree.rs:204`, Helper `read_dir` `ssh.rs:299` listen `.terax-copy-*` bei `showHidden = true` | Punkt-Namen-Filter wertet nur `show_hidden` aus |
| 1 → Korrektur | PM-Entscheid (Gate-Log 14:42:14): „Der Explorer blendet `.terax-copy-*` immer aus, lokal und per SSH, auch bei eingeschalteter Anzeige versteckter Dateien" | umgesetzt als MIG-73 (`fs_read_dir`) und MIG-19 (Helper `read_dir`) |
| 2 | D-1 (`refuted`, CONFIRMED): `ExplorerSearch.tsx:73,115-119` reicht `showHidden` an `fs_search`; `fs/search.rs:104` `.hidden(!show_hidden)`, `filter_entry :111-120` nur `PRUNE_DIRS`; Helper `search` `ssh.rs:487,490` ebenso; Rest nach SSH-Abbruch bleibt (SVC-3, Q&A #7) | dieselbe Mechanik an einer weiteren Stelle |
| 2 | N-4 (`note`): `list_subdirs` `tree.rs:271`, Helper `ssh.rs:318`, Aufrufer `CwdBreadcrumb.tsx:187` (Statusleiste) | dieselbe Mechanik an einer dritten Stelle |

### Die eine Wurzel

Die Architektur hat den PM-Entscheid „Explorer blendet das Staging-Präfix immer aus" als Eigenschaft **eines Commands** (`fs_read_dir` lokal, Helper `read_dir` remote) formuliert, nicht als Eigenschaft **der Regel „versteckter Name"**, die im Backend an mehreren Stellen ausgewertet wird. Jede Stelle, die `show_hidden` auswertet, ist eine eigene Instanz derselben Lücke. Die Korrekturrunde hat die Instanz (Baum) geschlossen, nicht die Klasse.

Messung aller Auswertungsstellen von `show_hidden`/`showHidden` im Backend (Stand `68d45d0`):

| Stelle | Oberfläche | `showHidden` vom User steuerbar | Staging sichtbar heute | abgedeckt durch |
|---|---|---|---|---|
| `fs/tree.rs:204` `fs_read_dir` | Explorer-Baum (`useFileTree.ts:133`), Pfad-Vervollständigung (`pathComplete.ts:43`) | ja | ja | MIG-73 |
| Helper `read_dir` `ssh.rs:299` | dito, SSH | ja | ja | MIG-19 |
| `fs/search.rs:104,111-120` `fs_search` | Explorer-Suche (`ExplorerSearch.tsx:115`) | ja (`:73`) | ja, auch Inhalt des Ordners | **keine** → D-1 |
| Helper `search` `ssh.rs:486-490` | Explorer-Suche, SSH | ja | ja, auch Inhalt | **keine** → D-1 |
| `fs/tree.rs:271` `list_subdirs` | Unterordner-Menü der Statusleiste (`CwdBreadcrumb.tsx:187`) | ja (`:180`) | ja | **keine** → N-4 |
| Helper `list_subdirs` `ssh.rs:318` | dito, SSH | ja | ja | **keine** → N-4 |
| `fs/search.rs:299,312` `fs_list_files` | AI-Dateiliste (`useWorkspaceFiles.ts:36`, lokal only) | nein (Aufrufer sendet kein `showHidden` → `false`) | nein | keine; heute nur durch den Aufrufer sicher |
| Helper `grep` `ssh.rs:520-522` | Inhaltssuche, SSH (`ssh::grep` sendet kein `showHidden` → `false`) | nein | nein | keine; heute nur durch den Aufrufer sicher |
| `fs/grep.rs:81,355` | Inhaltssuche lokal, `.hidden(true)` fest | nein | nein | fest verborgen |

Test der Wurzel: Erklärt sie jeden Fund? B3 (Baum), D-1 (Suche), N-4 (Unterordner-Menü) sind drei Auswertungsstellen derselben Regel; die beiden Textbehauptungen aus D-1 (SEC-4 „erscheint nie im Explorer", Risiko-Zeile „Suche findet ihn nur während des Kopierens") sind die Folge, dass die Architektur die Regel nur am Baum festgemacht hat. Ja, die Wurzel erklärt alle Funde.

X-A bis X-D sind davon unabhängige, mechanische Korrekturen (Kohärenz MIG-6/Upstream-Test, nicht existenter `flow`-Testweg, falsche rAF-Begründung, falsche Zeilenangabe). Sie blockieren nicht (Klasse `fix`), werden aber in derselben Korrekturrunde erledigt, damit Gate 1 nicht am nächsten Delta-Lauf erneut hängt. O-1/O-2 sind Auflagen und gehören nach `obligations.md`.

## 2. Entscheid

**Das Staging-Präfix `.terax-copy-` gilt in jeder Aufzählung des Workspace-Inhalts durch die App als immer verborgen, unabhängig von `showHidden`, lokal und SSH: Explorer-Baum, Explorer-Suche, Unterordner-Menü der Statusleiste, Dateiliste. Inhalte unterhalb eines Staging-Ordners werden nie aufgezählt und nie durchsucht. Ein Prädikat in Rust (Quelle `copy.rs`), gespiegelt im Helper mit Pin-Test, wird an jeder Stelle verwendet, die `show_hidden` auswertet.**

Herleitung (`derived`):
- BR-3 (Discovery, PM): „keine halben Kopien sichtbar, auch nicht bei Abbruch" — ohne Einschränkung auf eine Oberfläche.
- PM-Entscheid B3 (Gate-Log): Explorer blendet immer aus; die Alternative „Sichtbarkeit hinnehmen und BR-3 auf ‚nie unter dem Zielnamen' abschwächen" wurde ausdrücklich verworfen. Die Explorer-Suche ist Teil des Explorers; das Unterordner-Menü ist eine App-Aufzählung, in der nach SSH-Abbruch ein Rest dauerhaft sichtbar wäre, was BR-3 verletzt.
- Q&A #28 trägt die Folge schon („ein echter Ordner des Users mit diesem Präfix erscheint ebenfalls nicht im Explorer"); sie weitet sich auf die Suche aus, ohne neue Abwägung.
- Keine Alternative offen: die Dokumente determinieren die Auflösung. Kein PM-Review nötig.

Verworfen: SEC-4/BR-3 auf „nie im Baum" eingrenzen (Alternative aus D-1). Das wäre genau die vom PM verworfene Abschwächung.

## 3. Bindende Anforderungen für die Umsetzung (WHAT)

Umsetzung in `architecture.md` durch die nächste Korrekturrunde (Architekt). Alles in Artefakt-Sprache de, ohne em-dash, ohne Emoji.

### A. D-1 und N-4 (die Wurzel)

1. **SEC-4** (Z. 207): Die Regel wird von „das Explorer-Listing lokal und SSH" auf „jede Aufzählung des Workspace-Inhalts durch die App (Explorer-Baum, Explorer-Suche, Unterordner-Menü der Statusleiste, Dateiliste), lokal und SSH" erweitert; Inhalte unterhalb eines Staging-Ordners werden nie aufgezählt oder durchsucht; Verweis auf MIG-73, MIG-74 (neu), MIG-19, Q&A #28. Notes: „erscheint in keiner App-Aufzählung (Baum, Suche, Unterordner-Menü); sichtbar nur außerhalb (z.B. `ls -a` im Terminal)".
2. **Risiko-Zeile „SSH: Staging-Rest"** (Z. 514): Mitigation wie SEC-4; der Fallback-Satz „Explorer-Suche kann ihn während eines laufenden Kopierens finden, danach ist er weg" entfällt ersatzlos (er ist in beiden Teilen falsch: die Suche fand ihn bei `showHidden` dauerhaft, und nach der Regel findet sie ihn nie). Fallback: „Rest liegt nur auf der Platte, in keiner App-Aufzählung; User löscht ihn bei Bedarf im Terminal (Q&A #7, #28)".
3. **Neue MIG-74** `src-tauri/src/modules/fs/search.rs`: Current: `fs_search` (`:104` `.hidden(!show_hidden)`, `filter_entry :111-120` nur `PRUNE_DIRS`) und `fs_list_files` (`:299`, `:312`) blenden Punkt-Namen nur ohne `show_hidden` aus. Target: beide überspringen Einträge mit dem Staging-Präfix samt Inhalt immer, auch bei `show_hidden = true` (Prädikat aus `copy.rs`, eine Quelle, dieselbe wie MIG-73); Test im bestehenden Testmodul (Muster `reg_for`, `:405`): Wurzel mit `.terax-copy-x/report.pdf` und `.env`, `show_hidden = true`, Suche `report` → kein Treffer, Suche `env` → `.env`; `fs_list_files` analog. Spalte: S3, SEC-4, Q&A #28.
4. **MIG-73 erweitern** um `list_subdirs` (`tree.rs:271`): dieselbe Regel, Test: `.terax-copy-x` und `.hidden` als Unterordner, `show_hidden = true` → `.hidden` gelistet, `.terax-copy-x` nicht.
5. **MIG-19 erweitern**: Helper `search` (`ssh.rs:486-490`: Staging-Ordner wird nicht betreten und nie als Treffer geliefert) und Helper `list_subdirs` (`:318`) wenden den Helper-Spiegel des Präfixes an; Helper-`grep` (`:520-522`) ebenfalls, damit die Regel nicht vom Aufrufer abhängt (heute sendet `ssh::grep` kein `showHidden`). Tests gegen lokales python3 mit `showHidden = true`: `search` findet `report` unter `.terax-copy-x/` nicht, `list_subdirs` listet `.terax-copy-x` nicht. Der bereits geplante Pin-Test (Helper-Präfix == Rust-Präfix) bleibt der eine Nachweis für die Spiegelung. Zeilenangaben nachziehen (N-5): `OPS` `:557`, Testmuster `:1422`, `copy` `:1202-1215`, `remote_exists` `:1145`.
6. **Sweep-Kriterium** (Migration Map) neuer Punkt „Staging-Sichtbarkeit": `grep -rn "show_hidden\|showHidden" src-tauri/src/modules/fs src-tauri/src/modules/ssh.rs` → jede Auswertungsstelle wendet das Staging-Prädikat an (Rust aus `copy.rs`, Helper-Spiegel); Walks mit fest verborgenen Punkt-Namen (`grep.rs:81,355` `.hidden(true)`) bleiben so und brauchen kein Prädikat.
7. **Q&A #28** Recommendation/Answer um die Suche und das Unterordner-Menü erweitern; **Q&A #7** Satz „der Explorer zeigt ihn nie" → „keine App-Aufzählung zeigt ihn (Baum, Suche, Unterordner-Menü, auch nicht mit ‚versteckte Dateien zeigen', Q&A #28)"; **Traceability BR-3** (Z. 610) und **NFR-3** (Z. 472, Measure: Explorer-Suche mit `showHidden` findet nichts im Staging) nachziehen. Research-Log-Zeile „2026-10-27 | Gate 1 Delta | D-1/N-4: Staging-Präfix an allen `show_hidden`-Stellen, siehe `gates/DECISION-gate1-staging-search.md`".
8. **obligations.md OB-21** erweitern: mit `showHidden = true` erscheint `.terax-copy-*` auch in der Explorer-Suche und im Unterordner-Menü der Statusleiste nie, lokal und SSH; nach einem SSH-Abbruch bleibt der Rest in keiner App-Aufzählung sichtbar (e2e: Rest künstlich anlegen, Suche nach dem Dateinamen → kein Treffer).

### B. X-A bis X-D (mechanisch, Zielzustand aus dem Delta-Report)

9. **X-A, MIG-6 + VAL-8**: MIG-6 Target ergänzen: die Upstream-Assertion `kind("64:ff9b:1::808:808") == IpKind::Private` im Test `nat64_addresses_are_classified_by_their_ipv4` wird zu `IpKind::Loopback` (Kommentar: /48-Kandidat `0.0.0.0`). VAL-8 präzisieren: in `64:ff9b:1::/48` gewinnt die gefährlichste Kandidaten-Klasse, praktisch mindestens Loopback (wirkungsgleich mit Private, `net.rs:150-163`).
10. **X-B, MIG-5 + Test Strategy + VAL-8**: MIG-5 Target: Redirect-Prüfung als reine Funktion `redirect_decision` nach Upstream-Form (`11343a1:net/clients.rs:135-173`) aus der Closure in `build_safe_client` (`net.rs:262-296`) herausgelöst, die Closure ruft sie, Klammer-Trim darin (Functional Core / Thin Shell, Constraints-Tabelle). Test Strategy „AI-HTTP-Proxy / DNS": „über den bestehenden `flow`-Test-Weg in `net.rs`" ersetzen durch „über die reine Funktion `redirect_decision` (MIG-5) ohne HTTP-Server; Upstream-Test aus `11343a1` plus Fork-Fälle aus MIG-5/MIG-6". VAL-8 Nachweis entsprechend.
11. **X-C, Q&A #24**: Begründung ersetzen: „`motion` ist keine Abhängigkeit; `usePresence.ts` hält Knoten per `setTimeout` (`:13-24`) für CSS-Keyframes gemountet (`:5-9`), die Bewegung selbst ist CSS und pausiert mit SVC-9". Entscheid „nur CSS" bleibt.
12. **X-D, API-4**: „beim Verbindungs-Pinning (`net.rs:282`)" → „beim Verbindungs-Pinning (`net.rs:158-163`) und bei der Redirect-Prüfung (`net.rs:281-289`)".
13. Optional, wenn ohnehin an der Stelle (N-1, N-2): Scope Z. 50 zweite Klammer-Stelle als Portierung aus `net/clients.rs:157` kennzeichnen; MIG-62 Fork-Gruppe `xterm` (eager, Prio 100) ausdrücklich nennen.

### C. Auflagen O-1/O-2 nach `obligations.md`

14. **OB-25** (aus O-1): SVC-13-Positionen je Prefix-Länge durch Tests belegt: `64:ff9b:1:a9fe:a9:fe00::` (/48) → BlockedMetadata, `64:ff9b:1:a9:fe:a9fe::` (/56) → BlockedMetadata, `64:ff9b:1:0:a9:fea9:fe00:0` (/64) → BlockedMetadata, `64:ff9b:1::808:808` → Loopback. Nachweis: Rust-Tests in `net/ip.rs`. Ziel-Schritt: implement, test. Quelle: delta O-1.
15. **OB-26** (aus O-2): Tests an `redirect_decision`: `[::ffff:169.254.169.254]` und `[fd00:ec2::254]` mit `allow_private = true` → Stop; `[::1]` ohne Opt-in → Stop, mit Opt-in → Follow. Nachweis: Rust-Tests in `net.rs`. Ziel-Schritt: test. Quelle: delta O-2.

## 4. Betroffene Verträge

Kein Contracts-Ledger vorhanden. Betroffen sind nur Spec-Artefakte: `architecture.md` (Anforderungen 1-13), `gates/obligations.md` (8, 14, 15). `discovery.md` bleibt unverändert: BR-3 trägt die Regel bereits; die Spur zur Erweiterung steht in Q&A #28 der Architektur.

## 5. Abgrenzung

Kein Scope-Cut, keine Doc-Lücke: BR-3 und der PM-Entscheid B3 bestimmen die Auflösung vollständig. Die AI-Pfade (`fs_list_files`, AI-`fs_read_dir`, `fs_grep`) sind heute nur durch ihre Aufrufer (`showHidden` nicht gesetzt bzw. `.hidden(true)`) sicher; das Prädikat an `fs_list_files` (Anforderung 3) und Helper-`grep` (Anforderung 5) macht die Regel aufruferunabhängig, ohne neues Verhalten für AI-Features zu bauen.
