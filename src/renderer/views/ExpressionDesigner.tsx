import { displayMessage } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
import { PackTools } from "../components/PackTools";
import { useEffect, useState } from "react";
import type {
  Command,
  Family,
  Snapshot,
  Variant,
  VocalAction,
} from "../../shared/domain";
import type { Result } from "../../shared/bridge";
import type { StudioIntent } from "../../shared/studio";
import "../expressions.css";

type Perform = <T>(
  work: () => Promise<Result<T>>,
  success: (value: T) => void,
  notice?: string,
) => Promise<void>;
const actions = {
  silent: tr("expressions.m70bcb5a44e"),
  speaking: tr("expressions.mf541c979a4"),
  shouting: tr("expressions.m1b5e7851ce"),
};
export function ExpressionDesigner({
  snapshot,
  busy,
  perform,
  onSnapshot,
  onDirtyChange,
  intent,
  onStudio,
  onBack,
}: {
  snapshot: Snapshot;
  busy: boolean;
  perform: Perform;
  onSnapshot: (value: Snapshot) => void;
  onDirtyChange: (dirty: boolean) => void;
  intent?: StudioIntent;
  onStudio: (intent: Omit<StudioIntent, "serial">) => void;
  onBack: () => void;
}) {
  const p = snapshot.project;
  const [familyId, setFamilyId] = useState(p.families[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [characterId, setCharacterId] = useState(p.selectedCharacterId ?? "");
  // Drafts are keyed by their actual scope. Navigation never discards another variant/character's work.
  const [families, setFamilies] = useState<Record<string, Family>>({});
  const [variants, setVariants] = useState<Record<string, Variant>>({});
  const [personal, setPersonal] = useState<Record<string, string>>({});
  const [newFamily, setNewFamily] = useState({ label: "", slug: "" });
  const [newVariant, setNewVariant] = useState({ label: "", slug: "" });
  const family = p.families.find((f) => f.id === familyId) ?? p.families[0];
  const members = p.variants.filter((v) => v.familyId === family?.id);
  const variant = members.find((v) => v.id === variantId) ?? members[0];
  const character =
    p.characters.find((c) => c.id === characterId) ??
    p.characters.find((c) => c.id === p.selectedCharacterId);
  const familyDraft = family && (families[family.id] ?? family);
  const draft = variant && (variants[variant.id] ?? variant);
  const pair = `${character?.id ?? ""}/${variant?.id ?? ""}`;
  const savedDirection =
    p.expressionPerformances.find(
      (e) => e.characterId === character?.id && e.variantId === variant?.id,
    )?.direction ?? "";
  const direction = personal[pair] ?? savedDirection;
  const dirty = Boolean(
    newFamily.label ||
      newFamily.slug ||
      newVariant.label ||
      newVariant.slug ||
      Object.values(families).some(
        (v) =>
          JSON.stringify(v) !==
          JSON.stringify(p.families.find((f) => f.id === v.id)),
      ) ||
      Object.values(variants).some(
        (v) =>
          JSON.stringify(v) !==
          JSON.stringify(p.variants.find((f) => f.id === v.id)),
      ) ||
      Object.entries(personal).some(
        ([key, text]) =>
          text !==
          (p.expressionPerformances.find(
            (e) => `${e.characterId}/${e.variantId}` === key,
          )?.direction ?? ""),
      ),
  );
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (!intent) return;
    setCharacterId(intent.characterId);
    if (intent.familyId) setFamilyId(intent.familyId);
    if (intent.variantId) setVariantId(intent.variantId);
  }, [intent]);
  function save(command: Command, success?: (value: Snapshot) => void) {
    void perform(
      () => window.laceframe.command(command),
      (value) => {
        onSnapshot(value);
        success?.(value);
      },
      "Gespeichert.",
    );
  }
  const familyDirty =
    family &&
    familyDraft &&
    JSON.stringify(family) !== JSON.stringify(familyDraft);
  const variantDirty =
    variant && draft && JSON.stringify(variant) !== JSON.stringify(draft);
  const personalDirty = direction !== savedDirection;
  return (
    <section
      className="expressions-workspace"
      aria-label={tr("expressions.m8c785892bb")}
    >
      <header className="designer-heading">
        <div>
          <p className="eyebrow">{tr("expressions.m22230e2101")}</p>
          <h2>{tr("common.navExpressions")}</h2>
          <p>{tr("expressions.m1e78fc7ede")}</p>
        </div>
        <button onClick={onBack}>{tr("expressions.md42458a59e")}</button>
      </header>
      <p className="muted">
        {dirty ? tr("expressions.m715987ca53") : tr("expressions.me34fe80c0e")}
      </p>
      <PackTools
        snapshot={snapshot}
        kind="expressions"
        familyId={family?.id}
        disabled={busy || dirty}
        perform={perform}
        onSnapshot={onSnapshot}
      />
      <fieldset disabled={busy} className="designer-layout">
        <aside className="panel designer-navigation">
          <label>
            {tr("expressions.m5fe8308e23")}
            <select
              aria-label={tr("expressions.m5fe8308e23")}
              value={family?.id ?? ""}
              onChange={(e) => {
                setFamilyId(e.target.value);
                setVariantId("");
              }}
            >
              {p.families.map((f) => (
                <option key={f.id} value={f.id}>
                  {families[f.id]?.label ?? f.label}
                </option>
              ))}
            </select>
          </label>
          {familyDraft && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(
                  {
                    type: "editFamily",
                    id: familyDraft.id,
                    label: familyDraft.label,
                    slug: familyDraft.slug,
                  },
                  () =>
                    setFamilies((old) => {
                      const next = { ...old };
                      delete next[familyDraft.id];
                      return next;
                    }),
                );
              }}
            >
              <label>
                {tr("expressions.m6d61135a03")}
                <input
                  required
                  maxLength={120}
                  value={familyDraft.label}
                  onChange={(e) =>
                    setFamilies({
                      ...families,
                      [familyDraft.id]: {
                        ...familyDraft,
                        label: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                {tr("expressions.mb7355e1a61")}
                <input
                  required
                  maxLength={120}
                  value={familyDraft.slug}
                  onChange={(e) =>
                    setFamilies({
                      ...families,
                      [familyDraft.id]: {
                        ...familyDraft,
                        slug: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <button type="submit">{tr("expressions.m1e94a536dc")}</button>
            </form>
          )}
          <details>
            <summary>{tr("expressions.mbc7e424d53")}</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save({ type: "addFamily", ...newFamily }, (value) => {
                  setFamilyId(value.project.families.at(-1)!.id);
                  setVariantId("");
                  setNewFamily({ label: "", slug: "" });
                });
              }}
            >
              <label>
                {tr("expressions.mfb52200b7f")}
                <input
                  required
                  maxLength={120}
                  value={newFamily.label}
                  onChange={(e) =>
                    setNewFamily({ ...newFamily, label: e.target.value })
                  }
                />
              </label>
              <label>
                {tr("expressions.mf1f479e20f")}
                <input
                  required
                  maxLength={120}
                  value={newFamily.slug}
                  onChange={(e) =>
                    setNewFamily({ ...newFamily, slug: e.target.value })
                  }
                />
              </label>
              <button type="submit">{tr("expressions.m7ee181a0c4")}</button>
            </form>
          </details>
          <label>
            {tr("expressions.ma0f6dc6453")}
            <select
              aria-label={tr("expressions.ma0f6dc6453")}
              value={variant?.id ?? ""}
              onChange={(e) => setVariantId(e.target.value)}
            >
              <option disabled value="">
                {tr("expressions.md0e1778ffe")}
              </option>
              {members.map((v) => (
                <option key={v.id} value={v.id}>
                  {variants[v.id]?.label ?? v.label} /{" "}
                  {variants[v.id]?.slug ?? v.slug}
                </option>
              ))}
            </select>
          </label>
          <details>
            <summary>{tr("expressions.m9763b13c5b")}</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (family)
                  save(
                    { type: "addVariant", familyId: family.id, ...newVariant },
                    (value) => {
                      setVariantId(value.project.variants.at(-1)!.id);
                      setNewVariant({ label: "", slug: "" });
                    },
                  );
              }}
            >
              <label>
                {tr("expressions.mcbbbd7e70b")}
                <input
                  required
                  maxLength={120}
                  value={newVariant.label}
                  onChange={(e) =>
                    setNewVariant({ ...newVariant, label: e.target.value })
                  }
                />
              </label>
              <label>
                {tr("expressions.mf1843b5593")}
                <input
                  required
                  maxLength={120}
                  value={newVariant.slug}
                  onChange={(e) =>
                    setNewVariant({ ...newVariant, slug: e.target.value })
                  }
                />
              </label>
              <button type="submit" disabled={!family}>
                {tr("expressions.m9763b13c5b")}
              </button>
            </form>
          </details>
        </aside>
        <div className="designer-rules">
          {draft ? (
            <form
              className="panel"
              onSubmit={(e) => {
                e.preventDefault();
                save({ type: "editVariant", variant: draft }, () =>
                  setVariants((old) => {
                    const next = { ...old };
                    delete next[draft.id];
                    return next;
                  }),
                );
              }}
            >
              <p className="eyebrow">{tr("expressions.m0f75eaf7e2")}</p>
              <h3>
                {familyDraft?.label} → {draft.label}
              </h3>
              <div className="designer-fields">
                <label>
                  {tr("expressions.m61494064f0")}
                  <input
                    required
                    maxLength={120}
                    value={draft.label}
                    onChange={(e) =>
                      setVariants({
                        ...variants,
                        [draft.id]: { ...draft, label: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  {tr("expressions.ma15e3f38b1")}
                  <input
                    required
                    maxLength={120}
                    value={draft.slug}
                    onChange={(e) =>
                      setVariants({
                        ...variants,
                        [draft.id]: { ...draft, slug: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
              <label>
                {tr("expressions.md5a7715544")}
                <textarea
                  aria-label={tr("expressions.md5a7715544")}
                  rows={4}
                  maxLength={8000}
                  value={draft.prompt}
                  onChange={(e) =>
                    setVariants({
                      ...variants,
                      [draft.id]: { ...draft, prompt: e.target.value },
                    })
                  }
                />
              </label>
              <div className="designer-fields">
                <label>
                  {tr("expressions.m4fc7d464df")}
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={draft.intensity ?? ""}
                    onChange={(e) =>
                      setVariants({
                        ...variants,
                        [draft.id]: {
                          ...draft,
                          intensity:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  {tr("expressions.m4c9f6ae2c2")}
                  <select
                    aria-label={tr("expressions.m4c9f6ae2c2")}
                    value={draft.suggestedAction}
                    onChange={(e) =>
                      setVariants({
                        ...variants,
                        [draft.id]: {
                          ...draft,
                          suggestedAction: e.target.value as VocalAction,
                        },
                      })
                    }
                  >
                    {Object.entries(actions).map(([id, label]) => (
                      <option key={id} value={id}>
                        {displayMessage(label)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="muted">{tr("expressions.m588976fb69")}</p>
              <button className="primary" type="submit">
                {tr("expressions.m6b431264b2")}
              </button>
            </form>
          ) : (
            <p className="panel">{tr("expressions.mcb817c5327")}</p>
          )}
          <section className="panel">
            <p className="eyebrow">{tr("expressions.m3aec95802f")}</p>
            <label>
              {tr("expressions.m55637e704a")}
              <select
                aria-label={tr("expressions.m83e2c5fafc")}
                value={character?.id ?? ""}
                onChange={(e) => setCharacterId(e.target.value)}
              >
                <option disabled value="">
                  {tr("expressions.mfa592ba2c2")}
                </option>
                {p.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {character && variant ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save(
                    {
                      type: "setExpressionPerformance",
                      characterId: character.id,
                      variantId: variant.id,
                      direction,
                    },
                    () =>
                      setPersonal((old) => {
                        const next = { ...old };
                        delete next[pair];
                        return next;
                      }),
                  );
                }}
              >
                <label>
                  {tr("expressions.me81e30b813")}
                  <textarea
                    aria-label={tr("expressions.me81e30b813")}
                    rows={3}
                    maxLength={8000}
                    value={direction}
                    onChange={(e) =>
                      setPersonal({ ...personal, [pair]: e.target.value })
                    }
                  />
                </label>
                <p className="muted">
                  {tr("expressions.md1847a6fb4")}
                  {character.name} / {variant.label}
                  {tr("common.m8a3fe62c50")}
                </p>
                <button type="submit">{tr("expressions.m1d35eb5f65")}</button>
              </form>
            ) : (
              <p>{tr("expressions.m0e2a7ecbbd")}</p>
            )}
          </section>
          {draft && (
            <section
              className="panel effective-expression"
              aria-label={tr("expressions.m93578d669a")}
            >
              <h3>
                {tr("expressions.md5ea80f991")}
                {character?.name ?? tr("common.m53ca322299")} / {draft.label}
              </h3>
              <p>
                {direction.trim() && character
                  ? tr("expressions.m22f294b3b5")
                  : tr("expressions.m71bf33efef")}
              </p>
              <p className="expression-direction">
                {(character && direction.trim()) ||
                  draft.prompt ||
                  tr("expressions.noAdditionalDirection")}
              </p>
              <p>
                {tr("expressions.m0537abe594")}
                {draft.intensity ?? tr("common.m9f3337276d")}{" "}
                {tr("expressions.mffd84c536d")}
                {actions[draft.suggestedAction]}
              </p>
              <p className="muted">
                {familyDirty || variantDirty || personalDirty
                  ? tr("expressions.m1f685e0f38")
                  : tr("expressions.mefe292e06c")}
              </p>
              <button
                disabled={
                  !character?.masterId ||
                  Boolean(familyDirty || variantDirty || personalDirty)
                }
                onClick={() => {
                  if (character && variant)
                    onStudio({
                      characterId: character.id,
                      mode: "expression",
                      familyId: variant.familyId,
                      variantId: variant.id,
                    });
                }}
              >
                {tr("expressions.m13b168a606")}
              </button>
              {!character?.masterId && (
                <p className="warning">{tr("expressions.m05fbf7440e")}</p>
              )}
            </section>
          )}
        </div>
      </fieldset>
    </section>
  );
}
