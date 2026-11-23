# Feature: Tab-Gruppen

**Epic:** --
**Issue:** -- _(Issues sind im Fork `tharshan09/terax-ai` deaktiviert; Rückverfolgung über diesen Ordner und den PR.)_
**Status:** Ready
**Mockups:** nicht erstellt — Bild-Mockups sind im Projekt nicht eingerichtet; die Gestaltung wurde an einer Textskizze entschieden (Q&A 10)
**Clickdummy:** nicht erstellt — Bedienmuster ist aus Chrome/Warp bekannt und per Skizze entschieden (Q&A 14)

Vorgänger-Notiz: `specs/open-topics.md`, Punkt F2 „Tab-Gruppen, ein- und ausklappbar". Stand `main` bei Erstellung: `9ce4d6b`.

---

## Problem & Solution

> No requirement IDs — context

**Problem:**
- Der Nutzer arbeitet mit vielen parallelen Sessions (mehr als 10 Claude-Code-Sessions). Die Tab-Leiste ist flach; zwischen Space und Tab gibt es keine Ordnungsebene.
- Sessions, deren eigentliche Arbeit fertig ist, die aber noch Messungen laufen lassen, stehen weiter zwischen den aktiven Tabs und kommen beim Durchschalten in die Quere.
- Wer solche Sessions immer wieder gemeinsam prüfen will, muss sie jedes Mal einzeln in der Leiste suchen.

**Solution:**
- Tabs lassen sich von Hand zu benannten, farbigen Gruppen zusammenfassen, die in der Leiste ein- und ausklappbar sind.
- Eine eingeklappte Gruppe macht Platz, wird beim Durchschalten übersprungen und zeigt am Kopf, ob darin eine Session arbeitet oder auf Eingabe wartet.

**Business Value:**
- Weniger Suchen und weniger Fehlgriffe bei vielen Sessions; geparkte Sessions bleiben mit einem Klick erreichbar.
- Die Ordnung übersteht Neustart und Update der App.

---

## Scope & Boundaries

> No requirement IDs — context

| In Scope |
|----------|
| Gruppen von Hand anlegen, benennen, einfärben, auflösen |
| Ein- und Ausklappen in der Tab-Leiste, Kopf mit Name, Anzahl, Sammelzeichen |
| Zuordnen und Entfernen per Rechtsklick-Menü und per Ziehen; ganze Gruppe per Ziehen am Kopf umsortieren |
| Durchschalten überspringt eingeklappte Gruppen; gezielter Sprung klappt auf |
| Gruppe schließen (mit Rückfrage), Gruppe in anderen Space verschieben |
| Gruppen samt Klappzustand über den Neustart behalten |
| Alle Tab-Arten gruppierbar |
| Einträge in der Befehlspalette |

| Out of Scope |
|--------------|
| Kachel-Übersicht mehrerer Sessions gleichzeitig |
| Automatische Gruppen nach Status |
| Mission Control nach Gruppen gegliedert |
| Eigene Tastenkürzel für Gruppen-Aktionen |
| Neuer Tab entsteht direkt in einer Gruppe |
| Verschachtelte Gruppen, Gruppen über mehrere Spaces, gespeicherte geschlossene Gruppen zum Wiederöffnen |
| Neuer Schalter in den Einstellungen |

---

## Current State Reference

> No requirement IDs — context

- Spaces: jeder Tab gehört zu genau einem Space; die Leiste zeigt nur die Tabs des aktiven Space.
- Tab-Leiste: Umsortieren per Ziehen in eine Lücke; Tab auf Tab ziehen ergibt einen Split (Grenze 4 Panes); Pane auf die Leiste ziehen ergibt einen eigenen Tab.
- Rechtsklick-Menü an Terminal-Tabs mit „Rename" und „Close"; andere Tab-Arten haben kein Rechtsklick-Menü.
- Agent-Status je Session: `working`, `waiting`, `idle`; Zeichen am Tab (dort gilt: arbeitet schlägt wartet).
- Hintergrund-Tabs laufen weiter; nichts wird beim Verstecken angehalten.
- Wechseln: nächster/vorheriger Tab, Tab nach Nummer, Zwei-Finger-Wischen, Tab-Umschalter; Sprung zu einer Session aus Benachrichtigung, Glocke und Mission Control.
- Schließen-Schutz: Rückfrage bei laufendem Vordergrundprozess im Terminal und bei ungespeicherten Dateien.
- Neustart: Tabs, Splits, eigene Titel und tmux-Zuordnung werden je Space wiederhergestellt; private Tabs werden nicht gespeichert.
- Verschieben eines einzelnen Tabs in einen anderen Space; hat ein Space keinen Tab mehr, entsteht dort ein neues Terminal.
- Farbpalette der Spaces.

---

## UI Patterns

> No requirement IDs — context

### Reused Patterns

| Pattern Type | Component | Usage in this Feature |
|--------------|-----------|----------------------|
| Rechtsklick-Menü | `src/components/ui/context-menu` (heute in `src/modules/tabs/TabBar.tsx`) | Gruppen-Einträge am Tab, neues Menü am Gruppen-Kopf |
| Inline-Umbenennen | `src/modules/spaces/components/InlineRename.tsx`, Tab-Umbenennen in `TabBar.tsx` | Gruppenname im Kopf bearbeiten |
| Farbpalette | `src/modules/spaces/lib/spaceColor.ts` | Farben der Gruppen |
| Status-Zeichen | `src/modules/tabs/TabActivityIndicator.tsx` | Sammelzeichen am eingeklappten Kopf |
| Schließen-Rückfrage | Schließen-Dialoge in `src/app/App.tsx` | Rückfrage „Gruppe schließen" |
| Zieh-Lücken der Leiste | `src/modules/tabs/lib/tabStripGap.ts` | Beitreten/Verlassen per Ziehen |
| Befehlspalette | `src/modules/command-palette/commands.ts` | Drei neue Einträge |

