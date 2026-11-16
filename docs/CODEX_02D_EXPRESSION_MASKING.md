# CODEX 02D — Expression Masking & Hard Pixel Lock

## Ziel

Implementiere für Laceframe einen funktionierenden, nichtdestruktiven Masken-Editor mit echtem Pixel-Lock-Compositing für die gezielte Bearbeitung von Gesichtsausdrücken.

Die vorhandene Codex-ImageGen-Integration, Visual Style Library, Character Identity, persönlichen Expression Profiles und Bildvergleiche bleiben erhalten.

**Definition:** Nur explizit freigegebene Bildregionen dürfen durch generierte Pixel ersetzt werden. Außerhalb dieser Bereiche verwendet das endgültige Bild die unveränderten Originalpixel.

## 0. Ausgangslage und Git-Workflow

- Arbeite ausschließlich im bestehenden lokalen Repository.
- Keine Worktrees.
- Keine direkten Commits auf `main`.
- Prüfe zuerst Git-Status, Branch, Remote und offene PRs.
- Stelle sicher, dass Codex 02C / PR #9 vollständig integriert ist.
- Erhalte alle lokalen Änderungen, insbesondere `.vscode/settings.json`.
- Lies `AGENTS.md`, `docs/MVP_PLAN.md`, `docs/ART_DIRECTION_AND_EXPRESSION_IDENTITY.md`, `docs/PR_08_VALIDATION.md` und die Codex-02C-Validierung.
- Erstelle einen neuen Feature-Branch und abschließend einen PR.

Keine persönlichen Portraits, Kathy-Rain-Assets oder Ada-Voss-Originale in Git aufnehmen.

## 1. Masken-Editor

Implementiere in Create einen echten visuellen Editor.

Funktionen:

- Maske auf dem Original-Master zeichnen.
- Pinsel mit einstellbarer Größe.
- Radierer.
- Zoom und Pan.
- Maske vollständig zurücksetzen.
- Rückgängig/Wiederholen.
- Maskenfläche als farbige, halbtransparente Überlagerung darstellen.
- Ein-/Ausblenden der Maskenüberlagerung.
- Masken ausschließlich in Master-Koordinaten speichern.
- Verhindern, dass eine Maske versehentlich auf eine andere Masterversion angewendet wird.

Definiere eindeutig:

- Weiß = Bearbeitung erlaubt.
- Schwarz = Originalpixel schützen.
- Graustufen = optional weich überblenden.

Der Editor muss Maus, Trackpad beziehungsweise Pointer-Eingaben und kleinere Desktopfenster unterstützen.

Eine Maske soll für weitere Emotionen derselben Figur wiederverwendbar sein, aber jede neue Generierung muss die tatsächlich verwendete Maskenrevision festhalten.

## 2. Schutz vor versehentlichen Änderungen

Der ursprüngliche Master bleibt unveränderlich.

Speichere Masken als separate, SHA-256-geprüfte Assets.

Verwende ausschließlich validierte projektlokale Pfade und sichere IPC-Operationen.

- Keine direkten Renderer-Dateisystemzugriffe.
- Keine Pfadübernahme aus ungeprüften Renderer-Eingaben.
- Keine Überschreibung vorhandener Bilddateien.
- Keine stillschweigende Anpassung von Bilddimensionen.

Eine gespeicherte Maske muss beim erneuten Öffnen des Projekts exakt wiederhergestellt werden.

## 3. Zwei Bearbeitungsmodi

### Soft Lock

Übermittle an Codex die unveränderte Masterreferenz und eine eindeutig gekennzeichnete Bearbeitungsmaske, sofern der installierte offizielle App Server dies über seine dokumentierten Fähigkeiten unterstützt.

Prüfe zuvor das tatsächlich installierte Protokoll.

Falls keine echte Maskenunterstützung vorhanden ist, darf Laceframe nicht behaupten, die KI könne eine harte Bearbeitungsgrenze einhalten.

Eine Maske als zusätzliches Referenzbild ist nicht automatisch eine offiziell unterstützte Inpainting-Maske.

### Hard Pixel Lock

Implementiere deterministisches Compositing im Main Process oder in einer sicher abgegrenzten Bildverarbeitungskomponente.

Für jedes Pixel gilt:

- Außerhalb der Maske: exakt die Originalpixel des Masters.
- Innerhalb der Maske: Pixel des generierten Kandidaten.
- An weichen Maskenkanten: definierte Alpha-Überblendung.

Das Ergebnis muss ein neues Asset werden; Master und KI-Rohkandidat bleiben unverändert erhalten.

Die finale Ausgabe muss echte Originalpixel außerhalb der Maske bewahren, nicht nur visuell ähnlich aussehen.

## 4. Unterschiedliche Bilddimensionen

Unser Kathy-Test hat gezeigt, dass Codex eine kleine Originalreferenz deutlich größer ausgeben kann.

Deshalb:

