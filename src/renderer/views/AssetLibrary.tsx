import { tr } from "../../shared/locales/index";
import { MasterApproval } from "../components/MasterApproval";
import { useState } from "react";
import type { Snapshot, Command } from "../../shared/domain";
import {
  libraryAssets,
  libraryMasterId,
  type StudioIntent,
} from "../../shared/studio";
import { MasterCandidateCompare } from "../components/MasterCandidateCompare";
import { AssetQuality } from "../components/AssetQuality";
export function AssetLibrary({
  snapshot,
  selectedId,
  onSelect,
  onSnapshot,
  onStudio,
  disabled,
  command,
}: {
  snapshot: Snapshot;
  selectedId?: string;
  onSelect: (id: string) => void;
  onSnapshot: (s: Snapshot) => void;
  onStudio: (intent: Omit<StudioIntent, "serial">) => void;
  disabled: boolean;
  command: (command: Command, notice?: string) => void;
}) {
  const p = snapshot.project,
    characterId = p.selectedCharacterId ?? "",
    entries = libraryAssets(p, characterId);
  const [cutoutRequested, setCutoutRequested] = useState(0);
  const [kind, setKind] = useState("all"),
    [state, setState] = useState("all");
  const selected = entries.find((a) => a.id === selectedId),
    filtered = entries.filter(
      (a) =>
        (kind === "all" || a.kind === kind) &&
        (state === "all" || a.state === state),
    );
  const asset = selected ?? filtered.at(-1);
  const raw = asset?.kind === "quality" ? asset : undefined;
  const masterId = asset ? libraryMasterId(p, asset.id) : undefined;
  const before =
    asset?.kind === "master"
      ? p.masters.find((m) => m.id === asset.previousMasterId)
      : asset?.kind === "expression"
        ? p.masters.find((m) => m.id === asset.masterId)
        : raw
          ? [
              ...p.masters,
              ...p.assets,
              ...p.masterCandidates,
              ...p.qualityAssets,
            ].find((a) => a.id === raw.sourceId)
          : asset?.kind === "master-candidate"
            ? p.identityAssets.find(
                (a) =>
                  a.id ===
                  p.masterAttempts.find((t) => t.id === asset.attemptId)
                    ?.identityReferences[0]?.id,
              )
            : undefined;
  const attempt =
    asset && "attemptId" in asset
      ? [...p.attempts, ...p.masterAttempts].find(
          (a) => a.id === asset.attemptId,
        )
      : undefined;
  const hardRaw =
    asset?.kind === "expression" &&
    !asset.composite &&
    p.attempts.find((a) => a.id === asset.attemptId)?.mask;
  return (
    <section
      className="library-workspace panel"
      aria-label={tr("common.m95570f9f48")}
    >
      <div className="section-head">
        <div>
          <h2>{tr("common.m899ab0b2e0")}</h2>
          <p>{tr("common.m0b0408dd1c")}</p>
        </div>
      </div>
      <div className="library-filters">
        <label>
          {tr("common.mdeef0d243a")}
          <select
            aria-label={tr("common.mb2ef94c0e1")}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              onSelect("");
            }}
          >
            <option value="all">{tr("common.m7b2e9cf755")}</option>
            <option value="master">{tr("common.m569be0cd87")}</option>
            <option value="master-candidate">{tr("common.m2767f4e27f")}</option>
            <option value="expression">{tr("common.navExpressions")}</option>
            <option value="quality">{tr("common.mbd544430a2")}</option>
          </select>
        </label>
        <label>
          {tr("common.m663c728563")}
          <select
            aria-label={tr("common.m8738145cb5")}
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              onSelect("");
            }}
          >
            <option value="all">{tr("common.m3801a35c51")}</option>
            <option value="candidate">{tr("common.m3116c262dc")}</option>
            <option value="approved">{tr("common.med04045dd2")}</option>
            <option value="rejected">{tr("common.ma9148e8654")}</option>
          </select>
        </label>
        <label>
          {tr("common.m80d298c9f2")}
          <select
            aria-label={tr("common.mcab7562d8b")}
            value={asset?.id ?? ""}
            onChange={(e) => onSelect(e.target.value)}
          >
            {selected && !filtered.some((a) => a.id === selected.id) && (
              <option value={selected.id}>
                {selected.label} {tr("common.m5454d38eca")}
              </option>
            )}
            {filtered.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.state} · {a.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!asset ? (
        <p>{tr("common.m23ae854c14")}</p>
      ) : (
        <>
          <div className="section-head">
            <h3>
              {asset.label} · {asset.width}×{asset.height}
            </h3>
            <span className={`badge ${asset.state}`}>
              {asset.state === "candidate"
                ? tr("common.m2576d1e471")
                : asset.state === "approved"
                  ? tr("common.med04045dd2")
                  : tr("common.ma9148e8654")}
            </span>
          </div>
          {asset.kind === "expression" && (
            <p>
              {tr("common.mc2da79f0be")}
              {p.masters.find((m) => m.id === asset.masterId)?.version} ·{" "}
              {p.characters.find((c) => c.id === asset.characterId)
                ?.masterId === asset.masterId
                ? tr("common.mefc99db433")
                : tr("common.m271219966a")}
            </p>
          )}
          <MasterCandidateCompare
            master={before}
            candidate={asset}
            beforeLabel={
              asset.kind === "master-candidate"
                ? tr("common.m09841f4a4e")
                : asset.kind === "expression"
                  ? "Master"
                  : "Quelle / Master"
            }
            previewPrefix="Library"
          />
          <div className="button-row">
            {(asset.kind === "expression" ||
              asset.kind === "master-candidate") && (
              <button
                onClick={() =>
                  onStudio({
                    characterId: asset.characterId,
                    mode: asset.kind === "expression" ? "expression" : "master",
                    masterId,
                    candidateId: asset.id,
                  })
                }
              >
                {tr("common.m8e07cd0617")}
              </button>
            )}
            {masterId && (
              <button
                onClick={() =>
                  onStudio({
                    mode: "expression",
                    characterId: asset.characterId,
                    masterId,
                  })
                }
              >
                {tr("common.m52aa9dd335")}
              </button>
            )}
            {asset.state === "candidate" &&
              (asset.kind === "master-candidate" ||
                asset.kind === "expression") && (
                <>
                  {asset.kind === "master-candidate" ? (
                    <MasterApproval
                      key={asset.id}
                      source={asset}
                      disabled={disabled}
                      label={tr("common.m41f58bc50e")}
                      onApprove={(review) =>
                        command(
                          {
                            type: "reviewMasterCandidate",
                            id: asset.id,
                            status: "approved",
                            review,
                          },
                          tr("common.m5f5821a731"),
                        )
                      }
                      onCutout={() => setCutoutRequested((v) => v + 1)}
                      onRetry={() =>
                        onStudio({
                          mode: "master",
                          characterId: asset.characterId,
                          rebuild: !!p.characters.find(
                            (c) => c.id === asset.characterId,
                          )?.masterId,
                          candidateId: asset.id,
                        })
                      }
                    />
                  ) : (
                    <button
                      disabled={disabled || Boolean(hardRaw)}
                      onClick={() =>
                        command(
                          { type: "review", id: asset.id, status: "approved" },
                          tr("common.m71ba34a309"),
                        )
                      }
                    >
                      {tr("common.m90941205e5")}
                    </button>
                  )}
                  <button
                    disabled={disabled}
                    onClick={() =>
                      command(
                        {
                          type:
                            asset.kind === "master-candidate"
                              ? "reviewMasterCandidate"
                              : "review",
                          id: asset.id,
                          status: "rejected",
                        },
                        tr("common.m0df5d0edfa"),
                      )
                    }
                  >
                    {tr("common.m56af92162b")}
                  </button>
                </>
              )}
          </div>
          {hardRaw && <p className="warning">{tr("common.mac108e62b9")}</p>}
          <AssetQuality
            key={asset.id}
            source={asset}
            cutoutRequested={cutoutRequested}
            onCutoutOpened={() => setCutoutRequested(0)}
            project={p}
            onSnapshot={onSnapshot}
            disabled={disabled}
          />
          {attempt && (
            <details>
              <summary>{tr("common.mbc6ab538d4")}</summary>
              <pre
                className="prompt-base"
                aria-label={tr("common.mee48c68600")}
              >
                {attempt.promptRevision.prompt}
              </pre>
              <small>
                {tr("common.mb52614c76a")}
                {attempt.id} {tr("common.mdec8f41a7b")}
                {attempt.artDirectionRevision ?? "—"}
                {tr("common.mce7c399eab")}
              </small>
            </details>
          )}
        </>
      )}
    </section>
  );
}
