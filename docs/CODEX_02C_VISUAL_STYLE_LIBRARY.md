# CODEX 02C — Visual Style Library & Multi-Reference ImageGen

## Ziel

Erweitere Laceframe um eine echte, bildgestützte Art-Direction-Bibliothek.

Ein Spiel soll einen konsistenten visuellen Stil besitzen, während seine Figuren unterschiedliche Identitäten, Outfits und individuelle Emotionsausdrücke behalten.

**Beispiel:** Ada Voss und Peter Bishop verwenden denselben Pixel-/Paint-Stil, dürfen aber keine Gesichts-, Haar-, Kleidungs- oder Persönlichkeitsmerkmale voneinander übernehmen.

## 0. Ausgangslage und Git-Regeln

- Arbeite ausschließlich im bestehenden lokalen Repository.
- Keine Worktrees, keine Änderungen direkt auf `main`.
- Prüfe Git-Status, aktuellen Branch und Remote-Stand.
- Prüfe, ob PR #8 vollständig in `main` integriert wurde.
- Ist PR #8 noch nicht gemergt, beginne keine konkurrierende Implementierung; melde den Zustand.
- Bewahre vorhandene lokale Änderungen, einschließlich `.vscode/settings.json`.
- Erstelle einen neuen Feature-Branch und abschließend einen PR.
- Lies `AGENTS.md`, `docs/MVP_PLAN.md`, `docs/ART_DIRECTION_AND_EXPRESSION_IDENTITY.md`, `docs/CODEX_02B_ART_DIRECTION.md` und `docs/PR_08_VALIDATION.md`.

Die vorhandene native Codex-ImageGen-Integration, kompakte Create-UI, Status-/Zeitmessung und der registrierte Bildvergleich bleiben erhalten.

## 1. Visual Style Library

Erweitere ArtDirectionProfile um echte Bildreferenzen.

Jedes Profil soll enthalten können:

- Name und Beschreibung
- Rendering-Regeln
- Licht-/Schattierungsregeln
- Farb-/Kontrastregeln
- Kompositionsregeln
- Beliebig mehrere Referenzbilder innerhalb sinnvoller Limits
- Eindeutige Profil-ID und Version
- Unveränderliche historische Revisionen

Implementiere einen funktionierenden Import für PNG/WebP, sichere SHA-256-Speicherung, Thumbnails, Entfernen und Wiederverwenden von Stilreferenzen.

Alle gespeicherten Bilddateien müssen gegen Symlinks, Path-Traversal, falsche Formate und beschädigte Inhalte geschützt werden.

Originalbilder dürfen niemals überschrieben werden. Bereits verwendete Referenzen dürfen durch spätere Bearbeitungen nicht stillschweigend ihre Bedeutung ändern.

## 2. Style Lock getrennt von Character Lock

Unterscheide bei jeder Generierung:

**Style Reference:** Wie wird die Figur dargestellt?

**Identity Reference:** Wer ist die Figur?

**Expression Profile:** Wie drückt diese konkrete Figur ihre Emotion aus?

**Outfit:** Welche Kleidung trägt sie? Vorerst als unabhängige Datenstruktur vorbereiten, keinen vollständigen Outfit-Editor bauen.

Wichtig: Eine Ada-Voss-Stilreferenz darf nicht automatisch Adas Gesicht, Locken, Sommersprossen, kariertes Hemd oder Grunge-Kleidung auf andere Figuren übertragen.

Die bisherige persönliche Expression Identity aus PR #8 bleibt unverändert nutzbar.

## 3. Native Multi-Reference ImageGen

Untersuche anhand der installierten offiziellen Codex-App-Server-Schemas, wie mehrere `localImage`-Referenzen in einem Bildgenerierungsauftrag übergeben werden können.

Wenn offiziell unterstützt:

- Übermittle den freigegebenen Charakter-Master als Identitätsreferenz.
- Übermittle ausgewählte Stilbilder zusätzlich als reine Stilreferenzen.
- Kennzeichne die Bedeutung der einzelnen Referenzen eindeutig im Prompt.
- Verwende ausschließlich die bestehende verwaltete Codex-Anmeldung.
- Bewahre die vorhandenen Sicherheitsmaßnahmen des Providers.

Falls die Schnittstelle mehrere Bilder nicht zuverlässig unterstützt, keine undokumentierten Workarounds oder HTTP-Endpunkte verwenden. Einschränkung sichtbar anzeigen und den bestehenden Einzelreferenz-Workflow funktionsfähig lassen.

Kein API-Key-Fallback, keine Cookies, keine zusätzlichen kostenpflichtigen Dienste.

