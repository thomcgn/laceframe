# Teststrategie

DEV-01 ersetzt die automatische LF-00-Risikoeskalation. Die unveröffentlichte Entwicklungsanwendung verwendet einen schnellen Standardcheck; Desktop-Regressionen bleiben bewusst auswählbar. Maßgeblich sind `scripts/quality-runner.cjs`, `quality-build.cjs` und `.github/workflows/quality.yml`. DEV-02 verwendet diese vorhandenen Profile unverändert weiter. Normale Entwicklung erfolgt direkt auf `develop`; Ergebnisse im Abschlussbericht, bei optionalen PRs zusätzlich dort. Keine neuen Prüfberichte.

## Entwicklung und Integration

Während der Implementierung nur unmittelbar betroffene Tests, etwa `npx vitest run tests/color-consistency.test.ts`. Typecheck bei TypeScript-Änderungen, Lint gezielt (`npx eslint <dateien> --max-warnings 0`) oder vor größeren Meilensteinen. Keine volle Unit-Suite nach jeder Änderung, keine automatische Paketierung und kein eigenmächtiger FULL-Lauf.

Gezielte manuelle Funktionsprüfung ergänzen. `check:dev` ist ein bewusst gewählter breiterer Entwicklungscheck, keine Pflicht pro Commit/Feature oder PR. Kein täglicher PR-Zwang. CI nur auf ausdrücklichen Auftrag starten, danach Ergebnis prüfen; gleiche lokale Prüfungen ohne neue Änderung, Fehler oder konkrete Unsicherheit nicht wiederholen. Änderungen an IPC/Dateizugriff/Persistenz benötigen passende Sicherheits-/Migrations-/Kompatibilitätstests; Bildalgorithmen benötigen gezielte Pixel-/Alpha-/Schutzbereichstests. Diese Pflicht bleibt unabhängig vom schlanken PR-Workflow. Assertions nicht abschwächen und Fehler nicht ignorieren.

| Befehl | Tatsächlicher Umfang |
| --- | --- |
| `npm run check:dev` | Typecheck, alle Vitest-Tests mit zwei Workern, Git-Diff-/Index-Whitespacecheck. Kein Lint, Build, Desktop oder Native. |
| `npm run lint` | Eigenständiger vollständiger Lint ohne Warnungen. |
| `npm run check:smoke -- <workflow>` | Genau ein ausdrücklich gewählter Desktop-Workflow; vorher gültiges Build wiederverwenden oder einmal paketieren. Keine automatische zusätzliche Suite. |
| `npm run check:full` | Typecheck, vollständiger Lint, alle Units, Whitespacechecks, ein verifiziertes Build, alle bisherigen Desktop- und Native-Smokes sequenziell. Nur manuell oder ausdrücklich beauftragt. |

Die bisherigen `classify:changes`, `check:fast` und `check:targeted` entfallen; alte PR-Beispiele dazu sind durch diese Befehle ersetzt. Es gibt keine LOW/MEDIUM/HIGH-Klassifizierung, automatische Gruppenwahl oder Eskalation mehr. Unbekannte Smoke-Namen und fehlende Auswahl sind Fehler, kein FULL-Fallback. Lokal prüft der Diff-Check gegen HEAD und den Index; manuelle CI prüft ebenfalls gegen HEAD und Index. Optionale PR-Checks prüfen committed Änderungen gegen die tatsächliche Base-SHA. Für einen ausdrücklich gewünschten Vergleich mit einer Integrationsbasis kann `QUALITY_DIFF_BASE=<commit>` gesetzt werden.

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

## GitHub Actions auf Abruf und Integration

Ein optionaler **pull_request gegen main** startet genau einen schnellen **`quality-gate`**-Job. Manuelle Auswahl **workflow_dispatch**, `profile: dev`, verwendet dieselben Checks: Node 24, `npm ci`, `check:dev`, Prüfung des abgeschlossenen Profilnachweises. Kein automatischer Lint, Electron-Download/Build/Start, Playwright-Browserdownload, Desktop-Setup, Xvfb oder Native-Smoke. Die npm-Dev-Abhängigkeiten bleiben installiert; nur die für Units unnötigen Browser-/Electron-Binärdownloads werden ausgelassen. Gepinnte Actions, read-only Contents, npm-Cache und Abbruch überholter Läufe bleiben bestehen. Ein fehlgeschlagener/abgebrochener Check erzeugt keinen erfolgreichen Job; kein `continue-on-error`. Profile/Diagnosen werden sieben Tage aufbewahrt.

