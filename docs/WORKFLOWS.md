# Workflows

**Vorhandene Oberfläche:** Characters / Art Direction / Expressions / Studio / Library / Motion. Die Bedienwege unten sind implementiert, sofern ausdrücklich nicht als geplant bezeichnet. Studio verwendet die Aufgaben **Auswählen → Erzeugen → Bearbeiten → Freigeben** für Master und Expressions. Die Schritte behalten ihre Eingaben innerhalb der Sitzung; keine Navigation startet eine Generierung.

## Starten, öffnen und schließen

Beim vollständigen Anwendungsstart erscheint ausschließlich das originale Splashbild. Die bewusst inszenierte Startanimation dauert mindestens zehn Sekunden; ihre humorvollen Meldungen sind keine technische Diagnose. Bei langsamer lokaler Initialisierung wartet sie bei 95 %, bei einem Fehler bietet sie **Erneut versuchen**. Dafür sind weder Internet noch Codex-Anmeldung nötig.

Anschließend bleibt dasselbe Bild als Projektmanager sichtbar: **Projekt öffnen** wählt über den OS-Dialog ein vorhandenes Projekt; **Neues Projekt** erfragt Name und einen leeren lokalen Ordner. Erst nach vollständiger Prüfung erscheint die Workspace-Navigation. Abbruch und ungültige Projekte bleiben sicher auf der Auswahl. Das letzte Projekt wird nach Neustart nicht automatisch geöffnet.

**Projekt schließen** in der Projektverwaltung warnt vor ungespeicherten Studio-/Expressions-/Stilentwürfen. Nach Bestätigung verschwindet der Workspace; die Auswahl ist sofort wieder verfügbar, ohne erneute zehn Sekunden. Gespeicherte Projekte und Bilder bleiben unverändert. Während einer Generierung beziehungsweise offenen Bildübernahme ist die Projektverwaltung gesperrt; zuerst Auftrag beenden/abbrechen beziehungsweise Import abschließen/verwerfen. Ein abgebrochener Wechsel aus einem gültigen Workspace erhält dessen ungespeicherte Entwürfe.

## Sprache und Navigation

Im Startfenster oder unten in der Seitenleiste **Sprache / Language** wählen. Deutsch und Englisch wechseln sofort, bleiben nach Neustart erhalten und verändern weder Projekt-/Figurennamen noch Anweisungen. Reihenfolge: Figuren → Studio → Ausdrücke → Bibliothek → Animation → Stilgestaltung (Englisch: Characters → Studio → Expressions → Library → Motion → Art Direction). Historische englische Prompttexte bleiben bewusst unverändert.

## 1. Projekt erstellen

Über **Projekt erstellen …** einen leeren Ordner außerhalb des Repositorys wählen; alternativ ein vorhandenes Projekt mit `laceframe.json` öffnen. Das gesamte Verzeichnis einschließlich Assets sichern. Projektwechsel warnt vor erkannten ungespeicherten Entwürfen; während einer Generierung erst abbrechen oder Ergebnis abwarten.

Gespeicherte Quellen, Regeln, Versuche, Bilder und Freigaben überleben den Neustart. Unangewendete UI-/Editorentwürfe bleiben nur in der geöffneten Sitzung erhalten, nicht nach App-Neustart. Wechsel zwischen besuchten Bereichen/Figuren und Master-/Expressionmodus erhält die Studio-Entwürfe derselben Sitzung. Ein persistenter Guided-Wiedereinstieg ist geplant.

## 2. Stil festlegen

**Art Direction**: Profil erstellen/auswählen, Rendering, Licht, Farben, Komposition oder strukturierte Regeln bearbeiten. Projektstandard oder individuelle Stilzuordnung wählen; **Eigener Masterstil** verwendet keine Stilbilder. PNG/WebP-Referenzen lokal importieren, entfernen oder wiederverwenden. Jede Übernahme erstellt eine neue Revision; historische Revisionen sind lesbar, ihre Originale bleiben erhalten.

Optional **Stil analysieren ↓**: Referenzen und Typen/ROIs wählen, lokal messen, Vorschläge/Palette korrigieren und ausdrücklich als neue Stilrevision übernehmen. ROI gilt nur für Messung; die Generierung bekommt vollständige Originalreferenzen. Ein Spiele-/Stilname allein analysiert nichts. Bildrechte selbst prüfen.

