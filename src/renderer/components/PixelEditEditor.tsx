import { type RasterSettings, visibleColors } from "../../shared/raster-snap";
import { displayMessage } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
import type { PixelReview } from "../../shared/pixel-review";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Snapshot } from "../../shared/domain";
import type { ColorPixels } from "../../shared/color-consistency";
import { extractPalette } from "../../shared/color-consistency";
import { type PixelEdit, type SnapAnalysis } from "../../shared/pixel-snap";
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
  const [analysis, setAnalysis] = useState<SnapAnalysis>();
  const [automatic, setAutomatic] = useState(false);
  const [aspect, setAspect] = useState(true);
  const [expert, setExpert] = useState(false);
  const [zoom, setZoom] = useState<number>();
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [difference, setDifference] = useState(false);

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
                  kind: "raster",
                  settings: {
                    width: Math.min(128, r.value.width),
                    height: Math.min(
                      r.value.height,
                      Math.max(
                        1,
                        Math.round(
                          (Math.min(128, r.value.width) * r.value.height) /
                            r.value.width,
                        ),
                      ),
                    ),
                    sampling: "dominant",
                    offsetX: 0,
                    offsetY: 0,
                    colors: 16,
                    alpha: "binary",
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
      if (e.data.analysis) setAnalysis(e.data.analysis);
      else setResult(e.data);
    };
    w.onerror = () => {
      w.terminate();
      worker.current = undefined;
      setBusy(false);
      setError(tr("editing.m00952a39e6"));
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
    if (!dirty.current || window.confirm(tr("editing.mef963bd99f"))) onClose();
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
    draft?.edit.kind === "raster" ? draft.edit.settings : undefined;
  function updateSnap(settings: RasterSettings) {
    if (draft) edit({ ...draft, edit: { kind: "raster", settings } });
  }
  function dimensions(width: number, height?: number) {
    if (!settings || !source) return;
    updateSnap({
      ...settings,
      width,
      height:
        height ??
        (aspect
          ? Math.max(1, Math.round((width * source.height) / source.width))
          : settings.height),
    });
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
      title={
        mode === "snap" ? tr("editing.mee2eeb1aef") : tr("editing.mbe3eaabccb")
      }
      className="pixel-edit-workspace"
    >
      <section
        className={`pixel-edit-editor ${mode === "snap" ? "raster-editor" : ""}`}
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
        aria-label={
          mode === "snap"
            ? tr("editing.mee2eeb1aef")
            : tr("editing.mbe3eaabccb")
        }
      >
        <header>
          <h2>
            {mode === "snap"
              ? tr("editing.mee2eeb1aef")
              : tr("editing.mbe3eaabccb")}
          </h2>
          <span>
            {source && `${source.width} × ${source.height} · Originalauflösung`}
          </span>
          <button disabled={saving} onClick={close}>
            {tr("editing.m594ca889c4")}
          </button>
        </header>
        {error && (
          <p role="alert" className="error">
            {displayMessage(error)}
          </p>
        )}
        {source && draft && (
          <>
            {settings && (
              <div className="raster-controls">
                <label>
                  {tr("raster.mode")}
                  <select
                    aria-label={tr("raster.mode")}
                    value={automatic ? "auto" : "manual"}
                    onChange={(e) => setAutomatic(e.target.value === "auto")}
                  >
                    <option value="manual">{tr("raster.manual")}</option>
                    <option value="auto">{tr("raster.auto")}</option>
                  </select>
                </label>
                <label>
                  {tr("raster.width")}
                  <input
                    type="number"
                    min={1}
                    max={source.width}
                    value={settings.width}
                    onChange={(e) => dimensions(Number(e.target.value))}
                  />
                </label>
                <span>×</span>
                <label>
                  {tr("raster.height")}
                  <input
                    type="number"
                    min={1}
                    max={source.height}
                    value={settings.height}
                    onChange={(e) => {
                      const height = Number(e.target.value);
                      dimensions(
                        aspect
                          ? Math.max(
                              1,
                              Math.round(
                                (height * source.width) / source.height,
                              ),
                            )
                          : settings.width,
                        height,
                      );
                    }}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={aspect}
                    onChange={(e) => setAspect(e.target.checked)}
                  />
                  {tr("raster.aspect")}
                </label>
                <label>
                  {tr("raster.preset")}
                  <select
                    aria-label={tr("raster.preset")}
                    value=""
                    onChange={(e) => dimensions(Number(e.target.value))}
                  >
                    <option value="">—</option>
                    {[64, 128, 256, 512].map((n) => (
                      <option
                        key={n}
                        value={n}
                        disabled={
                          n > source.width ||
                          (aspect &&
                            Math.round((n * source.height) / source.width) >
                              source.height)
                        }
                      >
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr("editing.m3933e9485c")}
                  <select
                    aria-label={tr("editing.m3933e9485c")}
                    value={
                      settings.colors === undefined
                        ? "original"
                        : [16, 32, 64].includes(settings.colors)
                          ? settings.colors
                          : "custom"
                    }
                    onChange={(e) =>
                      updateSnap({
                        ...settings,
                        colors:
                          e.target.value === "original"
                            ? undefined
                            : e.target.value === "custom"
                              ? 24
                              : Number(e.target.value),
                        palette: undefined,
                      })
                    }
                  >
                    <option value="original">
                      {tr("raster.originalColors")}
                    </option>
                    {[16, 32, 64].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                    <option value="custom">{tr("raster.custom")}</option>
                  </select>
                </label>
                {settings.colors !== undefined &&
                  ![16, 32, 64].includes(settings.colors) && (
                    <input
                      aria-label={tr("raster.customColors")}
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
                  )}
                <label>
                  {tr("raster.alpha")}
                  <select
                    aria-label={tr("raster.alpha")}
                    value={settings.alpha}
                    onChange={(e) =>
                      updateSnap({
                        ...settings,
                        alpha: e.target.value as RasterSettings["alpha"],
                      })
                    }
                  >
                    <option value="binary">{tr("raster.binary")}</option>
                    <option value="preserve">{tr("raster.preserve")}</option>
                  </select>
                </label>
                <button
                  disabled={
                    busy || saving || draft.protectedWeights.some(Boolean)
                  }
                  onClick={() => run()}
                >
                  {tr("editing.me619dba5ff")}
                </button>
                {automatic && (
                  <div className="raster-suggestions">
                    <button disabled={busy || saving} onClick={() => run(true)}>
                      {tr("raster.suggest")}
                    </button>
                    {analysis && (
                      <>
                        <span>
                          {tr(
                            analysis.grid
                              ? "raster.uncertain"
                              : "raster.noGrid",
                          )}
                        </span>
                        {analysis.grid &&
                          [
                            ...new Set([
                              Math.max(2, analysis.grid - 1),
                              analysis.grid,
                              analysis.grid + 1,
                            ]),
                          ].map((grid) => {
                            const width = Math.max(
                                1,
                                Math.round(source.width / grid),
                              ),
                              height = Math.max(
                                1,
                                Math.round(source.height / grid),
                              );
                            return (
                              <button
                                key={grid}
                                onClick={() => dimensions(width, height)}
                              >
                                {width} × {height}
                              </button>
                            );
                          })}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {mode === "snap" && (
              <div
                className="raster-camera-controls"
                role="toolbar"
                aria-label={tr("editing.mdc6710c419")}
              >
                <button
                  onClick={() => {
                    setZoom(undefined);
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  {tr("editing.m6697a0f7da")}
                </button>
                <button
                  onClick={() => {
                    setZoom(
                      (result?.result.width ??
                        settings?.width ??
                        source.width) / source.width,
                    );
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  1:1
                </button>
                {[2, 4, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() =>
                      setZoom(
                        (n *
                          (result?.result.width ??
                            settings?.width ??
                            source.width)) /
                          source.width,
                      )
                    }
                  >
                    {n * 100}%
                  </button>
                ))}
                <span>{tr("raster.sync")}</span>
              </div>
            )}
            <div className="pixel-edit-body">
              <div
                className="pixel-edit-pair"
                aria-label={tr("editing.m369aef5742")}
              >
                {[
                  { pixels: source, label: tr("editing.m88d759ea02") },
                  {
                    pixels:
                      difference && result?.review.difference
                        ? result.review.difference
                        : (result?.result ?? source),
                    label: tr("common.md1e1cfeaf0"),
                  },
                ].map((v) => (
                  <figure key={v.label}>
                    <figcaption>
                      {v.label === "Pixel-Snap-Vorschau" && mode === "color"
                        ? tr("editing.m3f5f11f7de")
                        : v.label}
                    </figcaption>
                    <PixelViewport
                      hideTools={mode === "snap"}
                      zoom={mode === "snap" ? zoom : undefined}
                      onZoom={mode === "snap" ? setZoom : undefined}
                      pan={mode === "snap" ? pan : undefined}
                      onPan={mode === "snap" ? setPan : undefined}
                      onFit={
                        mode === "snap"
                          ? () => {
                              setZoom(undefined);
                              setPan({ x: 0, y: 0 });
                            }
                          : undefined
                      }
                      cameraWidth={mode === "snap" ? source.width : undefined}
                      cameraHeight={mode === "snap" ? source.height : undefined}
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
                        checked={expert}
                        onChange={(e) => setExpert(e.target.checked)}
                      />
                      {tr("raster.expert")}
                    </label>
                    {expert && (
                      <>
                        <label>
                          {tr("raster.sampling")}
                          <select
                            aria-label={tr("raster.sampling")}
                          value={settings.sampling}
                            onChange={(e) =>
                              updateSnap({
                                ...settings,
                                sampling: e.target
                                  .value as RasterSettings["sampling"],
                              })
                            }
                          >
                            <option value="dominant">
                              {tr("raster.dominant")}
                            </option>
                            <option value="nearest">
                              {tr("raster.nearest")}
                            </option>
                          </select>
                        </label>
                        {(["offsetX", "offsetY"] as const).map((k) => (
                          <label key={k}>
                            {tr(
                              k === "offsetX"
                                ? "raster.offsetX"
                                : "raster.offsetY",
                            )}
                            <input
                              type="number"
                              min={-0.5}
                              max={0.5}
                              step={0.05}
                              value={settings[k]}
                              onChange={(e) =>
                                updateSnap({
                                  ...settings,
                                  [k]: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        ))}
                        <label>
                          {tr("editing.m2847c55cb9")}
                          <input
                            value={settings.palette?.join(", ") ?? ""}
                            placeholder="#0d2b45, #ffecd6"
                            onChange={(e) =>
                              updateSnap({
                                ...settings,
                                palette: e.target.value.trim()
                                  ? e.target.value
                                      .split(",")
                                      .map((c) => c.trim())
                                  : undefined,
                              })
                            }
                          />
                        </label>
                        <p>{tr("raster.limits")}</p>
                        {result && (
                          <p>
                            {tr("raster.alphaStats", {
                              before: result.review.before.partial,
                              after: result.review.after.partial,
                            })}
                          </p>
                        )}
                        <button
                          disabled={busy || saving}
                          onClick={() => setRegion("protect")}
                        >
                          {tr("editing.md60d518d6b")}
                        </button>
                      </>
                    )}
                  </>
                )}
                {draft.edit.kind === "color" && (
                  <>
                    {masterPalettes.length > 0 && (
                      <section>
                        <label>
                          {tr("editing.m367ea7d13e")}
                          <select
                            value={referenceId}
                            onChange={(e) => setReferenceId(e.target.value)}
                          >
                            {masterPalettes.map((p) => (
                              <option key={p.id} value={p.id}>
                                {tr("editing.m50eb0ad00e")}
                                {p.revision}
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
                                  aria-label={tr("editing.m773fbbb3bf", {
                                    v0: c.hex,
                                  })}
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
                      {tr("editing.mbe7ed3a938")}
                    </button>
                    <p>
                      {draft.edit.weights.filter((v) => v > 0).length}{" "}
                      {tr("editing.m5a5fad2d33")}
                    </p>
                    {(["sourceColor", "targetColor"] as const).map((k) => (
                      <label key={k}>
                        {k === "sourceColor"
                          ? tr("editing.mf559a5e704")
                          : tr("editing.m2c74e311fc")}
                        <input
                          aria-label={
                            k === "sourceColor"
                              ? tr("editing.mf559a5e704")
                              : tr("editing.m2c74e311fc")
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
                    <div
                      className="quality-palette"
                      aria-label={tr("editing.m6b72bf1d2f")}
                    >
                      {palette.map((c) => (
                        <button
                          key={c.hex}
                          title={c.hex}
                          aria-label={tr("editing.m1c232ba46a", { v0: c.hex })}
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
                      {tr("editing.m554b6b4de2")}
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
                      {tr("editing.m21aebe37d7")}
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
                    <p>{tr("editing.m4a2db1d6bc")}</p>
                  </>
                )}
                {result && mode === "color" && (
                  <section aria-label={tr("editing.m88686ca551")}>
                    <p>
                      {tr("editing.m0aa47ca8f5")}
                      {result.review.before.transparent} →{" "}
                      {result.review.after.transparent}
                      {tr("editing.m9564113717")} {result.review.before.partial}{" "}
                      → {result.review.after.partial}.
                    </p>
                    {result.review.sameDimensions ? (
                      <>
                        <p>
                          {result.review.changedPixels}{" "}
                          {tr("editing.mf891bd81d2")}{" "}
                          {result.review.alphaChanged}{" "}
                          {tr("editing.m591e973261")}
                        </p>
                        <label>
                          <input
                            type="checkbox"
                            checked={difference}
                            onChange={(e) => setDifference(e.target.checked)}
                          />
                          {tr("editing.m9bcfbfdc79")}
                        </label>
                      </>
                    ) : (
                      <p>{tr("editing.m77367a0041")}</p>
                    )}
                  </section>
                )}
                {mode === "color" && (
                  <button
                    disabled={busy || saving}
                    onClick={() => setRegion("protect")}
                  >
                    {tr("editing.md60d518d6b")}
                  </button>
                )}
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
                    {tr("editing.mdd7bd2f68c")}
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
                    {tr("editing.me0ef009b54")}
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => {
                      edit(initial.current!);
                    }}
                  >
                    {tr("editing.m1ba0463c46")}
                  </button>
                </div>
              </aside>
            </div>
            {mode === "snap" && draft.protectedWeights.some(Boolean) && (
              <p role="alert" className="warning">
                {tr("editing.me25a7d50aa")}
              </p>
            )}
            <footer>
              {mode === "color" && (
                <button
                  disabled={busy || saving || false}
                  onClick={() => run()}
                >
                  {tr("editing.md6f5c040c1")}
                </button>
              )}
              {busy && (
                <button
                  onClick={() => {
                    serial.current++;
                    worker.current?.terminate();
                    worker.current = undefined;
                    setBusy(false);
                    setResult(undefined);
                    setError(tr("editing.mf7d979d08b"));
                  }}
                >
                  {tr("editing.mb4c1b411ad")}
                </button>
              )}
              {result && mode === "snap" && (
                <span aria-label={tr("editing.m1e572eba8e")}>
                  {result.result.width} × {result.result.height}{" "}
                  {tr("editing.m90de0a3633")}{" "}
                  {(result.result.width / source.width).toFixed(3)} / Y{" "}
                  {(result.result.height / source.height).toFixed(3)} ·{" "}
                  {visibleColors(result.result)} {tr("raster.colors")}
                </span>
              )}
              {mode === "snap" && result && <span>{tr("raster.uniform")}</span>}
              <span role="status">
                {busy
                  ? tr("editing.m569a057a06")
                  : result
                    ? tr("editing.m943e715f53", {
                        v0:
                          result.result.changed !== undefined
                            ? tr("editing.m6aa45b75c8", {
                                v0: result.result.changed,
                                v1: result.result.ambiguous,
                              })
                            : "",
                      })
                    : tr("editing.m91bdc31a73")}
              </span>
              <button
                disabled={!result || busy || saving}
                onClick={() => void save()}
              >
                {tr("editing.m3c0e9bc7bc")}
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
          initialName={
            region === "protect"
              ? tr("editing.m3c340a38f2")
              : tr("editing.m4281a9366b")
          }
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
