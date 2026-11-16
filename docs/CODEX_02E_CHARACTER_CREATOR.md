# CODEX 02E — Character Creator / Photo-to-Master

## Ziel

Erweitere Laceframe um einen eigenständigen **Create Character**-Workflow:

**Foto oder Illustration → Identitätsreferenz → Art Direction → Outfit → neutraler Masterkandidat → manuelle Freigabe → bestehender Expression-Workflow.**

Das System muss neue Figuren im Grafikstil eines Spiels erzeugen können, ohne Gesicht, Frisur, Kleidung oder persönliche Merkmale der Stilreferenz zu übernehmen.

## 0. Git und Ausgangslage

- Arbeite im bestehenden lokalen Laceframe-Repository.
- Keine Worktrees und keine Commits direkt auf `main`.
- Prüfe den Git-Status und synchronisiere sicher mit `origin/main`.
- PR #10 (Expression Masking & Hard Pixel Lock) ist gemergt.
- Bereits vorhandene lokale Änderungen, insbesondere `.vscode/settings.json`, nicht überschreiben.
- Neuer Feature-Branch und abschließend ein Pull Request.
- Lies `AGENTS.md`, die aktuelle Roadmap und die Validierungsberichte zu Codex 02C und 02D.

Bestehende ImageGen-, Masken-, Vergleichs- und Style-Funktionen dürfen nicht regressieren.

## 1. Character Creation als eigener Modus

Implementiere einen echten Workflow zur Erstellung neuer Charakter-Master.

Unterstützte Identitätsquellen:

- Einzelnes Selfie oder Portraitfoto
- Mehrere Fotos derselben Person (maximal drei zum Einstieg)
- Vorhandene Illustration
- Optional: ausschließlich textbasierte Charakterbeschreibung, sofern der bestehende Provider dies tatsächlich unterstützt

Importiere PNG/JPEG/WebP mit validierten Größen, sicheren Pfaden, SHA-256 und unveränderlicher Speicherung.

Beim Selfie-Import dürfen die Originale nicht automatisch in ein öffentliches Repository, die Zwischenablage oder einen externen Dienst übertragen werden.

Die Identitätsreferenzen werden ausschließlich nach ausdrücklichem Generierungsklick an den bestehenden Codex-Provider übergeben.

## 2. Klare Trennung der Referenzrollen

Jeder Master-Generierungsauftrag besitzt getrennte Eingaben:

**IDENTITY REFERENCE**

Definiert erkennbare individuelle Merkmale:

- Gesichtsform
- Augen, Nase, Mund
- Frisur und Haarstruktur
- Persönliche optische Besonderheiten
- Ungefähre Proportionen

**STYLE REFERENCE**

Definiert ausschließlich die Darstellung:

- Pixel-/Paint-Stil
- Konturen
- Pixelcluster und Detailgrad
- Schattierung
- Licht- und Farbdramaturgie

**OUTFIT DESCRIPTION**

Definiert die gewünschte Kleidung unabhängig vom Selfie und den Stilreferenzen.

**MASTER COMPOSITION**

Definiert neutrale Mimik, Pose, Bildausschnitt, Hintergrund und gewünschtes Asset-Profil.

Keine automatische Übertragung der Ada-Voss-Gesichtsmerkmale oder ihrer Kleidung auf eine neue Figur.

## 3. Native Codex-Integration

Erweitere den vorhandenen CodexImageGenerationProvider um die gesonderte Operation `createCharacterMaster`.

Verwende weiterhin:

- Offiziellen lokalen Codex App Server
- Verwaltete ChatGPT-Anmeldung
- Bestehenden Capability-Check
- Sichere lokale Referenzkopien
- Einen expliziten Generierungsauftrag pro Klick
- Bestehende Status-, Timer-, Fehler- und Abbruchbehandlung

Prüfe die installierten offiziellen Schemas auf die benötigten Bildreferenzen.

Der Character Creator darf nicht voraussetzen, dass bereits ein freigegebener Charakter-Master existiert.

Er darf auch nicht die bestehende Expression-Edit-Operation zweckentfremden.

Keine API-Keys, HTTP-Workarounds oder zusätzlichen kostenpflichtigen Provider.

## 4. Master Candidate Workflow

Ein generiertes Portrait wird zunächst ein **Master Candidate**.

Implementiere:

1. Neue Figur anlegen.
2. Identitätsreferenzen importieren.
3. Art Direction auswählen.
4. Neutrale Pose und Bildausschnitt festlegen.
5. Outfit beschreiben.
6. Masterkandidat generieren.
7. Ergebnis visuell prüfen.
8. Kandidat freigeben oder ablehnen.

Mehrere Generierungen erzeugen separate Kandidaten mit eigener Provenienz.

