# Laceframe — Codex Implementation Roadmap (LF-02 bis LF-07)

> **Status:** Planungsdokument / ausführbare Arbeitsgrundlage für lokalen Codex in VS Code\
> **Basis:** GitHub-Hauptstand nach den bereits gemergten PRs bis einschließlich LF-01 / PR #23 (Stand 17.11.2026).\
> **Nicht enthalten:** LF-01 „Master Rebuild & Transparency Gate“ ist **gemergt (PR #23)** und wird durch dieses Dokument **nicht** erneut beauftragt.\
> **Prinzip:** Eine Datei, mehrere aufeinanderfolgende Umsetzungsetappen, **ein eigener PR pro Etappe**. Kein Codex-Megapatch.

## 0. Arbeitsauftrag an Codex — diese MD als führendes Dokument verwenden

Lies **dieses Dokument vollständig**, bevor du eine Implementierung beginnst. Prüfe `AGENTS.md`, aktuelle Dokumentation, `git status`, aktuelle Branches/PRs und `origin/main`. Verlasse dich nicht blind auf hier beschriebene Dateinamen oder einen veralteten Code-Stand. Implementiere **ausschließlich die erste noch offene, freigegebene LF-Phase**, nicht alle Phasen in einem Durchlauf. Nach abgeschlossenem PR und Merge durch den Benutzer ist die nächste Phase dran.

### Verbindliche Git-/Sicherheitsregeln

- Verwende das vorhandene lokale Repository `thomcgn/laceframe`; **keine Worktrees** und keine zweite Arbeitskopie.
- **Keine Commits direkt auf `main`**; je LF-Phase eigener Feature-Branch und PR. PR-Merge übernimmt der Benutzer.
- Vorhandene lokale Änderungen und **insbesondere die möglicherweise gestagte `.vscode/settings.json`** unverändert lassen; nichts hart zurücksetzen, löschen oder automatisch stashen.
- Wenn LF-01 oder ein anderer Branch/PR noch aktiv ist und Dateien kollidieren würden: **nicht** eigenmächtig rebasen, mergen oder überschreiben; Phase als blockiert melden.
- Keine privaten Ada-Voss-/Tom-Bilder, Benutzerprojekte, Selfies oder geschützten Spielgrafiken in Tests, Fixtures, Screenshots oder Commits aufnehmen. Nutze synthetische Fixtures.
- **Keine echten Bildgenerierungen, keine kostenpflichtigen Requests, kein LoRA-Training/Download ohne ausdrückliche Freigabe.** Native Provider in Tests nur mit eindeutig bezeichneten Fake-Protokoll-Fixtures.
- Keine erfundenen Resultate/Benchmarks; tatsächliche Checks und Einschränkungen dokumentieren.
- Bestehende immutable Master, Expressions, Style-Revisionen, Kandidaten, Prompthistorien, Content-Hashes und Asset-Herkunft bewahren. Backups/Migrationen vor schreibenden Schema-Änderungen.

### Globale Definition of Done für **jede** Phase

1. Funktionierender Nutzerworkflow in der echten Electron-Oberfläche, nicht nur Unit-Tests.
2. Nutzerverständliche Fehlermeldungen, Ladezustände, Undo/Abbruch, keine toten Bedienelemente.
3. Sichere Main-/IPC-Validierung bei persistierten oder dateiverändernden Aktionen.
4. Synthetische Unit-, Integrations- und Desktop-Tests; mindestens Layout 960×720 und 1440×900, für bildlastige Dialoge zusätzlich maximiert 1920×1080.
5. Tatsächlich ausführen und Ergebnis im PR nennen: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:desktop`, `npm run test:desktop:native`, `git diff --check` (sofern im aktuellen Repo vorhanden).
6. PR mit Scope, Datenmodell-/Migrationsauswirkungen, Screenshots, automatisierten Testbelegen, manuellen Abnahmeschritten und offenen Grenzen.
7. Einträge in der Fortschrittstabelle dieses Dokuments **nur in demselben Phasen-PR** aktualisieren; nicht bloß „done“ behaupten. Keine nächste Phase beginnen, bevor vorherige gemergt und vom Benutzer zur Fortsetzung freigegeben ist.

### Fortschrittsübersicht

| Phase | Thema | Status | Voraussetzung | Ergebnis |
|---|---|---|---|---|
| LF-02 | Portable Style & Expression Packs | 🟨 implementiert · PR zur Abnahme | LF-01 / PR #23 gemergt | JSON-Packs, Importvorschau, Linter, geprüfte Freitext-Migration; [Prüfbericht](LF_02_PORTABLE_PACKS.md) |
| LF-03A | Expression Color Consistency & Palette Lock (separat freigegebener Zusatzauftrag) | 🟨 implementiert · PR zur Abnahme | LF-02 / PR #28 gemergt | Regionale Masterpaletten, Farbmessung, separate Korrekturkandidaten; [Prüfbericht](LF_03A_COLOR_CONSISTENCY.md) |
| LF-03 | Guided Mode & durchgängige Studio UX | ⬜ offen | LF-02 | Einsteigerworkflow ohne Promptwissen |
| LF-04 | Outfits & Appearance/Condition States | ⬜ offen | LF-03 | Versionierte Erscheinungszustände |
| LF-05 | Motion & Ambient Behavior | ⬜ offen | LF-04 | Freigabefähige Timeline-/Frame-Animationen |
| LF-06 | Game Asset Export & Integrationsprofile | ⬜ offen | LF-05 | PNG-Sprite-Sheets, Metadaten, Presets |
| LF-07 | Offline Provider & Style-Training-Vorbereitung | ⬜ offen | LF-02–LF-06 | Optionaler lokaler Adapter, Dataset-Sicherheit |

---

## LF-02 — Portable Style & Expression Packs (P0)

### Nutzerziel

Ein Projekt soll **Stilregeln und Emotionsdefinitionen als JSON exportieren und in andere Projekte importieren können**, ohne Charakteridentität, Kleidung, Prompt-Historie oder lokale Dateipfade zu verschleppen. Der bisherige Ada-Voss-Stil soll verlustfrei gesichert und kontrolliert in strukturierte Regeln überführt werden.

### Konkrete Implementierung

1. **Versionierte Austauschformate** definieren (`laceframe.style`, `laceframe.expressions`, `schemaVersion: 1`) und strikt mit Zod validieren. Eigene Typen und Schema-Tests, dokumentierte Versionsstrategie.
2. **Style Pack**: Name, Gültigkeit/Asset-Kategorie (Portrait, Sprite, Scene), positive/negative Rendering Rules, Stil-Intent, Konturen, Pixelcluster, scheinbare Pixeldichte **ohne erfundene Zahlen**, Schattierung, Material-Rendering, Farb- und Lichtbehandlung, Komposition, optionale gemessene Style-Analyzer-Befunde, Referenz-Hashes und Provenienz. Freie Zusatzregeln als gekennzeichnete Felder, kein stiller Informationsverlust.
3. **Expression Pack**: Familien und Varianten mit stabilen Slugs, Anweisungen, Intensität und Vocal Action; globale Vorlagen bleiben getrennt von charakterindividuellen Expression Performances. Personenbezogene Overrides **nicht** im generischen Pack exportieren; ein späteres separates Character-Package wäre eigenes Thema.
4. **Import-/Export-Aktionen** direkt in **Art Direction** und **Expressions**. Vor dem Import Vorschau: neu, identisch, geändert, Konflikt, übersprungen. Kein automatisches Überschreiben. Neue projektinterne UUIDs sauber zuordnen; stabile Pack-IDs/Slugs zur Konflikterkennung, ohne Namen allein als eindeutigen Schlüssel vorauszusetzen.
5. **Style-Linter**: potenziell identitäts-, outfit-, emotions- und szenenbezogene Anweisungen im globalen Style markieren; **nur Vorschläge**, keine blind automatisch verschobenen Regeln. Unterschied „render leather as grouped highlights“ vs. „keep black leather jacket“ erkennen/kennzeichnen. Unsicherheit anzeigen; nicht behaupten, semantisch unfehlbar zu klassifizieren.
6. **Ada-Voss-Migrationsassistent**: ursprüngliche freie Regeltexte **bytegetreu** sichern, Original-Art-Direction-Revision und deren Promptbezüge unangetastet lassen. Vorschläge auf Kategorien `style`, `identity`, `outfit`, `expression`, `composition`, `unclear` verteilen. Nutzerauswahl prüfen, neue Style-Revision erstellen, **nicht** alte Revision überschreiben. Die frühere Black-Leather-Jacket-/Selfie-/Neutral-Expression-Anweisung darf nicht mehr automatisch im allgemeinen Stil landen.
7. **Promptkomposition schichten**: technische System-Constraints (nicht importierbar/abschaltbar), Style, Character Identity, Outfit, Expression Performance, Composition, Creative Supplements. Explicit Expert Override darf technische Freigabe-/Transparenz-/Provenienzregeln nicht umgehen. In UI verständlich zeigen, welche Quelle welche Regel liefert.
8. **Sicherer Dateiimport**: Größengrenzen, JSON-Tiefe/Längen, unknown-field/Schema-Versionsfehler, keine Pfad-Traversal, keine ausführbaren Felder, keine fremden IDs als lokale Pfadbefehle. Beim JSON-Export **keine** eingebetteten Bilddaten oder absoluten lokalen Pfade. Falls Referenzbilder künftig gebündelt werden sollen: gesondertes optionales ZIP-Format mit Rechten/Provenienz, **nicht** stillschweigend in diesem MVP.

### Testfälle / Abnahme

- Style JSON Roundtrip ohne Verlust; Expressions JSON Roundtrip mit mehreren Familien/Varianten.
- Alter Stil mit vermischten Outfitregeln bleibt unverändert historisch lesbar; neue saubere Ada-Voss-Revision ohne Outfit-/Selfie-Übernahme.
- Import bei Konflikt/ungültigem JSON/anderer Schemaversion sicher abgebrochen; bestehender Projektstand unverändert.
- Zwei Figuren mit derselben Art Direction, aber verschiedenen Identitäten/Outfits generieren getrennte korrekte Promptschichten (ohne Live-Provider).
- Style Analyzer von PR #16 bleibt nutzbar; historische Prompts und referenzierte Hashes bleiben auflösbar.
- Nutzer kann eine Expression-Familie in einem zweiten synthetischen Projekt importieren und unmittelbar in Studio auswählen.

**Nicht Teil:** echte Style-LoRA, neues generatives Modell, automatischer garantiert korrekter Stiltransfer, rückwirkendes Umprompten historischer Versuche.

---

## LF-03 — Guided Mode & durchgängige Studio UX (P0)

### Nutzerziel

Ein Gamer ohne Grafik-/Softwareentwicklungswissen soll **vom leeren Projekt bis zu einem freigegebenen Charakterportrait und mehreren Expressions** gelangen können, ohne JSON zu bearbeiten, intern verwendete Begriffe zu kennen oder den Prompt Builder verstehen zu müssen.

### Konkrete Implementierung

1. **Guided Mode / Advanced Mode** als zwei Präsentationsebenen derselben Daten und derselben Engine, **keine** separaten Datenmodelle. Advanced erhält alle bestehenden Werkzeuge.
2. **Projektstart-Assistent**: „Spielstil wählen/importieren“ → „Figur beschreiben/Referenzen“ → „Master erstellen“ → „Transparenz/Identität prüfen“ → „Expressions erzeugen“ → „Exportieren“. Wiedereinstieg nach App-Neustart mit sichtbarem Bearbeitungsstatus.
3. **Master-Rebuild aus LF-01** als gut erreichbare Aktion derselben Figur integrieren; nicht zweites Charakterprofil nötig. Den tatsächlichen LF-01-Code nach Merge übernehmen.
4. **Klares Statusmodell** pro Figur: Entwurf / Generierung läuft / Kandidat prüfen / Hintergrund korrigieren / Master freigegeben / Expressions unvollständig / exportbereit. Unterschied zwischen *generiert*, *freigestellt*, *geprüft*, *freigegeben* sichtbar. Keine falsche „bereit“-Anzeige bei fehlendem Canvas.
5. **Einsteigerbegriffe**: „Figur“, „Spielstil“, „Ausdruck“, „Bild prüfen“, „Hintergrund entfernen“; technische Begriffe wie SHA, Revision, IPC, Retention nur in Advanced/Details. Kontext-Hilfe statt Tooltip-Flut oder verschachtelten Accordions.
6. **Expression-Erstellung**: einfache Auswahl von Familien/Varianten aus LF-02; optional „weitere Emotionen hinzufügen“. Global vs. charakterindividuell klar erklären. Das bestehende Expressions Workspace aus PR #20 weiterverwenden.
7. **Prompt Builder**: im Guided Mode automatische, erklärbare Zusammenfassung („Welche Regeln wirken?“) mit wenigen Ergänzungsfeldern; Expert Override nur im Advanced Mode. Keine Verschleierung der Tatsache, dass KI-Ergebnisse abweichen können.
8. **Benutzbarkeit und Zugänglichkeit**: konsistente Zurück-/Abbrechen-/Fortsetzen-Navigation, Undo wo sinnvoll, sichtbare Hauptaktionen, Tastaturbedienung, ausreichende Kontraste, statusbasierte Fehlerkorrektur. Keine reine Farbkodierung (auch bei Farbsehschwächen).
9. **Persistente Entwürfe**: wichtige Einstellungen und Zwischenstände sollen Neustarts überleben, ohne historische Versionen oder laufende Jobs zu beschädigen; hierfür minimale, versionskompatible Speicherung.
10. **Einsteiger-Abnahme**: dokumentierter, wiederholbarer Usability-Test mit mindestens drei realen Testpersonen *wenn tatsächlich verfügbar*. Wenn nicht verfügbar: **nicht** behaupten, getestet zu haben; stattdessen einen unmoderierten Testleitfaden und messbare Aufgaben erstellen (Fertigstellung, Fehler, Klickwege, Verständnisfragen).

### Testfälle / Abnahme

- Neues synthetisches Projekt bis zu einem prüfbaren Master-Kandidaten und drei Expressions ohne Öffnen des technischen Prompts.
- Unterbrochener Workflow nach Neustart reproduzierbar fortsetzbar.
- Wechsel Guided ↔ Advanced ohne Datenverlust, Änderung gespeicherter Regeln oder Umgehung von Guards.
- Fehlerfälle: kein Identity-Bild, fehlende Stilreferenz, nicht transparenter Kandidat, abgebrochener Provider, ungeprüfte Expression.
- Keine unnötigen Sprünge zwischen Characters, Expressions, Studio und Library; bereits existierende UX-03-Funktionen bleiben erhalten.

**Nicht Teil:** automatische Spielentwicklung, eigene Game Engine, neue ImageGen-Provider, Motion.

---

## LF-04 — Outfit Variants, Appearance & Condition States (P1)

### Nutzerziel

Ein einmal freigegebener Charakter kann **mehrere Outfits und veränderliche sichtbare Zustände** erhalten, ohne dass eine neue unabhängige Identität angelegt wird und ohne dass Outfitmerkmale globale Style Rules verschmutzen.

### Konkrete Implementierung

1. Bestehende `outfits`-Daten in ein **versioniertes Outfit-Profil** mit Name, Beschreibung, Referenz-/Assetbezug, Revision, Charakterbindung und Freigabe erweitern; Migration alter Outfit-Notizen sicher und verlustfrei.
2. **Appearance State** als separate Dimension: Kleidungsvariante, Haare `neat / loose / messy`, sichtbare Müdigkeit, kleine Accessoire-/Erscheinungsdetails; optionale State-Kombinationen mit eindeutigen IDs, kein Freitext-Monolith.
3. **Condition State** getrennt abbilden, z. B. `sober / intoxicated / drunk / hungover / emotionally-strained`; Eigenschaften sind zunächst **narrative/visuelle Metadaten**, keine medizinische Echtzeitdiagnose und keine ungefragte sichtbare Mutation.
4. **Behavior State** vorerst nur vorbereiten (z. B. `idle`, `smoking`, `drinking`, `bag`, `fix-hair`); tatsächliche Animation kommt in LF-05.
5. **Outfit-Variant-Generation** als Derived Candidate aus einem geprüften aktuellen Master unter klarer Identity-Lock- und Style-Lock-Anweisung. Original- und historische Assets unverändert, keine automatische Freigabe; tatsächliche Providerfähigkeit prüfen, keine versprochene Pixelidentität.
6. **Outfit-spezifische Asset-/Maskenherkunft**, Vergleich gegen Referenzmaster und manuelle Prüfung. Historische Expressions/Outfits bleiben zu ihrer tatsächlichen Masterversion zugeordnet.
7. **UI** in Characters/Studio: Outfit auswählen, States kombinieren, Resultat ansehen, freigeben oder verwerfen. Strikte Trennung „globaler Spielstil“ / „wer ist die Figur“ / „was trägt sie“ / „wie geht es ihr“.
8. **Kombinationsgrenzen** (kein unkontrolliertes Cartesian Product): nur ausdrücklich angeforderte Kandidaten generieren; fehlende Kombinationen sichtbar, keine stillen Fallback-Bilder oder doppelten teuren Jobs.

### Testfälle / Abnahme

- Eine Figur, zwei Outfitvarianten, zwei Haarzustände und mindestens zwei Condition States werden korrekt getrennt gespeichert/angezeigt.
- Wechsel des Outfits verändert weder Style Pack noch Identity Notes.
- Neue Outfits nutzen dieselbe Master-Abstammung; alte Expressions bleiben gültig und unverändert.
- Revision/Review, abgebrochene Generation, Export und Neustart robust.

**Nicht Teil:** 3D-Ankleidesystem, automatische Layer-Zerlegung, Motion, Garantie pixelidentischer generativer Varianten.

---

## LF-05 — Motion & Ambient Behavior (P1)

### Nutzerziel

Aus freigegebenen Charakterassets entstehen **kontrollierbare 2D-Frame-Animationen** und einfache, zustandsabhängige Idle-Verhaltensweisen, ohne Figur/Stil zwischen Frames zu verlieren.

### Konkrete Implementierung

1. **Motion-Asset-Datenmodell**: Clip-ID, Charakter-/Master-/Outfit-/Appearance-/Condition-Bezug, Framefolge, Canvasgröße, Frame-Dauer, Wiederholung, Pivot/Origin, Anchors, transparente RGBA-Frames, Zustandskompatibilität, Revision und Reviewstatus.
2. **Timeline/Frame Editor**: Frames importieren, duplizieren, anordnen, löschen (nur im Draft), Dauer setzen, Loop-Vorschau, Start/Stop, Onion-Skin optional, transparente Hintergrundprüfung, Undo/Redo. Bildpixel an reproduzierbaren Anchors ausrichten; keine stillschweigende Reskalierung.
3. **Animator-Preview**: reproduzierbare Wiedergabe auf tatsächlicher Spielfigur/gewähltem Asset; Pixelart nearest-neighbor, feste Canvas-Koordinaten; CPU- und Speichergrenzen dokumentieren.
4. **Behavior Rules** separat von Animation speichern: Idle, Blinzeln, Haare richten, Tasche durchsuchen, optional Rauchen/Trinken/Flachmann für erzählerische Erwachsenenfiguren. Nach Inaktivität dürfen **situative, unterbrechbare** Idle-Clips starten; Primärinteraktionen erhalten Vorrang.
5. **Fairness-Invariante:** rein automatische Ambient-Trinksequenzen dürfen ohne bestätigte Spielregel **keinen versteckten spielmechanischen Nachteil/Condition-Wechsel** auslösen. Narrativ sichtbare und spielrelevante Zustandswechsel explizit unterscheiden.
6. **Condition/Appearance-Kompatibilität**: Welche Clips passen zu Outfit, Haarzustand und Condition? Inkompatible Kombinationen nicht stillschweigend zeigen.
7. **Frame-Generierung optional über bestehende Provider-Abstraktion**, aber **keine** automatische Live-Generierung in Tests und **keine** Garantie perfekter Kontinuität. Manueller Import und deterministische Editorfunktionen müssen ohne Provider nutzbar bleiben.
8. **Asset-Gates**: Alpha, Dimension, Pivot, Masterherkunft und manuelle Review. Historische Master-/Clipreferenzen bleiben intakt.

### Testfälle / Abnahme

- Vier synthetische Frames als Loop abspielen, stoppen, unterbrechen, Framezeiten und Anker korrekt exportierbar halten.
- Appearance-/Condition-Wechsel blockiert inkompatible Animationen klar.
- Idle-Aktion wird bei Nutzerinteraktion zuverlässig unterbrochen.
- Keine automatische Condition-Veränderung durch rein dekorativen Trink-Idle.
- Alte Portrait-/Expression-Projekte öffnen sich ohne Migrationsergebnisse zu verlieren.

**Nicht Teil:** Skelettanimation, komplexe Physics Engine, prozedurale Character AI, vollständige Game Runtime.

---

## LF-06 — Game Asset Export & Integrationsprofile (P1)

### Nutzerziel

Assets aus Laceframe können ohne manuelle Nacharbeit in ein 2D-Spielprojekt übernommen werden. Export umfasst **tatsächlich freigegebene** Portraits, Expressions, Outfits, Motion-Clips und maschinenlesbare Metadaten.

### Konkrete Implementierung

1. **Exportprofile**: frei definierte Ausgabeauflösung, Zielpixelgröße/Skalierung (Nearest für Pixelart), Alpha- und Farbformat, Dateinamen-Template, Pivot/Anchor-Konvention, Ordnerstruktur.
2. **Sprite Sheet Packing** deterministisch: Grid und optional gepackte Anordnung, definierte Padding-/Bleed-Regeln, max. Größe, sichere Rotationseinstellung standardmäßig aus, feste Frame-Order, exakte Atlas-Koordinaten.
3. **Metadatenformat** versioniert und dokumentiert: `frames`, `animations`, `durationMs`, `loop`, `pivot`, `sourceAssetId`, `masterVersion`, `outfitId`, `expressionVariant`, Zustand, SHA-256, Abmessungen. Keine privaten lokalen Pfade.
4. **Export-Gates**: nur freigegebene, tatsächlich vorhandene, intakte Assets. Warnung bei fehlender Expression/Animation statt erfundener Ersatzframes.
5. **Preview vor Export**: Zielauflösung, Alpha-Vorschau, tatsächliche Sheet-Anordnung, Größen- und Dateiliste. Exportverzeichnis über sichere OS-Auswahl, keine unsicheren Renderer-Dateipfade.
6. **Exportprofile für generische 2D-Engines** plus optional passgenaue Adapter erst nach belegter Dokumentation und Fixture-Tests (z. B. Godot-geeignete Daten). Keine Behauptung, es gebe universelle vollautomatische Integration in alle Engines.
7. **Re-Export** gleicher unveränderlicher Eingaben ergibt byteidentische PNG/Metadaten, sofern Encoder und Parameter identisch. Konflikte mit existierenden Dateien über Preview und ausdrücklich gewählte Überschreibstrategie behandeln.
8. **Dokumentierte kleine Demo-Pipeline** aus synthetischem Charakter: Expressions → Idle-Frames → Sprite Sheet → JSON → Referenz-2D-Projekt oder neutraler Parser-Test.

### Testfälle / Abnahme

- Unterschiedliche Frame-Dauern und Anchors bleiben korrekt.
- Transparenz, Raster, Spritesheet-Koordinaten und JSON-Referenzen stimmen pixelgenau.
- Fehlende, abgelehnte und beschädigte Frames werden blockiert.
- Mehrfacher Export identischer Inputs ist reproduzierbar.
- Kein Export echter privater Fixture-Bilder oder absoluter Projektpfade.

**Nicht Teil:** Game Engine, Level Editor, Szenensystem, Build-/Publishing-Pipeline für fertige Spiele.

---

## LF-07 — Offline Provider & Style-Training Preparation (P2)

### Nutzerziel

Alle Editor- und Exportfunktionen bleiben vollständig ohne Internet nutzbar. Optional kann später ein lokal laufendes generatives Bildmodell angebunden werden, ohne bestehende Codex-Projekte oder Freigaberegeln zu gefährden.

### Konkrete Implementierung

1. **Saubere Provider-Schnittstelle**: bestehender `Codex Native`, `Manual Import`, optional `Local Image Provider` mit Capability Discovery (Mask Editing, Image References, Alpha, max. Bildgröße, Mehrfachreferenzen, Async/Cancellation). Fehlende Capabilities offen anzeigen, nicht emulieren.
2. **Offline-Modus**: keine stillen Netzwerkrequests/Modelldownloads; lokale Tools (Style Analyzer, Cutout, Relighting, Timeline, Export) bleiben verfügbar. Provider-Ausfall blockiert nicht den Editor.
3. **Optionaler lokaler Adapter** für ein vom Nutzer selbst gestartetes, dokumentiertes lokales Backend (z. B. ComfyUI), erst nach Verifikation seiner tatsächlichen API und Sicherheitsgrenzen. Nicht voraussetzen, dass auf einem CPU-only-16-GB-Laptop große Modelle sinnvoll laufen.
4. **Trainingsdaten-Vorbereitung**, kein Training: Export nur ausdrücklich ausgewählter, rechtlich nutzbarer und freigegebener Artwork-Daten; Herkunft, Nutzungsrechte, Stil-/Assettypen, Hashes, Auflösung, Split/Manifest; keine privaten Selfies oder fremden Game-Screenshots ungefragt in Datensätze.
5. **LoRA-Kompatibilitätsplan**: Modellfamilie, Trainings-/Inference-Voraussetzungen, realistisches VRAM/RAM-Budget, manueller Referenzvergleich, bekannte Grenzen. Kein eigenes Foundation Model und kein automatisch gestartetes Cloudtraining.
6. **Privacy/Security**: lokaler Endpoint nur mit ausdrücklicher Nutzerkonfiguration; keine offenen LAN-Bindings oder vertraulichen Token im Renderer; Berechtigungen und Fehlermeldungen im Main abgesichert.
7. **Provider-Austauschbarkeit**: vergangene Generierungen behalten die tatsächliche Provider-/Prompt-/Referenzprovenienz; vorhandene Projekte funktionieren ohne installiertes lokales Modell.

### Testfälle / Abnahme

- Offline-Start ohne aktiven Bildprovider: alle Editorwerkzeuge und Export funktionieren.
- Fake-Lokalprovider meldet Capabilities korrekt; abgebrochene Jobs/Fehler sauber verarbeitet.
- Inkompatible Referenz-/Alpha-Anforderungen blockieren die Generierung mit verständlicher Erklärung.
- Dataset-Export ohne Freigabe oder Nutzungsrecht wird nicht durchgeführt.
- Keine tatsächlichen Modell-Downloads, kein LoRA-Training, keine live bezahlten Requests.

**Nicht Teil:** generatives Modell selbst trainieren, garantierte offline-ImageGen-Qualität wie Codex, GPU-Kauf/Cloudtraining.

---

## Übergreifende Produkt-Ziele und finale End-to-End-Abnahme

**Produktversprechen:** *Create consistent game characters, not just individual images.*

### End-to-End-Szenario (nach LF-06)

Ein nichttechnischer Nutzer soll – ohne direkte JSON-/Prompt-/Codebearbeitung – folgendes erreichen können:

1. Leeres Laceframe-Projekt eröffnen.
2. Einen Spielstil aus eigenen Referenzen oder JSON-Pack übernehmen.
3. Einen eigenen Charakter mit Identity-/Outfit-Trennung anlegen.
4. Ein Portrait erstellen, technische Transparenz prüfen und manuell freigeben.
5. Mindestens fünf verschiedene Expressions aus importierbaren Emotionsfamilien erstellen und prüfen.
6. Ein weiteres Outfit als separate Version anlegen.
7. Eine kurze Idle-Animation als freigegebenen Clip erstellen.
8. Portraits, Expressions und Animationen als transparente PNGs/Sprite Sheet + JSON exportieren.
9. Exportierte Daten in einem neutralen Viewer oder einem dokumentierten 2D-Integrationsbeispiel korrekt abspielen.

Datenintegrität, Master-/Style-/Expression-Zuordnung und Stilreferenz-Provenienz müssen dabei nachvollziehbar bleiben. Generative Identitäts- und Stiltreue ist ein **Qualitätsziel mit menschlicher Freigabe**, keine technisch garantierbare Eigenschaft.

### Stop-/Go-Prinzip

Am Ende jeder Phase:
- Funktion und Grenzen tatsächlich demonstrieren.
- PR mit Testbelegen bereitstellen.
- **Nicht** automatisch die nächste Phase starten.
- Nutzer entscheidet anhand des Ergebnisses, ob Bugs/UX zuerst nachgebessert werden müssen.

## Starter-Prompt für Codex

> Lies `LACEFRAME_CODEX_ROADMAP_LF02-LF07.md` vollständig und behandle sie als Umsetzungsroadmap. Prüfe den realen Git-/PR-Stand und `AGENTS.md`. LF-01 läuft bereits und ist ausgeschlossen. Beginne **nur mit LF-02**, sofern LF-01 gemergt ist und keine kollidierenden Arbeiten offen sind. Implementiere LF-02 gemäß Scope, Sicherheitsregeln, Tests und Definition of Done; erstelle einen eigenen PR. Gehe **nicht** zu LF-03 oder späteren Phasen über, bevor ich den Merge und den nächsten Auftrag ausdrücklich freigebe.
