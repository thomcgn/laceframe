import { uiLabel } from "../../shared/locales";
import { displayMessage } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
import type { Perform } from "./StyleLibrary";
import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../../shared/domain";
import type { Result } from "../../shared/bridge";
import {
  type AnalysisInput,
  type AnalysisResult,
  type AnalysisEdits,
  type StyleMetrics,
  referenceTypes,
  referenceLabels,
  suggestRules,
  MAX_ANALYSIS_PIXELS,
} from "../../shared/style-analysis";
import { ImagePreview } from "./ImagePreview";
import { StyleComparison } from "./StyleComparison";
const groupLabels = {
  renderRules: tr("styles.me2fe353986"),
  colorRules: tr("styles.m6b73191a0a"),
  lightingRules: tr("styles.m07607d609f"),
  framingRules: tr("styles.m4de57f8f26"),
  constraints: tr("styles.m2b59190cc5"),
};
const percent = (n: number) => `${(n * 100).toFixed(1)} %`;
export function MetricSummary({ m }: { m: StyleMetrics }) {
  return (
    <div className="analysis-metrics">
      <dl>
        <dt>{tr("styles.m102ca3ca26")}</dt>
        <dd>
          {m.width} × {m.height} / {m.roi.width} × {m.roi.height}{" "}
          {tr("styles.m98970d1a1b")}
          {m.roi.x}, {m.roi.y}
        </dd>
        <dt>{tr("styles.m1fdb7cb82c")}</dt>
        <dd>
          {m.visible} · {percent(m.visibleFraction)} /{" "}
          {percent(m.partialFraction)}
        </dd>
        <dt>{tr("styles.m9d88a6ddcd")}</dt>
        <dd>{m.uniqueColors}</dd>
        <dt>{tr("styles.mc03d3a17a7")}</dt>
        <dd>
          {m.meanLuminance.toFixed(3)} / {m.contrast.toFixed(3)} /{" "}
          {m.saturation.toFixed(3)}
        </dd>
        <dt>{tr("styles.m5775e9207c")}</dt>
        <dd>
          {percent(m.warmFraction)} / {percent(m.coolFraction)} /{" "}
          {percent(Math.max(0, 1 - m.warmFraction - m.coolFraction))}
        </dd>
        <dt>{tr("styles.m31a7c06173")}</dt>
        <dd>
          {m.blockBoundaryDifference8.toFixed(3)} {tr("styles.m0a9ce3d8b2")}
        </dd>
        <dt>{tr("styles.m9d9e9add6f")}</dt>
        <dd>
          {percent(m.identicalHorizontal)} / {percent(m.identicalVertical)}
        </dd>
        <dt>{tr("styles.mf5cc7dfc57")}</dt>
        <dd>
          {percent(m.edgeDensity)} / {m.meanEdgeContrast.toFixed(3)}
        </dd>
        <dt>{tr("styles.mb169467743")}</dt>
        <dd>
          {percent(m.hardTransitions)} / {percent(m.similarTransitions)}
        </dd>
        <dt>{tr("styles.m84bd6d7195")}</dt>
        <dd>
          {percent(m.diagonalPairs)} / {percent(m.ditherLike)}
        </dd>
        <dt>{tr("styles.m239d898dd3")}</dt>
        <dd>
          {m.gridCandidate
            ? tr("styles.mb73be0c1f2", {
                v0: m.gridCandidate,
                v1: percent(m.gridEvidence),
              })
            : tr("styles.md70bfbb5e8")}
          {tr("common.me484a573d2")}
        </dd>
        <dt>{tr("styles.m1a59a5a4e9")}</dt>
        <dd>{m.detailByStep.map(percent).join(" / ")}</dd>
      </dl>
      <div className="analysis-palette">
        {m.palette.map((c) => (
          <span
            key={c.hex}
            title={tr("styles.m07f0c77fd4", {
              v0: c.hex,
              v1: c.count,
              v2: percent(c.fraction),
            })}
          >
            <i style={{ background: c.hex }} />
            {c.hex}
            <small>{percent(c.fraction)}</small>
          </span>
        ))}
      </div>
      <details>
        <summary>{tr("styles.mc667c6f559")}</summary>
        <div className="analysis-hist" aria-label={tr("styles.m80e91a4d1b")}>
          {m.luminance.map((n, i) => (
            <span
              key={i}
              title={tr("styles.mf114dd331d", { v0: i, v1: n })}
              style={{
                height: `${Math.max(1, (60 * n) / Math.max(1, ...m.luminance))}px`,
              }}
            />
          ))}
        </div>
        <p>{tr("styles.m0270844308")}</p>
        <table>
          <thead>
            <tr>
              <th>{tr("styles.md3a008ef13")}</th>
              <th>{tr("styles.me0c0bc8e51")}</th>
              <th>{tr("styles.m3f755c5b42")}</th>
              <th>{tr("styles.m00b737a90a")}</th>
            </tr>
          </thead>
          <tbody>
            {m.quadrants.map((q, i) => (
              <tr key={i}>
                <td>
                  {
                    [
                      tr("styles.m6c28489947"),
                      tr("styles.mc4fc849223"),
                      tr("styles.md4b5d4091b"),
                      tr("styles.m085a3fe214"),
                    ][i]
                  }
                </td>
                <td>{q.visible}</td>
                <td>{percent(q.edgeDensity)}</td>
                <td>{q.meanLuminance.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          {tr("styles.mc7228dd626")}{" "}
          {m.runGroups
            .map((n, i) =>
              n ? tr("styles.mb9afdddb64", { v0: i, v1: n }) : "",
            )
            .filter(Boolean)
            .join(" · ")}
        </p>
      </details>
      {m.warnings.map((w) => (
        <p className="muted" key={displayMessage(w)}>
          {displayMessage(w)}
        </p>
      ))}
    </div>
  );
}
export function StyleAnalyzer({
  snapshot,
  perform,
  profileId,
  busy,
  onSnapshot,
  onDirtyChange,
}: {
  snapshot: Snapshot;
  perform: Perform;
  profileId: string;
  busy: boolean;
  onSnapshot: (s: Snapshot) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const p = snapshot.project,
    profile = p.artDirections.find((a) => a.id === profileId)!;
  const sources = [
    ...p.styleAssets.map((a) => ({
      ...a,
      label: tr("styles.m6b36eda6f9", { v0: a.name }),
    })),
    ...p.masters.map((a) => ({
      ...a,
      label: tr("styles.mb7a67a832c", {
        v0: a.version,
        v1: p.characters.find((c) => c.id === a.characterId)?.name,
      }),
    })),
    ...p.masterCandidates.map((a) => ({
      ...a,
      label: tr("styles.m66e43f0941", { v0: a.id.slice(0, 8), v1: a.status }),
    })),
    ...p.assets.map((a) => ({
      ...a,
      label: tr("styles.m3177cb26df", { v0: a.id.slice(0, 8), v1: a.status }),
    })),
  ];
  const [inputs, setInputs] = useState<AnalysisInput[]>(
    (profile.styleReferenceIds ?? []).map((id) => ({ id, type: "portrait" })),
  );
  const [results, setResults] = useState<AnalysisResult[]>([]),
    [edits, setEdits] = useState<AnalysisEdits>({
      rules: [],
      palette: [],
      ownRules: "",
    });
  const [running, setRunning] = useState(false),
    [saving, setSaving] = useState(false),
    [status, setStatus] = useState(""),
    [revision, setRevision] = useState(profile.revision),
    [history, setHistory] = useState("");
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState("references");
  const job = useRef<{
    serial: number;
    worker?: Worker;
    reject?: (e: Error) => void;
  }>({ serial: 0 });
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const stop = () => {
    job.current.serial++;
    job.current.worker?.terminate();
    job.current.reject?.(new Error(tr("styles.md59f8e32dc")));
    job.current.worker = undefined;
    job.current.reject = undefined;
    setRunning(false);
  };
  useEffect(
    () => () => {
      job.current.serial++;
      job.current.worker?.terminate();
      job.current.reject?.(new Error(tr("styles.m07cbb8f747")));
    },
    [],
  );
  function change(next: AnalysisInput[]) {
    setInputs(next);
    setResults([]);
    setDirty(true);
    setHistory("");
  }
  async function analyze() {
    stop();
    setDirty(true);
    const serial = job.current.serial;
    setRunning(true);
    setHistory("");
    setResults([]);
    setStatus(tr("styles.m8b85f3e647"));
    setRevision(profile.revision);
    const next: AnalysisResult[] = [];
    try {
      for (const [index, input] of inputs.entries()) {
        setStatus(
          tr("styles.m774fb45456", { v0: index + 1, v1: inputs.length }),
        );
        const source = await window.laceframe.analysisSource(input.id);
        if (serial !== job.current.serial) return;
        if (!source.ok) throw new Error(source.error);
        const worker = new Worker(
          new URL("../workers/style-analysis.worker.ts", import.meta.url),
          { type: "module" },
        );
        job.current.worker = worker;
        const value = await new Promise<AnalysisResult>((resolve, reject) => {
          job.current.reject = reject;
          worker.onmessage = (e: MessageEvent<Result<AnalysisResult>>) =>
            e.data.ok ? resolve(e.data.value) : reject(new Error(e.data.error));
          worker.onerror = () => reject(new Error(tr("styles.m5096d0b276")));
          worker.postMessage({ input, image: source.value }, [
            source.value.data.buffer,
          ]);
        });
        worker.terminate();
        job.current.worker = undefined;
        job.current.reject = undefined;
        if (serial !== job.current.serial) return;
        next.push(value);
      }
      const suggestions = suggestRules(next);
      setResults(next);
      setStep("results");
      setEdits({
        rules: suggestions.map((s) => ({
          key: s.key,
          text: s.text,
          enabled: true,
        })),
        palette: [
          ...new Set(
            next.flatMap((r) =>
              r.metrics.palette.slice(0, 3).map((c) => c.hex),
            ),
          ),
        ].slice(0, 24),
        ownRules: "",
      });
      setDirty(true);
      setStatus(tr("styles.mac2339a4a7"));
    } catch (e) {
      if (serial === job.current.serial)
        setStatus(e instanceof Error ? e.message : tr("styles.mc30667e750"));
    } finally {
      if (serial === job.current.serial) {
        job.current.worker?.terminate();
        job.current.worker = undefined;
        job.current.reject = undefined;
        setRunning(false);
      }
    }
  }
  const archived = p.styleAnalyses.find((a) => a.id === history),
    shown = archived?.references ?? results,
    suggestions = archived?.suggestions ?? suggestRules(results),
    correction = archived?.edits ?? edits;
  const blocked = busy || running || saving;
  return (
    <section className="style-analyzer" aria-label={tr("styles.m66e80e6d88")}>
      <h3>{tr("styles.m66e80e6d88")}</h3>
      <p>{tr("styles.m493dc0b0cc")}</p>
      <p className="muted">{tr("styles.mf50a333398")}</p>
      <div
        className="analysis-steps"
        role="group"
        aria-label={tr("styles.m41dc866203")}
      >
        {(
          [
            ["references", tr("styles.maf97f41463")],
            ["results", tr("styles.mdb378c902a")],
            ["rules", tr("styles.m875d010e9a")],
            ["approval", tr("styles.m96886e443f")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            aria-pressed={step === id}
            disabled={
              id !== "references" &&
              (!shown.length || (id === "approval" && !!archived))
            }
            onClick={() => setStep(id)}
          >
            {displayMessage(label)}
          </button>
        ))}
      </div>
      <fieldset hidden={step !== "references"} disabled={blocked}>
        <legend>{tr("styles.m500dcdb973")}</legend>
        <label>
          {tr("styles.mf37e78692c")}
          <input
            aria-label={tr("styles.mc8765b20bf")}
            type="file"
            accept="image/png,image/webp"
            multiple
            disabled={(profile.styleReferenceIds?.length ?? 0) >= 6}
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (!files.length) return;
              if (files.length + (profile.styleReferenceIds?.length ?? 0) > 6) {
                setStatus(tr("styles.m895b4cc6bf"));
                return;
              }
              setSaving(true);
              const added: AnalysisInput[] = [];
              await perform(
                async () => {
                  try {
                    for (const file of files) {
                      if (file.size > 8 * 1024 * 1024)
                        throw new Error(tr("styles.mb7c93a0d71"));
                      const staged = await window.laceframe.stageImage(
                        new Uint8Array(await file.arrayBuffer()),
                        file.name,
                      );
                      if (!staged.ok) throw new Error(staged.error);
                      try {
                        const saved = await window.laceframe.command({
                          type: "importStyleReference",
                          profileId,
                          token: staged.value.token,
                        });
                        if (!saved.ok) throw new Error(saved.error);
                        const latest = saved.value;
                        onSnapshot(latest);
                        const id = latest.project.artDirections
                          .find((p) => p.id === profileId)!
                          .styleReferenceIds!.at(-1)!;
                        added.push({ id, type: "portrait" });
                      } finally {
                        await window.laceframe.discardImage(staged.value.token);
                      }
                    }
                    setStatus(tr("styles.mb998136eea"));
                  } catch (error) {
                    setStatus(
                      error instanceof Error
                        ? error.message
                        : tr("styles.m943a42b10a"),
                    );
                    throw error;
                  } finally {
                    change(
                      [...inputs, ...added]
                        .filter(
                          (v, i, a) => a.findIndex((r) => r.id === v.id) === i,
                        )
                        .slice(0, 6),
                    );
                    setSaving(false);
                  }
                  return { ok: true, value: null };
                },
                () => {},
              );
            }}
          />
        </label>
        <label>
          {tr("styles.m66685febe9")}
          <select
            aria-label={tr("styles.m2637957b57")}
            value=""
            disabled={inputs.length >= 6}
            onChange={(e) =>
              change([...inputs, { id: e.target.value, type: "portrait" }])
            }
          >
            <option value="">{tr("styles.m5b2786f225")}</option>
            {sources
              .filter((a) => !inputs.some((i) => i.id === a.id))
              .map((a) => (
                <option
                  key={a.id}
                  value={a.id}
                  disabled={a.width * a.height > MAX_ANALYSIS_PIXELS}
                >
                  {a.label} · {a.width}×{a.height}
                  {a.width * a.height > MAX_ANALYSIS_PIXELS
                    ? tr("styles.m83e173e676")
                    : ""}
                </option>
              ))}
          </select>
        </label>
        <p className="muted">{tr("styles.mfc9cc19656")}</p>
        {inputs.map((input, index) => {
          const source = sources.find((a) => a.id === input.id);
          if (!source) return null;
          const roi = input.roi ?? {
            x: 0,
            y: 0,
            width: source.width,
            height: source.height,
          };
          return (
            <div className="analysis-reference" key={input.id}>
              <ImagePreview
                id={input.id}
                caption={tr("styles.m83c46bab6c", {
                  v0: index + 1,
                  v1: source.label,
                })}
                zoom="fit"
              />
              <div>
                <label>
                  {tr("styles.mb29fce2239")}
                  {index + 1}
                  <select
                    aria-label={tr("styles.m6d748787e9", { v0: index + 1 })}
                    value={input.type}
                    onChange={(e) =>
                      change(
                        inputs.map((r) =>
                          r.id === input.id
                            ? {
                                ...r,
                                type: e.target.value as AnalysisInput["type"],
                              }
                            : r,
                        ),
                      )
                    }
                  >
                    {referenceTypes.map((t) => (
                      <option key={t} value={t}>
                        {referenceLabels[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <details>
                  <summary>{tr("styles.m72bd0c9c23")}</summary>
                  <div className="inspector-options">
                    {(["x", "y", "width", "height"] as const).map((key) => (
                      <label key={uiLabel(key)}>
                        {uiLabel(key)}
                        <input
                          aria-label={tr("styles.m960af94c1b", {
                            v0: index + 1,
                            v1: key,
                          })}
                          type="number"
                          min={key === "width" || key === "height" ? 1 : 0}
                          max={
                            key === "x" || key === "width"
                              ? source.width
                              : source.height
                          }
                          value={roi[key]}
                          onChange={(e) =>
                            change(
                              inputs.map((r) =>
                                r.id === input.id
                                  ? {
                                      ...r,
                                      roi: {
                                        ...roi,
                                        [key]: Number(e.target.value),
                                      },
                                    }
                                  : r,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      change(
                        inputs.map((r) =>
                          r.id === input.id ? { id: r.id, type: r.type } : r,
                        ),
                      )
                    }
                  >
                    {tr("styles.mb667b83a64")}
                    {index + 1}
                  </button>
                </details>
                <button
                  onClick={() =>
                    change(inputs.filter((r) => r.id !== input.id))
                  }
                >
                  {tr("styles.m5fad6df086")}
                  {index + 1} {tr("styles.m32469dfaae")}
                </button>
              </div>
            </div>
          );
        })}
        <button disabled={!inputs.length} onClick={() => void analyze()}>
          {tr("styles.m90caa8886a")}
        </button>
      </fieldset>
      {running && (
        <button
          onClick={() => {
            stop();
            setStatus(tr("styles.md59f8e32dc"));
          }}
        >
          {tr("styles.m22dc0a3601")}
        </button>
      )}
      <p role="status" aria-label={tr("styles.mbe36780128")}>
        {status}
      </p>
      <label>
        {tr("styles.m9b5f0a3194")}
        <select
          aria-label={tr("styles.m9b5f0a3194")}
          disabled={blocked}
          value={history}
          onChange={(e) => {
            if (dirty && !window.confirm(tr("styles.m3be4e7ab2c"))) return;
            setHistory(e.target.value);
            if (e.target.value) setStep("rules");
            setDirty(false);
          }}
        >
          <option value="">{tr("styles.m4fcca0db45")}</option>
          {p.styleAnalyses
            .filter((a) => a.profileId === profileId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {tr("styles.mf666d88f2e")}
                {a.profileRevision} · {a.createdAt} · {a.id.slice(0, 8)}
              </option>
            ))}
        </select>
      </label>
      {archived && <p className="warning">{tr("styles.me129edd106")}</p>}
      {!!shown.length && (
        <>
          <div hidden={step !== "results"}>
            <h4>{tr("styles.m9a90e8d133")}</h4>
            {shown.map((r, i) => {
              const peers = shown.filter((p) => p.type === r.type);
              const mean =
                peers.reduce((s, p) => s + p.metrics.edgeDensity, 0) /
                peers.length;
              return (
                <details key={r.id} open={i === 0}>
                  <summary>
                    {referenceLabels[r.type]} · {r.id.slice(0, 8)}{" "}
                    {tr("styles.m44bf3274e8")} {r.sha256.slice(0, 12)}
                    {peers.length > 1 &&
                    Math.abs(r.metrics.edgeDensity - mean) > 0.15
                      ? tr("styles.mef7311fe2d")
                      : ""}
                  </summary>
                  <MetricSummary m={r.metrics} />
                </details>
              );
            })}
            <button onClick={() => setStep("rules")}>
              {tr("styles.m4519bddea5")}
            </button>
          </div>
          <div hidden={step !== "rules"}>
            <h4>{tr("styles.mb37ace71f2")}</h4>
            <p className="muted">{tr("styles.m816f984962")}</p>
            <fieldset disabled={blocked || !!archived}>
              {suggestions.map((s, i) => (
                <details key={s.key} open={i === 0}>
                  <summary>
                    {groupLabels[s.group]} · {s.key.split(":")[0]}
                  </summary>
                  <label>
                    <input
                      type="checkbox"
                      aria-label={tr("styles.me07c32160f", { v0: s.key })}
                      checked={
                        correction.rules.find((r) => r.key === s.key)
                          ?.enabled ?? false
                      }
                      onChange={(e) => {
                        setEdits({
                          ...edits,
                          rules: edits.rules.map((r) =>
                            r.key === s.key
                              ? { ...r, enabled: e.target.checked }
                              : r,
                          ),
                        });
                        setDirty(true);
                      }}
                    />
                    {tr("styles.m936378b371")}
                  </label>
                  <textarea
                    aria-label={tr("styles.m856338589f", { v0: s.key })}
                    maxLength={2000}
                    rows={3}
                    value={
                      correction.rules.find((r) => r.key === s.key)?.text ?? ""
                    }
                    onChange={(e) => {
                      setEdits({
                        ...edits,
                        rules: edits.rules.map((r) =>
                          r.key === s.key ? { ...r, text: e.target.value } : r,
                        ),
                      });
                      setDirty(true);
                    }}
                  />
                  <p className="muted">
                    {tr("styles.mbb08a980af")}
                    {s.evidence}
                  </p>
                </details>
              ))}
              <div className="analysis-palette">
                {correction.palette.map((hex, i) => (
                  <label key={i}>
                    {tr("styles.ma952c8f76f")}
                    {i + 1}
                    <input
                      aria-label={tr("styles.m61eaee1c3e", { v0: i + 1 })}
                      type="color"
                      value={hex}
                      onChange={(e) => {
                        setEdits({
                          ...edits,
                          palette: edits.palette.map((c, k) =>
                            k === i ? e.target.value : c,
                          ),
                        });
                        setDirty(true);
                      }}
                    />
                  </label>
                ))}
              </div>
              <button
                onClick={() => {
                  setEdits({ ...edits, palette: [] });
                  setDirty(true);
                }}
              >
                {tr("styles.m7a9788904b")}
              </button>
              <label>
                {tr("styles.m944a70140a")}
                <textarea
                  aria-label={tr("styles.m944a70140a")}
                  maxLength={4000}
                  rows={3}
                  value={correction.ownRules}
                  onChange={(e) => {
                    setEdits({ ...edits, ownRules: e.target.value });
                    setDirty(true);
                  }}
                />
              </label>
            </fieldset>
            {!archived && (
              <button onClick={() => setStep("approval")}>
                {tr("styles.me1d12b2fb7")}
              </button>
            )}
          </div>
          {!archived && (
            <div hidden={step !== "approval"}>
              <h4>{tr("styles.m11a39146a7")}</h4>
              <p>{tr("styles.m2d7ea67942")}</p>
              <button
                disabled={
                  blocked ||
                  revision !== profile.revision ||
                  !results.some((r) => r.metrics.visible)
                }
                onClick={async () => {
                  setSaving(true);
                  try {
                    await perform(
                      async () => {
                        const result = await window.laceframe.command({
                          type: "adoptStyleAnalysis",
                          profileId,
                          expectedRevision: revision,
                          references: results.map(({ id, type, roi }) => ({
                            id,
                            type,
                            ...(roi ? { roi } : {}),
                          })),
                          edits,
                        });
                        if (!result.ok) setStatus(result.error);
                        return result;
                      },
                      (saved) => {
                        onSnapshot(saved);
                        setDirty(false);
                        setHistory(saved.project.styleAnalyses.at(-1)!.id);
                        setStep("rules");
                        setStatus(tr("styles.m2a98e35d7c"));
                      },
                    );
                  } catch (e) {
                    setStatus(
                      e instanceof Error ? e.message : tr("styles.m6ad2ee31d2"),
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {tr("styles.m5a64b79446")}
              </button>
              {revision !== profile.revision && (
                <p className="warning">{tr("styles.m0109e72a17")}</p>
              )}
            </div>
          )}
        </>
      )}
      {!!p.styleAnalyses.filter((a) => a.profileId === profileId).length && (
        <StyleComparison project={p} profileId={profileId} />
      )}
    </section>
  );
}
