import { uiLabel } from "../../shared/locales";
import { displayMessage } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
import { useEffect, useRef, useState } from "react";
import type { Project } from "../../shared/domain";
import {
  compareStyle,
  referenceTypes,
  referenceLabels,
  type AnalysisResult,
  type AnalysisInput,
} from "../../shared/style-analysis";
import { MasterCandidateCompare } from "./MasterCandidateCompare";
export function StyleComparison({
  project,
  profileId,
  sourceId,
}: {
  project: Project;
  profileId?: string;
  sourceId?: string;
}) {
  const p = project,
    records = p.styleAnalyses.filter(
      (a) => !profileId || a.profileId === profileId,
    );
  const [analysisId, setAnalysisId] = useState(records.at(-1)?.id ?? ""),
    [referenceId, setReferenceId] = useState("");
  const record = records.find((a) => a.id === analysisId) ?? records.at(-1),
    reference =
      record?.references.find((r) => r.id === referenceId) ??
      record?.references[0];
  const candidates = [
    ...p.masters,
    ...p.masterCandidates,
    ...p.assets,
    ...p.qualityAssets,
  ];
  const [candidateId, setCandidateId] = useState(sourceId ?? ""),
    [type, setType] = useState<AnalysisInput["type"]>("portrait"),
    [roi, setRoi] = useState({ x: 0, y: 0, width: 1, height: 1 });
  const candidate = candidates.find((a) => a.id === (sourceId ?? candidateId));
  const [result, setResult] = useState<AnalysisResult>(),
    [status, setStatus] = useState(""),
    [running, setRunning] = useState(false);
  const job = useRef<{ serial: number; worker?: Worker }>({ serial: 0 });
  const stop = () => {
    job.current.serial++;
    job.current.worker?.terminate();
    job.current.worker = undefined;
    setRunning(false);
  };
  useEffect(() => {
    stop();
    setResult(undefined);
    setRoi({
      x: 0,
      y: 0,
      width: candidate?.width ?? 1,
      height: candidate?.height ?? 1,
    });
  }, [candidate?.id]);
  useEffect(
    () => () => {
      job.current.serial++;
      job.current.worker?.terminate();
    },
    [],
  );
  const comparison =
    reference && result
      ? compareStyle(reference.metrics, result.metrics)
      : undefined;
  return (
    <details className="analysis-comparison">
      <summary>{tr("styles.m54845edc9f")}</summary>
      {!records.length ? (
        <p>{tr("styles.m9f6b2949e5")}</p>
      ) : (
        <>
          <label>
            {tr("styles.m865f8d78ba")}
            <select
              aria-label={tr("styles.m7b36f72ff9")}
              disabled={running}
              value={record?.id ?? ""}
              onChange={(e) => setAnalysisId(e.target.value)}
            >
              {records.map((a) => (
                <option key={a.id} value={a.id}>
                  {p.artDirections.find((s) => s.id === a.profileId)?.name}{" "}
                  {tr("styles.m0ca423fba8")}
                  {a.profileRevision}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("styles.m78e9515a47")}
            <select
              aria-label={tr("styles.m6d5f08e2e8")}
              value={reference?.id ?? ""}
              onChange={(e) => setReferenceId(e.target.value)}
            >
              {record?.references.map((r) => (
                <option key={r.id} value={r.id}>
                  {referenceLabels[r.type]} · {r.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          {!sourceId && (
            <label>
              {tr("styles.ma128f80337")}
              <select
                aria-label={tr("styles.m71919ff39c")}
                disabled={running}
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
              >
                <option value="">{tr("styles.m34178f4801")}</option>
                {candidates.map((a) => (
                  <option key={a.id} value={a.id}>
                    {p.characters.find((c) => c.id === a.characterId)?.name} ·{" "}
                    {"locked" in a
                      ? tr("styles.mf483464116", { v0: a.version })
                      : "sourceId" in a
                        ? tr("styles.m32acc49c2f")
                        : "attemptId" in a
                          ? tr("styles.m2745b0e2cb")
                          : tr("styles.m80d298c9f2")}{" "}
                    · {a.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset disabled={running}>
            <legend>{tr("styles.mc20879a8c0")}</legend>
            <label>
              {tr("styles.m4a94ee72ee")}
              <select
                aria-label={tr("styles.m23bab419ae")}
                value={type}
                onChange={(e) => {
                  setType(e.target.value as AnalysisInput["type"]);
                  setResult(undefined);
                }}
              >
                {referenceTypes.map((t) => (
                  <option value={t} key={t}>
                    {referenceLabels[t]}
                  </option>
                ))}
              </select>
            </label>
            <div className="inspector-options">
              {(["x", "y", "width", "height"] as const).map((key) => (
                <label key={uiLabel(key)}>
                  {uiLabel(key)}
                  <input
                    aria-label={tr("styles.ma0e8e5117b", { v0: key })}
                    type="number"
                    min={key === "x" || key === "y" ? 0 : 1}
                    value={roi[key]}
                    onChange={(e) => {
                      setRoi({ ...roi, [key]: Number(e.target.value) });
                      setResult(undefined);
                    }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <button
            disabled={!candidate || running}
            onClick={async () => {
              if (!candidate) return;
              stop();
              const serial = job.current.serial;
              setRunning(true);
              setResult(undefined);
              setStatus(tr("styles.m109901d534"));
              try {
                const pixels = await window.laceframe.analysisSource(
                  candidate.id,
                );
                if (serial !== job.current.serial) return;
                if (!pixels.ok) throw new Error(pixels.error);
                const worker = new Worker(
                  new URL(
                    "../workers/style-analysis.worker.ts",
                    import.meta.url,
                  ),
                  { type: "module" },
                );
                job.current.worker = worker;
                worker.onmessage = (
                  e: MessageEvent<{
                    ok: boolean;
                    value: AnalysisResult;
                    error: string;
                  }>,
                ) => {
                  if (serial !== job.current.serial) return;
                  worker.terminate();
                  job.current.worker = undefined;
                  setRunning(false);
                  if (e.data.ok) {
                    setResult(e.data.value);
                    setStatus(tr("styles.mecbbc2a5c4"));
                  } else setStatus(e.data.error);
                };
                worker.onerror = () => {
                  stop();
                  setStatus(tr("styles.m5a529db986"));
                };
                worker.postMessage(
                  {
                    input: { id: candidate.id, type, roi },
                    image: pixels.value,
                  },
                  [pixels.value.data.buffer],
                );
              } catch (e) {
                if (serial === job.current.serial) {
                  setRunning(false);
                  setStatus(
                    e instanceof Error ? e.message : tr("styles.m138d9c9a2f"),
                  );
                }
              }
            }}
          >
            {tr("styles.m50ab0bbffe")}
          </button>
          {running && (
            <button
              onClick={() => {
                stop();
                setStatus(tr("styles.m76d637326b"));
              }}
            >
              {tr("styles.mfe30f43bb3")}
            </button>
          )}
          <p role="status" aria-label={tr("styles.mae7c7283f3")}>
            {status}
          </p>
          {reference && candidate && (
            <MasterCandidateCompare
              master={{
                id: reference.id,
                width: reference.metrics.width,
                height: reference.metrics.height,
              }}
              candidate={candidate}
              beforeLabel={tr("styles.md7f9a116bd")}
              previewPrefix={tr("styles.ma91ef6dc3c")}
            />
          )}
          {comparison && result && (
            <>
              {reference?.type !== result.type && (
                <p className="warning">{tr("styles.m551fa33da0")}</p>
              )}
              <table>
                <thead>
                  <tr>
                    <th>{tr("styles.maf7b439bd1")}</th>
                    <th>{tr("styles.me131139872")}</th>
                    <th>{tr("styles.m3c49ac4c54")}</th>
                    <th>{tr("styles.md2ff0a43b7")}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.deltas.map((d) => (
                    <tr key={d.key}>
                      <td>{d.key}</td>
                      <td>{d.reference.toFixed(3)}</td>
                      <td>{d.candidate.toFixed(3)}</td>
                      <td>{d.delta.toFixed(3)}</td>
                    </tr>
                  ))}
                  {comparison.paletteDistance.map((d) => (
                    <tr key={d.hex}>
                      <td>
                        <i style={{ background: d.hex }} />
                        {d.hex} {tr("styles.m987d0af022")}
                      </td>
                      <td>{d.reference.toFixed(3)}</td>
                      <td>{d.candidate.toFixed(3)}</td>
                      <td>{(d.candidate - d.reference).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                {tr("styles.mbcfab2dd74")}{" "}
                {comparison.detailDelta.map((v) => v.toFixed(3)).join(" / ")}
              </p>
              {comparison.warnings.map((w) => (
                <p className="warning" key={displayMessage(w)}>
                  {displayMessage(w)}
                </p>
              ))}
            </>
          )}
        </>
      )}
    </details>
  );
}
