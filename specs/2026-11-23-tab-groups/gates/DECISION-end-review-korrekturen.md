# DECISION: Korrekturen aus dem Delta-Lauf des End-Reviews (D2, D1, N)

- **Datum:** 2026-11-24
- **Kategorie:** `judgment` (D2 und N nach Ermessen; D1 `derived` aus der Architecture)
- **Ebene der Wurzel:** Implementierung (Fix-Commit `6f9e687`)
- **Anlass:** End-Review „Tab-Gruppen", Delta-Lauf über den Fix-Commit `6f9e687` („fix(feature): address review findings"). Nach dem einen vorgesehenen Fix-Auftrag bleibt ein bestätigter blockierender Befund (D2, Klasse `decision`), dazu ein durch den Fix erzeugter Befund (D1, `fix`) und ein Hinweis (N, `note`). Eine weitere Review-Runde ist nicht vorgesehen; diese Entscheidung bestimmt den einen weiteren Fix-Auftrag.
- **Quellen:** `gates/review-delta-quality.md` (RV-1 = D1, RV-2 = D2), `gates/review-delta-architecture.md` (DV-1 = D1, DV-2 = N), `gates/systemic-review.md` (E1, E2, F5), Gate-Log Zeilen 99–107, `git show 6f9e687`. Keine vorige DECISION für dieses Feature. Kein PM-Eintrag `run_steering` im Gate-Log.

---

## Wurzel

Alle drei Befunde stammen aus `6f9e687` und haben dieselbe Mechanik: **Jede der drei Korrekturen (E2, E1, F5) knüpft an einen beobachtbaren Zustand, der weiter reicht als der Anlass, den die Entscheidung bzw. der Ziel-Zustand benannt hat.** Der weitere Zustand trifft auch eine Nachbarlage, für die schon eine andere Regel festgelegt ist; die Korrektur überschreibt diese Regel ungewollt.

| Befund | Anlass laut Entscheidung / Ziel-Zustand | Bedingung im Code | Mitgetroffene Nachbarlage | Dort geltende Regel |
|---|---|---|---|---|
| D2 | E2: Die Prozess-Prüfung sieht nicht in tmux-Sessions hinein; „Close group" soll bei solchen Mitgliedern nachfragen | `groupMemberNeedsConfirm` legt jedes tmux-gebundene Terminal in dieselbe Menge `confirmIds`, aus der `planGroupClose` `m` zählt (`src/app/hooks/useTabCloseGuards.ts:41-49`, `:126-130`) | Ein eingehängtes, untätiges tmux-Terminal zählt in `m`; der Dialog nennt `m` weiter als „still have a running process or unsaved changes" (`src/app/components/CloseDialogs.tsx:51-55`). Mit restart-sicheren Sessions ist jedes neue lokale Terminal tmux-gebunden (`src/modules/tabs/lib/useTabs.ts:81-86`) | BR-15 (Bedeutung von `m`) und UI-8 (Text) stammen aus der Zeit vor E2; die E2-Entscheidung (Gate-Log Zeile 100) hat den Text nicht mitgezogen |
| D1 | E1: Der aktive Tab landet beim Ziehen im Space-Überblick in einer eingeklappten Gruppe → Nachbar wird aktiv, Gruppe bleibt zu | `keepActiveVisible` prüft nur „der aktive Tab liegt in einer eingeklappten Gruppe" (`useTabs.ts:707-710`) und wird auf jedes Ergebnis von `reorderTab` angewandt (`useTabs.ts:878-881`) | Der Nachfolger nach SVC-7 im verlassenen Space liegt in einer eingeklappten Gruppe → `activeAfterHide` findet dort nichts Sichtbares → neues Terminal, Gruppe bleibt zu | SVC-7, SVC-9, Q&A 5, BR-24, EP-8: der Nachfolger klappt seine Gruppe auf; `moveTabToSpace` (`useTabs.ts:828-832`) und `closeTab` tun das |
| N | F5: Das Umbenennen endet, wenn der Tab durch Einklappen nicht mehr gezeichnet wird | Effekt prüft `!tabIndex.has(editingId)` (`src/modules/tabs/TabBar.tsx:219-227`) | Ein Space-Wechsel entfernt den Tab ebenfalls aus `tabIndex` → der Entwurf wird gespeichert | NFR-5 (ohne Gruppen wie vorher: auf `main` ging der Entwurf verloren, das Feld erschien bei der Rückkehr wieder) |

Prüfung der Wurzel: Sie erklärt jeden der drei gemeldeten Befunde, und kein Befund des Delta-Laufs liegt außerhalb dieser Mechanik. Die Verträge aus slice-00 (`GroupClosePlan`, `planGroupClose`, `reorderTab`) und die Dokumente sind untereinander konsistent; die Wurzel liegt in der Umsetzung, nicht in einer Doc-Lücke. Einzig für D2 lässt die E2-Entscheidung offen, was der Dialog nach der Ausweitung von `m` sagt — das ist der Ermessensanteil.

