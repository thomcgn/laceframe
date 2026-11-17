import { useEffect, useState } from "react";
import type { ArtDirection, Snapshot } from "../../shared/domain";
import {
  emptyStyle,
  migrationLines,
  structuredStyleText,
  lintStyle,
  migrationCategories,
  type StyleContent,
  type MigrationCategory,
} from "../../shared/packs";
import type { Perform } from "./StyleLibrary";
export function StyleRuleTools({
  profile,
  snapshot,
  disabled,
  perform,
  onSnapshot,
  onDirtyChange,
}: {
  profile: ArtDirection;
  snapshot: Snapshot;
  disabled: boolean;
  perform: Perform;
  onSnapshot: (s: Snapshot) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<StyleContent>(
    profile.portableStyle ?? emptyStyle(profile.name),
  );
  const changed =
    JSON.stringify(draft) !==
    JSON.stringify(profile.portableStyle ?? emptyStyle(profile.name));
  useEffect(() => {
    onDirtyChange(changed);
    return () => onDirtyChange(false);
  }, [changed, onDirtyChange]);
  const [migration, setMigration] = useState(false);
  const lines = migrationLines(profile);
  const [choices, setChoices] = useState(() =>
    lines.map((l, index) => ({ index, category: l.category, text: l.raw })),
  );
  const [confirmed, setConfirmed] = useState(false);
  const unmapped = (profile.portableStyle?.referenceHashes ?? []).filter(
    (h) =>
      !snapshot.project.styleAssets.some(
        (a) =>
          (profile.styleReferenceIds ?? []).includes(a.id) && a.sha256 === h,
      ),
  );
  return (
    <section className="style-rule-tools" aria-label="Strukturierte Stilregeln">
      {unmapped.length > 0 && (
        <p className="warning">
          {unmapped.length} Pack-Referenz(en) nur als Hash vorhanden, nicht an
          Generierung übergeben:{" "}
          {unmapped.map((h) => h.slice(0, 12)).join(", ")}. Originalbilder
          separat prüfen und lokal zuordnen; es gibt keinen automatischen
          Download.
        </p>
      )}
      <details>
        <summary>
          Style-Linter · Hinweise, keine automatische Verschiebung
        </summary>
        <p>
          Regelbasierte, unsichere Vorschläge. Gemischte Sätze manuell
          aufteilen; „render leather as grouped highlights“ beschreibt Material,
          „keep black leather jacket“ ein Outfit.
        </p>
        {[
          ...lines,
          ...structuredStyleText(profile.portableStyle)
            .split("\n")
            .filter(Boolean)
            .map((raw) => ({ raw, ...lintStyle(raw) })),
        ].map((l, i) => (
          <p key={i}>
            <strong>{l.category}</strong> · {l.raw}
            <br />
            <small>{l.reason}</small>
          </p>
        ))}
      </details>
      <details>
        <summary>Strukturierte Rendering-Regeln bearbeiten</summary>
        <p>
          Zusätzlich zu bestehenden Freitextfeldern. Änderungen erzeugen eine
          neue Revision. Keine virtuellen Pixelmaße werden gemessen oder
          erfunden.
        </p>
        <label>
          Asset-Kategorie
          <select
            aria-label="Pack Asset-Kategorie"
            value={draft.category}
            onChange={(e) =>
              setDraft({
                ...draft,
                category: e.target.value as StyleContent["category"],
              })
            }
          >
            <option value="portrait">Portrait</option>
            <option value="sprite">Sprite</option>
            <option value="scene">Scene</option>
          </select>
        </label>
        {(
          [
            ["intent", "Stil-Intent"],
            ["contours", "Konturen"],
            ["pixelClusters", "Pixelcluster"],
            [
              "apparentDensity",
              "Scheinbare Pixeldichte (manuelle Beschreibung)",
            ],
            ["shading", "Schattierung"],
            ["materials", "Material-Rendering"],
            ["colorTreatment", "Farbbehandlung"],
            ["lighting", "Lichtbehandlung"],
            ["composition", "Kompositionsregeln"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <textarea
              aria-label={label}
              maxLength={8000}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
        {(["positiveRules", "negativeRules"] as const).map((key) => (
          <label key={key}>
            {key === "positiveRules" ? "Positive Regeln" : "Negative Regeln"}{" "}
            (eine pro Zeile)
            <textarea
              aria-label={
                key === "positiveRules" ? "Positive Regeln" : "Negative Regeln"
              }
              value={draft[key].join("\n")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  [key]: e.target.value.split("\n").filter(Boolean),
                })
              }
            />
          </label>
        ))}
        {draft.additionalRules.map((rule, i) => (
          <label key={i}>
            Zusatzregel · {rule.label}
            <textarea
              value={rule.text}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  additionalRules: draft.additionalRules.map((r, j) =>
                    i === j ? { ...r, text: e.target.value } : r,
                  ),
                })
              }
            />
          </label>
        ))}
        <button
          disabled={disabled}
          onClick={() =>
            void perform(
              () =>
                window.laceframe.command({
                  type: "updateStructuredStyle",
                  profileId: profile.id,
                  sourceRevision: profile.revision,
                  style: { ...draft, name: profile.name },
                }),
              onSnapshot,
              "Strukturierte Stilrevision gespeichert.",
            )
          }
        >
          Strukturierte Stilrevision speichern
        </button>
        <button
          disabled={disabled || !changed}
          onClick={() =>
            setDraft(profile.portableStyle ?? emptyStyle(profile.name))
          }
        >
          Strukturierte Änderungen verwerfen
        </button>
        <button
          disabled={disabled || draft.additionalRules.length >= 100}
          onClick={() =>
            setDraft({
              ...draft,
              additionalRules: [
                ...draft.additionalRules,
                {
                  label: `Eigene Regel ${draft.additionalRules.length + 1}`,
                  text: "",
                },
              ],
            })
          }
        >
          Zusatzregel hinzufügen
        </button>
      </details>
      <button
        disabled={disabled || changed}
        onClick={() => {
          setMigration((v) => !v);
          setConfirmed(false);
        }}
      >
        Freitext-Migrationsassistent (Ada Voss / andere Stile)
      </button>
      {migration && (
        <section aria-label="Stil Migration">
          <h4>Original sichern → Vorschläge prüfen → neue Revision</h4>
          <p>
            Alle Originalfelder werden mit ihren unveränderten UTF-8-Texten und
            SHA-256 archiviert. Alte Revisionen und Prompts bleiben erhalten.
            Nur „style“ und „composition“ gehen in die neue Art Direction.
            Andere Kategorien werden ausschließlich im Migrationsprotokoll
            aufbewahrt und keiner Figur automatisch zugeordnet.
          </p>
          {lines.map((l, i) => (
            <article key={i}>
              <p>
                Original ({l.field}): <code>{l.raw}</code>
                <br />
                {l.reason}
              </p>
              <label>
                Kategorie Zeile {i + 1}
                <select
                  aria-label={`Migration Kategorie ${i + 1}`}
                  value={choices[i].category}
                  onChange={(e) => {
                    setChoices(
                      choices.map((c, j) =>
                        i === j
                          ? {
                              ...c,
                              category: e.target.value as MigrationCategory,
                            }
                          : c,
                      ),
                    );
                    setConfirmed(false);
                  }}
                >
                  {migrationCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Übernommener Text Zeile {i + 1}
                <textarea
                  value={choices[i].text}
                  maxLength={8000}
                  onChange={(e) => {
                    setChoices(
                      choices.map((c, j) =>
                        i === j ? { ...c, text: e.target.value } : c,
                      ),
                    );
                    setConfirmed(false);
                  }}
                />
              </label>
            </article>
          ))}
          <label>
            <input
              type="checkbox"
              aria-label="Stilmigration geprüft"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Kategorien und Texte geprüft. Nur ausgewählte
            Stil-/Kompositionsregeln übernehmen; Originale bleiben archiviert.
          </label>
          <button
            disabled={
              disabled ||
              !confirmed ||
              !choices.some((c) => c.category === "style" && c.text.trim())
            }
            onClick={() =>
              void perform(
                () =>
                  window.laceframe.command({
                    type: "migrateStyleRules",
                    profileId: profile.id,
                    sourceRevision: profile.revision,
                    choices,
                  }),
                onSnapshot,
                "Originaltexte gesichert · neue bereinigte Revision erstellt.",
              )
            }
          >
            Migration als neue Stilrevision übernehmen
          </button>
          <button onClick={() => setMigration(false)}>
            Migration abbrechen
          </button>
        </section>
      )}
      {snapshot.project.styleMigrations
        .filter((m) => m.profileId === profile.id)
        .map((m) => (
          <details key={m.id}>
            <summary>
              Originalsicherung R{m.sourceRevision} ·{" "}
              {new Date(m.createdAt).toLocaleString()}
            </summary>
            {m.sources.map((s) => (
              <div key={s.field}>
                <strong>
                  {s.field} · SHA-256 {s.sha256}
                </strong>
                <pre>{s.text}</pre>
              </div>
            ))}
          </details>
        ))}
    </section>
  );
}
