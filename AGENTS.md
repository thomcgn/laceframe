# Laceframe — Arbeitsregeln

Vor Änderungen [Architektur](docs/ARCHITECTURE.md), [Workflows](docs/WORKFLOWS.md), [Teststrategie](docs/TESTING.md) und die vollständig aktuelle [Roadmap](docs/ROADMAP.md) lesen. Code, Tests und gemergte PRs sind der Nachweis für implementierte Funktionen. Die Roadmap enthält keine pauschale Freigabe für künftige Phasen.

## Arbeitsumfang und Git

- Nur den ausdrücklich beauftragten Umfang umsetzen; funktionierende vertikale Abläufe, keine dekorativen Schaltflächen oder simulierte KI-Ergebnisse.
- Aktuellen Git-Status, `origin/main`, offene PRs und relevante Issues prüfen. Bestehendes lokales Repository verwenden; keine Worktrees oder zweite Arbeitskopie.
- Feature-Branch und PR verwenden, keine direkten Commits auf `main`. PRs nicht automatisch mergen oder Schutzregeln ändern. Nächste Phase erst nach notwendigem Merge und ausdrücklicher Freigabe; explizite mehrteilige Aufträge und deren Reihenfolge beachten.
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
- Während Entwicklung nur unmittelbar betroffene Unit-/Integrationstests ausführen; Typecheck bei Bedarf, Lint gezielt auf betroffene Dateien. Keine vollständige Unit-Suite nach jeder Änderung, kein automatischer Electron-Build, keine kompletten Desktop-Smokes und kein eigenmächtiger FULL-Lauf.
- Vor PR einmal `npm run check:dev` (Typecheck, Unit-Tests, Git-Diff-Check). Lint nur für betroffene Dateien oder vor größeren Meilensteinen. Gezielten Desktop-Smoke nur bei Bedarf ausdrücklich auswählen: `npm run check:smoke -- <workflow>`. Keine automatische Risikoeskalation.
- Bei Änderungen an Persistenz/IPC/Dateizugriff gezielte Sicherheits-, Kompatibilitäts- und Integritätstests verpflichtend ausführen; bei Bildalgorithmen Alpha/Pixel/Schutzbereiche prüfen. Originale niemals überschreiben, keine privaten Projekte als Fixtures. Assertions nicht abschwächen oder Fehler ignorieren.
- Speicherintensive Prüfungen sequenziell; Build-Artefakte nur nach verifizierter Übereinstimmung wiederverwenden. FULL nur manuell oder bei ausdrücklichem Auftrag (`npm run check:full` / GitHub `workflow_dispatch`).
- Nach PR-Erstellung GitHub-`quality-gate` prüfen; dieselben lokalen Tests ohne Anlass nicht wiederholen. Fehlgeschlagene Checks gezielt beheben, notwendige Prüfungen danach erneut ausführen. Fehlende/übersprungene Prüfungen nicht als bestanden melden; lokale, CI- und Fixture-Nachweise trennen.
- Vor Abschluss tatsächlich ausgeführte Befehle, Ergebnisse, Implementierung versus Mock und verbleibende Grenzen im PR nennen. Historische CI-Protokolle bleiben in PRs/Actions, keine neuen Task-/Validierungsdokumente ohne zwingenden aktuellen Bedarf.
