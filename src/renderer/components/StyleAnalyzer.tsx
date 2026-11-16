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
  renderRules: "Rendering",
  colorRules: "Color",
  lightingRules: "Lighting",
  framingRules: "Framing",
  constraints: "Constraints",
};
const percent = (n: number) => `${(n * 100).toFixed(1)} %`;
export function MetricSummary({ m }: { m: StyleMetrics }) {
  return (
    <div className="analysis-metrics">
      <dl>
        <dt>Native Dimensionen / ROI</dt>
        <dd>
          {m.width} × {m.height} / {m.roi.width} × {m.roi.height} bei {m.roi.x},{" "}
          {m.roi.y}
        </dd>
        <dt>Sichtbar / Teilalpha</dt>
        <dd>
          {m.visible} · {percent(m.visibleFraction)} /{" "}
          {percent(m.partialFraction)}
        </dd>
        <dt>Exakte RGB-Farben</dt>
        <dd>{m.uniqueColors}</dd>
        <dt>Helligkeit / Kontrastspanne / HSV-Sättigung</dt>
        <dd>
          {m.meanLuminance.toFixed(3)} / {m.contrast.toFixed(3)} /{" "}
          {m.saturation.toFixed(3)}
        </dd>
        <dt>Warm / kühl / neutral (R gegenüber B)</dt>
        <dd>
          {percent(m.warmFraction)} / {percent(m.coolFraction)} /{" "}
          {percent(Math.max(0, 1 - m.warmFraction - m.coolFraction))}
        </dd>
        <dt>8px-Blockgrenze minus innere Kantenkontraste</dt>
        <dd>
          {m.blockBoundaryDifference8.toFixed(3)} · periodischer Indikator, kein
          Kompressionsnachweis
        </dd>
        <dt>Identische Nachbarn H / V</dt>
        <dd>
          {percent(m.identicalHorizontal)} / {percent(m.identicalVertical)}
        </dd>
        <dt>Farbwechsel / mittlerer RGB-Kantensprung</dt>
        <dd>
          {percent(m.edgeDensity)} / {m.meanEdgeContrast.toFixed(3)}
        </dd>
        <dt>Harte / ähnliche Übergänge</dt>
        <dd>
          {percent(m.hardTransitions)} / {percent(m.similarTransitions)}
        </dd>
        <dt>Diagonale Eckpaare / Dither-ähnliche 2×2-Muster</dt>
        <dd>
          {percent(m.diagonalPairs)} / {percent(m.ditherLike)}
        </dd>
        <dt>Run-Rasterkandidat</dt>
        <dd>
          {m.gridCandidate
            ? `${m.gridCandidate} px · ${percent(m.gridEvidence)} Run-Evidenz`
            : "Nicht bestätigt"}
          . Virtuelle Originalauflösung: unbekannt.
        </dd>
        <dt>Farbwechsel bei Abtastschritten 1 / 2 / 4</dt>
        <dd>{m.detailByStep.map(percent).join(" / ")}</dd>
      </dl>
      <div className="analysis-palette">
        {m.palette.map((c) => (
          <span
            key={c.hex}
            title={`${c.hex} · ${c.count} Pixel · ${percent(c.fraction)}`}
          >
            <i style={{ background: c.hex }} />
            {c.hex}
            <small>{percent(c.fraction)}</small>
          </span>
        ))}
      </div>
      <details>
        <summary>Helligkeitsverteilung, Regionen und Run-Längen</summary>
        <div className="analysis-hist" aria-label="Helligkeitsverteilung">
          {m.luminance.map((n, i) => (
            <span
              key={i}
              title={`Bin ${i}: ${n}`}
              style={{
                height: `${Math.max(1, (60 * n) / Math.max(1, ...m.luminance))}px`,
              }}
            />
          ))}
        </div>
        <p>Quadranten in ROI-Koordinaten; keine Gesichtserkennung:</p>
        <table>
          <thead>
            <tr>
              <th>Region</th>
              <th>Sichtbar</th>
              <th>Farbwechsel</th>
              <th>Helligkeit</th>
            </tr>
          </thead>
          <tbody>
            {m.quadrants.map((q, i) => (
              <tr key={i}>
                <td>
                  {
                    [
                      "oben links",
                      "oben rechts",
                      "unten links",
                      "unten rechts",
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
          Horizontale + vertikale Run-Längen (32 = ≥32):{" "}
          {m.runGroups
            .map((n, i) => (n ? `${i}px: ${n}` : ""))
            .filter(Boolean)
            .join(" · ")}
        </p>
      </details>
      {m.warnings.map((w) => (
        <p className="muted" key={w}>
          {w}
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
    ...p.styleAssets.map((a) => ({ ...a, label: `Stil: ${a.name}` })),
    ...p.masters.map((a) => ({
      ...a,
      label: `Master V${a.version}: ${p.characters.find((c) => c.id === a.characterId)?.name}`,
    })),
    ...p.masterCandidates.map((a) => ({
      ...a,
      label: `Masterkandidat: ${a.id.slice(0, 8)} · ${a.status}`,
    })),
    ...p.assets.map((a) => ({
      ...a,
      label: `Expression: ${a.id.slice(0, 8)} · ${a.status}`,
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
    job.current.reject?.(
      new Error("Analyse abgebrochen. Keine Revision gespeichert."),
    );
    job.current.worker = undefined;
    job.current.reject = undefined;
    setRunning(false);
  };
  useEffect(
    () => () => {
      job.current.serial++;
      job.current.worker?.terminate();
      job.current.reject?.(new Error("Analyse geschlossen"));
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
    setStatus("Referenzen werden geprüft …");
    setRevision(profile.revision);
    const next: AnalysisResult[] = [];
    try {
      for (const [index, input] of inputs.entries()) {
        setStatus(
          `Referenz ${index + 1} von ${inputs.length}: prüfen und messen …`,
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
          worker.onerror = () =>
            reject(new Error("Analyse-Worker fehlgeschlagen"));
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
      setStatus(
        "Analyse abgeschlossen. Regeln prüfen; noch keine Stilrevision gespeichert.",
      );
    } catch (e) {
      if (serial === job.current.serial)
        setStatus(e instanceof Error ? e.message : "Analyse fehlgeschlagen");
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
    <section className="style-analyzer" aria-label="Stil analysieren">
      <h3>Stil analysieren</h3>
      <p>Referenzen → Analyse → Ergebnisse → Regeln → Freigabe</p>
      <p className="muted">
        Lokale deterministische Messung · kein Modell, kein Stil- oder
        Identitätsbeweis. Nur Bilder verwenden, für deren Analyse und Nutzung du
        die Rechte hast. PNG/WebP; höchstens sechs Referenzen und 4 Megapixel
        pro Bild. Keine Originale werden verändert.
      </p>
      <div
        className="analysis-steps"
        role="group"
        aria-label="Analyse-Schritte"
      >
        {(
          [
            ["references", "1 · Referenzen"],
            ["results", "2 · Ergebnisse"],
            ["rules", "3 · Regeln"],
            ["approval", "4 · Freigabe"],
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
            {label}
          </button>
        ))}
      </div>
      <fieldset hidden={step !== "references"} disabled={blocked}>
        <legend>1 · Referenzen und Bildbereiche</legend>
        <label>
          Neue PNG/WebP-Referenzen importieren
          <input
            aria-label="Analysereferenzen importieren"
            type="file"
            accept="image/png,image/webp"
            multiple
            disabled={(profile.styleReferenceIds?.length ?? 0) >= 6}
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (!files.length) return;
              if (files.length + (profile.styleReferenceIds?.length ?? 0) > 6) {
                setStatus("Maximal sechs Stilreferenzen pro Profilrevision.");
                return;
              }
              setSaving(true);
              const added: AnalysisInput[] = [];
              await perform(
                async () => {
                  try {
                    for (const file of files) {
                      if (file.size > 8 * 1024 * 1024)
                        throw new Error("Maximal 8 MiB pro Stilreferenz.");
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
                    setStatus("Referenzen importiert. Typen und ROI prüfen.");
                  } catch (error) {
                    setStatus(
                      error instanceof Error
                        ? error.message
                        : "Import fehlgeschlagen",
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
          Referenz hinzufügen
          <select
            aria-label="Analysereferenz hinzufügen"
            value=""
            disabled={inputs.length >= 6}
            onChange={(e) =>
              change([...inputs, { id: e.target.value, type: "portrait" }])
            }
          >
            <option value="">Vorhandenes Bild auswählen …</option>
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
                    ? " · über 4 MP"
                    : ""}
                </option>
              ))}
          </select>
        </label>
        <p className="muted">
          Neue Bilder über die Stilreferenzen oben importieren; vorhandene
          freigegebene Master können direkt ausgewählt werden. ROI blendet
          dominante Hintergründe aus, erkennt aber keine Bildsemantik.
        </p>
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
                caption={`Analyse ${index + 1} · ${source.label}`}
                zoom="fit"
              />
              <div>
                <label>
                  Referenztyp {index + 1}
                  <select
                    aria-label={`Referenztyp ${index + 1}`}
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
                  <summary>ROI · nativer Bildausschnitt</summary>
                  <div className="inspector-options">
                    {(["x", "y", "width", "height"] as const).map((key) => (
                      <label key={key}>
                        {key}
                        <input
                          aria-label={`ROI ${index + 1} ${key}`}
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
                    Vollbild für Referenz {index + 1}
                  </button>
                </details>
                <button
                  onClick={() =>
                    change(inputs.filter((r) => r.id !== input.id))
                  }
                >
                  Analysereferenz {index + 1} ausschließen
                </button>
              </div>
            </div>
          );
        })}
        <button disabled={!inputs.length} onClick={() => void analyze()}>
          Lokal analysieren
        </button>
      </fieldset>
      {running && (
        <button
          onClick={() => {
            stop();
            setStatus("Analyse abgebrochen. Keine Revision gespeichert.");
          }}
        >
          Analyse abbrechen
        </button>
      )}
      <p role="status" aria-label="Stilanalyse-Status">
        {status}
      </p>
      <label>
        Historische Analyse
        <select
          aria-label="Historische Analyse"
          disabled={blocked}
          value={history}
          onChange={(e) => {
            if (
              dirty &&
              !window.confirm("Ungespeicherte Analyseänderungen verwerfen?")
            )
              return;
            setHistory(e.target.value);
            if (e.target.value) setStep("rules");
            setDirty(false);
          }}
        >
          <option value="">Aktuelle Messung</option>
          {p.styleAnalyses
            .filter((a) => a.profileId === profileId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                Stil V{a.profileRevision} · {a.createdAt} · {a.id.slice(0, 8)}
              </option>
            ))}
        </select>
      </label>
      {archived && (
        <p className="warning">
          Historische Analyse und Benutzerkorrekturen sind unveränderlich. Für
          Änderungen Referenzen wählen und erneut analysieren.
        </p>
      )}
      {!!shown.length && (
        <>
          <div hidden={step !== "results"}>
            <h4>2 · Ergebnisse nach Referenztyp</h4>
            {shown.map((r, i) => {
              const peers = shown.filter((p) => p.type === r.type);
              const mean =
                peers.reduce((s, p) => s + p.metrics.edgeDensity, 0) /
                peers.length;
              return (
                <details key={r.id} open={i === 0}>
                  <summary>
                    {referenceLabels[r.type]} · {r.id.slice(0, 8)} · SHA{" "}
                    {r.sha256.slice(0, 12)}
                    {peers.length > 1 &&
                    Math.abs(r.metrics.edgeDensity - mean) > 0.15
                      ? " · möglicher Detail-Ausreißer"
                      : ""}
                  </summary>
                  <MetricSummary m={r.metrics} />
                </details>
              );
            })}
            <button onClick={() => setStep("rules")}>Regeln prüfen</button>
          </div>
          <div hidden={step !== "rules"}>
            <h4>3 · Regeln prüfen und bearbeiten</h4>
            <p className="muted">
              Vorschläge bleiben auf ihren Referenztyp begrenzt. Palette ist
              eine Prüfhilfe, kein Ersatz für Haut-, Haar- oder Outfitfarben.
              Künstlerische Materialabsicht bitte manuell ergänzen.
            </p>
            <fieldset disabled={blocked || !!archived}>
              {suggestions.map((s, i) => (
                <details key={s.key} open={i === 0}>
                  <summary>
                    {groupLabels[s.group]} · {s.key.split(":")[0]}
                  </summary>
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`Regel aktiv ${s.key}`}
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
                    Übernehmen
                  </label>
                  <textarea
                    aria-label={`Regeltext ${s.key}`}
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
                  <p className="muted">Messgrundlage: {s.evidence}</p>
                </details>
              ))}
              <div className="analysis-palette">
                {correction.palette.map((hex, i) => (
                  <label key={i}>
                    Farbe {i + 1}
                    <input
                      aria-label={`Prüfpalette ${i + 1}`}
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
                Prüfpalette nicht übernehmen
              </button>
              <label>
                Eigene künstlerische Regeln
                <textarea
                  aria-label="Eigene künstlerische Regeln"
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
              <button onClick={() => setStep("approval")}>Zur Freigabe</button>
            )}
          </div>
          {!archived && (
            <div hidden={step !== "approval"}>
              <h4>4 · Freigabe als neue Stilrevision</h4>
              <p>
                Übernimmt die geprüften Regeln und ausgewählten Bilder als neue
                Stilrevision. Master werden unverändert als separate
                Stilreferenzen kopiert. ROI gilt nur für Messwerte; die
                Generierung erhält vollständige Stilbilder. Identitäten,
                Outfits, Master und historische Prompts bleiben unverändert.
                Anschließend im Studio als Stil auswählen.
              </p>
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
                        setStatus(
                          "Analyse bestätigt und neue Stilrevision gespeichert.",
                        );
                      },
                    );
                  } catch (e) {
                    setStatus(
                      e instanceof Error
                        ? e.message
                        : "Speichern fehlgeschlagen",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Geprüfte Regeln als Stilrevision übernehmen
              </button>
              {revision !== profile.revision && (
                <p className="warning">
                  Stilrevision geändert. Vor der Übernahme erneut analysieren.
                </p>
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