Kein automatisches Überschreiben oder Austauschen bestehender Master.

Erst nach ausdrücklicher Freigabe wird ein Kandidat zum unveränderlichen **Master V1**.

Eine Figur darf im Entwurfszustand noch keinen Master besitzen.

## 5. Neutrale Masterpose

Der Standard für Dialogportraits:

- Ruhige, neutrale Gesichtsmimik
- Blick zur Kamera
- Stabile Kopfhaltung
- Kopf und Oberkörper sichtbar
- Schultern vollständig innerhalb des Ausschnitts
- Keine dynamischen Gesten
- Keine sprechende oder schreiende Mundpose
- Einheitliche Positionierung innerhalb des gewählten Art-Direction-Profils

Die gewünschte Ausgabeauflösung ist ein Ziel, keine zugesicherte ImageGen-Eigenschaft. Tatsächliche Abmessungen immer prüfen und unverändert dokumentieren.

Für spätere Sprite-Master dürfen eigene Kompositionsregeln gelten. Keine automatische 64×64-Konvertierung von Portrait Artistic.

## 6. Oberfläche

Implementiere in Characters eine kompakte Aktion:

**Neuen Charakter erstellen**

Dahinter ein eigener Editor mit folgenden Bereichen:

- Identität
- Art Direction
- Outfit
- Master Composition
- Generierung
- Kandidatenprüfung

Zeige Identitätsfoto und Stilreferenz klar getrennt.

Wiederverwende die vorhandenen Vorschau- und Vergleichskomponenten, sofern technisch sinnvoll.

Der Generator muss anzeigen, welche Referenzen tatsächlich an Codex übermittelt werden.

Keine überladene technische Formularwand und keine funktionslosen Platzhalter.

## 7. Persistenz und Freigabe

Speichere pro Masterkandidat:

- Charakter-ID
- Identitätsreferenzen mit Hash
- Art-Direction-ID und exakte Revision
- Stilreferenzen mit Hash
- Outfit-Beschreibung
- Kompositionsregeln
- Vollständige Promptrevision
- Provider und Laufzeit
- Kandidatenstatus
- Bildabmessungen und Hash

Alte Projekte müssen weiterhin geöffnet werden können.

Verwende sichere Migrationen und exklusive Originalbackups. Keine Veränderung alter Master, Kandidaten oder Freigaben.

Nach Freigabe muss der neue Master mit den bestehenden Expressions, persönlichen Expression Profiles und Masken kompatibel sein.

## 8. Tests

Ergänze Tests für:

- Identitätsfoto-Import und Integrität
- Mehrere Identitätsreferenzen
- Getrennte Stilreferenzen
- Korrekte Referenzreihenfolge
- Mastergenerierung ohne bestehenden Master
- Mehrere Masterkandidaten
- Freigabe und Master Lock
- Ablehnung und erneute Generierung
- Abbruch und Fehler
- Migration alter Projekte
- Wechsel in den Expression-Workflow
- Sichere Löschung beziehungsweise Entfernung nicht mehr benötigter privater Identitätsreferenzen ohne Beschädigung historischer Abhängigkeiten

Nutze ausschließlich synthetische Testbilder.

Führe aus:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:desktop`
- `npm run test:desktop:native`
- `git diff --check`

Keine echte Bildgenerierung ohne meine ausdrückliche Freigabe.

## 9. Abnahmeszenario: Entwickler-Cameo

Nach Implementierung möchte ich:

1. Meine eigenen Selfies importieren.
2. Den Spielstil **Ada Voss · Illustrated Noir** auswählen.
3. Ein individuelles Outfit festlegen.
4. Ein neutrales Dialogportrait von mir generieren.
5. Den besten Masterkandidaten freigeben.
6. Eine persönliche Expression wie „Skeptisch“ erzeugen.

Die generierte Figur darf nicht wie Ada aussehen, muss aber zur Bildsprache ihres Spiels passen.

## Nicht Bestandteil

- Motion-Animationen und Rigging
- Automatische Gesichtsvermessung
- Video- oder Webcam-Liveaufnahme
- Automatische Altersveränderung
- Automatische Charaktererkennung
- Exakte Gesichtstreue-Garantien
- Automatische Pixelregistrierung unterschiedlicher Ausgabegrößen

## Definition of Done

Aus einem importierten Selfie oder einer Illustration kann Laceframe durch explizite native Codex-Generierung einen neuen neutralen Masterkandidaten erzeugen.

Nach manueller Freigabe wird dieser unveränderlich gespeichert und kann unmittelbar für den bestehenden Expression-Workflow verwendet werden.

Alle Tests bestehen, und bestehende Projekte bleiben kompatibel.

Erstelle einen Pull Request samt vollständigem Validierungsbericht und dokumentiere sämtliche Einschränkungen.