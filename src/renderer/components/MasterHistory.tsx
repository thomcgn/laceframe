import { useState } from "react";
import type { Project } from "../../shared/domain";
import { ImagePreview } from "./ImagePreview";
import { Evidence } from "./AssetQuality";
export function MasterHistory({
  project: p,
  characterId,
  onInspect,
  onStudio,
}: {
  project: Project;
  characterId: string;
  onInspect: (id: string) => void;
  onStudio: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const current = p.characters.find((c) => c.id === characterId)?.masterId;
  return (
    <section className="master-history">
      <h3>Masterhistorie · alte Verknüpfungen bleiben erhalten</h3>
      <label>
        Historische Masterversion
        <select
          aria-label="Historische Masterversion"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Version ansehen …</option>
          {p.masters
            .filter((m) => m.characterId === characterId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                V{m.version} · {m.id === current ? "aktiv" : "archiviert"}
              </option>
            ))}
        </select>
      </label>
      <p>
        Historische Versionen sind archiviert, nicht gelöscht. Endgültiges
        Löschen wird nicht angeboten: Expressions, Masken, Qualitätsversionen
        und Generierungsketten bleiben nachvollziehbar.
      </p>
      {p.masters
        .filter((m) => m.characterId === characterId && m.id === selected)
        .map((m) => {
          const candidate = p.masterCandidates.find(
              (c) =>
                c.id === m.sourceCandidateId || c.approvedMasterId === m.id,
            ),
            attempt = p.masterAttempts.find(
              (a) => a.id === candidate?.attemptId,
            );
          const descendants = p.qualityAssets.filter((q) => {
            const seen = new Set<string>();
            let id = q.sourceId;
            while (!seen.has(id)) {
              if (id === m.id) return true;
              seen.add(id);
              const a = p.qualityAssets.find((a) => a.id === id);
              if (!a)
                return p.assets.some((e) => e.id === id && e.masterId === m.id);
              id = a.sourceId;
            }
            return false;
          }).length;
          return (
            <article key={m.id}>
              <h3>
                Master V{m.version} ·{" "}
                {current === m.id ? "aktuell aktiv" : "historisch archiviert"}
              </h3>
              <p>
                {new Date(m.approvedAt).toLocaleString("de-DE")} · Herkunft:{" "}
                {m.qualitySourceId
                  ? "Qualitätsrevision / Freistellung"
                  : candidate
                    ? attempt?.mode === "rebuild"
                      ? "Vollständige Rebuild-Generation"
                      : "Character-Creator-Generation"
                    : "Lokaler Masterimport"}{" "}
                · {p.assets.filter((e) => e.masterId === m.id).length}{" "}
                Expressions ·{" "}
                {p.masks.filter((e) => e.masterId === m.id).length} Masken ·{" "}
                {descendants} Qualitätsversionen
              </p>
              <Evidence id={m.id} label={`Master V${m.version} Transparenz`} />
              <button onClick={() => onInspect(m.id)}>
                Master V{m.version} in Library prüfen
              </button>
              <button onClick={() => onStudio(m.id)}>
                Mit Master V{m.version} Expression erstellen
              </button>
              <ImagePreview
                id={m.id}
                caption={`Master V${m.version}`}
                zoom="fit"
              />
            </article>
          );
        })}
    </section>
  );
}
