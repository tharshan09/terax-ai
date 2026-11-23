# Feature: Tab-Gruppen

**Epic:** –
**Status:** Ready
**Discovery:** `discovery.md` (same folder)
**Derived from:** Discovery constraints, NFRs, and risks

Terax ist eine lokale Desktop-App ohne Server und ohne Datenbank. Die Template-Sections werden so gelesen: „API" = die Aktionen, die der Tab-Zustand der Oberfläche anbietet; „Database" = die gespeicherte Datei je Space; „Server Logic" = reine Regel-Funktionen ohne Oberfläche.

---

## Problem & Solution

> No requirement IDs — context

**Problem:**
- Viele parallele Sessions (mehr als 10) in einer flachen Tab-Leiste; zwischen Space und Tab fehlt eine Ordnungsebene.
- Fertige Sessions, die noch Messungen laufen lassen, stehen zwischen den aktiven Tabs und stören beim Durchschalten.
- Gemeinsames Wiederansehen solcher Sessions heißt jedes Mal einzeln suchen.

**Solution:**
- Tabs lassen sich von Hand zu benannten, farbigen, ein- und ausklappbaren Gruppen zusammenfassen.
- Eingeklappte Gruppen machen Platz, werden beim Durchschalten übersprungen und zeigen am Kopf ein Sammelzeichen.

**Business Value:**
- Weniger Suchen und Fehlgriffe bei vielen Sessions; die Ordnung übersteht den Neustart.

---

## Scope & Boundaries

> No requirement IDs — context

| In Scope |
|----------|
| Gruppen anlegen, benennen, einfärben, auflösen |
| Ein-/Ausklappen, Kopf mit Name, Anzahl, Sammelzeichen, Farblinie |
| Zuordnen/Entfernen per Rechtsklick-Menü und Ziehen; Gruppe am Kopf umsortieren |
| Durchschalten überspringt eingeklappte Gruppen; gezielter Sprung klappt auf |
| Gruppe schließen (Sammel-Rückfrage), Gruppe in anderen Space |
| Gruppen samt Klappzustand über den Neustart |
| Alle Tab-Arten gruppierbar; drei Befehle in der Befehlspalette |
| Zusammenführen der Ableitung „sichtbare Tabs eines Space" und des Space-Wechsels eines Tabs (Anti-Slop-Dispositionen 1 bis 3) |

| Out of Scope |
|--------------|
| Kachel-Übersicht, automatische Status-Gruppen, Mission Control nach Gruppen |
| Eigene Tastenkürzel, neuer Tab direkt in Gruppe |
| Verschachtelte Gruppen, Gruppen über mehrere Spaces, gespeicherte geschlossene Gruppen |
| Neuer Schalter in den Einstellungen; Änderungen am Rust-Teil der App |

---

## API Design

### Overview

> No requirement IDs — context

| Aspect | Specification |
|--------|---------------|
| Style | Keine Netz-Schnittstelle. Aktionen des Tab-Zustands (`useTabs` in `src/modules/tabs/lib/useTabs.ts`), die `src/app/App.tsx` an Leiste, Menüs und Befehlspalette durchreicht |
| Authentication | Entfällt (lokale Einzelplatz-App) |
| Rate Limiting | Entfällt |

### Endpoints

| ID | Method | Path | Request | Response | Auth | Business Logic |
|----|--------|------|---------|----------|------|----------------|
| API-1 | Aktion | `createGroupFromTab` | `tabId` | `groupId` | – | Legt eine Gruppe an der Stelle des Tabs an, Farbe nach SVC-5, Name leer, aufgeklappt; der Tab wird einziges Mitglied; ein Tab, der schon in einer Gruppe war, verlässt sie (BR-1, BR-2, BR-5, FL-1) |
| API-2 | Aktion | `addTabToGroup` | `tabId`, `groupId` | – | – | Tab wird letztes Mitglied; nur innerhalb desselben Space; Zielgruppe behält ihren Klappzustand; war der Tab aktiv und die Zielgruppe eingeklappt, gilt SVC-8 (BR-2, BR-12, FL-3) |
| API-3 | Aktion | `removeTabFromGroup` | `tabId` | – | – | Tab wird lose und steht direkt hinter seiner bisherigen Gruppe (FL-9, BR-4) |
| API-4 | Aktion | `ungroup` | `groupId` | – | – | Alle Mitglieder werden lose und bleiben an ihrer Stelle; der aktive Tab bleibt (TR-9) |
| API-5 | Aktion | `renameGroup` | `groupId`, `name` | – | – | Name nach VAL-1 speichern (BR-6) |
| API-6 | Aktion | `setGroupColor` | `groupId`, `color` | – | – | Farbe nach VAL-2 setzen (TR-8) |
| API-7 | Aktion | `toggleGroupCollapsed` | `groupId` | – | – | Klappt um; Auslöser ist der einfache Klick auf den Kopf. Beim Einklappen mit aktivem Mitglied: neuer aktiver Tab nach SVC-8, notfalls neues Terminal im selben Schritt (TR-4, TR-5, EP-1, BR-8). Der Kopf reagiert nicht auf Doppelklick; Umbenennen startet über „Rename group" im Menü und von selbst nach API-1 (Q&A 8, weicht ab von UI-1, TR-7 und TG-5) |
| API-8 | Aktion | `reorderTabByGap` (bestehend, erweitert) | `fromId`, Ziel nach SVC-10 | – | – | Umsortieren wie heute; zusätzlich setzt das Ziel die Zugehörigkeit (BR-11, BR-12, BR-13) |
| API-9 | Aktion | `moveGroupByGap` | `groupId`, Ziel-Lücke | – | – | Verschiebt die Gruppe als Block vor/hinter lose Tabs und andere Gruppen (BR-14) |
| API-10 | Aktion | `moveGroupToSpace` | `groupId`, `targetSpaceId` | – | – | Nach SVC-12 (BR-16, EP-5, TR-14) |
| API-11 | Aktion | `requestCloseGroup` / `confirmCloseGroup` / `cancelCloseGroup` | `groupId` | – | – | Nach SVC-13: sofort schließen oder Rückfrage; nach dem Schließen ggf. neues Terminal (BR-15, BR-25, EP-2, EP-9) |
| API-12 | Aktion | `breakOutPane` (bestehend, erweitert) | wie heute, Ziel nach SVC-10 | wie heute | – | Der neue Tab übernimmt die Zugehörigkeit der Ziel-Lücke; Undo stellt auch sie wieder her (BR-11) |
| API-13 | Befehl | Befehlspalette `tab.group.new`, `tab.group.remove`, `tab.group.toggle` | aktiver Tab | – | – | Rufen API-1, API-3, API-7 für den aktiven Tab bzw. dessen Gruppe; die letzten beiden nur sichtbar, wenn der aktive Tab in einer Gruppe ist (UI-10) |

### Data Transfer Objects (DTOs)

> No requirement IDs — covered via API-n

| DTO | Fields | Validation | Notes |
|-----|--------|------------|-------|
| `TabGroup` (Laufzeit) | `id` (Text, je Sitzung eindeutig), `spaceId`, `name`, `color` (Index in die Space-Palette), `collapsed` | VAL-1, VAL-2 | Metadaten einer Gruppe; Mitgliedschaft steht am Tab |
| `Tab.groupId` (Laufzeit) | optionales Feld an jedem Tab (`TabBase`, `src/modules/tabs/lib/useTabs.ts:67`) | verweist auf eine Gruppe im selben Space | Fehlt = loser Tab |
| `StripItem` (abgeleitet) | entweder loser Tab oder Gruppe mit Metadaten, geordneten Mitgliedern, Anzahl | – | Ergebnis von SVC-2, einzige Quelle für das Zeichnen der Leiste |
| `GapTarget` | Ziel-Lücke, gezählt über alle gezeichneten Elemente des Streifens (Köpfe und Tabs), damit „vor dem Kopf" und „zwischen Kopf und erstem Tab" unterscheidbar sind; `groupId` oder keine; optional „auf eingeklapptem Kopf" | – | Ergebnis des Treffertests beim Ziehen (SVC-10); dieselbe Angabe trägt Tab-Ziehen (API-8), Gruppen-Ziehen (API-9), Pane-Ausbrechen (API-12) und die Einfüge-Marke (UI-9) |

---

## Database Schema

### Entities

