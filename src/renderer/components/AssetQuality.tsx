import { SemanticLayerEditor } from "./SemanticLayerEditor";
import { uiLabel } from "../../shared/locales";
import { displayMessage } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
import { PixelEditEditor } from "./PixelEditEditor";
import type { StudioStep } from "./StudioSteps";
import { ColorConsistency } from "./ColorConsistency";
import type { RelightEligibility } from "../../shared/relighting";
import { StyleComparison } from "./StyleComparison";
import { RelightingEditor } from "./RelightingEditor";
import { useEffect, useState } from "react";
import type { Command, Project, Snapshot } from "../../shared/domain";
import { effectiveStyle } from "../../shared/domain";
import {
  RESOLUTION_PROFILES,
  type QualityReport,
  type ResolutionProfile,
} from "../../shared/asset-quality";
import { MaskEditor } from "./MaskEditor";
import { MasterCandidateCompare } from "./MasterCandidateCompare";
import { ImagePreview } from "./ImagePreview";
type Asset = { id: string; width: number; height: number; characterId: string };
export function Evidence({
  id,
  label,
  compact = false,
}: {
  id: string;
  label: string;
  compact?: boolean;
}) {
  const [report, setReport] = useState<QualityReport>(),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setReport(undefined);
    setError("");
    void window.laceframe
      .qualityReport(id)
      .then((r) => {
        if (live) {
          if (r.ok) setReport(r.value);
          else setError(r.error);
        }
      })
      .catch(() => {
        if (live) setError(tr("common.m360bf5d4e0"));
      });
    return () => {
      live = false;
    };
  }, [id]);
  if (error)
    return (
      <p className="warning">
        {label}: {displayMessage(error)} {tr("common.m4eba347e0c")}
      </p>
    );
  if (!report)
    return (
      <p>
        {label}
        {tr("common.m0714494ba3")}
      </p>
    );
  const names = {
    transparent: tr("common.m73b7cad572"),
    suspicious: tr("common.m04af8bbd2a"),
    opaque: tr("common.m7fbacabe0e"),
    empty: tr("common.ma02b930134"),
  };
  return (
    <div className="quality-evidence" data-quality-status={report.status}>
      <strong>
        {label} · {names[report.status]}
      </strong>
      {!compact && (
        <>
          <small>
            {report.width} × {report.height} · {report.format.toUpperCase()}{" "}
            {tr("common.mc4f01d8af0")}
            {report.transparent} {tr("common.me6ec73312a")}
            {report.partial} {tr("common.mb0f2399b7f")}
            {report.opaque} {tr("common.m7f9f66460c")} {report.edgeTransparent}/
            {report.edgePixels}
          </small>
          <div
            className="quality-palette"
            aria-label={tr("common.mf58cb167bb", { v0: label })}
          >
            {report.palette.map((p) => (
              <span
                key={p.color}
                title={tr("common.m41ae0d7c6d", { v0: p.color, v1: p.pixels })}
                style={{ background: p.color }}
              />
            ))}
          </div>
          <small>
            {tr("common.m289b871808")} {report.neighborChanges}/
            {report.neighborPairs}
            {tr("common.m318c1351a4")}
          </small>
        </>
      )}
      <small>{report.warnings.map(displayMessage).join(" ")}</small>
    </div>
  );
}
export function AssetQuality({
  source,
  project,
  onSnapshot,
  disabled = false,
  cutoutRequested = 0,
  onCutoutOpened,
  workspaceStep,
  onDirtyChange,
  expert = false,
}: {
  source: Asset;
  expert?: boolean;
  workspaceStep?: StudioStep;
  onDirtyChange?: (dirty: boolean) => void;
  project: Project;
  onSnapshot: (s: Snapshot) => void;
  disabled?: boolean;
  cutoutRequested?: number;
  onCutoutOpened?: () => void;
}) {
  const [semanticEditor, setSemanticEditor] = useState<string>();
  const [pixelEditor, setPixelEditor] = useState<{
    id: string;
    mode: "snap" | "color";
  }>();
  const [relighting, setRelighting] = useState<{
    source: Asset;
    recipeId?: string;
  }>();
  const [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [working, setWorking] = useState(false),
    [notes, setNotes] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [includeProvenance, setIncludeProvenance] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const showExpert = expert || advanced;
  const expanded = true;
  const [profile, setProfile] = useState<ResolutionProfile>(
    RESOLUTION_PROFILES[0],
  );
  const [editor, setEditor] = useState<{
    source: Asset;
    weights?: Uint8Array;
    recipeId?: string;
    name?: string;
  }>();
  useEffect(() => {
    if (cutoutRequested) {
      setEditor({ source });
      onCutoutOpened?.();
    }
  }, [cutoutRequested]);
  const derivatives = project.qualityAssets.filter((q) => {
    let id = q.sourceId;
    const seen = new Set<string>();
    while (id !== source.id) {
      if (seen.has(id)) return false;
      seen.add(id);
      const parent = project.qualityAssets.find((a) => a.id === id);
      if (!parent) return false;
      id = parent.sourceId;
    }
    return true;
  });
  const promotedSource = [...project.masters, ...project.assets].find(
    (a) => a.id === source.id,
  );
  const sourceQuality = project.qualityAssets.find(
    (q) => q.id === promotedSource?.qualitySourceId,
  );
  const selectedSource = project.qualityAssets.find((q) => q.id === source.id);
  const derivative =
      (selected === source.id
        ? selectedSource
        : derivatives.find((q) => q.id === selected)) ??
      selectedSource ??
      derivatives.at(-1),
    active = derivative ?? source;
  let root = source;
  const visited = new Set<string>();
  while (true) {
    const promoted = [...project.masters, ...project.assets].find(
      (a) => a.id === root.id,
    );
    const q = project.qualityAssets.find(
      (q) => q.id === (promoted?.qualitySourceId ?? root.id),
    );
    if (!q || visited.has(q.id)) break;
    visited.add(q.id);
    const parent = [
      ...project.masters,
      ...project.assets,
      ...project.masterCandidates,
      ...project.qualityAssets,
    ].find((a) => a.id === q.sourceId);
    if (!parent) break;
    root = parent;
  }
  const rootExpression = project.assets.find((a) => a.id === root.id),
    rootCandidate = project.masterCandidates.find(
      (a) => a.id === root.id || a.approvedMasterId === root.id,
    );
  const attempt =
    project.attempts.find((a) => a.id === rootExpression?.attemptId) ??
    project.masterAttempts.find((a) => a.id === rootCandidate?.attemptId);
  const currentStyle = effectiveStyle(project, source.characterId);
  const style = attempt
    ? project.artDirectionRevisions.find(
        (s) =>
          s.profileId === attempt.artDirectionId &&
          s.revision === attempt.artDirectionRevision,
      )
    : currentStyle;
  const styleIds = attempt
    ? (attempt.styleReferences?.map((r) => r.id) ?? [])
    : (currentStyle?.styleReferenceIds ?? []);
  const lightingRecipe = derivative?.relighting
    ? derivative
    : sourceQuality?.relighting
      ? sourceQuality
      : undefined;
  const [eligibility, setEligibility] = useState<RelightEligibility>();
  const [recipeEligibility, setRecipeEligibility] =
    useState<RelightEligibility>();
  useEffect(() => {
    if (!expanded) return;
    let live = true;
    setEligibility(undefined);
    setRecipeEligibility(undefined);
    const read = (id: string, set: (e: RelightEligibility) => void) => {
      void window.laceframe
        .relightEligibility(id)
        .then((r) => {
          if (live) set(r.ok ? r.value : { allowed: false, reason: r.error });
        })
        .catch(() => {
          if (live)
            set({
              allowed: false,
              reason: tr("common.mefca899900"),
            });
        });
    };
    read(active.id, setEligibility);
    if (lightingRecipe) read(lightingRecipe.sourceId, setRecipeEligibility);
    return () => {
      live = false;
    };
  }, [expanded, active.id, project, lightingRecipe?.id]);
  useEffect(() => {
    onDirtyChange?.(
      Boolean(derivative?.status === "candidate" && (notes || confirmed)),
    );
  }, [derivative?.id, derivative?.status, notes, confirmed, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const busy = disabled || working;
  async function command(c: Command) {
    setWorking(true);
    setError("");
    try {
      const r = await window.laceframe.command(c);
      if (!r.ok) throw new Error(r.error);
      onSnapshot(r.value);
      return r.value;
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setWorking(false);
    }
  }
  async function beginCutout() {
    setError("");
    try {
      if (derivative?.mask) {
        const r = await window.laceframe.cutoutMask(derivative.id);
        if (!r.ok) throw new Error(r.error);
        const original = [
          ...project.masters,
          ...project.assets,
          ...project.masterCandidates,
          ...project.qualityAssets,
        ].find((a) => a.id === derivative.sourceId)!;
        setEditor({
          source: original,
          weights: r.value,
          name: derivative.mask.name,
          ...(derivative.smartCutout ? { recipeId: derivative.id } : {}),
        });
      } else setEditor({ source: active });
    } catch (e) {
      setError(String(e));
    }
  }
  async function exportImage(raw: boolean) {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const r = await window.laceframe.exportAsset({
        id: active.id,
        raw,
        provenance: includeProvenance,
      });
      if (!r.ok) throw new Error(r.error);
      if (r.value)
        setNotice(
          tr("common.ma4bbd2d022", {
            v0: r.value.name,
            v1: includeProvenance ? " + Provenienz-JSON" : "",
          }),
        );
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }
  // The owner remains mounted to retain selected derivative and review drafts.
  // Irrelevant steps render no tools or forms, rather than hiding a form tree.
  if (
    workspaceStep &&
    workspaceStep !== "Bearbeiten" &&
    workspaceStep !== "Freigeben"
  )
    return null;
  return (
    <div className="quality-container" data-testid="asset-quality">
      <div
        className="button-row quality-tools"
        role="toolbar"
        aria-label={tr("common.mf3d8c5b69a")}
        hidden={workspaceStep === "Freigeben"}
      >
        <button
          disabled={busy || !eligibility?.allowed}
          onClick={() => setRelighting({ source: active })}
        >
          {tr("common.m1ba1656607")}
        </button>
        {lightingRecipe && (
          <button
            disabled={busy || !recipeEligibility?.allowed}
            onClick={() => {
              const parent = [
                ...project.masters,
                ...project.assets,
                ...project.masterCandidates,
                ...project.qualityAssets,
              ].find((a) => a.id === lightingRecipe.sourceId)!;
              setRelighting({
                source: parent,
                recipeId: lightingRecipe.id,
              });
            }}
          >
            {tr("common.m035d80e3f1")}
          </button>
        )}
        <button
          disabled={
            busy ||
            !(
              project.masters.some((m) => m.id === active.id) ||
              project.assets.some(
                (a) =>
                  a.id === active.id &&
                  project.semanticLayerSets.some(
                    (set) => set.sourceId === a.masterId,
                  ),
              )
            )
          }
          title={tr("layers.masterOnly")}
          onClick={() => setSemanticEditor(active.id)}
        >
          {tr("layers.open")}
        </button>
        <button
          disabled={busy}
          onClick={() => setPixelEditor({ id: active.id, mode: "snap" })}
        >
          {tr("common.mf79c202e21")}
        </button>
        <button
          disabled={busy}
          onClick={() => setPixelEditor({ id: active.id, mode: "color" })}
        >
          {tr("common.mcffb81462e")}
        </button>
        <button disabled={busy} onClick={() => void beginCutout()}>
          {tr("common.m46746f197e")}
        </button>
        {(!workspaceStep || showExpert) && (
          <>
            <button disabled={busy} onClick={() => void exportImage(false)}>
              {tr("common.m0cabbd24eb")}
            </button>
            <button disabled={busy} onClick={() => void exportImage(true)}>
              {tr("common.ma6c5fe73d3")}
            </button>
          </>
        )}
      </div>
      <div hidden={workspaceStep === "Freigeben"}>
        <ColorConsistency
          sourceId={active.id}
          project={project}
          onSnapshot={onSnapshot}
          disabled={busy}
        />
      </div>

      <Evidence
        compact={!showExpert}
        id={active.id}
        label={
          derivative
            ? tr("common.m32acc49c2f")
            : sourceQuality?.operation === "cutout"
              ? tr("common.m5c4c929543")
              : tr("common.m77bd0460ce")
        }
      />
      <section className="asset-quality">
        <h3>
          {workspaceStep === "Freigeben"
            ? tr("common.m7e45e4629f")
            : tr("common.m2d329f0554")}
        </h3>
        {!workspaceStep && (
          <label className="quality-expert-toggle">
            <input
              type="checkbox"
              checked={advanced}
              onChange={(e) => setAdvanced(e.target.checked)}
            />
            {tr("common.mf1c856c99f")}
          </label>
        )}
        {expanded && (
          <>
            {error && (
              <p role="alert" className="error">
                {displayMessage(error)}
              </p>
            )}
            {notice && <p role="status">{displayMessage(notice)}</p>}
            {showExpert && (
              <>
                <p>
                  {tr("common.m1eb7dc4391")}{" "}
                  {derivative
                    ? derivative.operation === "cutout"
                      ? tr("common.m6879c746d2")
                      : derivative.operation === "relighting"
                        ? tr("common.m17ce52206c", {
                            v0: derivative.relighting?.revision,
                          })
                        : derivative.operation === "pixel-snap"
                          ? tr("common.mdd7a25049d", {
                              v0: derivative.pixelEdit?.revision,
                            })
                          : derivative.operation === "color-adjustment"
                            ? tr("common.m0495c8e9ca", {
                                v0: derivative.pixelEdit?.revision,
                              })
                            : derivative.operation === "color-correction"
                              ? tr("common.m30e7da66f9", {
                                  v0: derivative.colorCorrection?.revision,
                                })
                              : tr("common.mbe4efc90c5")
                    : sourceQuality
                      ? tr("common.mb9d3662999")
                      : tr("common.m590c2c345b")}
                  {tr("common.mb5740e6f85")}
                </p>
              </>
            )}
            {showExpert && sourceQuality && (
              <p className="mono">
                {tr("common.mcc2e5420cf")}
                {sourceQuality.sourceId} {tr("common.md7e1f4d17c")}{" "}
                {sourceQuality.sourceSha256}
                {tr("common.mc646deb90a")}
              </p>
            )}
            {showExpert && (
              <>
                <p>
                  {derivative
                    ? tr("common.maf995901c9", {
                        v0: derivative.status,
                        v1: derivative.notes ?? "Freigabe steht aus",
                      })
                    : tr("common.m0ba5ff9c79")}
                </p>
              </>
            )}
            <p role="status" aria-label={tr("common.mb9ceaedccd")}>
              {eligibility?.reason ?? tr("common.mdfa6ee9ec0")}
            </p>
            {lightingRecipe &&
              recipeEligibility &&
              !recipeEligibility.allowed && (
                <p className="warning">
                  {tr("common.m706038b300")}{" "}
                  {displayMessage(recipeEligibility.reason)}
                </p>
              )}
            {(!workspaceStep || showExpert) && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={includeProvenance}
                    disabled={busy}
                    onChange={(e) => setIncludeProvenance(e.target.checked)}
                  />
                  {tr("common.mcfa9657e86")}
                </label>
              </>
            )}
            {(derivatives.length > 0 || derivative) && (
              <>
                <label>
                  {tr("common.m32acc49c2f")}
                  <select
                    aria-label={tr("common.m32acc49c2f")}
                    value={derivative?.id ?? ""}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {(selectedSource
                      ? [selectedSource, ...derivatives]
                      : derivatives
                    ).map((d, i) => (
                      <option key={d.id} value={d.id}>
                        {i + 1} · {uiLabel(d.operation)} · {d.width}×{d.height}{" "}
                        · {uiLabel(d.status)}
                      </option>
                    ))}
                  </select>
                </label>
                <MasterCandidateCompare
                  master={
                    project.qualityAssets.some((q) => q.id === source.id)
                      ? [
                          ...project.masters,
                          ...project.assets,
                          ...project.masterCandidates,
                          ...project.qualityAssets,
                        ].find((a) => a.id === derivative?.sourceId)
                      : source
                  }
                  candidate={derivative}
                  beforeLabel={tr("common.m88d759ea02")}
                  previewPrefix={tr("common.meb718207ad")}
                />
                {derivative?.status === "candidate" && (
                  <div
                    className="quality-review"
                    hidden={workspaceStep === "Bearbeiten"}
                  >
                    <label>
                      {tr("common.m7d3c3d381f")}
                      <textarea
                        aria-label={tr("common.mcaa6d3fd8e")}
                        maxLength={8000}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      {tr("common.m417b2918c4")}
                    </label>
                    <small>{tr("common.m0be39dc703")}</small>
                    <div className="button-row">
                      <button
                        disabled={busy || !confirmed || !notes.trim()}
                        onClick={() => {
                          if (!window.confirm(tr("common.m7c1b763808"))) return;
                          void command({
                            type: "reviewQuality",
                            id: derivative.id,
                            status: "approved",
                            notes,
                            confirmStyleAndSilhouette: true,
                            rasterConfirmed: true,
                          }).catch(() => {});
                        }}
                      >
                        {tr("common.m35bca28ae0")}
                      </button>
                      <button
                        disabled={busy || !notes.trim()}
                        onClick={() => {
                          void command({
                            type: "reviewQuality",
                            id: derivative.id,
                            status: "rejected",
                            notes,
                            confirmStyleAndSilhouette: true,
                            rasterConfirmed: true,
                          }).catch(() => {});
                        }}
                      >
                        {tr("common.mb5ac0ec95b")}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {showExpert && (
              <section className="quality-expert">
                <StyleComparison project={project} sourceId={active.id} />
                <h3>{tr("common.m73648e8f54")}</h3>
                <div className="inline-form">
                  <label>
                    {tr("common.m697cf59a62")}
                    <select
                      aria-label={tr("common.m52e19d6c5e")}
                      onChange={(e) =>
                        setProfile({
                          ...RESOLUTION_PROFILES[Number(e.target.value)],
                        })
                      }
                    >
                      {RESOLUTION_PROFILES.map((p, i) => (
                        <option key={p.name} value={i}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tr("common.m3f5b0786ba")}
                    <input
                      value={profile.name}
                      onChange={(e) =>
                        setProfile({ ...profile, name: e.target.value })
                      }
                    />
                  </label>
                  {(["width", "height"] as const).map((k) => (
                    <label key={k}>
                      {k === "width"
                        ? tr("common.m28240c279d")
                        : tr("common.ma4d8c3470c")}
                      <input
                        aria-label={tr("common.m46b0d480a0", { v0: k })}
                        type="number"
                        min={1}
                        max={4096}
                        value={profile[k]}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            [k]: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    {tr("common.me1c8e71ab0")}
                    <select
                      value={profile.sampling}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          sampling: e.target
                            .value as ResolutionProfile["sampling"],
                        })
                      }
                    >
                      <option value="nearest">
                        {tr("common.mbb8f690b15")}
                      </option>
                      <option value="bilinear">
                        {tr("common.mcba5512ae2")}
                      </option>
                    </select>
                  </label>
                  <label>
                    {tr("common.m0e9f31ec4b")}
                    <select
                      value={profile.fit}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          fit: e.target.value as ResolutionProfile["fit"],
                        })
                      }
                    >
                      <option value="contain">
                        {tr("common.m6debc775be")}
                      </option>
                      <option value="cover">{tr("common.m0cc0d661d8")}</option>
                    </select>
                  </label>
                </div>
                <p>
                  {active.width === profile.width &&
                  active.height === profile.height
                    ? tr("common.mfb8cde0dc1")
                    : tr("common.mc25877f87e")}{" "}
                  {tr("common.mce296e5214")}
                  {active.width}×{active.height} {tr("common.mfec7d610a1")}
                  {profile.width}×{profile.height}
                  {tr("common.m3bbd97a968")}
                </p>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      profile.fit === "cover" &&
                      !window.confirm(tr("common.m62c640b139"))
                    )
                      return;
                    void command({
                      type: "deriveResolution",
                      sourceId: active.id,
                      profile,
                    }).catch(() => {});
                  }}
                >
                  {tr("common.md2c8f574a3")}
                </button>
              </section>
            )}
            {showExpert && (
              <section className="quality-expert">
                <h3>
                  {tr("common.m2b2801eb85")}{" "}
                  {style?.name ?? "Eigener Masterstil"} · {styleIds.length}{" "}
                  {tr("common.mbc0cc2fa3d")}
                </h3>
                <p>
                  {tr("common.mc2770b9300")}{" "}
                  {style?.colorRules ?? tr("common.m9ba712cd0f")}
                  {tr("common.m5507d9a136")}
                </p>
                {styleIds.map((id) => (
                  <div key={id}>
                    <ImagePreview
                      id={id}
                      caption={tr("common.md1c68d5b2a")}
                      zoom={100}
                    />
                    <Evidence id={id} label={tr("common.md7f9a116bd")} />
                    <MasterCandidateCompare
                      master={project.styleAssets.find((a) => a.id === id)}
                      candidate={active}
                      beforeLabel={tr("common.md7f9a116bd")}
                      previewPrefix={tr("common.m004f657191")}
                    />
                  </div>
                ))}
              </section>
            )}
            {semanticEditor && (
              <SemanticLayerEditor
                sourceId={semanticEditor}
                project={project}
                onSaved={onSnapshot}
                onClose={() => setSemanticEditor(undefined)}
              />
            )}
            {pixelEditor && (
              <PixelEditEditor
                project={project}
                sourceId={pixelEditor.id}
                mode={pixelEditor.mode}
                onClose={() => setPixelEditor(undefined)}
                onSaved={(s) => {
                  onSnapshot(s);
                  setSelected(s.project.qualityAssets.at(-1)!.id);
                }}
              />
            )}
            {relighting && (
              <RelightingEditor
                source={relighting.source}
                recipeId={relighting.recipeId}
                project={project}
                onClose={() => setRelighting(undefined)}
                onSaved={(s) => {
                  onSnapshot(s);
                  setSelected(s.project.qualityAssets.at(-1)!.id);
                }}
              />
            )}
            {editor && (
              <MaskEditor
                master={editor.source}
                cutout
                initialWeights={editor.weights}
                initialName={editor.name}
                recipeId={editor.recipeId}
                onClose={() => setEditor(undefined)}
                onSave={async (weights, name, smart) => {
                  const s = await command({
                    type: "createCutout",
                    name,
                    sourceId: editor.source.id,
                    weights: new Uint8Array(weights),
                    ...(smart ? { smart } : {}),
                  });
                  setSelected(s.project.qualityAssets.at(-1)!.id);
                }}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
