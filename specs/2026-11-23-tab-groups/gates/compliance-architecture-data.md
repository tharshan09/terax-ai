# Gate 1: Architecture Compliance, Perspektive `data`

| Kopf | Wert |
|---|---|
| Spec | `specs/2026-11-23-tab-groups` |
| Geprüft | `architecture.md`, `discovery.md`, `codebase-scan.md` |
| Clickdummy | keiner |
| bindings / reconcile | keine (Gate 1c entfällt) |
| Perspektive | `data`: gespeicherte Datei je Space, Speicherformat, Abwärts-/Aufwärtskompatibilität, Prüfung beim Laden, Schreib-Auslöser, Datentypen |
| Code-Stand | Worktree `tab-groups`, HEAD `e2e117c` |
| Gemessen an | `src/modules/spaces/lib/{store,serialize,validate,useSpacePersistence,useSpacesBoot,useSpaces,spaceColor}.ts`, `serialize.test.ts`, `validate.test.ts`, `src/modules/spaces/components/InlineRename.tsx`, `src/modules/tabs/lib/useTabs.ts:67-71,594-598`, `src/app/App.tsx:328-339`, Git-Historie (`v0.8.0`, 9 Fassungen von `serialize.ts`) |
| Prüfdatum | 2026-11-23 |

## Skript-Ergebnis (Arch-Precheck, übernommen)

| Check | Ergebnis |
|---|---|
| Gesamt | PASS |
| AR-1 | PASS 19 h2 konform |
| AR-1d | PASS |
| AR-2 | PASS 79 definierte IDs, 135 referenziert |
| AR-3 | PASS 23 Anker aufgelöst |
| AR-4 | PASS 18 INV-Zeilen |
| AR-5 | PASS 19 Testnamen gefunden |
| AR-6 | PASS 10 Zeilen mit Version |
| AR-7 | WARN 6 NEW-Zeilen ohne Zielpfad (note) |
| AR-8 | PASS 3 Dispositionen |
| AR-9 | SKIP keine bindings.md |
| AR-10 | PASS 15 MIG-Zeilen |
| AR-11 | PASS 0 automatische |
| AR-12 | PASS kein neuer Fachbereich |
| AR-13 | PASS |
| AR-Q | PASS |

## Summary

| Klasse | Anzahl |
|---|---|
| decision | 0 |
| refuted | 1 |
| fix | 2 |
| obligation | 7 |
| note | 2 (+ AR-7 aus dem Skript) |

**Verdict:** FAILED (wegen R-1, `refuted`)

## Check A: Feature Mapping (Daten-Felder)