| ID | Table | Purpose | Key Fields |
|----|-------|---------|------------|
| DB-1 | Gespeicherter Space-Zustand (`SpaceState`, Datei `terax-spaces.json`, Schlüssel `state:<spaceId>`), Erweiterung | Gruppen des Space über den Neustart behalten (BR-19) | neues optionales Feld `groups` (Liste), neues optionales Feld `group` an jedem gespeicherten Tab |

### Schema Details

> No requirement IDs — covered via DB-1

| Table | Column | Type | Constraints | Index |
|-------|--------|------|-------------|-------|
| `SpaceState` | `groups` | Liste von Gruppen-Einträgen | optional; fehlt = keine Gruppen (alte Dateien bleiben lesbar) | No |
| Gruppen-Eintrag | `name` | Text | optional; beim Laden nach VAL-1 behandelt. Evidenz: Nutzereingabe mit UI-Grenze 32 Zeichen (BR-6) | No |
| Gruppen-Eintrag | `color` | Ganzzahl | Index in die Space-Palette (8 Farben, `src/modules/spaces/lib/spaceColor.ts:5`); beim Laden nach VAL-2 | No |
| Gruppen-Eintrag | `collapsed` | Wahrheitswert | optional; fehlt = aufgeklappt | No |
| Gespeicherter Tab (`SerializedTab`) | `group` | Ganzzahl | optional; Position in `groups` desselben Space; beim Laden nach VAL-3 | No |

### Relationships

> No requirement IDs — covered via DB-1

| From | To | Relationship | Cascade |
|------|-----|--------------|---------|
| Gespeicherter Tab | Gruppen-Eintrag desselben Space | N:1 über `group` | Ein Gruppen-Eintrag ohne gespeichertes Mitglied wird nicht geschrieben (EP-4, SEC-3); ein Verweis ohne gültigen Eintrag macht den Tab lose |
| Gruppen-Eintrag | Space | N:1 über den Schlüssel der Datei | Mit dem Space entfernt (BR-18) |

Reihenfolge und Position der Gruppe (DF-5, DF-6) werden nicht eigens gespeichert: sie ergeben sich aus der Reihenfolge der gespeicherten Tabs.

---

## Server Logic

### Services & Processing

Alle Services sind reine Funktionen ohne Oberfläche, neu in `src/modules/tabs/lib/tabGroups.ts` mit Test daneben, sofern nicht anders genannt.

| ID | Service | Responsibility | Input | Output | Side Effects |
|----|---------|----------------|-------|--------|--------------|
| SVC-1 | `visibleTabsInSpace` | Einzige Quelle für „welche Tabs eines Space sind in der Leiste sichtbar und per Durchschalten erreichbar": Tabs des Space ohne Mitglieder eingeklappter Gruppen. Mit Option „alle" liefert sie den ganzen Streifen des Space. Sichtbare Liste: Wischen, Tab-Umschalter samt Umschalter-Anzeige, „Tab nach Nummer", Nachfolger-Wahl (SVC-7), Space-Wechsel (SVC-17). Ganzer Streifen: Zeichnen der Leiste (über SVC-2), Ordner-Ableitung des Arbeitsbereichs, Zählung „hat der Space mehr als einen Tab" für das Schließen (BR-9, BR-24, Dispositionen 1 und 2) | Tabs, Gruppen, `spaceId` | geordnete Tab-Liste | – |
| SVC-2 | `stripLayout` | Leitet die Zeichen-Reihenfolge der Leiste ab: lose Tabs und Gruppen gemischt, je Gruppe Metadaten, Mitglieder, Anzahl. Eine Gruppe existiert genau dann, wenn mindestens ein Tab auf sie verweist (BR-3, BR-4) | Tabs, Gruppen, `spaceId` | Liste von `StripItem` | – |
| SVC-3 | `normalizeGroups` | Stellt nach jeder Änderung an Reihenfolge oder Zugehörigkeit den Zusammenhang her: Mitglieder stehen direkt hinter dem ersten Mitglied, ein loser Tab zwischen Mitgliedern rückt direkt hinter die Gruppe; Verweise auf Gruppen eines anderen Space oder unbekannte Gruppen werden entfernt; Metadaten ohne Mitglied werden verworfen (BR-1, BR-3, BR-4, BR-7, BR-18) | Tabs, Gruppen | Tabs, Gruppen | – |
| SVC-4 | Mitgliedschafts-Funktionen `groupFromTab`, `assignToGroup`, `removeFromGroup`, `dissolveGroup` | Regeln hinter API-1 bis API-4 (BR-2, FL-1, FL-3, FL-9, TR-9, TR-16) | Tabs, Gruppen, Ids | Tabs, Gruppen | – |
| SVC-5 | `nextGroupColor` | Erste Farbe der Palette, die im Space keine Gruppe trägt; sind alle vergeben, die Farbe mit den wenigsten Gruppen, bei Gleichstand die erste (BR-5) | Gruppen des Space | Farb-Index | – |
| SVC-6 | `groupAggregateStatus` | Sammelzeichen einer Gruppe: `waiting`, sobald eine Session wartet, sonst `working`, sobald eine arbeitet, sonst nichts. Ohne Zwischenlisten, Ergebnis ein einfacher Wert. Die Pane-Ids kommen aus dem Pane-Baum jedes Mitglieds, auch eines nach dem Neustart noch nicht eingehängten Tabs (BR-21, UI-3) | Agent-Sessions, Pane-Ids aller Mitglieder | `waiting`, `working` oder nichts | – |
| SVC-7 | `nextActiveInSpace` (bestehend in `useTabs.ts`, erweitert) | Nachfolger beim Schließen/Wegziehen: zuerst der nächste sichtbare Tab nach der heutigen Regel (links, sonst rechts); gibt es keinen sichtbaren, der nächstgelegene Tab einer eingeklappten Gruppe; `null` nur, wenn der Space sonst leer wäre (BR-24, EP-8, INV-1, INV-2) | Tabs, Gruppen, `closingId` | Tab-Id oder `null` | – |
| SVC-8 | `activeAfterHide` | Neuer aktiver Tab, wenn der aktive durch Einklappen oder Ablegen auf einen eingeklappten Kopf unsichtbar wird: nächster sichtbarer rechts der Gruppe, sonst links, sonst „neues Terminal" (EP-1, BR-12) | Tabs, Gruppen, `groupId` | Tab-Id oder „neues Terminal" | – |
| SVC-9 | Aufklapp-Regel (in `useTabs`) | Eine einzige Stelle erzwingt: der aktive Tab liegt nie in einer eingeklappten Gruppe. Wird ein Tab in einer eingeklappten Gruppe aktiv (Klick, Sprung aus Glocke, Mission Control, Benachrichtigung, Space-Übersicht, Öffnen einer offenen Datei, Nachfolger nach SVC-7, Space-Wechsel nach SVC-17, Start), klappt seine Gruppe auf (BR-10, BR-20, BR-24, FL-7, TR-6). API-7 und API-2 wechseln den aktiven Tab im selben Schritt, bevor die Regel greift | aktiver Tab, Gruppen | Gruppen | Klappzustand |
| SVC-10 | `gapTargetAt` (in `src/modules/tabs/lib/tabStripGap.ts`) und `applyGapTarget` | Treffertest beim Ziehen: Lücke im sichtbaren Streifen plus Gruppen-Kontext nach BR-11 (zwischen Kopf und erstem Tab oder zwischen zwei Mitgliedern = Gruppe; hinter dem letzten Mitglied = außerhalb) oder „auf eingeklapptem Kopf" (BR-12). `applyGapTarget` übersetzt das Ziel in Position und Zugehörigkeit im Tab-Array, auch für einen ausgebrochenen Pane. Der Zähl-Kern `gapIndexAt` bleibt unverändert (INV-5) | Leisten-Element, Zeiger-Position; Tabs, Gruppen, Ziel | `GapTarget`; Tabs | – |
| SVC-11 | `moveGroupBlock` | Verschiebt alle Mitglieder als Block an eine Lücke außerhalb anderer Gruppen (BR-14) | Tabs, Gruppen, `groupId`, Ziel | Tabs | – |
| SVC-12 | `moveGroupAcrossSpaces` | Setzt Space der Gruppe und aller Mitglieder, stellt den Block ans Ende des Ziel-Streifens, behält Name, Farbe, Reihenfolge, Klappzustand; meldet, ob der Herkunfts-Space leer wird und ob der aktive Tab betroffen war (BR-16, EP-5) | Tabs, Gruppen, `groupId`, `targetSpaceId` | Tabs, Gruppen, Hinweise | Aufrufer legt bei leerem Herkunfts-Space ein neues Terminal an und wählt den aktiven Tab nach SVC-8; der aktive Space wechselt nicht |
| SVC-13 | `planGroupClose` und Erweiterung von `useTabCloseGuards` (`src/app/hooks/useTabCloseGuards.ts`) | Prüft je Mitglied mit den bestehenden Einzel-Regeln (ungespeicherte Datei, Vordergrundprozess im Terminal); die Einzel-Regel wird dafür aus dem Einzel-Schließen herausgelöst, sodass Einzel- und Sammel-Prüfung dieselbe Stelle nutzen (keine weitere Kopie der Regel) und liefert Anzahl Tabs `n` und Anzahl betroffener Tabs `m`; `m = 0` schließt sofort, sonst eine Rückfrage. Bestätigt: würde der Space leer, zuerst neues Terminal anlegen, dann alle Mitglieder schließen (BR-15, BR-25, TR-10 bis TR-13) | Tabs, `groupId`, Prüfergebnisse | Plan | Schließt Sessions |
| SVC-14 | `changeTabSpace` (in `useTabs.ts`) | Einziger Baustein, der die Space-Zuordnung eines einzelnen Tabs ändert und dabei seine Gruppen-Zugehörigkeit löst; `moveTabToSpace` und `reorderTab` rufen ihn (BR-17, Disposition 3, INV-17) | Tabs, `tabId`, `targetSpaceId` | Tabs | – |
| SVC-15 | Neu `serializeSpace` / `hydrateSpace` in `src/modules/spaces/lib/serialize.ts`, aufgebaut auf den bestehenden `serializeTabs` und `hydrateTabs`; die Aufrufer in `useSpacePersistence.ts` und `useSpacesBoot.ts` stellen um | Schreiben: je Space Gruppen mit mindestens einem speicherbaren Mitglied in Leisten-Reihenfolge, je gespeichertem Tab der Verweis. Laden: Gruppen und Verweise nach VAL-1 bis VAL-3 wiederherstellen, danach SVC-3 (BR-19, EP-4, FL-13) | Tabs, Gruppen eines Space; gespeicherter Zustand | gespeicherter Zustand; Tabs, Gruppen | – |
| SVC-17 | `tabForSpaceSwitch` | Welcher Tab beim Wechsel in einen Space aktiv wird: liegt der aktive Tab schon im Ziel-Space, bleibt er; sonst der letzte sichtbare Tab des Space; gibt es keinen sichtbaren, der letzte Tab des Space, dessen Gruppe über SVC-9 aufklappt; hat der Space keinen Tab, geschieht wie heute nichts (Q&A 7, BR-9, BR-24) | Tabs, Gruppen, `spaceId`, aktiver Tab | Tab-Id oder nichts | – |
| SVC-16 | Space-Entfernung (`planSpaceRemoval`, bestehend) | Entfernt wie heute die Tabs des Space; die Gruppen-Metadaten des Space fallen über SVC-3 weg (BR-18, INV-7) | wie heute | wie heute | – |

