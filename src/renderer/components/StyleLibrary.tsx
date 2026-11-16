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
}: {
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
  const [dirty, setDirty] = useState(false);
  const [analysisDirty, setAnalysisDirty] = useState(false);
  useEffect(
    () => onDirtyChange(dirty || analysisDirty),
    [dirty, analysisDirty, onDirtyChange],
  );
  function canDiscard() {
    if (
      (dirty || analysisDirty) &&
      !window.confirm("Ungespeicherte Stilregeln verwerfen?")
    )
      return false;
    setDirty(false);
    return true;
  }
  useEffect(() => {
    if (selectedId && selectedId !== selected) {
      if (canDiscard()) {
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
        "Neue Stilrevision gespeichert.",
      );
  }
  function importReference(file?: File) {
    if (busy || !profile || historical || creating || !canDiscard()) return;
    void perform(
      async () => {
        if (file && file.size > MAX_STYLE_BYTES)
          throw new Error("Stilreferenzen dürfen höchstens 8 MiB groß sein.");
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
      "Stilreferenz importiert · neue Revision gespeichert.",
    );
  }
  return (
    <section className="panel style-library" aria-label="Stilbibliothek">
      <h2>Art Direction · gemeinsamer Spielstil</h2>
      {profile && !creating && !historical && (
        <button
          onClick={(e) =>
            e.currentTarget
              .closest(".style-library")
              ?.querySelector(".style-analyzer")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          Stil analysieren ↓
        </button>
      )}
      <p className="muted">
        Stilbilder bestimmen Rendering, Licht und Farbbehandlung. Gesicht,
        Haare, Kleidung und Persönlichkeit stammen ausschließlich vom
        Charakter-Master. Maximal sechs Referenzen à 8 MiB / 16 Megapixel pro
        Profil. Entfernen erzeugt eine neue Revision; alte Referenzen bleiben
        erhalten.
      </p>
      {p.artDirections.length > 0 && (
        <div className="inspector-options">
          <label>
            Profil bearbeiten
            <select
              aria-label="Stilbibliothek Profil"
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
            Revision
            <select
              aria-label="Stilrevision ansehen"
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
                      ? " · aktuell"
                      : " · unveränderlich"}
                  </option>
                ))}
            </select>
          </label>
        </div>
      )}
      {historical && (
        <p className="warning">
          Historische Revision · schreibgeschützt. Änderungen erfolgen
          ausschließlich an der aktuellen Revision.
        </p>
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
              "Art Direction aktualisiert.",
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
              "Art Direction angelegt und ausgewählt.",
            );
        }}
      >
        <fieldset className="workspace" disabled={busy || Boolean(historical)}>
          <label>
            Stilname
            <input
              name="name"
              aria-label="Stilname"
              required
              maxLength={120}
              defaultValue={creating ? "" : (shown?.name ?? "")}
            />
          </label>
          <label>
            Rendering-Regeln (ohne Charakter- oder Outfitmerkmale)
            <textarea
              name="renderRules"
              aria-label="Rendering-Regeln (ohne Charakter- oder Outfitmerkmale)"
              required
              rows={3}
              maxLength={8000}
              defaultValue={creating ? "" : (shown?.renderRules ?? "")}
            />
          </label>
          <div className="style-rules-grid">
            <h3>Lighting · Color · Framing</h3>
            {(
              [
                ["description", "Beschreibung"],
                ["lightingRules", "Licht und Schattierung"],
                ["colorRules", "Farbe und Kontrast"],
                ["framingRules", "Komposition"],
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
              ? "Stilrevision speichern"
              : "Stil anlegen und auswählen"}
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
            {creating ? "Profilanlage abbrechen" : "Weiteren Stil anlegen"}
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
                "Projektstandard gesetzt.",
              )
            }
          >
            Als Projektstandard festlegen
          </button>
        </div>
      )}
      {profile && !creating && (
        <section
          className="style-reference-drop"
          aria-label="Stilreferenzen importieren"
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
                  error: "Bitte genau ein Stilbild pro Import ablegen.",
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
                    caption={`Stil ${i + 1} · ${asset.name}`}
                    zoom="fit"
                  />
                  <small>
                    {asset.width} × {asset.height} · SHA-256{" "}
                    {asset.sha256.slice(0, 12)}…
                  </small>
                  {!historical && (
                    <button
                      onClick={() =>
                        updateReferences(ids.filter((r) => r !== id))
                      }
                    >
                      Stilreferenz {i + 1} entfernen
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
                Stilbild importieren …
              </button>
              <small>
                PNG/WebP hier ablegen · Dateien bleiben unverändert.
              </small>
              {p.styleAssets.some((a) => !ids.includes(a.id)) && (
                <label>
                  Gespeicherte Referenz wiederverwenden
                  <select
                    aria-label="Stilreferenz wiederverwenden"
                    value=""
                    disabled={ids.length >= 6}
                    onChange={(e) => updateReferences([...ids, e.target.value])}
                  >
                    <option value="" disabled>
                      Referenz wählen
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
          {!ids.length && (
            <p className="muted">
              Diese Revision verwendet ausschließlich Textregeln und den eigenen
              Charakter-Master.
            </p>
          )}
        </section>
      )}
      {profile && !creating && !historical && (
        <StyleAnalyzer
          key={profile.id}
          snapshot={snapshot}
          profileId={profile.id}
          perform={perform}
          busy={busy || dirty}
          onSnapshot={onSnapshot}
          onDirtyChange={setAnalysisDirty}
        />
      )}
      <section className="style-assignments">
        <h3>Charakterzuordnung & Projektstandard</h3>
        <p>
          Projektstandard:{" "}
          {p.artDirections.find((s) => s.id === p.defaultArtDirectionId)
            ?.name ?? "Keiner"}
          . Entwürfe im Studio verwenden die aktuelle Revision; gespeicherte
          Versuche behalten ihre Referenzen.
        </p>
        {p.characters.map((c) => (
          <label key={c.id}>
            {c.name}
            <select
              aria-label={`Stilzuordnung ${c.name}`}
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
                  "Charakterstil gespeichert.",
                )
              }
            >
              <option value="project">Projektstandard</option>
              <option value="master">Eigener Masterstil</option>
              {p.artDirections.map((s) => (
                <option key={s.id} value={`profile:${s.id}`}>
                  {s.name} · R{s.revision}
                </option>
              ))}
            </select>
          </label>
        ))}
      </section>
    </section>
  );
}
