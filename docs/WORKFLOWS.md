# Workflows

**Vorhandene Oberfläche:** Characters / Art Direction / Expressions / Studio / Library / Motion. Die Bedienwege unten sind implementiert, sofern ausdrücklich nicht als geplant bezeichnet. Studio verwendet die Aufgaben **Auswählen → Erzeugen → Bearbeiten → Freigeben** für Master und Expressions. Die Schritte behalten ihre Eingaben innerhalb der Sitzung; keine Navigation startet eine Generierung.

## 1. Projekt erstellen

Über **Projekt erstellen …** einen leeren Ordner außerhalb des Repositorys wählen; alternativ ein vorhandenes Projekt mit `laceframe.json` öffnen. Das gesamte Verzeichnis einschließlich Assets sichern. Projektwechsel warnt vor erkannten ungespeicherten Entwürfen; während einer Generierung erst abbrechen oder Ergebnis abwarten.

Gespeicherte Quellen, Regeln, Versuche, Bilder und Freigaben überleben den Neustart. Unangewendete UI-/Editorentwürfe bleiben nur in der geöffneten Sitzung erhalten, nicht nach App-Neustart. Wechsel zwischen besuchten Bereichen/Figuren und Master-/Expressionmodus erhält die Studio-Entwürfe derselben Sitzung. Ein persistenter Guided-Wiedereinstieg ist geplant.

## 2. Stil festlegen

**Art Direction**: Profil erstellen/auswählen, Rendering, Licht, Farben, Komposition oder strukturierte Regeln bearbeiten. Projektstandard oder individuelle Stilzuordnung wählen; **Eigener Masterstil** verwendet keine Stilbilder. PNG/WebP-Referenzen lokal importieren, entfernen oder wiederverwenden. Jede Übernahme erstellt eine neue Revision; historische Revisionen sind lesbar, ihre Originale bleiben erhalten.

Optional **Stil analysieren ↓**: Referenzen und Typen/ROIs wählen, lokal messen, Vorschläge/Palette korrigieren und ausdrücklich als neue Stilrevision übernehmen. ROI gilt nur für Messung; die Generierung bekommt vollständige Originalreferenzen. Ein Spiele-/Stilname allein analysiert nichts. Bildrechte selbst prüfen.

Style-/Expression-Packs über native JSON-Dialoge austauschen. Importvorschau prüfen und Neu/Aktualisieren/Überspringen explizit entscheiden. Persönliche Identität/Outfits/Ausdrucksregeln nicht als globalen Stil teilen. Der Text-Migrationsassistent archiviert Originalregeln und erstellt eine neue geprüfte Revision; Vorschläge sind nicht unfehlbar.

## 3. Charakter erstellen

**Characters → Neuen Charakter erstellen** oder **Studio → Master erstellen**: Figur benennen, ein bis drei Identitätsbilder (PNG/JPEG/WebP) per Mehrfachauswahl oder Drop importieren, Stil, Outfitbeschreibung und Komposition festlegen. Anzahl, Referenzrollen und Zielmaße prüfen. Zu große Gruppen, Duplikate und defekte Dateien werden vollständig abgelehnt. Einzelne Quellen lassen sich entfernen/ersetzen; historische Abhängigkeiten bleiben archiviert.

Der native Bilddialog merkt sich den letzten gewählten Ordner über Neustarts; Abbruch behält ihn, ein fehlender Ordner verwendet den OS-Standard. Drop verändert diese native Ordnerwahl nicht. Import/Änderung von Einstellungen erzeugt kein Bild.

Optional den offiziellen Codex CLI separat installieren und dort mit ChatGPT anmelden (`codex login`); `codex` muss im App-PATH stehen. **Neutralen Masterkandidaten generieren** ist eine bewusste, kontingentrelevante Aktion. Ohne verfügbaren Provider bleibt der Import eines vorhandenen geprüften transparenten Masters über Characters nutzbar. Text-only-Neuerstellung ist nicht implementiert.

## 4. Master prüfen und freigeben

Identität, Stil, Outfit, Silhouette, tatsächliche Auflösung und Transparenz prüfen. Identitätsvergleich passt unterschiedliche Bilder unabhängig ein; der erweiterte Pixelvergleich zeigt denselben Pixelursprung mit Slider/Overlay. Auto-Fit/Zoom verändert nur die Ansicht, keine Datei und keine Identität.

Neue Masteraktivierung benötigt echte transparente, nichtleere Bilddaten sowie Identitäts-/Silhouetten-/Aktivierungsbestätigung und eine Prüfnotiz. Ein opakes oder verdächtiges generiertes Bild erst freistellen, die separate Ableitung prüfen und freigeben; alternativ ablehnen oder ausdrücklich neu generieren. Ein gestagtes opakes lokales Importbild wird nicht still in einen KI-Versuch umgewandelt.

