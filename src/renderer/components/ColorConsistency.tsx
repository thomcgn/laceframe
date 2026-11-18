import { displayMessage } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
import { PixelViewport } from "./PixelViewport";
import { EditorWorkspace } from "./EditorWorkspace";
import type { RegionSelection } from "../../shared/color-region";
import { ColorRegionEditor } from "./ColorRegionEditor";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Snapshot } from "../../shared/domain";
import {
  type ColorDraft,
  type ColorPixels,
  type MasterPalette,
  type ColorMeasurement,
  type colorRoleSchema,
  rgbHex,
  extractPalette,
  paletteTransferGroups,
} from "../../shared/color-consistency";
import type { z } from "zod";
import { MaskEditor } from "./MaskEditor";
type Region = {
  id: string;
  name: string;
  role: z.infer<typeof colorRoleSchema>;
  weights: Uint8Array<ArrayBuffer>;
  selection?: RegionSelection;
};
const roles = {
  hair: tr("common.mc5011ce211"),
  skin: tr("common.m8cba739d1f"),
  clothes: tr("common.me6bb4b3e53"),
  get custom() {
    return tr("editing.mbd9ad835b8");
  },
};
type Pixels = ColorPixels & { sha256: string };
function PixelCanvas({
  pixels,
  label,
  onPick,
}: {
  pixels: ColorPixels;
  label: string;
  onPick?: (hex: string, index: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (c)
      c.getContext("2d")?.putImageData(
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
    <PixelViewport width={pixels.width} height={pixels.height}>
      <canvas
        ref={ref}
        width={pixels.width}
        height={pixels.height}
        aria-label={label}
        style={{
          maxWidth: "100%",
          height: "auto",
          imageRendering: "pixelated",
          cursor: onPick ? "crosshair" : "default",
        }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect(),
            x = Math.min(
              pixels.width - 1,
              Math.floor(((e.clientX - r.left) * pixels.width) / r.width),
            ),
            y = Math.min(
              pixels.height - 1,
              Math.floor(((e.clientY - r.top) * pixels.height) / r.height),
            ),
            i = y * pixels.width + x;
          if (pixels.data[i * 4 + 3] >= 128)
            onPick?.(rgbHex(pixels.data.subarray(i * 4, i * 4 + 3)), i);
        }}
      />
    </PixelViewport>
  );
}
export function ColorConsistency({
  sourceId,
  project,
  onSnapshot,
  disabled = false,
}: {
  sourceId: string;
  project: Project;
  onSnapshot: (s: Snapshot) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  let root = project.assets.find((a) => a.id === sourceId);
  let q = project.qualityAssets.find((a) => a.id === sourceId);
  const seen = new Set<string>();
  while (q && !seen.has(q.id)) {
    seen.add(q.id);
    root = project.assets.find((a) => a.id === q!.sourceId);
    q = project.qualityAssets.find((a) => a.id === q!.sourceId);
  }
  const master = project.masters.find((m) => m.id === root?.masterId);
  const savedCorrection = project.qualityAssets.find(
    (a) => a.id === sourceId && a.colorCorrection,
  );
  if (!master) return null;
  return (
    <div className="color-consistency-entry">
      <button disabled={disabled} onClick={() => setOpen(true)}>
        {tr("editing.mc3161e97d1")}
      </button>
      <small>{tr("editing.mad00feb6d0")}</small>
      {open && (
        <ColorEditor
          sourceId={savedCorrection?.sourceId ?? sourceId}
          recipeId={savedCorrection?.id}
          master={master}
          project={project}
          onSnapshot={onSnapshot}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
function ColorEditor({
  recipeId,
  sourceId,
  master,
  project,
  onSnapshot,
  onClose,
}: {
  sourceId: string;
  recipeId?: string;
  master: Project["masters"][number];
  project: Project;
  onSnapshot: (s: Snapshot) => void;
  onClose: () => void;
}) {
  const palettes = project.masterPalettes.filter(
    (p) => p.masterId === master.id,
  );
  const [paletteId, setPaletteId] = useState(
      project.qualityAssets.find((a) => a.id === recipeId)?.colorCorrection
        ?.paletteId ??
        palettes.at(-1)?.id ??
        "",
    ),
    [palette, setPalette] = useState<MasterPalette>();
  const [masterPixels, setMasterPixels] = useState<Pixels>(),
    [source, setSource] = useState<Pixels>();
  const [masterRegions, setMasterRegions] = useState<Region[]>([]),
    [draft, setDraft] = useState<ColorDraft>();
  const [past, setPast] = useState<ColorDraft[]>([]),
    [future, setFuture] = useState<ColorDraft[]>([]);
  const [selected, setSelected] = useState(""),
    [mask, setMask] = useState<{
      kind: "master" | "candidate" | "protected";
      id: string;
    }>();
  const [result, setResult] = useState<{
    result: ColorPixels;
    sha256: string;
    measurements: ({
      before: ColorMeasurement;
      after: ColorMeasurement;
    } | null)[];
  }>();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [original, setOriginal] = useState(false);
  const [coordinates, setCoordinates] = useState({ x: 0, y: 0 });
  const modal = useRef<HTMLElement>(null),
    dirty = useRef(false);
  function edit(next: ColorDraft) {
    dirty.current = true;
    setPast((p) => [...p, draft!].slice(-8));
    setFuture([]);
    setDraft(next);
    setError("");
  }
  const close = () => {
    if (!busy && (!dirty.current || window.confirm(tr("editing.me67c869b98"))))
      onClose();
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    modal.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    let live = true;
    void Promise.all([
      window.laceframe.analysisSource(master.id),
      window.laceframe.analysisSource(sourceId),
    ])
      .then(([m, s]) => {
        if (!m.ok) throw new Error(m.error);
        if (!s.ok) throw new Error(s.error);
        if (live) {
          setMasterPixels(m.value);
          setSource(s.value);
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [master.id, sourceId]);
  useEffect(() => {
    if (!paletteId || !source) return;
    let live = true;
    setResult(undefined);
    setDraft(undefined);
    setPalette(undefined);
    setConfirmed(false);
    void window.laceframe
      .colorPalette(paletteId)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.error);
        const saved =
          recipeId &&
          project.qualityAssets.find((a) => a.id === recipeId)?.colorCorrection
            ?.paletteId === paletteId
            ? await window.laceframe.colorRecipe(recipeId)
            : undefined;
        if (saved && !saved.ok) throw new Error(saved.error);
        if (!live) return;
        setPalette(r.value.palette);
        setMasterRegions(
          r.value.regions.map((r) => ({
            ...r,
            weights: new Uint8Array(r.weights),
          })),
        );
        setSelected(r.value.regions[0].id);
        setDraft(
          saved?.ok
            ? saved.value
            : {
                paletteId,
                alignmentConfirmed: true,
                regions: r.value.regions.map((r) => ({
                  paletteRegionId: r.id,
                  sourceColor: r.colors[0].hex,
                  targetColor: r.colors[0].hex,
                  strength: 1,
                  tolerance: 12,
                  correctLightness: false,
                  weights: new Uint8Array(source.width * source.height),
                })),
                protectedWeights: new Uint8Array(source.width * source.height),
              },
        );
        setPast([]);
        setFuture([]);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [paletteId, source]);
  useEffect(() => {
    setResult(undefined);
    if (!source || !draft || !palette) return;
    const w = new Worker(
      new URL("../workers/color-consistency.worker.ts", import.meta.url),
      { type: "module" },
    );
    w.onmessage = (e) => {
      if (e.data.error) setError(e.data.error);
      else setResult(e.data);
    };
    w.onerror = () => setError(tr("editing.m2025f2b10c"));
    const timer = setTimeout(
      () => w.postMessage({ source, draft, palette }),
      100,
    );
    return () => {
      clearTimeout(timer);
      w.terminate();
    };
  }, [source, draft, palette]);
  const region = draft?.regions.find((r) => r.paletteRegionId === selected),
    refRegion = palette?.regions.find((r) => r.id === selected);
  const candidateColors = useMemo(() => {
    if (!source || !region) return [];
    try {
      return extractPalette(source, region.weights);
    } catch {
      return [];
    }
  }, [source, region]);
  function updateRule(values: Partial<NonNullable<typeof region>>) {
    if ("sourceColor" in values || "targetColor" in values)
      values = { ...values, transferGroups: undefined };
    if (draft && region)
      edit({
        ...draft,
        regions: draft.regions.map((r) =>
          r === region ? { ...r, ...values } : r,
        ),
      });
  }
  async function savePalette() {
    if (!masterPixels) return;
    setBusy(true);
    setError("");
    try {
      const r = await window.laceframe.command({
        type: "saveMasterPalette",
        masterId: master.id,
        masterSha256: master.sha256,
        regions: masterRegions.map(
          ({ id, name, role, weights, selection }) => ({
            id,
            name,
            role,
            weights,
            selection,
          }),
        ),
      });
      if (!r.ok) throw new Error(r.error);
      onSnapshot(r.value);
      setPaletteId(r.value.project.masterPalettes.at(-1)!.id);
      dirty.current = false;
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!source || !draft || !result || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const r = await window.laceframe.command({
        type: "createColorCorrection",
        sourceId,
        sourceSha256: source.sha256,
        ...draft,
        previewPixelSha256: result.sha256,
      });
      if (!r.ok) throw new Error(r.error);
      onSnapshot(r.value);
      dirty.current = false;
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    const q = project.qualityAssets
      .filter(
        (a) =>
          a.sourceId === sourceId && a.colorCorrection?.paletteId === paletteId,
      )
      .at(-1);
    if (!q) return;
    const r = await window.laceframe.colorRecipe(q.id);
    if (r.ok) {
      edit(r.value);
      setConfirmed(false);
    } else setError(r.error);
  }
  function pickTarget(hex: string, index: number) {
    const r = masterRegions.find((r) => r.id === selected);
    if (!r || r.weights[index] < 128) {
      setError(tr("editing.m4381e99695"));
      return;
    }
    updateRule({ targetColor: hex });
  }
  const view = original ? source : (result?.result ?? source);
  return (
    <EditorWorkspace title={tr("editing.mf3d8ae97d7")} className="">
      <section
        className="color-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={tr("editing.mf3d8ae97d7")}
        tabIndex={-1}
        ref={modal}
        onKeyDown={(e) => {
          if (
            e.target instanceof Element &&
            e.target.closest(".mask-editor, .color-region-dialog")
          )
            return;
          if (e.key === "Escape" && !mask) {
            e.preventDefault();
            close();
          }
          if (e.key === "Tab") {
            const items = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
              ),
            ].filter((n) => n.getClientRects().length);
            const first = items[0],
              last = items.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="section-head">
          <h2>{tr("editing.m8b68c48d9d")}</h2>
          <button disabled={busy} onClick={close}>
            {tr("editing.m8ac13dc20a")}
          </button>
        </div>
        <p>{tr("editing.m035d381599")}</p>
        {error && (
          <p role="alert" className="error">
            {displayMessage(error)}
          </p>
        )}
        {!source || !masterPixels ? (
          <p role="status">{tr("editing.m63fa52bd29")}</p>
        ) : (
          <>
            <div className="color-layout">
              <fieldset disabled={busy} className="color-controls">
                <label>
                  {tr("editing.m29c14fdda5")}
                  <select
                    aria-label={tr("editing.m29c14fdda5")}
                    value={paletteId}
                    onChange={(e) => {
                      setPaletteId(e.target.value);
                      setError("");
                      setPast([]);
                      setFuture([]);
                      setConfirmed(false);
                      if (!e.target.value) {
                        setPalette(undefined);
                        setDraft(undefined);
                        setMasterRegions([]);
                      }
                    }}
                  >
                    <option value="">{tr("editing.m0751727856")}</option>
                    {palettes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {tr("editing.m29f9eecd72")}
                        {master.version} {tr("editing.m02a4069e63")}
                        {p.revision}
                      </option>
                    ))}
                  </select>
                </label>
                <details open={!paletteId}>
                  <summary>{tr("editing.m4890121ed9")}</summary>
                  <div className="button-row">
                    {Object.entries(roles).map(([role, name]) => (
                      <button
                        key={role}
                        disabled={masterRegions.length >= 5}
                        onClick={() => {
                          const r: Region = {
                            id: crypto.randomUUID(),
                            name,
                            role: role as Region["role"],
                            weights: new Uint8Array(
                              masterPixels.width * masterPixels.height,
                            ),
                          };
                          setMasterRegions((old) => [...old, r]);
                          setMask({ kind: "master", id: r.id });
                        }}
                      >
                        {displayMessage(name)} {tr("editing.m272f969fac")}
                      </button>
                    ))}
                  </div>
                  {masterRegions.map((r) => (
                    <div key={r.id} className="button-row">
                      <span>{r.name}</span>
                      <button
                        onClick={() => setMask({ kind: "master", id: r.id })}
                      >
                        {tr("editing.mb792e01b0c")}
                        {r.name}
                      </button>
                      <button
                        onClick={() =>
                          setMasterRegions((old) =>
                            old.filter((v) => v.id !== r.id),
                          )
                        }
                      >
                        {tr("editing.md3a008ef13")}
                        {r.name} {tr("editing.mc64e600651")}
                      </button>
                    </div>
                  ))}
                  <button
                    disabled={!masterRegions.length}
                    onClick={() => void savePalette()}
                  >
                    {tr("editing.m050ca0ee2f")}
                  </button>
                  <small>{tr("editing.mdc4ab7e072")}</small>
                </details>
                {draft && palette && (
                  <>
                    <label>
                      {tr("editing.m4281a9366b")}
                      <select
                        aria-label={tr("editing.m4281a9366b")}
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                      >
                        {palette.regions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={() =>
                        setMask({ kind: "candidate", id: selected })
                      }
                    >
                      {tr("editing.m9cfb0cf5e3")}
                    </button>
                    {source.width === master.width &&
                      source.height === master.height && (
                        <button
                          onClick={() => {
                            if (window.confirm(tr("editing.m0a93709166"))) {
                              updateRule({
                                weights: new Uint8Array(
                                  masterRegions.find(
                                    (r) => r.id === selected,
                                  )!.weights,
                                ),
                              });
                              setConfirmed(false);
                            }
                          }}
                        >
                          {tr("editing.m96775705ad")}
                        </button>
                      )}
                    <button
                      onClick={() =>
                        setMask({ kind: "protected", id: "protected" })
                      }
                    >
                      {tr("editing.m8126ceaf14")}
                    </button>
                    <label>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      {tr("editing.m50dae77160")}
                    </label>
                    <p className="warning">
                      {source.width !== master.width ||
                      source.height !== master.height
                        ? tr("editing.ma0c4adf40d")
                        : tr("editing.mce32596397")}
                      {tr("editing.mbc1bfb3503")}
                    </p>
                    {region && (
                      <>
                        <label>
                          {tr("editing.m041572f0bb")}
                          <input
                            aria-label={tr("editing.mf599a63445")}
                            type="color"
                            value={region.sourceColor}
                            onChange={(e) =>
                              updateRule({ sourceColor: e.target.value })
                            }
                          />
                        </label>
                        <strong>{tr("editing.md0bb3d5d2d")}</strong>
                        <div
                          className="button-row"
                          aria-label={tr("editing.m0e1409784c")}
                        >
                          {refRegion?.colors.map((c) => (
                            <button
                              key={c.hex}
                              title={tr("editing.m2dee0cb1b4", { v0: c.count })}
                              aria-label={tr("editing.mb942d86ed9", {
                                v0: c.hex,
                              })}
                              onClick={() => updateRule({ targetColor: c.hex })}
                              style={{ borderBottom: `6px solid ${c.hex}` }}
                            >
                              {c.hex}
                            </button>
                          ))}
                        </div>
                        <strong>{tr("editing.md990825eff")}</strong>
                        <div
                          className="button-row"
                          aria-label={tr("editing.m111def24ea")}
                        >
                          {candidateColors.map((c) => (
                            <button
                              key={c.hex}
                              aria-label={tr("editing.m3246a402c4", {
                                v0: c.hex,
                              })}
                              title={tr("editing.md10a207b2b", { v0: c.count })}
                              style={{ borderBottom: `6px solid ${c.hex}` }}
                              onClick={() => updateRule({ sourceColor: c.hex })}
                            >
                              {c.hex}
                            </button>
                          ))}
                        </div>
                        <button
                          disabled={
                            !candidateColors.length || !refRegion?.colors.length
                          }
                          onClick={() => {
                            if (refRegion)
                              updateRule({
                                transferGroups: paletteTransferGroups(
                                  candidateColors,
                                  refRegion.colors,
                                ),
                                strength: 1,
                              });
                          }}
                        >
                          {tr("editing.m7c180433fd")}
                        </button>
                        {region.transferGroups && (
                          <p aria-label={tr("editing.m3d9482b0b7")}>
                            {region.transferGroups
                              .map((g) =>
                                tr("editing.mef12155d54", {
                                  v0: g.sourceColor,
                                  v1: g.targetColor,
                                }),
                              )
                              .join(" · ")}{" "}
                            {tr("editing.mf2051f760a")}
                          </p>
                        )}
                        <p>
                          {tr("editing.m0eec0d878b")}
                          {region.targetColor} {tr("editing.maef7d6e34c")}
                        </p>
                        <label>
                          {tr("editing.meec1d6d1f9")}
                          {region.strength}
                          <input
                            aria-label={tr("editing.m21aebe37d7")}
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={region.strength}
                            onChange={(e) =>
                              updateRule({ strength: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label>
                          {tr("editing.m5567a3924f")}
                          {region.tolerance}
                          <input
                            aria-label={tr("editing.m6a05a03272")}
                            type="range"
                            min="1"
                            max="50"
                            value={region.tolerance}
                            onChange={(e) =>
                              updateRule({ tolerance: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={region.correctLightness}
                            onChange={(e) =>
                              updateRule({ correctLightness: e.target.checked })
                            }
                          />
                          {tr("editing.m0edbaaffb1")}
                        </label>
                      </>
                    )}
                    <details>
                      <summary>{tr("editing.md1d04ee746")}</summary>
                      {(["x", "y"] as const).map((k) => (
                        <label key={k}>
                          {k}
                          <input
                            type="number"
                            min="0"
                            aria-label={tr("editing.mecd1811f97", { v0: k })}
                            value={coordinates[k]}
                            onChange={(e) =>
                              setCoordinates((v) => ({
                                ...v,
                                [k]: Number(e.target.value),
                              }))
                            }
                          />
                        </label>
                      ))}
                      <button
                        onClick={() => {
                          const { x, y } = coordinates;
                          if (
                            Number.isInteger(x) &&
                            Number.isInteger(y) &&
                            x >= 0 &&
                            y >= 0 &&
                            x < masterPixels.width &&
                            y < masterPixels.height
                          ) {
                            const i = y * masterPixels.width + x;
                            if (masterPixels.data[i * 4 + 3] >= 128)
                              pickTarget(
                                rgbHex(
                                  masterPixels.data.subarray(i * 4, i * 4 + 3),
                                ),
                                i,
                              );
                          }
                        }}
                      >
                        {tr("editing.m31a8ccc5f8")}
                      </button>
                      <button
                        onClick={() => {
                          const { x, y } = coordinates;
                          if (
                            Number.isInteger(x) &&
                            Number.isInteger(y) &&
                            x >= 0 &&
                            y >= 0 &&
                            x < source.width &&
                            y < source.height
                          ) {
                            const i = y * source.width + x;
                            if (source.data[i * 4 + 3] >= 128)
                              updateRule({
                                sourceColor: rgbHex(
                                  source.data.subarray(i * 4, i * 4 + 3),
                                ),
                              });
                          }
                        }}
                      >
                        {tr("editing.m2149a00fb8")}
                      </button>
                    </details>
                  </>
                )}
              </fieldset>
              <div className="color-review">
                <div className="color-images">
                  <figure>
                    <figcaption>
                      {tr("editing.m3e69d8e50b")}
                      {master.version} · {masterPixels.width}×
                      {masterPixels.height} {tr("editing.m39a70d7141")}
                    </figcaption>
                    <PixelCanvas
                      pixels={masterPixels}
                      label={tr("editing.m14c4ebb26e")}
                      onPick={pickTarget}
                    />
                  </figure>
                  <figure>
                    <figcaption>
                      {original
                        ? tr("editing.m88d759ea02")
                        : tr("editing.ma2197a0eb5")}{" "}
                      · {source.width}×{source.height}{" "}
                      {tr("editing.m86a9a25014")}
                    </figcaption>
                    {view && (
                      <PixelCanvas
                        pixels={view}
                        label={tr("editing.m3f5f11f7de")}
                        onPick={(_hex, i) =>
                          updateRule({
                            sourceColor: rgbHex(
                              source.data.subarray(i * 4, i * 4 + 3),
                            ),
                          })
                        }
                      />
                    )}
                    <button
                      aria-pressed={original}
                      onClick={() => setOriginal((v) => !v)}
                    >
                      {tr("editing.mc586cfd973")}
                    </button>
                  </figure>
                </div>
                {result && palette && (
                  <div role="status" aria-label={tr("editing.ma0ac6fe662")}>
                    {result.measurements.map((m, i) => (
                      <p key={i} className={m?.before.warning ? "warning" : ""}>
                        {
                          palette.regions.find(
                            (r) => r.id === draft!.regions[i].paletteRegionId,
                          )?.name
                        }
                        :{" "}
                        {m
                          ? tr("editing.m86bb075eef", {
                              v0: m.before.warning
                                ? tr("editing.m285f91e557")
                                : tr("editing.m6536591359"),
                              v1: m.before.visible,
                              v2: m.before.chromaticDeltaE76.toFixed(1),
                              v3: m.after.chromaticDeltaE76.toFixed(1),
                              v4: m.before.excessLightness.toFixed(1),
                              v5: m.after.excessLightness.toFixed(1),
                            })
                          : tr("editing.mbba7bd5c30")}
                      </p>
                    ))}
                  </div>
                )}
                <small>{tr("editing.mcccc7cff70")}</small>
              </div>
            </div>
            <div className="button-row color-actions">
              <button
                disabled={busy || !past.length}
                onClick={() => {
                  setFuture((v) => [draft!, ...v]);
                  setDraft(past.at(-1));
                  setPast((v) => v.slice(0, -1));
                }}
              >
                {tr("editing.mbfec16c58e")}
              </button>
              <button
                disabled={busy || !future.length}
                onClick={() => {
                  setPast((v) => [...v, draft!].slice(-8));
                  setDraft(future[0]);
                  setFuture((v) => v.slice(1));
                }}
              >
                {tr("editing.me8860a35d6")}
              </button>
              <button
                disabled={busy || !draft}
                onClick={() =>
                  draft &&
                  edit({
                    ...draft,
                    regions: draft.regions.map((r) => ({ ...r, strength: 0 })),
                  })
                }
              >
                {tr("editing.me6e70d55b3")}
              </button>
              <button
                disabled={
                  busy ||
                  !project.qualityAssets.some(
                    (a) =>
                      a.sourceId === sourceId &&
                      a.colorCorrection?.paletteId === paletteId,
                  )
                }
                onClick={() => void restore()}
              >
                {tr("editing.mdc33443ca1")}
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  !confirmed ||
                  !draft ||
                  !result ||
                  Boolean(error) ||
                  result.measurements.some((m) => !m)
                }
                onClick={() => void save()}
              >
                {tr("editing.m91dd15a432")}
              </button>
            </div>
          </>
        )}
        {mask && mask.kind !== "protected" && source && masterPixels && (
          <ColorRegionEditor
            key={mask.kind + mask.id}
            pixels={mask.kind === "master" ? masterPixels : source}
            assetId={mask.kind === "master" ? master.id : sourceId}
            initialName={
              masterRegions.find((r) => r.id === mask.id)?.name ??
              refRegion?.name ??
              "Farbregion"
            }
            initialWeights={
              (mask.kind === "master"
                ? masterRegions.find((r) => r.id === mask.id)?.weights
                : draft?.regions.find((r) => r.paletteRegionId === mask.id)
                    ?.weights) ?? new Uint8Array(0)
            }
            initialSelection={
              mask.kind === "master"
                ? masterRegions.find((r) => r.id === mask.id)?.selection
                : undefined
            }
            onClose={() => {
              if (mask.kind === "master")
                setMasterRegions((old) =>
                  old.filter(
                    (r) =>
                      r.id !== mask.id ||
                      r.selection ||
                      r.weights.some(Boolean),
                  ),
                );
              setMask(undefined);
            }}
            onSave={(weights, name, selection) => {
              if (mask.kind === "master") {
                setMasterRegions((old) =>
                  old.map((r) =>
                    r.id === mask.id
                      ? {
                          ...r,
                          name,
                          weights: new Uint8Array(weights),
                          selection,
                        }
                      : r,
                  ),
                );
                dirty.current = true;
              } else if (draft) {
                edit({
                  ...draft,
                  regions: draft.regions.map((r) =>
                    r.paletteRegionId === mask.id
                      ? { ...r, weights: new Uint8Array(weights) }
                      : r,
                  ),
                });
                setConfirmed(false);
              }
              setMask(undefined);
            }}
          />
        )}
        {mask && mask.kind === "protected" && source && draft && (
          <MaskEditor
            contextLabel={{
              title: tr("editing.m78593ec494"),
              description: tr("editing.mb7ad19d1c0"),
              saveLabel: tr("editing.m6776e0bb5f"),
              readOnlyName: true,
            }}
            master={{
              id: sourceId,
              width: source.width,
              height: source.height,
            }}
            initialName={tr("editing.m4511de9fbc")}
            initialWeights={draft.protectedWeights}
            onClose={() => setMask(undefined)}
            onSave={async (weights) => {
              edit({ ...draft, protectedWeights: new Uint8Array(weights) });
              setConfirmed(false);
              setMask(undefined);
            }}
          />
        )}
      </section>
    </EditorWorkspace>
  );
}
