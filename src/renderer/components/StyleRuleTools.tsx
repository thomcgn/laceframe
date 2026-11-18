import { displayMessage } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
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
    <section className="style-rule-tools" aria-label={tr("styles.mf91e0d47d2")}>
      {unmapped.length > 0 && (
        <p className="warning">
          {unmapped.length} {tr("styles.m5379a438f3")}{" "}
          {unmapped.map((h) => h.slice(0, 12)).join(", ")}
          {tr("common.mbadda987b4")}
        </p>
      )}
      <details>
        <summary>{tr("styles.m5501901f8e")}</summary>
        <p>{tr("styles.m778f0b8c5c")}</p>
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
            <small>{displayMessage(l.reason)}</small>
          </p>
        ))}
      </details>
      <details>
        <summary>{tr("styles.mc8a3ab156a")}</summary>
        <p>{tr("styles.madc0b36711")}</p>
        <label>
          {tr("styles.mca724ccd62")}
          <select
            aria-label={tr("styles.me58ede8295")}
            value={draft.category}
            onChange={(e) =>
              setDraft({
                ...draft,
                category: e.target.value as StyleContent["category"],
              })
            }
          >
            <option value="portrait">{tr("styles.mf71094c301")}</option>
            <option value="sprite">{tr("styles.m610cc33146")}</option>
            <option value="scene">{tr("styles.m477e5af2fd")}</option>
          </select>
        </label>
        {(
          [
            ["intent", tr("common.m9e5f8740e2")],
            ["contours", tr("styles.mf856440ec7")],
            ["pixelClusters", tr("styles.m5d97b5abdd")],
            ["apparentDensity", tr("styles.mce175672c2")],
            ["shading", tr("styles.m4e261ab179")],
            ["materials", tr("common.mc4b2dfd9a3")],
            ["colorTreatment", tr("styles.m3d5e338c72")],
            ["lighting", tr("styles.m9e6e136c9c")],
            ["composition", tr("styles.m6f8cc4519d")],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {displayMessage(label)}
            <textarea
              aria-label={displayMessage(label)}
              maxLength={8000}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
        {(["positiveRules", "negativeRules"] as const).map((key) => (
          <label key={key}>
            {key === "positiveRules"
              ? tr("styles.m644ae2c01e")
              : tr("styles.m74cc8cbf8a")}{" "}
            {tr("styles.mcd6989cf3c")}
            <textarea
              aria-label={
                key === "positiveRules"
                  ? tr("styles.m644ae2c01e")
                  : tr("styles.m74cc8cbf8a")
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
            {tr("styles.mea87555a03")}
            {rule.label}
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
              tr("styles.ma5931eb9e5"),
            )
          }
        >
          {tr("styles.m8684abfe20")}
        </button>
        <button
          disabled={disabled || !changed}
          onClick={() =>
            setDraft(profile.portableStyle ?? emptyStyle(profile.name))
          }
        >
          {tr("styles.ma2ee33e9bb")}
        </button>
        <button
          disabled={disabled || draft.additionalRules.length >= 100}
          onClick={() =>
            setDraft({
              ...draft,
              additionalRules: [
                ...draft.additionalRules,
                {
                  label: tr("styles.m22e73c810c", {
                    v0: draft.additionalRules.length + 1,
                  }),
                  text: "",
                },
              ],
            })
          }
        >
          {tr("styles.mc701572662")}
        </button>
      </details>
      <button
        disabled={disabled || changed}
        onClick={() => {
          setMigration((v) => !v);
          setConfirmed(false);
        }}
      >
        {tr("styles.me0a64f2a41")}
      </button>
      {migration && (
        <section aria-label={tr("styles.mb2e8132c70")}>
          <h4>{tr("styles.m908d855c43")}</h4>
          <p>{tr("styles.mc8e5a3328f")}</p>
          {lines.map((l, i) => (
            <article key={i}>
              <p>
                {tr("styles.md835bf1b24")}
                {l.field}): <code>{l.raw}</code>
                <br />
                {displayMessage(l.reason)}
              </p>
              <label>
                {tr("styles.md4d683795a")}
                {i + 1}
                <select
                  aria-label={tr("styles.m4289716352", { v0: i + 1 })}
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
                {tr("styles.mf65a387fb8")}
                {i + 1}
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
              aria-label={tr("styles.m18b6cdc6f7")}
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {tr("styles.m8c997e0db3")}
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
                tr("styles.m5a8a11858b"),
              )
            }
          >
            {tr("styles.m4db233c758")}
          </button>
          <button onClick={() => setMigration(false)}>
            {tr("styles.mcbc6316b32")}
          </button>
        </section>
      )}
      {snapshot.project.styleMigrations
        .filter((m) => m.profileId === profile.id)
        .map((m) => (
          <details key={m.id}>
            <summary>
              {tr("styles.m047646223a")}
              {m.sourceRevision} · {new Date(m.createdAt).toLocaleString()}
            </summary>
            {m.sources.map((s) => (
              <div key={s.field}>
                <strong>
                  {s.field} {tr("styles.md7e1f4d17c")}
                  {s.sha256}
                </strong>
                <pre>{s.text}</pre>
              </div>
            ))}
          </details>
        ))}
    </section>
  );
}
