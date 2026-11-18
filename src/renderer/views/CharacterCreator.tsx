import { StudioSteps, useStudioSteps } from "../components/StudioSteps";
import { MasterApproval } from "../components/MasterApproval";
import { GenerationRequirements } from "../components/GenerationRequirements";
import {
  updateStudioPrompt,
  promptRequirements,
  type PromptMode,
  type StudioIntent,
  type Requirement,
} from "../../shared/studio";
import { AssetQuality } from "../components/AssetQuality";
import {
  RESOLUTION_PROFILES,
  TRANSPARENT_CHARACTER_INSTRUCTION,
} from "../../shared/asset-quality";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { effectiveStyle } from "../../shared/domain";
import type { Snapshot, Command } from "../../shared/domain";
import {
  characterCreationDraftSchema,
  composeCharacterPrompt,
  protectMasterPrompt,
  transparencyConflicts,
  DEFAULT_COMPOSITION,
  type CharacterCreationDraft,
  type Composition,
} from "../../shared/character-creation";
import {
  executionLabel,
  newComposer,
  type CodexStatus,
} from "../../shared/generation";
import type { Result } from "../../shared/bridge";
import { ImagePreview } from "../components/ImagePreview";
import { MasterCandidateCompare } from "../components/MasterCandidateCompare";
import { PromptComposer, PromptConflict } from "../components/PromptComposer";
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
  onLibrary,
  onArtDirection,
  onDirtyChange,
  intent,
  contextControlled = false,
}: {
  onLibrary: (id: string) => void;
  onArtDirection: (id?: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  intent?: StudioIntent;
  contextControlled?: boolean;
  snapshot: Snapshot;
  visible: boolean;
  busy: boolean;
  perform: Perform;
  onSnapshot: (s: Snapshot) => void;
  onRunningChange: (r: boolean) => void;
  onClose: () => void;
  onExpressions: () => void;
}) {
  const flow = useStudioSteps();
  const { step, expert } = flow;
  const p = snapshot.project,
    character = p.characters.find((c) => c.id === p.selectedCharacterId);
  const attempts = p.masterAttempts.filter(
      (a) => a.characterId === character?.id,
    ),
    latest = attempts.at(-1);
  const currentMaster = p.masters.find((m) => m.id === character?.masterId);
  const [target, setTarget] = useState<{
    mode: "create" | "rebuild";
    baseMasterId?: string;
    baseMasterSha256?: string;
  }>(() => ({ mode: "create" }));
  const rebuilding = target.mode === "rebuild";
  const targetValid = rebuilding
    ? currentMaster?.id === target.baseMasterId
    : !currentMaster;
  const [cutoutRequested, setCutoutRequested] = useState(0);
  const identities = p.identityAssets.filter(
    (a) => a.characterId === character?.id && !a.removedAt,
  );
  const [name, setName] = useState("");
  const [promptOpen, setPromptOpen] = useState(true);
  const [promptMode, setPromptMode] = useState<PromptMode>("automatic");
  const [creative, setCreative] = useState("");
  const [styleId, setStyleId] = useState(
    effectiveStyle(p, character?.id)?.id ?? "",
  );
  useEffect(
    () => setStyleId(effectiveStyle(p, character?.id)?.id ?? ""),
    [
      character?.styleSelection?.mode,
      character?.styleSelection?.mode === "profile"
        ? character.styleSelection.profileId
        : undefined,
      p.defaultArtDirectionId,
    ],
  );
  const style = p.artDirections.find((s) => s.id === styleId);
  const styleRefs = (style?.styleReferenceIds ?? []).map((id) => {
    const a = p.styleAssets.find((a) => a.id === id)!;
    return { id: a.id, sha256: a.sha256 };
  });
  const [outfit, setOutfit] = useState(
    latest?.outfit ??
      p.outfits.filter((o) => o.characterId === character?.id).at(-1)?.notes ??
      "",
  );
  const [identityNotes, setIdentityNotes] = useState(
    latest?.identityNotes ?? "",
  );
  const [composition, setComposition] = useState<Composition>({
    ...(latest?.composition ?? DEFAULT_COMPOSITION),
    background: DEFAULT_COMPOSITION.background,
  });
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
        ...target,
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
      ? composeCharacterPrompt(p, settings) +
        (promptMode !== "automatic" && creative.trim()
          ? `\n\nADDITIONAL CREATIVE INSTRUCTIONS: ${creative.trim()}`
          : "")
      : "";
  const [composer, setComposer] = useState(() => newComposer(base));
  useEffect(
    () => setComposer((old) => updateStudioPrompt(old, base, promptMode)),
    [base, promptMode],
  );
  useEffect(() => {
    if (composer.pendingBase !== undefined) setPromptOpen(true);
  }, [composer.pendingBase]);
  function changePromptMode(mode: PromptMode) {
    if (
      promptMode === "expert" &&
      composer.edited &&
      mode !== "expert" &&
      !window.confirm(
        "Eigenen Expert Override verwerfen und zur strukturierten Vorlage wechseln?",
      )
    )
      return;
    setPromptMode(mode);
    if (mode !== "expert") setComposer(newComposer(base));
  }
  useEffect(() => {
    if (
      intent?.mode === "master" &&
      intent.characterId === character?.id &&
      intent.rebuild &&
      currentMaster
    ) {
      flow.setStep("Auswählen");
      setTarget({
        mode: "rebuild",
        baseMasterId: currentMaster.id,
        baseMasterSha256: currentMaster.sha256,
      });
      setStyleId(effectiveStyle(p, character.id)?.id ?? "");
      setOutfit(
        latest?.outfit ??
          p.outfits.filter((o) => o.characterId === character.id).at(-1)
            ?.notes ??
          "",
      );
      setIdentityNotes(latest?.identityNotes ?? "");
      setComposition({
        ...(latest?.composition ?? DEFAULT_COMPOSITION),
        background: DEFAULT_COMPOSITION.background,
      });
      setActiveId("");
    }
    if (
      intent?.mode === "master" &&
      intent.characterId === character?.id &&
      intent.candidateId
    ) {
      const candidate = p.masterCandidates.find(
        (c) => c.id === intent.candidateId && c.characterId === character.id,
      );
      if (candidate) {
        setActiveId(candidate.attemptId);
        flow.setStep("Freigeben");
        const a = attempts.find((a) => a.id === candidate.attemptId)!;
        setTarget({
          mode: a.mode ?? "create",
          baseMasterId: a.baseMasterId,
          baseMasterSha256: a.baseMasterSha256,
        });
      }
    }
    if (
      intent?.mode === "master" &&
      intent.characterId === character?.id &&
      intent.styleId
    )
      setStyleId(intent.styleId);
  }, [intent?.serial]);
  const formSignature = JSON.stringify({
    settings,
    creative,
    promptMode,
    prompt: composer.text,
    name,
  });
  const initialSignature = useRef(formSignature),
    savedSignature = useRef<string | undefined>(undefined);
  useEffect(
    () =>
      onDirtyChange(
        formSignature !== (savedSignature.current ?? initialSignature.current),
      ),
    [formSignature, onDirtyChange],
  );
  const draft = settings
    ? {
        ...settings,
        operation: "create-character-master" as const,
        prompt: protectMasterPrompt(composer.text),
      }
    : undefined;
  const running = codex.state === "running";
  const valid = Boolean(
    targetValid &&
      draft &&
      !transparencyConflicts(
        draft.prompt.replaceAll(TRANSPARENT_CHARACTER_INSTRUCTION, ""),
      ) &&
      characterCreationDraftSchema.safeParse(draft).success &&
      composer.pendingBase === undefined &&
      (promptMode === "expert" || composer.base === base) &&
      codex.available &&
      (identities.length + styleRefs.length <= 1 || codex.multipleReferences),
  );
  const wasRunning = useRef(false);
  useEffect(() => {
    if (visible || running || wasRunning.current) onRunningChange(running);
    wasRunning.current = running;
  }, [visible, running, onRunningChange]);
  useEffect(() => {
    if (!visible || running || codex.attemptId) return;
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
  function importIdentity(files?: File[], replaceId?: string) {
    void perform(
      async () => {
        if (!character || !targetValid)
          throw new Error("Zuerst eine Entwurfsfigur anlegen.");
        const slots = replaceId ? 1 : 3 - identities.length;
        if (files && (!files.length || files.length > slots))
          throw new Error(
            `Noch ${slots} von 3 Plätzen verfügbar. Die gesamte Auswahl wurde abgelehnt.`,
          );
        const errors = files
          ?.filter((f) => !f.size || f.size > 16 * 1024 * 1024)
          .map((f) => `${f.name}: Identitätsbilder bis 16 MiB.`);
        if (errors?.length) throw new Error(errors.join("\n"));
        const value = await unwrap(
          window.laceframe.importIdentityImages({
            characterId: character.id,
            ...(replaceId ? { replaceId } : {}),
            ...(files
              ? {
                  files: await Promise.all(
                    files.map(async (file) => ({
                      name: file.name,
                      bytes: new Uint8Array(await file.arrayBuffer()),
                    })),
                  ),
                }
              : {}),
          }),
        );
        return { ok: true as const, value };
      },
      (value) => {
        if (value) onSnapshot(value);
      },
    );
  }
  function generate() {
    flow.setStep("Erzeugen");
    if (!valid || !draft) return;
    void perform(
      () => window.laceframe.startGeneration(draft as CharacterCreationDraft),
      (s) => {
        savedSignature.current = formSignature;
        onDirtyChange(false);
        setCodex(s);
        setActiveId(s.attemptId ?? "");
        setComposer((c) => ({ ...c, saved: true }));
        onRunningChange(s.state === "running");
      },
    );
  }
  const requirements: Requirement[] = [];
  if (busy && !running)
    requirements.push({
      message: "Eine andere Aktion oder Generierung läuft.",
    });
  if (!character)
    requirements.push({
      message: "Figur fehlt. Einen Figurenentwurf anlegen.",
      target: "creator-identity",
    });
  if (!targetValid)
    requirements.push({
      message:
        "Master gesperrt oder Rebuild-Ausgangsversion veraltet. In Characters ausdrücklich Master neu aufbauen wählen.",
    });
  const promptConflict = transparencyConflicts(
    `${identityNotes} ${outfit} ${composition.pose} ${composition.framing} ${creative} ${promptMode === "expert" ? composer.text.replaceAll(TRANSPARENT_CHARACTER_INSTRUCTION, "") : ""}`,
  );
  if (promptConflict)
    requirements.push({
      message:
        "Prompt widerspricht der verbindlichen Alpha-Transparenz. Hintergrundanweisung korrigieren.",
      target: "creator-prompt-builder",
    });
  if (!identities.length)
    requirements.push({
      message: "Identitätsbild fehlt.",
      target: "creator-identity",
    });
  if (!outfit.trim())
    requirements.push({
      message: "Outfit ist unvollständig.",
      target: "creator-outfit",
    });
  if (
    !composition.pose.trim() ||
    !composition.framing.trim() ||
    !composition.profile.trim() ||
    !Number.isInteger(composition.targetWidth) ||
    !Number.isInteger(composition.targetHeight) ||
    composition.targetWidth < 64 ||
    composition.targetHeight < 64 ||
    composition.targetWidth > 4096 ||
    composition.targetHeight > 4096
  )
    requirements.push({
      message:
        "Komposition oder Zielabmessungen unvollständig (64–4096 Pixel).",
      target: "creator-composition",
    });
  if (!codex.available && !running)
    requirements.push({ message: codex.message });
  if (identities.length + styleRefs.length > 1 && !codex.multipleReferences)
    requirements.push({
      message:
        "Mehrfachreferenzen nicht bestätigt. Provider-Verfügbarkeit prüfen.",
    });
  if (!running)
    requirements.push(
      ...promptRequirements(promptMode, composer, base).map((r) => ({
        ...r,
        target: "creator-prompt-builder",
      })),
    );
  if (!valid && !running && !requirements.length)
    requirements.push({
      message:
        "Einstellungen oder Prompt überschreiten die erlaubten Grenzen. Eingaben im Prompt Builder prüfen.",
      target: "creator-prompt-builder",
    });
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
              {!running && (
                <GenerationRequirements
                  items={requirements}
                  onFix={(target) => {
                    if (target.includes("prompt")) {
                      flow.setExpert(true);
                      flow.setStep("Erzeugen");
                    } else flow.setStep("Auswählen");
                  }}
                />
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
      <StudioSteps {...flow} />
      {(!expert || step !== "Erzeugen") && (
        <PromptConflict state={composer} onChange={setComposer} />
      )}
      <div className="section-head">
        <div>
          <p className="eyebrow">CREATE CHARACTER</p>
          <h2>
            {rebuilding
              ? "Master neu aufbauen"
              : "Vom Identitätsbild zum neutralen Master"}
          </h2>
        </div>
        <button onClick={onClose}>Zur Charakterbibliothek</button>
      </div>
      {!contextControlled && (
        <>
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
        </>
      )}
      <details
        className="creator-new-character"
        hidden={step !== "Auswählen"}
        open={!character}
      >
        <summary>Neue Figur anlegen</summary>
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
      </details>
      {character && (
        <>
          <p>
            Aktive Figur: <strong>{character.name}</strong> ·{" "}
            {character.masterId
              ? `Master V${p.masters.find((m) => m.id === character.masterId)?.version ?? "—"} gesperrt`
              : "Entwurf ohne Master"}
          </p>
          {character.masterId && (
            <p className="warning">
              Aktueller Master V{currentMaster?.version} bleibt aktiv.{" "}
              {rebuilding
                ? "Rebuild für dieselbe Figur: ein separat geprüfter Kandidat wird erst nach ausdrücklicher Freigabe zur nächsten Version."
                : "Für einen neuen Master derselben Figur in Characters Master neu aufbauen wählen."}
            </p>
          )}
          <div className="creator-grid" hidden={step !== "Auswählen"}>
            <section
              className="panel creator-identity"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (
                  !busy &&
                  !running &&
                  targetValid &&
                  e.dataTransfer.files.length > 0
                )
                  importIdentity(Array.from(e.dataTransfer.files));
              }}
            >
              <h3 data-focus-target="creator-identity">
                Identität schützen · Identitätsquellen
              </h3>
              <p>
                Bis zu drei Fotos derselben Person oder Illustrationen.
                PNG/JPEG/WebP, je 16 MiB / 16 MP. Originale bleiben lokal, bis
                du generierst.
              </p>
              <button
                disabled={
                  !targetValid || identities.length >= 3 || busy || running
                }
                onClick={() => importIdentity()}
              >
                Identitätsbilder hinzufügen …
              </button>
              <p role="status">{identities.length} von 3 Bildern</p>
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
                      disabled={busy || running}
                      onClick={() => importIdentity(undefined, a.id)}
                    >
                      Referenz austauschen …
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
              <h3>Art Direction / Style Lock</h3>
              <button
                className="text-link"
                onClick={() => onArtDirection(style?.id)}
              >
                Art Direction bearbeiten
              </button>
              <label>
                Darstellungsstil
                <select
                  aria-label="Creator Art Direction"
                  value={style?.id ?? ""}
                  onChange={(e) => {
                    setStyleId(e.target.value);
                    if (character && !rebuilding)
                      command({
                        type: "setCharacterStyle",
                        characterId: character.id,
                        selection: e.target.value
                          ? { mode: "profile", profileId: e.target.value }
                          : { mode: "master" },
                      });
                  }}
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
                  Stilprofile und Stilbilder lassen sich unter Art Direction
                  anlegen.
                </small>
              )}
              <h3 data-focus-target="creator-outfit">Outfit</h3>
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
              <details data-focus-target="creator-composition">
                <summary>
                  Composition · Pose, Ausschnitt & Zielauflösung
                </summary>
                <p>
                  Hintergrund: echte Alpha-Transparenz, keine Kulisse. Das
                  tatsächliche Ergebnis wird vor dem Review geprüft.
                </p>
                <label>
                  Zielauflösungsprofil
                  <select
                    aria-label="Creator Auflösungsprofil"
                    defaultValue=""
                    onChange={(e) => {
                      const p = RESOLUTION_PROFILES[Number(e.target.value)];
                      if (p)
                        setComposition((c) => ({
                          ...c,
                          targetWidth: p.width,
                          targetHeight: p.height,
                          targetResolution: p,
                        }));
                    }}
                  >
                    <option value="" disabled>
                      Benutzerdefiniertes Ziel
                    </option>
                    {RESOLUTION_PROFILES.map((p, i) => (
                      <option key={p.name} value={i}>
                        {p.name} · {p.width}×{p.height}
                      </option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    ["pose", "Neutrale Pose"],
                    ["framing", "Bildausschnitt"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <textarea
                      aria-label={`Creator ${label}`}
                      rows={2}
                      maxLength={4000}
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
                            targetResolution: undefined,
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
            hidden={step !== "Erzeugen"}
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
          <section className="panel" hidden={step === "Auswählen"}>
            <h3>Masterentwürfe prüfen</h3>
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
                <button onClick={() => onLibrary(candidate.id)}>
                  In Library prüfen
                </button>
                <p className={`badge ${candidate.status}`}>
                  Masterkandidat ·{" "}
                  {candidate.status === "approved"
                    ? "freigegeben"
                    : candidate.status === "rejected"
                      ? "abgelehnt"
                      : "ungeprüft"}
                </p>
                {step === "Freigeben" && (
                  <p aria-label="Gespeicherte Masterherkunft">
                    Entwurf vom{" "}
                    {new Date(candidate.createdAt).toLocaleString("de-DE")} ·{" "}
                    {candidate.width} × {candidate.height} · Codex.
                    {active && (
                      <>
                        {" "}
                        Generierungsanweisung vom{" "}
                        {new Date(
                          active.promptRevision.createdAt,
                        ).toLocaleString("de-DE")}
                        .
                      </>
                    )}
                  </p>
                )}
                <MasterCandidateCompare
                  master={activeReference}
                  candidate={candidate}
                  beforeLabel="Identität"
                  identityComparison
                  requested={
                    active
                      ? {
                          width: active.composition.targetWidth,
                          height: active.composition.targetHeight,
                        }
                      : undefined
                  }
                  previewPrefix="Character Creator"
                />
                <div hidden={step === "Erzeugen"}>
                  <AssetQuality
                    key={candidate.id}
                    source={candidate}
                    workspaceStep={step}
                    cutoutRequested={cutoutRequested}
                    onCutoutOpened={() => setCutoutRequested(0)}
                    project={p}
                    onSnapshot={onSnapshot}
                    disabled={busy || running}
                  />
                </div>
                {candidate.status === "candidate" && step === "Freigeben" && (
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
                    <MasterApproval
                      key={candidate.id}
                      source={candidate}
                      disabled={busy || running || !targetValid}
                      label={
                        currentMaster
                          ? `Als Master V${currentMaster.version + 1} freigeben & aktivieren`
                          : "Als Master V1 freigeben & sperren"
                      }
                      onRetry={valid ? generate : undefined}
                      onCutout={() => setCutoutRequested((v) => v + 1)}
                      onApprove={(review) =>
                        command(
                          {
                            type: "reviewMasterCandidate",
                            id: candidate.id,
                            status: "approved",
                            review,
                          },
                          currentMaster
                            ? "Neuer Master aktiviert; bisherige Versionen bleiben erhalten."
                            : "Master V1 freigegeben und gesperrt.",
                        )
                      }
                    />
                  </div>
                )}
                {Boolean(character.masterId) && (
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
            {active && expert && (
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
          <details
            className="panel"
            hidden={!expert || step !== "Erzeugen"}
            open={promptOpen}
            onToggle={(e) => setPromptOpen(e.currentTarget.open)}
          >
            <summary>Prompt Builder & Generierungsdetails</summary>
            <p className="muted">
              Verbindliche Systemregel in jedem Modus, auch Expert Override:
              echte Alpha-Transparenz, kein eingebrannter Hintergrund. Main
              ergänzt diese Regel im tatsächlich gesendeten Prompt. Das Modell
              garantiert keinen transparenten Output; die Pixelprüfung
              entscheidet über die Freigabe.
            </p>
            <PromptComposer
              sources={[
                {
                  layer: "System",
                  source:
                    "Echte Alpha-Anforderung, immutable Referenzen, technische Prüfung und manuelle Freigabe (Main/Provider).",
                },
                {
                  layer: "Style",
                  source: style
                    ? `${style.name} · R${style.revision}`
                    : "Kein gemeinsamer Style",
                },
                {
                  layer: "Character Identity",
                  source: `${character?.name} · ausgewählte private Identitätsreferenzen und Identitätsnotizen`,
                },
                {
                  layer: "Outfit",
                  source:
                    "Editierbarer Outfitentwurf dieser Figur; unabhängig vom Stil.",
                },
                {
                  layer: "Expression Performance",
                  source:
                    "Neutraler Master; keine persönliche Emotionsperformance.",
                },
                {
                  layer: "Composition",
                  source:
                    "Pose, Framing, Hintergrund und Auflösungsziel aus diesem Creator-Entwurf.",
                },
                {
                  layer: "Creative Supplements",
                  source:
                    promptMode === "expert"
                      ? "Expert Override mit verbindlichen Systemregeln."
                      : creative || "Keine Ergänzung",
                },
              ]}
              labelPrefix="Creator"
              state={composer}
              onChange={setComposer}
              mode={promptMode}
              onModeChange={changePromptMode}
              extraInstructions={creative}
              onExtraChange={setCreative}
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
        </>
      )}
    </div>
  );
}
