# Malicious Intent Scan (L2)

**Feature:** 2026-10-20-upstream-sync-090 · **Branch:** upstream-sync-090 · **Date:** 2026-10-28 · **Scan Mode:** L2_semantic

Diff-Basis: `git diff 68d45d0..HEAD` (127 Dateien, 27 Commits; Port von crynta/terax-ai v0.9.0 auf Version 0.8.7). Bewertet wurden nur hinzugefügte Zeilen.

## Summary
**Verdict:** PASS
**Findings:** 4 (0 HIGH, 0 MEDIUM, 4 LOW advisory) · **Files Scanned:** 127

| Lens | Status | Findings |
|---|---|---|
| Code Execution (MI-01/02/07/08) | PASS | 2 (LOW) |
| Data Exfiltration (MI-03/04/06) | PASS | 1 (LOW) |
| Supply Chain (MI-05/09/10) | PASS | 1 (LOW) |

Geprüfte Hot Paths ohne Befund:
- `.github/workflows/ci.yml`: nur `persist-credentials: false` an vier `actions/checkout`-Schritten. Das ist Härtung (kein Token mehr in `.git/config` des Runners). Kein neuer Trigger, kein `pull_request_target`, keine neuen `secrets.*`, keine Berechtigungsänderung, keine Ausdrücke aus PR-Titel/Body in `run:`.
- `package.json`: nur Versionsanhebungen bekannter Pakete und `@lezer/highlight` auf `catalog:`. Keine neuen `scripts`, keine Install-Hooks, keine neuen Direktabhängigkeiten. `@tauri-apps/*` von `^` auf `~` verengt (strengere Pins, nicht gelockert).
- `pnpm-workspace.yaml`: `minimumReleaseAge: 4320` und `minimumReleaseAgeStrict` bleiben, `allowBuilds` unverändert; neu sind nur Catalog und Override für `@lezer/highlight` 1.2.5 (Deduplizierung, im Test `dist-budget` begründet).
- `src-tauri/Cargo.toml`: Version 0.8.7, Tauri-Crates von `"2"` auf `~2.x` verengt, `dirs` 6 auf 7, `url` neu (genutzt in `net.rs`), `bytes`/`grep-matcher` entfernt, `tokio` Feature `time`, zusätzliche objc2-/windows-sys-Features für Pasteboard und No-Replace-Rename.
- `vite.config.ts`: `manualChunks` durch `codeSplitting`-Gruppen ersetzt, reine Chunk-Zuordnung, keine Plugins oder Netzwerkzugriffe neu.
- `scripts/dist-graph.mjs`: liest nur Dateien unter dem übergebenen `dist`-Verzeichnis (`readFileSync`), parst HTML/Sourcemaps per Regex, kein Prozessstart, kein Netzwerk, kein `eval`.
- `src-tauri/src/modules/net.rs` (+ `net/clients.rs`, `net/ip.rs`): der bestehende AI-HTTP-Proxy wird gehärtet (Userinfo-Verbot, Metadata-Hosts gesperrt, DNS-Pinning, Redirect-Policy, IPv4-mapped/NAT64/6to4/Teredo-Klassifizierung, Client-Cache). Keine neuen Ziele, keine Datenquelle außer den Aufrufparametern des Frontends.
- `TERAX.md` (wirkt als CLAUDE.md): nur sachliche Architektur-Ergänzungen (fs_copy, Fenster-Sichtbarkeit, Lezer-Gotcha). Keine Agent-Direktiven, keine Prompt-Injection.
- Specs, Evidence, Gate-Log: Dokumentation, keine Injection-Phrasen, keine Secrets gefunden.
- Secret-Muster (AWS, GitHub, Stripe, Slack, Google, Anthropic, OpenAI, Private Keys) in allen hinzugefügten Zeilen: 0 Treffer.
- Frontend (`src/`): dynamische `import()` nur mit Literalpfaden (Lazy-Loading), Icon-SVGs als `data:`-URL aus dem gebündelten `@iconify-json/catppuccin`, kein `innerHTML`, kein `fetch`, keine Codierungs- oder Obfuskationsmuster.

## Findings

### MIS-1: Base64-kodierter Python-Helper wird per SSH auf dem Host ausgeführt
**Pattern:** MI-02 (Encoded Payloads) / MI-07 (Process Spawning) · **Lens:** Code Execution · **Severity:** LOW · **Confidence:** LOW · **OWASP:** ASI05, LLM05, AST01
**Location:** `src-tauri/src/modules/ssh.rs:1009`
**Matched content:** ```shell_command(&format!("python3 -c \"$(printf %s {b64} {HELPER_DECODE}\""))```
**Analysis:** Das Muster decode-then-execute ist formal ein Treffer, die Quelle ist aber die Compile-Zeit-Konstante `REMOTE_PYTHON` (Klartext im Repo, Zeile 218 ff.), nicht ein externer Wert. Der Mechanismus besteht schon in der Basis (dort Zeile 782 f.); der Diff kapselt ihn nur in `remote_command()` mit `OnceLock` und hängt `; exit` an (Exit-Code-Erkennung bei gekilltem Helper). Neu im Helper sind die Ops `mkstage` (`tempfile.mkdtemp` mit Präfix `.terax-copy-`), `exists`, `write_bytes` mit `mode` und `publish` (Hardlink bzw. exklusive Platzhalter-Reservierung, kein Überschreiben). Ich habe den gesamten Helper nach der Normalisierung gelesen: keine Netzwerk-Imports, kein `subprocess`/`os.system`/`exec`, nur Dateioperationen auf Pfaden aus dem JSON-Request. `rmtree` beim Publish greift nur auf Namen, die `_staging()` als Staging-Ordner erkennt. Der ssh-Aufruf nutzt feste Argumente plus `validate_ssh_host(host)`; der Request läuft über stdin, also ohne Shell-Quoting-Fläche.
**Recommendation:** Keine Änderung nötig. Die Base64-Hülle nur aus `REMOTE_PYTHON` speisen und den Helper bei Reviews weiter als Klartext prüfen.