## 4. Historische Revisionssicherheit

Jede Generierung muss weiterhin nachvollziehbar bleiben.

Speichere beziehungsweise referenziere:

- Verwendete Art-Direction-ID und exakte Revision
- Identitäts-Master-ID und SHA-256
- Stilreferenz-IDs und SHA-256
- Persönliches Expression Profile beziehungsweise dessen aufgelösten Text
- Vollständige unveränderliche Promptrevision
- Provider und vorhandene Laufzeit-/Ergebnis-Metadaten

Ein später bearbeitetes Style Profile darf weder die Bedeutung alter Generierungen verändern noch historische Ergebnisimporte blockieren.

Ältere Projektformate und bereits vorhandene Ada-Voss-Bilder müssen lesbar bleiben. Sichere Originalmanifeste vor nötigen Migrationen und verändere keine bestehenden Bildbytes.

## 5. GUI und Bedienung

Integriere die Funktion in die bestehende kompakte Laceframe-Oberfläche.

Die Style Library benötigt:

- Stilprofil erstellen und auswählen
- Stilbilder per Dateiauswahl oder Drag-and-drop importieren
- Referenz-Thumbnails betrachten
- Stilregeln bearbeiten
- Neue Stilrevision speichern
- Historische Revisionen einsehen
- Ein Profil als Projektstandard festlegen

In Create muss deutlich sichtbar sein:

- Aktueller Spielstil
- Ausgewählter Charakter-Master
- Aktives Expression Profile
- Welche Bildreferenzen an Codex übergeben werden

Vermeide eine neue überladene Formularoberfläche. Nutze kompakte Panels und einklappbare Details.

Keine Fake-Buttons, simulierten Bildimporte oder nicht funktionierenden Vorschauen.

## 6. Referenzfälle

### A — Ada Voss

- Bestehenden Master unverändert öffnen.
- Stilprofil „Ada Voss · Illustrated Noir“ erstellen.
- Ada als Stilreferenz hinzufügen.
- Vorhandene Expressions und Freigaben beibehalten.

### B — Peter Bishop

- Eigenen Master verwenden.
- Ada-Voss-Stilprofil auswählen.
- Dieselben Rendering-Regeln anwenden.
- Peter behält seine eigene Identität, Kleidung und Emotion-Performance.

### C — Kathy Rain

- Ein importiertes neutrales Portrait mit eigenem Stil verwenden.
- Keine Ada-Voss-Stilreferenz erzwingen.
- Der bisherige Character-Lock-Workflow muss weiterhin funktionieren.

Keine Bilder von Ada, Peter oder Kathy in das öffentliche Repository aufnehmen. Automatisierte Tests verwenden synthetische Testbilder.

## 7. Qualitätssicherung

Führe folgende Prüfungen vollständig aus:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:desktop`
- `npm run test:desktop:native`
- `git diff --check`

Ergänze Tests für:

- Stilbildimport und Bildintegrität
- Mehrere getrennte Bildreferenzen
- Stil-/Identitätstrennung
- Profilrevisionen
- Historische Prompt-Provenienz
- Projektmigration
- Zwei Charaktere mit gemeinsamem Stil
- Eigene Stilprofile pro Projekt
- Fehlerhafte, fehlende oder manipulierte Referenzen
- Erhalt des bisherigen ImageGen-Workflows

Für den nativen Smoke-Test weiterhin den eindeutig gekennzeichneten deterministischen Protokoll-Testserver verwenden.

**Keine echte Bildgenerierung ohne explizite Freigabe.** Codex-Kontingent nicht für automatisierte Tests verbrauchen.

## 8. Nicht Bestandteil dieses Auftrags

- Foto-zu-Master-Wizard
- Neuer Character Creator
- Gesichtsmasken und Pixel-Lock-Compositing
- Gesten wie Hände in den Haaren
- Motion-/Transition-Editor
- Automatische Stilqualitätserkennung
- Vollständige Outfit-Bearbeitung

## Definition of Done

Laceframe kann mehrere unveränderliche Stilreferenzen verwalten, den ausgewählten Grafikstil getrennt von der Charakteridentität behandeln und beide Referenzarten über den offiziell unterstützten Codex-Workflow verwenden.

Zwei unterschiedliche Figuren können denselben Spielstil erhalten, ohne dieselbe Person darzustellen oder identisch Emotionen auszudrücken.

Vorhandene Projekte bleiben intakt. Alle Qualitätsprüfungen bestehen.

Erstelle einen PR mit vollständigem Prüfbericht, tatsächlich ausgeführten Tests und allen verbleibenden Einschränkungen. Keine Änderungen direkt auf `main`.