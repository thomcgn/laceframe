import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Snapshot } from "../../shared/domain";
import type { ColorPixels } from "../../shared/color-consistency";
import { extractPalette } from "../../shared/color-consistency";
import {
  type PixelEdit,
  type SnapAnalysis,
  type SnapSettings,
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
  const [analysis, setAnalysis] = useState<SnapAnalysis>();
  const [result, setResult] = useState<{
    result: ColorPixels & { changed?: number; ambiguous?: number };
    sha256: string;
  }>();
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [region, setRegion] = useState<"selection" | "protect">();
  const [automatic, setAutomatic] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [zoom, setZoom] = useState<number>(),
    [pan, setPan] = useState({ x: 0, y: 0 });
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
                  kind: "snap",
                  settings: {
                    grid: 4,

                    strength: "gentle",
                  },
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
      if (e.data.analysis) {
        setAnalysis(e.data.analysis);
        if (automatic && e.data.analysis.grid)
          setDraft((d) =>
            d?.edit.kind === "snap"
              ? {
                  ...d,
                  edit: {
                    kind: "snap",
                    settings: {
                      ...d.edit.settings,
                      grid: e.data.analysis.grid,
                    },
                  },
                }
              : d,
          );
      } else setResult(e.data);
    };
    w.onerror = () => {
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
      ...(!analyze
        ? { edit: draft.edit, protectedWeights: draft.protectedWeights }
        : {}),
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
    draft?.edit.kind === "snap" ? draft.edit.settings : undefined;
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
                    pixels: result?.result ?? source,
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
                      width={source.width}
                      height={source.height}
                      zoom={zoom}
                      onZoom={setZoom}
                      onFit={() => setZoom(undefined)}
                      pan={pan}
                      onPan={setPan}
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
                    <button disabled={busy || saving} onClick={() => run(true)}>
                      Raster analysieren
                    </button>
                    {analysis && (
                      <div role="status" aria-label="Pixelanalyse">
                        <p>
                          {analysis.grid
                            ? `Rasterhinweis: ${analysis.grid} Pixel. ${analysis.offGrid ? "Unsaubere Kanten / uneinheitliche Cluster möglich." : "Pixelraster überwiegend konsistent."}`
                            : "Raster nicht eindeutig bestimmbar. Manuelle Vorgabe erforderlich."}
                        </p>
                        <small>
                          {analysis.edges} starke Nachbarwechsel ·{" "}
                          {analysis.isolated} isolierte Clusterhinweise ·{" "}
                          {analysis.partialAlpha} teiltransparente Pixel
                          (bleiben unverändert). Heuristik, keine
                          Identitätsbewertung.
                        </small>
                      </div>
                    )}
                    <label>
                      <input
                        type="checkbox"
                        checked={automatic}
                        onChange={(e) => {
                          setAutomatic(e.target.checked);
                          setResult(undefined);
                        }}
                      />
                      Automatische Rastervorgabe
                    </label>
                    <label>
                      Rastergröße
                      <input
                        type="number"
                        min={2}
                        max={32}
                        value={settings.grid}
                        onChange={(e) => {
                          setAutomatic(false);
                          edit({
                            ...draft,
                            edit: {
                              kind: "snap",
                              settings: {
                                ...settings,
                                grid: Number(e.target.value),
                              },
                            },
                          });
                        }}
                      />
                    </label>
                    <label>
                      Kantenbereinigung
                      <select
                        value={settings.strength}
                        onChange={(e) =>
                          edit({
                            ...draft,
                            edit: {
                              kind: "snap",
                              settings: {
                                ...settings,
                                strength: e.target
                                  .value as SnapSettings["strength"],
                              },
                            },
                          })
                        }
                      >
                        <option value="gentle">Behutsam</option>
                        <option value="strong">Stärker</option>
                      </select>
                    </label>

                    <p>
                      Rust-Rasterwanderung folgt den Konturen. Nur nahe
                      Minderheitsfarben in klar dominierten Rasterzellen.
                      Kontrastreiche Details und Alpha bleiben erhalten;
                      unsichere Konturen manuell prüfen.
                    </p>
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
                      setAnalysis(undefined);
                      setAutomatic(true);
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
                    (!accepted || (automatic && !analysis?.grid)))
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
