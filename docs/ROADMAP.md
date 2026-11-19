# Laceframe — verbindliche Produkt-Roadmap

Stand: 18.11.2026, integrierte Produktbasis `origin/main` nach PR #33 (`64b601e`), tägliche Entwicklung auf `develop`. DEV-01 ist nach ausdrücklicher Benutzerfreigabe gemergt; DEV-02 bleibt auf develop. Implementierung auf develop bedeutet keine Integration nach main oder Veröffentlichung. Diese Datei ist die einzige Produkt-Roadmap; Code, nachvollziehbare Commits und tatsächlich ausgeführte Tests sind maßgeblich.

`main` hält bewusst integrierte Zwischenstände; `develop` laufende Entwicklung, `experiment/*` optionale kurzlebige Experimente. Normale Arbeit benötigt weder Feature-Branch noch PR. Kleine lokale Commits; Push, Main-Integration und Releases ausschließlich auf ausdrücklichen Auftrag. Ein PR bleibt optional, soweit Repositoryregeln es erlauben. Keine automatische Freigabe späterer Produktphasen durch diese Roadmap.

Status wird künftig fachlich getrennt:

| Status | Bedeutung |
| --- | --- |
| IMPLEMENTIERT | Code/Algorithmus vorhanden; bedeutet allein keine fachliche Abnahme oder vollständige UI-Anbindung. |
| FACHLICH FERTIG | Beschriebener begrenzter Ablauf implementiert und durch Tests belegt; keine Garantie generativer Qualität oder Release-Reife. |
| UI-INTEGRATION OFFEN | Konkreter vorhandener Teil ist benannt, Bedienweg/Einbindung fehlt noch. Kein pauschales TODO für fertige Algorithmen. |
| BEKANNTER BUG | Reproduzierbarer Fehler mit betroffener Funktion und Nachweis; von geplanten Erweiterungen unterscheiden. |
| NICHT BEGONNEN | Keine Umsetzung des beschriebenen Zusatzumfangs; vorhandene Grundlagen separat ausweisen. |

Implementierung, fachlicher Abschluss und Integration nach main sind unterschiedliche Aussagen. Bestehende geprüfte Algorithmen bei UI-Redesigns wiederverwenden. Behobene Produktfehler nur mit konkretem Nachweis als behoben kennzeichnen.

## Aktueller Stand

Auf develop zusätzlich implementiert: Original-Sprite-Fusion-WASM (separate Engine-/UI-Commits), fokusgesteuerte Canvas-Bedienung, funktionierender Expression-Einstieg, verbindliche manuelle Rasterprüfung neuer Master, DE/EN-Sprachwahl und sichere Bereinigung unreferenzierter abgelehnter Kandidaten. Expertenansicht verwendet vorhandene Promptmodi, Schutzmasken, historische Herkunft und Diagnosen; kein eigener neuer Bildalgorithmus. Keine Main-Integration oder neue Produktphase.

Offene Grenzen dieses UX-Pakets: neue Geometrie hat keine ungeprüfte Pixelregistrierung; Original-Engine exportiert keine Raster-Confidence. Ungeprüfte Kandidaten bleiben für Neustart im Projekt, referenzierte verworfene Bytes werden konservativ erhalten. Noch keine rein flüchtige Ablage aller ungeprüften Kandidaten. Keine allgemeine visuelle Abnahme jeder Sprach-/Editor-Kombination, keine Windows-/macOS-Abnahme und keine Live-Generierung.