### Business Logic Flow

> No requirement IDs — covered via SVC-n

```
Menü / Ziehen / Palette → Aktion in useTabs (API-n)
        → reine Regel-Funktion (SVC-4, SVC-10 bis SVC-14)
        → normalizeGroups (SVC-3)
        → neuer Zustand {Tabs, Gruppen}
              ├→ Aufklapp-Regel (SVC-9)
              ├→ stripLayout (SVC-2) → Leiste zeichnet Köpfe, Linie, Tabs
              ├→ visibleTabsInSpace (SVC-1) → Umschalter, Wischen, Tab nach Nummer
              ├→ tabForSpaceSwitch (SVC-17) → aktiver Tab beim Space-Wechsel
              └→ Speichern je Space (SVC-15), verzögert wie heute

App-Start → gespeicherter Zustand → Validierung (VAL-1..3) → hydrate (SVC-15)
        → normalizeGroups (SVC-3) → Aufklapp-Regel (SVC-9, BR-20)
```

### Validation Rules

| ID | Field | Rule | Error Message |
|----|-------|------|---------------|
| VAL-1 | Gruppenname (Eingabe und Laden) | Leerzeichen an den Rändern entfernt; höchstens 32 Zeichen, Längeres wird beim Eingeben nicht angenommen und beim Laden gekürzt; kein Text = leerer Name (BR-6, DF-1) | keine Meldung |
| VAL-2 | Gruppenfarbe (Laden) | Muss eine ganze Zahl sein, die eine Farbe der Space-Palette bezeichnet; alles andere (fehlend, gebrochen, negativ, zu groß, Text) ergibt die erste Farbe (DF-2) | keine Meldung |
| VAL-3 | Gespeicherte Gruppen und Verweise (Laden) | Ein Gruppen-Eintrag ist nur ungültig, wenn er kein Objekt ist; jedes Feld fällt einzeln nachsichtig zurück (Name kein Text = leer, sonst VAL-1; Farbe nach VAL-2; nur ein ausdrückliches „eingeklappt" klappt ein). `group` zählt die Position in der Liste, wie sie in der Datei steht; ist der Wert keine ganze Zahl innerhalb der Liste, zeigt er auf einen ungültigen Eintrag oder ist `groups` keine Liste, wird der Tab lose. Die Tabs des Space werden in jedem Fall geladen (DF-3, DF-4, DF-5) | keine Meldung |
| VAL-4 | Zuordnung zur Gruppe | Tab und Gruppe müssen im selben Space liegen; sonst geschieht nichts (BR-1) | keine Meldung |
| VAL-5 | „Move group to space" | Ziel muss ein anderer bestehender Space sein; bei nur einem Space ist der Eintrag ausgegraut (EP-6) | keine Meldung |

---

## Security

### Authentication & Authorization

| ID | Area | Mechanism | Notes |
|----|------|-----------|-------|
| SEC-1 | Zugriff | Entfällt | Lokale Einzelplatz-App ohne Konten; das Feature fügt keine Netz-Schnittstelle, keinen Tauri-Befehl und keine neue Berechtigung hinzu |

### Data Protection

| ID | Data Type | Protection | Notes |
|----|-----------|------------|-------|
| SEC-2 | Gruppenname, Farbe, Klappzustand | Wie die übrigen Tab-Daten in der lokalen Datei des App-Speichers | Keine Geheimnisse; kein Versand nach außen |
| SEC-3 | Private Tabs | Private Tabs werden wie heute nicht gespeichert; eine Gruppe, deren Mitglieder alle nicht gespeichert werden, wird samt Name nicht geschrieben | Der Name einer rein privaten Gruppe erreicht die Platte nicht (INV-9, EP-4) |

### Input Validation & Sanitization

| ID | Input | Validation | Sanitization |
|----|-------|------------|--------------|
| SEC-4 | Gruppenname aus Eingabe und aus der gespeicherten Datei | VAL-1 | Wird ausschließlich als Text dargestellt (Kopf, Tooltip, Menü), nie als Markup |
| SEC-5 | Gespeicherte Gruppen-Daten | VAL-2, VAL-3; die Datei gilt wie heute als nicht vertrauenswürdig und wird von Hand geprüft | Ungültiges wird verworfen, nie ausgeführt |

### Rate Limiting & Abuse Prevention

| ID | Resource | Limit | Window | Penalty |
|----|----------|-------|--------|---------|
| SEC-6 | Entfällt | – | – | Keine Netz-Schnittstelle |

---

## Architecture Layers

> No requirement IDs — context

### Layer Responsibilities

| Layer | Responsibility | Pattern |
|-------|----------------|---------|
| Regel-Funktionen (`src/modules/tabs/lib/tabGroups.ts`, `tabStripGap.ts`, Teile von `useTabs.ts`) | Alle Gruppen-Regeln ohne Oberfläche | Reine exportierte Funktionen mit Test daneben (bestehende Konvention des Moduls) |
| Zustand (`useTabs`) | Hält Tabs (mit `groupId`) und Gruppen-Metadaten, bietet API-1 bis API-12, erzwingt SVC-3 und SVC-9 | Bestehender Hook; Änderungen über Aktualisierungs-Funktionen wie heute |
| Koordination (`src/app/App.tsx`, `useTabCloseGuards`) | Reicht Aktionen durch, verdrahtet Durchschalten, Sprünge, Schließen-Rückfrage, Befehlspalette | Bestehendes Muster „App.tsx koordiniert nur" |
| Oberfläche (`src/modules/tabs/TabBar.tsx`, neu `src/modules/tabs/TabGroupHeader.tsx`, `src/app/components/CloseDialogs.tsx`) | Zeichnet aus `StripItem`, Menüs, Umbenennen, Ziehen, Dialog | Bestehende UI-Bausteine (Rechtsklick-Menü mit Untermenü, Inline-Umbenennen, Status-Zeichen) |
| Speicherung (`src/modules/spaces/lib/`) | Schreiben, Laden, Prüfen des Space-Zustands | Bestehendes Muster: von Hand geprüfte, abwärtskompatible Datei |

Zustands-Schnitt: Die Zugehörigkeit steht am Tab (ein Feld, wie `spaceId`), die Metadaten in einer kleinen Tabelle daneben. Damit ist „ein Tab in höchstens einer Gruppe" (BR-2) durch die Datenform gegeben, und jede Tab-Änderung trägt die Zugehörigkeit unteilbar mit. Eine Gruppe ohne Mitglied ist unsichtbar und wird verworfen (BR-4), auch wenn ein Aufrufer das Aufräumen vergisst.

Eingeklappte Tabs bleiben eingehängt wie jeder Hintergrund-Tab heute; nur die Leiste zeichnet sie nicht (BR-8). Terminal-, Editor- und Vorschau-Stapel ändern sich nicht.

### Data Flow

```
Leiste / Menü / Palette → App.tsx → useTabs-Aktion → Regel-Funktion → {Tabs, Gruppen}
                                                         ↓
                                 Leiste (stripLayout) · Durchschalten (visibleTabsInSpace)
                                                         ↓
                                 useSpacePersistence → serialize → terax-spaces.json
```

### Error Handling Strategy

| Error Type | Handling | User Response | Logging |
|------------|----------|---------------|---------|
| Ungültige gespeicherte Gruppen-Daten | Betroffene Tabs werden lose geladen (VAL-3) | Keine Meldung; Tabs sind da, Gruppe fehlt | Kein Eintrag (wie heute bei verworfenen Feldern) |
| Aktion auf verschwundene Gruppe oder verschwundenen Tab (z. B. Menü offen, Tab schließt sich) | Aktion tut nichts | Keine Meldung | – |
| Überholter Zieh-Vorgang (Ziel-Tab oder Gruppe inzwischen weg) | Kein Umsortieren, Zustand bleibt | Keine Meldung (wie heute beim Umsortieren) | – |
| Schließen-Prüfung eines Mitglieds scheitert | Mitglied zählt als „läuft noch" (Rückfrage erscheint) | Rückfrage | – |

---

## Migration Map (when scope changes existing code)

| ID | Existing File | Current Pattern | Target Pattern | Specific Changes |
|----|---|---|---|---|
| MIG-1 | `src/modules/tabs/lib/useTabs.ts` | Flaches Tab-Array, Streifen eines Space je Stelle per eigenem Filter abgeleitet; zwei Stellen schreiben die Space-Zuordnung | Tabs tragen optional `groupId`; Gruppen-Metadaten im selben Hook; Streifen nur über SVC-1; Space-Wechsel nur über SVC-14 | `TabBase` um `groupId`; Gruppen-Zustand und API-1 bis API-12; `pickTabBySpaceIndex`, `nextActiveInSpace`, `reorderTabsByGap`, `insertTabAtSpaceGap`, `breakOutPaneFromTabs`/`undoBreakOut`, `planSpaceRemoval`, `mergeTabInto`, `closeTab`, `closeAiDiffTab`, `undoBreakOutPane`, `closePaneByLeaf`, `closeActivePane`, `moveTabToSpace`, `reorderTab` auf SVC-1, SVC-3, SVC-7, SVC-10, SVC-14 umstellen (jeder Aufrufer von `nextActiveInSpace` übergibt die Gruppen); SVC-9; SVC-17 |
| MIG-2 | `src/modules/tabs/lib/tabStripGap.ts` | Treffertest liefert nur einen Lücken-Index | Zusätzlich Gruppen-Kontext der Lücke | `gapTargetAt` ergänzen; `gapIndexAt`, `tabStripAt`, `stripHasTab` unverändert |
| MIG-3 | `src/modules/tabs/TabBar.tsx` | Zeichnet eine flache Tab-Liste; Rechtsklick-Menü nur an Terminal-Tabs | Zeichnet aus `StripItem`; Köpfe und Farblinie; Menü an allen Tab-Arten; Ziehen mit Gruppen-Ziel und Einfüge-Marke | Rendering auf SVC-2 aus dem ganzen Streifen samt Gruppen; UI-5 („Add to group" deaktiviert, wenn der Space keine andere Gruppe hat, EP-7; Untermenü ohne die eigene Gruppe, namenlose als „Unnamed group"); Schließen-Knopf, Mittelklick und Menü-„Close" hängen an „der Space hat mehr als einen Tab" über alle Tabs des Space, nicht nur die sichtbaren (BR-24, EP-8); Zieh-Zustand um `GapTarget` und Kopf als Zieh-Quelle; UI-9 samt Marke in Gruppenfarbe auch für einen gezogenen Pane (BR-11) |
| MIG-4 | `src/modules/tabs/index.ts` | Öffentliche Schnittstelle des Moduls | Zusätzlich Gruppen-Typen und die von `App.tsx` und `spaces` gebrauchten Funktionen | Exporte ergänzen |
| MIG-5 | `src/app/App.tsx` | Eigene Streifen-Filter für Leiste, Umschalter, Wischen | Alle über SVC-1; Gruppen-Aktionen durchgereicht | `getSwitcherOrder`, `swipeTab` und die Umschalter-Anzeige bekommen die sichtbare Liste aus SVC-1; die Leiste und die Ordner-Ableitung bekommen den ganzen Streifen; die Tab-Wahl beim Space-Wechsel (`src/app/App.tsx:334`) läuft über SVC-17; `handleBreakOutPane` reicht `GapTarget` statt einer Zahl weiter; Gruppen-Zustand und -Aktionen an Kopfzeile, Speicherung, Befehlspalette, Schließen-Schutz |
| MIG-6 | `src/app/hooks/useTabCloseGuards.ts` | Rückfragen je Tab | Zusätzlich Sammel-Prüfung und ein Zustand „Gruppe schließen offen" | SVC-13; die Einzel-Regeln bleiben die Quelle; das Einzel-Schließen übergibt die Gruppen an `nextActiveInSpace` (achter Aufrufer neben den sieben in `useTabs.ts`) |
| MIG-7 | `src/app/components/CloseDialogs.tsx` | Dialoge je Tab sowie Sammel-Dialoge (gelöschte Dateien, App beenden) | Zusätzlich UI-8 | Neuer Dialog nach dem Muster der bestehenden Sammel-Dialoge, mit Texten aus der Discovery |
| MIG-8 | `src/modules/spaces/lib/serialize.ts` | Schreibt/lädt Tabs | Schreibt/lädt zusätzlich Gruppen und Verweise | SVC-15 |
| MIG-9 | `src/modules/spaces/lib/store.ts` | `SpaceState` mit `tabs`, `activeTabIndex` | Zusätzlich optionales `groups` | Typ erweitern (DB-1) |
| MIG-10 | `src/modules/spaces/lib/validate.ts` | Prüft `tabs`, `activeTabIndex` | Prüft zusätzlich Gruppen nachsichtig | VAL-2, VAL-3 |
| MIG-11 | `src/modules/spaces/lib/useSpacePersistence.ts` | Schreibt, wenn sich die gespeicherten Tabs eines Space ändern | Schreibt auch, wenn sich nur Gruppen-Daten ändern (Name, Farbe, Klappzustand) | Gruppen in Momentaufnahme und Änderungs-Vergleich aufnehmen |
| MIG-12 | `src/modules/spaces/lib/useSpacesBoot.ts` | Stellt Tabs je Space her, wählt aktiven Tab per Index | Stellt zusätzlich Gruppen her | Geladene Gruppen an `useTabs` übergeben; BR-20 über SVC-9 |
| MIG-13 | `src/modules/spaces/components/InlineRename.tsx` | Fest auf „Rename space" beschriftet, ohne Längengrenze | Beschriftung und Höchstlänge einstellbar | Zwei optionale Angaben; Space-Umbenennen unverändert |
| MIG-14 | `src/modules/command-palette/commands.ts` | Flache Befehlsliste | Drei Gruppen-Befehle | API-13 |
| MIG-15 | `src/modules/tabs/lib/selectTabAgentStatus.ts` | Status eines Tabs (arbeitet schlägt wartet) | Unverändert; daneben SVC-6 für Gruppen | Keine Änderung an der bestehenden Funktion; SVC-6 in derselben Datei |
| MIG-16 | `src/modules/terminal/lib/useTerminalPaneDnd.ts` | Pane über der Leiste: Ziel ist ein Lücken-Index | Ziel ist ein `GapTarget` | Ruft `gapTargetAt` statt `gapIndexAt`; die Prüfung „Tab gehört zum Streifen" bleibt |
| MIG-17 | `src/modules/terminal/lib/paneDndStore.ts` | Ziel „neuer Tab" trägt eine Zahl | Trägt `GapTarget` | Typ und Gleichheits-Vergleich anpassen |
| MIG-18 | `src/modules/terminal/TerminalStack.tsx` | Reicht den Lücken-Index des Pane-Ausbrechens weiter | Reicht `GapTarget` weiter | Typ der Eigenschaft |
| MIG-19 | `src/app/components/WorkspaceSurface.tsx` | Reicht den Lücken-Index des Pane-Ausbrechens weiter | Reicht `GapTarget` weiter | Typ der Eigenschaft |
| MIG-20 | `src/modules/header/Header.tsx` | Reicht Tabs und Tab-Aktionen an die Leiste | Reicht zusätzlich Gruppen-Daten und Gruppen-Aktionen durch | Eigenschaften ergänzen; Umsortieren und Gruppen-Ziehen mit `GapTarget` |
| MIG-21 | `src/modules/tabs/TabActivityIndicator.tsx` | Zeichnet das Status-Zeichen eines Tabs | Darstellung je Status als eigener Baustein, den Tab und Gruppen-Kopf nutzen | Darstellung herauslösen; Verhalten am Tab unverändert (INV-16) |

**Sweep criterion:** `grep -rnE "spaceId (===|!==)" src --include=*.ts --include=*.tsx` ohne Testdateien. Jeder Treffer, der eine Tab-Liste für Anzeige, Durchschalten, Nachfolger-Wahl oder Ziehen ableitet, ruft danach SVC-1; jeder Treffer, der `spaceId` eines Tabs neu setzt, läuft über SVC-14 oder SVC-12. Übrig bleiben dürfen nur Vergleiche einzelner Tabs (kein Ableiten einer Liste) und die Gruppierung nach Space beim Speichern. Zweites Kriterium: jeder bestehende Test unter `src/modules/tabs` und `src/modules/spaces`, der nach dem Umbau rot wird, ist eine Entscheidung gegen die INV-Zeilen unten, kein Anlass zum Anpassen des Tests.

---

## Existing-Behavior Invariants

| ID | Invariant (checkable assertion) | Consumers | Source | Coverage | Routing |
|----|--------------------------------|-----------|--------|----------|---------|
| INV-1 | Der Nachfolger beim Schließen ist der Vorgänger im selben Space, sonst der Nachfolger (ohne eingeklappte Gruppen unverändert) | `src/modules/tabs/lib/useTabs.ts:637`, `src/app/hooks/useTabCloseGuards.ts:28` | `src/modules/tabs/lib/nextActiveInSpace.test.ts` „picks the previous tab within the same space", „falls forward when closing the first tab of a space" | covered | none |
| INV-2 | Der Nachfolger liegt nie in einem anderen Space; beim letzten Tab des Space gibt es keinen (Schließen verweigert) | `src/app/hooks/useTabCloseGuards.ts:28` | `src/modules/tabs/lib/nextActiveInSpace.test.ts` „never jumps into another space", „returns null for the last tab of its space (refuse to close)" | covered | none |
| INV-3 | „Tab nach Nummer" zählt nur Tabs des aktiven Space | `src/modules/tabs/lib/useTabs.ts:1300` | `src/modules/tabs/lib/pickTabBySpaceIndex.test.ts` „Cmd+1 in space B returns B's first tab, not A's" | covered | none |
| INV-4 | Umsortieren per Lücke ordnet innerhalb des Space um und lässt andere Spaces unberührt | `src/modules/tabs/lib/useTabs.ts:1682` | `src/modules/tabs/lib/reorderTabsByGap.test.ts` „reorders within a space without disturbing other spaces" | covered | none |
| INV-5 | Die Lücke folgt der Halbbreiten-Regel über die Tab-Elemente; hinter allen Tabs gilt die letzte Lücke | `src/modules/tabs/TabBar.tsx:232`, `src/modules/terminal/lib/useTerminalPaneDnd.ts:209` | `src/modules/tabs/lib/tabStripGap.test.ts` „picks the gap by the half-width rule", „reports the last gap for a pointer past every tab" | covered | none |
| INV-6 | Ein gezogener Pane wird nur über dem Streifen angenommen, der seinen eigenen Tab führt | `src/modules/terminal/lib/useTerminalPaneDnd.ts:208` | `src/modules/tabs/lib/tabStripGap.test.ts` „does not recognise a tab from another space's strip" | covered | none |
| INV-7 | Entfernen eines Space entfernt dessen Tabs und sorgt für mindestens einen Tab im Ausweich-Space | `src/modules/tabs/lib/useTabs.ts:680` | `src/modules/tabs/lib/planSpaceRemoval.test.ts` „drops every tab of the deleted space and disposes their leaves", „spawns a cold tab when the fallback space would be left empty" | covered | none |
| INV-8 | Pane-Ausbrechen legt den Tab an der Ziel-Lücke an; Rückgängig stellt den vorherigen Zustand her | `src/modules/tabs/lib/useTabs.ts:1498`, `src/modules/tabs/lib/useTabs.ts:1547` | `src/modules/tabs/lib/useTabs.breakout.test.tsx` „reports the break-out it committed, and switches to the new tab", „puts the pane back and closes the tab it was born into"; `src/modules/tabs/lib/paneAcrossTabs.test.ts` „gives the pane a tab of its own at the dropped gap" | covered | none |
| INV-9 | Speichern lässt private Terminals und flüchtige Tab-Arten aus | `src/modules/spaces/lib/useSpacePersistence.ts:41` | `src/modules/spaces/lib/serialize.test.ts` „drops private terminals and transient kinds" | covered | none |
| INV-10 | Speichern und Laden erhält Struktur, Ordner, Splits, aktiven Pane und tmux-Zuordnung | `src/modules/spaces/lib/useSpacePersistence.ts:41` | `src/modules/spaces/lib/serialize.test.ts` „round-trips structure, cwd, blocks and active leaf", „round-trips the tmux session binding (tab + leaf) and titles by it" | covered | none |
| INV-11 | Eine bereits offene Datei wird aktiviert statt neu geöffnet | `src/modules/tabs/lib/useTabs.ts:904` | `src/modules/tabs/lib/resolveFileTabOpen.test.ts` „reuses an existing persistent tab without changing state" | covered | none |
| INV-12 | Zwei-Finger-Wischen schaltet Tab für Tab in Leisten-Reihenfolge und stoppt am Rand | `src/app/App.tsx:1077` | `src/app/App.tsx:1077` | uncovered | qa_matrix |
| INV-13 | Der Tab-Umschalter folgt der Zuletzt-benutzt-Reihenfolge des aktiven Space, läuft im Kreis und ignoriert Tabs anderer Spaces | `src/app/App.tsx:642` | `src/app/App.tsx:642` | uncovered | qa_matrix |
| INV-14 | Schließen eines Terminals mit Vordergrundprozess oder einer ungespeicherten Datei verlangt eine Rückfrage, sonst schließt der Tab sofort | `src/app/hooks/useTabCloseGuards.ts:28` | `src/app/hooks/useTabCloseGuards.ts:28` | uncovered | qa_matrix |
| INV-15 | Ein Sprung aus Glocke, Mission Control oder Benachrichtigung wechselt den Space, aktiviert den Tab und fokussiert den Pane | `src/app/App.tsx:922` | `src/app/App.tsx:922` | uncovered | qa_matrix |
| INV-16 | Am einzelnen Tab schlägt „arbeitet" „wartet"; ruhige Sessions tragen nichts bei | `src/modules/tabs/TabActivityIndicator.tsx:21` | `src/modules/tabs/TabActivityIndicator.test.tsx` „collapses statuses with "working" winning over "waiting"" | covered | none |
| INV-17 | Ein einzelner Tab wechselt den Space; war er aktiv, wird der Nachbar aktiv; war er der letzte, folgt die Ansicht dem Tab | `src/modules/tabs/lib/useTabs.ts:626`, `src/app/App.tsx:1326` | `src/modules/tabs/lib/useTabs.ts:626` | uncovered | qa_matrix |
| INV-18 | Ist der beim Start aktive Space ohne gespeicherte Tabs, bekommt er ein neues Terminal; andere Spaces ohne gespeicherte Tabs bleiben beim Start ohne Tab | `src/modules/spaces/lib/useSpacesBoot.ts:120` | `src/modules/spaces/lib/useSpacesBoot.ts:120` | uncovered | qa_matrix |

Verfeinerungen ohne Konflikt (vom PM bestätigt, Q&A 4): INV-3, INV-12 und INV-13 gelten über die sichtbaren Tabs (BR-9); INV-1 bevorzugt sichtbare Nachbarn und fällt erst danach auf eingeklappte zurück (BR-24). Ohne eingeklappte Gruppe ist das Verhalten identisch.

---

## Register

> No requirement IDs — context

N/A — kein neuer Fachbereich

| Verzeichnis | Entscheidung | Garantie | Begründung |
|-------------|--------------|----------|------------|

---

## Test Strategy & Mocking

| System Boundary | Mocking Decision | Reason |
|-----------------|------------------|--------|
| Regel-Funktionen (SVC-1 bis SVC-8, SVC-10 bis SVC-17) | no_mocks | Reine Funktionen auf einfachen Daten |
| Speichern/Laden | no_mocks | Hin-und-zurück über die Serialisierungs-Funktionen ohne Datei |
| Zustand `useTabs` mit Gruppen | no_mocks | Wie der bestehende Hook-Test des Pane-Ausbrechens |
| Treffertest beim Ziehen | no_mocks | Wie der bestehende Test: aufgebaute Elemente mit festen Maßen |
| Ziehen, Wischen, Sprünge, Dialog in der laufenden App | no_mocks | QA in der echten App (synthetisch gefahrenes Ziehen hat sich bei den Panes-Wellen bewährt) |

---

## Constraints & Integrations

> No requirement IDs — context

### Constraints

| Constraint | Technical Implication | Solution |
|------------|----------------------|----------|
| Hintergrund-Tabs laufen weiter (BR-8) | Einklappen darf keinen Tab aushängen | Nur die Leiste blendet aus; Stapel unverändert |
| Status-Aggregat ist ein sehr häufig ausgewerteter Pfad | Sammelzeichen darf bei vielen Sessions keine Last erzeugen | SVC-6 ohne Zwischenlisten, einfacher Ergebniswert; nur eingeklappte Köpfe werten aus (NFR-1) |
| Alte gespeicherte Dateien ohne Gruppen | Laden muss ohne Umstellung gehen | Beide neuen Felder optional (DB-1); kein Versionssprung der Datei |
| Ältere App-Version liest eine Datei mit Gruppen (Rückschritt) | Darf nicht scheitern | Die bestehende Prüfung beachtet nur `tabs` und `activeTabIndex`; unbekannte Felder werden überlesen, die Gruppen gehen dabei verloren |
| Gleiche Stelle wie Panes-Welle C | Zusammenführungs-Konflikte in `TabBar.tsx` und `useTabs.ts` | Regeln in eigener Datei (`tabGroups.ts`), Treffertest additiv (`gapTargetAt`), damit die Berührungsfläche klein bleibt |
| Tab auf Tab ergibt einen Split (BR-13) | Zwei Zieh-Ziele am selben Ort (Tab-Mitte und Lücke) | Die bestehende Unterscheidung bleibt; der Gruppen-Kontext hängt nur an der Lücke |
| Ein aufgelöster Split-Quell-Tab verschwindet | Kann die Gruppe leeren | SVC-3 verwirft leere Gruppen (EP-3) |

### Integrations

| Area | System / Capability | Interface | Version | Notes |
|------|----------------------|-----------|---------|-------|
| Oberfläche | React | Bestehend | 19.3.0 | `package.json` „^19.3.0", gelesen 2026-11-23; keine neue Fähigkeit nötig |
| Menüs | radix-ui (Rechtsklick-Menü mit Untermenü) | `src/components/ui/context-menu.tsx` | 1.6.7 | `package.json` „^1.6.7"; Untermenü-Bausteine sind im Projekt vorhanden |
| Agent-Status | zustand | Bestehender Agent-Speicher | 5.0.15 | `package.json` „^5.0.15"; einfacher Ergebniswert hält das bestehende Neuzeichnen-Verhalten |
| Speicherung | Tauri-Store-Plugin | Bestehend über `src/modules/spaces/lib/store.ts` | 2.5.0 | `package.json` „~2.5.0"; keine neue Datei, kein neuer Schlüssel |
| Tests | vitest | `pnpm test` | 4.1.11 | `package.json` „^4.1.11" |

Keine neue Abhängigkeit und kein Versionswechsel; deshalb keine Prüfung auf neuere Versionen oder Umbrüche.

---

## Quality Attributes (NFRs)

### From Discovery → Technical Solution

| ID | Attribute | Target (from Discovery) | Technical Approach | Measure / Verify |
|----|-----------|-------------------------|--------------------|------------------|
| NFR-1 | Leistung bei vielen Sessions | Mehr als 10 parallele Agent-Sessions ohne spürbare Last durch das Sammelzeichen | SVC-6 ohne Zwischenlisten; Auswertung nur für eingeklappte Köpfe; Pane-Ids der Mitglieder nur bei Änderung der Mitgliedschaft neu bestimmt | Test nach Vorbild des bestehenden Tests am Tab-Zeichen: kein Neuzeichnen des Kopfs bei Status-Änderungen fremder Sessions |
| NFR-2 | Leistung der Leiste | Ein-/Ausklappen und Umsortieren ohne sichtbare Verzögerung bei 30 Tabs | SVC-1 und SVC-2 sind einfache Durchläufe über das Tab-Array, je Zustandsänderung einmal berechnet | QA in der App mit 30 Tabs in 5 Gruppen |
| NFR-3 | Verlässlichkeit der Speicherung | Gruppen überstehen Neustart; beschädigte Gruppen-Daten kosten keine Tabs | DB-1 optional, VAL-3 nachsichtig, Schreiben auch bei reinen Gruppen-Änderungen (MIG-11) | Hin-und-zurück-Tests; Test mit beschädigten Gruppen-Daten; QA: umbenennen, einklappen, App beenden, starten |
| NFR-4 | Konsistenz | Kein Zustand, in dem der aktive Tab unsichtbar ist oder Mitglieder nicht zusammenstehen | SVC-3 nach jeder Änderung, SVC-9 an einer Stelle | Tests je Regel-Funktion; Test: nach jeder API-Aktion gilt Zusammenhang und „aktiver Tab sichtbar" |
| NFR-5 | Rückwärts-Verhalten | Ohne Gruppen verhält sich die App wie vorher | Alle erweiterten Funktionen sind ohne Gruppen identisch | INV-1 bis INV-18; bestehende Tests bleiben unverändert grün |

### Monitoring & Observability

> No requirement IDs — covered via NFR-n

| Metric | Type | Target | Alert |
|--------|------|--------|-------|
| Entfällt | – | – | Lokale App ohne Telemetrie (Discovery: kein Tracking) |

---

## Risks & Assumptions

> No requirement IDs — context

### Assumptions

| Assumption | Technical Validation | Impact if Wrong |
|------------|---------------------|-----------------|
| Neue Tabs entstehen heute am Ende des Streifens oder an einer ausdrücklichen Lücke | SVC-3 korrigiert jede Position, die zwischen Mitglieder fiele (BR-7) | Keine: die Regel hängt nicht an der Annahme |
| Alle Aktivierungen laufen über den aktiven-Tab-Zustand von `useTabs` | SVC-9 hängt an diesem Zustand, nicht an den einzelnen Aufrufern | Ein Weg am Zustand vorbei würde eine eingeklappte Gruppe nicht aufklappen; QA prüft Glocke, Mission Control, Benachrichtigung, Space-Übersicht, Datei-Öffnen |
| Die Leiste zeichnet eingeklappte Mitglieder nicht als Tab-Elemente | Der Treffertest zählt nur gezeichnete Tab-Elemente; `applyGapTarget` übersetzt sichtbare Lücken in Array-Positionen | Falsche Einfüge-Position beim Ziehen neben eingeklappten Gruppen; durch Tests in SVC-10 abgedeckt |
| EP-5 der Discovery nennt das neue Terminal im geleerten Space „wie heute" | Heute folgt die Ansicht einem einzelnen letzten Tab in den Ziel-Space (INV-17); für Gruppen gilt BR-16 (Space wechselt nicht), deshalb legt SVC-12 das Terminal neu an | Keine Abweichung im Ergebnis der Discovery; nur der Weg ist neu |
| Wechsel in einen Space mit eingeklappten Gruppen (automatisch — zur PM-Durchsicht) | Gewählt: aktiv wird der letzte sichtbare Tab; nur wenn es keinen gibt, der letzte Tab des Space, dessen Gruppe aufklappt (SVC-17, Q&A 7). Alternative: immer der letzte Tab wie heute, dann klappt eine geparkte Gruppe am Ende der Leiste bei jedem Space-Wechsel auf | Bei anderer Entscheidung ändert sich nur SVC-17 |
| Klick und Doppelklick am Gruppen-Kopf (automatisch — zur PM-Durchsicht) | Gewählt: der Kopf reagiert nur auf den einfachen Klick (umklappen); Umbenennen über „Rename group" im Menü und von selbst nach dem Anlegen (Q&A 8). Grund: ein Doppelklick löst vorher zwei Klicks aus und würde die Gruppe mit dem aktiven Tab erst ein-, dann aufklappen und dabei den aktiven Tab wechseln. Alternative: Klick wirkt erst nach kurzer Wartezeit, dann fühlt sich jedes Einklappen verzögert an | Weicht ab von UI-1, TR-7 und TG-5 der Discovery (Doppelklick startet Umbenennen); bei anderer Entscheidung ändert sich nur API-7 |
| Nach dem Start ist ein nicht aktiver Space, dessen Tabs alle privat waren, leer | Entspricht dem heutigen Verhalten (INV-18); eine Gruppe aus nur privaten Tabs erscheint dort nicht (EP-4) | Keine |
| Nach dem Neustart sind wiederhergestellte Tabs zunächst nicht eingehängt, bis sie zum ersten Mal aktiv werden | Bestehendes Verhalten aller Hintergrund-Tabs nach einem Neustart. Sessions, die an tmux hängen, laufen über den Neustart weiter; die bestehende Status-Abfrage erfasst auch noch nicht eingehängte Tabs, ihr Zustand „arbeitet" erreicht deshalb das Sammelzeichen einer eingeklappten Gruppe ohne Aufklappen (nur bei eingeschalteter Claude-Statistik-Freigabe; „wartet" liefert dieser Weg nicht). Terminals ohne tmux starten erst, wenn der Tab gewählt wird (berichtigt nach Gate 1, Q&A 9) | SVC-6 liest die Pane-Ids aller Mitglieder, auch der noch nicht eingehängten; Auflage OB-15 |

