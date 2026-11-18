import { i18n } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
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
      <h3>{tr("characters.m452cc8eaf5")}</h3>
      <label>
        {tr("characters.mb79701267a")}
        <select
          aria-label={tr("characters.mb79701267a")}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">{tr("characters.m6f852c6b68")}</option>
          {p.masters
            .filter((m) => m.characterId === characterId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                V{m.version} · {m.id === current ? "aktiv" : "archiviert"}
              </option>
            ))}
        </select>
      </label>
      <p>{tr("characters.md7732d7613")}</p>
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
                {tr("characters.m29f9eecd72")}
                {m.version} ·{" "}
                {current === m.id
                  ? tr("characters.m63d87533b4")
                  : tr("characters.m8613fded77")}
              </h3>
              <p>
                {new Date(m.approvedAt).toLocaleString(i18n.language)}{" "}
                {tr("characters.m51974785e0")}{" "}
                {m.qualitySourceId
                  ? tr("characters.m29d4873275")
                  : candidate
                    ? attempt?.mode === "rebuild"
                      ? tr("characters.m5d9cb635f5")
                      : "Character-Creator-Generation"
                    : tr("characters.mbe3be22a28")}{" "}
                · {p.assets.filter((e) => e.masterId === m.id).length}{" "}
                {tr("characters.m63a5d67f10")}{" "}
                {p.masks.filter((e) => e.masterId === m.id).length}{" "}
                {tr("characters.m9aef9e85f7")} {descendants}{" "}
                {tr("characters.m2777d0ce77")}
              </p>
              <Evidence
                id={m.id}
                label={tr("characters.m02851697fe", { v0: m.version })}
              />
              <button onClick={() => onInspect(m.id)}>
                {tr("characters.m29f9eecd72")}
                {m.version} {tr("characters.me991cf48e1")}
              </button>
              <button onClick={() => onStudio(m.id)}>
                {tr("characters.mcea7805a93")}
                {m.version} {tr("characters.m1e9e71c620")}
              </button>
              <ImagePreview
                id={m.id}
                caption={tr("characters.mf483464116", { v0: m.version })}
                zoom="fit"
              />
            </article>
          );
        })}
    </section>
  );
}