---

## Entscheid

### D2 — Rückfrage-Text bei „Close group" (`judgment`)

**Wahl:** Der Dialog nennt jeden Grund, aus dem ein Mitglied zählt. `m` bleibt die Anzahl der Mitglieder, die eine Rückfrage auslösen (seit E2 einschließlich tmux-gebundener Terminals). Der Text lautet für `m ≥ 2` „{m} of them still have a running process or unsaved changes, or are bound to a tmux session." und für `m = 1` „1 of them still has a running process or unsaved changes, or is bound to a tmux session." Titel und Knöpfe bleiben. Das entspricht Weg (b) des Reviewers, mit einer Formulierung, die für jedes gezählte Mitglied wahr ist.

**Warum nicht (a), Text belassen und Grenze ausweisen:** Der Nutzer dieses Forks arbeitet mit restart-sicheren Sessions; damit ist praktisch jedes lokale Terminal tmux-gebunden und der Dialog würde bei fast jeder Gruppe einen laufenden Prozess behaupten. Das widerspricht dem Nutzer-Intent aus der Discovery („Rückfragen sollen stimmen", „Close group soll tun, was es sagt").

**Warum nicht (c), getrennt zählen und nennen:** Es verlangt einen neuen Vertrag (`GroupClosePlan` und `planGroupClose` aus slice-00), Textvarianten in zwei Dimensionen (Einzahl/Mehrzahl je Zähler) und eine Regel für Mitglieder, die tmux-gebunden sind *und* einen Vordergrundprozess melden. Vor allem wäre eine Zahl „davon k mit laufendem Prozess" für tmux-gebundene Mitglieder nicht belastbar: genau dort kann die Prozess-Prüfung nichts sehen — das war der Anlass von E2. Mehr Fläche ohne verlässlicheren Inhalt, in einer Runde ohne weiteres Review.

