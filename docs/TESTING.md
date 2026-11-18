# Teststrategie

DEV-01 ersetzt die automatische LF-00-Risikoeskalation. Die unveröffentlichte Entwicklungsanwendung verwendet einen schnellen Standardcheck; Desktop-Regressionen bleiben bewusst auswählbar. Maßgeblich sind `scripts/quality-runner.cjs`, `quality-build.cjs` und `.github/workflows/quality.yml`. DEV-02 verwendet diese vorhandenen Profile unverändert weiter. Normale Entwicklung erfolgt direkt auf `develop`; Ergebnisse im Abschlussbericht, bei optionalen PRs zusätzlich dort. Keine neuen Prüfberichte.

## Entwicklung und Integration

Während der Implementierung nur unmittelbar betroffene Tests, etwa `npx vitest run tests/color-consistency.test.ts`. Typecheck bei TypeScript-Änderungen, Lint gezielt (`npx eslint <dateien> --max-warnings 0`) oder vor größeren Meilensteinen. Keine volle Unit-Suite nach jeder Änderung, keine automatische Paketierung und kein eigenmächtiger FULL-Lauf.

Schnelle Featureentwicklung hat Vorrang vor zusätzlicher Testautomatisierung. Electron-/Playwright-Smokes nur dann auswählen, wenn die konkrete Änderung sie tatsächlich erforderlich macht. Vollständige Desktop-/Native-Suites sind kein Standard für Features oder Commits. Bereits ausgeführte Tests nur nach relevanter Codeänderung oder konkretem Fehlergrund wiederholen; keine doppelte lokale und CI-Regression. Vollständige Regression ausschließlich auf ausdrücklichen Auftrag oder als Teil eines beauftragten Alpha-Meilensteins.

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
| `languages` | `localization-smoke.cjs` (DE/EN, Spracheinstellungen, Studio-Kontext) |
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

Beispiel: `npm run check:smoke -- creator`. Weitere Workflows bei Bedarf einzeln aufrufen. Die bisherigen GUI-Skripte und der neue Sprach-Smoke und alle fachlichen Unit-/Integrationstests bleiben erhalten; ausschließlich Tests der entfernten Routing-/Gate-Policy werden durch Tests der neuen Profile, CLI, CI-Verzweigung, Fehlerweitergabe und sicheren Build-Wiederverwendung ersetzt. `npm run test:desktop` und `npm run test:desktop:native` bleiben als vollständige Suites verfügbar. Dev-Smoke: separate Instanz mit `npm run start -- -- --remote-debugging-port=9232`, dann `npm run test:dev`.

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

Gezielte Studio-UX-Abnahme: `node scripts/studio-usability-smoke.cjs` nach gültiger Paketierung. Verwendet ausschließlich synthetische Portraits und ein temporäres Projekt; prüft Einpassen, Mausanker-Zoom, Leertasten-Pan, sichtbare Masterreferenz, direkt erreichbare Werkzeuge, manuelle Freigabe/PNG-Export und Creator-Entwurfserhalt. Screenshots unter ignoriertem `artifacts/ux061/` bei 960×720, 1280×800, 1920×1080. Die Bilder tatsächlich ansehen; grüne Assertions allein sind keine visuelle Abnahme. Bei Änderungen am Creator ergänzend dessen betroffenen Smoke mit seinem expliziten App-Server-Protokolldouble auswählen; keine pauschale zusätzliche Suite und keine Live-ImageGen-Aufrufe.

UX-06.1, lokale Abnahme auf Linux (18.11.2026): 26 betroffene Units in vier Dateien bestanden (`editor-geometry`, `identity-comparison`, `studio`, `expression-designer`), Typecheck, gezielter Lint aller 21 geänderten TS/TSX/CJS-Dateien, Build und `git diff --check` bestanden. Studio-Usability-, Creator- und einzelner nativer Expression-Smoke bestanden; Screenshots bei 1280×800 und 1920×1080 tatsächlich angesehen, zusätzlich 960×720 geprüft. Veraltete Testnavigation/Selektoren an die schrittspezifischen Ansichten angepasst; bestehende Pixel-, Persistenz-, Fehler-/Abbruch- und Freigabeprüfungen erhalten. Native Jobs ausschließlich mit gekennzeichnetem Protokolldouble. Keine vollständige Regression, keine CI, keine Live-Generierung; andere Plattformen und reale generative Bildqualität nicht abgenommen. Weitere Smokes wurden nicht pauschal angehängt.

