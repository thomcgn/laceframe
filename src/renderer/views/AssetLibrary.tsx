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
    <section className="library-workspace panel" aria-label="Assetbibliothek">
      <div className="section-head">
        <div>
          <h2>Library · Assets prüfen</h2>
          <p>
            Master, Kandidaten, Expressions und Qualitätsversionen · Originale
            und historische Verknüpfungen bleiben erhalten.
          </p>
        </div>
      </div>
      <div className="library-filters">
        <label>
          Assettyp
          <select
            aria-label="Library Assettyp"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              onSelect("");
            }}
          >
            <option value="all">Alle Assets</option>
            <option value="master">Masterversionen</option>
            <option value="master-candidate">Masterkandidaten</option>
            <option value="expression">Expressions</option>
            <option value="quality">Qualitätsvarianten</option>
          </select>
        </label>
        <label>
          Prüfstatus
          <select
            aria-label="Library Prüfstatus"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              onSelect("");
            }}
          >
            <option value="all">Alle</option>
            <option value="candidate">Ungeprüft</option>
            <option value="approved">Freigegeben</option>
            <option value="rejected">Abgelehnt</option>
          </select>
        </label>
        <label>
          Asset
          <select
            aria-label="Library Asset"
            value={asset?.id ?? ""}
            onChange={(e) => onSelect(e.target.value)}
          >
            {selected && !filtered.some((a) => a.id === selected.id) && (
              <option value={selected.id}>
                {selected.label} · gezielt geöffnet
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
        <p>
          Noch keine passenden Assets. Im Studio einen Master erstellen oder
          einen bestehenden Master unter Characters importieren.
        </p>
      ) : (
        <>
          <div className="section-head">
            <h3>
              {asset.label} · {asset.width}×{asset.height}
            </h3>
            <span className={`badge ${asset.state}`}>
              {asset.state === "candidate"
                ? "Kandidat · ungeprüft"
                : asset.state === "approved"
                  ? "Freigegeben"
                  : "Abgelehnt"}
            </span>
          </div>
          <MasterCandidateCompare
            master={before}
            candidate={asset}
            beforeLabel={
              asset.kind === "master-candidate"
                ? "Identität"
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
                Im Studio prüfen und bearbeiten
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
                Mit demselben Master weitere Expression erstellen
              </button>
            )}
            {asset.state === "candidate" &&
              (asset.kind === "master-candidate" ||
                asset.kind === "expression") && (
                <>
                  <button
                    disabled={
                      disabled ||
                      Boolean(hardRaw) ||
                      (asset.kind === "master-candidate" &&
                        Boolean(
                          p.characters.find((c) => c.id === asset.characterId)
                            ?.masterId,
                        ))
                    }
                    onClick={() => {
                      if (asset.kind === "master-candidate") {
                        if (
                          !window.confirm(
                            "Identität, Outfit, Stil, neutrale Mimik und Komposition geprüft? Als Master V1 freigeben und sperren?",
                          )
                        )
                          return;
                        command(
                          {
                            type: "reviewMasterCandidate",
                            id: asset.id,
                            status: "approved",
                          },
                          "Master freigegeben.",
                        );
                      } else
                        command(
                          { type: "review", id: asset.id, status: "approved" },
                          "Expression freigegeben.",
                        );
                    }}
                  >
                    Asset freigeben
                  </button>
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
                        "Kandidat abgelehnt.",
                      )
                    }
                  >
                    Asset ablehnen
                  </button>
                </>
              )}
          </div>
          {hardRaw && (
            <p className="warning">
              Hard-Lock-Rohkandidat: zuerst im Studio registrieren und
              compositen. Die Freigabe bleibt gesperrt.
            </p>
          )}
          <AssetQuality
            key={asset.id}
            source={asset}
            project={p}
            onSnapshot={onSnapshot}
            disabled={disabled}
          />
          {attempt && (
            <details>
              <summary>
                Historischer Prompt & Provenienz · schreibgeschützt
              </summary>
              <pre
                className="prompt-base"
                aria-label="Library Historischer Prompt"
              >
                {attempt.promptRevision.prompt}
              </pre>
              <small>
                Versuch {attempt.id} · Stilrevision R
                {attempt.artDirectionRevision ?? "—"}. Einstellungen im Studio
                verändern diesen Snapshot nicht.
              </small>
            </details>
          )}
        </>
      )}
    </section>
  );
}
