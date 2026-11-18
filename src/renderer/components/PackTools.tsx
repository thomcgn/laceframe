import { uiLabel } from "../../shared/locales";
import { displayMessage } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
import { useState } from "react";
import type { Snapshot } from "../../shared/domain";
import type { PackKind, PackPreview } from "../../shared/packs";
import type { Perform } from "./StyleLibrary";

export function PackTools({
  snapshot,
  kind,
  profileId,
  familyId,
  disabled,
  perform,
  onSnapshot,
}: {
  snapshot: Snapshot;
  kind: PackKind;
  profileId?: string;
  familyId?: string;
  disabled: boolean;
  perform: Perform;
  onSnapshot: (s: Snapshot) => void;
}) {
  const [preview, setPreview] = useState<PackPreview>();
  const [choices, setChoices] = useState<
    Record<string, "new" | "update" | "skip">
  >({});
  const [all, setAll] = useState(true);
  const [scopeReviewed, setScopeReviewed] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <section
      className="pack-tools"
      aria-label={tr("styles.m586d3b2d24", { v0: kind })}
    >
      <h3>
        {kind === "style" ? tr("styles.m44c81a180e") : tr("styles.mbf50a1b55d")}{" "}
        {tr("styles.me46fed87f5")}
      </h3>
      <p>{tr("styles.m11b6586c7c")}</p>
      {kind === "style" && (
        <label>
          <input
            type="checkbox"
            aria-label={tr("styles.m00192afca2")}
            checked={scopeReviewed}
            onChange={(e) => setScopeReviewed(e.target.checked)}
          />
          {tr("styles.m65568e4272")}
        </label>
      )}
      {kind === "expressions" && (
        <label>
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          {tr("styles.mbce98856ab")}
        </label>
      )}
      <div className="button-row">
        <button
          disabled={
            disabled ||
            (kind === "style" && (!profileId || !scopeReviewed)) ||
            (kind === "expressions" && !all && !familyId)
          }
          onClick={() =>
            void perform(
              () =>
                window.laceframe.exportPack({
                  kind,
                  ...(kind === "style"
                    ? { styleScopeReviewed: true as const }
                    : {}),
                  ...(profileId ? { profileId } : {}),
                  ...(kind === "expressions"
                    ? {
                        familyIds: all
                          ? snapshot.project.families.map((f) => f.id)
                          : [familyId!],
                      }
                    : {}),
                }),
              (r) => {
                if (r) setNotice(tr("styles.m9e457d2970", { v0: r.name }));
              },
            )
          }
        >
          {tr("styles.mc5b23ea5b4")}
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            void perform(
              () => window.laceframe.choosePack(kind),
              (r) => {
                if (r) {
                  setPreview(r);
                  setChoices(
                    Object.fromEntries(
                      r.rows.map((row) => [
                        row.key,
                        row.status === "neu" ? "new" : "skip",
                      ]),
                    ),
                  );
                  setNotice("");
                }
              },
            )
          }
        >
          {tr("styles.m2ca1420576")}
        </button>
      </div>
      {notice && <p role="status">{displayMessage(notice)}</p>}
      {preview && (
        <section aria-label={tr("styles.maf40cc1713")}>
          <h4>
            {tr("styles.m8504f7f8dc")}
            {preview.pack.format} {tr("styles.m9d16607529")}
          </h4>
          <p>{tr("styles.mbb431e7cd6")}</p>
          {preview.rows.map((row) => (
            <article key={row.key}>
              <strong>
                {row.label} ·{" "}
                {choices[row.key] === "skip" ? tr("styles.m74b24cbcfc") : ""}
                {uiLabel(row.status)}
              </strong>
              <p>{displayMessage(row.reason)}</p>
              <label>
                {tr("styles.m61a61ea61d")}
                {row.label}
                <select
                  aria-label={tr("styles.m1a11f1eabe", { v0: row.label })}
                  value={choices[row.key]}
                  disabled={disabled}
                  onChange={(e) =>
                    setChoices({
                      ...choices,
                      [row.key]: e.target.value as "new" | "update" | "skip",
                    })
                  }
                >
                  <option value="skip">{tr("styles.m8e463fdd54")}</option>
                  <option value="new">{tr("styles.mfff9b2f3c5")}</option>
                  <option
                    value="update"
                    disabled={!row.targetId || row.status === "Konflikt"}
                  >
                    {tr("styles.m65d329d23b")}
                  </option>
                </select>
              </label>
            </article>
          ))}
          <details>
            <summary>{tr("styles.md5410ed454")}</summary>
            <pre>{JSON.stringify(preview.pack, null, 2)}</pre>
          </details>
          <button
            disabled={
              disabled || preview.rows.every((r) => choices[r.key] === "skip")
            }
            onClick={() =>
              void perform(
                () =>
                  window.laceframe.command({
                    type: "importPack",
                    pack: preview.pack,
                    projectHash: preview.projectHash,
                    choices: preview.rows.map((r) => ({
                      key: r.key,
                      action: choices[r.key],
                    })),
                  }),
                (s) => {
                  onSnapshot(s);
                  setPreview(undefined);
                  setNotice(tr("styles.m7d9d7f56f2"));
                },
              )
            }
          >
            {tr("styles.m5e0a71e791")}
          </button>
          <button disabled={disabled} onClick={() => setPreview(undefined)}>
            {tr("styles.meb72a3a518")}
          </button>
        </section>
      )}
    </section>
  );
}
