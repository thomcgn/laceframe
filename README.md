# Laceframe

Laceframe ist ein lokales Desktop-Studio für konsistente Charakterportraits und Expressions. Bilder importieren, vergleichen, korrigieren, freigeben und exportieren funktioniert offline. Optionale Bildgenerierung verwendet den lokal installierten offiziellen Codex App Server mit bestehender ChatGPT-Anmeldung; sie startet nur auf ausdrücklichen Klick und verbraucht Codex-Kontingent.

## Starten

Node.js **22.13+**, npm und ein grafischer Desktop mit Electron-Systembibliotheken sind erforderlich. Linux x64 ist die validierte Plattform; Windows/macOS sind noch nicht validiert. Chromium-Sandbox eingeschaltet lassen.

```sh
npm ci
npm run start
```

`npm run build` erstellt das entpackte Anwendungspaket unter `out/`. `npm run make` erstellt ein ZIP und benötigt auf Linux/macOS das Systemprogramm `zip`. Installer, Signierung und automatische Updates sind noch nicht umgesetzt.

## Arbeiten mit Laceframe

Die Bereiche sind **Characters → Art Direction → Expressions → Studio → Library → Motion**. Projekte außerhalb dieses öffentlichen Repositorys speichern und als vollständiges Verzeichnis sichern. Master und Originale bleiben unverändert; neue Bearbeitungen werden separate Entwürfe mit manueller Freigabe.

Vorhanden sind unter anderem Mehrfachimport von Identitätsbildern, versionierte Stile, Character Creator, Master-Rebuild, native Generierung oder manueller Ergebnisimport, Bildvergleich, Freistellung, Masken/Originalpixelschutz, 2D-Relighting und regionale Farbkorrektur. Motion zeigt bislang einen Planungshinweis. Studio führt durch **Auswählen → Erzeugen → Bearbeiten → Freigeben**. Die Expertenansicht erhält vollständige Anweisungen und Diagnosen. Bildeditoren nutzen eine große gemeinsame Arbeitsfläche; Unterwerkzeuge erhalten den bisherigen Entwurf.

## Dokumentation

- [ROADMAP](docs/ROADMAP.md): verbindlicher Produktstand, Prioritäten und Abnahmekriterien.
- [ARCHITECTURE](docs/ARCHITECTURE.md): Datenmodell, Sicherheit, Herkunft, Formate und Grenzen.
- [WORKFLOWS](docs/WORKFLOWS.md): aktuelle Bedienwege und ausdrücklich geplante Abläufe.
- [TESTING](docs/TESTING.md): gezielte Entwicklungstests, optionale Smokes und manuelle FULL-Regression.
- [AGENTS](AGENTS.md): Regeln für Arbeiten am Repository.

```sh
npx vitest run tests/<betroffene-datei>.test.ts
# Optionaler breiterer Check:
npm run check:dev
```

Normale Entwicklung direkt auf `develop`, kleine lokale Commits und gezielte Tests; kein täglicher PR-Zwang. Push und Integration nach `main` nur auf ausdrücklichen Auftrag. Desktop-Smokes gezielt mit `npm run check:smoke -- <workflow>` auswählen. CI ausschließlich manuell (`workflow_dispatch`, Profil `dev` oder `full`); vollständige Regression vor Alpha. Testresultate im Abschlussbericht und gegebenenfalls im optionalen PR dokumentieren. Historische Aufträge, Prüfberichte und Screenshots sind über Git und gemergte PRs rekonstruierbar; es gibt kein Dokumentationsarchiv im Repository.
