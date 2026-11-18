# Architektur

Gültiger Implementierungsstand: PX-01 auf develop nach UX-06.1, auf Basis des integrierten UX-06 B und DEV-01 (#31–33). [ROADMAP](ROADMAP.md) enthält offene Produktphasen; geplante Architektur wird hier ausdrücklich als geplant bezeichnet. Typen und Validierung im Quellcode sind maßgeblich für die exakten Felder und Grenzen.

## Anwendung und Vertrauensgrenzen

Electron Forge, Vite, React, TypeScript und Zod; keine lokale Datenbank oder zusätzlicher Hintergrundserver. `src/renderer` hält UI/Entwürfe und berechnet Vorschauen in begrenzten Workern. `src/preload/preload.ts`/`src/shared/bridge.ts` definieren die typisierte Schnittstelle. `src/main/main.ts` besitzt Fenster, native Dialoge und die serialisierte IPC-Warteschlange. `ProjectService` besitzt Dateizugriff, Validierung, Persistenz und endgültige Pixelberechnung.

- Sandbox und Context Isolation aktiv, Node Integration aus. Renderer erhält geprüfte Bild-/Pixeldaten und Projektmetadaten, keine generische Dateisystem-, Prozess- oder Token-API.
- IPC prüft exakte WebContents, Main Frame, URL und Eingabeschema. Während einer Generierung sperrt Main Projektmutationen; Status, Abbruch und erforderliche Preview-/Qualitätsabfragen bleiben erreichbar.
- Paketierte UI unter `laceframe://app` mit CSP, gesperrten fremden Protokollen, Navigation, Popups und Berechtigungen. Der Vite-Entwicklungsserver ist lokal; seine exakte URL bildet die Entwicklungsgrenze.
- Begrenzte Reads, Format-/Dimensionsprüfung, kanonische Projektpfade, Hashes und Symlink-Ablehnung. Native Eingabe-/Exportpfade kommen aus OS-Dialogen; Renderer übergibt IDs oder begrenzte Bytes, keine beliebigen Pfadbefehle.
- Geheimnisse verbleiben in der verwalteten Codex-Anmeldung. Keine Cookies, selbst gespeicherten ChatGPT-Passwörter oder API-Keys. Absolute zuletzt gewählte Bildordner werden ausschließlich als lokale Anwendungseinstellung in `userData/image-dialog.json` gespeichert, nicht im Projekt oder Export.

## Studio und Editorpräsentation

`StudioSteps` hält ausschließlich lokale Schritt-/Expertenansicht je erhaltenem Master-/Expressionformular. `App` bleibt Eigentümer des einen Projektsnapshots und der bestehenden Projekt-/Job-/Draft-Grenzen. UX-06.1 rendert Auswahl, Erzeugen und Expertenfelder schrittspezifisch statt versteckter Formularbäume. Formularwerte bleiben im bestehenden Eigentümer; der Master-/Qualitätsprüfcontroller behält seinen Entwurf und rendert außerhalb der Prüfung keine Formulare; ungespeicherte Master-/Qualitätsprüfnotizen fließen in die bestehende Projektwechsel-Warnung ein; echte Generierung/Import führt zur Ergebnisansicht Erzeugen. Es gibt keine neue Projektpersistenz oder IPC-Methode.

`EditorWorkspace` präsentiert Farb-, Regions-, Masken- und Lichteditoren über React-Portale außerhalb des inerten App-Roots. Kontextzähler verbergen übergeordnete Arbeitsflächen während eines Unterwerkzeugs; Zustand, Worker und Undo-Historie bleiben erhalten. Es gibt genau eine sichtbare Dialogfläche. Standard-Studiowerkzeuge sind direkt zugänglich; Prompt/Herkunft stehen als flache Abschnitte in der Expertenansicht. Masterhistorie verwendet eine ausdrückliche Versionsauswahl statt eines Accordions. Tastaturereignisse bleiben im aktuellen Workspace, Fokus kehrt nach dem Schließen zurück. Vorhandene Speichern-/Verwerfen- und Dirty-Prüfungen bleiben verantwortlich; Lichtentwurf-Verwerfen fragt jetzt ebenfalls nach.

`PortraitPreview` lädt ausschließlich über die bestehende Preview-IPC. Characters sowie Auswahl/Erzeugen im Studio zeigen den Master beziehungsweise die Identitätsquelle groß mit Einpassen als Ausgangsansicht. `PixelViewport` teilt die Darstellungskamera für Portrait, Farbpipette, Farbauswahl und Lichtanzeige: begrenzter CSS-Zoom, Einpassen/1:1/200/400 und Zoomregler, Pan mit Alt/Leertaste/Hand, Tastatur und am Mauszeiger verankertes Mausrad; keine zusätzlichen nativen Bildbuffer und keine Änderung des Exports. Maske und registrierter Vergleich behalten ihre spezialisierten Kameras/Interaktionen. Eine Vereinheitlichung ihrer Bildverarbeitung ist nicht vorgenommen; UX-07 bleibt getrennt.

## Persistenz und unveränderliche Herkunft

`src/shared/domain.ts` validiert `laceframe.json` mit **schemaVersion 2**, UUID-Verknüpfungen und zusätzlichen Versionsmarkern/Collections. Kernobjekte: Characters, Masters, Families, Variants, Expressions (`assets`), Attempts/Promptrevisionen, Art Directions/Revisionen, Style Assets/Analyses, Identity Assets, Master Attempts/Candidates, Masks, Quality Assets und Master Palettes.

```text
Projekt/
  laceframe.json
  assets/
    originals/       # Master-Originale
    candidates/      # Expression-Rohresultate
    identities/      # Identitätsquellen (auch JPEG)
    master-candidates/
    styles/
    masks/           # Expressionsmasken
    quality/         # separate PNG-Ableitungen
    cutout-masks/
    relight-masks/
    color-masks/
```

Binärnamen sind content-addressed (`<sha256>.<format>`). Ausschließliche schreibgeschützte Kopien erhalten Originalbytes und externe Quellen; getrennte Datensätze können dieselben Bytes referenzieren. Neue Masterversionen ändern nur den aktiven Zeiger der Figur. Historische Expressions behalten ihren damaligen Master samt Hash, Masken, Stilrevision, Referenzreihenfolge und vollständiger Generierungsanweisung.

Öffnen prüft Schema, Beziehungen, tatsächliche Dateien/Hashes/Dimensionen und relevante Rezeptdaten, bevor das aktive Projekt ersetzt wird. Alte Projekte öffnen schreibfrei. Erforderliche Format-/Feature-Erweiterungen sichern vor der ersten Änderung bytegenau nach `laceframe.v1.backup.json` beziehungsweise `laceframe.v2.pre-<feature>.backup.json`; ältere Migrationsprioritäten und Konfliktprüfung bleiben bestehen. Nicht jede additive Operation ist eine neue Migration. Frühere nie gespeicherte Stiltexte werden nicht rekonstruiert. Rückkehr zu älteren strikten App-Versionen benötigt ein passendes Manifestbackup **und den vollständigen Assetbaum**.

Manifeständerungen verwenden synchronisierte temporäre Dateien und atomare Umbenennung; fremde Manifeständerungen werden als Konflikt abgelehnt. Import-/Staging-Ressourcen werden bereinigt. Ein Prozessabbruch kann unreferenzierte content-addressed Dateien hinterlassen; kein automatischer destruktiver Garbage Collector. Hashes/Readonly erkennen Änderungen, sind kein Schutz gegen einen feindlichen OS-Benutzer. Projekte nicht parallel außerhalb der App bearbeiten.

Identitäts-Mehrfachimport validiert die gesamte Gruppe inklusive Kapazität und Duplikat-SHA vor einer atomaren Manifestübernahme; keine Batch-Staging-Tokens. Historisch verwendete entfernte Quellen werden archiviert. Originales EXIF/Metadaten bleibt erhalten und kann bei expliziter Generierung mitgesendet werden; kein Privacy-Scrubber oder sicheres Löschen externer/Codex-Kopien.

## Fachliche Trennung und Promptkomposition

| Dimension | Implementierung / Grenze |
| --- | --- |
| Art Direction | Gemeinsame Rendering-, Kontur-, Licht-, Farb-, Material- und Kompositionsregeln; versionierte Profile/Referenzen. Kein Ersatz für eine Figurenidentität. Projektstandard, persönliches Profil oder eigener Masterstil. |
| Character Identity | Eigene Referenzen, Figur und freigegebener unveränderlicher Master. Stilreferenzen dürfen Gesicht, Haare, Kleidung oder Persönlichkeit nicht übertragen. |
| Outfit | Figurgebundene Notizen und Creator-Anweisung vorhanden; vollständige versionierte Outfit-/Appearance-/Condition-Systeme sind geplant. |
| Expression | Erweiterbare Familien/Varianten als Daten; Intensität optional. Persönliche Performance nach `(characterId, variantId)` überschreibt nur diese Kombination, sonst globale Vorlage. |
| Aktion / Zustand | `silent`, `speaking`, `shouting` sind unabhängig von Emotion. Appearance, narrative Condition, Gesten und Verhalten sind getrennte geplante Dimensionen; keine medizinische Diagnose. |

Promptkomposition trennt technische Constraints, Stil, Identität, Outfit, Ausdruck/Performance, Aktion, Komposition und Ergänzungen. Automatisch/Ergänzen folgen dem Kontext; Expert Override bewahrt eigene Texte und verlangt Konfliktauflösung nach Kontextwechsel. Main-eigene Transparenz-/Referenz-/Freigabegrenzen werden dadurch nicht ausgeschaltet. Gespeicherte Prompts sind immutable Snapshots. Sichtbare Regelquellen machen die Herkunft nachvollziehbar; Text-Linter und Migrationsvorschläge sind unsichere Heuristiken, keine semantische Gewissheit.

## Provider und Job-Lebenszyklus

`ImageGenerationProvider` bietet Authentifizierung, Fähigkeiten, Generate/Edit, Cancel und Ergebnisabfrage. `manual-import` ist offline funktionsfähig. `codex-native` startet den offiziellen lokalen App Server über stdio JSON-RPC und verwendet bestehende verwaltete ChatGPT-Anmeldung; vor jedem Job `initialize`/`initialized`, `account/read`, `experimentalFeature/list`. Account muss `chatgpt`, ImageGen aktiv sein. Das Standardmodell kommt aus `model/list`, danach ephemerer `thread/start` und ein `turn/start`.

Expression-Input: ausgewählter freigegebener Master zuerst, danach Stilreferenzen der exakten Revision. Creator: ausdrücklich gewählte Identitätsquellen getrennt von Stilquellen. Readonly-Temporärkopien werden nochmals geprüft. Offizieller CLI-Schemaexport bestätigt Mehrfachreferenztransport; ohne Bestätigung werden konfigurierte Mehrfachbilder nicht still verworfen. Keine bestätigte Inpainting-Maskenschnittstelle: Soft Lock bleibt nicht verfügbar. Der separate `chatgpt-plan`/Responses-Zugang ist in dieser App kein bildfähiger Provider; nicht mit Codex Native verwechseln.

Erfolg erfordert ein erfolgreiches `imageGeneration`-Ereignis und einen abgeschlossenen Turn. `savedPath` muss eine absolute normalisierte PNG/WebP-Datei im konkreten Codex-Thread-Verzeichnis sein; Traversal, falsche Threads, Symlinks, ungültige/überlange Daten werden abgelehnt. Sichere Projektaufnahme erzeugt einen ungeprüften Kandidaten, keine automatische Freigabe. Renderer bekommt weder Codex-Dateipfad noch Credentials. Kindprozess arbeitet restriktiv; unerwartete Tools/Prozessaktionen und automatische Retry-Ereignisse brechen den Job ab.

Genau ein Job; Generierung nur durch explizite Aktion, keine Anwendungs-Retryschleife. Main misst Laufzeit monoton, speichert Start/Ende/Dauer/Outcome und zeigt tatsächliche Protokollphasen statt Prozentwerten. Abbruch, Fehler und Timeout bleiben unterscheidbar; laufende oder unterbrochene Jobs werden nicht als Erfolg rekonstruiert oder nach Neustart automatisch fortgesetzt. Atomar begonnene Ergebnisaufnahme darf korrekt fertig werden. Codex-Kontingent, CLI-Version und Account begrenzen Verfügbarkeit; keine Zusage kostenloser/unbegrenzter oder pixelidentischer Generierung.

## Masken, Farbe und Qualität

| Werkzeug | Bedeutung und überprüfte Grenze |
| --- | --- |
| Expressionsmaske / Originalpixelschutz | Weiß erlaubt Änderung, Schwarz kopiert alle geschützten Master-RGBA8-Kanäle exakt. Gleiche native Maße und manuell bestätigte Registrierung erforderlich. V1 `rgba8-straight-round` bleibt lesbar, neue V2 `rgba8-premultiplied-round` mischt Alpha-korrekt; Zwischengewichte sind keine physikalisch lineare Beleuchtung. |
| Freistellung | Weiß erhält Vordergrund, Schwarz entfernt Alpha, Grau reduziert es; ursprüngliches Alpha wird nicht überhöht. Farbseeds, Forced Background und Protected Foreground haben getrennte Rollen; Schutz gewinnt bei Konflikt. Polygone schützen, entfernen oder begrenzen automatische Auswahl. Baked RGB-Matten/Halos werden nicht automatisch rekonstruiert. |
| Relighting | Versionierte CPU-Tonwert-/Verlaufsberechnung in Worker und Main; WebGL-Präsentation mit Canvas2D-Fallback. Nur geprüfte freigegebene Cutout-Herkunft plus echte Transparenz berechtigen zur neuen Lichtrevision. Keine 3D-Geometrie, automatischen Normalen oder neue Hintergründe. Alpha bleibt erhalten. |
| Regionale Palette | Manuelle Haar-/Haut-/Kleidungs-/eigene Regionen; mehrfache Originalfarbseeds, Lab76-Toleranz, global/vierfach zusammenhängend, additiv/subtraktiv und Pinselkorrekturen. Masterrezepte `color-region-lab76-v1` mit Seeds/Base-/Override-Masken werden beim Speichern/Öffnen exakt nachgerechnet. Keine Regionsübertragung aus gleicher Pose/Dimension ableiten. |
| Farbkorrektur | `regional-lab-offset-v1`: selektive a/b-Verschiebung innerhalb expliziter Kandidatenmasken, keine Palettenquantisierung. Standard erhält L* und zusätzliche dunkle Schatten. L*-Versatz nur explizit; Stärke/Radius steuerbar, Schutzpixel und Alpha exakt. Vorschlag für Gruppenpaare aus tatsächlichen Paletten; Clipping/Rundung kann Details begrenzen. |
| Farb-/Stilprüfung | Messungen, keine Identitäts-/Stilprozente: nächste mittlere chromatische ΔE76-Distanz und positive Aufhellung; Stilanalysator liefert Histogramme/ROI-/Run-/Kantenindikatoren. Kein bewiesenes globales Pixelraster, Materialerkennen, semantische Segmentierung oder garantierter Stiltransfer. |

Farbwarnung: mittlere a/b-Distanz >12 oder mittlere Aufhellung über hellster Referenz +8 L* >8. Diese Heuristik ersetzt keine Sichtprüfung und kann Drift übersehen. Regionspaletten zeigen maximal 16 tatsächliche Vertreter aus 5-Bit-Histogrammgruppen; nicht jede seltene Farbe ist vertreten. Candidate-Picker-Schritte sind Bearbeitungshilfen; gespeichert werden die exakte Kandidatenmaske und Korrekturparameter. Master-Auswahlrezepte sind vollständig rekonstruierbar.

Quality Assets sind separate `cutout`, `resolution`, `relighting`, `color-correction`, `pixel-snap`, `color-adjustment`-PNG-Entwürfe. Main prüft Quellhash, Bindungen, Rezept, vorhandene Pixelschutzgrenzen und exakte Preview-Pixel-SHA; bei Freigabe erforderliche Ableitungen erneut nachvollziehen. Manuelle Freigabe erzeugt gegebenenfalls einen neuen Master oder eine Expression mit ursprünglicher Masterbindung. Opaque/empty/suspicious Quellen werden nicht als neue transparente Master zertifiziert; alte Projekte bleiben historisch lesbar.

## Native Pixel-Snap-Pipeline

PX-01 verwendet einen gezielt refaktorierten Auszug des tatsächlichen [Sprite-Fusion-Rust-Codes](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/tree/02f9315d73d3219274d17767b36d9a231a6b1f4b) (MIT, Copyright 2025 Hugo Duprez). Der ursprüngliche WASM-Pfad quantisiert vor der Analyse und reduziert auf einen Pixel je Rasterzelle. Deshalb wird er nicht unverändert eingebunden. `native/pixel-snap` dokumentiert Herkunft und Änderungen; vollständige MIT-Hinweise liegen dort und als mitgelieferte Electron-Ressource vor.

Übernommene Gradientenprofile, Peak-Abstände, Rasterwanderung und Achsenstabilisierung arbeiten direkt auf unquantisiertem RGBA. Plateau-/vergleichbare Peakbehandlung stabilisiert Rastergrenzen bei einzelnen Details. Die dominante Farbauswahl aus dem ursprünglichen `resample` wurde auf bestehende Koordinaten refaktoriert: kein kleineres Zwischenbild, keine Größenänderung, kein nachträgliches Hochskalieren. Nur nahe Minderheitsfarben in stark dominierten Zellen mit lokaler Unterstützung werden geändert. Unsichere oder kontrastreiche Details bleiben stehen. Halbtransparentes und unsichtbares RGBA, Alpha und Schutzpixel bleiben exakt; es gibt keine semantische Gesichts-/Haareinordnung.

`clean_rgba` und `quantize_rgba_to_palette` sind getrennte Rust-/WASM-Einstiege. Rasterbereinigung ruft keine Quantisierung auf. Die optionale explizite Palettenabbildung wird nur separat getestet, nicht durch die Pixel-Snap-Oberfläche verwendet. Automatische K-means-Reduktion ist nicht eingebunden. Vorhandene Lab-Farbkorrektur bleibt in `correctColorRegions` wiederverwendet; der bisherige Palette-Lock ergänzt weiterhin seine eigenen Herkunftsprüfungen. Master und Expressions nutzen denselben Editor und dieselbe Qualitätsablage.

Die auf Rust 1.85.1 gepinnte, abhängigkeitenfreie Bibliothek wird ausdrücklich über `node scripts/build-pixel-snap.cjs` gebaut. Das eingecheckte Modul (Base64 plus SHA im generierten TS) läuft ohne Downloads im Worker sowie Main. Keine Hostimporte; maximal 128 MiB WASM-Speicher und 4.194.304 Pixel, keine automatische Verkleinerung. CSP erlaubt dafür nur zusätzlich `wasm-unsafe-eval`, kein JavaScript-eval. Vorschauänderungen schreiben keine Dateien; Abbruch terminiert den Worker. Zoom/Pan teilen die bestehende `PixelViewport`-Kamera. Adaptive Rastergrenzen werden nicht irreführend als einheitliche Rasterlinien dargestellt.

`createPixelEdit` nimmt ausschließlich Quellen-ID/Hash, begrenzte Einstellungen und Masken sowie den Vorschau-Pixel-SHA an. Main verifiziert Herkunft und Originalpixelschutz, rechnet mit demselben WASM/CPU-Farbkern nach, speichert unveränderliche PNGs/Masken und ein versioniertes Rezept mit Quellbindung. Übernahme erzeugt nur Kandidaten. Öffnen prüft Rezepte, Hashes und Maße; Freigabe rechnet die gesamte Qualitätskette nach. Die erste Pixelableitung sichert das vorherige Manifest nach `laceframe.v2.pre-pixel-edit.backup.json`, sofern nicht bereits eine vorrangige Altformatmigration ansteht. Ältere Projekte öffnen schreibfrei; ältere strikte App-Versionen benötigen das Backup und alle Originalassets.

## Grenzen und Exportformate

| Eingabe / Operation | Implementierte Grenze |
| --- | --- |
| Allgemeiner Bildimport | PNG/WebP, 32 MiB, maximal 16.384 je Kante und 64.000.000 Pixel; Bearbeitungen haben strengere Grenzen. |
| Identitätsbilder | PNG/JPEG/WebP, drei aktive Quellen pro Figur, jeweils 16 MiB / 16.000.000 Pixel. |
| Stilreferenzen | PNG/WebP, sechs pro Revision, 8 MiB / 16.000.000 Pixel, 128 eindeutige Assets und 100 Profile pro Projekt. |
| Pixelverarbeitung / manuelle Masken | Nichtanimiertes PNG ≤8 Bit, höchstens 16.000.000 Pixel; WebP je Qualitätsfunktion über Chromium, kein WebP-Hard-Composite. |
| Auto-Cutout / Relighting / Stil-/Farbanalyse | Höchstens 4.194.304 Pixel, keine automatische Verkleinerung; Farben/Licht maximal fünf Regionen, Farbauswahl 32 Schritte. |
| Manifest / JSON-Packs | Manifest 4 MiB; Pack 512 KiB, Tiefe 20, maximal 30.000 JSON-Werte plus strikte Feldgrenzen. |

PNG-Pixelgarantien betreffen dekodierte RGBA8-Werte; abgeleitete Bilder versprechen keine 16-Bit-/HDR-/ICC-Erhaltung. WebP-Decode kann verstecktes RGB transparenter Pixel normalisieren. Auto-Fit bis 16 MP ändert nur die Kamera; keine Datei wird beschnitten. Große, begrenzte Main-Reberechnungen/Encoding können kurz blockieren; Worker-Live-Vorschau ist keine 60-FPS- oder Gesamt-RAM-Garantie.

- **Bildexport:** neue PNG-Datei und optional JSON `exportVersion: 1` mit Output-SHA, Quelle, Qualitätsbefund und Figuren-/Master-/Rezept-/Versuchshistorie. Gespeicherte PNG-Bytes bleiben beim Export exakt; WebP wird dekodiert/als PNG codiert. Produktions-Export verlangt freigegebenes, tatsächlich nichtleeres transparentes Asset; expliziter `_RAW`-Export bleibt getrennt. Keine Überschreibung und kein Export in interne Projektordner.
- **Style Pack:** `format: "laceframe.style"`, `schemaVersion: 1`, Pack-ID/Revision/Provenienz, strukturierte Regeln, originale Freitextfelder, Referenzhashes und optional gekennzeichnete Analysebefunde.
- **Expression Pack:** `format: "laceframe.expressions"`, `schemaVersion: 1`, stabile Familien-/Varianten-IDs/Slugs, Anweisungen, Intensität und Sprechaktion. Keine persönlichen Overrides, Figuren, Fotos oder Bilddaten.
- Packs sind Daten, kein ausführbarer Code. Unbekannte Felder/Versionen, unsichere Strings/URLs/Pfade/Prototype-Keys werden abgelehnt. Explizite Vorschau mit Neu/Aktualisieren/Überspringen, UUID-Neuzuordnung und Konfliktprüfung; keine stille Übernahme. Hash-only-Referenzen laden keine Bilder herunter. Freitext vor Weitergabe selbst prüfen. Provenienz-JSON enthält figurenspezifische Historie und gespeicherte Anweisungen; vor Weitergabe prüfen. PNG-Provenienz ist kein vollständiges portables Charakterpaket; Spritesheets/Animations-/Engine-Schemas sind noch geplant.

## Geplant: Offline-Expression-Engine

Bestehende lokale Pixelalgorithmen und Providergrenzen sind wiederverwendbar; **keine Offline-Gesichtsanalyse, kein Face Rig oder Expression-Transfer implementiert**. Geplant sind getrennte versionierte Katalog-/Rig-/Transfer-Verträge mit manuell zugeordneten Regionen/Ankern, Kompatibilitätsprüfung, deterministischen Parametern, SHA-256-Quellen und separaten Entwürfen. Optionale lokale Analyse/Modellanbindung benötigt belegte Fähigkeiten, ausdrückliche Konfiguration und eigene Tests. Kein Modellzwang, heimlicher Download/Upload oder Training; keine neue zweite Projektzustandskopie. Details/Prioritäten stehen ausschließlich in der [Roadmap](ROADMAP.md).
