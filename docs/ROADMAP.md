# Laceframe — verbindliche Produkt-Roadmap

Stand: 18.11.2026, geprüft gegen `origin/main` nach PR #30 (`b0d8603`), Implementierung, Testinventar, gemergte PRs und Issues. Beim Audit bestanden keine offenen PRs und keine Issues. Diese Datei ist die einzige Produkt-Roadmap. Status: **DONE / IN PROGRESS / TODO / BLOCKED**. DONE bezeichnet vorhandenen, geprüften Umfang dieses Stands; PR-Review/Merge sind auf GitHub nachzuweisen, nicht aus dem Status abzuleiten. Keine Garantie generativer Bildqualität. Phasen werden einzeln freigegeben, in eigenem Branch/PR geprüft und vom Benutzer gemergt.

## Aktueller Stand

| Status | Funktion | Nachweis im Repository / gemergte PRs |
| --- | --- | --- |
| DONE | Lokale Projekte, sichere Electron-/Preload-Grenzen, unveränderliche Bilder und manuelle Expressionsfreigabe | `project-service.ts`, `domain.ts`, Desktop-Smoke; #2 |
| DONE | Native Codex-Generierung mit Masterreferenz, Status, monotonem Timer, Abbruch; manueller Fallback | Provider/Controller, Native-Smoke; #4–5 |
| DONE | Art Direction mit Referenzen/Revisionen, getrennte Identität und persönliche Ausdrucksregeln | StyleLibrary, Generation-/Style-Tests; #8–9 |
| DONE | Originalpixelschutz, Maskenrevisionen und lokales Compositing | Masking-/Native-Tests; #10, #12 |
| DONE | Character Creator, manuelle Masterfreigabe, technische Transparenzprüfung und Master-Rebuild derselben Figur | Creator-/Master-Rebuild-Tests; #11–12, #23 (LF-01) |
| DONE | Bildvergleich/Auto-Fit, PNG/JPEG/WebP-Identitätsmehrfachimport und letzter Bildordner | Identity-/Creator-Tests; #26–27 |
| DONE | Freistellung, Schutzpixel, Polygon, Zoom/Pan und überprüfte Vorschau | Cutout-/Quality-Tests; #13, #17–19, #22 |
| DONE | Nichtdestruktives 2D-Relighting, lokale Stilmetriken und geprüfte Regelübernahme | Relighting-/Style-Tests; #15–16 |
| DONE | Expressionsverwaltung und gehaltene Studio-Entwürfe innerhalb einer Sitzung | Studio-/Expression-Tests; #14, #20 |
| DONE | Portable Style-/Expression-JSON-Packs und geprüfte Textmigration | Pack-Tests; #24 (LF-02) |
| DONE | Risk-Based CI und Vermeidung doppelter Post-Merge-Läufe | Quality-Routing-/Gate-Tests; #25, #28 (LF-00) |
| DONE | Regionale Masterpaletten, Driftprüfung und separate Farbkorrektur | Color-Tests; #29 (LF-03A) |
| DONE | Pipette, mehrere Farbseeds, Toleranz, rekonstruierbare Regionen und selektiver Palettentransfer | Color-/Desktop-Tests; #30 |
| IN PROGRESS | UX-06: Dokumentationsreset und vierstufiges Studio | Zweiteiliger aktueller Auftrag; Studio-Redesign noch nicht implementiert |

Die Modelldaten für Outfitnotizen, lokale Bearbeitungsalgorithmen und Prompt-Betriebsarten existieren. Ein vollständiges Outfit-/Condition-System, eine persistente Guided-Mode-Sitzung und ein einheitlicher Editor sind **teilweise vorbereitet, nicht abgeschlossen**. Motion besitzt nur einen Planungshinweis, kein Timeline-Modell oder Playback. PNG-Einzelexport ist vorhanden; Atlas-/Animations-/Engine-Export nicht.

## Priorisierte Phasen und Akzeptanz

Nur **UX-06** ist mit diesem Auftrag zur Umsetzung freigegeben. Alle folgenden Einträge sind Planung. Abhängigkeit bedeutet weder automatische Freigabe noch Implementierungsbeginn.

