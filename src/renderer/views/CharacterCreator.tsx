import { useImperativeHandle, type Ref } from "react";
import type { StudioGenerationAction } from "../../shared/studio";
import { i18n } from "../../shared/locales";
import { displayMessage } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
import { PortraitPreview } from "../components/PortraitPreview";
import { StudioSteps, useStudioSteps } from "../components/StudioSteps";
import { MasterApproval } from "../components/MasterApproval";
import {
  GenerationRequirements,
  focusGenerationRequirement,
} from "../components/GenerationRequirements";
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
  actionRef,
  actionSlot,
}: {
  onLibrary: (id: string) => void;
  onArtDirection: (id?: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  intent?: StudioIntent;
  contextControlled?: boolean;
  actionRef?: Ref<StudioGenerationAction>;
  actionSlot: HTMLElement | null;
  snapshot: Snapshot;
  visible: boolean;
  busy: boolean;
  perform: Perform;
  onSnapshot: (s: Snapshot) => void;
  onRunningChange: (r: boolean) => void;
  onClose: () => void;
  onExpressions: () => void;
}) {
  const [showRequirements, setShowRequirements] = useState(false);
  const starting = useRef(false);
  const flow = useStudioSteps();
  const { step, expert } = flow;
  const [reviewDirty, setReviewDirty] = useState(false);
  const [qualityDirty, setQualityDirty] = useState(false);
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
    message: tr("characters.ma1b71a7774"),
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
  function changePromptMode(mode: PromptMode) {
    if (
      promptMode === "expert" &&
      composer.edited &&
      mode !== "expert" &&
      !window.confirm(tr("characters.mb840957a3f"))
    )
      return;
    setPromptMode(mode);
    if (mode !== "expert") setComposer(newComposer(base));
  }
  useEffect(() => {
    if (
      intent?.mode === "master" &&
      intent.characterId === character?.id &&
      (reviewDirty || qualityDirty) &&
      !window.confirm(tr("characters.m953368ccbf"))
    )
      return;
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
        reviewDirty ||
          qualityDirty ||
          formSignature !==
            (savedSignature.current ?? initialSignature.current),
      ),
    [formSignature, reviewDirty, qualityDirty, onDirtyChange],
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
          throw new Error(tr("characters.ma2752a9beb"));
        const slots = replaceId ? 1 : 3 - identities.length;
        if (files && (!files.length || files.length > slots))
          throw new Error(tr("characters.mda4aff8a61", { v0: slots }));
        const errors = files
          ?.filter((f) => !f.size || f.size > 16 * 1024 * 1024)
          .map((f) => tr("characters.m38199134b2", { v0: f.name }));
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
    if (busy || running || starting.current) return;
    if (!valid || !draft) {
      setShowRequirements(true);
      const missing = requirements.find((r) => r.target);
      if (missing?.target)
        focusGenerationRequirement(missing.target, (target) => {
          flow.setExpert(true);
          flow.setStep(target.includes("prompt") ? "Erzeugen" : "Auswählen");
        });
      else flow.setStep("Auswählen");
      return;
    }
    if (
      (reviewDirty || qualityDirty) &&
      !window.confirm(tr("characters.me3b279a3ad"))
    )
      return;
    flow.setStep("Erzeugen");
    setShowRequirements(false);
    starting.current = true;
    void perform(
      () => window.laceframe.startGeneration(draft as CharacterCreationDraft),
      (s) => {
        savedSignature.current = formSignature;
        onDirtyChange(reviewDirty || qualityDirty);
        setCodex(s);
        setActiveId(s.attemptId ?? "");
        setComposer((c) => ({ ...c, saved: true }));
        onRunningChange(s.state === "running");
      },
    ).finally(() => {
      starting.current = false;
    });
  }
  const requirements: Requirement[] = [];
  if (busy && !running)
    requirements.push({
      message: tr("characters.mb632c4ceb4"),
    });
  if (!character)
    requirements.push({
      message: tr("characters.ma38bf09f80"),
      target: "creator-identity",
    });
  if (!targetValid)
    requirements.push({
      message: tr("characters.m2a35544f50"),
      target: "creator-rebuild",
    });
  const promptConflict = transparencyConflicts(
    `${identityNotes} ${outfit} ${composition.pose} ${composition.framing} ${creative} ${promptMode === "expert" ? composer.text.replaceAll(TRANSPARENT_CHARACTER_INSTRUCTION, "") : ""}`,
  );
  if (promptConflict)
    requirements.push({
      message: tr("characters.md4dc2ff574"),
      target: "creator-prompt-builder",
    });
  if (!identities.length)
    requirements.push({
      message: tr("characters.m823923b8b2"),
      target: "creator-identity",
    });
  if (!outfit.trim())
    requirements.push({
      message: tr("characters.m95c840d657"),
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
      message: tr("characters.m13344d5a40"),
      target: "creator-composition",
    });
  if (!codex.available && !running)
    requirements.push({ message: codex.message });
  if (identities.length + styleRefs.length > 1 && !codex.multipleReferences)
    requirements.push({
      message: tr("characters.mfa65ab7dff"),
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
      message: tr("characters.mad802ee11a"),
      target: "creator-prompt-builder",
    });
  const slot = actionSlot;
  useImperativeHandle(visible ? actionRef : undefined, () => ({ generate }));
  const timing =
    codex.attemptId === activeId
      ? (codex.execution ?? active?.execution)
      : active?.execution;
  return (
    <div className="character-creator" data-step={step}>
      {slot &&
        (visible || running) &&
        createPortal(
          <div className="create-action-bar">
            <div className="job-status">
              <p role="status" aria-label={tr("characters.m7336504985")}>
                <strong>
                  {codex.state === "running"
                    ? tr("characters.mc673b8d6bf")
                    : codex.state === "completed"
                      ? tr("characters.mdc66f66e52")
                      : codex.state === "failed"
                        ? tr("characters.m255b894212")
                        : codex.state === "cancelled"
                          ? tr("characters.m67b3b8347a")
                          : tr("characters.m890dcb2590")}
                </strong>
                <span>{displayMessage(codex.message)}</span>
              </p>
              {timing && (
                <output
                  aria-label={tr("characters.m62ee00ec21")}
                  className="generation-time"
                >
                  {executionLabel(timing, running)}
                </output>
              )}
              {!running && (showRequirements || step === "Erzeugen") && (
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
              <small>{tr("characters.m11fb8fbc15")}</small>
            </div>
            {!actionRef && !running && (
              <button
                className="primary"
                disabled={busy || running || !valid}
                onClick={generate}
              >
                {tr("characters.m44c4da2293")}
              </button>
            )}
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
                {tr("characters.m52186150e3")}
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
          <p className="eyebrow">{tr("characters.m907fedcb93")}</p>
          <h2>
            {rebuilding
              ? tr("characters.m87759f9b8c")
              : tr("characters.m47a685f79f")}
          </h2>
        </div>
        <button onClick={onClose}>{tr("characters.m33554da851")}</button>
      </div>
      {!contextControlled && (
        <>
          <label>
            {tr("characters.mf1f9565fea")}
            <select
              aria-label={tr("characters.mb254bea44a")}
              value={character?.id ?? ""}
              onChange={(e) =>
                command({ type: "selectCharacter", id: e.target.value })
              }
            >
              <option value="" disabled>
                {tr("characters.mb161d496f5")}
              </option>
              {p.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.masterId
                    ? tr("characters.md941d8fb01")
                    : tr("characters.m8d5242b1c0")}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {step === "Auswählen" && !character && (
        <section className="creator-new-character">
          <h3>{tr("characters.md558f02a7b")}</h3>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              command(
                { type: "addCharacter", name },
                tr("characters.mf058e1b8cd"),
              );
            }}
          >
            <label>
              {tr("characters.m89c61fd325")}
              <input
                aria-label={tr("characters.mcd61a304c3")}
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button>{tr("characters.m1b63a306c7")}</button>
          </form>
        </section>
      )}
      {character && (
        <>
          <p>
            {tr("characters.m361e8a07aa")}
            <strong>{character.name}</strong> ·{" "}
            {character.masterId
              ? tr("characters.m361a4aec2f", {
                  v0:
                    p.masters.find((m) => m.id === character.masterId)
                      ?.version ?? "—",
                })
              : tr("characters.md75675ed46")}
          </p>
          {character.masterId && (
            <div className="warning" data-focus-target="creator-rebuild">
              <p>
                {tr("characters.m7b5a81f16c")}
                {currentMaster?.version} {tr("characters.m68a75ad27e")}{" "}
                {rebuilding
                  ? tr("characters.mb414452505")
                  : tr("characters.m9984970ec2")}
              </p>
              {!rebuilding && (
                <button
                  onClick={() => {
                    if (
                      currentMaster &&
                      window.confirm(tr("characters.confirmRebuild"))
                    ) {
                      setTarget({
                        mode: "rebuild",
                        baseMasterId: currentMaster.id,
                        baseMasterSha256: currentMaster.sha256,
                      });
                      flow.setStep("Auswählen");
                    }
                  }}
                >
                  {tr("characters.chooseRebuild")}
                </button>
              )}
            </div>
          )}
          {step === "Auswählen" && (
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
                    targetValid &&
                    e.dataTransfer.files.length > 0
                  )
                    importIdentity(Array.from(e.dataTransfer.files));
                }}
              >
                <PortraitPreview
                  image={activeReference ?? identities[0] ?? currentMaster}
                  caption={tr("characters.md048925ecf", { v0: character.name })}
                />
                <h3 data-focus-target="creator-identity">
                  {tr("characters.ma464f7143e")}
                </h3>
                <p>{tr("characters.m04764ac10c")}</p>
                <button
                  disabled={
                    !targetValid || identities.length >= 3 || busy || running
                  }
                  onClick={() => importIdentity()}
                >
                  {tr("characters.m4f08f6ea7a")}
                </button>
                <p role="status">
                  {identities.length} {tr("characters.m01dd83bc18")}
                </p>
                <div className="creator-references">
                  {identities.map((a, i) => (
                    <div key={a.id}>
                      <ImagePreview
                        id={a.id}
                        caption={tr("characters.mc3ae7c05fb", { v0: i + 1 })}
                        zoom="fit"
                      />
                      <small>
                        {a.width} × {a.height} · {a.format.toUpperCase()} ·{" "}
                        {expert
                          ? a.sha256.slice(0, 12)
                          : tr("characters.m3ba020ea77")}
                      </small>
                      <button
                        disabled={!candidate}
                        aria-pressed={activeReference?.id === a.id}
                        onClick={() => {
                          setReferenceId(a.id);
                        }}
                      >
                        {tr("characters.m9ced3dc6dc")}
                      </button>
                      <button
                        disabled={busy || running}
                        onClick={() => importIdentity(undefined, a.id)}
                      >
                        {tr("characters.m79f4982b2d")}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(tr("characters.mde46966099")))
                            command(
                              { type: "removeIdentityReference", id: a.id },
                              tr("characters.m11eb222831"),
                            );
                        }}
                      >
                        {tr("characters.mc39b6d0c17")}
                      </button>
                    </div>
                  ))}
                </div>
                {p.identityAssets.some(
                  (a) => a.characterId === character.id && a.removedAt,
                ) && <small>{tr("characters.m5ed6813309")}</small>}
                <label>
                  {tr("characters.m95abad6ff7")}
                  <textarea
                    aria-label={tr("characters.m843ee58ea1")}
                    maxLength={4000}
                    rows={2}
                    value={identityNotes}
                    onChange={(e) => setIdentityNotes(e.target.value)}
                  />
                </label>
              </section>
              <section className="panel">
                <h3>{tr("characters.m6d6e419781")}</h3>
                <button
                  className="text-link"
                  onClick={() => onArtDirection(style?.id)}
                >
                  {tr("characters.mef0771e059")}
                </button>
                <label>
                  {tr("characters.m7ddbb7dd9b")}
                  <select
                    aria-label={tr("characters.m78e387bca7")}
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
                    <option value="">{tr("characters.m7e1c3b6a36")}</option>
                    {p.artDirections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {tr("characters.mda8ec3e284")}
                        {s.revision}
                      </option>
                    ))}
                  </select>
                </label>
                {style?.description && <p>{style.description}</p>}
                <p>{tr("characters.meaaf4fdecf")}</p>
                <div className="creator-references">
                  {styleRefs.map((r, i) => (
                    <ImagePreview
                      key={r.id}
                      id={r.id}
                      caption={tr("characters.m0c1288f0a7", { v0: i + 1 })}
                      zoom="fit"
                    />
                  ))}
                </div>
                {!style && <small>{tr("characters.maeeecd120c")}</small>}
                <h3 data-focus-target="creator-outfit">
                  {tr("characters.m2fa46a9387")}
                </h3>
                <label>
                  {tr("characters.m1e07144140")}
                  <textarea
                    aria-label={tr("characters.m8807dcae2d")}
                    rows={3}
                    maxLength={4000}
                    value={outfit}
                    placeholder={tr("characters.mbb141e16ae")}
                    onChange={(e) => setOutfit(e.target.value)}
                  />
                </label>
                {expert && (
                  <section data-focus-target="creator-composition">
                    <h3>{tr("characters.mcbb9a9da30")}</h3>
                    <p>{tr("characters.mda8e6f83c7")}</p>
                    <label>
                      {tr("characters.ma3adb24d73")}
                      <select
                        aria-label={tr("characters.m0606cda0ae")}
                        value={
                          composition.targetResolution
                            ? String(
                                RESOLUTION_PROFILES.findIndex(
                                  (p) =>
                                    p.name ===
                                    composition.targetResolution?.name,
                                ),
                              )
                            : ""
                        }
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
                          {tr("characters.mde41930f95")}
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
                        ["pose", tr("characters.m43ceeba3f7")],
                        ["framing", tr("characters.m10370c280c")],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <textarea
                          aria-label={tr("characters.m4ca9aea16c", {
                            v0: label,
                          })}
                          rows={2}
                          maxLength={4000}
                          value={composition[key]}
                          onChange={(e) =>
                            setComposition((c) => ({
                              ...c,
                              [key]: e.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                    <label>
                      {tr("characters.m666b877c19")}
                      <input
                        aria-label={tr("characters.m893f2ce1b0")}
                        maxLength={120}
                        value={composition.profile}
                        onChange={(e) =>
                          setComposition((c) => ({
                            ...c,
                            profile: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className="button-row">
                      {(
                        [
                          ["targetWidth", tr("characters.mbf565c6ff3")],
                          ["targetHeight", tr("characters.mfd7225e4bd")],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            aria-label={tr("characters.m4ca9aea16c", {
                              v0: label,
                            })}
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
                    <small>{tr("characters.me40df7eaba")}</small>
                  </section>
                )}
              </section>
            </div>
          )}
          <div
            className="reference-roles"
            hidden={step !== "Erzeugen"}
            aria-label={tr("characters.mda8c5290ad")}
          >
            <strong>{tr("characters.mea3886919c")}</strong>
            <span>
              {tr("characters.m604898aad1")}
              {identities.length}
              {tr("characters.mf00df963d9")}
              {identities.length})
            </span>
            <span>
              {tr("characters.me9586646ac")}
              {styleRefs.length}
              {tr("characters.m73c11c511b")}
            </span>
            {identities.length + styleRefs.length > 1 &&
              !codex.multipleReferences && (
                <p className="warning">{tr("characters.m8daf42a33a")}</p>
              )}
          </div>
          {step === "Erzeugen" && (
            <section className="creator-generation-reference">
              <PortraitPreview
                image={activeReference ?? identities[0] ?? currentMaster}
                caption={tr("characters.m78735b8fba", {
                  v0: character.name,
                  v1: identities.length
                    ? tr("characters.m443d3d4a05")
                    : tr("characters.m558170f96d"),
                })}
              />
              <p>
                {style?.name ?? tr("characters.m7e1c3b6a36")}{" "}
                {tr("characters.m3505489f9f")}
                {composition.targetWidth} × {composition.targetHeight}{" "}
                {tr("characters.m0d381994ab")}
              </p>
            </section>
          )}
          <section className="panel creator-result" data-step={step}>
            {step !== "Auswählen" && <h3>{tr("characters.mfa83ada6cf")}</h3>}
            {expert && (
              <label>
                {tr("characters.mbc975cc96b")}
                <select
                  aria-label={tr("characters.mbc975cc96b")}
                  value={active?.id ?? ""}
                  onChange={(e) => {
                    if (
                      (reviewDirty || qualityDirty) &&
                      e.target.value !== activeId &&
                      !window.confirm(tr("characters.mccf1e82e56"))
                    )
                      return;
                    setActiveId(e.target.value);
                  }}
                >
                  <option value="">{tr("characters.m361ddf9304")}</option>
                  {attempts.map((a, i) => (
                    <option key={a.id} value={a.id}>
                      {tr("characters.mb52614c76a")}
                      {i + 1} ·{" "}
                      {a.execution?.status ?? tr("common.m0316ff637a")} ·{" "}
                      {a.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {candidate ? (
              <>
                <button onClick={() => onLibrary(candidate.id)}>
                  {tr("characters.m72b8b4ea0e")}
                </button>
                <p className={`badge ${candidate.status}`}>
                  {tr("characters.mc434610aca")}{" "}
                  {candidate.status === "approved"
                    ? tr("common.m9ebf36386d")
                    : candidate.status === "rejected"
                      ? tr("common.me310994718")
                      : tr("characters.m08112f78b5")}
                </p>
                {step === "Freigeben" && (
                  <p aria-label={tr("characters.m5d7f8ef6ec")}>
                    {tr("characters.m71b6fc373b")}{" "}
                    {new Date(candidate.createdAt).toLocaleString(
                      i18n.language,
                    )}{" "}
                    · {candidate.width} × {candidate.height}{" "}
                    {tr("characters.m7706edd02d")}
                    {active && (
                      <>
                        {" "}
                        {tr("characters.mf9f5f67237")}{" "}
                        {new Date(
                          active.promptRevision.createdAt,
                        ).toLocaleString(i18n.language)}
                        .
                      </>
                    )}
                  </p>
                )}
                {step === "Erzeugen" && (
                  <PortraitPreview
                    image={candidate}
                    caption={tr("characters.m84b98070cd")}
                  />
                )}
                {(step === "Bearbeiten" || step === "Freigeben") && (
                  <MasterCandidateCompare
                    master={activeReference}
                    candidate={candidate}
                    beforeLabel={tr("characters.m09841f4a4e")}
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
                )}
                <div className="creator-quality">
                  <AssetQuality
                    key={candidate.id}
                    source={candidate}
                    workspaceStep={step}
                    expert={expert}
                    onDirtyChange={setQualityDirty}
                    cutoutRequested={cutoutRequested}
                    onCutoutOpened={() => setCutoutRequested(0)}
                    project={p}
                    onSnapshot={onSnapshot}
                    disabled={busy || running}
                  />
                </div>
                {candidate.status === "candidate" && (
                  <div className="button-row" hidden={step !== "Freigeben"}>
                    <button
                      className="danger"
                      onClick={() =>
                        command(
                          {
                            type: "reviewMasterCandidate",
                            id: candidate.id,
                            status: "rejected",
                          },
                          tr("characters.mbd0e2a2e11"),
                        )
                      }
                    >
                      {tr("characters.m0d7e9c39f9")}
                    </button>
                    <MasterApproval
                      visible={step === "Freigeben"}
                      key={candidate.id}
                      onDirtyChange={setReviewDirty}
                      source={candidate}
                      disabled={busy || running || !targetValid}
                      label={
                        currentMaster
                          ? tr("characters.m12a9d9472b", {
                              v0: currentMaster.version + 1,
                            })
                          : tr("characters.ma810d96bcb")
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
                            ? tr("characters.m51b070a7c5")
                            : tr("characters.mb4ceaef3c5"),
                        )
                      }
                    />
                  </div>
                )}
                {Boolean(character.masterId) && (
                  <button className="primary" onClick={onExpressions}>
                    {tr("characters.m7b900bc673")}
                  </button>
                )}
              </>
            ) : step !== "Auswählen" ? (
              <p>{tr("characters.m2c6fce92e5")}</p>
            ) : null}
            {active && expert && step !== "Auswählen" && (
              <section>
                <h3>{tr("characters.m266575d66e")}</h3>
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
              </section>
            )}
          </section>
          {expert && step === "Erzeugen" && (
            <section className="panel creator-expert">
              <h3>{tr("characters.m1d61310d2f")}</h3>
              <p className="muted">{tr("characters.mf2ce618274")}</p>
              <PromptComposer
                sources={[
                  {
                    layer: tr("common.m6725e7bbcd"),
                    source: tr("characters.me00295dbad"),
                  },
                  {
                    layer: tr("common.m7e744141b4"),
                    source: style
                      ? `${style.name} · R${style.revision}`
                      : tr("characters.m85c4503ec2"),
                  },
                  {
                    layer: tr("common.m2770dce311"),
                    source: tr("characters.m919727880b", {
                      v0: character?.name,
                    }),
                  },
                  {
                    layer: "Outfit",
                    source: tr("characters.m7368bfb0c9"),
                  },
                  {
                    layer: tr("common.m1279850d20"),
                    source: tr("characters.mb9c43542ea"),
                  },
                  {
                    layer: tr("common.m47fca483c8"),
                    source: tr("characters.md09bc927e2"),
                  },
                  {
                    layer: tr("common.m1c9b1f80be"),
                    source:
                      promptMode === "expert"
                        ? tr("characters.m1c49a5fb66")
                        : creative || tr("common.m375cda06a9"),
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
                {tr("characters.m64e6016d1b")}
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
