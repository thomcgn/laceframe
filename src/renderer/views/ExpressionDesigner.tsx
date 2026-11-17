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
const actions = { silent: "Still", speaking: "Sprechend", shouting: "Rufend" };
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
    <section className="expressions-workspace" aria-label="Expression Designer">
      <header className="designer-heading">
        <div>
          <p className="eyebrow">DEFINITIONEN · KEINE BILDGENERIERUNG</p>
          <h2>Expressions</h2>
          <p>
            Globale Emotionen definieren, persönliche Ausdrucksweisen bewusst
            zuordnen.
          </p>
        </div>
        <button onClick={onBack}>Zurück zum Studio</button>
      </header>
      <p className="muted">
        {dirty
          ? "Ungespeicherte Entwürfe bleiben beim Navigieren in diesem Projekt erhalten."
          : "Gespeicherte Regeln werden im Studio verwendet. Historische Prompts bleiben unverändert."}
      </p>
      <fieldset disabled={busy} className="designer-layout">
        <aside className="panel designer-navigation">
          <label>
            Emotionsfamilie
            <select
              aria-label="Emotionsfamilie"
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
                Familienname
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
                Familienkennung
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
              <button type="submit">Familie speichern</button>
            </form>
          )}
          <details>
            <summary>Eigene Familie hinzufügen</summary>
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
                Neue Familie
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
                Kennung
                <input
                  required
                  maxLength={120}
                  value={newFamily.slug}
                  onChange={(e) =>
                    setNewFamily({ ...newFamily, slug: e.target.value })
                  }
                />
              </label>
              <button type="submit">Familie hinzufügen</button>
            </form>
          </details>
          <label>
            Variante
            <select
              aria-label="Variante"
              value={variant?.id ?? ""}
              onChange={(e) => setVariantId(e.target.value)}
            >
              <option disabled value="">
                Variante anlegen
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
            <summary>Variante hinzufügen</summary>
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
                Neue Variante
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
                Neue Variantenkennung
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
                Variante hinzufügen
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
              <p className="eyebrow">GLOBAL · FÜR ALLE FIGUREN</p>
              <h3>
                {familyDraft?.label} → {draft.label}
              </h3>
              <div className="designer-fields">
                <label>
                  Variantenname
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
                  Variantenkennung
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
                Globale Generierungsanweisung
                <textarea
                  aria-label="Globale Generierungsanweisung"
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
                  Intensität · optional (0–1)
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
                  Vorgeschlagene Stimmaktion
                  <select
                    aria-label="Vorgeschlagene Stimmaktion"
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
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="muted">
                Emotion und Stimmaktion bleiben getrennt. Intensität und
                Stimmaktion sind Vorgaben für eine neue Studio-Auswahl.
              </p>
              <button className="primary" type="submit">
                Variante speichern
              </button>
            </form>
          ) : (
            <p className="panel">Zuerst eine Familie und Variante anlegen.</p>
          )}
          <section className="panel">
            <p className="eyebrow">PERSÖNLICH · FIGUR × VARIANTE</p>
            <label>
              Figur für Expression
              <select
                aria-label="Expression Figur"
                value={character?.id ?? ""}
                onChange={(e) => setCharacterId(e.target.value)}
              >
                <option disabled value="">
                  Figur unter Characters anlegen
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
                  Persönlicher Ausdruck
                  <textarea
                    aria-label="Persönlicher Ausdruck"
                    rows={3}
                    maxLength={8000}
                    value={direction}
                    onChange={(e) =>
                      setPersonal({ ...personal, [pair]: e.target.value })
                    }
                  />
                </label>
                <p className="muted">
                  Nur {character.name} / {variant.label}. Eine persönliche
                  Anweisung ersetzt die globale Ausdrucksanweisung für diese
                  Kombination. Name, Intensität und Stimmaktion bleiben
                  unabhängig. Leer speichern, um wieder die globale Vorlage zu
                  erben.
                </p>
                <button type="submit">Persönlichen Ausdruck speichern</button>
              </form>
            ) : (
              <p>
                Figur und Variante wählen, um einen persönlichen Ausdruck
                festzulegen.
              </p>
            )}
          </section>
          {draft && (
            <section
              className="panel effective-expression"
              aria-label="Wirksame Ausdrucksanweisung"
            >
              <h3>
                Wirksame Regeln · {character?.name ?? "keine Figur"} /{" "}
                {draft.label}
              </h3>
              <p>
                {direction.trim() && character
                  ? "Persönliche Ausdrucksanweisung (ersetzt die globale Vorlage):"
                  : "Geerbte globale Ausdrucksanweisung:"}
              </p>
              <p className="expression-direction">
                {(character && direction.trim()) ||
                  draft.prompt ||
                  "Keine zusätzliche Ausdrucksanweisung. Familienname und Variante werden verwendet."}
              </p>
              <p>
                Intensität: {draft.intensity ?? "nicht vorgegeben"} ·
                Stimmaktion: {actions[draft.suggestedAction]}
              </p>
              <p className="muted">
                {familyDirty || variantDirty || personalDirty
                  ? "Vorschau enthält ungespeicherte Änderungen. Vor Verwendung im Studio speichern."
                  : "Gespeicherte Regeln. Character Lock und Art Direction ergänzt Studio; zusätzliche kreative Anweisungen sind dort separat möglich."}
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
                Im Studio verwenden
              </button>
              {!character?.masterId && (
                <p className="warning">
                  Zuerst unter Characters einen Master freigeben.
                </p>
              )}
            </section>
          )}
        </div>
      </fieldset>
    </section>
  );
}