| Item | Evidenz in architecture.md | Status |
|---|---|---|
| DF-1 `group_name` | Schema `name` Text, VAL-1, SEC-4 | PASS |
| DF-2 `group_color` | Schema `color` Ganzzahl, VAL-2, SVC-5 | PASS |
| DF-3 `group_collapsed` | Schema `collapsed`, fehlt = aufgeklappt | PASS |
| DF-4 `group_space` | Schlüssel `state:<spaceId>` (DB-1), VAL-4 | PASS |
| DF-5 `group_members` | `group` am gespeicherten Tab, Reihenfolge = Tab-Reihenfolge | PASS |
| DF-6 `group_position` | ergibt sich aus der Tab-Reihenfolge (Abschnitt „Relationships") | PASS |
| BR-19, FL-13 Neustart | SVC-15, MIG-8 bis MIG-12 | PASS |
| BR-20 aufgeklappt starten | MIG-12, SVC-9 | PASS (Auflage O-6) |
| EP-4 fehlende private Mitglieder | SVC-15, SEC-3, Relationships | PASS (Auflage O-3) |

## Check B: Constraint Mapping

| Constraint | Architektur-Antwort | Status |
|---|---|---|
| Name höchstens 32 Zeichen, getrimmt (BR-6) | VAL-1 (Eingabe + Laden), MIG-13 (Höchstlänge in `InlineRename`, heute ohne `maxLength`: `InlineRename.tsx:35-52`) | PASS (Auflage O-4: Zähleinheit) |
| Farbe aus der Palette (DF-2) | Index 0..7, VAL-2 | PASS (Auflage O-5) |
| Medien, Rate Limits, Timeouts | nicht vorhanden (lokale App, keine Netz-Schnittstelle) | N/A |

## Check C: Realistic Data

| Punkt | Evidenz | Status |
|---|---|---|
| C1 Schema-Quellen | Keine Migrationen, keine Datenbank. Schema = TypeScript-Typen `SpaceState` (`store.ts:17-20`), `SerializedTab` (`serialize.ts:25-41`), Prüfung von Hand (`validate.ts:18-24`), Speicher `LazyStore("terax-spaces.json", autoSave 500)` (`store.ts:22,28`) | PASS |
| C2 Externe APIs | keine; die Datei schreibt und liest nur die App selbst (SEC-1) | N/A |
| C3 Empfehlungs-Matrix | JSON-Werte ohne Spaltenlänge; Nutzereingabe `name` mit UI-Grenze 32 und Kürzen beim Laden; Indizes als Ganzzahl | PASS (siehe Data Type Verdicts) |

## Check D: Completeness + Dependencies

| Item | Evidenz | Status |
|---|---|---|
| Externe APIs | keine | N/A |
| Speicher-Abhängigkeit | Tauri-Store-Plugin, bestehend über `store.ts:1,28`; kein neuer Schlüssel, keine neue Datei | PASS |
| Versionen gegen Zielumgebung | Perspektive `runtime` | nicht in dieser Prüfmenge |
| Format-Kompatibilität alt → neu | Beide Felder optional; `isSpaceState` verlangt nur `tabs` und `activeTabIndex` (`validate.ts:18-24`) | PASS |
| Format-Kompatibilität neu → alt | `hydrateTab` baut jeden Tab Feld für Feld, kein Übernehmen fremder Felder (`serialize.ts:168-254`); in allen 9 Fassungen von `serialize.ts` gab es nie ein `...s,` (`git log -S'...s,'` leer); `v0.8.0` übernahm den Zustand ohne Prüfung (`v0.8.0:store.ts:44`, `v as SpaceState`) | PASS |

## Check F: Migration Completeness (Daten-Zeilen)

| Item | Evidenz | Status |
|---|---|---|
| Datei-Zeilen | MIG-8 `serialize.ts`, MIG-9 `store.ts`, MIG-10 `validate.ts`, MIG-11 `useSpacePersistence.ts`, MIG-12 `useSpacesBoot.ts`: Dateien, keine Verzeichnisse | PASS |
| Zielmuster testbar | MIG-11 benennt Momentaufnahme und Änderungs-Vergleich, deren Fehlen gemessen ist (`useSpacePersistence.ts:61-66` vergleicht nur `JSON.stringify(serialized)` und `activeTabIndex`; Effekt-Abhängigkeiten `:85` ohne Gruppen) | PASS |
| Sweep über `src/modules/spaces` | Treffer `useSpacesBoot.ts:120`, `:134`, `useSpacePersistence.ts:55`, `SpaceSwitcher.tsx:198,277,386,388`. `:120` und `:55` sind Einzelvergleiche. `:134` leitet zwar eine Liste ab, aber für die Wahl des aktiven Tabs beim Start (keine der vier Kategorien) und bleibt daher stehen | PASS (Auflage O-6 sichert den Indexbezug) |

## Check E: Pattern Consistency (Daten-Bereich)

| Empfehlung (Scan) | Umsetzung | Status |
|---|---|---|
| EXTEND `serializeTabs` / `hydrateTabs` / `SpaceState` | MIG-8, MIG-9, SVC-15 | PASS (Name siehe X-1) |
| EXTEND `validate.ts`, `useSpacePersistence.ts`, `useSpacesBoot.ts` | MIG-10, MIG-11, MIG-12 | PASS |
| REUSE `SPACE_COLORS` | `color` als Index wie `SpaceMeta.color` (`store.ts:11-12`) | PASS |
| Anti-Slop-Dispositionen 1 bis 3 | betreffen Streifen-Ableitung und Space-Wechsel (Perspektive `code`) | nicht in dieser Prüfmenge |

## Check E2: Bindings Coverage

N/A: kein `bindings_path` und kein `reconcile_path`.

## Check E3: Existing-Behavior Invariants (Daten-Bereich)

| INV | Messung | Status |
|---|---|---|
| INV-9 | `isSerializableTab` lässt private Terminals und andere Arten aus (`serialize.ts:67-79`); der Test `serialize.test.ts:28-54` gibt ein normales Terminal, ein privates Terminal, einen git-diff-Tab und einen Editor hinein und erwartet `["terminal","editor"]` | PASS, covered bestätigt |
| INV-10 | `serialize.test.ts:77-111` prüft Split-Struktur, `cwd` `/b` des aktiven Leaf, `activeLeafId`, `blocks`, `customTitle`; `:113-133` prüft `tmuxSession` an Tab und Leaf und den Titel | PASS, covered bestätigt |
| INV-18 | `useSpacesBoot.ts:119-123` legt nur für den **aktiven** Space ein Terminal an (`if (!restored.some((t) => t.spaceId === active))`). Andere Spaces ohne gespeicherte Tabs bleiben beim Start leer; ein späterer Wechsel dorthin legt auch keines an (`App.tsx:334-335`: `if (inSpace.length === 0) return;`) | **refuted** (R-1) |
| INV-1 bis INV-8, INV-11 bis INV-17 | Belege in Tab-Logik, Leiste, App (Perspektive `code`/`ui`) | nicht in dieser Prüfmenge |

## Data Type Verdicts

| Feld | Arch-Typ | Evidenz | Verdict |
|---|---|---|---|
| `SpaceState.groups` | Liste, optional | Zusatzfeld wird von `isSpaceState` toleriert (`validate.ts:18-24`, Test `validate.test.ts:34-36`) | PASS |
| Gruppen-Eintrag `name` | Text, optional, ≤ 32 nach Trim | Nutzereingabe; heute keine Längengrenze im Eingabefeld (`InlineRename.tsx:35-52`), MIG-13 ergänzt sie; die JSON-Datei hat keine Längengrenze | PASS mit Auflage O-4 (Zähleinheit, Kürzen ohne zerrissenes Zeichen) |
| Gruppen-Eintrag `color` | Ganzzahl, Index 0..7 | `SPACE_COLORS` hat 8 Einträge (`spaceColor.ts:5-14`); das Bestandsmuster `accentFor` prüft nur den Bereich, nicht die Ganzzahligkeit (`spaceColor.ts:16-19`), `SPACE_COLORS[1.5]` wäre `undefined` | PASS mit Auflage O-5 |
| Gruppen-Eintrag `collapsed` | Wahrheitswert, optional | fehlt = aufgeklappt | PASS (Fallback für Nicht-Boolean siehe X-2) |
| `SerializedTab.group` | Ganzzahl, Position in `groups` | Verweis am Tab übersteht übersprungene kaputte Tab-Einträge (`serialize.ts:281-287`), weil er nicht an der Tab-Position hängt | PASS mit Auflagen O-3 und X-2 (Indexbasis) |
| `TabGroup.id` (Laufzeit) | Text, je Sitzung eindeutig | wird nicht gespeichert; Tab-Ids sind je Start neu (`serialize.test.ts:195` „allocates fresh, unique, monotonic ids") | PASS mit Auflage O-7 |
| `Tab.groupId` (Laufzeit) | optional an `TabBase` | `TabBase` trägt heute `spaceId`, `cold` (`useTabs.ts:67-71`) | PASS |

## Bestands-Behauptungen (Prüfmenge `data`)

| # | Behauptung (architecture.md) | Beleg | Verdikt |
|---|---|---|---|
| B-1 | DB-1: Datei `terax-spaces.json`, Schlüssel `state:<spaceId>` | `store.ts:22,25-26` | bestätigt |
| B-2 | MIG-9: `SpaceState` mit `tabs`, `activeTabIndex` | `store.ts:17-20` | bestätigt |
| B-3 | Space-Palette hat 8 Farben, `spaceColor.ts:5` | `spaceColor.ts:5-14` (8 Einträge) | bestätigt |
| B-4 | `groups` optional, „alte Dateien bleiben lesbar" | `validate.ts:18-24` verlangt kein `groups` | bestätigt |
| B-5 | Constraint Rückschritt: ältere Prüfung beachtet nur `tabs`/`activeTabIndex`, unbekannte Felder werden überlesen | `validate.ts:18-24`; `v0.8.0:store.ts:44` (ohne Prüfung); `hydrateTab` ohne Übernahme fremder Felder in allen 9 Fassungen | bestätigt |
| B-6 | „die Gruppen gehen dabei verloren" | Die ältere Version setzt den Vergleichsstand je Space auf `json: ""` (`useSpacePersistence.ts:34-41`), deshalb schreibt der erste Flush jeden Space mit Tabs neu, ohne `groups` (`:59-70`) | bestätigt |
| B-7 | Research Log: Speichern vergleicht je Space die gespeicherten Tabs als Text; reine Gruppen-Änderungen lösen ohne Erweiterung nichts aus | `useSpacePersistence.ts:61-66` (Vergleich), `:85` (Abhängigkeiten nur `tabs, activeId, activeSpaceId`) | bestätigt |
| B-8 | Research Log: Prüfung beachtet nur `tabs` und `activeTabIndex` (`validate.ts:18`) | `validate.ts:18-24` | bestätigt |
| B-9 | MIG-10: `validate.ts` prüft heute `tabs`, `activeTabIndex` | wie B-8 | bestätigt |
| B-10 | MIG-11: heute wird geschrieben, wenn sich die gespeicherten Tabs eines Space ändern | `useSpacePersistence.ts:61-70`; zusätzlich bei geändertem `activeTabIndex` | bestätigt (unvollständig, ohne Folgen) |
| B-11 | MIG-12: Boot stellt Tabs je Space her und wählt den aktiven Tab per Index | `useSpacesBoot.ts:96-100`, `:134-137` | bestätigt |
| B-12 | MIG-8: `serialize.ts` schreibt und lädt Tabs | `serialize.ts:114-121`, `:274-290` | bestätigt |
| B-13 | SVC-15: „`serializeSpace` / `hydrateSpace`-Erweiterung (in `serialize.ts`)" | Beide Namen gibt es in `src` nicht (grep: 0 Treffer); bestehend sind `serializeTabs` (`serialize.ts:114`) und `hydrateTabs` (`:274`), aufgerufen von `useSpacePersistence.ts:52` und `useSpacesBoot.ts:99` | widerlegt als Bestand, fix X-1 |
| B-14 | INV-9 covered durch „drops private terminals and transient kinds" | `serialize.test.ts:28-54` prüft den Inhalt | bestätigt |
| B-15 | INV-10 covered durch zwei Round-Trip-Tests | `serialize.test.ts:77-111`, `:113-133` prüfen Struktur, `cwd`, aktiven Leaf, tmux | bestätigt |
| B-16 | INV-18: „Ein Space ohne gespeicherte Tabs bekommt beim Start ein neues Terminal" | `useSpacesBoot.ts:119-123` nur für den aktiven Space; `App.tsx:334-335` | **widerlegt** (R-1) |
| B-17 | Relationships: Gruppen-Eintrag wird „mit dem Space entfernt" | `useSpaces.ts:111` → `deleteSpaceData` → `store.delete(state:<id>)` (`store.ts:65-67`) | bestätigt |
| B-18 | Reihenfolge und Position ergeben sich aus der Reihenfolge der gespeicherten Tabs | `serializeTabs` behält die Eingabe-Reihenfolge (`serialize.ts:114-121`); Flush gruppiert in Array-Reihenfolge (`useSpacePersistence.ts:44-49`) | bestätigt |
| B-19 | Trade-off: Tab-Ids sind ohnehin je Start neu | `hydrateTab` vergibt `id: allocId()` (`serialize.ts:195,212,224,233,243`); Test `serialize.test.ts:195` | bestätigt |
| B-20 | Error Handling: verworfene Felder heute ohne Log-Eintrag | `store.ts:44-48` verwirft still; `serialize.ts:285-287` `catch {}` | bestätigt |
| B-21 | SEC-5: Datei gilt als nicht vertrauenswürdig, Prüfung von Hand | `store.ts:44,46` filtert mit `isSpaceMeta`/`isSpaceState`; keine Schema-Bibliothek in `validate.ts` | bestätigt |
| B-22 | Data Flow: Speichern je Space verzögert wie heute | `DEBOUNCE_MS = 3000` (`useSpacePersistence.ts:8`), Flush bei blur/hidden/beforeunload (`:87-101`) | bestätigt |

Self-Check: 22 erhoben = 22 Verdikte am Beleg (20 bestätigt, 2 widerlegt: B-13, B-16) + 0 NICHT GEMESSEN. Außerhalb dieser Prüfmenge: die Versionsangabe des Tauri-Store-Plugins gegen die installierte Fassung (`runtime`), `TabBase` als Code-Ort (`code`).

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|---|---|---|---|---|---|---|---|---|---|
| R-1 | refuted | E3 | `architecture.md` (INV-18) | „Ein Space ohne gespeicherte Tabs bekommt beim Start ein neues Terminal" | `useSpacesBoot.ts:119-123`: `if (!restored.some((t) => t.spaceId === active))` legt nur im **aktiven** Space ein Terminal an; `App.tsx:334-335` legt beim späteren Wechsel in einen leeren Space keines an | code | Datei mit zwei Spaces A (aktiv, Tabs) und B (`state:B` mit `tabs: []` oder ohne Schlüssel): nach dem Start hat B keinen Tab; ist B aktiv, hat B genau ein neues Terminal | INV-18 umformulieren: „Ist der beim Start aktive Space ohne gespeicherte Tabs, bekommt er ein neues Terminal; andere Spaces bleiben beim Start ohne Tab." Danach EP-4 für einen nicht aktiven Space mit nur privaten Gruppen-Mitgliedern danach ausrichten (der Space ist nach dem Start leer, wie heute) | nein |
| X-1 | fix | E / Bestand | `architecture.md` (SVC-15, MIG-8) | „`serializeSpace` / `hydrateSpace`-Erweiterung (in `src/modules/spaces/lib/serialize.ts`)" | grep `serializeSpace\|hydrateSpace` in `src`: 0 Treffer; bestehend `serializeTabs` (`serialize.ts:114`), `hydrateTabs` (`:274`), aufgerufen von `useSpacePersistence.ts:52`, `useSpacesBoot.ts:99` | code | – | SVC-15: „neu `serializeSpace`/`hydrateSpace` in `serialize.ts`, gebaut auf den bestehenden `serializeTabs`/`hydrateTabs`; Aufrufer `useSpacePersistence.ts` und `useSpacesBoot.ts` stellen darauf um" | nein |
| X-2 | fix | C / Kohärenz | `architecture.md` (VAL-2, VAL-3, Schema Details) | VAL-3: „`groups` muss eine Liste gültiger Einträge sein … Ungültiges macht nur die betroffenen Tabs lose"; VAL-2: „sonst erste Farbe" | VAL-2 behält einen Eintrag mit falscher Farbe, VAL-3 erklärt ungültige Einträge für verworfen; was einen Eintrag ungültig macht und worauf der Index `group` zeigt (rohe Liste oder Liste nach dem Aussortieren), steht nirgends. Ein Aussortieren vor dem Auflösen verschiebt alle folgenden Verweise | artifact | – | VAL-3 festlegen: Eintrag ungültig nur, wenn er kein Objekt ist; je Feld nachsichtig: `name` kein Text → leer, sonst VAL-1; `color` → VAL-2; `collapsed` nur `true` = eingeklappt. `group` zeigt auf die Position in der gespeicherten Liste, so wie sie in der Datei steht; kein ganzzahliger Index in `[0, groups.length)` oder Ziel ungültig → Tab lose | nein |
| O-1 | obligation | C / VAL-3 | – | „die Tabs des Space werden in jedem Fall geladen" | `store.ts:46` übernimmt einen Space-Zustand nur, wenn `isSpaceState` wahr ist; sonst fehlt der ganze Space samt Tabs | code | `state:<id>` mit `groups: "x"`, `groups: [null, 5]` oder `group: "a"` am Tab: alle Tabs des Space werden geladen, betroffene Tabs sind lose; `isSpaceState` liefert für diese Zustände `true` | Gruppen-Prüfung außerhalb von `isSpaceState` (oder dort ohne Einfluss auf das Ergebnis) · Nachweis: Ladetest mit beschädigten Gruppen-Daten · implement | nein |
| O-2 | obligation | C / MIG-11 | – | „Schreibt auch, wenn sich nur Gruppen-Daten ändern (Name, Farbe, Klappzustand)" | Effekt-Abhängigkeiten `useSpacePersistence.ts:85`, Vergleich `:61-66`, Flush bei Verlassen über `latest.current` (`:28-29`, `:89`) | code | Nur umbenennen, umfärben oder einklappen: spätestens 3 s danach und sofort bei blur/hidden/beforeunload enthält `state:<id>` den neuen Wert; ohne Änderung an Tabs oder Gruppen wird `saveState` nicht aufgerufen | Gruppen in Snapshot, `latest`, Abhängigkeiten und Vergleichstext · Nachweis: Hook-Test mit Zeitgeber plus QA „umbenennen, einklappen, beenden, starten" · implement, qa | nein |
| O-3 | obligation | C / SEC-3, EP-4 | – | „Ein Gruppen-Eintrag ohne gespeichertes Mitglied wird nicht geschrieben" | `isSerializableTab` (`serialize.ts:67-79`) | code | Space mit Gruppe A (nur private Terminals) vor Gruppe B (gespeicherte Tabs): die Datei enthält weder A noch ihren Namen; die Mitglieder von B verweisen auf den Index von B in der geschriebenen Liste und laden als B | Index beim Schreiben über die gefilterte Liste vergeben · Nachweis: Hin-und-zurück-Test · implement | nein |
| O-4 | obligation | B / VAL-1 | – | „höchstens 32 Zeichen, Längeres wird beim Eingeben nicht angenommen und beim Laden gekürzt" | `InlineRename.tsx:35-52` ohne Grenze; `maxLength` eines Eingabefelds zählt UTF-16-Einheiten, `String.prototype.slice` ebenso und kann ein Ersatzpaar trennen | code | Eingabe und Laden zählen gleich; ein gespeicherter Name mit Emoji an Stelle 32 lädt ohne einzelnes Ersatzzeichen (kein `\uD83D` am Ende); ein aus der Eingabe gespeicherter Name ändert sich beim Laden nicht | gleiche Zähleinheit an beiden Stellen, Kürzen nicht mitten in einem Ersatzpaar · Nachweis: Ladetest mit Emoji-Grenzfall · implement | nein |
| O-5 | obligation | C / VAL-2 | – | „Muss eine Farbe der Space-Palette bezeichnen; sonst erste Farbe" | `SPACE_COLORS` 8 Einträge (`spaceColor.ts:5-14`); `accentFor` prüft nur den Bereich (`:16-19`) | code | `color` `1.5`, `-1`, `8`, `"2"`, `null` oder fehlend → Gruppe lädt mit Farbe 0; nie `undefined` als Farbwert im Kopf | Prüfung mit `Number.isInteger` und Bereich · Nachweis: Ladetest · implement | nein |
| O-6 | obligation | F / BR-20 | – | „Stellt zusätzlich Gruppen her … BR-20 über SVC-9" | `activeTabIndex` zählt alle speicherbaren Tabs des Space (`useSpacePersistence.ts:56-58`); Boot löst ihn über alle Tabs des Space auf (`useSpacesBoot.ts:134-136`) | code | Gespeicherter aktiver Tab steht hinter einer eingeklappten Gruppe oder in ihr: nach dem Start ist genau dieser Tab aktiv; steht er in einer eingeklappten Gruppe, ist sie aufgeklappt, alle anderen behalten ihren Klappzustand | Boot-Auswahl bleibt auf der Liste aller Tabs des Space, nicht auf SVC-1 · Nachweis: Boot-/Hin-und-zurück-Test · implement | nein |
| O-7 | obligation | C / DTO | – | „`id` (Text, je Sitzung eindeutig)" | gespeichert ist nur der Index je Space (Schema Details); zwei Spaces haben beide Index 0 | artifact | Zwei Spaces mit je einer Gruppe an Index 0: nach dem Start zwei verschiedene Gruppen-Ids; Mitglieder von Space A erscheinen nie in der Gruppe von Space B | Ids beim Laden je Space neu vergeben · Nachweis: Ladetest mit zwei Spaces · implement | nein |
| N-1 | note | C / Neustart | – | „Tabs in eingeklappten Gruppen laufen unverändert weiter" (BR-8) | Geladene Tabs sind `cold: true` (`serialize.ts:198`), also nicht eingehängt, bis sie aktiv werden (`useTabs.ts:69`) | code | – | Nach dem Neustart bleiben Mitglieder einer eingeklappten Gruppe kalt, bis die Gruppe aufgeklappt und der Tab aktiv wird; das Sammelzeichen zeigt für sie nichts. Das entspricht dem heutigen Verhalten von Hintergrund-Tabs, ist aber beim Anwendungsfall „Messungen parken" spürbar. Eventuell in QA/Release-Notiz erwähnen | nein |
| N-2 | note | C / BR-20 | – | „War beim Beenden der aktive Tab in einer eingeklappten Gruppe, startet diese Gruppe aufgeklappt" | Ist der aktive Tab privat, behält der Flush den alten `activeTabIndex` (`useSpacePersistence.ts:54-59`) | code | – | Der gespeicherte Index kann dann auf ein Mitglied einer eingeklappten Gruppe zeigen; diese klappt beim Start auf, obwohl der Nutzer zuletzt woanders war. Hingenommen oder beim Start einen sichtbaren Tab vorziehen; nur Hinweis | nein |