Style-/Expression-Packs über native JSON-Dialoge austauschen. Importvorschau prüfen und Neu/Aktualisieren/Überspringen explizit entscheiden. Persönliche Identität/Outfits/Ausdrucksregeln nicht als globalen Stil teilen. Der Text-Migrationsassistent archiviert Originalregeln und erstellt eine neue geprüfte Revision; Vorschläge sind nicht unfehlbar.

## 3. Charakter erstellen

**Characters** zeigt den freigegebenen Master automatisch eingepasst; Zoomregler, 1:1/200/400, Mausrad am Mauszeiger und Alt-/Leertaste-Ziehen verändern nur die Ansicht. Identitätsquellen, Figurenaktionen und Masterversionsauswahl stehen daneben beziehungsweise darunter.

**Figuren → Neue Figur** beziehungsweise das bestehende Formular bei noch leerem Studio: Figur benennen. Für eine ausgewählte Figur **Studio → Zum Master wechseln** verwenden; die Hauptaktion heißt **Master generieren**. Danach ein bis drei Identitätsbilder (PNG/JPEG/WebP) per Mehrfachauswahl oder Drop importieren, Stil, Outfitbeschreibung und Komposition festlegen. Anzahl, Referenzrollen und Zielmaße prüfen. Zu große Gruppen, Duplikate und defekte Dateien werden vollständig abgelehnt. Einzelne Quellen lassen sich entfernen/ersetzen; historische Abhängigkeiten bleiben archiviert.

Der native Bilddialog merkt sich den letzten gewählten Ordner über Neustarts; Abbruch behält ihn, ein fehlender Ordner verwendet den OS-Standard. Drop verändert diese native Ordnerwahl nicht. Import/Änderung von Einstellungen erzeugt kein Bild.

Optional den offiziellen Codex CLI separat installieren und dort mit ChatGPT anmelden (`codex login`); `codex` muss im App-PATH stehen. **Neutralen Masterkandidaten generieren** ist eine bewusste, kontingentrelevante Aktion. Ohne verfügbaren Provider bleibt der Import eines vorhandenen geprüften transparenten Masters über Characters nutzbar. Text-only-Neuerstellung ist nicht implementiert.

## 4. Master prüfen und freigeben

Identität, Stil, Outfit, Silhouette, tatsächliche Auflösung und Transparenz prüfen. Identitätsvergleich passt unterschiedliche Bilder unabhängig ein; der erweiterte Pixelvergleich zeigt denselben Pixelursprung mit Slider/Overlay. Auto-Fit/Zoom verändert nur die Ansicht, keine Datei und keine Identität.

Neue Masteraktivierung benötigt echte transparente, nichtleere Bilddaten sowie Identitäts-/Silhouetten-/Aktivierungsbestätigung, ausdrückliche Rasterprüfung bei 1:1 und Vergrößerung und eine Prüfnotiz. Ein opakes oder verdächtiges generiertes Bild erst freistellen, die separate Ableitung prüfen und freigeben; alternativ ablehnen oder ausdrücklich neu generieren. Ein gestagtes opakes lokales Importbild wird nicht still in einen KI-Versuch umgewandelt.

**Master neu aufbauen** verwendet dieselbe Figur und vorhandene Identitäts-/Stil-/Outfitinformationen. Öffnen erzeugt keinen Auftrag. V1 bleibt aktiv, bis eine neue Version ausdrücklich freigegeben wird; bestehende Expressions/Masken behalten V1 als Herkunft. Historische Master können verglichen/exportiert, aber nicht destruktiv gelöscht werden.

## 5. Expressions auswählen

**Expressions** verwaltet globale Familien/Varianten, Intensität, Anweisungen und vorgeschlagene Sprechaktion. Eigene Varianten sind möglich. Persönliche Performance gilt nur für die gewählte Figur/Variante; ohne Override greift die globale Vorlage. **Expression bearbeiten** übergibt den aktuellen Kontext an Studio.

