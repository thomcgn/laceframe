# Teststrategie

DEV-01 ersetzt die automatische LF-00-Risikoeskalation. Die unveröffentlichte Entwicklungsanwendung verwendet einen schnellen Standardcheck; Desktop-Regressionen bleiben bewusst auswählbar. Maßgeblich sind `scripts/quality-runner.cjs`, `quality-build.cjs` und `.github/workflows/quality.yml`. Ergebnisse und Messungen gehören in den PR, keine neuen Prüfberichte.

## Entwicklung und PR

Während der Implementierung nur unmittelbar betroffene Tests, etwa `npx vitest run tests/color-consistency.test.ts`. Typecheck nach Bedarf, Lint gezielt (`npx eslint <dateien> --max-warnings 0`) oder vor größeren Meilensteinen. Keine volle Unit-Suite nach jeder Änderung, keine automatische Paketierung und kein eigenmächtiger FULL-Lauf.

Vor dem PR einmal `npm run check:dev`. Nach PR-Erstellung den GitHub-Status prüfen; gleiche lokale Prüfungen ohne neue Änderung, Fehler oder konkrete Unsicherheit nicht wiederholen. Änderungen an IPC/Dateizugriff/Persistenz benötigen passende Sicherheits-/Migrations-/Kompatibilitätstests; Bildalgorithmen benötigen gezielte Pixel-/Alpha-/Schutzbereichstests. Diese Pflicht bleibt unabhängig vom schlanken PR-Workflow. Assertions nicht abschwächen und Fehler nicht ignorieren.

| Befehl | Tatsächlicher Umfang |
| --- | --- |
| `npm run check:dev` | Typecheck, alle Vitest-Tests mit zwei Workern, Git-Diff-/Index-Whitespacecheck. Kein Lint, Build, Desktop oder Native. |
| `npm run lint` | Eigenständiger vollständiger Lint ohne Warnungen. |
| `npm run check:smoke -- <workflow>` | Genau ein ausdrücklich gewählter Desktop-Workflow; vorher gültiges Build wiederverwenden oder einmal paketieren. Keine automatische zusätzliche Suite. |
| `npm run check:full` | Typecheck, vollständiger Lint, alle Units, Whitespacechecks, ein verifiziertes Build, alle bisherigen Desktop- und Native-Smokes sequenziell. Nur manuell oder ausdrücklich beauftragt. |

Die bisherigen `classify:changes`, `check:fast` und `check:targeted` entfallen; alte README-/PR-Beispiele dazu sind durch diese Befehle ersetzt. Es gibt keine LOW/MEDIUM/HIGH-Klassifizierung, automatische Gruppenwahl oder Eskalation mehr. Unbekannte Smoke-Namen und fehlende Auswahl sind Fehler, kein FULL-Fallback. Lokal prüft der Diff-Check gegen HEAD und den Index; CI prüft zusätzlich alle committed PR-Änderungen gegen die tatsächliche Base-SHA (`QUALITY_DIFF_BASE`).

## Desktop gezielt auswählen

| Workflow | Einzelnes Skript unter `scripts/` |
| --- | --- |
| `creator` | `creator-smoke.cjs` |
| `expressions` | `expression-designer-smoke.cjs` |
| `color` | `color-consistency-smoke.cjs` |
| `cutout` | `smart-cutout-smoke.cjs` |
| `relighting` | `relighting-smoke.cjs` |
| `desktop` | `desktop-smoke.cjs` (manueller Create-/Projektworkflow) |
| `quality` | `quality-smoke.cjs` |
| `cutout-stability` | `cutout-stability-smoke.cjs` |
| `style` | `style-analysis-smoke.cjs` |
| `packs` | `packs-smoke.cjs` |
| `native` | `native-smoke.cjs` (deterministischer App-Server) |

Beispiel: `npm run check:smoke -- creator`. Weitere Workflows bei Bedarf einzeln aufrufen. Alle elf vorhandenen GUI-Skripte und alle fachlichen Unit-/Integrationstests bleiben erhalten; ausschließlich Tests der entfernten Routing-/Gate-Policy werden durch Tests der neuen Profile, CLI, CI-Verzweigung, Fehlerweitergabe und sicheren Build-Wiederverwendung ersetzt. `npm run test:desktop` und `npm run test:desktop:native` bleiben als vollständige Suites verfügbar. Dev-Smoke: separate Instanz mit `npm run start -- -- --remote-debugging-port=9232`, dann `npm run test:dev`.