### New Patterns

| Pattern Type | Description | Rationale |
|--------------|-------------|-----------|
| Gruppen-Kopf | Farbiges Element in der Leiste vor den Tabs einer Gruppe; klickbar, ziehbar, mit Rechtsklick-Menü | Eine Ebene zwischen Space und Tab gibt es bisher nicht |
| Farblinie | Durchgehende Linie in Gruppenfarbe unter Kopf und Tabs einer aufgeklappten Gruppe | Zeigt die Zugehörigkeit, ohne die Markierung des aktiven Tabs zu schwächen |

---

## User Flow

1. FL-1: Rechtsklick auf einen Tab ohne Gruppe -> „Add to new group" -> an der Stelle des Tabs entsteht eine Gruppe mit diesem Tab, nächster freier Farbe und offenem Namensfeld im Kopf.
2. FL-2: Name eintippen, Enter -> Name steht im Kopf. Esc oder leeres Feld -> Gruppe bleibt ohne Namen.
3. FL-3: Rechtsklick auf einen weiteren Tab -> „Add to group" -> Untermenü listet die Gruppen des Space (Farbpunkt + Name) -> Auswahl -> der Tab wird letztes Mitglied der Gruppe.
4. FL-4: Tab in die Lücke zwischen zwei Tabs einer Gruppe ziehen -> der Tab tritt der Gruppe an dieser Stelle bei.
5. FL-5: Klick auf den Kopf einer aufgeklappten Gruppe -> die Tabs der Gruppe verschwinden aus der Leiste; der Kopf zeigt Farbpunkt, Name, Anzahl der Tabs und, falls zutreffend, das Sammelzeichen.
6. FL-6: Durchschalten (nächster/vorheriger Tab, Tab nach Nummer, Wischen, Tab-Umschalter) -> eingeklappte Gruppen werden übersprungen.
7. FL-7: Benachrichtigung, Glocke oder Mission Control springt zu einer Session in einer eingeklappten Gruppe -> die Gruppe klappt auf, der Tab wird aktiv.
8. FL-8: Klick auf den Kopf einer eingeklappten Gruppe -> die Gruppe klappt auf; der aktive Tab bleibt derselbe.
9. FL-9: Rechtsklick auf einen Tab in einer Gruppe -> „Remove from group" -> der Tab steht lose direkt hinter der Gruppe.
10. FL-10: Rechtsklick auf den Kopf -> Menü mit „Rename group", „Change color", „Ungroup", „Move group to space", „Close group".
11. FL-11: „Close group" -> läuft nichts und ist nichts ungespeichert, schließen alle Tabs der Gruppe sofort; sonst erscheint eine Rückfrage für die ganze Gruppe.
12. FL-12: „Move group to space" -> Untermenü listet die anderen Spaces -> Auswahl -> die Gruppe steht am Ende der Leiste des Ziel-Space.
13. FL-13: App neu starten -> Gruppen sind mit Name, Farbe, Mitgliedern, Reihenfolge und Klappzustand wieder da.

**Error Paths:**
- EP-1: Die Gruppe mit dem aktiven Tab wird eingeklappt -> aktiv wird der nächste sichtbare Tab rechts der Gruppe, sonst der nächste links; gibt es im Space keinen sichtbaren Tab, öffnet sich ein neues Terminal außerhalb der Gruppen.
- EP-2: Rückfrage „Close group" wird abgebrochen -> kein Tab wird geschlossen, die Gruppe bleibt unverändert.
- EP-3: Der letzte Tab verlässt eine Gruppe (schließen, entfernen, herausziehen, verschieben, zu einem Split zusammenlegen) -> die Gruppe verschwindet ohne Hinweis.
- EP-4: Nach dem Neustart fehlen Mitglieder einer Gruppe (private Tabs) -> die Gruppe erscheint mit den übrigen Tabs; ist keiner übrig, erscheint sie nicht.
- EP-5: „Move group to space" leert den Herkunfts-Space -> dort entsteht wie heute ein neues Terminal.
- EP-6: Es gibt nur einen Space -> „Move group to space" ist ausgegraut.
- EP-7: Im Space gibt es keine Gruppe (oder nur die eigene des Tabs) -> „Add to group" ist ausgegraut.

---

## UI Layout & Context

> No requirement IDs — context

### Screen: Tab-Leiste mit Gruppen
**Position:** Tab-Leiste im Kopf des Fensters, je Space.
**When:** Immer; Gruppen erscheinen, sobald eine angelegt ist.

**Layout:**
- Reihenfolge von links: lose Tabs und Gruppen gemischt in der Reihenfolge des Nutzers, danach der Knopf für neue Tabs.
- Aufgeklappte Gruppe: Kopf (Farbpunkt, Name), direkt dahinter ihre Tabs; eine durchgehende Linie in Gruppenfarbe unter Kopf und Tabs.
- Eingeklappte Gruppe: nur der Kopf (Farbpunkt, Name, Anzahl, Sammelzeichen).