### MIS-2: Lokale Dateibytes werden auf einen SSH-Host hochgeladen (fs_copy, write_bytes)
**Pattern:** MI-03 (Data Exfiltration) · **Lens:** Data Exfiltration · **Severity:** LOW · **Confidence:** LOW · **OWASP:** LLM02, ASI02, AST01
**Location:** `src-tauri/src/modules/ssh.rs:1535`
**Matched content:** ```"op": "write_bytes", "path": format!("{item}{rel}"), "b64": b64encode(&bytes), "mode": mode,```
**Analysis:** Quelle sind lokale Dateien, Senke ist der Remote-Helper über die ControlMaster-Verbindung. Ausgelöst wird der Fluss nur durch eine Benutzeraktion: Cmd+V oder das Kontextmenü "Paste" im Explorer (`FileExplorer.tsx:459`, `:581`) mit Finder-Pfaden aus `fs_clipboard_paths`, oder Drag-and-drop (`useExplorerFileDrop.ts:79`). Ziel ist der Host, mit dem der Benutzer verbunden ist, kein fest kodierter Endpunkt. Jedes Element läuft durch `guard_read`/`guard_link`/`guard_entry` (`copy.rs:284-310`) mit der Lese-Policy des Editors; Tests belegen, dass `.ssh`, `gcloud` und Symlink-Umwege zu solchen Ordnern abgewiesen werden. Hintergrund- oder versteckte Uploads gibt es nicht. Ein Datenfluss ohne Täuschungsabsicht, deshalb nur ein Hinweis.
**Recommendation:** Keine Änderung nötig. In der QA kurz bestätigen, dass ein Paste aus `~/.ssh` bzw. `~/.aws` auf einen SSH-Host mit "protected directory" scheitert.

### MIS-3: Test startet einen vite-Build als Kindprozess
**Pattern:** MI-07 (Process Spawning) · **Lens:** Code Execution · **Severity:** LOW · **Confidence:** LOW · **OWASP:** ASI05, AST01
**Location:** `src/app/dist-budget.test.ts:165`
**Matched content:** ```execFileSync(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "build", "--outDir", outDir, ...])```
**Analysis:** `execFileSync` ohne Shell, fester Binärpfad (`process.execPath`), Literalargumente; einziger variabler Wert ist `outDir` aus `mkdtempSync` im System-Temp, das `afterAll` wieder löscht. Die Umgebung wird nur um `NODE_ENV=production` ergänzt, nichts wird nach außen gesendet. Testkontext. Ähnlich: die Rust-Tests in `ssh.rs` starten lokal `python3 --version` bzw. `bash -c` mit einem fest kodierten Kill-Snippet, und `copy.rs:1198` startet `git init -q` in einem Tempdir (alles `#[cfg(test)]`).
**Recommendation:** Keine Änderung nötig.

### MIS-4: Lockfile-Umbau mit neuen transitiven Paketen und Crates
**Pattern:** MI-10 (Lock File Manipulation) · **Lens:** Supply Chain · **Severity:** LOW · **Confidence:** LOW · **OWASP:** LLM03, ASI04, AST02
**Location:** `pnpm-lock.yaml:5177`, `src-tauri/Cargo.lock`
**Matched content:** ```systeminformation@5.33.16: resolution: {integrity: sha512-R+Lh69IJ...}```
**Analysis:** Die Lock-Änderungen passen zu den Manifest-Änderungen (kein Lock ohne Manifest). Alle 1099 npm-Pakete haben `sha512`-Integrity, es gibt keine `tarball`-, `git+`- oder `file:`-Quellen. Alle hinzugefügten Cargo-Quellen sind `registry+https://github.com/rust-lang/crates.io-index`. 20 npm-Pakete sind neu, alle transitiv über Dev-Tooling: `shadcn` 4.22 bringt `@shadcn/registry`, `cn` und `@dotenvx/dotenvx`, das wiederum `systeminformation` und `@dotenvx/primitives` mitbringt; dazu Sentry/OpenTelemetry-Unterpakete und die `cacheable`/`keyv`/`hookified`-Familie über `flat-cache`. Neue Crates (26) stammen aus Tauri 2.12 bzw. den Plugin-Upgrades (z. B. `smappservice-rs` für autostart, `jiff`, `zlib-rs`, `borsh`). `systeminformation` ist bekannt und weit verbreitet, hat `hasBin` und frühere Command-Injection-CVEs, wird hier aber nur als Dev-Abhängigkeit des shadcn-CLI geladen und nicht von App-Code importiert. Paketalter, Downloads und Maintainer lassen sich aus dem Diff nicht prüfen; der projektweite `minimumReleaseAge` von 3 Tagen mildert das Risiko frisch kompromittierter Versionen.
**Recommendation:** Optional `pnpm why systeminformation` und `pnpm audit --prod` einmal laufen lassen; `cargo audit` vor dem Release. Kein Blocker.

## Notes
- LOW-confidence findings are advisory; they do not trigger FAIL.
- L1 (GitHub Action, regex) complements this scan - both layers coexist.
- Die von L1 gemeldete "dynamic execution in added lines" geht auf MIS-1 (Remote-Helper), MIS-3 (Test-Kindprozesse) und Literal-`import()` für Lazy-Loading zurück; nichts davon verarbeitet externe Eingaben als Code.