**Master neu aufbauen** verwendet dieselbe Figur und vorhandene Identitäts-/Stil-/Outfitinformationen. Öffnen erzeugt keinen Auftrag. V1 bleibt aktiv, bis eine neue Version ausdrücklich freigegeben wird; bestehende Expressions/Masken behalten V1 als Herkunft. Historische Master können verglichen/exportiert, aber nicht destruktiv gelöscht werden.

## 5. Expressions auswählen

**Expressions** verwaltet globale Familien/Varianten, Intensität, Anweisungen und vorgeschlagene Sprechaktion. Eigene Varianten sind möglich. Persönliche Performance gilt nur für die gewählte Figur/Variante; ohne Override greift die globale Vorlage. **Expression bearbeiten** übergibt den aktuellen Kontext an Studio.

**Studio → Expression erstellen**: Figur, freigegebenen Master, Familie/Variante und unabhängige Aktion wählen. Wut kann still oder schreiend sein; „Anbrüllen“ ersetzt nicht die gesamte Emotionsfamilie. Aktiven Stil und wirksame Regeln prüfen.

## 6. Erzeugen oder importieren

- **Codex Native:** Verfügbarkeit prüfen, Referenzen/Anweisung ansehen und bewusst generieren. Genau ein Auftrag; tatsächliche Phase und Timer, erreichbarer Abbruch, ehrliche Fehler. Erfolg erstellt einen ungeprüften Entwurf. Keine automatische Wiederholung oder Fortsetzung nach Neustart, keine garantierte Zielauflösung oder Identitäts-/Stiltreue.
- **Manueller Fallback:** Prompt kopieren und optional ChatGPT im Browser öffnen; Master dort selbst anhängen. Echtes PNG/WebP-Ergebnis per Dialog/Drop importieren. Die externe Arbeit ist kein In-App-Generierungserfolg. Originale Auflösung erhalten; keine automatische Skalierung.
- **Prompt Builder:** Automatisch, Ergänzen oder Expert Override. Kontextkonflikte ausdrücklich lösen. Historie ansehen ersetzt nicht den Arbeitsentwurf; Übernahme aus Historie bleibt explizit.
- **Später geplant:** deterministischer Offline-Expression-Katalog, manuelles Face Rig und Transfer. Der manuelle Import ist kein implementierter Offline-Transfer.

## 7. Manuell bearbeiten

**Studio → Bearbeiten** bietet Vergleich und Qualitätswerkzeuge; in der Library bleiben sie über **Assetqualität** erreichbar. Farbkorrektur, Farbauswahl, Masken/Freistellung und Relighting verwenden die gemeinsame fensterfüllende Editorfläche. Unterwerkzeuge ersetzen die sichtbare Fläche; der übergeordnete Entwurf bleibt erhalten und wird danach wieder bedienbar. Eigenschaften stehen seitlich, Übernehmen/Verwerfen bleiben erreichbar. Nicht jedes Werkzeug gilt für jede Quelle.

| Aufgabe | Aktueller Weg / Bedeutung |
| --- | --- |
| Vorher/Nachher | Master-/Kandidatenvergleich, Slider per Maus/Touch/Pfeiltasten/Shift/Home/End, gemeinsamer Zoom/Pan, Overlay-Deckkraft; unterschiedliche Maße bleiben sichtbar. |
| Originalpixel erhalten | **Originalpixel erhalten**: erlaubte Expressionsmaske bearbeiten/speichern, tatsächliches Rohresultat importieren, gleiche Maße und Registrierung manuell bestätigen, separates geschütztes Ergebnis erstellen und prüfen. Weiß erlaubt Änderung, Schwarz erhält den Master. Soft Lock ist nicht verfügbar. |
| Hintergrund entfernen | **Hintergrund freistellen**: Original/Ergebnis/Alpha prüfen; Pipette/Toleranz, Schutz-/Entfernen-Pinsel, Polygon und Feinkorrektur nutzen. Weiß erhält Vordergrund, Schwarz entfernt Alpha. Speichern erstellt eine separate Ableitung, noch keine Freigabe. |
| Farbdrift prüfen | **Farbkonsistenz prüfen**: Masterregionen über sichtbare Palette, Farbklick/Toleranz und mehrere Seeds aufbauen, Pinsel korrigiert. **Region speichern**, dann Masterpalette als neue Revision speichern. Kandidatenregion separat zuordnen und Pose prüfen. |
| Masterfarben annähern | Regionale Master-/Kandidatenpalette vergleichen, **Masterpalette gezielt übertragen** oder eigene Farbgruppe wählen, Stärke/Radius und Schutzpixel prüfen. Keine Vollquantisierung; dunkle Zusatzschatten behalten standardmäßig ihre Helligkeit. L*-Versatz nur ausdrücklich wählen. Separaten Farbkandidaten speichern. |
| Nachbeleuchten | Erst freigegebene Cutout-Herkunft plus echte Transparenz, dann **Live Relighting öffnen**. Richtung, Intensität, Temperatur, Umgebung, Schatten/Kontrast/Highlights und manuelle Regionen einstellen; Original vergleichen, als separaten Lichtkandidaten übernehmen. Keine 3D-Beleuchtung ohne Geometrie. |
| Auflösung ableiten | Explizites Zielprofil und nearest/bilinear wählen. Transparente Einpassung oder bestätigter Crop; separate Ableitung statt Masteränderung. Pixelart wird dadurch nicht automatisch stilistisch konsistent. |

