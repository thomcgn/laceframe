# Teststrategie

LF-00 gilt für alle Phasen. Tatsächliche Regeln: `scripts/quality-classifier.cjs`, `quality-plan.cjs`, `quality-runner.cjs`, `quality-build.cjs`, `quality-gate.cjs` und `.github/workflows/quality.yml`. Testergebnisse gehören in den zugehörigen PR, getrennt nach lokal/CI und echter Anwendung/Protokoll-Fixture. Historische Fehlerprotokolle bleiben in GitHub Actions und PRs.

## Profile

| Befehl | Umfang |
| --- | --- |
| `npm run classify:changes` | Read-only Git-Diff mit Risiko, Gründen und Integrationsgruppen; zuerst aktuelle Remote-Refs holen. |
| `npm run check:fast` | Typecheck, vollständiger Lint ohne Warnungen, alle Vitest-Tests mit zwei Workern, Git-/Index-Whitespacechecks. Kein Desktop und keine Paketierung. |
| `npm run check:targeted` | Für MEDIUM die betroffenen Integrationen dedupliziert, bei Bedarf einmal paketieren. FAST vorher separat ausführen. HIGH eskaliert automatisch zu FULL. LOW hat keine erforderlichen Desktopchecks. |
| `npm run check:full` | FAST einmal, Paketierung, vollständiges `npm run test:desktop` und `npm run test:desktop:native`, sequenziell. |

Während Implementierung betroffene Unit-/Integrationstests, Typecheck und gezielten Lint verwenden. Vor PR FAST, Klassifizierung und risikogemäße Integrationen. Vor Merge vollständige vorgeschriebene Coverage/Quality Gate; keine unnötigen wiederholten lokalen Vollregressionen. GitHub Actions ist maßgeblich, wenn verfügbar; ohne geeignete CI alle erforderlichen Prüfungen lokal durchführen. Nach Fehlern Ursache beheben und notwendige Checks erneut ausführen, nicht unverändert wiederholen, bis zufällig grün entsteht. Tests/Erwartungswerte nicht abschwächen.

## Risikozuordnung

Höchstes Risiko gewinnt. Klassifizierung verwendet tatsächliche Commit-/Dateiänderungen, nicht Labels/Titel/Branchnamen. Lokal: Merge-Base von `origin/main` und HEAD plus Index, unstaged und nicht ignorierte neue Dateien. PR: tatsächliche Base-/Head-SHAs. Manuell: immer HIGH/FULL. Rename wird als Löschen/Hinzufügen bewertet. Ungültige SHAs, Konflikte oder Git-Fehler brechen ab, kein FAST-Fallback.

| Risiko | Änderungen | Erforderlich |
| --- | --- | --- |
| LOW | Markdown außerhalb kritischer Verzeichnisse, Dokumentationsbilder, Renderer-CSS/Icons, LICENSE | FAST; visuelle Kontrolle bei Darstellungsänderungen zusätzlich sinnvoll. |
| MEDIUM | Bekannte Renderer-React-Komponenten, Navigation/Zustand | FAST plus ausgewählte Integrationen. |
| HIGH | Main/Preload/Shared, Worker, bekannte Masken-/Alpha-/Lichtverarbeitung | FULL einschließlich Sicherheits-/Persistenzregression. |
| HIGH | Tests, Skripte, CI, Abhängigkeiten/Locks/Buildkonfiguration oder unbekannte Pfade | FULL; Vertrauensgrenze der Prüfungen/Builds. |

Kritische Verzeichnisse werden zuerst geprüft, auch bei `.md`. Allgemeine React-Komponenten wählen konservativ alle Gruppen. Sicherheitskritische Änderungen nicht unter Hinweis auf FAST von ihrer Regression ausnehmen. Keine Skip-/Level-/Gruppen-Overrides; `QUALITY_RISK_FLOOR` kann nur erhöhen.

| Gruppe | Desktop-Skripte unter `scripts/` |
| --- | --- |
| `creator` | `creator-smoke.cjs` |
| `expressions` | `color-consistency-smoke.cjs`, `desktop-smoke.cjs`, `expression-designer-smoke.cjs`, `native-smoke.cjs` |
| `art-direction` | `style-analysis-smoke.cjs`, `native-smoke.cjs` |
| `cutout` | `quality-smoke.cjs`, `smart-cutout-smoke.cjs`, `cutout-stability-smoke.cjs`, `native-smoke.cjs` |
| `relighting` | `relighting-smoke.cjs`, `cutout-stability-smoke.cjs` |
| `native` | `native-smoke.cjs`, `creator-smoke.cjs` |
| `persistence` | Color, Desktop, Expression Designer, Quality, Relighting, Style Analysis, Smart Cutout, Cutout Stability und beide Native-Skripte |

`packs-smoke.cjs` kommt bei Expressions/Art Direction/Persistence hinzu, solange vorhanden. Doppelte Skripte laufen nur einmal. CharacterCreator wählt Creator+Native, ExpressionDesigner Expressions, CreateView Expressions+Native, Stilkomponenten Art Direction, MasterApproval/MasterHistory/AssetLibrary Creator+Expressions; allgemeine Komponenten alle Gruppen. HIGH geht unabhängig davon über FULL. Maßgeblich bleiben Implementierung und Inventartests der Routing-Suite.

## Ausführung und Artefakte