## Originale Sprite-Fusion-Pipeline prüfen

Die aktive UI verwendet `native/spritefusion/vendor`, unveränderter Commit `02f9315d73d3219274d17767b36d9a231a6b1f4b`. Entwickler-Rebuild: Rust 1.85.1/wasm32 und wasm-bindgen-cli 0.2.105 bereitstellen, `node scripts/build-spritefusion.cjs`. Normaler Electron-Build nutzt das eingecheckte WASM offline. `native/pixel-snap` und seine Tests bleiben für historische Rezepte erhalten; sie sind kein Nachweis des neuen Originalpfads.

Gezielt `npx vitest run tests/spritefusion.test.ts tests/pixel-snap.test.ts`: synthetisches Raster, verschobene Cluster, Transparenz/Teilalpha, eigene Palette, saubere Pixelart, echte PNGs/Maße, abgelehnte Schutzmasken/Arbeitsgrenzen, alte/neue Rezepte, byteexakte Ablage, Backup, schreibfreier Restart und ausdrückliche Master-/Expressionsfreigabe. Default-Konformität nutzt festgehaltene SHA-256/Maße tatsächlicher unveränderter Original-CLI-Ergebnisse in `tests/fixtures/spritefusion-golden.json`. Kein aus der zu prüfenden WASM-Implementierung abgeleiteter Sollwert.

Für direkte Gegenprüfung die unveränderte Original-CLI mit ihrem Lockfile bauen und `SPRITEFUSION_REFERENCE_CLI=<binary> npx vitest run tests/spritefusion.test.ts` ausführen. `SPRITEFUSION_RECORD=1` schreibt ausschließlich synthetische Original-Baselines. Optional `SPRITEFUSION_PORTRAIT=<ausdrücklich erlaubtes PNG>` und `SPRITEFUSION_TEST_OUTPUT=<temporäres Verzeichnis>` für einen realen, nur gelesenen Portraitkandidaten; Bilddaten niemals committen. Verglichen werden tatsächliche PNG-Bytes, nicht erfundene Identitätswerte. Das öffentliche Upstream-KI-Beispiel ist eine Screenshotreferenz, kein privates Portrait oder ungeprüft als Rohgenerierung bezeichnetes Fixture.

Einzelne betroffene GUI-Abnahme nach passender Paketierung: `node scripts/pixel-snap-smoke.cjs`. Echte Produktions-Worker-/Main-/WASM-/Ablagekette mit synthetischem transparentem Portrait: manuelle Rastergröße und neue 65×81-Ausgabe aus 512×640, voneinander unabhängige Kameras, Verwerfen ohne Manifeständerung, regionale Farbe/Undo/Redo, Schutz von Alpha/nicht gewählten Farbregionen, separate Master-/Expressionfreigabe, byteexakter Export und Neustart. Screenshots bei 960×720/1440×900 unter ignoriertem `artifacts/px01/` ansehen. Die alte Analyse-/Native-size-/Synchronkamera-Annahme wurde durch tatsächliche Original-Engine-Anforderungen ersetzt; Integritätsassertions bleiben erhalten.

Lokale Original-Engine-Abnahme auf Linux, 18.11.2026: WASM-/Original-CLI-Builds und `npm run build` bestanden; `npm run typecheck`, gezielter Lint und `git diff --check` bestanden. Auf ausdrücklichen Auftrag `npm test -- --maxWorkers=2`: **426 Tests in 25 Dateien bestanden**. Zusätzlich direkte Original-CLI-Konformität mit fünf synthetischen Fällen und einem freigegebenen realen KI-Portrait: **8 ausgewählte Tests bestanden**. Automatik und manuelle Rastergröße 4 am echten 1254×1254-Kandidaten jeweils PNG-byteidentisch zur unveränderten CLI; Ausgabe 264×282 beziehungsweise 343×358 mit maximal 16 sichtbaren RGB-Farben. Automatik-WASM-Lauf hier etwa 2,38 s; keine allgemeine Laufzeitgarantie. Original-SHA vor/nach identisch, kein Projekt geöffnet/geschrieben. Private Resultate und Messungen nur im temporären Testverzeichnis außerhalb des Repositories. Beide Ergebnisse visuell angesehen: Figur erkennbar, Details/Schattierungen verändert, keine Identitätsfreigabe oder Pixelregistrierung daraus ableiten.