Undo/Redo, Abbruch/Verwerfen und tatsächliche Vorschau nutzen. Der Master, das ursprüngliche Rohresultat und alte Rezepte bleiben unverändert. Nicht passende Maße, Grenzen oder unverifizierte Vorschauen werden nicht durch stille Umrechnung übergangen. Detaillierte Format-/Pixelgrenzen stehen in [ARCHITECTURE](ARCHITECTURE.md).

## 8. Freigeben und exportieren

Entwurf groß vergleichen, Warnungen, Identität, Silhouette, Alpha, Farbe und Masterherkunft prüfen. Freigabe bleibt eine menschliche Entscheidung; technische Transparenz oder geringe Farbabweichung reicht dafür allein nicht. Kandidat ablehnen/verwerfen oder erforderliche Qualitätsnotiz/Bestätigung ergänzen und ausdrücklich freigeben. Verbesserungen am aktuellen Master erstellen V2+, Expressions behalten ihren tatsächlichen Referenzmaster.

**Library** zeigt Master, Masterentwürfe, Expressions und Qualitätsvarianten einschließlich historischer Versionen. **Transparentes PNG exportieren** schreibt nur ein intaktes freigegebenes transparentes Asset; optional Herkunfts-JSON mit exportieren. **Ausdrücklich Rohbild exportieren** ist der gesonderte `_RAW`-Weg. Ausgabeordner außerhalb des Projekts wählen; existierende Dateien werden nicht überschrieben. Das gesamte Projekt für spätere Bearbeitung zusätzlich sichern.

## Studio bedienen

1. **Auswählen:** Figur, Masterversion, Expression/Intensität/Aktion beziehungsweise Identitätsquellen, Outfit und Stil festlegen. Die Hauptbereiche bleiben unverändert.
2. **Erzeugen:** Eingaben und Ergebnisvorschau prüfen. Die feste Aktionsleiste zeigt Voraussetzungen, echte Phase, Zeit und Abbruch. Sie bleibt auch beim Schrittwechsel erreichbar. Nur ein ausdrücklicher Generieren-/Importklick startet Arbeit.
3. **Bearbeiten:** Vergleich, Originalpixelschutz, Farbe, Freistellung, Qualität und vorhandenes Relighting verwenden. Abgeleitete Bilder sind eigene Entwürfe. Zoom ändert keine Pixel: Einpassen/1:1, Mausrad, Hand/Alt-Ziehen; in den Farb-/Lichtansichten auch +/- und Pfeiltasten auf der Bildfläche. Die präzise Maske behält ihre bestehenden Werkzeugkürzel und Zoom-/Pan-Steuerung.
4. **Freigeben:** Große Vorschau, Transparenzbefund, Herkunft und gegebenenfalls separate Qualitätsversion prüfen. Masteraktivierung und Qualitätsableitungen benötigen weiterhin Bestätigungen/Notizen. Rohentwurf und abgeleitete Version sind unterschiedliche Freigaben. Danach zur Library wechseln und exportieren.

**Expertenansicht** blendet vollständige Generierungsanweisung im Schritt Erzeugen sowie technische Herkunft, Maskenrevisionen, SHA-256 und historischen Verlauf ein. Die Farb-/Qualitätswerkzeuge behalten ihre Messwerte und Diagnosen. Ein Kontextkonflikt des eigenen Prompts bleibt auch in Standard sichtbar und muss explizit gelöst werden. Das Umschalten erzeugt keine zweite Projektkopie und verwirft keine Eingaben.

Projektwechsel und Verwerfen geänderter Bildentwürfe verlangen Bestätigung. Kein automatisches Speichern unfertiger Editorentwürfe über einen Neustart; gespeicherte Assets/Rezepte bleiben wiederherstellbar. Ein unabhängiger Pixel-Finishing-Workspace und verbesserte Auswahl sind UX-07, nicht Teil dieses Ablaufs.

Motion/Animation, Spritesheets, Game-Engine-Export und optionale lokale Mimik-/Modellanalyse bleiben getrennte spätere Phasen; siehe [ROADMAP](ROADMAP.md).