### Risks & Mitigation

| Risk | Likelihood | Impact | Technical Mitigation | Fallback |
|------|------------|--------|---------------------|----------|
| Konflikte mit Panes-Welle C in Leiste und Tab-Zustand | High | Med | Regeln in eigener Datei; Treffertest additiv; Slice „Ziehen" zuletzt | Der später kommende Lauf löst die Konflikte von Hand; INV-Zeilen und Tests beider Seiten sind die Abnahme |
| Zieh-Fehler, die nur im echten Layout sichtbar werden | Med | Med | Regel-Tests plus synthetisch gefahrenes Ziehen in der App | Ziehen in Gruppen per Schalter im Code abschaltbar halten, Menü-Weg bleibt |
| Eine der Streifen-Ableitungen wird beim Zusammenführen übersehen | Med | Med | Sweep criterion der Migration Map; Test, der Wischen, Umschalter und „Tab nach Nummer" gegen dieselbe eingeklappte Gruppe prüft | Nachziehen an der gefundenen Stelle |
| Gruppen-Daten gehen beim Rückschritt auf eine ältere App-Version verloren | Low | Low | Bewusst hingenommen; Tabs bleiben erhalten | Gruppen neu anlegen |
| Sammelzeichen erzeugt Last bei vielen Sessions | Low | Med | NFR-1 | Zeichen nur bei Wechsel des Ergebniswerts neu zeichnen |
| Umfang des Laufs (5 Slices, großer Hook) | Med | Med | Slices nach Discovery-Reihenfolge; jeder mit eigenen Tests | Ziehen als letzter Slice abtrennbar |