Der einzelne angepasste Pixel-Snap-Desktop-Smoke bestand; Screenshots tatsächlich angesehen. Ein erster zusätzlicher Bildfall scheiterte an einer Buffer-/Uint8Array-Typannahme im Test, nicht an abweichenden PNG-Bytes; Assertion korrigiert und reale Gegenprüfung bestanden. Lint verlangte die erhaltene Fehlerursache im neuen Wrapper; ergänzt und gezielt bestanden. Keine komplette Desktop-/Native-Regression, keine CI, keine Live-ImageGen- oder API-Aufrufe. Windows/macOS und universelle Identitäts-/Alphaerhaltung bleiben unvalidiert beziehungsweise werden vom Originalalgorithmus nicht garantiert.

## Splash und Projekt-Lifecycle gezielt prüfen

`npx vitest run tests/app-lifecycle.test.ts tests/project-service.test.ts` prüft monotone Mindestdauer, 95-%-Warten, Strict-Mode-Deduplizierung, Retry, Single-Flight, Erfolgs-/Fehler-/Abbruchübergänge sowie schreibfreies Schließen mit unveränderten Master-/Manifestbytes und ungültig gewordenen Staging-Tokens. Die zwei betroffenen Controllerfälle sind separat mit `npx vitest run tests/codex-provider.test.ts -t 'passes actual localImage|rejects concurrent jobs'` prüfbar: laufender Job verhindert Reset, erledigter Status verliert Projektbindung/Timer, gespeicherte Freigabe bleibt erhalten. Nur ausdrücklich bezeichnetes Protokolldouble; keine Live-Generierung.

Nach einer passenden Paketierung führt `node scripts/splash-smoke.cjs` ausschließlich den neuen Start-/Projektablauf aus: tatsächliche mindestens zehn Sekunden, monotone RAF-Anzeige, verzögerte/fehlgeschlagene lokale Initialisierung mit Retry, keine projektlose Sidebar, Originalgrafik unter Produktionsprotokoll, sichere Preload-Grenze, Doppelklick, Dialogabbruch, ungültiges Projekt, Erstellen/Schließen/Wiederöffnen und Neustart, Close-Warnung mit Verwerfen/Behalten sowie erhaltenen Stilentwurf nach abgebrochener Dateiauswahl. Native Dateiauswahl sowie gezielte Initialisierungsverzögerung/-fehler sind Fixtures; Projektservice und Persistenz bleiben echt. Screenshots bei 960×720 und 1440×900 unter ignoriertem `artifacts/splash/` ansehen. `npm run test:dev` prüft zusätzlich tatsächliches Vite-Asset und Reload in einem normalen Sandbox-Start auf Debugport 9232. Bestehende GUI-Skripte verwenden den echten neuen Einstieg über `smoke-ui.cjs`; ihre fachlichen Assertions bleiben erhalten.

Lokale Splash-Abnahme auf Linux, 18.11.2026: 35 Lifecycle-/Projektservice-Tests und zwei gezielt ausgewählte Controllerfälle bestanden (33 andere Controllerfälle bewusst nicht ausgeführt); Typecheck, gezielter Lint, ein Build, fokussierter Splash-Smoke, Dev-Smoke mit OS-Sandbox und Whitespaceprüfung bestanden. Boot-/Auswahlbilder tatsächlich angesehen, Originalasset unverändert. Der erste Smoke endete an einem mehrdeutigen Test-Statusselektor (Prozent-`output` besitzt ebenfalls Statusrolle); präzisiert und korrigierter Lauf bestanden. Keine vollständige Desktop-/Native-Regression oder CI, keine privaten Projekte und keine Live-Generierung. Windows-/macOS-Paketierung bleibt unvalidiert.

## Lokalisierung, Fokus und Freigabe gezielt prüfen