**Studio → Zu Expressions wechseln** zeigt den Master bereits in Auswählen und Erzeugen mit Figurenname/Version. Figur, freigegebenen Master, Familie/Variante und unabhängige Aktion wählen. Wut kann still oder schreiend sein; „Anbrüllen“ ersetzt nicht die gesamte Emotionsfamilie. Aktiven Stil und wirksame Regeln prüfen.

## 6. Erzeugen oder importieren

- **Codex Native:** Verfügbarkeit prüfen, Referenzen/Anweisung ansehen und bewusst generieren. Genau ein Auftrag; tatsächliche Phase und Timer, erreichbarer Abbruch, ehrliche Fehler. Erfolg erstellt einen ungeprüften Entwurf. Keine automatische Wiederholung oder Fortsetzung nach Neustart, keine garantierte Zielauflösung oder Identitäts-/Stiltreue.
- **Manueller Fallback:** Prompt kopieren und optional ChatGPT im Browser öffnen; Master dort selbst anhängen. Echtes PNG/WebP-Ergebnis per Dialog/Drop importieren. Die externe Arbeit ist kein In-App-Generierungserfolg. Originale Auflösung erhalten; keine automatische Skalierung.
- **Prompt Builder:** Automatisch, Ergänzen oder Expert Override. Kontextkonflikte ausdrücklich lösen. Historie ansehen ersetzt nicht den Arbeitsentwurf; Übernahme aus Historie bleibt explizit.
- **Später geplant:** deterministischer Offline-Expression-Katalog, manuelles Face Rig und Transfer. Der manuelle Import ist kein implementierter Offline-Transfer.

## 7. Manuell bearbeiten

Mausradzoom erst nach Klick in die jeweilige Bildfläche; ohne Fokus scrollt die Anwendung. Der Akzentrahmen kennzeichnet die aktive Fläche. Klick außerhalb deaktiviert sie. Zoomschaltflächen arbeiten jederzeit.


**Studio → Bearbeiten** bietet einen großen Vergleich mit direkt sichtbaren Qualitätswerkzeugen daneben; in der Library bleiben sie über **Assetqualität** erreichbar. Farbkorrektur, Farbauswahl, Masken/Freistellung und Relighting verwenden die gemeinsame fensterfüllende Editorfläche. Unterwerkzeuge ersetzen die sichtbare Fläche; der übergeordnete Entwurf bleibt erhalten und wird danach wieder bedienbar. Eigenschaften stehen seitlich, Übernehmen/Verwerfen bleiben erreichbar. Nicht jedes Werkzeug gilt für jede Quelle.

| Aufgabe | Aktueller Weg / Bedeutung |
| --- | --- |
| Vorher/Nachher | Master-/Kandidatenvergleich, Slider per Maus/Touch/Pfeiltasten/Shift/Home/End, gemeinsamer Zoom/Pan, Overlay-Deckkraft; unterschiedliche Maße bleiben sichtbar. |
| Originalpixel erhalten | **Originalpixel erhalten**: erlaubte Expressionsmaske bearbeiten/speichern, tatsächliches Rohresultat importieren, gleiche Maße und Registrierung manuell bestätigen, separates geschütztes Ergebnis erstellen und prüfen. Weiß erlaubt Änderung, Schwarz erhält den Master. Soft Lock ist nicht verfügbar. |
| Hintergrund entfernen | **Hintergrund freistellen**: Original/Ergebnis/Alpha prüfen; Pipette/Toleranz, Schutz-/Entfernen-Pinsel, Polygon und Feinkorrektur nutzen. Weiß erhält Vordergrund, Schwarz entfernt Alpha. Speichern erstellt eine separate Ableitung, noch keine Freigabe. |
| Pixelraster bereinigen | **Pixel Snap öffnen**: Zielbreite/-höhe (Breitenpresets 64/128/256/512, optional Seitenverhältnis) und unabhängig Originalfarben/16/32/64/eigene Anzahl wählen. **Automatisch / Vorschläge** → **Rastervorschläge ermitteln** bietet unsichere Heuristik und benachbarte Maße, keine gesicherte virtuelle Originalauflösung. **Pixel bereinigen** berechnet echte Zielpixel im Worker. Original/Ergebnis haben synchrones Framing, Zoom/Pan und Einpassen/1:1/Pixelzoom; 1:1 entspricht Ergebnis-Pixeln. Standard harte Alpha-Kanten, alternativ ausgewähltes Alpha bewahren. Expertenansicht bietet dominante Zellenfarbe/Zellzentrum, X/Y-Samplingversatz, eigene Hex-Palette und optionale Schutzmasken. Nichtleere Schutzmasken sperren die Geometrieänderung ausdrücklich. Keine Interpolation, kein Dithering. Tatsächliche Maße, X/Y-Faktor, RGB-Farbanzahl und Details prüfen; bei kleiner Auflösung können Augen, Konturen und Accessoires verloren gehen. Parameteränderung entwertet die Vorschau. Abbrechen/Verwerfen schreibt keine Zwischenbilder. **Ergebnis übernehmen** erzeugt nach Main-Nachrechnung einen separaten ungeprüften PNG-Kandidaten. Manuelle Freigabe bleibt erforderlich. |
| Farben gezielt ändern | Direkt anschließend **Color Correction öffnen**. **Auswahl nach Farbe** nutzt vorhandene Pipette, Toleranz, mehrere additive/subtraktive Seeds, zusammenhängend/global und Pinselkorrektur; eigene Schutzregionen auswählen. Quell-/Zielfarbe und Stärke wählen, Vorschau berechnen. L*-Abstufungen, zusätzliche Schatten, Alpha und nicht ausgewählte Pixel bleiben erhalten; Clipping manuell prüfen. Für Expressions sind gespeicherte Masterpaletten als Zielfarbreferenz auswählbar. Übernehmen erzeugt einen separaten Farbkandidaten, keine automatische Freigabe. |
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