`npm ci` mit Lockfile; Desktop-Smokes benötigen Linux x64 mit grafischer Sitzung oder Xvfb und Electron-Systembibliotheken. Bestehende Skripte starten `out/Laceframe-linux-x64/laceframe`. `out/.quality-build.json` prüft Runtime-/Buildinputs, Paket-/Lockdaten einschließlich installiertem Lockfile, Plattform/Architektur/Node-Version und SHA-256 von Binary/app.asar. Docs, Tests, CI, Testskripte und `.vscode` sind keine Runtimeinputs. Forge-/Vite-Konfiguration, Quellcode und Abhängigkeiten bleiben enthalten. Fehlende, veränderte oder symlinkbasierte Artefakte werden nicht wiederverwendet; keine Wiederverwendung fremder PR-Builds. Änderungen an installierten Abhängigkeiten außerhalb des Lockfiles sind nicht unterstützt.

`artifacts/quality/<profil>.json` enthält tatsächlich ausgeführte Befehle, monotone Dauer, Exitcodes, Status und gebaut/wiederverwendet/nicht erforderlich. Fehler stoppen die Ausführung; Abbruch wird weitergereicht. Nicht ausgeführte Desktoptests gelten nicht als bestanden. Befehle haben 20 Minuten Timeout. Speicherintensive Prüfungen sequenziell; kein automatischer mehrfacher Build.

## GitHub Actions und Grenzen

Ein **pull_request gegen main** startet genau einen Job mit dem stabilen Namen **`quality-gate`**: Node 24, `npm ci`, `check:dev`, Prüfung des abgeschlossenen Profilnachweises. Kein automatischer Lint, Electron-Download/Build/Start, Playwright-Browserdownload, Desktop-Setup, Xvfb oder Native-Smoke. Die npm-Dev-Abhängigkeiten bleiben installiert; nur die für Units unnötigen Browser-/Electron-Binärdownloads werden ausgelassen. Gepinnte Actions, read-only Contents, npm-Cache und Abbruch überholter Läufe bleiben bestehen. Ein fehlgeschlagener/abgebrochener Check erzeugt keinen erfolgreichen Job; kein `continue-on-error`. Profile/Diagnosen werden sieben Tage aufbewahrt.

**workflow_dispatch** führt ausdrücklich FULL im selben Job aus, einschließlich Desktop-Systemabhängigkeiten, Xvfb/Openbox/D-Bus und der bisherigen elf Smokes. Kein `push`-Trigger auf main: nach Merge läuft dieselbe Regression nicht erneut. Ohne Merge Queue wird der endgültige Merge-Commit nicht separat geprüft. PR-Checks prüfen den jeweiligen PR-Merge-Ref; spätere Baseänderungen können den finalen Merge verändern. Kein `merge_group` konfiguriert.

Repository-Audit 18.11.2026: `main` meldet `protected: false`. Der stabile Statuscheck ist vorhanden, wird aber ohne Branchschutz/Ruleset nicht automatisch erzwungen. Der Besitzer muss PR-Pflicht und `quality-gate` konfigurieren; Codex ändert Schutzregeln nicht eigenmächtig. Der schnelle Check ersetzt keine manuell gewählte vollständige GUI-Regression. Linux ist geprüft, Windows/macOS bleiben offen.

Die installierte Playwright-Electron-Instrumentierung ergänzt unter Linux `--no-sandbox`; Produkt-Sandbox, Context Isolation, Node-Verbot und IPC-Assertions bleiben erhalten. Bei Änderungen dieser Grenze zusätzlich normalen OS-Sandbox-Start über Dev-Smoke prüfen. Tests verwenden synthetische Bilder/temporäre Projekte. Native-Smokes injizieren das ausdrücklich bezeichnete `tests/support/fake-codex.mjs` über Test-PATH in die echte Prozess-/IPC-/Importstrecke; kein Produktionsfallback, kein Modellqualitätsnachweis. Keine privaten Portraits, Credentials, Live-ImageGen- oder bezahlten API-Aufrufe.

## Zeitmessung

Vorher/Nachher im PR mit Host/Node-Version, Commit, tatsächlichen Befehlen und Messgrenzen berichten: lokale Standardzeit aus den summierten monotonen Befehlszeiten; CI-Wandzeit vom Start bis Ende und Jobdauer separat; Anzahl Prüfkommandos, Paketierungen und Electron-Starts. Historischen letzten erfolgreichen CI-Lauf als Baseline nutzen, keine zusätzliche FULL-Regressionsmessung auslösen. Einzellauf, veränderte Infrastrukturtests und Cache-/Runnerunterschiede sind kein kontrollierter Performancebenchmark. Der schnelle PR-Workflow spart GUI-Coverage bewusst ein; keine beschleunigte identische Vollregression behaupten.
