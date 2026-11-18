# Architektur

Gültiger Implementierungsstand: PX-01 auf develop nach UX-06.1, auf Basis des integrierten UX-06 B und DEV-01 (#31–33). [ROADMAP](ROADMAP.md) enthält offene Produktphasen; geplante Architektur wird hier ausdrücklich als geplant bezeichnet. Typen und Validierung im Quellcode sind maßgeblich für die exakten Felder und Grenzen.

## Anwendung und Vertrauensgrenzen

Electron Forge, Vite, React, TypeScript und Zod; keine lokale Datenbank oder zusätzlicher Hintergrundserver. `src/renderer` hält UI/Entwürfe und berechnet Vorschauen in begrenzten Workern. `src/preload/preload.ts`/`src/shared/bridge.ts` definieren die typisierte Schnittstelle. `src/main/main.ts` besitzt Fenster, native Dialoge und die serialisierte IPC-Warteschlange. `ProjectService` besitzt Dateizugriff, Validierung, Persistenz und endgültige Pixelberechnung.

- Sandbox und Context Isolation aktiv, Node Integration aus. Renderer erhält geprüfte Bild-/Pixeldaten und Projektmetadaten, keine generische Dateisystem-, Prozess- oder Token-API.
- IPC prüft exakte WebContents, Main Frame, URL und Eingabeschema. Während einer Generierung sperrt Main Projektmutationen; Status, Abbruch und erforderliche Preview-/Qualitätsabfragen bleiben erreichbar.
- Paketierte UI unter `laceframe://app` mit CSP, gesperrten fremden Protokollen, Navigation, Popups und Berechtigungen. Der Vite-Entwicklungsserver ist lokal; seine exakte URL bildet die Entwicklungsgrenze.
- Begrenzte Reads, Format-/Dimensionsprüfung, kanonische Projektpfade, Hashes und Symlink-Ablehnung. Native Eingabe-/Exportpfade kommen aus OS-Dialogen; Renderer übergibt IDs oder begrenzte Bytes, keine beliebigen Pfadbefehle.
- Geheimnisse verbleiben in der verwalteten Codex-Anmeldung. Keine Cookies, selbst gespeicherten ChatGPT-Passwörter oder API-Keys. Absolute zuletzt gewählte Bildordner werden ausschließlich als lokale Anwendungseinstellung in `userData/image-dialog.json` gespeichert, nicht im Projekt oder Export.

## Anwendungsstart und Projektkontext

`useAppLifecycle` besitzt einen `AppLifecycle`-Controller ohne zweite Projektkopie. React Strict Mode teilt dieselbe Initialisierungs-Promise. Zustände: `booting` → `project-selection` → `opening-project`/`creating-project` → `workspace`; Fehler unterscheiden Start und Projektaktion. `closing-project` endet direkt in der Auswahl. `performance.now()` und bereinigte RAFs steuern die ausdrücklich inszenierte mindestens zehnsekündige Startanimation. Lokale Providerdeskriptoren und das erfolgreich geladene Splashbild bilden die Offline-Initialisierung; kein Codex-Start oder Netzwerkcheck. Ohne Erfolg bleibt der Balken bei 95 %, Fehler erfordern expliziten Retry.

`SplashScreen` ist der einzige projektlose Einstieg: vollständiges Original `public/images/splash.png`, keine darübergelegten Logos. Vite löst `${import.meta.env.BASE_URL}images/splash.png` in Entwicklung relativ zur lokalen UI und paketiert als `laceframe://app/images/splash.png` auf. Das Produktionsprotokoll erlaubt genau diese zusätzliche Bilddatei; `img-src 'self' data:` erlaubt keine fremden Bildserver. Keine Benutzerbilder werden dadurch als statische URLs freigegeben.

Erst ein validierter bestehender `ProjectService`-Snapshot montiert den Workspace. Projektaktionen sind synchron gegen Mehrfachklicks gesperrt; native Dialogabbruch/Fehler erhalten den alten gültigen Workspace samt Entwürfen bei einem Wechsel. Ohne Projekt existiert keine Sidebar im DOM. Schließen verwendet die vorhandene Dirty-Warnung und zusätzlich die serialisierte, absendergeprüfte `project:close`-IPC. Main verwirft nur Projekt-/Staging-/Jobstatus im Speicher, Renderer seine Projektansicht und Entwürfe. Kein Manifest oder Bild wird geschrieben, kein Job läuft weiter, kein automatisches Wiederöffnen. Neustart spielt die Bootsequenz erneut ab; Schließen/Wechsel nicht.

## Studio und Editorpräsentation

`StudioSteps` hält ausschließlich lokale Schritt-/Expertenansicht je erhaltenem Master-/Expressionformular. `App` bleibt Eigentümer des einen Projektsnapshots und der bestehenden Projekt-/Job-/Draft-Grenzen. UX-06.1 rendert Auswahl, Erzeugen und Expertenfelder schrittspezifisch statt versteckter Formularbäume. Formularwerte bleiben im bestehenden Eigentümer; der Master-/Qualitätsprüfcontroller behält seinen Entwurf und rendert außerhalb der Prüfung keine Formulare; ungespeicherte Master-/Qualitätsprüfnotizen fließen in die bestehende Projektwechsel-Warnung ein; echte Generierung/Import führt zur Ergebnisansicht Erzeugen. Der Studioumbau benötigt keine neue Projektpersistenz; die getrennten Anwendungsspracheinstellungen sind unten beschrieben.

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

## Originale Sprite-Fusion-Pixel-Snap-Pipeline

`native/spritefusion/vendor` enthält den unveränderten [Original-Rust-Code](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/tree/02f9315d73d3219274d17767b36d9a231a6b1f4b), Commit `02f9315d73d3219274d17767b36d9a231a6b1f4b`, MIT (Hugo Duprez, 2025). Ein dünner Rust-RGBA-/PNG-Adapter ruft dessen echtes `process_image` auf. Automatische Rastererkennung, K-Means, manuelle Rastergröße, adaptive Rasterkorrektur, eigene Palette und PNG-Encoding bleiben upstream; kein TypeScript-Nachbau. Originale Quelldateien werden vor dem Build gegen `UPSTREAM.json` geprüft. `native/spritefusion/README.md` beschreibt die genaue Grenze und Reproduktion.

`build-spritefusion.cjs`: Rust 1.85.1/wasm-bindgen 0.2.105, Lockfile, 512-MiB-WASM-Maximum. Eingechecktes WASM/Glue wird in Worker und Main aus lokalen Bytes initialisiert; kein CDN/Download oder Rust beim Nutzer. Annahmegrenzen: 4.194.304 Pixel und 67.108.864 Pixel×angeforderte Farben. CSP behält `wasm-unsafe-eval` ohne JavaScript-eval. MIT und Abhängigkeitslizenzen werden paketiert. Der unbenutzte generierte Async-Loader wird nicht aufgerufen.

Der bisherige eigenständig refaktorierte Rust-Pfad unter `native/pixel-snap` bleibt ausschließlich als historische Implementierung für gespeicherte `spritefusion-native-rgba-v1`-Rezepte verfügbar. Die neue UI verwendet `spritefusion-original-wasm-v1`, nutzt Rasteranalyse nur als ausdrücklich separate Laceframe-Diagnose und behauptet keine von der Original-Engine exportierte Confidence/Rasterdiagnose. Original und Vorschau besitzen vollständig unabhängige lokale `PixelViewport`-Kameras. PNG-Vorschau bleibt im RAM; Verwerfen terminiert Worker/Entwurf, ohne Projektdatei. Übernahme rechnet Main nach, prüft Pixel-SHA und speichert **exakte Original-Engine-PNG-Bytes** als separaten ungeprüften Kandidaten. Keine automatische Freigabe.

Originalquantisierung und Rastererkennung sind in `process_image` gekoppelt, auch bei eigener Palette. Regionale Lab-Farbkorrektur bleibt ein unabhängiger bestehender Schritt. Originalresampling kann Maße, Seitenverhältnis, Alpha-Verteilung und Konturdetails ändern; Ausgabegröße und X-/Y-Skalierung werden angezeigt. Keine Alpha-pro-Quellpixel-, Identitäts-, Idempotenz- oder pixelgenaue Registrierungszusage. Alle nichtleeren expliziten/geerbten Schutzmasken sperren diese Transformation; sie werden weder verworfen noch in eine veränderte Geometrie kopiert.

Rezepte/Masks bleiben quellgebunden: Schutzmasken haben Quellmaße, Ergebnisassets tatsächliche Ausgabemaße. Öffnen und Freigeben rechnen den versionierten Pfad nach, alte Projekte öffnen schreibfrei. Erste Original-Engine-Übernahme sichert `laceframe.v2.pre-spritefusion.backup.json`, soweit keine frühere Migration Vorrang hat. Historische Master/Expressions bleiben unverändert; ältere strikte Binaries benötigen Backup plus Assetbaum. Main-Nachrechnung bleibt begrenzt synchron und kann kurz blockieren. Ein WASM-Trap beendet den Job; ein getrappter Main-Runtime benötigt App-Neustart.

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

## Sprache und überprüfte Anzeige

`i18next` / `react-i18next` laden DE/EN ausschließlich aus versionierten JSON-Katalogen unter `src/shared/locales/<Sprache>/`. Gemeinsamer Ort für Main, Worker und React verhindert getrennte Wörterbücher. Zusätzliche Sprachen verwenden dieselben Namensräume/Schlüssel; keine CDN- oder Laufzeitdownloads. Stabile Textschlüssel sind vom Inhalt abgeleitet und bleiben bei Übersetzungsänderungen unverändert. `validation.ts` prüft flache, nichtleere String-Kataloge, gleiche Schlüssel und Platzhalter; der Lokalisierungstest prüft zusätzlich Quelltextverweise, veraltete Schlüssel und hartcodierte JSX-Texte. Technische Symbole und editierbare Projektdaten sind ausdrücklich ausgenommen.

Main liest Betriebssystemsprachen und `userData/preferences.json` vor Fenster-/IPC-Initialisierung. Nur die streng validierte Sprachkennung wird exklusiv/atomar geschrieben; keine Projektdatei, absoluten Bildpfade oder Zugangsdaten. Fehlende, beschädigte, übergroße oder verlinkte Einstellungen fallen auf die Systemauswahl zurück; unbekannte Sprache fällt auf Englisch. `app:preferences` und `app:set-language` verwenden dieselbe Absender-/Mainframe-Prüfung wie Projektaktionen. Englisch ist die Übersetzungs-Fallbacksprache. Die Oberfläche wechselt ohne Remount des Projekts; feste Statuskennungen bleiben unverändert. `displayMessage` übersetzt ausschließlich bekannte technische Meldungen und deren Platzhalter; keine DOM-Suche und keine automatische Übersetzung von Namen, gespeicherten Prompts oder benutzerdefinierten Regeln. Ein externer Sprachpaketimport ist nicht implementiert.

Alle interaktiven Ansichten nutzen den DOM-Fokus als einzige Aktivierungsquelle: erst Klick/Tastaturfokus aktiviert Mausradzoom, Klick außerhalb entfernt ihn. Zoomschaltflächen bleiben unabhängig. Sprite-Fusion-Prüfung zählt RGBA-/Alphaänderungen und erzeugt eine reine Darstellungsdifferenz nur bei gleichen Abmessungen. Geänderte Geometrie bleibt ausdrücklich unregistriert.

Neue Masterfreigaben benötigen `rasterConfirmed` und eine manuelle Prüfnotiz. Alte Master ohne dieses optionale Feld bleiben lesbar und unverändert; es erfolgt keine nachträgliche Entsperrung. Vor dem ersten entsprechenden Schreiben wird das bestehende Manifest exklusiv gesichert (`pre-raster-review` beziehungsweise `pre-candidate-cleanup`; ältere ausstehende Migrationen haben Vorrang).

Abgelehnte, unreferenzierte Expression-/Master-/Qualitätskandidaten erhalten `discardedAt`. Erst nach gespeichertem Manifest werden hashgeprüfte Bytes innerhalb ihrer schemafesten verwalteten Kandidatenpfade entfernt. Geteilte Dateien sowie von Master, Rezept oder Provenienz referenzierte Kandidaten bleiben erhalten. Historie/Versuche bleiben nachvollziehbar und können kein erfundenes Ersatzresultat übernehmen. Bereits verworfene Dateien werden beim Öffnen nicht verlangt. Es gibt keinen pauschalen Garbage Collector, keine Änderung unbekannter Altdateien und keine Löschung im Codex-Ausgabeordner. Die Manifestsicherung stellt gelöschte PNGs nicht wieder her.

**Bewusste Grenze:** Noch ungeprüfte Kandidaten bleiben zur Wiederaufnahme im Projekt gespeichert; eine vollständige Umstellung auf ausschließlich flüchtige, bis zur Freigabe niemals persistierte Kandidaten ist nicht umgesetzt. Unangewendete Pixel-Snap-Vorschauen bleiben dagegen ausschließlich im RAM. Ältere streng validierende Programmversionen verstehen neue Prüf-/Verwerfungsfelder gegebenenfalls nicht.

## Guided Style Creator

Art Direction bleibt der letzte Hauptnavigationspunkt und enthält Library, Create und Details. `StyleCreator` hält bis zu sechs temporäre Referenzen; der vorhandene Analyseworker verwendet weiterhin `measureStyle` (`rgba8-style-v1`). PNG/JPEG/WebP bleiben als Originalbytes erhalten. JPEG wird nur für Messungen im Speicher decodiert; EXIF-orientierte Dimensionen müssen mit der nativen Decodierung übereinstimmen. Import: höchstens 8 MiB/16 MP je Bild, lokale Messung höchstens 4.194.304 Pixel, keine automatische Skalierung. Gruppen werden vor Übernahme in das temporäre Register vollständig validiert; Duplikate/Fehler lassen den vorhandenen Entwurf bestehen. Schließen entfernt Entwurf und Analysebelege aus dem Speicher. Ein ungespeicherter Entwurf wird nicht nach Neustart wiederhergestellt.

Der Main berechnet vor `createStylePreset` die Messwerte erneut, prüft Hashreihenfolge, Rollen, Provenienzbeleg und begrenztes Pack-JSON und erstellt ausschließlich ein neues Profil samt Revision. Projektstandard, Charakterzuordnung, Master und historische Revisionen bleiben unverändert. Bekannte Hashes verwenden verifizierte unveränderliche Stilassets erneut. JSON-Packs enthalten Referenzhashes, keine Bildbytes oder lokalen Pfade. SchemaVersion 2 und das bestehende Packformat bleiben erhalten; optionales `creator` hat die eigene Version `lf-style-creator-v1`. `styleAnalyses.origin: style-creator` prüft die archivierten Messwerte gegen die zugehörige Profilrevision; die strengere bisherige Regelgenerator-Prüfung gilt unverändert für alte Analyseübernahmen. Vor dem ersten Schreiben der neuen Profilmetadaten wird eine exklusive bytegenaue `laceframe.v2.pre-style-creator.backup.json` erstellt, sofern nicht bereits eine ältere notwendige Migrationssicherung ansteht. Ältere strikte Programmversionen können neue Felder/JPEG-Stilassets nicht lesen; für einen Rückstieg Originalbackup und vollständiges Assetverzeichnis behalten.

`CodexStyleAnalysisProvider` implementiert die erweiterbare `SemanticStyleAnalyzer`-Schnittstelle über denselben offiziellen stdio-Client wie ImageGen, aber einen eigenen kontrollierten Prozess mit deaktiviertem ImageGen und Werkzeugen. Vor jedem ausdrücklich gestarteten Analysejob: bestehender ChatGPT-Account, exportiertes Schema mit `localImage`/`outputSchema` und ein explizit bildfähiges Modell aus `model/list`. Fehlende/mehrdeutige Fähigkeiten sperren externe Analyse. Es gibt keine API-Key-Route, Cookies, HTTP-Ersatzendpunkte, automatischen Turns oder Wiederholungen. Bilder werden als gehashte schreibgeschützte temporäre Kopien übertragen; nach Ende/Fehler/Abbruch verschwinden diese Kopien. Ein einziges vollständig validiertes Textresultat und erfolgreicher Turn sind erforderlich. Tool-/ImageGen-Aktivität, ungültiges JSON, fremde Hashes, Prozessfehler und Timeouts werden verworfen. Projektwechsel und Bildaufträge sind während einer semantischen Analyse im Main gesperrt; der Abbrechen-Button verwendet den vorhandenen Aktionsslot außerhalb des global deaktivierten App-Fieldsets. Erfolgreicher Projektwechsel und Schließen löschen zusätzlich den semantischen Providerstatus und seine Projektbindung; Preload liefert nur begrenzte Daten und Status, keine Pfade oder Tokens.

Semantische Antworten unterscheiden beobachtete Bildmerkmale mit Evidenz von subjektiven Stimmung-/Genreinterpretationen mit qualitativer Sicherheit. Manuell importiertes JSON erhält ausschließlich `manual-import` als Herkunft; native Provenienz benötigt einen Main-seitig ausgestellten, projektgebundenen Beleg. Importierte Packs dürfen Herkunft deklarieren, sind aber nicht kryptografisch beglaubigt. Kein heuristischer Textfilter garantiert, dass semantische Vorschläge frei von Inhaltsübertragung sind: abstrakte Rendering-Instruktionen, einzeln bearbeitbare Regeln und ausdrückliche menschliche Prüfung bleiben verbindlich. Eine Arbeits-Palette ändert keine Master-/Haut-/Haarfarben. Technische Vorschläge erfinden weder Genre noch gesicherte virtuelle Originalauflösung.

## Studio-Generierungsaktion

`StudioGenerationAction` ist eine kleine typisierte imperative Verbindung zum aktiven Master-/Expressionformular. `useImperativeHandle` liefert dessen aktuelle `generate()`-Funktion; der Header besitzt weder kopierte Formwerte noch eine zweite Validierungs-/Generierungsimplementierung. Sichtbarkeits- und Ref-Lifecycle lösen die Bindung beim Modus-/Figuren-/Projektwechsel. Ein synchroner Startguard ergänzt die vorhandenen UI-/Main-Joblocks gegen Mehrfachklicks. Öffnen, Navigation und Stilwahl senden keine Generierung.

`App` liefert den Portalzielknoten per React-Callback-Ref nach dem Mounten als Prop an beide Creator. Kein DOM-Lookup während ihres Renderns und keine imperativen DOM-Buttonklicks. Die Aktionsleiste zeigt Status/Anforderungen auch außerhalb von Erzeugen; genau eine Generierungsprimäraktion steht im Header. Abbruch bleibt im bestehenden Slot außerhalb des deaktivierten App-Fieldsets. Unvollständige Eingaben führen zu vorhandenen Requirements und Fokusnavigation. `StudioSteps` speichert feste interne Kennungen; Übersetzungen betreffen nur deren Darstellung. Bestehende Formulare bleiben bei Moduswechsel montiert. Main, Preload, Provider, Authentifizierung, Schemas und Bildalgorithmen bleiben bei dieser UI-Korrektur unverändert.