| Phase | Status | Abhängigkeit | Umfang und Abnahmekriterien |
| --- | --- | --- | --- |
| UX-06 A — Documentation Reset | DONE | Gemergter Stand bis #30 | Nur README, AGENTS und vier aktuelle Dokumente; alte Aufträge/Berichte löschen, keine Archive; gültige Regeln/offene Arbeit übertragen, alle aktiven Verweise prüfen; eigenständiger Dokumentations-PR. |
| UX-06 B — Studio Redesign | TODO | PR A vollständig abgeschlossen/gemergt | Auswählen → Erzeugen → Bearbeiten → Freigeben; große wiederverwendbare Editorfläche mit Werkzeugen, Kontext und festen Aktionen; keine verschachtelten Bildmodals. Standard/Experte zeigen dieselben Daten, alle bisherigen Diagnosen bleiben erreichbar. Entwürfe bei Navigation erhalten, Verluste/Projektwechsel bestätigen. Bestehende Algorithmen/IPC/Versionen beibehalten. Navigation, Mock-Generierung, Referenzen, Vergleich, Masken, Farben, Warnungen, Freigabe/Ablehnung, Restart und Tastatur bei 960×720, 1280×800, 1920×1080 testen. Eigener Code-PR nach A. |
| UX-07 — Pixel-Finishing-Workspace | TODO | UX-06 | Gemeinsame präzise Auswahl-/Korrekturbedienung weiterführen; vorhandene Maskenrollen und Werkzeuge erhalten. Verbesserte manuelle Auswahl inklusive offener Freihand-Lasso-Frage prüfen. Undo/Redo, Zoom/Pan, Alpha, sichere Speicherung und identischer Preview-/Export-Nachweis. |
| PX-01 — Pixel Grid Analyzer | TODO | UX-07 | Tatsächliches Raster/Mixel-Indizien nachvollziehbar messen, Unsicherheit zeigen; Snapping nur ausdrücklich als separate Ableitung. Kein aus Run-Length-Metriken behauptetes Raster, keine automatische Portrait-Verkleinerung. Synthetische Raster-/Nicht-Raster-/Alpha-Fixtures und exakter Export. |
| LF-04 — Outfit / Appearance / Condition | TODO | UX-06, PX-01-Abschluss gemäß Reihenfolge | Notizen verlustfrei in versionierte Outfitprofile überführen; Identität, Kleidung, Haar-/Erscheinungszustände und narrative Condition getrennt. Eine Figur mit zwei Outfits/Haarzuständen/Conditions, unabhängige Stilregeln, eigene Kandidaten/Review, historische Masterbindung und Restart prüfen. Keine medizinische Diagnose oder automatische Kombinationsgenerierung. |
| EX-01 — Offline-Expression-Katalog | TODO | LF-04 | Wiederverwendbare lokale Ausdrucksdefinitionen/Assets und Kompatibilität beschreiben; von bereits vorhandenen generischen JSON-Packs unterscheiden. Herkunft, Revision, Nutzungsrechte, Masken-/Masterbezug und explizite Auswahl; kein stilles Anwenden fremder Identität. |
| EX-02 — Manuelles Character Face Rig | TODO | EX-01 | Manuell gesetzte Gesichtsregionen/Anker mit Revision, Undo/Redo, Masterbindung und sicheren Grenzen; kein behauptetes automatisches Gesichtsverständnis. Speichern/Restart und ungeeignete Eingaben testen. |
| EX-03 — Offline-Expression-Transfer | TODO | EX-02, UX-07, PX-01 | Kontrollierte lokale Ableitung plus Pixel-Finishing, Original und Alpha erhalten; schlechte/inkompatible Zuordnung ablehnen. Separate prüfbare Kandidaten, reproduzierbare Parameter und exakter PNG-Export; keine Identitätsgarantie aus Ähnlichkeit. |
| EX-04 — Optionale lokale Mimik-Analyse | TODO | EX-03, belegte lokale Fähigkeiten | Nur explizit ausgewählte Fotos lokal analysieren; Vorschläge mit Unsicherheit und manueller Kontrolle. Kein Pflichtmodell, heimlicher Download/Upload oder ungefragte Nutzung privater Bilder; keine behauptete implementierte Engine. |
| Motion — Frames / Animation / Ambient | TODO | EX-04-Entscheidung, freigegebene Assetbasis | Manuelle Frames, individuelle Dauer/Loop, Play/Stop/Unterbrechung, Canvas/Pivots/Anker und Master-/Outfit-/Zustandsbindung. Vier synthetische Frames reproduzierbar abspielen/reöffnen; keine stillen Reskalierungen oder inkompatiblen States. Dekoratives Ambient-Trinken ändert ohne bestätigte Spielregel keinen spielmechanischen Condition-State. Keine Skelettanimation/Lip-Sync-Garantie. |
| Export — Spritesheets / Engine-Metadaten | TODO | Motion | Deterministisches Sheet/PNG-Sequenz und versioniertes JSON mit Framezeiten, Loop, Pivot, Herkunft, IDs/Hashes; nur intakte freigegebene Assets. Alpha, exakte Koordinaten, fehlende Frames, Konflikte und Re-Export testen. Engineadapter erst mit dokumentiertem Format und Parser-/Integrationsbeleg. |

