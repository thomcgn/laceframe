import { StyleCreator } from "./StyleCreator";
import { tr } from "../../shared/locales/index";
import { PackTools } from "./PackTools";
import { StyleRuleTools } from "./StyleRuleTools";
import { StyleAnalyzer } from "./StyleAnalyzer";
import { useEffect, useState } from "react";
import type { Snapshot } from "../../shared/domain";
import { effectiveStyle } from "../../shared/domain";
import type { Result } from "../../shared/bridge";
import { MAX_STYLE_BYTES } from "../../shared/style";
import { ImagePreview } from "./ImagePreview";
export type Perform = <T>(
  work: () => Promise<Result<T>>,
  success: (value: T) => void,
  notice?: string,
) => Promise<void>;
async function unwrap<T>(promise: Promise<Result<T>>) {
  const r = await promise;
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
export function StyleLibrary({
  snapshot,
  busy,
  perform,
  onSnapshot,
  selectedId,
  requestSerial,
  onDirtyChange,
  onRunningChange,
  onUseStyle,
}: {
  onUseStyle: (id: string) => void;
  onRunningChange: (running: boolean) => void;
  selectedId?: string;
  requestSerial?: number;
  onDirtyChange: (dirty: boolean) => void;
  snapshot: Snapshot;
  busy: boolean;
  perform: Perform;
  onSnapshot: (s: Snapshot) => void;
}) {
  const p = snapshot.project,
    effective = effectiveStyle(p, p.selectedCharacterId);
  const [selected, setSelected] = useState(
    effective?.id ?? p.artDirections[0]?.id ?? "",
  );
  const [creating, setCreating] = useState(false),
    [revision, setRevision] = useState<number | undefined>();
  const [tab, setTab] = useState<"library" | "create" | "details">("library");
  const [creatorDirty, setCreatorDirty] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const [packDirty, setPackDirty] = useState(false);
  useEffect(
    () => onDirtyChange(dirty || analysisDirty || packDirty || creatorDirty),
    [dirty, analysisDirty, packDirty, creatorDirty, onDirtyChange],
  );
  function canDiscard() {
    if (
      (dirty || analysisDirty || packDirty) &&
      !window.confirm(tr("styles.mf7d7f1f61c"))
    )
      return false;
    setDirty(false);
    return true;
  }
  useEffect(() => {
    if (selectedId) {
      if (canDiscard()) {
        setTab("details");
        setSelected(selectedId);
        setRevision(undefined);
      }
    }
  }, [selectedId, requestSerial]);
  const profile = p.artDirections.find((a) => a.id === selected) ?? effective;
  const historical =
    profile && revision !== undefined && revision !== profile.revision;
  const shown = historical
    ? p.artDirectionRevisions.find(
        (r) => r.profileId === profile.id && r.revision === revision,
      )
    : profile;
  const ids = shown?.styleReferenceIds ?? [];
  function acceptSnapshot(saved: Snapshot) {
    onSnapshot(saved);
    setDirty(false);
    setRevision(undefined);
  }
  function updateReferences(next: string[]) {
    if (profile && canDiscard())
      void perform(
        () =>
          window.laceframe.command({
            type: "setStyleReferences",
            profileId: profile.id,
            ids: next,
          }),
        acceptSnapshot,
        tr("styles.mbdd39c7919"),
      );
  }
  function importReference(file?: File) {
    if (busy || !profile || historical || creating || !canDiscard()) return;
    void perform(
      async () => {
        if (file && file.size > MAX_STYLE_BYTES)
          throw new Error(tr("styles.m83b29bab94"));
        const staged = await unwrap(
          file
            ? window.laceframe.stageImage(
                new Uint8Array(await file.arrayBuffer()),
                file.name,
              )
            : window.laceframe.chooseImage(),
        );
        if (!staged) return { ok: true as const, value: snapshot };
        try {
          return await window.laceframe.command({
            type: "importStyleReference",
            profileId: profile.id,
            token: staged.token,
          });
        } finally {
          await window.laceframe.discardImage(staged.token);
        }
      },
      acceptSnapshot,
      tr("styles.m7ba5cb82c9"),
    );
  }
  return (
    <section
      className="panel style-library"
      aria-label={tr("styles.m40a6d6e653")}
    >
      <h2>{tr("styles.m10ff093eeb")}</h2>
      <nav className="studio-tabs" aria-label={tr("styleCreator.tabs")}>
        {(["library", "create", "details"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {tr(
              value === "library"
                ? "styleCreator.library"
                : value === "create"
                  ? "styleCreator.create"
                  : "styleCreator.details",
            )}
          </button>
        ))}
      </nav>
      <div hidden={tab !== "library"} className="style-reference-grid">
        {!p.artDirections.length && <p>{tr("styleCreator.emptyLibrary")}</p>}
        {p.artDirections.map((style) => (
          <article key={style.id} className="style-reference-card">
            {style.styleReferenceIds?.[0] ? (
              <ImagePreview
                id={style.styleReferenceIds?.[0]}
                caption={tr("styleCreator.preview")}
                zoom="fit"
              />
            ) : (
              <p>{tr("styleCreator.noPreview")}</p>
            )}
            <h3>
              {style.name} · {tr("styles.mda8ec3e284")} {style.revision}
            </h3>
            <p>{style.description}</p>
            <button
              disabled={busy || !p.selectedCharacterId}
              onClick={() => onUseStyle(style.id)}
            >
              {tr("styleCreator.useStyle")}
            </button>
            <button
              onClick={() => {
                if (canDiscard()) {
                  setSelected(style.id);
                  setRevision(undefined);
                  setTab("details");
                }
              }}
            >
              {tr("styleCreator.selectDetails", { name: style.name })}
            </button>
          </article>
        ))}
      </div>
      <div hidden={tab !== "create"}>
        <StyleCreator
          busy={busy}
          onDirtyChange={setCreatorDirty}
          onRunningChange={onRunningChange}
          onSaved={(saved) => {
            acceptSnapshot(saved);
            setSelected(saved.project.artDirections.at(-1)!.id);
            setTab("library");
          }}
        />
      </div>
      <div hidden={tab !== "details"}>
        {shown?.portableStyle?.creator && (
          <section>
            <p>{tr("styleCreator.sourceDeclared")}</p>
            <h3>{tr("styleCreator.palette")}</h3>
            <div className="palette-row">
              {shown.portableStyle.creator.workingPalette.map(
                (color, index) => (
                  <span
                    key={index}
                    style={{ borderBottom: `8px solid ${color}`, padding: 6 }}
                  >
                    {color}
                  </span>
                ),
              )}
            </div>
            <p>
              {shown.portableStyle.creator.semantic?.provider ??
                tr("styleCreator.noSemantic")}{" "}
              {shown.portableStyle.creator.semantic?.model}
            </p>
            {shown.portableStyle.creator.semantic?.result.interpretations.map(
              (item, index) => (
                <p key={index}>
                  {item.label} ·{" "}
                  {tr(
                    item.confidence === "uncertain"
                      ? "styleCreator.uncertain"
                      : item.confidence === "plausible"
                        ? "styleCreator.plausible"
                        : "styleCreator.strong",
                  )}{" "}
                  · {item.evidence}
                </p>
              ),
            )}
            <details>
              <summary>{tr("styleCreator.expert")}</summary>
              <pre>{JSON.stringify(shown.portableStyle.creator, null, 2)}</pre>
            </details>
          </section>
        )}
        {profile && !creating && !historical && (
          <button
            onClick={(e) =>
              e.currentTarget
                .closest(".style-library")
                ?.querySelector(".style-analyzer")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            {tr("styles.md0cfd0a005")}
          </button>
        )}
        <p className="muted">{tr("styles.m080e2f06a2")}</p>
        {p.artDirections.length > 0 && (
          <div className="inspector-options">
            <label>
              {tr("styles.m4f2308fddd")}
              <select
                aria-label={tr("styles.m61040e7ef9")}
                value={profile?.id ?? ""}
                onChange={(e) => {
                  if (!canDiscard()) return;
                  setSelected(e.target.value);
                  setRevision(undefined);
                  setCreating(false);
                }}
              >
                {p.artDirections.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("styles.m2e516d68f4")}
              <select
                aria-label={tr("styles.m166afaedca")}
                value={revision ?? profile?.revision ?? ""}
                onChange={(e) => {
                  if (canDiscard()) setRevision(Number(e.target.value));
                }}
              >
                {p.artDirectionRevisions
                  .filter((r) => r.profileId === profile?.id)
                  .sort((a, b) => b.revision - a.revision)
                  .map((r) => (
                    <option key={r.revision} value={r.revision}>
                      V{r.revision}
                      {r.revision === profile?.revision
                        ? tr("styles.mba1a319fa6")
                        : tr("styles.mb27b5d0ace")}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
        {historical && <p className="warning">{tr("styles.mcbec161277")}</p>}
        <PackTools
          key={`pack:${profile?.id}/${profile?.revision}`}
          snapshot={snapshot}
          kind="style"
          profileId={profile?.id}
          disabled={
            busy ||
            dirty ||
            analysisDirty ||
            packDirty ||
            creating ||
            Boolean(historical)
          }
          perform={perform}
          onSnapshot={acceptSnapshot}
        />
        {profile && !creating && !historical && (
          <StyleRuleTools
            key={`rules:${profile.id}/${profile.revision}`}
            snapshot={snapshot}
            profile={profile}
            onDirtyChange={setPackDirty}
            disabled={busy || dirty || analysisDirty}
            perform={perform}
            onSnapshot={acceptSnapshot}
          />
        )}
        <form
          onChange={() => setDirty(true)}
          key={creating ? "new" : `${profile?.id}/${shown?.revision}`}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const fields = {
              name: String(data.get("name") ?? "").trim(),
              renderRules: String(data.get("renderRules") ?? "").trim(),
              description: String(data.get("description") ?? ""),
              lightingRules: String(data.get("lightingRules") ?? ""),
              colorRules: String(data.get("colorRules") ?? ""),
              framingRules: String(data.get("framingRules") ?? ""),
            };
            if (profile && !creating)
              void perform(
                () =>
                  window.laceframe.command({
                    type: "updateArtDirection",
                    id: profile.id,
                    ...fields,
                  }),
                acceptSnapshot,
                tr("styles.mb862058241"),
              );
            else
              void perform(
                async () => {
                  const saved = await unwrap(
                    window.laceframe.command({
                      type: "addArtDirection",
                      ...fields,
                    }),
                  );
                  onSnapshot(saved);
                  const id = saved.project.artDirections.at(-1)!.id;
                  setSelected(id);
                  setCreating(false);
                  setRevision(undefined);
                  return window.laceframe.command({
                    type: "setArtDirection",
                    id,
                  });
                },
                acceptSnapshot,
                tr("styles.m44b15c4667"),
              );
          }}
        >
          <fieldset
            className="workspace"
            disabled={busy || Boolean(historical)}
          >
            <label>
              {tr("styles.m14e1c21ccb")}
              <input
                name="name"
                aria-label={tr("styles.m14e1c21ccb")}
                required
                maxLength={120}
                defaultValue={creating ? "" : (shown?.name ?? "")}
              />
            </label>
            <label>
              {tr("styles.m6db0908598")}
              <textarea
                name="renderRules"
                aria-label={tr("styles.m6db0908598")}
                required
                rows={3}
                maxLength={8000}
                defaultValue={creating ? "" : (shown?.renderRules ?? "")}
              />
            </label>
            <div className="style-rules-grid">
              <h3>{tr("styles.m6ba9a6ea7b")}</h3>
              {(
                [
                  ["description", tr("styles.me9262f007d")],
                  ["lightingRules", tr("styles.m76dfdbc997")],
                  ["colorRules", tr("styles.mdda8779748")],
                  ["framingRules", tr("styles.mbed1d1f0fa")],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    name={key}
                    aria-label={label}
                    rows={2}
                    maxLength={4000}
                    defaultValue={creating ? "" : (shown?.[key] ?? "")}
                  />
                </label>
              ))}
            </div>
            <button type="submit">
              {profile && !creating
                ? tr("styles.m836a411379")
                : tr("styles.mb68f55e6eb")}
            </button>
          </fieldset>
        </form>
        {profile && (
          <div className="button-row">
            <button
              onClick={() => {
                if (!canDiscard()) return;
                setCreating((v) => !v);
                setRevision(undefined);
              }}
            >
              {creating ? tr("styles.m0e1eb3674c") : tr("styles.m3c2c43bfc7")}
            </button>
            <button
              disabled={
                creating ||
                Boolean(historical) ||
                p.defaultArtDirectionId === profile.id
              }
              onClick={() =>
                void perform(
                  () =>
                    window.laceframe.command({
                      type: "setArtDirection",
                      id: profile.id,
                    }),
                  acceptSnapshot,
                  tr("styles.mb80cfd4f3d"),
                )
              }
            >
              {tr("styles.md0503219e5")}
            </button>
          </div>
        )}
        {profile && !creating && (
          <section
            className="style-reference-drop"
            aria-label={tr("styles.m3e54203a19")}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files.length !== 1) {
                void perform(
                  async () => ({
                    ok: false as const,
                    error: tr("styles.m78514dd815"),
                  }),
                  () => {},
                );
                return;
              }
              importReference(e.dataTransfer.files[0]);
            }}
          >
            <div className="style-thumbnails">
              {ids.map((id, i) => {
                const asset = p.styleAssets.find((a) => a.id === id)!;
                return (
                  <div className="style-thumb" key={id}>
                    <ImagePreview
                      id={id}
                      caption={tr("styles.mabc728b1a2", {
                        v0: i + 1,
                        v1: asset.name,
                      })}
                      zoom="fit"
                    />
                    <small>
                      {asset.width} × {asset.height} {tr("styles.md7e1f4d17c")}{" "}
                      {asset.sha256.slice(0, 12)}…
                    </small>
                    {!historical && (
                      <button
                        onClick={() =>
                          updateReferences(ids.filter((r) => r !== id))
                        }
                      >
                        {tr("styles.md7f9a116bd")}
                        {i + 1} {tr("styles.mc64e600651")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {!historical && (
              <>
                <button
                  disabled={busy || ids.length >= 6}
                  onClick={() => importReference()}
                >
                  {tr("styles.m8164c68ee6")}
                </button>
                <small>{tr("styles.m666f355b5d")}</small>
                {p.styleAssets.some((a) => !ids.includes(a.id)) && (
                  <label>
                    {tr("styles.mdeb20b0df0")}
                    <select
                      aria-label={tr("styles.mbffd3a44d6")}
                      value=""
                      disabled={ids.length >= 6}
                      onChange={(e) =>
                        updateReferences([...ids, e.target.value])
                      }
                    >
                      <option value="" disabled>
                        {tr("styles.m75e8f7ca3e")}
                      </option>
                      {p.styleAssets
                        .filter((a) => !ids.includes(a.id))
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} · {a.sha256.slice(0, 8)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </>
            )}
            {!ids.length && <p className="muted">{tr("styles.m8ee60d55f4")}</p>}
          </section>
        )}
        {profile && !creating && !historical && (
          <StyleAnalyzer
            key={profile.id}
            snapshot={snapshot}
            profileId={profile.id}
            perform={perform}
            busy={busy || dirty || packDirty}
            onSnapshot={onSnapshot}
            onDirtyChange={setAnalysisDirty}
          />
        )}
        <section className="style-assignments">
          <h3>{tr("styles.mb2224c2e27")}</h3>
          <p>
            {tr("styles.mb4b82b5a38")}{" "}
            {p.artDirections.find((s) => s.id === p.defaultArtDirectionId)
              ?.name ?? "Keiner"}
            {tr("common.mdb0033aac0")}
          </p>
          {p.characters.map((c) => (
            <label key={c.id}>
              {c.name}
              <select
                aria-label={tr("styles.m19e51378fd", { v0: c.name })}
                value={
                  c.styleSelection?.mode === "master"
                    ? "master"
                    : c.styleSelection?.mode === "profile"
                      ? `profile:${c.styleSelection.profileId}`
                      : "project"
                }
                disabled={busy}
                onChange={(e) =>
                  void perform(
                    () =>
                      window.laceframe.command({
                        type: "setCharacterStyle",
                        characterId: c.id,
                        selection:
                          e.target.value === "project"
                            ? { mode: "project" }
                            : e.target.value === "master"
                              ? { mode: "master" }
                              : {
                                  mode: "profile",
                                  profileId: e.target.value.slice(8),
                                },
                      }),
                    onSnapshot,
                    tr("styles.m8b06093306"),
                  )
                }
              >
                <option value="project">{tr("styles.m469a6fdfe5")}</option>
                <option value="master">{tr("styles.m8fe2cb824b")}</option>
                {p.artDirections.map((s) => (
                  <option key={s.id} value={`profile:${s.id}`}>
                    {s.name} {tr("styles.mda8ec3e284")}
                    {s.revision}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
      </div>
    </section>
  );
}