**Was die Dokumente offenlassen:** Discovery UI-8 (Screen „Rückfrage") und BR-15 definieren Text und `m` für die Welt vor E2. E2 legt fest, dass tmux-gebundene Mitglieder nachfragen, sagt aber nichts zum Text. Keine PM-Anweisung aus dem Lauf betrifft die Stelle.

### D1 — Nachfolger beim Ziehen über Space-Grenzen (`derived`)

**Wahl:** Der Ersatz-Weg aus E1 (`keepActiveVisible`) gilt in `reorderTab` nur für den Fall, den E1 benennt: der verschobene Tab ist nach dem Verschieben selbst der aktive Tab. Wählt SVC-7 im verlassenen Space einen Nachfolger, gilt für ihn die Aufklapp-Regel (SVC-9) wie bei `moveTabToSpace` und beim Schließen. Abgeleitet aus `architecture.md` SVC-7, SVC-9, Q&A 5 und `discovery.md` BR-24, EP-8; beide Delta-Reviewer kommen unabhängig zu diesem Ziel-Zustand. E1 (gleicher Space) und der Fall „letzter Tab des Space" bleiben unverändert.

### N — Umbenennen bei Space-Wechsel (`judgment`, bleibt)

**Wahl:** Ein angefangenes Umbenennen eines Tabs endet beim Space-Wechsel wie bei Fokusverlust: ein geänderter Name wird gespeichert, ein unveränderter nicht; bei der Rückkehr ist kein Feld offen. Kein Code-Eingriff.

**Grund:** Der Space-Wechsel ist für das Eingabefeld ein Fokusverlust, und Fokusverlust speichert im Bestand (`TabRenameInput`). Das frühere Verhalten (eingetippter Text verloren, leeres Feld erscheint bei der Rückkehr wieder) ist ein Datenverlust, kein zu bewahrendes Verhalten. Die Alternative — den Effekt auf „Tab noch im Space, nur durch Einklappen verdeckt" einengen — müsste zusätzlich den Entwurf (`renameDraft`) beim Space-Wechsel verwerfen, sonst speichert ein späteres Einklappen einen veralteten Namen; das ist mehr Code und ein neuer Fehlerpfad, um einen Datenverlust zu erhalten. Die Abweichung von NFR-5 wird ausgewiesen.

---

## Bindende Anforderungen für die Umsetzung

Beobachtbares Verhalten; Nachweis über die Prüfungen, die der Koordinator ohnehin fährt.

1. **„Close group", Rückfrage-Text.** Zeigt der Dialog die Zahl `m`, lautet der Text für `m ≥ 2` „{m} of them still have a running process or unsaved changes, or are bound to a tmux session." und für `m = 1` „1 of them still has a running process or unsaved changes, or is bound to a tmux session." Titel („Close {n} tabs?" / „Close 1 tab?") und Knöpfe („Cancel", „Close group") bleiben.
2. **„Close group", Zählung.** `m` ist die Anzahl der Mitglieder, die eine Rückfrage auslösen: ein Editor mit ungespeicherten Änderungen, ein Terminal mit Vordergrundprozess oder gescheiterter Prüfung, ein Terminal mit tmux-Bindung am Tab oder an einem Pane (E2). Jedes Mitglied zählt höchstens einmal. Für jedes gezählte Mitglied trifft mindestens einer dieser Gründe zu; ein Mitglied ohne einen dieser Gründe zählt nicht. `m = 0` schließt weiter sofort.
3. **Einzel-Schließen unverändert.** Das Schließen eines einzelnen Tabs fragt weiter nur bei ungespeicherten Änderungen, Vordergrundprozess oder gescheiterter Prüfung; ein untätiges tmux-gebundenes Terminal schließt einzeln ohne Rückfrage (E2 und E3 unverändert).
4. **Ziehen über Space-Grenzen, Nachfolger.** Wird der aktive Tab im Space-Überblick auf einen Tab eines anderen Space gezogen und bleiben im Herkunfts-Space nur Mitglieder eingeklappter Gruppen, wird dort der nächstgelegene dieser Tabs aktiv (links vor rechts) und seine Gruppe klappt auf; es entsteht kein neues Terminal. Das Ergebnis ist dasselbe wie bei „In Space verschieben" (`moveTabToSpace`) in derselben Lage.
5. **E1 bleibt.** Innerhalb desselben Space: Landet der aktive Tab auf einem Mitglied einer eingeklappten Gruppe, bleibt die Gruppe eingeklappt und ein sichtbarer Nachbar wird aktiv; ohne sichtbaren Nachbarn entsteht ein neues Terminal im übergebenen Ordner (unverändert zu `6f9e687`).
6. **Letzter Tab des Space bleibt.** War der gezogene aktive Tab der letzte seines Space und landet er in einer eingeklappten Gruppe eines anderen Space, folgt die Ansicht in den Ziel-Space und dort wird der sichtbare Nachbar aktiv (unverändert; `design-conformance.md`, „Beobachtung ohne Befund").
7. **Umbenennen bei Space-Wechsel.** Ein offenes Umbenennen eines Tabs endet beim Space-Wechsel wie bei Fokusverlust: ein geänderter Name wird gespeichert, ein unveränderter nicht; bei der Rückkehr ist kein Feld offen. Kein Code-Eingriff; Abweichung von NFR-5 ausgewiesen.

---

## Betroffene Verträge und Slices

| Slice | Änderung am Auftrag (`build-plan.md`) | Vertrag |
|---|---|---|
| slice-05-close-and-palette | AC 5 (Text) geändert; AC 1 und 2 präzisiert („ohne tmux-Bindung"); AC 11 neu (Zählung und Text bei tmux-Bindung, Einzel-Schließen unverändert) | `GroupClosePlan`, `planGroupClose`, `closeConfirmReason`, `useTabCloseGuards (Rückgabe)`, `CloseDialogs (Props)` unverändert |
| slice-02-tab-state | AC 30 neu (Nachfolger beim Ziehen über Space-Grenzen) | `reorderTab` (Signatur, Rückgabewert) unverändert |
| slice-04-tab-strip | AC 25 neu (Umbenennen bei Space-Wechsel, Prüfweg QA) | keine; kein Code |

Kein Contracts-Ledger vorhanden. `discovery.md` und `architecture.md` bleiben unverändert; die Abweichungen stehen hier und im Gate-Log.

**Bekannte Grenze (kein Scope-Cut, nur Einordnung):** Was *in* einer tmux-Session läuft, kann die App weiterhin nicht feststellen (E2, Alternative „Abfrage im Rust-Teil" außerhalb des Umfangs). Der Dialog behauptet es deshalb auch nicht mehr; er nennt die tmux-Bindung als eigenen Grund.

---

Anforderungen: BR-15, UI-8, SVC-13, BR-23, SVC-7, SVC-9, BR-24, EP-8, INV-17, NFR-5, MIG-3 · weicht ab: BR-15, UI-8, NFR-5

**PM-Review empfohlen:** Die Dokumente legen fest, dass tmux-gebundene Mitglieder beim Schließen einer Gruppe nachfragen (E2), aber nicht, was der Dialog dann sagt — ob er die tmux-Bindung nur als weiteren Grund nennt (gewählt), sie getrennt zählt oder verschweigt, war offen; ebenso offen war, ob das Speichern eines angefangenen Umbenennens beim Space-Wechsel als Verbesserung durchgeht oder als Verstoß gegen „ohne Gruppen wie vorher" (NFR-5) zurückgenommen werden soll.
