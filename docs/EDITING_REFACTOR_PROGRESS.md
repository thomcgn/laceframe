# Shared Selection Engine — Fortschrittsdokumentation

Stand: 2026-11-19 13:50 UTC
Branch: `develop` (lokale Commits, kein Push)

## Phase 0 — Analyse und Baseline (abgeschlossen)

### Repository-Zustand
- 19 unversionierte Änderungen (18 modifizierte Dateien + 1 neue Datei)
- Letzter Commit: `1c5ebe1 feat(masks): expose shared tools for expression and cutout mask roles`
- Typecheck: bestanden
- Tests `tests/editing.test.ts` + `tests/editor-selection.test.ts`: 22/22 bestanden
- Performance-Test `tests/editing-performance.test.ts`: bestanden (mit 120 s Timeout, 23,89 s Laufzeit)
- Keine regressionsrelevanten Änderungen an Master- oder Expression-Generierung

### Identifizierte Lücken
1. `SelectionEditor` lädt `initialMask`/`allowedMask`/`references` nur bei `sourceId`-Wechsel (Prop-Reaktivität)
2. Keine Lösch-/Funktion für gespeicherte Auswahlen
3. `selectionReferences` gibt nur die neueste semantische Layer-Revision
4. Zwei divergierende Flood-Fill-Engines (`editing.rangeSelection` vs `color-region.colorSeedMask`)
5. Keine UI-Tests für `SelectionEditor`, `tools.ts` oder Worker-Verdrahtung
6. `semanticRegion` hat keinen Produktionsverbraucher
7. `MaskEditor` nutzt hartcodierte 4-MP-Grenze statt `EDITING_MAX_PIXELS`

## Phase 1 — Shared Selection Core (abgeschlossen)

### Implementiert
- `src/shared/editing.ts`: vollständiger Engine-Kern mit 242 Zeilen
  - `combineSelection`, `constrainSelection`, `polygonSelection`, `boxSelection`, `bezierSelection`
  - `rangeSelection` (Magic Wand / Color Range) mit Worker-Unterstützung
  - `brushSelection`, `pixelPerfect`, `editAnchor`, `translatePath`, `flattenPath`
  - `editingHistory`/`commitEditing`/`undoEditing`/`redoEditing` (20 Schritte, binär gepackt)
  - `savedSelectionInputSchema`/`savedSelectionSchema`/`SavedSelection`
  - `editingAccelerator` für Electron-Menu-Unterdrückung

### Tests
- `tests/editing.test.ts`: 133 Zeilen, 15 Testcases
- `tests/editor-selection.test.ts`: 110 Zeilen, 11 Testcases
- `tests/editing-performance.test.ts`: 18 Zeilen, 1 Testcase

### IPC-Verdrahtung
- `src/main/main.ts`: `editor:shortcuts`, `image:selection-references`, `image:delete-editor-selection`
- `src/preload/preload.ts`: `editingContext`, `selectionReferences`, `deleteEditorSelection`
- `src/shared/bridge.ts`: Bridge-Interface erweitert

## Phase 1.1 — Selection Editor Reaktivität (abgeschlossen)

### Änderungen
- `src/renderer/editing/SelectionEditor.tsx`: Prop-Reaktivität für `initialMask`, `allowedMask`, `references` hinzugefügt
- `src/renderer/editing/SelectionEditor.tsx`: `deleteEditorSelection`-Funktion und UI-Button hinzugefügt
- `src/shared/bridge.ts`: `deleteEditorSelection`-Methode im Bridge-Interface
- `src/preload/preload.ts`: `deleteEditorSelection`-IPC-Handler
- `src/main/main.ts`: `image:delete-editor-selection`-Handler
- `src/main/project-service.ts`: `deleteEditorSelection`-Command-Handler mit Dateibereinigung
- `src/shared/domain.ts`: `deleteEditorSelection`-Schema in `commandSchema`
- `src/shared/locales/en/canvas.json`: `delete`-Schlüssel hinzugefügt
- `src/shared/locales/de/canvas.json`: `delete`-Schlüssel hinzugefügt
- `tests/editor-selection.test.ts`: 2 neue Testcases (Löschen, ungültige Löschung)

### Testergebnisse
- Typecheck: bestanden
- `tests/editor-selection.test.ts`: 11/11 bestanden
- `tests/editing.test.ts`: unverändert 13/13 bestanden

## Phase 1.2 — Engine-Erweiterungen und MaskEditor-Konsistenz (abgeschlossen)

### Änderungen
- `src/shared/editing.ts`: `alphaMask`, `semanticRegionMask`, `layerMaskSelection` hinzugefügt
- `src/renderer/components/MaskEditor.tsx`: Hartcodierte 4-MP-Grenze durch `EDITING_MAX_PIXELS` ersetzt
- `tests/editing.test.ts`: 2 neue Testcases für `alphaMask`/`semanticRegionMask`

### Testergebnisse
- Typecheck: bestanden
- `tests/editing.test.ts`: 15/15 bestanden
- `tests/editor-selection.test.ts`: 11/11 bestanden

## Phase 1.3 — Shared Toolbar und Zoom-Komponenten (abgeschlossen)

### Änderungen
- `src/renderer/components/EditorToolbar.tsx`: Neue wiederverwendbare Komponente
  - `EditorToolbar`: Einheitliche Werkzeugleiste mit Icons, ARIA-Labels, Shortcuts
  - `ZoomControls`: Einheitliche Zoom-Steuerung mit Fit/1:1/200/400%/Slider
- `scripts/professional-canvas-smoke.cjs`: Test für `deleteEditorSelection` hinzugefügt

### Testergebnisse
- Typecheck: bestanden
- `tests/editing.test.ts`: 15/15 bestanden
- `tests/editor-selection.test.ts`: 11/11 bestanden

## Phase 2 — Professional Canvas (in Vorbereitung)

## Phase 3 — Auswahlwerkzeuge (in Vorbereitung)

## Phase 4 — Semantic Layers Integration (in Vorbereitung)

## Phase 5 — Color Correction Integration (in Vorbereitung)

## Phase 6 — Weitere Editoren (in Vorbereitung)

## Phase 7 — UX, Performance, Abschlussprüfung (in Vorbereitung)