---

## Technology Decisions

> No requirement IDs — context

### Stack Choices

| Area | Technology | Rationale |
|------|------------|-----------|
| Zustand | Bestehender Tab-Zustand, erweitert | Gruppen ändern sich immer zusammen mit Tabs; ein zweiter Speicher bräuchte Abgleich |
| Speicherung | Bestehende Space-Datei, zwei optionale Felder | Gruppen gehören zu genau einem Space (BR-1); abwärtskompatibel ohne Umstellung |
| Oberfläche | Bestehende UI-Bausteine des Projekts | Keine neue Abhängigkeit |

### Trade-offs

| Decision | Pro | Con | Mitigation |
|----------|-----|-----|------------|
| Zugehörigkeit am Tab statt Mitglieder-Liste an der Gruppe | BR-2 durch die Form gegeben; passt zum Muster `spaceId`; jede Tab-Änderung trägt die Zugehörigkeit mit | Zusammenhang (BR-3) ist nicht durch die Form gegeben | SVC-3 nach jeder Änderung; NFR-4 |
| Gruppe existiert nur über ihre Mitglieder | Leere Gruppen können nicht übrig bleiben (BR-4) | Metadaten ohne Mitglied müssen verworfen werden | SVC-3 |
| Aufklappen über eine Regel am aktiven Tab statt an jedem Sprung-Aufrufer | Über 20 Aufrufstellen müssen nichts wissen; neue Sprünge erben die Regel | Aktionen, die bewusst eingeklappt lassen, müssen den aktiven Tab im selben Schritt wechseln | API-7 und API-2 tun das; Test in NFR-4 |
| Gespeicherter Verweis als Position in der Gruppen-Liste des Space | Kein dauerhafter Bezeichner nötig; Tab-Ids sind ohnehin je Start neu | Verweise hängen an der Listen-Reihenfolge | Schreiben und Laden in einer Funktion (SVC-15); VAL-3 |
| Position der Gruppe nicht eigens gespeichert | Eine Quelle für die Reihenfolge (Tab-Array) | – | – |
| Sammelzeichen als eigene Funktion statt Umbau der Tab-Funktion | INV-16 bleibt unberührt | Zwei ähnliche Funktionen mit umgekehrter Priorität | Beide in derselben Datei, je mit Test; BR-21 nennt den Grund |