**Expertenansicht** zeigt flache Abschnitte ohne Prompt-/Herkunftsaccordions: vollständige Generierungsanweisung im Schritt Erzeugen sowie technische Herkunft, Maskenrevisionen, SHA-256 und historischen Verlauf ein. Die Farb-/Qualitätswerkzeuge behalten ihre Messwerte und Diagnosen. Ein Kontextkonflikt des eigenen Prompts bleibt auch in Standard sichtbar und muss explizit gelöst werden. Das Umschalten erzeugt keine zweite Projektkopie und verwirft keine Eingaben.

Projektwechsel und Verwerfen geänderter Bildentwürfe verlangen Bestätigung. Kein automatisches Speichern unfertiger Editorentwürfe über einen Neustart; gespeicherte Assets/Rezepte bleiben wiederherstellbar. Ein unabhängiger Pixel-Finishing-Workspace und verbesserte Auswahl sind UX-07, nicht Teil dieses Ablaufs.

Motion/Animation, Spritesheets, Game-Engine-Export und optionale lokale Mimik-/Modellanalyse bleiben getrennte spätere Phasen; siehe [ROADMAP](ROADMAP.md).

Empfohlene Pixelart-Reihenfolge: Generieren/Importieren → Freistellen → Motiv prüfen → optional Pixel Snap → Vorschau prüfen/übernehmen → Color Correction → ausdrücklich als Master oder Expression freigeben. Vorherige Qualitätsversionen bleiben im Versionswähler wiederherstellbar; ein neuer Bearbeitungsschritt verlangt keine vorgezogene Masteraktivierung. Pixel Snap garantiert keine Identität oder semantisch richtige Details. Die sichtbare Alpha-Einstellung entscheidet zwischen harter Schwelle und Erhalt der ausgewählten Alpha-Werte; keine Vermischung mit schwarzem/weißem Hintergrund.

Abgelehnte unreferenzierte Kandidaten werden aus der verwalteten Bildablage entfernt, ihre Historie bleibt sichtbar. Historisch benötigte Ableitungen bleiben erhalten; ungeprüfte Kandidaten überleben zur Wiederaufnahme den Neustart. Freigegebene Master/Expressions und Originalreferenzen werden niemals automatisch gelöscht. Ein erneut gewünschtes Bild benötigt einen neuen Versuch. Unangewendete Pixel-Snap-Vorschau verwerfen schreibt keine Datei.

## Eigenen Stil aus Bildern erstellen