`npm ci` mit Lockfile; Linux-Desktop oder Xvfb und benötigte Electron-Bibliotheken. Desktop-Skripte lesen das paketierte Linux-Binary unter `out/Laceframe-linux-x64/laceframe`; sie paketieren nicht pro Skript neu. Bestehende `npm run build`, `npm run test:desktop`, `npm run test:desktop:native` bleiben direkt verfügbar. Dev-Smoke: separate Instanz mit `npm run start -- -- --remote-debugging-port=9232`, dann `npm run test:dev`.

Speicherintensive Profile sequenziell. Lokale Wiederverwendung nur mit gültigem `out/.quality-build.json`: Hashes der tatsächlichen Runtime-/Buildinputs, Lock-/Paketdaten, Plattform/Architektur/Node-Version sowie Binary und app.asar müssen stimmen. Docs, Tests und `.vscode` sind keine Runtimeinputs. Veränderte, fehlende, unsichere oder veraltete Artefakte nicht als validiert ausgeben; CI übernimmt keine Buildoutputs aus anderen PRs. Dependencyänderungen außerhalb des Lockfiles sind nicht unterstützt.

`artifacts/quality/` enthält tatsächlich ausgeführte Befehle, monotone Dauer, Exitcodes, effektives Profil und gebaut/wiederverwendet/nicht erforderlich. Fehler stoppen das Profil; Abbruch wird weitergereicht, kein Pass für unterbrochene Prüfungen. Ein LOW-Desktopcheck ist „nicht erforderlich“, nicht „bestanden“. Befehle haben 20 Minuten Timeout; CI-Checks 45 Minuten. Neue Benchmarks müssen Host/Inhalte und Messgrenzen nennen; Einzelprozess-RSS ist kein addierbarer Gesamt-RAM-Verbrauch.

Die installierte Playwright-Electron-Instrumentierung fügt unter Linux standardmäßig `--no-sandbox` hinzu. Die App selbst deaktiviert ihre Sandbox nicht; Context Isolation, Node-Verbot, typisiertes Preload und IPC-Absenderprüfungen bleiben auch im Test Gegenstand der Assertions. Ein instrumentierter Desktop-Smoke ist deshalb kein alleiniger Nachweis des normalen OS-Sandbox-Starts. Den normalen Entwicklungsstart getrennt mit dem Dev-Smoke prüfen, wenn diese Grenze betroffen ist.

Tests verwenden ausschließlich synthetische Bilder und temporäre Projekte. Native Smokes injizieren den ausdrücklich bezeichneten `tests/support/fake-codex.mjs` über ihren Test-PATH in die echte IPC-/Prozess-/Importstrecke. Das ist kein Produktionsfallback und beweist keine Modellqualität. Native Dialogantworten werden in GUI-Tests kontrolliert geliefert; Dateiverarbeitung/Validierung und Renderer laufen tatsächlich. OS-Strg-/Shift-Dialoggesten oder neue Live-Generierung werden dadurch nicht bewiesen. Keine privaten Portraits, Credentials, Live-ImageGen-Aufrufe oder bezahlten API-Anfragen.

## GitHub Actions und Merge-Grenze

Quality läuft bei **pull_request gegen main** und **workflow_dispatch** (FULL). Kein `push`-Trigger auf main: ein geprüfter Merge startet nicht erneut dieselbe Regression. Ubuntu 24.04/Node 24, `npm ci`, gepinnte Actions, read-only Contents, npm-Cache und Abbruch überholter Läufe. Desktopabhängigkeiten/isoliertes Xvfb/Openbox/D-Bus nur bei Bedarf; der Runner setzt die User-Namespace-Voraussetzung für Sandbox-fähige Prozesse. Diagnosen/Profile werden sieben Tage als Artefakte gespeichert.

CI lädt die Risikopolicy aus dem tatsächlichen Base-Commit. Fehlende historische Policy erzwingt FULL; ungültige Base ist ein Fehler. Aktueller Runner darf das Baseline-Risiko nicht senken. Immer laufendes **`quality-gate`** verlangt erfolgreiche Klassifizierung, erfolgreiche Checks und expliziten validierten Profilnachweis ausreichender Stärke. Fehlgeschlagen, abgebrochen, übersprungen, fehlend oder zu schwach bedeutet Gate-Fehler. Bösartige Workflowänderungen sind zusätzlich durch Review/Repositoryregeln zu verhindern.

**Repository-Audit 18.11.2026:** `main` meldet `protected: false`. Das vorhandene Gate ist damit nicht automatisch ein erzwungener Merge-Schutz. Repositorybesitzer muss PR-Pflicht und erfolgreichen Statuscheck `quality-gate` in Branchschutz/Ruleset verlangen, gegebenenfalls aktuelle Base und Bypassschutz. Schutzregeln werden durch Codex nicht eigenmächtig verändert.

Ohne Merge Queue wird der endgültige Merge-Commit nicht separat getestet. Der PR-Workflow prüft den damaligen PR-Merge-Ref; spätere Baseänderungen können den finalen Merge ändern. Aktuelle Branchanforderung reduziert die Lücke. `merge_group` ist nicht konfiguriert. Manuelle FULL-Regression bleibt möglich, ist aber keine automatische Post-Merge-Abdeckung. Linux ist die geprüfte Plattform; Windows/macOS-Eingabe, Paketierung/Signierung bleiben offen.