## Weitere offene Arbeit und Abgrenzung

- Früheres **LF-03 Guided Mode**: Basisnavigation, automatische Promptkomposition und Sitzungsentwürfe existieren; die Aufgabenführung geht in UX-06 auf. Projektstart-Assistent, persistente ungespeicherte Entwürfe/Wiedereinstieg nach Neustart und Usability-Abnahme bleiben offen. Abnahme mit mindestens drei echten Einsteigern nur melden, wenn tatsächlich verfügbar und durchgeführt; andernfalls einen Aufgaben-/Messleitfaden mit Fertigstellung, Fehlern, Klickwegen und Verständnisfragen vorsehen.
- Frühere LF-05/LF-06-Ziele sind in Motion/Export übernommen. **LF-07** bleibt optionaler späterer lokaler Provider-/Dataset-Auftrag, getrennt von deterministischem Offline-Transfer: dokumentierte API/Capability Discovery, ausdrückliche Endpointkonfiguration, reale RAM/VRAM-Grenzen, keine automatischen Downloads, nur freigegebene/rechtlich nutzbare Datasetquellen. Training/LoRA ist nicht implementiert und nicht beauftragt.
- Noch offen: verwaltete projektweite Auflösungsprofile, optionale echte Bildausschnitt-Ableitung (Auto-Fit verändert nur Ansicht), Expression-Reorder/Delete mit Abhängigkeitsprüfung, sicherer historischer Master-/Asset-Purge, optionales zweites Licht/Normal-Maps, Metadatenbereinigung privater Identitätsquellen sowie Windows/macOS-Validierung/Distribution.
- **Ersetzt/überholt:** alte Tasknummern/Codex-Aufträge und Validierungsberichte als Arbeitsanweisung; „Task 02B als Nächstes“, „Motion nach Style Intelligence“, Ein-Datei-Identitätsimport und angeblich noch offene LF-01/LF-02/LF-03A. Historie bleibt in Git und PRs, keine zweite Roadmap.

## Gemeinsame Abnahme

Sichere echte Electron-Abläufe, unveränderliche Originale/Referenzen, explizite Freigaben, verständliche Fehler/Abbruch, Tastatur und responsive Darstellung. Änderungen an Schema/Dateien im Main validieren, kompatibel öffnen und erforderliche Backups vor Schreiben. Tests mit synthetischen Bildern; keine privaten Projekte oder Live-ImageGen-Aufrufe. [TESTING](TESTING.md) bestimmt das verpflichtende risikobasierte Profil; Ergebnisse im jeweiligen PR dokumentieren. Nach abgeschlossenem Phasen-PR nächste Phase ausschließlich mit Freigabe des Benutzers beginnen.