Unter **Stilgestaltung → Stil erstellen** zuerst bis zu sechs Referenzbilder hinzufügen oder fallenlassen. Einzelne Referenzen können entfernt/ersetzt, Rollen und Herkunftsnotizen optional ergänzt werden. Beim Dateidialog wird der vorhandene dienstübergreifende letzte Ordner verwendet. Noch kein Name oder Fachbegriff ist erforderlich; es wird noch nichts im Projekt gespeichert.

**Lokal analysieren** misst die Bilder offline und schlägt Namen, Beschreibung, Rendering-Regeln und eine bearbeitbare Arbeits-Palette vor. Ausführliche Regeln lassen sich öffnen, verändern oder leeren; die großen Referenzen und Farbgruppen bleiben zur Prüfung sichtbar. Die Messungen sind Indikatoren. Stimmung/Genre werden ohne semantisches Ergebnis nicht erfunden. Bei mehr als 4 MP für eine Referenz eine geeignete separate Arbeitsreferenz wählen; Laceframe skaliert Originale nicht heimlich herunter.

Optional **Codex-Bildanalyse prüfen**, danach bewusst **Mit Codex analysieren**: Erst der zweite Klick überträgt Referenzbilder über den installierten offiziellen Codex-App-Server und verbraucht Codex-Kontingent. Es wird kein Bild generiert. Account und Vision-/Schemafähigkeit werden bei jedem Auftrag erneut geprüft. Ergebnisvorschläge erst durch eine lokale Analyse beziehungsweise **Vorschläge neu aufbauen** ausdrücklich in den überprüfbaren Entwurf übernehmen. Abbruch verwirft verspätete Ergebnisse. Alternativ lässt sich ein passendes semantisches JSON anhand des angezeigten Vertrags und der exakten Hashreihenfolge einfügen; seine Herkunft bleibt manuell.

Nach der Inhaltsprüfung **Als neuen Stil speichern**. Dies setzt keinen neuen Projektstandard. Bibliothekskarten zeigen Name, Beschreibung, Referenzvorschau und Revision. **Im Character Creator verwenden** wählt den Stil ausdrücklich für einen neuen Masterentwurf; ein vorhandener Master wird dadurch nicht verändert. Unter Stildetails bleiben Zuordnungen, JSON-Pack-Import/-Export, historische Revisionen und die bisherige erweiterte Bearbeitung verfügbar. Im Character Creator erscheinen Beschreibung und Stilreferenzen zur gewählten aktuellen Revision. Gespeicherte Versuche behalten ihre ursprüngliche Revision.

## Studio-Aktionen und Master-Rebuild

Die primäre Headeraktion **Master generieren** beziehungsweise **Expression generieren** übergibt den Auftrag an den aktuellen Creator. Sie wechselt keinen Modus. Die separate sekundäre Aktion wechselt ausschließlich zwischen Master und Expressions und erhält die charakterbezogenen Entwürfe, einschließlich ergänzter und bearbeiteter Expertenanweisungen. Vorbereitete Eingaben werden bereits aus **Auswählen** verwendet; ein vorheriger Besuch von **Erzeugen** ist nicht erforderlich.

Fehlende Voraussetzungen werden beim Klick angezeigt, ohne einen Auftrag zu senden; verlinkte Hinweise öffnen den passenden Schritt und fokussieren die Eingabe. Während eines Auftrags bleiben Status, tatsächliche Phase, Laufzeit und Abbruch außerhalb der gesperrten Arbeitsfläche sichtbar. Der Kandidat erscheint nach erfolgreicher Aufnahme in Erzeugen; **Bearbeiten** öffnet Vergleich und bestehende Werkzeuge, **Freigeben** behält die manuelle Masterprüfung. Keine automatische Freigabe.

Bei bereits freigegebenem Master bleibt die direkte neue Erstellung gesperrt. **Neue Masterversion vorbereiten …** verlangt eine ausdrückliche Bestätigung und bindet den Rebuild an ID/Hash des aktuellen Masters. Es startet dadurch noch keine Generierung. Bei bearbeitetem Expertenprompt muss der neue Rebuild-Kontext gegebenenfalls zusätzlich über die bestehende Vorlagenkonflikt-Prüfung übernommen werden. Historische Master bleiben unverändert.
