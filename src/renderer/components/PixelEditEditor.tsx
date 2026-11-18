import type { PixelReview } from "../../shared/pixel-review";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Snapshot } from "../../shared/domain";
import type { ColorPixels } from "../../shared/color-consistency";
import { extractPalette } from "../../shared/color-consistency";
import {
  type PixelEdit,
  type SpriteFusionSettings,
} from "../../shared/pixel-snap";
import { type RegionSelection } from "../../shared/color-region";
import { EditorWorkspace } from "./EditorWorkspace";
import { PixelViewport } from "./PixelViewport";
import { ColorRegionEditor } from "./ColorRegionEditor";

type Source = ColorPixels & { sha256: string; protectedWeights: Uint8Array };
type Draft = {
  edit: PixelEdit;
  protectedWeights: Uint8Array;
  selection?: RegionSelection;
};
function PixelCanvas({
  pixels,
  label,
}: {
  pixels: ColorPixels;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    ref.current
      ?.getContext("2d")
      ?.putImageData(
        new ImageData(
          new Uint8ClampedArray(pixels.data),
          pixels.width,
          pixels.height,
        ),
        0,
        0,
      );
  }, [pixels]);
  return (
    <canvas
      ref={ref}
      width={pixels.width}
      height={pixels.height}
      aria-label={label}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
export function PixelEditEditor({
  sourceId,
  mode,
  onSaved,
  onClose,
  project,
}: {
  sourceId: string;
  project: Project;
  mode: "snap" | "color";
  onSaved: (s: Snapshot) => void;
  onClose: () => void;
}) {
  let rootId = sourceId;
  const seen = new Set<string>();
  while (!seen.has(rootId)) {
    seen.add(rootId);
    const q = project.qualityAssets.find((q) => q.id === rootId);
    if (!q) break;
    rootId = q.sourceId;
  }
  const masterId = project.assets.find((a) => a.id === rootId)?.masterId;
  const masterPalettes = project.masterPalettes.filter(
    (p) => p.masterId === masterId,
  );
  const [referenceId, setReferenceId] = useState(
    masterPalettes.at(-1)?.id ?? "",
  );
  const reference = masterPalettes.find((p) => p.id === referenceId);
  const [source, setSource] = useState<Source>();
  const [draft, setDraft] = useState<Draft>();
  const [past, setPast] = useState<Draft[]>([]),
    [future, setFuture] = useState<Draft[]>([]);
  const [result, setResult] = useState<{
    result: ColorPixels & { changed?: number; ambiguous?: number };
    sha256: string;
    review: PixelReview;
  }>();
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [region, setRegion] = useState<"selection" | "protect">();
  const [analysis, setAnalysis] = useState<{ grid?: number }>();
  const [difference, setDifference] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const worker = useRef<Worker | undefined>(undefined),
    serial = useRef(0),
    dirty = useRef(false),
    mounted = useRef(true);
  const initial = useRef<Draft | undefined>(undefined);
  const modal = useRef<HTMLElement>(null);
  useEffect(() => {
    modal.current?.focus();
  }, []);
  useEffect(() => {
    mounted.current = true;
    let live = true;
    void window.laceframe
      .pixelEditSource(sourceId)
      .then((r) => {
        if (!live) return;
        if (!r.ok) throw new Error(r.error);
        setSource(r.value);
        const d: Draft = {
          protectedWeights: r.value.protectedWeights,
          edit:
            mode === "snap"
              ? {
                  kind: "spritefusion",
                  settings: { colors: 16 },
                }
              : {
                  kind: "color",
                  rule: {
                    sourceColor: "#806050",
                    targetColor: "#806050",
                    strength: 1,
                    tolerance: 25,
                    correctLightness: false,
                  },
                  weights: new Uint8Array(r.value.width * r.value.height),
                },
        };
        initial.current = d;
        setDraft(d);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
      mounted.current = false;
      worker.current?.terminate();
    };
  }, [sourceId, mode]);
  function startWorker() {
    if (!source) return;
    worker.current?.terminate();
    const w = new Worker(
      new URL("../workers/pixel-edit.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = w;
    w.onmessage = (e) => {
      if (e.data.id !== serial.current) return;
      setBusy(false);
      if (e.data.error) {
        setError(e.data.error);
        return;
      }
      if (e.data.analysis) setAnalysis(e.data.analysis);
      else setResult(e.data);
    };
    w.onerror = () => {
      w.terminate();
      worker.current = undefined;
      setBusy(false);
      setError("Pixel-Worker ausgefallen; nichts gespeichert.");
    };
    w.postMessage({ id: 0, source });
    return w;
  }
  function run(analyze = false) {
    if (!source || !draft) return;
    const w = worker.current ?? startWorker();
    setBusy(true);
    setError("");
    setResult(undefined);
    if (!analyze) dirty.current = true;
    w?.postMessage({
      id: ++serial.current,
      analyze,
      edit: draft.edit,
      protectedWeights: draft.protectedWeights,
    });
  }
  function edit(d: Draft) {
    dirty.current = true;
    serial.current++;
    setBusy(false);
    worker.current?.terminate();
    worker.current = undefined;
    setResult(undefined);
    setPast((p) => [...p, draft!].slice(-8));
    setFuture([]);
    setDraft(d);
  }
  function restore(d: Draft) {
    serial.current++;
    worker.current?.terminate();
    worker.current = undefined;
    setBusy(false);
    setResult(undefined);
    setDraft(d);
    dirty.current = true;
  }
  function close() {
    if (saving) return;
    if (!dirty.current || window.confirm("Pixel-/Farbentwurf verwerfen?"))
      onClose();
  }
  async function save() {
    if (!source || !draft || !result) return;
    setSaving(true);
    setError("");
    try {
      const r = await window.laceframe.command({
        type: "createPixelEdit",
        sourceId,
        sourceSha256: source.sha256,
        edit: draft.edit,
        protectedWeights: new Uint8Array(draft.protectedWeights),
        previewPixelSha256: result.sha256,
      });
      if (!r.ok) throw new Error(r.error);
      if (mounted.current) {
        dirty.current = false;
        onSaved(r.value);
        onClose();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }
  const settings =
    draft?.edit.kind === "spritefusion" ? draft.edit.settings : undefined;
  function updateSnap(settings: SpriteFusionSettings) {
    if (draft) edit({ ...draft, edit: { kind: "spritefusion", settings } });
  }
  const palette = useMemo(() => {
    if (!source) return [];
    try {
      return extractPalette(
        source,
        new Uint8Array(source.width * source.height).fill(255),
      );
    } catch {
      return [];
    }
  }, [source]);
  return (
    <EditorWorkspace
      title={mode === "snap" ? "Pixel Snap" : "Color Correction"}
      className="pixel-edit-workspace"
    >
      <section
        className="pixel-edit-editor"
        ref={modal}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
          if (e.key === "Tab") {
            const nodes = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
              ),
            ].filter((n) => n.getClientRects().length);
            const first = nodes[0],
              last = nodes.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "snap" ? "Pixel Snap" : "Color Correction"}
      >
        <header>
          <h2>{mode === "snap" ? "Pixel Snap" : "Color Correction"}</h2>
          <span>
            {source && `${source.width} × ${source.height} · Originalauflösung`}
          </span>
          <button disabled={saving} onClick={close}>
            Verwerfen
          </button>
        </header>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {source && draft && (
          <>
            <div className="pixel-edit-body">
              <div
                className="pixel-edit-pair"
                aria-label="Vorschau vergleichen"
              >
                {[
                  { pixels: source, label: "Original" },
                  {
                    pixels:
                      difference && result?.review.difference
                        ? result.review.difference
                        : (result?.result ?? source),
                    label: "Pixel-Snap-Vorschau",
                  },
                ].map((v) => (
                  <figure key={v.label}>
                    <figcaption>
                      {v.label === "Pixel-Snap-Vorschau" && mode === "color"
                        ? "Farbvorschau"
                        : v.label}
                    </figcaption>
                    <PixelViewport
                      key={`${v.label}-${v.pixels.width}-${v.pixels.height}`}
                      width={v.pixels.width}
                      height={v.pixels.height}
                    >
                      <PixelCanvas pixels={v.pixels} label={v.label} />
                    </PixelViewport>
                  </figure>
                ))}
              </div>
              <aside>
                {mode === "snap" && settings && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={accepted}
                        onChange={(e) => setAccepted(e.target.checked)}
                      />
                      Motiv und freigestellte Silhouette geprüft
                    </label>
                    <p>
                      Sprite Fusion Original-Engine · automatische
                      Rastererkennung und Quantisierung in Rust/WASM. Keine
                      separate Rasterdiagnose oder Confidence-Ausgabe.
                    </p>
                    <button disabled={busy || saving} onClick={() => run(true)}>
                      Zusätzlichen Rasterhinweis messen
                    </button>
                    {analysis && (
                      <p>
                        Separate Laceframe-Diagnose:{" "}
                        {analysis.grid
                          ? `${analysis.grid} Pixel Rasterhinweis`
                          : "Kein eindeutiger Rasterhinweis"}
                        . Kein Qualitätsnachweis; Sprite Fusion erkennt sein
                        Raster unabhängig während der Transformation.
                      </p>
                    )}
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.pixelSize === undefined}
                        onChange={(e) =>
                          updateSnap({
                            ...settings,
                            pixelSize: e.target.checked ? undefined : 4,
                          })
                        }
                      />
                      Automatische Rastervorgabe
                    </label>
                    {settings.pixelSize !== undefined && (
                      <label>
                        Rastergröße
                        <input
                          type="number"
                          min={1}
                          max={Math.min(source.width, source.height) / 2}
                          step={0.5}
                          value={settings.pixelSize}
                          onChange={(e) =>
                            updateSnap({
                              ...settings,
                              pixelSize: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    )}
                    <label>
                      Farbanzahl
                      <input
                        type="number"
                        min={1}
                        max={256}
                        value={settings.colors}
                        onChange={(e) =>
                          updateSnap({
                            ...settings,
                            colors: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Benutzerdefinierte Palette (Hex, durch Komma getrennt)
                      <input
                        value={settings.palette?.join(", ") ?? ""}
                        placeholder="#0d2b45, #ffecd6"
                        onChange={(e) => {
                          updateSnap({
                            ...settings,
                            palette: e.target.value.trim()
                              ? e.target.value.split(",").map((c) => c.trim())
                              : undefined,
                          });
                        }}
                      />
                    </label>
                    <small>
                      Auch mit eigener Palette führt die Original-Engine
                      zunächst K-Means mit der gewählten Farbanzahl aus. Raster
                      und Farbquantisierung sind in diesem Originalpfad
                      gekoppelt. Regionale Color Correction bleibt ein
                      getrenntes Werkzeug.
                    </small>
                    <p>
                      Das Original-Resampling kann Bildmaße, Transparenz und
                      Details verändern. Original und Vorschau haben
                      unabhängigen Zoom/Pan. Identität und transparente
                      Außenbereiche manuell prüfen.
                    </p>
                    {draft.protectedWeights.some(Boolean) && (
                      <p role="alert" className="warning">
                        Mit aktiven Schutzmasken gesperrt: Sprite Fusion
                        verändert die Geometrie. Masken werden weder entfernt
                        noch ungeprüft kopiert. Color Correction bleibt
                        verfügbar.
                      </p>
                    )}
                  </>
                )}
                {draft.edit.kind === "color" && (
                  <>
                    {masterPalettes.length > 0 && (
                      <section>
                        <label>
                          Masterpalette als Referenz
                          <select
                            value={referenceId}
                            onChange={(e) => setReferenceId(e.target.value)}
                          >
                            {masterPalettes.map((p) => (
                              <option key={p.id} value={p.id}>
                                Masterpalette R{p.revision}
                              </option>
                            ))}
                          </select>
                        </label>
                        {reference?.regions.map((r) => (
                          <div key={r.id}>
                            <small>{r.name}</small>
                            <div className="quality-palette">
                              {r.colors.map((c) => (
                                <button
                                  key={c.hex}
                                  title={c.hex}
                                  aria-label={`Masterfarbe übernehmen ${c.hex}`}
                                  style={{ background: c.hex }}
                                  onClick={() => {
                                    if (draft.edit.kind === "color")
                                      edit({
                                        ...draft,
                                        edit: {
                                          ...draft.edit,
                                          rule: {
                                            ...draft.edit.rule,
                                            targetColor: c.hex,
                                          },
                                        },
                                      });
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </section>
                    )}
                    <button onClick={() => setRegion("selection")}>
                      Auswahl nach Farbe
                    </button>
                    <p>
                      {draft.edit.weights.filter((v) => v > 0).length}{" "}
                      ausgewählte Pixel · Auswahl bleibt auf diese Maske
                      begrenzt.
                    </p>
                    {(["sourceColor", "targetColor"] as const).map((k) => (
                      <label key={k}>
                        {k === "sourceColor"
                          ? "Aufgenommene Farbe"
                          : "Zielfarbe"}
                        <input
                          aria-label={
                            k === "sourceColor"
                              ? "Aufgenommene Farbe"
                              : "Zielfarbe"
                          }
                          type="color"
                          value={
                            draft.edit.kind === "color"
                              ? draft.edit.rule[k]
                              : "#000000"
                          }
                          onChange={(e) => {
                            if (draft.edit.kind === "color")
                              edit({
                                ...draft,
                                edit: {
                                  ...draft.edit,
                                  rule: {
                                    ...draft.edit.rule,
                                    [k]: e.target.value,
                                  },
                                },
                              });
                          }}
                        />
                      </label>
                    ))}
                    <div className="quality-palette" aria-label="Quellpalette">
                      {palette.map((c) => (
                        <button
                          key={c.hex}
                          title={c.hex}
                          aria-label={`Farbe aufnehmen ${c.hex}`}
                          style={{ background: c.hex }}
                          onClick={() => {
                            if (draft.edit.kind === "color")
                              edit({
                                ...draft,
                                edit: {
                                  ...draft.edit,
                                  rule: {
                                    ...draft.edit.rule,
                                    sourceColor: c.hex,
                                  },
                                },
                              });
                          }}
                        />
                      ))}
                    </div>
                    <label>
                      Farbtoleranz
                      <input
                        type="range"
                        min={1}
                        max={50}
                        value={draft.edit.rule.tolerance}
                        onChange={(e) => {
                          if (draft.edit.kind === "color")
                            edit({
                              ...draft,
                              edit: {
                                ...draft.edit,
                                rule: {
                                  ...draft.edit.rule,
                                  tolerance: Number(e.target.value),
                                },
                              },
                            });
                        }}
                      />
                    </label>
                    <label>
                      Korrekturstärke
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={draft.edit.rule.strength}
                        onChange={(e) => {
                          if (draft.edit.kind === "color")
                            edit({
                              ...draft,
                              edit: {
                                ...draft.edit,
                                rule: {
                                  ...draft.edit.rule,
                                  strength: Number(e.target.value),
                                },
                              },
                            });
                        }}
                      />
                    </label>
                    <p>
                      Helligkeitsabstufungen und zusätzliche Schatten bleiben
                      erhalten. Keine Vollquantisierung. Masterpaletten stehen
                      im separaten Werkzeug „Farbkonsistenz prüfen“ für
                      Expressions bereit.
                    </p>
                  </>
                )}
                {result && (
                  <section aria-label="Pixelprüfung">
                    <p>
                      Transparente Pixel: {result.review.before.transparent} →{" "}
                      {result.review.after.transparent}; Teilalpha:{" "}
                      {result.review.before.partial} →{" "}
                      {result.review.after.partial}.
                    </p>
                    {result.review.sameDimensions ? (
                      <>
                        <p>
                          {result.review.changedPixels} veränderte RGBA-Pixel ·{" "}
                          {result.review.alphaChanged} geänderte Alpha-Werte bei
                          gleichen Koordinaten.
                        </p>
                        <label>
                          <input
                            type="checkbox"
                            checked={difference}
                            onChange={(e) => setDifference(e.target.checked)}
                          />
                          Differenzansicht
                        </label>
                      </>
                    ) : (
                      <p>
                        Neue Geometrie: Eine pixelgenaue Änderungszahl und
                        registrierte Differenz sind ohne bestätigte Zuordnung
                        nicht definiert.
                      </p>
                    )}
                  </section>
                )}
                <button
                  disabled={busy || saving}
                  onClick={() => setRegion("protect")}
                >
                  Schutzbereiche auswählen
                </button>
                <div className="button-row">
                  <button
                    disabled={!past.length || saving}
                    onClick={() => {
                      setFuture((f) => [draft, ...f].slice(0, 8));
                      const d = past.at(-1)!;
                      setPast((p) => p.slice(0, -1));
                      restore(d);
                    }}
                  >
                    Rückgängig
                  </button>
                  <button
                    disabled={!future.length || saving}
                    onClick={() => {
                      setPast((p) => [...p, draft].slice(-8));
                      const d = future[0];
                      setFuture((f) => f.slice(1));
                      restore(d);
                    }}
                  >
                    Wiederholen
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => {
                      edit(initial.current!);
                    }}
                  >
                    Zurücksetzen
                  </button>
                </div>
              </aside>
            </div>
            <footer>
              <button
                disabled={
                  busy ||
                  saving ||
                  (mode === "snap" &&
                    (!accepted || draft.protectedWeights.some(Boolean)))
                }
                onClick={() => run()}
              >
                {mode === "snap"
                  ? "Pixel bereinigen"
                  : "Farbvorschau berechnen"}
              </button>
              {busy && (
                <button
                  onClick={() => {
                    serial.current++;
                    worker.current?.terminate();
                    worker.current = undefined;
                    setBusy(false);
                    setResult(undefined);
                    setError("Berechnung abgebrochen. Nichts gespeichert.");
                  }}
                >
                  Berechnung abbrechen
                </button>
              )}
              {result && mode === "snap" && (
                <span aria-label="Ergebnismaße">
                  {result.result.width} × {result.result.height} PNG ·
                  Skalierungsfaktor X{" "}
                  {(result.result.width / source.width).toFixed(3)} / Y{" "}
                  {(result.result.height / source.height).toFixed(3)}
                </span>
              )}
              <span role="status">
                {busy
                  ? "Lokale Berechnung läuft …"
                  : result
                    ? `Vorschau bereit${result.result.changed !== undefined ? ` · ${result.result.changed} bereinigte Pixel · ${result.result.ambiguous} unklare Pixel unverändert` : ""}`
                    : "Original unverändert · Vorschau noch nicht berechnet"}
              </span>
              <button
                disabled={!result || busy || saving}
                onClick={() => void save()}
              >
                Ergebnis übernehmen
              </button>
            </footer>
          </>
        )}
      </section>
      {region && source && draft && (
        <ColorRegionEditor
          pixels={source}
          assetId={sourceId}
          initialWeights={
            region === "protect"
              ? draft.protectedWeights
              : draft.edit.kind === "color"
                ? draft.edit.weights
                : new Uint8Array(source.width * source.height)
          }
          initialSelection={
            region === "selection" ? draft.selection : undefined
          }
          initialName={region === "protect" ? "Geschützte Pixel" : "Farbregion"}
          onClose={() => setRegion(undefined)}
          onSave={(weights, _name, selection) => {
            if (region === "protect") {
              const protectedWeights = new Uint8Array(weights);
              source.protectedWeights.forEach((v, i) => {
                if (v) protectedWeights[i] = 255;
              });
              edit({ ...draft, protectedWeights });
            } else if (draft.edit.kind === "color")
              edit({
                ...draft,
                selection,
                edit: {
                  ...draft.edit,
                  weights: new Uint8Array(weights),
                  rule: {
                    ...draft.edit.rule,
                    sourceColor:
                      selection.seeds
                        .filter(
                          (seed) =>
                            seed.operation === "add" &&
                            weights[seed.y * source.width + seed.x] > 0,
                        )
                        .at(-1)?.hex ?? draft.edit.rule.sourceColor,
                  },
                },
              });
            setRegion(undefined);
          }}
        />
      )}
    </EditorWorkspace>
  );
}
