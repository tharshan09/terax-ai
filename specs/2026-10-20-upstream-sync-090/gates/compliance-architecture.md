# Gate 1: Architecture Compliance (zusammengeführt)

Durchgang 1, Fan-out über die Perspektiven `code`, `data`, `runtime`, `ui`. Einzelreports: `compliance-architecture-{code,data,runtime,ui}.md`. Skript-Ergebnis Arch-Precheck: PASS (attempt 2), Hinweis AR-7.

| Perspektive | Verdict | decision | refuted | fix | obligation | note |
|---|---|---|---|---|---|---|
| code | FAILED | 0 | 1 | 2 | 8 | 5 |
| data | FAILED | 2 | 1 | 3 | 7 | 6 |
| runtime | FAILED | 0 | 2 | 2 | 12 | 6 |
| ui | APPROVED | 0 | 0 | 6 | 3 | 6 |

## Blockierende Befunde (zusammengeführt)

| ID | Klasse | found_by | Kern | Quell-IDs |
|---|---|---|---|---|
| B1 | refuted | code, data | Upstream-SSRF-Tests übergeben geklammerte IPv6-Literale; Fork `net.rs:90` und `:281` parsen ohne `trim_matches(['[',']'])` (kam upstream mit `0a6e511`). MIG-5/VAL-8 „Literal-Hosts ohne DNS" hält nicht. | code F-01, data DA-2 |
| B2 | decision | data | Upstream `ip.rs` erkennt eingebettete IPv4 nur im Well-Known-Präfix `64:ff9b::/96`; `64:ff9b:1::/48` mit eingebetteter Metadaten-IPv4 wird Private, mit Opt-in durchgelassen. BR-16/VAL-8 versprechen Auswertung der eingebetteten IPv4. | data DA-1 |
| B3 | decision | data | Staging-Ordner `.terax-copy-*` im Zielordner ist bei `showHidden=true` im Baum sichtbar, nach SSH-Abbruch bleibt er stehen; SEC-4 „Teilkopien nie sichtbar". | data DA-3 |
| B4 | refuted | runtime | Gebauter Output: `index.html` und `settings.html` laden `ai-anthropic`, `ai-cerebras`, `ai-sdk-shared` (~546 KB) vor, weil `manualChunks` React in `ai-sdk-shared` legt. Q&A #12/MIG-62 „AI-SDK schon lazy" widerlegt; Upstream `f6f0004` ersetzt `manualChunks` durch `codeSplitting.groups`. | runtime R-1 |
| B5 | refuted | runtime | INV-19 „Startpaket enthält kein @ai-sdk … covered durch eager-budget.test.ts"; der Test verfolgt nur Quell-Imports, der Build-Output enthält das AI-SDK. | runtime R-2 |

## fix-Befunde (zusammengeführt)

- X1 Guard MIG-27 / Sweep: `*.test.ts(x)` vom Scan ausnehmen (code F-02, runtime F-2, ui F-3).
- X2 INV-6 Source um Upstream-ip.rs-Tests ergänzen, Coverage `partial` bis dahin, Assertion `0.0.0.0 → Loopback` (code F-03, data DA-5).
- X3 Database/Entities: Spaces-Store und `terax.sidebar.collapsed` nennen (data DA-4).
- X4 Sweep SSRF: `grep -rn` (data DA-6).
- X5 NFR-1/Monitoring: Zähler erfasst `git_status` und `git_panel_snapshot` (runtime F-1).
- X6 Q&A #24 Begründung ohne `motion` (ui F-1).
- X7 MIG-40 legt `@keyframes terax-icon-in`/`.terax-icon-in` an (ui F-2).
- X8 MIG-45 nennt alle Watcher-Stellen inkl. `useFileTree.ts:163`, `:178-180`, alles über Registry (ui F-4).
- X9 discovery.md:145 „erstes neues Element ausgewählt" (ui F-5).
- X10 MIG-41 Test verlangt `--animate-spin`, `--animate-pulse`, `terax-shimmer` mit `steps()` in `globals.css` (ui F-6).

## Auflagen

Gehen nach `obligations.md` (OB-n), zusammengeführt aus code F-04..F-10, F-16; data DA-7..DA-13; runtime O-1..O-12; ui O-1..O-3.

## Hinweise

code F-11..F-15, data DA-14..DA-19, runtime N-1..N-6, ui N-1..N-6 (siehe Einzelreports).