**workflow_dispatch** mit `profile: full` (Standardauswahl) führt FULL aus, einschließlich Desktop-Systemabhängigkeiten, Xvfb/Openbox/D-Bus und aller elf Smokes. `profile: dev` startet den schnellen Check. In GitHub Actions den gewünschten Branch und das Profil ausdrücklich auswählen; nach erlaubtem Push beispielsweise `gh workflow run quality.yml --ref develop -f profile=dev` oder `-f profile=full`. Ein nur lokaler Workflow ist auf GitHub noch nicht verfügbar; die Dispatch-Definition muss zuerst bewusst auf den Defaultbranch integriert werden, der gewählte Branch muss remote existieren.

Kein `push`-/`merge_group`-Trigger und kein täglicher PR-Zwang. Develop-Commits starten keine CI. Wird ausdrücklich ein Integrations-PR gegen main erstellt, läuft automatisch nur `check:dev`, niemals FULL. Ein Merge nach main startet keine zusätzliche Regression und keinen Release. Ohne Merge Queue wird der endgültige Merge-Commit nicht separat geprüft; manuelle CI prüft den ausdrücklich gewählten Ref.

Repository-Audit 18.11.2026: keine Repository-Rulesets, `main` meldet `protected: false`; `develop` ist der reguläre Arbeitsbranch; einmalige Veröffentlichung mit Upstream ist beauftragt. Der stabile Statuscheck ist vorhanden, wird aber ohne Branchschutz/Ruleset nicht automatisch erzwungen. Keine Anpassung ist derzeit für direkte lokale Develop-Commits erforderlich. Falls später ein Ruleset eingerichtet wird: `develop` ohne täglichen PR-/Statuscheck-Zwang halten; optionale Main-Regeln dürfen den erforderlichen PR nicht umgehen. Für main können bewusst PRs mit schnellem `quality-gate` verlangt werden; ein vorhandener PR-Zwang muss respektiert werden, direkte Main-Integration darf ihn nicht umgehen. Codex ändert Schutzregeln nicht eigenmächtig. Der schnelle Check ersetzt keine manuell gewählte vollständige GUI-Regression. Linux ist geprüft, Windows/macOS bleiben offen.

Die installierte Playwright-Electron-Instrumentierung ergänzt unter Linux `--no-sandbox`; Produkt-Sandbox, Context Isolation, Node-Verbot und IPC-Assertions bleiben erhalten. Bei Änderungen dieser Grenze zusätzlich normalen OS-Sandbox-Start über Dev-Smoke prüfen. Tests verwenden synthetische Bilder/temporäre Projekte. Native-Smokes injizieren das ausdrücklich bezeichnete `tests/support/fake-codex.mjs` über Test-PATH in die echte Prozess-/IPC-/Importstrecke; kein Produktionsfallback, kein Modellqualitätsnachweis. Keine privaten Portraits, Credentials, Live-ImageGen- oder bezahlten API-Aufrufe.

## Integration und Alpha

Integration von `develop` nach `main` nur auf ausdrückliche Benutzerentscheidung, PR optional gemäß Repositoryregeln. Vorher Stand/offene Änderungen prüfen, kurze manuelle Gesamtprüfung vorhandener Funktionen, relevante Unit- und Migrationstests, bekannte gravierende Fehler dokumentieren. Keine ungeprüften Migrationen integrieren. Kein automatischer Release.

Vollständige Regression und gezielte Stabilisierung vor Alpha sind ein eigener späterer Meilenstein in [ROADMAP](ROADMAP.md). FULL wird dafür ausdrücklich beauftragt; kein pauschaler Volltest bei jedem Feature. Zeitmessungen nennen Host/Commit, echte Befehle und Messgrenzen; keine nicht ausgeführten GUI-Tests als bestanden ausgeben.
