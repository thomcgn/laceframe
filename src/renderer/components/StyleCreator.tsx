import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { tr } from "../../shared/locales";
import type { Result } from "../../shared/bridge";
import type { Snapshot } from "../../shared/domain";
import type { AnalysisResult } from "../../shared/style-analysis";
import { proposeStyle, styleWithReview } from "../../shared/style-creator";
import {
  semanticResponseSchema,
  styleRoles,
  type StyleDraftImage,
  type StyleDraftReference,
  type SemanticStatus,
  type SemanticRecord,
} from "../../shared/style-semantics";
import type { StyleContent } from "../../shared/packs";
import { z } from "zod";
async function value<T>(work: Promise<Result<T>>) {
  const result = await work;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
const fields = {
  contours: "styleCreator.contours",
  pixelClusters: "styleCreator.pixelClusters",
  shading: "styleCreator.shading",
  materials: "styleCreator.materials",
  colorTreatment: "styleCreator.colorTreatment",
  lighting: "styleCreator.lighting",
  composition: "styleCreator.composition",
  apparentDensity: "styleCreator.apparentDensity",
} as const;
const roles = {
  sprite: "styleCreator.roleSprite",
  portrait: "styleCreator.rolePortrait",
  environment: "styleCreator.roleEnvironment",
  ui: "styleCreator.roleUI",
  general: "styleCreator.roleGeneral",
};
type Draft = StyleDraftImage & {
  role?: StyleDraftReference["role"];
  sourceNote: string;
};
export function StyleCreator({
  busy,
  onSaved,
  onDirtyChange,
  onRunningChange,
}: {
  busy: boolean;
  onSaved: (snapshot: Snapshot) => void;
  onDirtyChange: (dirty: boolean) => void;
  onRunningChange: (running: boolean) => void;
}) {
  const [images, setImages] = useState<Draft[]>([]),
    [step, setStep] = useState(0),
    [working, setWorking] = useState(false),
    [localRunning, setLocalRunning] = useState(false),
    [message, setMessage] = useState("");
  const [results, setResults] = useState<AnalysisResult[]>([]),
    [style, setStyle] = useState<StyleContent>(),
    [palette, setPalette] = useState<string[]>([]),
    [reviewed, setReviewed] = useState(false);
  const [semantic, setSemantic] = useState<{
      receipt: string;
      record: SemanticRecord;
    }>(),
    [status, setStatus] = useState<SemanticStatus>({
      state: "idle",
      message: "styleCreator.semanticIdle",
    }),
    [json, setJSON] = useState("");
  const worker = useRef<Worker | undefined>(undefined),
    serial = useRef(0),
    pending = useRef<((error: Error) => void) | undefined>(undefined),
    currentImages = useRef(images);
  currentImages.current = images;
  const running = status.state === "running",
    locked = busy || working || running;
  useEffect(
    () => onDirtyChange(images.length > 0),
    [images.length, onDirtyChange],
  );
  useEffect(
    () => onRunningChange(running || localRunning),
    [running, localRunning, onRunningChange],
  );
  useEffect(() => () => onRunningChange(false), [onRunningChange]);
  useEffect(
    () => () => {
      serial.current++;
      worker.current?.terminate();
      pending.current?.(new Error(tr("styleCreator.cancelled")));
      for (const image of currentImages.current)
        void window.laceframe.discardStyleImage(image.token);
    },
    [],
  );
  useEffect(() => {
    if (!running) return;
    let active = true;
    const timer = window.setInterval(() => {
      void value(window.laceframe.styleAnalysisStatus()).then(
        (next) => {
          if (!active) return;
          setStatus(next);
          if (next.state === "completed" && next.result && next.jobId) {
            setSemantic({ receipt: next.jobId, record: next.result });
            setImages((old) =>
              old.map((image, i) => ({
                ...image,
                role:
                  image.role ??
                  next.result!.result.references[i]?.suggestedRole,
              })),
            );
          }
        },
        (error) => {
          if (active) {
            setStatus({
              state: "failed",
              message: "styleCreator.semanticFailed",
            });
            setMessage(String(error));
          }
        },
      );
    }, 500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [running]);
  const refs = (): StyleDraftReference[] =>
    images.map(({ token, role, sourceNote }) => ({ token, role, sourceNote }));
  function invalidate() {
    setResults([]);
    setStyle(undefined);
    setSemantic(undefined);
    setReviewed(false);
    setStatus({ state: "idle", message: "styleCreator.semanticIdle" });
  }
  async function run(work: () => Promise<void>) {
    setWorking(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  }
  async function importImages(files?: File[], replaceToken?: string) {
    if (locked) return;
    await run(async () => {
      if (files?.some((f) => f.size > 8 * 1024 * 1024))
        throw new Error(tr("styleCreator.imageLimits"));
      const imported = await value(
        window.laceframe.importStyleImages({
          ...(files
            ? {
                files: await Promise.all(
                  files.map(async (f) => ({
                    name: f.name,
                    bytes: new Uint8Array(await f.arrayBuffer()),
                  })),
                ),
              }
            : {}),
          ...(replaceToken ? { replaceToken } : {}),
        }),
      );
      if (!imported) return;
      setImages((old) =>
        replaceToken
          ? old.flatMap((i) =>
              i.token === replaceToken
                ? imported.map((i) => ({ ...i, sourceNote: "" }))
                : i,
            )
          : [...old, ...imported.map((i) => ({ ...i, sourceNote: "" }))],
      );
      invalidate();
    });
  }
  function cancelLocal() {
    serial.current++;
    worker.current?.terminate();
    pending.current?.(new Error(tr("styleCreator.cancelled")));
    pending.current = undefined;
    setMessage(tr("styleCreator.cancelled"));
  }
  async function analyze() {
    setLocalRunning(true);
    try {
      await run(async () => {
        const stamp = ++serial.current,
          next: AnalysisResult[] = [];
        for (const [index, image] of images.entries()) {
          setMessage(
            tr("styleCreator.analyzing", {
              index: index + 1,
              count: images.length,
            }),
          );
          const source = await value(
            window.laceframe.styleDraftSource(image.token),
          );
          if (stamp !== serial.current)
            throw new Error(tr("styleCreator.cancelled"));
          const result = await new Promise<AnalysisResult>(
            (resolve, reject) => {
              const instance = new Worker(
                new URL("../workers/style-analysis.worker.ts", import.meta.url),
                { type: "module" },
              );
              worker.current = instance;
              pending.current = reject;
              instance.onmessage = (
                event: MessageEvent<Result<AnalysisResult>>,
              ) => {
                instance.terminate();
                pending.current = undefined;
                if (event.data.ok) resolve(event.data.value);
                else reject(new Error(event.data.error));
              };
              instance.onerror = () => {
                instance.terminate();
                pending.current = undefined;
                reject(new Error(tr("styleCreator.invalidImage")));
              };
              instance.postMessage(
                {
                  input: { id: image.token, type: image.role ?? "general" },
                  image: source,
                },
                [source.data.buffer],
              );
            },
          );
          next.push(result);
        }
        if (stamp !== serial.current) return;
        setResults(next);
        setStyle(proposeStyle(next, semantic?.record));
        setPalette(
          [
            ...new Set(
              next.flatMap((r) => r.metrics.palette.map((c) => c.hex)),
            ),
          ].slice(0, 24),
        );
        setReviewed(false);
        setStep(2);
        setMessage(tr("styleCreator.technicalReady"));
      });
    } finally {
      setLocalRunning(false);
    }
  }
  async function discard() {
    if (!window.confirm(tr("styleCreator.discardConfirm"))) return;
    await run(async () => {
      for (const i of images)
        await value(window.laceframe.discardStyleImage(i.token));
      setImages([]);
      invalidate();
      setStep(0);
    });
  }
  return (
    <section className="style-creator" aria-label={tr("styleCreator.title")}>
      <h3>{tr("styleCreator.title")}</h3>
      <p>{tr("styleCreator.intro")}</p>
      <nav className="studio-tabs" aria-label={tr("styleCreator.steps")}>
        {[
          "styleCreator.stepImport",
          "styleCreator.stepAnalyze",
          "styleCreator.stepReview",
          "styleCreator.stepSave",
        ].map((key, i) => (
          <button
            key={key}
            aria-current={step === i ? "step" : undefined}
            disabled={locked || (i > 0 && !images.length) || (i > 1 && !style)}
            onClick={() => setStep(i)}
          >
            {tr(key)}
          </button>
        ))}
      </nav>
      {message && <p role="status">{message}</p>}
      {(running || localRunning) &&
        document.getElementById("create-action-slot") &&
        createPortal(
          <div className="create-action-bar" role="status">
            <span>
              {tr(running ? status.message : "styleCreator.technical")}
            </span>
            <button
              onClick={() => {
                if (running)
                  void value(window.laceframe.cancelStyleAnalysis()).then(
                    setStatus,
                  );
                else cancelLocal();
              }}
            >
              {tr("styleCreator.cancel")}
            </button>
          </div>,
          document.getElementById("create-action-slot")!,
        )}
      <fieldset disabled={locked}>
        <div
          hidden={step !== 0}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void importImages(Array.from(event.dataTransfer.files));
          }}
        >
          <p>{tr("styleCreator.drop")}</p>
          <button
            disabled={images.length >= 6}
            onClick={() => void importImages()}
          >
            {tr("styleCreator.import")}
          </button>
          <p>{tr("styleCreator.count", { count: images.length })}</p>
          <div className="style-reference-grid">
            {images.map((image, index) => (
              <article key={image.token} className="style-reference-card">
                <img
                  src={image.preview}
                  alt={tr("styleCreator.reference", { index: index + 1 })}
                />
                <p>
                  {image.name} · {image.width}×{image.height}
                </p>
                <code>{image.sha256.slice(0, 12)}</code>
                {image.known && <p>{tr("styleCreator.known")}</p>}
                <label>
                  {tr("styleCreator.role", { index: index + 1 })}
                  <select
                    value={image.role ?? ""}
                    onChange={(e) => {
                      setImages((old) =>
                        old.map((i) =>
                          i.token === image.token
                            ? {
                                ...i,
                                role: (e.target.value ||
                                  undefined) as Draft["role"],
                              }
                            : i,
                        ),
                      );
                      setReviewed(false);
                    }}
                  >
                    <option value="">{tr("styleCreator.roleAutomatic")}</option>
                    {styleRoles.map((role) => (
                      <option key={role} value={role}>
                        {tr(roles[role])}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr("styleCreator.origin", { index: index + 1 })}
                  <input
                    maxLength={500}
                    value={image.sourceNote}
                    placeholder={tr("styleCreator.originHint")}
                    onChange={(e) =>
                      setImages((old) =>
                        old.map((i) =>
                          i.token === image.token
                            ? { ...i, sourceNote: e.target.value }
                            : i,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  onClick={() => void importImages(undefined, image.token)}
                >
                  {tr("styleCreator.replace", { index: index + 1 })}
                </button>
                <button
                  onClick={() =>
                    void run(async () => {
                      await value(
                        window.laceframe.discardStyleImage(image.token),
                      );
                      setImages((old) =>
                        old.filter((i) => i.token !== image.token),
                      );
                      invalidate();
                    })
                  }
                >
                  {tr("styleCreator.remove", { index: index + 1 })}
                </button>
              </article>
            ))}
          </div>
          <button disabled={!images.length} onClick={() => setStep(1)}>
            {tr("styleCreator.next")}
          </button>
        </div>
        <div hidden={step !== 1}>
          <h4>{tr("styleCreator.technical")}</h4>
          <p>{tr("styleCreator.technicalHint")}</p>
          <button disabled={!images.length} onClick={() => void analyze()}>
            {tr("styleCreator.analyze")}
          </button>
          <h4>{tr("styleCreator.semantic")}</h4>
          <p>{tr("styleCreator.semanticHint")}</p>
          <p role="status">
            {tr(status.message)} {status.model}
          </p>
          <button
            onClick={() =>
              void run(async () =>
                setStatus(await value(window.laceframe.checkStyleAnalysis())),
              )
            }
          >
            {tr("styleCreator.check")}
          </button>
          <p>{tr("styleCreator.transmission", { count: images.length })}</p>
          <button
            disabled={status.state !== "ready" || !images.length}
            onClick={() =>
              void run(async () =>
                setStatus(
                  await value(window.laceframe.startStyleAnalysis(refs())),
                ),
              )
            }
          >
            {tr("styleCreator.nativeAnalyze")}
          </button>
          <details>
            <summary>{tr("styleCreator.importSemantic")}</summary>
            <p>{tr("styleCreator.manualHint")}</p>
            <details>
              <summary>{tr("styleCreator.contract")}</summary>
              <pre>
                {JSON.stringify(
                  {
                    hashes: images.map((i) => i.sha256),
                    schema: z.toJSONSchema(semanticResponseSchema),
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            <label>
              {tr("styleCreator.manualJSON")}
              <textarea
                value={json}
                maxLength={128 * 1024}
                onChange={(e) => setJSON(e.target.value)}
              />
            </label>
            <button
              disabled={!json}
              onClick={() =>
                void run(async () => {
                  setSemantic(
                    await value(
                      window.laceframe.importStyleSemantic({
                        json,
                        references: refs(),
                      }),
                    ),
                  );
                  setMessage(tr("styleCreator.semanticCompleted"));
                })
              }
            >
              {tr("styleCreator.applyJSON")}
            </button>
          </details>
          {semantic && (
            <p>
              {semantic.record.provider} ·{" "}
              {semantic.record.model ?? tr("styleCreator.importSemantic")}
            </p>
          )}
          {style && (
            <button onClick={() => setStep(2)}>
              {tr("styleCreator.next")}
            </button>
          )}
        </div>
        {style && (
          <div hidden={step < 2}>
            <p>{tr("styleCreator.reviewHint")}</p>
            <div className="style-reference-grid">
              {images.map((image, index) => (
                <figure key={image.token}>
                  <img
                    className="style-review-image"
                    src={image.preview}
                    alt={tr("styleCreator.reference", { index: index + 1 })}
                  />
                  <figcaption>{image.name}</figcaption>
                </figure>
              ))}
            </div>
            <label>
              {tr("styleCreator.name")}
              <input
                maxLength={120}
                value={style.name}
                onChange={(e) => {
                  setStyle({ ...style, name: e.target.value });
                  setReviewed(false);
                }}
              />
            </label>
            <label>
              {tr("styleCreator.description")}
              <textarea
                maxLength={4000}
                value={style.intent}
                onChange={(e) => {
                  setStyle({ ...style, intent: e.target.value });
                  setReviewed(false);
                }}
              />
            </label>
            <details>
              <summary>{tr("styleCreator.renderingRules")}</summary>
              {Object.entries(fields).map(([field, key]) => (
                <label key={field}>
                  {tr(key)}
                  <textarea
                    maxLength={2400}
                    value={style[field as keyof typeof fields]}
                    onChange={(e) => {
                      setStyle({ ...style, [field]: e.target.value });
                      setReviewed(false);
                    }}
                  />
                  <button
                    onClick={() => {
                      setStyle({ ...style, [field]: "" });
                      setReviewed(false);
                    }}
                  >
                    {tr("styleCreator.keep", { field: tr(key) })} ×
                  </button>
                </label>
              ))}
              {(["positiveRules", "negativeRules"] as const).map((field) => (
                <label key={field}>
                  {tr(
                    field === "positiveRules"
                      ? "styleCreator.positiveRules"
                      : "styleCreator.negativeRules",
                  )}
                  <textarea
                    value={style[field].join("\n")}
                    onChange={(e) => {
                      setStyle({
                        ...style,
                        [field]: e.target.value.split("\n").filter(Boolean),
                      });
                      setReviewed(false);
                    }}
                  />
                </label>
              ))}
              {style.additionalRules.map((rule, index) => (
                <label key={index}>
                  {rule.label}
                  <textarea
                    value={rule.text}
                    onChange={(e) => {
                      setStyle({
                        ...style,
                        additionalRules: style.additionalRules.map((r, i) =>
                          i === index ? { ...r, text: e.target.value } : r,
                        ),
                      });
                      setReviewed(false);
                    }}
                  />
                </label>
              ))}
            </details>
            <h4>{tr("styleCreator.palette")}</h4>
            <p>{tr("styleCreator.paletteHint")}</p>
            <div className="palette-row">
              {palette.map((color, index) => (
                <label key={index}>
                  {tr("styleCreator.paletteColor", { index: index + 1 })}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) =>
                      setPalette((old) =>
                        old.map((c, i) => (i === index ? e.target.value : c)),
                      )
                    }
                  />
                  <button
                    onClick={() =>
                      setPalette((old) => old.filter((_, i) => i !== index))
                    }
                  >
                    {tr("styleCreator.removeColor", { index: index + 1 })}
                  </button>
                </label>
              ))}
            </div>
            <button
              disabled={palette.length >= 24}
              onClick={() => setPalette((old) => [...old, "#808080"])}
            >
              {tr("styleCreator.addColor")}
            </button>
            <h4>{tr("styleCreator.sourcePalette")}</h4>
            <div className="palette-row">
              {[
                ...new Set(
                  results.flatMap((r) => r.metrics.palette.map((c) => c.hex)),
                ),
              ].map((color) => (
                <button
                  key={color}
                  style={{ borderColor: color, color }}
                  onClick={() =>
                    setPalette((old) =>
                      old.includes(color) || old.length >= 24
                        ? old
                        : [...old, color],
                    )
                  }
                >
                  {color}
                </button>
              ))}
            </div>
            {semantic ? (
              <>
                <h4>{tr("styleCreator.observations")}</h4>
                {semantic.record.result.observations.map((o, i) => (
                  <p key={i}>
                    {o.text} · {tr("styleCreator.evidence")}: {o.evidence}
                  </p>
                ))}
                <h4>{tr("styleCreator.interpretations")}</h4>
                {semantic.record.result.interpretations.map((o, i) => (
                  <p key={i}>
                    {tr(
                      o.kind === "mood"
                        ? "styleCreator.mood"
                        : "styleCreator.genre",
                    )}
                    : {o.label} ·{" "}
                    {tr(
                      o.confidence === "strong"
                        ? "styleCreator.strong"
                        : o.confidence === "plausible"
                          ? "styleCreator.plausible"
                          : "styleCreator.uncertain",
                    )}{" "}
                    · {o.evidence}
                  </p>
                ))}
                {semantic.record.result.limitations.map((text, i) => (
                  <p key={i}>{text}</p>
                ))}
              </>
            ) : (
              <p>{tr("styleCreator.noSemantic")}</p>
            )}
            <button
              onClick={() => {
                setStyle(proposeStyle(results, semantic?.record));
                setReviewed(false);
              }}
            >
              {tr("styleCreator.resetProposal")}
            </button>
            <details>
              <summary>{tr("styleCreator.expert")}</summary>
              <pre>{JSON.stringify(results, null, 2)}</pre>
            </details>
            <label>
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              {tr("styleCreator.scopeReviewed")}
            </label>
            <button
              disabled={!reviewed || !style.name.trim()}
              onClick={() =>
                void run(async () => {
                  const content = styleWithReview(style, {
                    results,
                    roles: images.map((i) => ({
                      sha256: i.sha256,
                      role: i.role ?? "general",
                      sourceNote: i.sourceNote,
                    })),
                    palette,
                    semantic: semantic?.record,
                  });
                  const snapshot = await value(
                    window.laceframe.command({
                      type: "createStylePreset",
                      references: refs(),
                      style: content,
                      scopeReviewed: true,
                      ...(semantic
                        ? { semanticReceipt: semantic.receipt }
                        : {}),
                    }),
                  );
                  setImages([]);
                  invalidate();
                  setStep(0);
                  setMessage(tr("styleCreator.saved"));
                  onSaved(snapshot);
                })
              }
            >
              {tr("styleCreator.save")}
            </button>
          </div>
        )}
        <button disabled={!images.length} onClick={() => void discard()}>
          {tr("styleCreator.discard")}
        </button>
      </fieldset>
    </section>
  );
}
