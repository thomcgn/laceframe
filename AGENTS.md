# Laceframe — Arbeitsregeln

Vor Änderungen [Architektur](docs/ARCHITECTURE.md), [Workflows](docs/WORKFLOWS.md), [Teststrategie](docs/TESTING.md) und die vollständig aktuelle [Roadmap](docs/ROADMAP.md) lesen. Code, Tests und nachvollziehbare Commits (gegebenenfalls PRs) sind der Nachweis für implementierte Funktionen. Die Roadmap enthält keine pauschale Freigabe für künftige Phasen.

## Arbeitsumfang und Git

- Nur den ausdrücklich beauftragten Umfang umsetzen; funktionierende vertikale Abläufe, keine dekorativen Schaltflächen oder simulierte KI-Ergebnisse.
- Aktuellen Git-Status, `origin/main`, offene PRs und relevante Issues prüfen. Bestehendes lokales Repository verwenden; keine Worktrees oder zweite Arbeitskopie.
- Normale Entwicklungsaufträge direkt auf `develop` in kleinen nachvollziehbaren Commits bearbeiten; kein Feature-Branch und kein PR erforderlich. `develop` bei Bedarf vom aktuellen `origin/main` anlegen; vorhandenen Branch nicht zurücksetzen. `experiment/*` für optionale kurzlebige Experimente oder besonders invasive Arbeiten.
- `main` bleibt ein bewusst integrierter stabiler Zwischenstand. Keine direkten Commits oder automatischen Merges nach `main`, keine automatische Release-Erstellung. Pushes, Veröffentlichungen und Integration nur nach ausdrücklichem Benutzerauftrag. Kein automatischer Rebase/Reset/Stash; Schutzregeln nicht eigenmächtig ändern oder umgehen.
- Vor ausdrücklich beauftragter Integration nach `main`: Git-Stand/offene Änderungen prüfen, kurze manuelle Gesamtprüfung der vorhandenen Funktionen, relevante Units, bekannte gravierende Fehler dokumentieren und Datenmigrationen gezielt prüfen. PR optional, soweit Repositoryregeln es erlauben; verlangt Branchschutz einen PR, Benutzer darauf hinweisen. Nächste Produktphase nur nach ausdrücklicher Freigabe beginnen.
- Lokale Änderungen bewahren, insbesondere `.vscode/settings.json`. Nichts ungefragt überschreiben, verwerfen, zurücksetzen oder stashen.
- Keine privaten Benutzerprojekte verändern. Keine privaten Ada-Voss-Portraits, Selfies oder geschützten Spielgrafiken in Git, Fixtures oder Screenshots. Ada Voss Master niemals neu gestalten. Synthetische Testbilder verwenden.

## Unverhandelbare Produktregeln

- Eigenständige Electron-/React-/TypeScript-/Vite-Anwendung; lokale Projekte, kein unnötiger Server, keine Datenbank und kein Docker.
- Master, Referenzen und Eingabebilder unveränderlich erhalten. Bearbeitungen/Exporte verwenden neue Pfade, SHA-256-Herkunft und explizite Freigaben. Historische Prompts, IDs und Revisionen nicht nachträglich umschreiben.
- Art Direction, Identität, Outfit, Emotion/Intensität, Sprechaktion, Erscheinungs-/Zustandsdaten und Motion fachlich trennen. Persönliche Ausdrucksregeln nicht in globale Vorlagen oder andere Figuren übertragen.
- Familien, Varianten und Profilkennungen bleiben erweiterbare Daten, keine geschlossene Emotionsliste. Portrait Artistic behält tatsächliche Auflösung und Stil; keine erzwungenen 64×64 oder stillen Reskalierungen.
- Renderer: Sandbox und `contextIsolation: true`, `nodeIntegration: false`. Nur validierte typisierte Preload-IPC; keine beliebigen Dateipfade, Dateisystem-, Prozess- oder Tokenzugriffe. Absender, Formate, Grenzen, Pfade, Symlinks und Hashes im Main prüfen.
- Keine Geheimnisse im Renderer, Git oder Logs. Keine Cookies/ChatGPT-Sessions auslesen oder undokumentierten Endpunkte. Native Codex-Fähigkeiten vor jedem Job prüfen; keine simulierte Generierung und keine automatische Wiederholung.
- Keine Live-Bildgenerierung, kostenpflichtigen Anfragen, Modell-/Trainingsdownloads oder Trainingsläufe ohne ausdrückliche Freigabe. Tests verwenden ausschließlich eindeutig bezeichnete Protokoll-Fixtures.
- Maskenrollen nicht verwechseln; Freistellung, erlaubte Expressionsänderung und geschützte Farb-/Lichtbereiche haben unterschiedliche Bedeutung. Keine automatische Identitäts-/Stilfreigabe oder semantische Segmentierung behaupten.
- Farbkorrektur erhält zusätzliche Schatten und Details; keine globale Masterpaletten-Ersetzung. Alpha und geschützte Pixel bleiben gemäß jeweiligem dokumentiertem Algorithmus erhalten.
- Schemaänderungen streng validieren, ältere Projekte schreibfrei öffnen, erforderliche Migration/Backups vor Änderungen durchführen. Linux unmittelbar prüfen, Windows/macOS-Pfade portabel halten; ungetestete Plattformen nicht als validiert melden.