| Status | Funktion | Nachweis im Repository / gemergte PRs |
| --- | --- | --- |
| IMPLEMENTIERT auf develop | Splash-/Projektmanager: mindestens zehn Sekunden Offline-Boot, Öffnen/Erstellen, sicherer Close und direkte Rückkehr zur Auswahl | `app-lifecycle.ts`, `SplashScreen`, gezielte Lifecycle-/Projektservice-Tests und `splash-smoke.cjs`; keine Main-Integration/Alpha-Freigabe |
| FACHLICH FERTIG | Lokale Projekte, sichere Electron-/Preload-Grenzen, unveränderliche Bilder und manuelle Expressionsfreigabe | `project-service.ts`, `domain.ts`, Desktop-Smoke; #2 |
| FACHLICH FERTIG | Native Codex-Generierung mit Masterreferenz, Status, monotonem Timer, Abbruch; manueller Fallback | Provider/Controller, Native-Smoke; #4–5 |
| FACHLICH FERTIG | Art Direction mit Referenzen/Revisionen, getrennte Identität und persönliche Ausdrucksregeln | StyleLibrary, Generation-/Style-Tests; #8–9 |
| FACHLICH FERTIG | Originalpixelschutz, Maskenrevisionen und lokales Compositing | Masking-/Native-Tests; #10, #12 |
| FACHLICH FERTIG | Character Creator, manuelle Masterfreigabe, technische Transparenzprüfung und Master-Rebuild derselben Figur | Creator-/Master-Rebuild-Tests; #11–12, #23 (LF-01) |
| FACHLICH FERTIG | Bildvergleich/Auto-Fit, PNG/JPEG/WebP-Identitätsmehrfachimport und letzter Bildordner | Identity-/Creator-Tests; #26–27 |
| FACHLICH FERTIG | Freistellung, Schutzpixel, Polygon, Zoom/Pan und überprüfte Vorschau | Cutout-/Quality-Tests; #13, #17–19, #22 |
| FACHLICH FERTIG | Nichtdestruktives 2D-Relighting, lokale Stilmetriken und geprüfte Regelübernahme | Relighting-/Style-Tests; #15–16 |
| FACHLICH FERTIG | Expressionsverwaltung und gehaltene Studio-Entwürfe innerhalb einer Sitzung | Studio-/Expression-Tests; #14, #20 |
| FACHLICH FERTIG | Portable Style-/Expression-JSON-Packs und geprüfte Textmigration | Pack-Tests; #24 (LF-02) |
| IMPLEMENTIERT | DEV-01-Testprofile und DEV-02-Development-First-Workflow | `quality-runner.cjs`, manuelle CI, `AGENTS.md`/`TESTING.md`; DEV-01 mit PR #33 nach main integriert; DEV-02 auf develop. Frühere automatische LF-00-Risikoeskalation ersetzt. |
| FACHLICH FERTIG | Regionale Masterpaletten, Driftprüfung und separate Farbkorrektur | Color-Tests; #29 (LF-03A) |
| FACHLICH FERTIG | Pipette, mehrere Farbseeds, Toleranz, rekonstruierbare Regionen und selektiver Palettentransfer | Color-/Desktop-Tests; #30 |
| FACHLICH FERTIG | UX-06: Dokumentationsreset und vierstufiges Studio | A und B gemergt (#31, #32), Studio-/Editor-Smokes |

Die Modelldaten für Outfitnotizen, lokale Bearbeitungsalgorithmen und Prompt-Betriebsarten existieren. Ein vollständiges Outfit-/Condition-System und eine persistente Guided-Mode-Sitzung sind **teilweise vorbereitet, nicht abgeschlossen**; der gemeinsame UX-06-Editorrahmen verwendet weiterhin spezialisierte Masken-/Vergleichskameras. Motion besitzt nur einen Planungshinweis, kein Timeline-Modell oder Playback. PNG-Einzelexport ist vorhanden; Atlas-/Animations-/Engine-Export nicht.

## Priorisierte Phasen und Akzeptanz

UX-06 und DEV-01 sind integriert, DEV-02 ist abgeschlossen. UX-06.1 wurde ausdrücklich auf develop beauftragt und lokal umgesetzt; die weiteren offenen Produktphasen benötigen jeweils eigene Freigabe. Kein automatischer Start nach Commit, Merge oder erledigter Abhängigkeit.

| Phase | Status | Abhängigkeit | Umfang und Abnahmekriterien |
| --- | --- | --- | --- |
| UX-06 A — Documentation Reset | FACHLICH FERTIG | Gemergter Stand bis #30 | Nur README, AGENTS und vier aktuelle Dokumente; alte Aufträge/Berichte löschen, keine Archive; gültige Regeln/offene Arbeit übertragen, alle aktiven Verweise prüfen; Historisch umgesetzt in PR #31. |
| UX-06 B — Studio Redesign | FACHLICH FERTIG | PR A vollständig abgeschlossen/gemergt | Auswählen → Erzeugen → Bearbeiten → Freigeben; große wiederverwendbare Editorfläche mit Werkzeugen, Kontext und festen Aktionen; keine verschachtelten Bildmodals. Standard/Experte zeigen dieselben Daten, alle bisherigen Diagnosen bleiben erreichbar. Entwürfe bei Navigation erhalten, Verluste/Projektwechsel bestätigen. Bestehende Algorithmen/IPC/Versionen beibehalten. Navigation, Mock-Generierung, Referenzen, Vergleich, Masken, Farben, Warnungen, Freigabe/Ablehnung, Restart und Tastatur bei 960×720, 1280×800, 1920×1080 testen. Historisch umgesetzt in PR #32. |
| UX-06.1 — Studio Usability Recovery | IMPLEMENTIERT | DEV-02 abgeschlossen | Direkt auf develop: schrittspezifisch gerenderte Auswahl-/Erzeugenansichten, große eingepasste Master-/Identitätsreferenz, direkte Werkzeugleiste, flache Expertenabschnitte, Masterversionsauswahl. Synthetische Electron-Abnahme bei 960×720, 1280×800, 1920×1080; gezielter Studio-/Creator-Smoke, explizite Freigabe/PNG-Export und unveränderliche Originale. Noch nicht nach main integriert; keine Alpha-Freigabe. |
| UX-07 — Pixel-Finishing-Workspace | IMPLEMENTIERT im unten abgegrenzten Professional-Canvas-Umfang | UX-06 | Gemeinsame präzise Auswahl-/Korrekturbedienung weiterführen; vorhandene Maskenrollen und Werkzeuge erhalten. Verbesserte manuelle Auswahl inklusive offener Freihand-Lasso-Frage prüfen. Undo/Redo, Zoom/Pan, Alpha, sichere Speicherung und identischer Preview-/Export-Nachweis. |
| PX-01 — Pixel Snap & Color Correction | FACHLICH FERTIG im dokumentierten Umfang auf develop | DEV-02 / UX-06.1, ausdrücklich vorgezogen | Ursprünglicher Rust-Auszug bleibt für historische Rezepte. Aktive Pixel-Snap-UI inzwischen mit unveränderter Sprite-Fusion-WASM-Engine, echter Quantisierung/PNG-Ausgabe und unabhängigen Kameras; neue Maße/Alpha-Verteilung explizit, Schutzmasken sperren geometrisches Resampling. Versionierte SHA-Ketten; gemeinsamer Studioeditor, anschließende regionale Lab-Korrektur und manuelle Master-/Expressionsfreigabe. Kein automatischer PX-02-Start. |
| LF-04 — Outfit / Appearance / Condition | NICHT BEGONNEN | UX-06, PX-01-Abschluss gemäß Reihenfolge | Notizen verlustfrei in versionierte Outfitprofile überführen; Identität, Kleidung, Haar-/Erscheinungszustände und narrative Condition getrennt. Eine Figur mit zwei Outfits/Haarzuständen/Conditions, unabhängige Stilregeln, eigene Kandidaten/Review, historische Masterbindung und Restart prüfen. Keine medizinische Diagnose oder automatische Kombinationsgenerierung. |
| EX-01 — Offline-Expression-Katalog | NICHT BEGONNEN | LF-04 | Wiederverwendbare lokale Ausdrucksdefinitionen/Assets und Kompatibilität beschreiben; von bereits vorhandenen generischen JSON-Packs unterscheiden. Herkunft, Revision, Nutzungsrechte, Masken-/Masterbezug und explizite Auswahl; kein stilles Anwenden fremder Identität. |
| EX-02 — Manuelles Character Face Rig | NICHT BEGONNEN | EX-01 | Manuell gesetzte Gesichtsregionen/Anker mit Revision, Undo/Redo, Masterbindung und sicheren Grenzen; kein behauptetes automatisches Gesichtsverständnis. Speichern/Restart und ungeeignete Eingaben testen. |
| EX-03 — Offline-Expression-Transfer | NICHT BEGONNEN | EX-02, UX-07, PX-01 | Kontrollierte lokale Ableitung plus Pixel-Finishing, Original und Alpha erhalten; schlechte/inkompatible Zuordnung ablehnen. Separate prüfbare Kandidaten, reproduzierbare Parameter und exakter PNG-Export; keine Identitätsgarantie aus Ähnlichkeit. |
| EX-04 — Optionale lokale Mimik-Analyse | NICHT BEGONNEN | EX-03, belegte lokale Fähigkeiten | Nur explizit ausgewählte Fotos lokal analysieren; Vorschläge mit Unsicherheit und manueller Kontrolle. Kein Pflichtmodell, heimlicher Download/Upload oder ungefragte Nutzung privater Bilder; keine behauptete implementierte Engine. |
| Motion — Frames / Animation / Ambient | NICHT BEGONNEN | EX-04-Entscheidung, freigegebene Assetbasis | Manuelle Frames, individuelle Dauer/Loop, Play/Stop/Unterbrechung, Canvas/Pivots/Anker und Master-/Outfit-/Zustandsbindung. Vier synthetische Frames reproduzierbar abspielen/reöffnen; keine stillen Reskalierungen oder inkompatiblen States. Dekoratives Ambient-Trinken ändert ohne bestätigte Spielregel keinen spielmechanischen Condition-State. Keine Skelettanimation/Lip-Sync-Garantie. |
| Export — Spritesheets / Engine-Metadaten | NICHT BEGONNEN | Motion | Deterministisches Sheet/PNG-Sequenz und versioniertes JSON mit Framezeiten, Loop, Pivot, Herkunft, IDs/Hashes; nur intakte freigegebene Assets. Alpha, exakte Koordinaten, fehlende Frames, Konflikte und Re-Export testen. Engineadapter erst mit dokumentiertem Format und Parser-/Integrationsbeleg. |

## Vorhandene Grundlagen und offene Einbindung

| Bereich | Implementierung / fachlicher Stand | UI-Integration / offener Zusatzumfang |
| --- | --- | --- |
| Pixelbearbeitung | Masken, Freistellung, Relighting und regionale Farbkorrektur fachlich fertig im oben beschriebenen Umfang | Bereits bedienbar; UX-07 verbessert den gemeinsamen Finishing-Workflow, implementiert diese Algorithmen nicht erneut. |
| Outfit / Condition | Figurgebundene Outfitnotizen und Creator-Prompt implementiert | UI-INTEGRATION OFFEN für vollständige versionierte Outfit-/Appearance-/Condition-Profile; LF-04-Zusatzumfang NICHT BEGONNEN. |
| Guided Mode | Studio-Navigation, Promptkomposition und Sitzungserhalt implementiert | UI-INTEGRATION OFFEN für Projektstart-Assistent/Wiedereinstieg; persistente ungespeicherte Entwürfe und Einsteigerabnahme nicht fertig. |
| Offline-Expressions | Generische Packs und lokale Pixelalgorithmen implementiert | Face Rig und Offline-Transfer NICHT BEGONNEN; vorhandene Algorithmen wiederverwenden, keine fertige Transferengine behaupten. |

## Bekannte Bugs und Stabilisierung

Beim Remote-Audit zu DEV-02 sind keine offenen Issues gemeldet; das ist kein Nachweis einer fehlerfreien Anwendung. UX-06.1 prüft die gemeldeten Mastervorschau-/Studio-Bedienprobleme mit synthetischen Portraits in Electron und visuell angesehenen Screenshots; das ersetzt keine allgemeine Abnahme aller künftigen Funktionen. Reproduzierte Fehler künftig hier als **BEKANNTER BUG** mit Symptom/Nachweis erfassen, gravierende Fehler vor Main-Integration offenlegen. Dokumentierte Funktionsgrenzen bleiben Grenzen und werden nicht als angeblich behobene Bugs umetikettiert.

**Alpha-Stabilisierung — NICHT BEGONNEN, eigener späterer Meilenstein:** nach ausdrücklich gewähltem Featureumfang vollständigen Build sowie Unit-, Desktop- und Native-Regression manuell beauftragen; vorhandene Workflows kurz manuell durchgehen, Sicherheits-/Persistenz-/Migrationstests und PNG-/Alpha-Integrität prüfen. Gravierende Bugs beheben/dokumentieren, Testplattformen und verbleibende Grenzen benennen, danach bewusste Integrations-/Alphaentscheidung. Keine automatische Release-Erstellung; vollständige Regression ist keine tägliche Featurepflicht.

## Weitere offene Arbeit und Abgrenzung

- Früheres **LF-03 Guided Mode**: Basisnavigation, automatische Promptkomposition und Sitzungsentwürfe existieren; die Aufgabenführung geht in UX-06 auf. Projektstart-Assistent, persistente ungespeicherte Entwürfe/Wiedereinstieg nach Neustart und Usability-Abnahme bleiben offen. Abnahme mit mindestens drei echten Einsteigern nur melden, wenn tatsächlich verfügbar und durchgeführt; andernfalls einen Aufgaben-/Messleitfaden mit Fertigstellung, Fehlern, Klickwegen und Verständnisfragen vorsehen.
- Frühere LF-05/LF-06-Ziele sind in Motion/Export übernommen. **LF-07** bleibt optionaler späterer lokaler Provider-/Dataset-Auftrag, getrennt von deterministischem Offline-Transfer: dokumentierte API/Capability Discovery, ausdrückliche Endpointkonfiguration, reale RAM/VRAM-Grenzen, keine automatischen Downloads, nur freigegebene/rechtlich nutzbare Datasetquellen. Training/LoRA ist nicht implementiert und nicht beauftragt.
- Noch offen: verwaltete projektweite Auflösungsprofile, optionale echte Bildausschnitt-Ableitung (Auto-Fit verändert nur Ansicht), Expression-Reorder/Delete mit Abhängigkeitsprüfung, sicherer historischer Master-/Asset-Purge, optionales zweites Licht/Normal-Maps, Metadatenbereinigung privater Identitätsquellen sowie Windows/macOS-Validierung/Distribution.
- **Ersetzt/überholt:** alte Tasknummern/Codex-Aufträge und Validierungsberichte als Arbeitsanweisung; „Task 02B als Nächstes“, „Motion nach Style Intelligence“, Ein-Datei-Identitätsimport und angeblich noch offene LF-01/LF-02/LF-03A. Historie bleibt in Git und PRs, keine zweite Roadmap.

## Gemeinsame Abnahme

Sichere echte Electron-Abläufe, unveränderliche Originale/Referenzen, explizite Freigaben, verständliche Fehler/Abbruch, Tastatur und responsive Darstellung. Änderungen an Schema/Dateien im Main validieren, kompatibel öffnen und erforderliche Backups vor Schreiben. Tests mit synthetischen Bildern; keine privaten Projekte oder Live-ImageGen-Aufrufe. [TESTING](TESTING.md) bestimmt gezielte Entwicklungsprüfungen und optionale manuelle Profile; Ergebnisse im Abschlussbericht und gegebenenfalls optionalen PR nennen. Vor ausdrücklich beauftragter Main-Integration Git-Stand/offene Änderungen, kurze manuelle Gesamtprüfung, relevante Units und Migrationen prüfen; keine ungeprüften Datenmigrationen. Nächste Produktphase ausschließlich mit ausdrücklicher Freigabe beginnen.

## Ergänzung: LF Style Creator

**IMPLEMENTIERT:** Bildgeführter Style Creator in Art Direction mit Library/Create/Details, bis sechs unveränderlichen PNG/JPEG/WebP-Referenzen, lokalem bestehendem Messworker, automatisch vorgeschlagenem unabhängigem Profil, bearbeitbaren Regeln/Arbeitsfarben, ausdrücklicher Inhaltsprüfung, neuer versionierter Speicherung und bestehendem Pack-/Zuordnungsworkflow. Keine Umschreibung bestehender Stile, Standards, Master oder Expressions. Character Creator zeigt Beschreibung und Referenzen; Bibliotheksaktion wählt den Stil ausdrücklich für einen neuen Entwurf.

**IMPLEMENTIERT, LIVE-ABNAHME OFFEN:** Optionaler offizieller Codex-Visionzugang für strukturierte semantische Textinterpretation, konservative Laufzeit-Gates, Abbruch/Fehler/kein Retry und manuelles JSON als unabhängige Alternative. Die installierte Fähigkeit wurde ohne Turn geprüft; deterministische Prozessfixtures prüfen den Ablauf. Keine tatsächlich ausgeführte Modellinterpretation oder semantische Ergebnisqualität behaupten. Stil/Inhalt bleiben durch abstrahierende Instruktionen und menschliche Review getrennt; keine automatische Inhalts- oder Originalitätsgarantie. **OFFEN:** Live-Abnahme mit ausdrücklich freigegebenen Referenzen und Plattformvalidierung für Windows/macOS. Keine weitere Produktphase begonnen.

## Behobene Regression: Studio-Mastergenerierung

**FACHLICH FERTIG im gezielt geprüften Linux-Ablauf auf develop:** Kontextbezogene Headeraktionen rufen die vorhandenen Creator-Controller auf; separate Mode-Navigation erhält Entwürfe. React besitzt den Aktionsslot-Lifecycle, Anforderungen und Abbruch sind erreichbar, das Neue-Figur-Formular erscheint im Creator nur ohne ausgewählte Figur. Expliziter Rebuild und bestehende Promptkonflikt-/Masterfreigabe-Gates schützen alte Versionen. Vollständiger fokussierter Electron-Workflow mit gekennzeichnetem Protokolldouble geprüft, keine Live-Generierung. Details in TESTING. Pixel-Snap-Algorithmus unverändert; dessen separater offener Auftrag wird damit nicht als erledigt oder begonnen behandelt. Keine neue Produktphase und keine Main-Integration.

## Pixel Snap: exakte Zielauflösung und visueller Editor

**IMPLEMENTIERT auf develop:** echte uniform gerasterte Verkleinerung auf explizite Maße; Originalfarben oder unabhängige originale Rust-Farbquantisierung, dominante Zellfarbe/Zellzentrum, Samplingversatz, Alpha-Modus, tatsächliche Farbanzahl, manuell prüfbare Rastervorschläge und synchronisierte große Ansichten. Alte Original-/Native-Rezepte bleiben reproduzierbar. Asynchrone abbrechbare Vorschau, Schutzmasken-Gate, SHA-geprüfte Main-Nachrechnung, versionsgebundener separater Kandidat und Backup vor erster Speicherung. Keine andere Produktphase begonnen.

**GRENZEN:** automatische Rastervorschläge bleiben unsichere Heuristik ohne Engine-Confidence. Kleine Details/Accessoires können bei niedriger Auflösung verloren gehen; keine semantische Identitätsgarantie. Kein Dithering, optionaler Vergleichsslider nicht ergänzt. Nichtleere Schutzmasken blockieren geometrische Transformationen. Keine automatische Bearbeitung vorhandener Portraits/Projekte, keine Live-Generierung; Linux-Abnahme gemäß TESTING, andere Plattformen offen.

## Character Semantic Layers v1

**IMPLEMENTIERT / Linux-Desktopablauf geprüft:** versionierte bild-/mastergebundene Layer-Sets, native persistente Masken mit SHA, sieben Kategorien mit mehreren Instanzen, manueller Editor in Studio/Assetqualität, Konfliktprüfung, 20 Undo-/Redo-Schritte, sichtbare/gesperrte Layer, bestehende Farbregionen als ausdrücklich übernommene Seeds sowie unabhängige Expressionsmasken mit genauer Master-Layervorlage. Alte Bilder und Revisionen bleiben erhalten. Masken bilden Infrastruktur für spätere Palette-/Outfit-/Rig-Verbraucher; bestehende Algorithmen werden nicht ersetzt. Kein neuer Hauptnavigationspunkt und kein automatischer Start einer anderen Roadmapphase.

**VORBEREITET, NICHT IMPLEMENTIERT:** optionaler Segmentierungsprovidervertrag. Kein lokales Modell oder automatische Erkennung/Expressionsregistrierung integriert; keine versteckten Rekonstruktionen, RGBA-Layertrennung, Outfitwechsel, neue Farbkorrektur, Rigging oder Motion. Grenzen: 4 MP, 32 Layer, 64 MiB aktive Maskenbytes; gespeicherte Revisionen persistent, ungespeicherte Entwürfe nur im Editor. Plattformabnahme weiterhin Linux; Windows/macOS offen. Prüfungen und Fixture-/Live-Abgrenzung in TESTING.

## Professional Canvas & Unified Editing Tools v1

**IMPLEMENTIERT auf develop:** fachunabhängiger gewichteter Auswahlkern, vier Auswahloperationen, Zauberstab/Farbbereich mit CIE76/Exaktvergleich und vier/acht Nachbarn, Rechteck/Ellipse/Freihand-/Polygon-/editierbare Bézier-Auswahl, Kreis-/Quadratpinsel, Pixel-Perfect, Radierer und Pipette. Gemeinsame Editorfläche mit PixelViewport, Fokus-/Cursorzoom/Pan, Toolbar, relevanten Werkzeugoptionen, zentralen Shortcuts inklusive nativer Menüabstimmung, Auswahl-/Originaldarstellung, Raster/Overlay, Status und 20-Schritt-Historie. Source-/SHA-gebundene Auswahlrevisionen und getrennt gespeicherte Vektorpfade; Originale unverändert. Semantic Layers, Farbregionen/-korrektur, bestehende Master-/Expression-/Cutoutmasken und Pixel-Snap-Farb-/Schutzregionen verwenden die gemeinsame Auswahl über explizite Hostübernahme. Generierung, Palette-/Rasteralgorithmen und Freigaben bleiben getrennt.

**BEWUSST ERHALTEN / OFFEN:** spezialisierte Fachansichten und ältere Kamera-/Toolbarcontroller außerhalb der neuen Auswahlfläche bleiben erhalten. Keine Behauptung, sämtliche historischen Tastenkürzel oder Vergleichs-/Freistellungskameras ersetzt zu haben. Panel-/Kamerazustand bleibt in der Sitzung; keine dauerhafte Layoutspeicherung. Gemeinsame Auswahl bis 4.194.304 Pixel; größere Bilder behalten ihre vorhandenen Fachwerkzeuge. Keine neue KI-/GPU-Abhängigkeit, automatische Regionen-/Identitätserkennung oder neue Pixel-Snap-Konvertierung. Linux-Prüfungen gemäß TESTING; Windows/macOS offen. Keine weitere Roadmapphase, Main-Integration oder Veröffentlichung begonnen.