`npx vitest run tests/localization.test.ts` prüft alle DE/EN-JSON-Dateien, Katalogstruktur, fehlende/veraltete Schlüssel, Platzhalter, JSX-Texte, englischen Fallback, unveränderte Prompts und Benutzerwerte sowie Sprachpersistenz/Systemsprache/ungültige und verlinkte Einstellungen. Keine manuelle Schlüssel-Ausnahmeliste für veraltete Einträge; neue technische JSX-Symbole müssen bewusst begründet werden. Feste Zustandskennungen werden erst bei Darstellung übersetzt.

`npx vitest run tests/pixel-review.test.ts tests/master-rebuild.test.ts tests/generation.test.ts tests/asset-quality.test.ts tests/asset-retention.test.ts` prüft echte RGBA-/Alphaänderungen, undefinierte Registrierung nach Geometrieänderung, Rasterbestätigung neuer Master, erhaltene historische Master, sichere Kandidatenbereinigung mit Provenienz/Abhängigkeiten, ID-Kollisionen und Neustart. Die Pixel-/Master-/Export-Assertions bleiben erhalten.

`node scripts/localization-smoke.cjs` beziehungsweise `npm run check:smoke -- languages`: echte paketierte React-/Preload-/Main-Kette, OS-Auswahl, beide Navigationssprachen, Raster-Freigabesperre, Expression-Einstieg mit freigegebenem Master, tatsächliche Expertenfelder, Sprachwechsel ohne Entwurfsverlust, ungültige Sprache per IPC und Neustart. Manifeste und Master bleiben unverändert; ausschließlich synthetische Bilder. `node scripts/pixel-snap-smoke.cjs` prüft zusätzlich Wheel ohne Fokus, Aktivierung per Klick, Übertragung zwischen Kameras und Deaktivierung außerhalb sowie die echte WASM-/Übernahme-/Freigabe-/Exportkette. Keine automatische Generierung. Alte Desktop-Selektoren wurden an übersetzte Beschriftungen angepasst; die vollständigen Desktop-/Native-Suites sind in diesem Paket nicht erneut ausgeführt.

Aktuelle lokale UX-/Sprachvalidierung (Linux):

| Tatsächlich ausgeführt | Ergebnis |
| --- | --- |
| `npm run typecheck` | Bestanden |
| `npm run lint` | Bestanden, keine Warnungen; generierter Rust-Targetordner ist kein lintbarer Quellcode |
| `npm test -- --maxWorkers=1` | 435 Tests in 28 Dateien bestanden |
| Anschließende gezielte Retentions-/Generation-/Master-/Qualitätsprüfung | 78 Tests in vier Dateien bestanden, einschließlich einer danach ergänzten ID-Kollisionsprüfung |
| Abschließende Locale-/Studio-/Testprofil-Prüfung nach ergänzten Fallbacktexten | 39 Tests in drei Dateien bestanden |
| `npm run build` | Linux-x64-Paket bestanden, Offline-WASM und Sprachdateien enthalten |
| `node scripts/pixel-snap-smoke.cjs` | Bestanden, echte Original-Engine und Fokus-/Pixel-/Exportprüfungen |
| `node scripts/localization-smoke.cjs` | Bestanden; nach abschließenden Textkorrekturen am aktuellen Paket erneut bestanden |
| `git diff --check` | Bestanden |

Der ursprüngliche unbeschränkte `npm test`-Lauf endete mit 432 Erfolgen und zwei Fehlern: erwarteter alter Navigationsbegriff in einer Assertion und 5-s-Testtimeout bei parallelem 1-MP-Test. Texterwartung präzise aktualisiert, keine Pixel-/Zeitassertion abgeschwächt; sequenzieller Gesamtlauf oben bestand. Spätere Änderungen wurden gezielt geprüft, kein weiterer pauschaler Gesamtlauf. 960×720- und 1440×900-Sprachbilder tatsächlich angesehen; kein horizontaler Seitenüberlauf. Keine CI, vollständige Desktop-/Native-Suite, Live-ImageGen, neue private Portraitprüfung oder Windows/macOS-Abnahme. Alle späteren UI-Zustände und Sprachkombinationen sind nicht einzeln visuell abgenommen.