---

## Anti-Slop Dispositions

> No requirement IDs — context

| # | class | subject | decision | Rationale | guard_obligation | Implementation |
|---|-------|---------|----------|-----------|------------------|----------------|
| 1 | k2_knowledge_copy | Welche Tabs sind in der Leiste sichtbar/navigierbar (Streifen eines Space) | consolidate | Sonst müsste die Einklapp-Regel an 6 Stellen einzeln nachgezogen werden (PM, Q&A 1) | -- | SVC-1; MIG-1, MIG-5; Sweep criterion |
| 2 | k4_pattern_fork | Tab-Wechsel: drei Wege wählen das nächste Ziel | consolidate | Alle drei beziehen die sichtbaren Tabs aus SVC-1; Reihenfolge und Randverhalten je Weg bleiben gewollt verschieden (PM, Q&A 2; INV-3, INV-12, INV-13) | -- | SVC-1; MIG-1, MIG-5 |
| 3 | k1_dual_mechanism | Tab in anderen Space verschieben (zwei Schreib-Pfade) | consolidate | Der Gruppen-Austritt steht an einer Stelle und gilt für beide Wege (PM, Q&A 3) | -- | SVC-14; MIG-1 |

---

## Open Questions

> No requirement IDs — context

| # | Question | Options | Recommended | Decision |
|---|----------|---------|-------------|----------|
| – | keine | – | – | – |

