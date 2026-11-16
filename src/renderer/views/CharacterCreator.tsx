import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { Snapshot, Command } from "../../shared/domain";
import {
  characterCreationDraftSchema,
  composeCharacterPrompt,
  DEFAULT_COMPOSITION,
  type CharacterCreationDraft,
} from "../../shared/character-creation";
import {
  executionLabel,
  newComposer,
  updateComposer,
  type CodexStatus,
} from "../../shared/generation";
import type { Result } from "../../shared/bridge";
import { ImagePreview } from "../components/ImagePreview";
import { MasterCandidateCompare } from "../components/MasterCandidateCompare";
import { PromptComposer } from "../components/PromptComposer";
type Perform = <T>(
  work: () => Promise<Result<T>>,
  success: (v: T) => void,
  notice?: string,
) => Promise<void>;
export function CharacterCreator({
  snapshot,
  visible,
  busy,
  perform,
  onSnapshot,
  onRunningChange,
  onClose,
  onExpressions,
}: {
  snapshot: Snapshot;
  visible: boolean;
  busy: boolean;
  perform: Perform;
  onSnapshot: (s: Snapshot) => void;
  onRunningChange: (r: boolean) => void;
  onClose: () => void;
  onExpressions: () => void;
}) {
  const p = snapshot.project,
    character = p.characters.find((c) => c.id === p.selectedCharacterId);
  const attempts = p.masterAttempts.filter(
      (a) => a.characterId === character?.id,
    ),
    latest = attempts.at(-1);
  const identities = p.identityAssets.filter(
    (a) => a.characterId === character?.id && !a.removedAt,
  );
  const [name, setName] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [styleId, setStyleId] = useState(
    latest?.artDirectionId ?? p.defaultArtDirectionId ?? "",
  );
  const style = p.artDirections.find((s) => s.id === styleId);
  const styleRefs = (style?.styleReferenceIds ?? []).map((id) => {
    const a = p.styleAssets.find((a) => a.id === id)!;
    return { id: a.id, sha256: a.sha256 };
  });
  const [outfit, setOutfit] = useState(latest?.outfit ?? "");
  const [identityNotes, setIdentityNotes] = useState(
    latest?.identityNotes ?? "",
  );
  const [composition, setComposition] = useState(
    latest?.composition ?? DEFAULT_COMPOSITION,
  );
  const [activeId, setActiveId] = useState(latest?.id ?? "");
  const active = attempts.find((a) => a.id === activeId),
    candidate = p.masterCandidates.find((c) => c.attemptId === active?.id);
  const [referenceId, setReferenceId] = useState("");
  const activeReference = p.identityAssets.find(
    (a) =>
      a.id ===
      (referenceId || active?.identityReferences[0]?.id || identities[0]?.id),
  );
  const [codex, setCodex] = useState<CodexStatus>({
    state: "unavailable",
    message: "Codex-Verfügbarkeit prüfen.",
  });
  const settings = character
    ? {
        characterId: character.id,
        identityReferences: identities.map((a) => ({
          id: a.id,
          sha256: a.sha256,
        })),
        identityNotes,
        artDirectionId: style?.id,
        artDirectionRevision: style?.revision,
        styleReferences: styleRefs,
        outfit,
        composition,
      }
    : undefined;
  // Keep incomplete form editable; compose only when the required content is available.
  const base =
    settings &&
    characterCreationDraftSchema
      .omit({ operation: true, prompt: true })
      .safeParse(settings).success
      ? composeCharacterPrompt(p, settings)
      : "";
  const [composer, setComposer] = useState(() => newComposer(base));
  useEffect(
    () => setComposer((old) => updateComposer(old, base)),
    [base, composer.base],
  );
  useEffect(() => {
    if (composer.pendingBase !== undefined) setPromptOpen(true);
  }, [composer.pendingBase]);
  const draft = settings
    ? {
        ...settings,
        operation: "create-character-master" as const,
        prompt: composer.text,
      }
    : undefined;
  const running = codex.state === "running";
  const valid = Boolean(
    !character?.masterId &&
      draft &&
      characterCreationDraftSchema.safeParse(draft).success &&
      composer.pendingBase === undefined &&
      codex.available &&
      (identities.length + styleRefs.length <= 1 || codex.multipleReferences),
  );
  const wasRunning = useRef(false);
  useEffect(() => {
    if (visible || running || wasRunning.current) onRunningChange(running);
    wasRunning.current = running;
  }, [visible, running, onRunningChange]);
  useEffect(() => {
    if (!visible || running) return;
    let live = true;
    void window.laceframe.checkCodex().then((r) => {
      if (live && r.ok) setCodex(r.value);
    });
    return () => {
      live = false;
    };
  }, [visible]);
  useEffect(() => {
    if (!running) return;
    let live = true,
      pending = false;
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      void window.laceframe
        .generationStatus()
        .then((r) => {
          if (live && r.ok) {
            setCodex(r.value.status);
            if (r.value.status.state !== "running") {
              onSnapshot(r.value.snapshot);
              setActiveId(r.value.status.attemptId ?? "");
            }
          }
        })
        .finally(() => {
          pending = false;
        });
    }, 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [running, onSnapshot]);
  async function unwrap<T>(task: Promise<Result<T>>): Promise<T> {
    const r = await task;
    if (!r.ok) throw new Error(r.error);
    return r.value;
  }
  function command(cmd: Command, notice?: string) {
    void perform(() => window.laceframe.command(cmd), onSnapshot, notice);
  }
  function importIdentity(file?: File) {
    void perform(
      async () => {
        if (!character || character.masterId)
          throw new Error("Zuerst eine Entwurfsfigur anlegen.");
        if (file && file.size > 16 * 1024 * 1024)
          throw new Error("Identitätsbilder bis 16 MiB.");
        const staged = await unwrap(
          file
            ? window.laceframe.stageImage(
                new Uint8Array(await file.arrayBuffer()),
                file.name,
                "identity",
              )
            : window.laceframe.chooseImage("identity"),
        );
        if (!staged) return { ok: true as const, value: snapshot };
        try {
          return await window.laceframe.command({
            type: "importIdentityReference",
            characterId: character.id,
            token: staged.token,
          });
        } finally {
          await window.laceframe.discardImage(staged.token);
        }
      },
      onSnapshot,
      "Identitätsreferenz lokal gespeichert. Noch nicht an Codex gesendet.",
    );
  }
  function generate() {
    if (!valid || !draft) return;
    void perform(
      () => window.laceframe.startGeneration(draft as CharacterCreationDraft),
      (s) => {
        setCodex(s);
        setActiveId(s.attemptId ?? "");
        setComposer((c) => ({ ...c, saved: true }));
        onRunningChange(s.state === "running");
      },
    );
  }
  const slot = document.getElementById("create-action-slot");
  const timing =
    codex.attemptId === activeId
      ? (codex.execution ?? active?.execution)
      : active?.execution;
  return (
    <div className="character-creator">
      {slot &&
        (visible || running) &&
        createPortal(
          <div className="create-action-bar">
            <div className="job-status">
              <p role="status" aria-label="Character Creator Status">
                <strong>
                  {codex.state === "running"
                    ? "Mastergenerierung läuft"
                    : codex.state === "completed"
                      ? "Mastergenerierung abgeschlossen"
                      : codex.state === "failed"
                        ? "Mastergenerierung fehlgeschlagen"
                        : codex.state === "cancelled"
                          ? "Mastergenerierung abgebrochen"
                          : "Character Creator"}
                </strong>
                <span>{codex.message}</span>
              </p>
              {timing && (
                <output
                  aria-label="Mastergenerierungszeit"
                  className="generation-time"
                >
                  {executionLabel(timing, running)}
                </output>
              )}
              <small>
                Nur dieser Klick übermittelt die unten aufgeführten Identitäts-
                und Stilbilder an Codex und nutzt dein Codex-Kontingent.
              </small>
            </div>
            <button
              className="primary"
              disabled={busy || running || !valid}
              onClick={generate}
            >
              Neutralen Masterkandidaten generieren
            </button>
            {running && (
              <button
                className="danger"
                disabled={codex.phase === "stopping"}
                onClick={() =>
                  void perform(
                    () => window.laceframe.cancelGeneration(),
                    (s) => {
                      setCodex(s);
                      void window.laceframe.generationStatus().then((r) => {
                        if (r.ok) {
                          onSnapshot(r.value.snapshot);
                          setActiveId(r.value.status.attemptId ?? "");
                        }
                      });
                    },
                  )
                }
              >
                Mastergenerierung abbrechen
              </button>
            )}
          </div>,
          slot,
        )}
      <div className="section-head">
        <div>
          <p className="eyebrow">CREATE CHARACTER</p>
          <h2>Vom Identitätsbild zum neutralen Master</h2>
        </div>
        <button onClick={onClose}>Zur Charakterbibliothek</button>
      </div>
      <label>
        Aktive Figur
        <select
          aria-label="Creator Figur"
          value={character?.id ?? ""}
          onChange={(e) =>
            command({ type: "selectCharacter", id: e.target.value })
          }
        >
          <option value="" disabled>
            Entwurfsfigur anlegen
          </option>
          {p.characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.masterId ? " · Master gesperrt" : " · Entwurf"}
            </option>
          ))}
        </select>
      </label>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          command({ type: "addCharacter", name }, "Figurenentwurf angelegt.");
        }}
      >
        <label>
          Neue Entwurfsfigur
          <input
            aria-label="Name der Entwurfsfigur"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button>Figurenentwurf anlegen</button>
      </form>
      {character && (
        <>
          <p>
            Aktive Figur: <strong>{character.name}</strong> ·{" "}
            {character.masterId ? "Master V1 gesperrt" : "Entwurf ohne Master"}
          </p>
          {character.masterId && (
            <p className="warning">
              Der freigegebene Master bleibt unverändert. Für eine weitere
              Identität einen neuen Figurenentwurf anlegen.
            </p>
          )}
          <div className="creator-grid">
            <section
              className="panel creator-identity"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (
                  !busy &&
                  !running &&
                  !character.masterId &&
                  e.dataTransfer.files.length === 1
                )
                  importIdentity(e.dataTransfer.files[0]);
              }}
            >
              <h3>1 · Identität</h3>
              <p>
                Bis zu drei Fotos derselben Person oder Illustrationen.
                PNG/JPEG/WebP, je 16 MiB / 16 MP. Originale bleiben lokal, bis
                du generierst.
              </p>
              <button
                disabled={Boolean(character.masterId) || identities.length >= 3}
                onClick={() => importIdentity()}
              >
                Identitätsbild importieren …
              </button>
              <div className="creator-references">
                {identities.map((a, i) => (
                  <div key={a.id}>
                    <ImagePreview
                      id={a.id}
                      caption={`Identität ${i + 1}`}
                      zoom="fit"
                    />
                    <small>
                      {a.width} × {a.height} · {a.format.toUpperCase()} ·{" "}
                      {a.sha256.slice(0, 12)}
                    </small>
                    <button
                      disabled={!candidate}
                      aria-pressed={activeReference?.id === a.id}
                      onClick={() => {
                        setReferenceId(a.id);
                      }}
                    >
                      Vergleichen
                    </button>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            "Identitätsbild aus aktiver Auswahl entfernen? Historisch verwendete Quellen bleiben für ihre Provenienz erhalten; unbenutzte Projektkopien werden gelöscht. Originaldateien außerhalb des Projekts bleiben unverändert.",
                          )
                        )
                          command(
                            { type: "removeIdentityReference", id: a.id },
                            "Referenz entfernt; historische Abhängigkeiten bleiben erhalten.",
                          );
                      }}
                    >
                      Referenz entfernen
                    </button>
                  </div>
                ))}
              </div>
              {p.identityAssets.some(
                (a) => a.characterId === character.id && a.removedAt,
              ) && (
                <small>
                  Entfernte, historisch verwendete Referenzen bleiben im
                  Projektarchiv. Kein sicheres Überschreiben oder Löschen von
                  Codex-internen Dateien wird behauptet.
                </small>
              )}
              <label>
                Identitätsmerkmale
                <textarea
                  aria-label="Creator Identitätsmerkmale"
                  maxLength={4000}
                  rows={2}
                  value={identityNotes}
                  onChange={(e) => setIdentityNotes(e.target.value)}
                />
              </label>
            </section>
            <section className="panel">
              <h3>2 · Art Direction</h3>
              <label>
                Darstellungsstil
                <select
                  aria-label="Creator Art Direction"
                  value={style?.id ?? ""}
                  onChange={(e) => setStyleId(e.target.value)}
                >
                  <option value="">Ohne zusätzliches Stilprofil</option>
                  {p.artDirections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · R{s.revision}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Nur Rendering, Konturen, Licht und Farbe. Keine Gesichtsmerkmale
                oder Kleidung aus Stilbildern übernehmen.
              </p>
              <div className="creator-references">
                {styleRefs.map((r, i) => (
                  <ImagePreview
                    key={r.id}
                    id={r.id}
                    caption={`Stil ${i + 1} · nur Darstellung`}
                    zoom="fit"
                  />
                ))}
              </div>
              {!style && (
                <small>
                  Stilprofile und Stilbilder lassen sich in Create → Art
                  Direction anlegen.
                </small>
              )}
              <h3>3 · Outfit</h3>
              <label>
                Individuelle Kleidung
                <textarea
                  aria-label="Creator Outfit"
                  rows={3}
                  maxLength={4000}
                  value={outfit}
                  placeholder="Kleidung und Accessoires unabhängig von Fotos und Stilbildern"
                  onChange={(e) => setOutfit(e.target.value)}
                />
              </label>
              <details>
                <summary>4 · Master Composition</summary>
                {(
                  [
                    ["pose", "Neutrale Pose"],
                    ["framing", "Bildausschnitt"],
                    ["background", "Hintergrund"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <textarea
                      aria-label={`Creator ${label}`}
                      rows={2}
                      maxLength={key === "background" ? 2000 : 4000}
                      value={composition[key]}
                      onChange={(e) =>
                        setComposition((c) => ({ ...c, [key]: e.target.value }))
                      }
                    />
                  </label>
                ))}
                <label>
                  Asset-Profil
                  <input
                    aria-label="Creator Asset-Profil"
                    maxLength={120}
                    value={composition.profile}
                    onChange={(e) =>
                      setComposition((c) => ({ ...c, profile: e.target.value }))
                    }
                  />
                </label>
                <div className="button-row">
                  {(
                    [
                      ["targetWidth", "Zielbreite"],
                      ["targetHeight", "Zielhöhe"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        aria-label={`Creator ${label}`}
                        type="number"
                        min={64}
                        max={4096}
                        value={composition[key]}
                        onChange={(e) =>
                          setComposition((c) => ({
                            ...c,
                            [key]: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <small>
                  Gewünschte Auflösung ist ein Ziel. Tatsächliche Ausgabe bleibt
                  unverändert; keine 64×64-Konvertierung.
                </small>
              </details>
            </section>
          </div>
          <div
            className="reference-roles"
            aria-label="Creator Referenzreihenfolge"
          >
            <strong>An Codex bei Generierung:</strong>
            <span>
              Bild 1–{identities.length}: Identität ({identities.length})
            </span>
            <span>Danach Stil ({styleRefs.length}) · nur Darstellung</span>
            {identities.length + styleRefs.length > 1 &&
              !codex.multipleReferences && (
                <p className="warning">
                  Mehrere Referenzen nicht bestätigt. Generierung blockiert;
                  Identität nicht stillschweigend weglassen.
                </p>
              )}
          </div>
          <details
            className="panel"
            open={promptOpen}
            onToggle={(e) => setPromptOpen(e.currentTarget.open)}
          >
            <summary>5 · Prompt und Generierungsdetails</summary>
            <PromptComposer
              labelPrefix="Creator"
              state={composer}
              onChange={setComposer}
            />
            <button
              disabled={running || busy}
              onClick={() =>
                void perform(() => window.laceframe.checkCodex(), setCodex)
              }
            >
              Creator-Verfügbarkeit prüfen
            </button>
          </details>
          <section className="panel">
            <h3>6 · Masterkandidaten prüfen</h3>
            <label>
              Masterversuch
              <select
                aria-label="Masterversuch"
                value={active?.id ?? ""}
                onChange={(e) => setActiveId(e.target.value)}
              >
                <option value="">Kein Versuch ausgewählt</option>
                {attempts.map((a, i) => (
                  <option key={a.id} value={a.id}>
                    Versuch {i + 1} · {a.execution?.status ?? "ohne Abschluss"}{" "}
                    · {a.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            {candidate ? (
              <>
                <p className={`badge ${candidate.status}`}>
                  Masterkandidat ·{" "}
                  {candidate.status === "approved"
                    ? "freigegeben"
                    : candidate.status === "rejected"
                      ? "abgelehnt"
                      : "ungeprüft"}
                </p>
                <MasterCandidateCompare
                  master={activeReference}
                  candidate={candidate}
                  beforeLabel="Identität"
                  previewPrefix="Character Creator"
                />
                <p>
                  Identitätsreferenz links / Masterkandidat rechts ·
                  tatsächliche Ausgabe {candidate.width} × {candidate.height} ·
                  Ziel {active?.composition.targetWidth} ×{" "}
                  {active?.composition.targetHeight}. Vergleich ist keine
                  Identitätsfreigabe.
                </p>
                {candidate.status === "candidate" && (
                  <div className="button-row">
                    <button
                      className="danger"
                      onClick={() =>
                        command(
                          {
                            type: "reviewMasterCandidate",
                            id: candidate.id,
                            status: "rejected",
                          },
                          "Masterkandidat abgelehnt. Neuer Versuch möglich.",
                        )
                      }
                    >
                      Masterkandidat ablehnen
                    </button>
                    <button
                      className="primary"
                      disabled={Boolean(character.masterId)}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Identität, neutrale Mimik, Outfit und Komposition manuell geprüft? Diesen Kandidaten als unveränderlichen Master V1 freigeben?",
                          )
                        )
                          command(
                            {
                              type: "reviewMasterCandidate",
                              id: candidate.id,
                              status: "approved",
                            },
                            "Master V1 freigegeben und gesperrt.",
                          );
                      }}
                    >
                      Als Master V1 freigeben & sperren
                    </button>
                  </div>
                )}
                {candidate.status === "approved" && (
                  <button className="primary" onClick={onExpressions}>
                    Expressions mit diesem Master erstellen
                  </button>
                )}
              </>
            ) : (
              <p>
                Kein bestätigtes Ergebnis. Erst einen Auftrag ausdrücklich
                starten; fehlgeschlagene oder abgebrochene Versuche erhalten
                kein erfundenes Bild.
              </p>
            )}
            {active && (
              <details>
                <summary>Gespeicherte Herkunft dieses Versuchs</summary>
                <p className="mono">
                  {JSON.stringify(
                    { ...active, promptRevision: undefined },
                    null,
                    2,
                  )}
                </p>
                <pre className="saved-master-prompt">
                  {active.promptRevision.prompt}
                </pre>
              </details>
            )}
          </section>
        </>
      )}
    </div>
  );
}