```
Aufgeklappt:
 [● Messungen] [ bench-a ][ bench-b ][ bench-c ]  [ api ][ web ]  +
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Eingeklappt:
 [● Messungen 3 ◐]  [ api ][ web ]  +
```

### Screen: Rückfrage „Gruppe schließen"
**Position:** Dialog über dem Fenster, im Stil der bestehenden Schließen-Rückfragen.
**When:** „Close group", wenn in mindestens einem Tab der Gruppe etwas läuft oder ungespeichert ist.

**Layout:**
- Titel: „Close {n} tabs?"
- Text: „{m} of them still have a running process or unsaved changes."
- Knöpfe: „Cancel", „Close group".

---

## UI Components & States

| ID | Element | Type | Location | States | Behavior |
|----|---------|------|----------|--------|----------|
| UI-1 | `group_header` | Leisten-Element | Tab-Leiste, vor den Tabs der Gruppe | `expanded`, `collapsed`, `collapsed_working`, `collapsed_waiting`, `renaming`, `drag_source`, `drop_target` | Klick klappt um. Rechtsklick öffnet UI-4. Doppelklick startet Umbenennen. Ziehen verschiebt die ganze Gruppe. Zeigt aufgeklappt: Farbpunkt, Name. Zeigt eingeklappt: Farbpunkt, Name, Anzahl der Tabs, Sammelzeichen. Ohne Namen: nur Farbpunkt (eingeklappt zusätzlich Anzahl und Sammelzeichen). Tooltip: Name und „{n} tabs". |
| UI-2 | `group_line` | Linie | Unter Kopf und Tabs einer aufgeklappten Gruppe | `visible`, `hidden` (eingeklappt) | Gruppenfarbe; keine Interaktion. |
| UI-3 | `group_aggregate_indicator` | Status-Zeichen | Im eingeklappten Kopf, rechts der Anzahl | `none`, `working`, `waiting` | `waiting`, sobald mindestens eine Session der Gruppe auf Eingabe wartet; sonst `working`, sobald mindestens eine arbeitet; sonst nichts. Aussehen wie die bestehenden Zeichen am Tab. |
| UI-4 | `group_header_menu` | Rechtsklick-Menü | Am Gruppen-Kopf | `open`, `closed` | Einträge in dieser Reihenfolge: „Rename group", „Change color" (Untermenü UI-6), „Ungroup", „Move group to space" (Untermenü: andere Spaces mit Avatar und Name), Trenner, „Close group". |
| UI-5 | `tab_group_menu_items` | Menü-Einträge | Rechtsklick-Menü jedes Tabs, alle Tab-Arten | `ungrouped`, `grouped` | Lose: „Add to new group", „Add to group" (Untermenü: Gruppen des Space mit Farbpunkt und Name, namenlose als „Unnamed group"). In Gruppe: „Add to new group", „Add to group" (ohne die eigene), „Remove from group". Terminal-Tabs behalten „Rename" und „Close" darunter; andere Tab-Arten bekommen das Menü neu, nur mit den Gruppen-Einträgen. |
| UI-6 | `group_color_picker` | Untermenü | In UI-4 unter „Change color" | `open`, `closed` | Zeigt alle Farben der Space-Palette als Punkte; die aktuelle ist markiert; Klick setzt die Farbe sofort. |
| UI-7 | `group_name_input` | Eingabefeld | Im Gruppen-Kopf | `editing`, `idle` | Enter oder Fokusverlust speichert; Esc verwirft. Öffnet sich von selbst nach FL-1. |
| UI-8 | `group_close_dialog` | Dialog | Über dem Fenster | `open`, `closed` | Texte siehe Screen „Rückfrage"; „Close group" schließt alle Tabs der Gruppe, „Cancel" und Esc schließen nur den Dialog. |
| UI-9 | `strip_drop_marker` | Einfüge-Marke | Tab-Leiste während des Ziehens | `outside_group`, `inside_group`, `on_collapsed_header` | Marke in Gruppenfarbe, wenn die Lücke innerhalb einer Gruppe liegt; neutrale Marke außerhalb; eingeklappter Kopf wird hervorgehoben, wenn ein Tab darüber liegt. |
| UI-10 | `palette_group_commands` | Befehle | Befehlspalette | `enabled`, `hidden` | „Add tab to new group" (immer), „Remove tab from group" (nur wenn der aktive Tab in einer Gruppe ist), „Collapse/expand group" (nur wenn der aktive Tab in einer Gruppe ist; wirkt auf diese Gruppe). |

---

## Feature State Machine

### States Overview

| ID | State | UI | Available Actions |
|----|-------|----|--------------------|
| ST-1 | `ungrouped` | Tab steht lose in der Leiste | In neue Gruppe, in bestehende Gruppe (Menü oder Ziehen) |
| ST-2 | `expanded` | Kopf, Tabs und Farblinie sichtbar | Einklappen, umbenennen, Farbe ändern, auflösen, verschieben, schließen, Tabs hinzufügen/entfernen, Gruppe umsortieren |
| ST-3 | `collapsed` | Nur Kopf mit Name, Anzahl, Sammelzeichen | Aufklappen, umbenennen, Farbe ändern, auflösen, verschieben, schließen, Tab auf den Kopf ziehen, Gruppe umsortieren |
| ST-4 | `renaming` | Namensfeld im Kopf offen | Speichern, verwerfen |
| ST-5 | `close_confirm` | Rückfrage-Dialog offen | Bestätigen, abbrechen |
| ST-6 | `removed` | Gruppe existiert nicht mehr | -- |

### Transitions

| ID | Current State | Trigger | UI Feedback | Next State | Business Rules |
|----|---------------|---------|-------------|------------|----------------|
| TR-1 | `ungrouped` | `tab_group_menu_items` -> „Add to new group" | Gruppe erscheint an der Stelle des Tabs, Namensfeld offen | `renaming` | BR-1, BR-5 |
| TR-2 | `renaming` | `group_name_input` -> Enter / Fokusverlust / Esc | Name im Kopf bzw. unverändert | Zustand vor dem Umbenennen (`expanded` oder `collapsed`) | BR-6 |
| TR-3 | `ungrouped` | „Add to group" oder Ziehen in eine Gruppe | Tab steht in der Gruppe, Farblinie reicht bis zu ihm | `expanded` oder `collapsed` (Zustand der Zielgruppe bleibt) | BR-2, BR-11, BR-12 |
| TR-4 | `expanded` | `group_header` -> Klick | Tabs verschwinden, Kopf zeigt Anzahl und Sammelzeichen | `collapsed` | BR-8, BR-9 |
| TR-5 | `collapsed` | `group_header` -> Klick | Tabs und Farblinie erscheinen | `expanded` | Aktiver Tab bleibt |
| TR-6 | `collapsed` | Gezielter Sprung zu einer Session der Gruppe | Gruppe klappt auf, Tab wird aktiv | `expanded` | BR-10 |
| TR-7 | `expanded` / `collapsed` | `group_header_menu` -> „Rename group" oder Doppelklick auf den Kopf | Namensfeld offen | `renaming` | -- |
| TR-8 | `expanded` / `collapsed` | `group_color_picker` -> Farbe | Kopf und Linie wechseln die Farbe | unverändert | -- |
| TR-9 | `expanded` / `collapsed` | `group_header_menu` -> „Ungroup" | Kopf und Linie verschwinden, Tabs bleiben an ihrer Stelle und sind sichtbar | `removed` | Tabs bleiben offen |
| TR-10 | `expanded` / `collapsed` | `group_header_menu` -> „Close group", nichts läuft | Alle Tabs der Gruppe schließen | `removed` | BR-15 |
| TR-11 | `expanded` / `collapsed` | `group_header_menu` -> „Close group", etwas läuft oder ist ungespeichert | Dialog erscheint | `close_confirm` | BR-15 |
| TR-12 | `close_confirm` | `group_close_dialog` -> „Close group" | Alle Tabs der Gruppe schließen | `removed` | BR-15 |
| TR-13 | `close_confirm` | `group_close_dialog` -> „Cancel" / Esc | Dialog schließt | Zustand vor dem Dialog | -- |
| TR-14 | `expanded` / `collapsed` | `group_header_menu` -> „Move group to space" -> Space | Gruppe verschwindet aus der Leiste und steht am Ende der Leiste des Ziel-Space; der aktive Space wechselt nicht | unverändert (im Ziel-Space) | BR-16 |
| TR-15 | `expanded` / `collapsed` | Letzter Tab verlässt die Gruppe | Kopf und Linie verschwinden | `removed` | BR-4 |
| TR-16 | `expanded` | „Remove from group" oder Tab aus der Gruppe ziehen | Tab steht lose; Farblinie endet vor ihm | `expanded` oder `removed` (bei letztem Tab) | BR-4, BR-11 |

---

## Garantie

> No requirement IDs — context

keine

---

## Business Rules

- BR-1: Eine Gruppe gehört zu genau einem Space.
- BR-2: Ein Tab ist in höchstens einer Gruppe; Zuordnen zu einer anderen Gruppe entfernt ihn aus der bisherigen.
- BR-3: Die Tabs einer Gruppe stehen in der Leiste immer zusammenhängend direkt hinter ihrem Kopf; kein loser Tab und keine andere Gruppe kann dazwischen stehen. Gruppen sind nicht verschachtelbar.
- BR-4: Eine Gruppe ohne Tab existiert nicht: verlässt der letzte Tab die Gruppe, verschwindet sie.
- BR-5: Eine neue Gruppe bekommt die erste Farbe der Space-Palette, die im selben Space noch keine Gruppe trägt; sind alle vergeben, beginnt die Palette von vorn.
- BR-6: Der Gruppenname ist freiwillig, höchstens 32 Zeichen, führende und abschließende Leerzeichen werden entfernt. Namen müssen nicht eindeutig sein.
- BR-7: Jeder neu entstehende Tab (neues Terminal, geöffnete Datei, Vorschau, Git- und Diff-Ansichten) ist lose. Würde er nach der heutigen Platzierung innerhalb einer Gruppe landen, steht er stattdessen direkt hinter dieser Gruppe.
- BR-8: Tabs in eingeklappten Gruppen laufen unverändert weiter; Einklappen hält nichts an und schließt nichts.
- BR-9: Durchschalten (nächster/vorheriger Tab, Tab nach Nummer, Zwei-Finger-Wischen, Tab-Umschalter) läuft nur über sichtbare Tabs; „Tab nach Nummer" zählt nur sichtbare Tabs.
- BR-10: Jeder gezielte Sprung zu einem Tab in einer eingeklappten Gruppe (Benachrichtigung, Glocke, Mission Control, Öffnen einer bereits offenen Datei) klappt die Gruppe auf.
- BR-11: Beim Ziehen entscheidet die Ziel-Lücke über die Zugehörigkeit: Lücke zwischen zwei Tabs einer Gruppe oder zwischen Kopf und erstem Tab = Mitglied dieser Gruppe; jede andere Lücke = lose. Die Lücke hinter dem letzten Tab einer Gruppe zählt als außerhalb. Dasselbe gilt für einen Pane, der per Ziehen auf die Leiste zu einem eigenen Tab wird.
- BR-12: Ein Tab, der auf den Kopf einer eingeklappten Gruppe gezogen wird, wird ihr letztes Mitglied; die Gruppe bleibt eingeklappt. War er der aktive Tab, gilt EP-1.
- BR-13: Tab auf Tab ziehen ergibt weiterhin einen Split, auch über Gruppengrenzen; der Ziel-Tab behält seine Zugehörigkeit.
- BR-14: Ziehen am Kopf verschiebt die Gruppe als Block; sie kann nur vor oder hinter losen Tabs und anderen Gruppen landen, nie innerhalb einer anderen Gruppe.
- BR-15: „Close group" stellt höchstens eine Rückfrage für die ganze Gruppe, nicht eine je Tab. Sie erscheint, wenn mindestens ein Tab nach den bestehenden Regeln des Schließen-Schutzes eine Rückfrage auslösen würde; `{n}` ist die Anzahl der Tabs, `{m}` die Anzahl der Tabs mit Laufendem oder Ungespeichertem.
- BR-16: „Move group to space" nimmt Name, Farbe, Reihenfolge der Tabs und Klappzustand mit; die Gruppe steht am Ende der Leiste des Ziel-Space. Der aktive Space wechselt nicht; war der aktive Tab in der Gruppe, gilt EP-1.
- BR-17: Ein einzelner Tab, der in einen anderen Space verschoben wird, verlässt seine Gruppe.
- BR-18: Gruppen folgen ihren Tabs, wenn ein Space entfernt wird: wandern die Tabs in einen anderen Space, bleibt die Gruppe dort erhalten; werden sie geschlossen, verschwindet sie.
- BR-19: Gruppen überstehen den Neustart mit Name, Farbe, Mitgliedern, Reihenfolge, Position in der Leiste und Klappzustand. Tabs, die heute nicht gespeichert werden (private Tabs), fehlen danach auch in der Gruppe.
- BR-20: War beim Beenden der aktive Tab in einer eingeklappten Gruppe, startet diese Gruppe aufgeklappt.
- BR-21: Das Sammelzeichen einer Gruppe: wartet schlägt arbeitet (bewusst umgekehrt zum Zeichen am einzelnen Tab, weil die eingeklappte Gruppe zeigen soll, ob der Nutzer gebraucht wird). Ruhige Sessions und Tabs ohne Agent tragen nichts bei.
- BR-22: Lose Tabs bleiben dauerhaft erlaubt; es gibt keine Pflicht zur Gruppe und keine Obergrenze für Gruppen oder Mitglieder.
- BR-23: Sichtbare Texte der Oberfläche sind Englisch wie der Rest der App.

---

## Data

| ID | Field | Required | Validation | Notes |
|----|-------|----------|------------|-------|
| DF-1 | `group_name` | No | max. 32 Zeichen, getrimmt | Leer erlaubt (BR-6) |
| DF-2 | `group_color` | Yes | Farbe aus der Space-Palette | Vorbelegung nach BR-5 |
| DF-3 | `group_collapsed` | Yes | ja/nein | Neu angelegt: nein |
| DF-4 | `group_space` | Yes | bestehender Space | BR-1 |
| DF-5 | `group_members` | Yes | mindestens 1 Tab, geordnet | BR-3, BR-4 |
| DF-6 | `group_position` | Yes | Platz in der Leiste relativ zu losen Tabs und anderen Gruppen | BR-14 |

---

## Trigger-Inventory

Terax hat kein Nutzungs-Tracking; alle Zeilen bleiben bewusst ohne Signal.

| ID | Entry Point | Trigger | Signal today | Signal after | Notes |
|----|-------------|---------|--------------|--------------|-------|
| TG-1 | Rechtsklick-Menü Tab | „Add to new group" | none | none — deliberate | -- |
| TG-2 | Rechtsklick-Menü Tab | „Add to group" -> Gruppe | none | none — deliberate | -- |
| TG-3 | Rechtsklick-Menü Tab | „Remove from group" | none | none — deliberate | -- |
| TG-4 | Gruppen-Kopf | Klick (ein-/ausklappen) | none | none — deliberate | -- |
| TG-5 | Gruppen-Kopf | Doppelklick / „Rename group" | none | none — deliberate | -- |
| TG-6 | Gruppen-Kopf-Menü | „Change color" | none | none — deliberate | -- |
| TG-7 | Gruppen-Kopf-Menü | „Ungroup" | none | none — deliberate | -- |
| TG-8 | Gruppen-Kopf-Menü | „Move group to space" | none | none — deliberate | -- |
| TG-9 | Gruppen-Kopf-Menü | „Close group" inkl. Rückfrage | none | none — deliberate | -- |
| TG-10 | Tab-Leiste | Tab in/aus Gruppe ziehen, Tab auf eingeklappten Kopf | none | none — deliberate | Bestehendes Ziehen, erweitert |
| TG-11 | Tab-Leiste | Gruppe am Kopf ziehen | none | none — deliberate | -- |
| TG-12 | Befehlspalette | Drei Gruppen-Befehle | none | none — deliberate | -- |
| TG-13 | Durchschalten | Tastenkürzel, Nummer, Wischen, Tab-Umschalter | none | none — deliberate | Geändertes Verhalten (BR-9) |
| TG-14 | Sprung zu Session | Benachrichtigung, Glocke, Mission Control | none | none — deliberate | Klappt auf (BR-10) |
| TG-15 | Systemzustand | Sammelzeichen am eingeklappten Kopf | none | none — deliberate | Folgt dem Agent-Status |
| TG-16 | App-Start | Wiederherstellen der Gruppen | none | none — deliberate | -- |

---

## Compliance & Security Surface

> No requirement IDs — context

| Fläche | Berührt? | Notiz |
|--------|----------|-------|
| Anmeldung / Rechte | Nein | Lokale Einzelplatz-App |
| Sensible Daten at-rest | Nein | Gruppenname und -farbe liegen lokal neben den gespeicherten Tabs; private Tabs werden weiterhin nicht gespeichert |
| Externe Integrationen / Webhooks | Nein | -- |
| Privilegierte Aktionen | Nein | „Close group" beendet Sessions; abgesichert durch die Rückfrage (BR-15) |
| Aufbewahrungspflichten | Nein | -- |

---

## Implementation Slices

> No requirement IDs — context

### Dependencies

```
Slice 1 -> Slice 2 -> Slice 3
              |
              +-----> Slice 4
              +-----> Slice 5
```

### Slices

| # | Name | Scope | Testability | Dependencies |
|---|------|-------|-------------|--------------|
| 1 | Gruppen-Regeln und Neustart | Gruppe anlegen, zuordnen, entfernen, auflösen; Zusammenhang und Leer-Regel; neue Tabs lose; Wiederherstellen nach Neustart (BR-1 bis BR-7, BR-17 bis BR-20, BR-22) | Regeln ohne Oberfläche prüfbar; Speichern/Laden als Hin-und-zurück-Test | -- |
| 2 | Leiste: Kopf, Linie, Menüs | Kopf, Farblinie, ein-/ausklappen, Umbenennen, Farbe, Tab- und Kopf-Menü, Sammelzeichen, Palette-Befehle | Komponententests der Zustände; Sichtprüfung in der App | 1 |
| 3 | Durchschalten und Sprünge | Überspringen eingeklappter Gruppen, Aufklappen bei Sprung, aktiver Tab beim Einklappen (BR-9, BR-10, EP-1) | Regeln ohne Oberfläche prüfbar; Wischen und Benachrichtigung in der App | 2 |
| 4 | Ziehen | Beitreten/Verlassen per Lücke, Tab auf eingeklappten Kopf, Gruppe am Kopf verschieben, Einfüge-Marke (BR-11 bis BR-14) | Lücken-Regeln ohne Oberfläche; Ziehen in der echten App synthetisch fahren (bewährter Weg aus den Panes-Wellen) | 2 |
| 5 | Gruppe schließen und verschieben | „Close group" mit Sammel-Rückfrage, „Move group to space" (BR-15, BR-16, EP-5, EP-6) | Regeln ohne Oberfläche; Dialog in der App | 2 |

### Recommended Order

1. **Slice 1:** Gruppen-Regeln und Neustart -- alle anderen Slices bauen auf den Regeln auf.
2. **Slice 2:** Leiste -- macht das Feature sichtbar und bedienbar.
3. **Slice 3:** Durchschalten und Sprünge -- der eigentliche Nutzen des Parkens.
4. **Slice 5:** Gruppe schließen und verschieben -- klein, unabhängig vom Ziehen.
5. **Slice 4:** Ziehen -- riskantester Teil, zuletzt; berührt dieselbe Stelle wie Panes-Welle C.

---

## Nach dem Merge

> No requirement IDs — context

| Punkt | Warum nicht in diesem Lauf | Was zu tun ist |
|-------|----------------------------|----------------|
| Automatische Gruppen nach Status | „Fertig, misst aber noch" erkennt die App nicht selbst; Nutzen erst mit Erfahrung aus den Hand-Gruppen beurteilbar | Eigene Discovery nach einigen Wochen Nutzung |
| Mission Control nach Gruppen gegliedert | Vom PM nicht gewählt; Mission Control bleibt Statusliste | Bei Bedarf eigene Discovery |
| Eigene Tastenkürzel für Gruppen | Vom PM nicht gewählt (Q&A 7); Palette deckt den Tastaturweg | Bei Bedarf nachziehen |
| Neuer Tab direkt in einer Gruppe | Vom PM nicht gewählt (Q&A 7) | Bei Bedarf nachziehen |
| Kachel-Übersicht einer Gruppe | Vom PM ausgeschlossen (Q&A 2) | -- |

---

## Context & Research

> No requirement IDs — context

### Similar Patterns in Codebase
| Feature | Location | Relevant because |
|---------|----------|------------------|
| Spaces | `src/modules/spaces/` | Bestehende Ordnungsebene über Tabs, Farbpalette, Inline-Umbenennen, Speichern je Space |
| Tab-Leiste und Ziehen | `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/lib/tabStripGap.ts`, `reorderTabsByGap` | Lücken-Logik, die das Ziehen in Gruppen erweitert |
| Agent-Status am Tab | `src/modules/tabs/lib/selectTabAgentStatus.ts`, `TabActivityIndicator.tsx` | Vorlage für das Sammelzeichen; sehr häufig ausgewerteter Pfad |
| Wechsel-Logik | `nextActiveInSpace`, `pickTabBySpaceIndex`, `useTabSwipe`, `useTabSwitcher` | Stellen, die eingeklappte Gruppen überspringen müssen |
| Schließen-Schutz | Schließen-Rückfragen in `src/app/App.tsx` | Grundlage für die Sammel-Rückfrage |
| Speichern der Tabs | `src/modules/spaces/lib/serialize.ts` | Bestimmt, welche Tabs den Neustart überstehen |
| Offene Panes-Wellen | `specs/panes-ux/discovery.md` | Welle C (Pane von Tab A nach Tab B) ändert dieselbe Zieh-Logik der Leiste |

### Web Research
| Source | Finding |
|--------|---------|
| Chrome (blog.google, 9to5google.com) | Gruppe mit Name und Farbe; Klick auf den Kopf klappt ein; gespeicherte Gruppen lassen sich schließen und wieder öffnen |
| Warp Docs (docs.warp.dev/terminal/windows/tabs) | Benannte, einklappbare Gruppen in waagerechter und senkrechter Leiste; Gruppen und Tabs anpinnbar |
| AlphaSignal über Warp | Tab-Gruppen ausdrücklich gegen das Chaos bei vielen Agent-Sessions |
| cmux, omux | Senkrechte Seitenleiste je Session mit Ordner, Branch, letzter Ausgabezeile und Abzeichen für „braucht dich" |

---

## Frame

> No requirement IDs — context

| Question | Recommendation (from research) | Decision |
|----------|--------------------------------|----------|
| Legacy parity — only with `legacy_repo` in zip.config.json: is there a counterpart in the legacy repo, and must behaviour match it? | nicht konfiguriert (kein `zip.config.json` im Projekt) | nicht gefragt |
| Run boundary — what does this run build, what comes after the merge? | Alles Entschiedene in einem Lauf; zurückgestellte Ideen in „Nach dem Merge" | Alles Entschiedene in einem Lauf, ein PR |
| Tolerated duplication — may old and new path run side by side, until when? | Nicht betroffen: Spaces, lose Tabs und Mission Control bleiben, Gruppen kommen hinzu | Nicht betroffen |
| Open business rule — which rule is undecided, who decides it? | keine; Einzelregeln BR-1 bis BR-23 sind festgelegt | Keine offene Regel |

Hinweis für die Architecture: Das Ziehen (Slice 4) und die offene Panes-Welle C ändern dieselbe Stelle der Tab-Leiste. Der Lauf, der als zweiter kommt, muss mit Konflikten rechnen.

---

## Open Questions

> No requirement IDs — context

| # | Question | Options | Recommended | Decision |
|---|----------|---------|-------------|----------|
| -- | keine | -- | -- | -- |

---

## Research Log

> No requirement IDs — context

| Date | Area | Finding |
|------|------|---------|
| 2026-11-23 | GitHub | Issues im Fork deaktiviert; `gh` zeigt standardmäßig auf Upstream `crynta/terax-ai`. Dort wird nichts angelegt; Discovery läuft ohne Issue wie `specs/2026-10-20-upstream-sync-090`. |
| 2026-11-23 | Codebase | Tab-Leiste ist flach; Ordnungsebene über Tabs sind nur Spaces. Rechtsklick-Menü nur an Terminal-Tabs („Rename", „Close"). |
| 2026-11-23 | Codebase | Agent-Status je Session (`working`, `waiting`, `idle`) vorhanden; am Tab schlägt arbeitet wartet. |
| 2026-11-23 | Codebase | Mission Control listet Agent-Sessions nach Status mit Sprung zum Tab. |
| 2026-11-23 | Codebase | Neustart stellt Tabs, Splits, eigene Titel und tmux-Zuordnung je Space wieder her; private Tabs nicht. |
| 2026-11-23 | Codebase | Kein Nutzungs-Tracking in der App; kein `zip.config.json` (keine Legacy-Parität, keine Bild-Mockups). |
| 2026-11-23 | Codebase | `specs/open-topics.md` führt Tab-Gruppen als F2 und warnt vor Überschneidung mit den Panes-Wellen C bis E. |
| 2026-11-23 | Web | Chrome, Warp, cmux, omux: siehe Web Research. |

---

## Q&A Log

> No requirement IDs — context

| # | Question | Recommendation | Answer | Alternative & consequence | Mode |
|---|----------|----------------|--------|---------------------------|------|
| 1 | Wie tief soll die Discovery gehen (kurz, Standard, detailliert)? | Standard, weil Gruppen viele Stellen berühren (Leiste, Tastatur, Neustart, Spaces) | Standard | Kurz: nur 4 bis 5 Fragen, Rest als Annahmen. Detailliert: breitere Recherche und jede Einzelheit als Frage | interaktiv |
| 2 | Was heißt „zusammen ansehen": die Leiste ordnen (einklappen/aufklappen) oder Sessions gleichzeitig als Kacheln sehen? | Beides, in zwei Läufen, wegen des größten Nutzens | Nur ordnen | Beides oder nur Kacheln: eine Kachel-Übersicht wäre zusätzlich bzw. zuerst geplant worden | interaktiv |
| 3 | Wie sollen Tabs in Gruppen kommen: Menü und Ziehen, nur Menü, oder Menü jetzt und Ziehen später? | Menü und Ziehen, voller Komfort wie bei Chrome und Warp | Menü und Ziehen | Nur Menü: kleiner und sicherer, mehr Klicks. Ziehen später: als Punkt nach dem Merge | interaktiv |
| 4 | Was soll der Kopf einer eingeklappten Gruppe zeigen: Name, Anzahl und Sammelstatus; Zähler je Status; oder nur Name und Anzahl? | Name, Anzahl, Sammelstatus; ein Blick genügt, ohne Unruhe durch wechselnde Zahlen | Name, Anzahl, Sammelstatus | Zähler: genauer, aber breiter und unruhiger. Nur Name und Anzahl: Status nur über Benachrichtigung, Glocke, Mission Control | interaktiv |
| 5 | Wie verhalten sich eingeklappte Gruppen beim Durchschalten: überspringen und Sprung klappt auf; überspringen und Sprung ohne Aufklappen; nicht überspringen? | Überspringen, Sprung klappt auf; passt zum Ziel, geparkte Sessions aus dem Weg zu haben | Überspringen, Sprung klappt auf | Ohne Aufklappen: Leiste bleibt kompakt, aber der offene Tab ist nicht erkennbar. Nicht überspringen: geparkte Sessions stören weiter | interaktiv |
| 6 | Was passiert, wenn die Gruppe mit dem aktiven Tab eingeklappt wird: zum Nachbarn, sonst neues Terminal; zum Nachbarn, sonst nicht einklappen; Gruppe bleibt offen? | Zum Nachbarn, sonst neues Terminal; Einklappen funktioniert dann immer | Zum Nachbarn, sonst neues Terminal | Sonst nicht einklappen: nie ein ungefragtes Terminal, aber die letzte Gruppe bleibt offen. Bleibt offen: zusätzlicher Handgriff bei jedem Parken | interaktiv |
| 7 | Welche weiteren Gruppen-Aktionen kommen in diesen Lauf (Gruppe schließen, neuer Tab in Gruppe, Gruppe in anderen Space, Tastenkürzel)? Umbenennen, Farbe und Auflösen sind Grundausstattung. | Gruppe schließen und neuer Tab in Gruppe aufnehmen; Verschieben in anderen Space nach dem Merge | Gruppe schließen und Gruppe in anderen Space | Neuer Tab in Gruppe und Tastenkürzel wurden nicht gewählt: neue Tabs sind lose, Tastaturweg nur über die Befehlspalette | interaktiv |
| 8 | Sollen Gruppen einen Neustart überstehen: ja samt Klappzustand; ja, aber immer aufgeklappt; nein? | Ja, samt Klappzustand; sonst geht die Ordnung bei jedem Update verloren | Ja, samt Klappzustand | Immer aufgeklappt: geparkte Gruppen jedes Mal neu einklappen. Nein: Ordnung nur für die laufende Sitzung | interaktiv |
| 9 | Welche Tab-Arten sollen sich gruppieren lassen: alle oder nur Terminals? | Alle; eine Regel ohne Sonderfälle, gemischte Projekt-Gruppen möglich | Alle Tab-Arten | Nur Terminals: kleiner, aber die Leiste müsste beim Ziehen Ablehnungen erklären | interaktiv |
| 10 | Wie soll eine Gruppe in der Leiste aussehen: Kopf plus Farblinie; nur Farbpunkt als Kopf; getönte Tabs ohne Linie? | Kopf plus Farblinie; bekanntes Muster, klar erkennbar | Kopf plus Farblinie | Nur Farbpunkt: spart Platz, Name aufgeklappt nicht sichtbar. Getönte Tabs: können sich mit Themes und Hintergrundbild beißen | interaktiv |
| 11 | Laufgrenze: alles Entschiedene in einem Lauf oder das Ziehen als zweiter Lauf? | Alles in einem Lauf; zusammenhängender Umfang | Alles Entschiedene in einem Lauf | Ziehen als zweiter Lauf: kleinere PRs, bis dahin nur Rechtsklick | interaktiv |
| 12 | Geduldete Doppelung: Wird ein bestehender Weg abgelöst, oder bleiben Spaces, lose Tabs und Mission Control wie sie sind? | Nicht betroffen; Gruppen sind eine neue Ebene | Nicht betroffen | Ablösung: hätte eine Frist für das Nebeneinander gebraucht | interaktiv |
| 13 | Offene Geschäftsregel: Passen die festgelegten Regeln (Gruppe in genau einem Space, Tab in höchstens einer Gruppe, leere Gruppe verschwindet, nächste freie Farbe und leerer Name, einzelner Tab verlässt beim Space-Wechsel die Gruppe)? | Passt, keine offene Regel | Passt, keine offene Regel | Offene Regel: wäre mit dem PM als Entscheider eingetragen worden | interaktiv |
| 14 | Soll vor dem Bau ein Clickdummy entstehen? | Ohne Clickdummy; Bedienmuster bekannt, Skizze gewählt, später nachholbar | Ohne Clickdummy | Mit Clickdummy: Bedienung vor dem Bau ausprobierbar, deutlich mehr Zeit | interaktiv |
| 15 | Freigabe der Zusammenfassung samt der vom Agenten festgelegten Einzelregeln (Zugehörigkeit, neue Gruppe, leere Gruppe, neuer Tab, Ziehen, Sammel-Rückfrage, Verschieben, Palette, private Tabs, keine Einstellung)? | Freigeben | „Das passt so" — freigegeben ohne Änderung | Änderungswunsch: betroffene Regel wäre vor dem Schreiben angepasst worden | interaktiv |