---

## Research Log

> No requirement IDs — context

| Date | Area | Finding |
|------|------|---------|
| 2026-11-23 | Codebase (Scan) | 17 Muster, 3 Anti-Slop-Funde, 18 Invarianten (12 mit Test, 6 ohne); siehe `codebase-scan.md` |
| 2026-11-23 | Codebase | Der Nachfolger beim Schließen kennt nur den Space; der letzte Tab eines Space lässt sich nicht schließen (`src/modules/tabs/lib/useTabs.ts:460`) |
| 2026-11-23 | Codebase | Ein einzelner letzter Tab, der den Space wechselt, zieht die Ansicht mit (`src/modules/tabs/lib/useTabs.ts:626`); Space-Entfernung entfernt Tabs, verschiebt sie nicht (`src/modules/tabs/lib/useTabs.ts:514`) |
| 2026-11-23 | Codebase | Speichern vergleicht je Space die gespeicherten Tabs als Text; reine Gruppen-Änderungen würden ohne Erweiterung kein Schreiben auslösen (`src/modules/spaces/lib/useSpacePersistence.ts:41`) |
| 2026-11-23 | Codebase | Die Prüfung des gespeicherten Space-Zustands beachtet nur `tabs` und `activeTabIndex` (`src/modules/spaces/lib/validate.ts:18`); zusätzliche Felder stören ältere Versionen nicht |
| 2026-11-23 | Codebase | Untermenüs für das Rechtsklick-Menü sind vorhanden (`src/components/ui/context-menu.tsx:43`); Schließen-Dialoge liegen in `src/app/components/CloseDialogs.tsx` |
| 2026-11-23 | Codebase | Kein `bindings.md`, kein `zip.config.json`: keine Bindungs-Regeln, keine Legacy-Parität |
| 2026-11-23 | Web (aus der Discovery) | Chrome und Warp: Gruppen-Kopf, Einklappen, Überspringen eingeklappter Gruppen; Chrome zeigt beim Schließen des letzten sichtbaren Tabs einen Tab einer eingeklappten Gruppe |

