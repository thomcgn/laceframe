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
      <summary>Stilmetriken vergleichen · manuelle Prüfung</summary>
      {!records.length ? (
        <p>
          Noch keine geprüfte Stilanalyse gespeichert. Zuerst Art Direction →
          Stil analysieren.
        </p>
      ) : (
        <>
          <label>
            Geprüfter Referenzsatz
            <select
              aria-label="Vergleich Stilanalyse"
              disabled={running}
              value={record?.id ?? ""}
              onChange={(e) => setAnalysisId(e.target.value)}
            >
              {records.map((a) => (
                <option key={a.id} value={a.id}>
                  {p.artDirections.find((s) => s.id === a.profileId)?.name} · V
                  {a.profileRevision}
                </option>
              ))}
            </select>
          </label>
          <label>
            Referenz im Satz
            <select
              aria-label="Vergleich Stilreferenz"
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
              Charakterasset
              <select
                aria-label="Stilvergleich Charakterasset"
                disabled={running}
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
              >
                <option value="">Asset auswählen …</option>
                {candidates.map((a) => (
                  <option key={a.id} value={a.id}>
                    {p.characters.find((c) => c.id === a.characterId)?.name} ·{" "}
                    {"locked" in a
                      ? `Master V${a.version}`
                      : "sourceId" in a
                        ? "Qualitätsversion"
                        : "attemptId" in a
                          ? "Kandidat / Expression"
                          : "Asset"}{" "}
                    · {a.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset disabled={running}>
            <legend>
              Kandidatenbereich · gleiche Bildregion manuell wählen
            </legend>
            <label>
              Kandidatentyp
              <select
                aria-label="Vergleich Kandidatentyp"
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
                <label key={key}>
                  {key}
                  <input
                    aria-label={`Vergleich ROI ${key}`}
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
              setStatus("Vergleich wird lokal gemessen …");
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
                    setStatus("Gemessen. Keine automatische Freigabe.");
                  } else setStatus(e.data.error);
                };
                worker.onerror = () => {
                  stop();
                  setStatus("Vergleichsworker fehlgeschlagen");
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
                    e instanceof Error ? e.message : "Vergleich fehlgeschlagen",
                  );
                }
              }
            }}
          >
            Stilabweichungen messen
          </button>
          {running && (
            <button
              onClick={() => {
                stop();
                setStatus("Vergleich abgebrochen");
              }}
            >
              Stilvergleich abbrechen
            </button>
          )}
          <p role="status" aria-label="Stilvergleich-Status">
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
              beforeLabel="Stilreferenz"
              previewPrefix="Stilanalyse"
            />
          )}
          {comparison && result && (
            <>
              {reference?.type !== result.type && (
                <p className="warning">
                  Unterschiedliche Referenztypen · nicht direkt vergleichbar.
                  Keine Portraitregeln aus Environment-Metriken ableiten.
                </p>
              )}
              <table>
                <thead>
                  <tr>
                    <th>Messwert</th>
                    <th>Referenz</th>
                    <th>Kandidat</th>
                    <th>Δ Kandidat − Referenz</th>
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
                        {d.hex} (2-bit RGB, vollständige Verteilung)
                      </td>
                      <td>{d.reference.toFixed(3)}</td>
                      <td>{d.candidate.toFixed(3)}</td>
                      <td>{(d.candidate - d.reference).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Detail-Δ bei Schritt 1 / 2 / 4:{" "}
                {comparison.detailDelta.map((v) => v.toFixed(3)).join(" / ")}
              </p>
              {comparison.warnings.map((w) => (
                <p className="warning" key={w}>
                  {w}
                </p>
              ))}
            </>
          )}
        </>
      )}
    </details>
  );
}