## UX und Qualität

- Ruhige, dunkle, responsive Oberfläche: Ink `#141820`, Slate `#242D3A`, Sage `#8FADA6`, Copper `#D9A77E`, Ivory `#F0E5D3`; Inter und JetBrains Mono. Status mit Text erklären, nicht allein mit Farbe.
- Während Entwicklung nur unmittelbar betroffene Unit-/Integrationstests und gezielte manuelle Funktionsprüfung ausführen; Typecheck bei TypeScript-Änderungen, Lint gezielt auf betroffene Dateien. Keine vollständige Unit-Suite nach jeder Änderung, kein automatischer Electron-Build, keine kompletten Desktop-Smokes und kein eigenmächtiger FULL-Lauf.
- Schnelle Featureentwicklung hat Vorrang vor zusätzlicher Testautomatisierung. Electron-/Playwright-Smokes nur ausführen, wenn die konkrete Änderung sie tatsächlich erforderlich macht; vollständige Desktop-/Native-Suites sind kein Entwicklungsstandard. Tests nur nach relevanter Codeänderung oder konkretem Fehlergrund wiederholen. Keine doppelte lokale und CI-Regression. Vollständige Regression ausschließlich auf ausdrücklichen Auftrag oder im beauftragten Alpha-Meilenstein.
- `npm run check:dev` (Typecheck, alle Units, Git-Diff-Check) nur bewusst als breiteren Entwicklungscheck verwenden, nicht bei jedem Commit. Gezielten Desktop-Smoke nur bei Bedarf auswählen: `npm run check:smoke -- <workflow>`. Keine automatische Risikoeskalation oder verpflichtenden täglichen PR-Checks.
- Bei Änderungen an Persistenz/IPC/Dateizugriff gezielte Sicherheits-, Kompatibilitäts- und Integritätstests verpflichtend ausführen; bei Bildalgorithmen Alpha/Pixel/Schutzbereiche prüfen. Originale niemals überschreiben, keine privaten Projekte als Fixtures. Assertions nicht abschwächen oder Fehler ignorieren.
- Speicherintensive Prüfungen sequenziell; Build-Artefakte nur nach verifizierter Übereinstimmung wiederverwenden. FULL nur manuell oder bei ausdrücklichem Auftrag (`npm run check:full` / GitHub `workflow_dispatch`).
- Normale Develop-Commits starten keine CI. Falls ausdrücklich ein PR gegen main erstellt wird, läuft nur der schnelle `check:dev` als `quality-gate`. Zusätzlich `workflow_dispatch` mit `dev` oder `full` auf ausdrücklichen Auftrag; tatsächliches `quality-gate` prüfen; dieselben lokalen Tests ohne Anlass nicht wiederholen. Fehlgeschlagene Checks gezielt beheben, notwendige Prüfungen danach erneut ausführen. Fehlende/übersprungene Prüfungen nicht als bestanden melden; lokale, CI- und Fixture-Nachweise trennen.
- Nach Implementierung geänderte Dateien, kleine Commits, tatsächlich ausgeführte Tests, Implementierung versus Mock und verbleibende Grenzen melden. Bei optionalen PRs Ergebnisse dort ergänzen. Keine neuen historischen Task-/Validierungsdokumente. Vollständige Regression und manuelle Abnahme vor Alpha als eigenen späteren Meilenstein planen.