---

## Q&A Log

> No requirement IDs — context

| # | Question | Recommendation | Answer | Alternative & consequence | Mode | Wirkung | Anforderungen |
|---|----------|----------------|--------|---------------------------|------|---------|---------------|
| 1 | Fund 1: Die Frage „welche Tabs gehören zur Leiste des Space" steht an 6 Stellen; mit Gruppen kommt „nicht eingeklappt" dazu. Zusammenführen, getrennt lassen mit Wächter-Test, oder kein echter Fund? | Zusammenführen, damit das Überspringen nirgends vergessen wird | Zusammenführen | Getrennt mit Wächter: weniger Umbau, dauerhaft mehr Stellen. Kein Fund: Stellen einzeln, ohne Schutz | interaktiv | technisch | BR-9 |
| 2 | Fund 2: Drei Wege wählen den nächsten Tab mit je eigener Reihenfolge. Gleiche Quelle für die sichtbaren Tabs, einen Weg zum Standard machen, oder kein echter Fund? | Gleiche Quelle; Reihenfolge und Randverhalten bleiben | Gleiche Quelle für alle drei | Ein Standard-Weg: würde heutiges Verhalten ändern (z. B. Wischen läuft am Rand weiter) | interaktiv | technisch | BR-9, INV-12, INV-13 |
| 3 | Fund 3: Zwei Wege verschieben einen Tab in einen anderen Space; die Regel „Tab verlässt seine Gruppe" müsste in beiden stehen. Zusammenführen, getrennt mit Wächter-Test, oder kein echter Fund? | Zusammenführen | Zusammenführen | Getrennt mit Wächter: Regel doppelt, Test prüft beide | interaktiv | technisch | BR-17 |
| 4 | Bestätigst du die 18 erhobenen Verhaltensweisen der heutigen Tab-Leiste als Schutzliste für den Bau (12 mit Tests, 6 per QA)? „Tab nach Nummer" und Durchschalten werden nur um „sichtbar" verfeinert. | Bestätigen; keine widerspricht den Gruppen | Bestätigt | Mit Änderung: Liste wäre angepasst worden | interaktiv | fachlich | INV-1 bis INV-18, BR-9 |
| 5 | Lücke: Der letzte sichtbare Tab eines Space wird geschlossen, es gibt aber eingeklappte Gruppen. Nächste Gruppe klappt auf, neues Terminal, oder Schließen verweigern? | Nächste Gruppe klappt auf (wie Chrome; kein leeres Terminal) | Nächste Gruppe klappt auf | Neues Terminal: Geparktes bleibt geparkt, aber Schließen erzeugt sofort einen neuen Tab. Verweigern: ohne erkennbaren Grund | interaktiv | fachlich | BR-24, EP-8 (in discovery.md nachgezogen) |
| 6 | Lücke: „Close group" auf eine Gruppe mit allen Tabs des Space. Schließen und neues Terminal, letzten Tab offen lassen, oder Aktion ausgrauen? | Schließen und neues Terminal (wie beim Verschieben einer Gruppe) | Schließen, neues Terminal | Letzten offen lassen: Aktion lässt überraschend einen Tab übrig. Ausgrauen: erst anderen Tab öffnen | interaktiv | fachlich | BR-25, EP-9 (in discovery.md nachgezogen) |
| 7 | Welcher Tab wird aktiv, wenn du in einen Space wechselst, an dessen Ende eine eingeklappte Gruppe steht? Heute wird immer der letzte Tab des Space aktiv; mit Gruppen würde das die geparkte Gruppe bei jedem Space-Wechsel aufklappen. | Der letzte sichtbare Tab; nur wenn es keinen gibt, der letzte Tab des Space, dessen Gruppe aufklappt. Passt zu „Durchschalten überspringt eingeklappte Gruppen" und zur Regel beim Schließen des letzten sichtbaren Tabs | Der letzte sichtbare Tab, sonst der letzte Tab mit Aufklappen | Immer der letzte Tab wie heute: geparkte Gruppen am Ende der Leiste klappen bei jedem Space-Wechsel auf | automatisch | fachlich | Anforderungen: BR-9, BR-10, BR-24 · weicht ab: — |
| 8 | Die Discovery sieht am Gruppen-Kopf beides vor: Klick klappt um, Doppelklick startet Umbenennen. Ein Doppelklick löst aber vorher zwei Klicks aus; bei der Gruppe mit dem aktiven Tab würde er erst einklappen (aktiver Tab wechselt, notfalls entsteht ein neues Terminal), dann aufklappen, dann umbenennen. Wie spielen Klick und Doppelklick zusammen? | Der Kopf reagiert nur auf den einfachen Klick; Umbenennen über „Rename group" im Menü und von selbst nach dem Anlegen. Einklappen bleibt sofort und ohne Nebenwirkung | Nur Klick am Kopf; Umbenennen über das Menü | Klick erst nach kurzer Wartezeit auswerten: Doppelklick bliebe, aber jedes Einklappen wirkt verzögert. Doppelklick nur auf dem Namen aufgeklappter Gruppen: uneinheitlich | automatisch | fachlich | Anforderungen: UI-1, TR-7, TG-5 · weicht ab: UI-1, TR-7, TG-5 |
| 9 | Gate 1 nach der Korrekturrunde: Eine neue Aussage der Architektur (geparkte Sessions liefen nach einem Neustart erst nach dem Aufklappen wieder an, das Sammelzeichen zeige bis dahin nichts) ist widerlegt; tmux-Sessions laufen weiter und ihr Zustand „arbeitet" erreicht das Sammelzeichen. Die eine Korrekturrunde ist verbraucht. Berichtigen und weiter, berichtigen und nochmal prüfen, oder anhalten? | Berichtigen und weiter: der Bauumfang ändert sich nicht, nur der Satz muss stimmen; dazu drei kleine Nachträge und eine QA-Auflage | Berichtigen und weiter | Nochmal prüfen: weiterer Prüflauf über die berichtigten Stellen. Anhalten: kein Commit, kein PR | interaktiv | technisch | OB-15 |