- Keine automatische Skalierung des Masters.
- Keine stillschweigende Skalierung des Ergebnisses.
- Das Hard-Lock-Compositing benötigt identische, korrekt registrierte Bildkoordinaten.
- Bei unterschiedlichen Abmessungen Hard Lock zunächst blockieren.
- Eine zukünftige Registrierung/Transformation darf ausschließlich nach expliziter Benutzerentscheidung erfolgen.
- Fehlende Pixelübereinstimmung klar anzeigen.

Optional darf eine Vorschau einer vorgeschlagenen Anpassung dargestellt werden. Diese darf nicht als pixelgenaue Korrektur bezeichnet werden.

## 5. Kandidatenworkflow

Der Ablauf wird:

1. Charakter-Master auswählen.
2. Emotion und persönliche Expression auswählen.
3. Bearbeitungsmaske auswählen oder erstellen.
4. Codex generiert einen unveränderten Rohkandidaten.
5. Laceframe prüft Format, Dimensionen und Registrierung.
6. Hard-Lock-Compositing erzeugt einen zusätzlichen Kandidaten.
7. Der Benutzer vergleicht Master, Rohkandidat und Composite.
8. Erst nach manueller Prüfung wird das Composite freigegeben.

Rohkandidat, Maske und Composite müssen miteinander verknüpft bleiben.

Ein Composite darf niemals automatisch als freigegeben gelten.

## 6. GUI

Verwende das vorhandene kompakte Laceframe-Design.

Erweitere Create um:

- Bearbeitungsmodus: Ohne Maske / Soft Lock / Hard Pixel Lock.
- Maske bearbeiten.
- Maskenüberlagerung anzeigen.
- Rohkandidat / Composite vergleichen.
- Klare Dimensions- und Registrierungswarnungen.
- Maskenrevision und Herkunft im Inspector.

Die bestehenden Compare-, Zoom-, Pan-, Overlay-, Timer- und Generate/Cancel-Funktionen dürfen nicht regressieren.

In Inspect soll die vorhandene Compare-Komponente soweit sinnvoll wiederverwendet werden. Ergänze für unterschiedlich große Bilder eine ausdrücklich visuelle, normalisierte Ansicht, getrennt von der exakten nativen Pixelregistrierung.

Keine zweiten, unabhängig entwickelten Vergleichsalgorithmen.

## 7. Provenienz und Sicherheit

Jeder Composite-Kandidat dokumentiert:

- Charakter-ID
- Master-ID und Hash
- Rohkandidat-ID und Hash
- Masken-ID und Hash
- Maskenrevision
- Compositing-Version und verwendete Regeln
- Tatsächliche Ausgabedimensionen
- Generation Attempt und Promptrevision
- Prüf- und Freigabestatus

Historische Generierungen ohne Masken müssen vollständig lesbar bleiben.

Migrationssicherungen entsprechend bestehender Projektmechanismen verwenden.

Keine automatische rückwirkende Veränderung bereits freigegebener Expressions.

## 8. Tests

Ergänze gezielte Unit- und Integrationstests für:

- Maskenzeichnung, Erase, Undo/Redo
- Persistenz und Wiederöffnung
- Hash-/Pfadvalidierung
- Pixelgenaue Unveränderlichkeit außerhalb der Maske
- Alpha-Überblendung an weichen Kanten
- Unterschiedliche Bilddimensionen
- Falsche Master-/Maskenzuordnung
- Rohkandidat versus Composite
- Historische Asset-Kompatibilität
- Abbruch und unvollständige Generierung
- Bestehende Style-/Identity-/Expression-Funktionen

Die Pixel-Lock-Eigenschaft mit automatischen Pixelwert-Assertions prüfen. Ein reiner Screenshotvergleich genügt nicht.

Führe vollständig aus:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:desktop`
- `npm run test:desktop:native`
- `git diff --check`

Nutze synthetische Bildfixtures. Keine Live-Bildgenerierung und kein Verbrauch des Codex-Kontingents für automatisierte Tests.

## 9. Nicht Bestandteil

- Automatisches Face Tracking
- Gesichtserkennung oder automatisches Landmark-Mapping
- Vollständiges Rigging
- Lippen-Synchronisation
- Gesten mit Händen
- Motion-Transitions
- Automatische Größenanpassung mit angeblicher Pixelgarantie

## Definition of Done

Eine vorhandene Figur kann eine neue Emotion generieren, wobei der Benutzer eine konkrete Bearbeitungsregion festlegt.

Bei identischen Bilddimensionen bewahrt Hard Pixel Lock nachweislich sämtliche Originalpixel außerhalb der Maske. Innerhalb der Maske kann der neue Ausdruck erscheinen.

Originalbilder, Rohkandidaten und frühere Freigaben bleiben unverändert. Composites werden separat geprüft und freigegeben.

Erstelle einen PR mit vollständigem Prüfbericht, tatsächlich ausgeführten Tests, offenen Einschränkungen und klarer Trennung zwischen Soft-Lock-Anweisungen und technisch garantiertem Hard Pixel Lock.