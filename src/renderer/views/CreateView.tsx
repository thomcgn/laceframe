import { uiLabel } from "../../shared/locales";
import { i18n } from "../../shared/locales";
import { displayMessage } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
import { PortraitPreview } from "../components/PortraitPreview";
import { StudioSteps, useStudioSteps } from "../components/StudioSteps";
import { ImagePreview } from "../components/ImagePreview";
import { GenerationRequirements } from "../components/GenerationRequirements";
import {
  updateStudioPrompt,
  promptRequirements,
  type PromptMode,
  type StudioIntent,
  type Requirement,
} from "../../shared/studio";
import { Evidence } from "../components/AssetQuality";
import { AssetQuality } from "../components/AssetQuality";
import { MaskEditor } from "../components/MaskEditor";
import { MAX_MASK_PIXELS } from "../../shared/masking";
import { createPortal } from "react-dom";
import { useEffect, useState, useRef } from "react";
import type {
  Command,
  Snapshot,
  StagedImage,
  VocalAction,
} from "../../shared/domain";
import { effectiveStyle, referencesForStyle } from "../../shared/domain";
import { MAX_IMAGE_BYTES } from "../../shared/domain";
import type { Result } from "../../shared/bridge";
import {
  CHATGPT_URL,
  executionLabel,
  sameDraft,
  composePrompt,
  protectExpressionPrompt,
  draftFromAttempt,
  generationDraftSchema,
  newComposer,
  type ComposerState,
  type GenerationDraft,
  type ProviderDescriptor,
  type CodexStatus,
} from "../../shared/generation";
import { MasterCandidateCompare } from "../components/MasterCandidateCompare";
import { PromptComposer, PromptConflict } from "../components/PromptComposer";

type Perform = <T>(
  work: () => Promise<Result<T>>,
  success: (value: T) => void,
  notice?: string,
) => Promise<void>;
export function CreateView({
  snapshot,
  busy,
  perform,
  onSnapshot,
  onDirtyChange,
  onCharacters,
  onInspect,
  onRunningChange,
  visible,
  intent,
  onArtDirection,
  onEditExpression,
  contextControlled = false,
}: {
  onEditExpression: (intent: Omit<StudioIntent, "serial">) => void;
  intent?: StudioIntent;
  onArtDirection: (id?: string) => void;
  contextControlled?: boolean;
  snapshot: Snapshot;
  busy: boolean;
  perform: Perform;
  onSnapshot: (value: Snapshot) => void;
  onDirtyChange: (value: boolean) => void;
  onCharacters: () => void;
  onInspect: (id: string) => void;
  onRunningChange: (running: boolean) => void;
  visible: boolean;
}) {
  const flow = useStudioSteps();
  const { step, expert } = flow;
  const [qualityDirty, setQualityDirty] = useState(false);
  const p = snapshot.project;
  const character = p.characters.find((c) => c.id === p.selectedCharacterId);
  const attempts = p.attempts.filter((a) => a.characterId === character?.id);
  const latest = attempts.at(-1);
  const [masterId, setMasterId] = useState(
    character?.masterId ?? latest?.masterId ?? "",
  );
  useEffect(() => {
    if (character?.masterId) setMasterId(character.masterId);
  }, [character?.masterId]);
  const masters = p.masters
    .filter((m) => m.characterId === character?.id && m.locked)
    .sort((a, b) => b.version - a.version);
  const master = masters.find((m) => m.id === masterId) ?? masters[0];
  const [familyId, setFamilyId] = useState(
    p.variants.find((v) => v.id === latest?.variantId)?.familyId ??
      p.families[0]?.id ??
      "",
  );
  const family = p.families.find((f) => f.id === familyId) ?? p.families[0];
  const variants = p.variants.filter((v) => v.familyId === family?.id);
  const [variantId, setVariantId] = useState(
    latest?.variantId ?? variants[0]?.id ?? "",
  );
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const artDirection = effectiveStyle(p, character?.id);
  const styleReferences = referencesForStyle(p, artDirection);
  const personalPerformance = p.expressionPerformances.find(
    (e) => e.characterId === character?.id && e.variantId === variant?.id,
  );
  const [action, setAction] = useState<VocalAction>(
    latest?.action ?? variant?.suggestedAction ?? "silent",
  );
  const [intensity, setIntensity] = useState<number | undefined>(
    latest?.intensity ?? variant?.intensity,
  );
  const [instructions, setInstructions] = useState(
    latest?.promptRevision.supplementaryInstructions ?? "",
  );
  const [editMode, setEditMode] = useState<"none" | "hard" | "soft">(
    latest?.mask ? "hard" : "none",
  );
  const [maskId, setMaskId] = useState(latest?.mask?.id ?? "");
  const masks = p.masks.filter((m) => m.masterId === master?.id);
  const mask = masks.find((m) => m.id === maskId);
  const selectedMask =
    editMode === "hard" && mask
      ? {
          id: mask.id,
          sha256: mask.sha256,
          revision: mask.revision,
          mode: "hard" as const,
        }
      : undefined;
  const [maskEditor, setMaskEditor] = useState(false);
  const [candidateKind, setCandidateKind] = useState("composite");
  const [promptMode, setPromptMode] = useState<PromptMode>("automatic");
  const base =
    master && character && variant && family
      ? composePrompt({
          mask: selectedMask,
          characterName: character.name,
          master,
          variant,
          familyLabel: family.label,
          artDirection,
          styleReferences,
          expressionPerformance: personalPerformance?.direction,
          action,
          intensity,
          supplementaryInstructions:
            promptMode === "automatic" ? "" : instructions,
        })
      : "";
  const [composer, setComposer] = useState<ComposerState>(() =>
    newComposer(base),
  );
  useEffect(
    () => setComposer((old) => updateStudioPrompt(old, base, promptMode)),
    [base, promptMode],
  );
  function changePromptMode(mode: PromptMode) {
    if (
      promptMode === "expert" &&
      composer.edited &&
      mode !== "expert" &&
      !window.confirm(tr("studio.mb840957a3f"))
    )
      return;
    setPromptMode(mode);
    if (mode !== "expert") setComposer(newComposer(base));
  }
  useEffect(() => {
    if (
      !intent ||
      intent.mode !== "expression" ||
      intent.characterId !== character?.id
    )
      return;
    if (!discardReview()) return;
    flow.setStep(intent.candidateId ? "Freigeben" : "Auswählen");
    if (intent.masterId) setMasterId(intent.masterId);
    if (intent.familyId) setFamilyId(intent.familyId);
    if (intent.variantId) {
      setVariantId(intent.variantId);
      const selected = p.variants.find((v) => v.id === intent.variantId);
      if (selected) {
        setAction(selected.suggestedAction);
        setIntensity(selected.intensity);
      }
    }
    if (intent.candidateId) {
      const image = p.assets.find(
        (a) => a.id === intent.candidateId && a.characterId === character.id,
      );
      if (image?.attemptId) setActiveId(image.attemptId);
    }
    // A fresh navigation intent must not discard an existing saved result or working draft.
  }, [intent?.serial]);
  const [activeId, setActiveId] = useState(latest?.id ?? "");
  const active = attempts.find((a) => a.id === activeId);
  const raw = active
    ? p.assets.find((a) => a.attemptId === active.id && !a.composite)
    : undefined;
  const composite = active
    ? p.assets.find((a) => a.attemptId === active.id && a.composite)
    : undefined;
  const asset = candidateKind === "composite" ? (composite ?? raw) : raw;
  const reviewMaster =
    p.masters.find((m) => m.id === active?.masterId) ?? master;
  const activeMask = p.masks.find((m) => m.id === active?.mask?.id);
  const [maskOverlay, setMaskOverlay] = useState(false);
  const [providers, setProviders] = useState<ProviderDescriptor[]>([]);
  const [providerError, setProviderError] = useState("");
  useEffect(() => {
    let live = true;
    void window.laceframe
      .providers()
      .then((r) => {
        if (live) {
          if (r.ok) setProviders(r.value);
          else setProviderError(r.error);
        }
      })
      .catch(() => {
        if (live) setProviderError(tr("studio.m749fa1b7e2"));
      });
    return () => {
      live = false;
    };
  }, []);
  const [providerId, setProviderId] = useState<
    "manual-import" | "codex-native"
  >(latest?.providerId ?? "manual-import");
  const [codex, setCodex] = useState<CodexStatus>({
    state: "unavailable",
    message: tr("studio.m893ba1edb5"),
  });
  const provider = providers.find((p) => p.id === providerId);
  function checkCodex() {
    void perform(
      () => window.laceframe.checkCodex(),
      (value) => {
        setCodex(value);
        void window.laceframe.providers().then((r) => {
          if (r.ok) setProviders(r.value);
        });
      },
    );
  }
  useEffect(() => {
    let live = true;
    void window.laceframe.checkCodex().then((r) => {
      if (live && r.ok) {
        setCodex(r.value);
        void window.laceframe.providers().then((p) => {
          if (live && p.ok) setProviders(p.value);
        });
      }
    });
    return () => {
      live = false;
    };
  }, []);
  const wasRunning = useRef(false);
  useEffect(() => {
    const running = codex.state === "running";
    if (visible || running || wasRunning.current) onRunningChange(running);
    wasRunning.current = running;
  }, [codex.state, onRunningChange, visible]);
  useEffect(() => {
    if (codex.state !== "running") return;
    let live = true;
    let pending = false;
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      void window.laceframe
        .generationStatus()
        .then((r) => {
          if (!live) return;
          if (r.ok) {
            setCodex(r.value.status);
            if (r.value.status.state !== "running") {
              onSnapshot(r.value.snapshot);
              setActiveId(r.value.status.attemptId ?? "");
            }
          } else setProviderError(r.error);
        })
        .catch(() => {
          if (live) setProviderError(tr("studio.m4c9304fd9c"));
        })
        .finally(() => {
          pending = false;
        });
    }, 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [codex.state, onSnapshot]);
  function generate() {
    if (!draft || !valid || !discardReview()) return;
    flow.setStep("Erzeugen");
    void perform(
      () =>
        window.laceframe.startGeneration({
          ...draft,
          providerId: "codex-native",
        }),
      (value) => {
        savedSignature.current = formSignature;
        onDirtyChange(qualityDirty);
        setCodex(value);
        setActiveId(value.attemptId ?? "");
        setComposer((old) => ({ ...old, saved: true }));
        onRunningChange(value.state === "running");
      },
    );
  }
  const draft: GenerationDraft | undefined =
    master && character && variant
      ? {
          mask: selectedMask,
          characterId: character.id,
          masterId: master.id,
          masterSha256: master.sha256,
          variantId: variant.id,
          artDirectionId: artDirection?.id,
          styleReferences,
          artDirectionRevision: artDirection?.revision,
          expressionPerformance: personalPerformance?.direction,
          action,
          intensity,
          supplementaryInstructions:
            promptMode === "automatic" ? "" : instructions,
          basePrompt: composer.base,
          prompt: protectExpressionPrompt(composer.text),
          providerId,
        }
      : undefined;
  const [hardFormat, setHardFormat] = useState<boolean>();
  useEffect(() => {
    let live = true;
    setHardFormat(undefined);
    if (master && editMode === "hard")
      void window.laceframe
        .qualityReport(master.id)
        .then((r) => {
          if (live) setHardFormat(r.ok && r.value.format === "png");
        })
        .catch(() => {
          if (live) setHardFormat(false);
        });
    return () => {
      live = false;
    };
  }, [master?.id, editMode]);
  const valid = Boolean(
    (provider?.capabilities.canImportResult ||
      ((codex.available ?? provider?.capabilities.canGenerate) &&
        codex.state !== "running")) &&
      editMode !== "soft" &&
      (editMode !== "hard" ||
        Boolean(
          selectedMask &&
            hardFormat === true &&
            master?.format === "png" &&
            master.width * master.height <= MAX_MASK_PIXELS,
        )) &&
      draft &&
      generationDraftSchema.safeParse(draft).success &&
      composer.pendingBase === undefined &&
      (promptMode === "expert" || composer.base === base) &&
      (providerId !== "codex-native" ||
        styleReferences.length === 0 ||
        codex.multipleReferences === true),
  );
  const matches =
    active && draft ? sameDraft(draftFromAttempt(active), draft) : false;
  const formSignature = JSON.stringify({
    master: master?.id,
    family: family?.id,
    variant: variant?.id,
    action,
    intensity,
    instructions,
    promptMode,
    prompt: composer.text,
  });
  const initialSignature = useRef(formSignature),
    savedSignature = useRef<string | undefined>(undefined);
  useEffect(
    () =>
      onDirtyChange(
        qualityDirty ||
          formSignature !==
            (savedSignature.current ?? initialSignature.current),
      ),
    [formSignature, qualityDirty, onDirtyChange],
  );
  const [replace, setReplace] = useState<{ file?: File } | null>(null);
  const [dragging, setDragging] = useState(false);
  const status = asset
    ? {
        candidate: tr("studio.m69efc98d11"),
        approved: tr("studio.med04045dd2"),
        rejected: tr("studio.ma9148e8654"),
      }[asset.status]
    : active
      ? active.providerId === "codex-native"
        ? tr("studio.m41aa115ca1")
        : tr("studio.m41282c9a1f")
      : tr("studio.m120e61f2ce");
  async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
    const result = await promise;
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }
  async function prepare(forceNew = false) {
    if (!draft || !valid) throw new Error(tr("studio.m9355927c98"));
    if (!forceNew && active && matches && !asset) return active;
    const saved = await unwrap(
      window.laceframe.command({ type: "prepareAttempt", draft }),
    );
    onSnapshot(saved);
    savedSignature.current = formSignature;
    onDirtyChange(qualityDirty);
    setComposer((old) => ({ ...old, saved: true }));
    const attempt = saved.project.attempts.at(-1)!;
    setActiveId(attempt.id);
    return attempt;
  }
  function savePrompt(openBrowser?: boolean) {
    void perform(
      async () => {
        const attempt = await prepare();
        if (openBrowser !== undefined) {
          await unwrap(window.laceframe.copyPrompt(attempt.id));
          if (openBrowser)
            await unwrap(window.laceframe.openChatGPT(CHATGPT_URL));
        }
        return { ok: true as const, value: null };
      },
      () => {},
      openBrowser === undefined
        ? tr("studio.m81f3499d3c")
        : openBrowser
          ? tr("studio.m1c02a51d7e")
          : tr("studio.maa2c623451"),
    );
  }
  function importImage(file?: File, forceNew = false) {
    void perform(
      async () => {
        if (!valid || providerId !== "manual-import")
          throw new Error(tr("studio.me1db3836df"));
        let image: StagedImage | null;
        if (file) {
          if (file.size > MAX_IMAGE_BYTES)
            throw new Error(tr("studio.mfe6b5a54d0"));
          image = await unwrap(
            window.laceframe.stageImage(
              new Uint8Array(await file.arrayBuffer()),
              file.name,
            ),
          );
        } else image = await unwrap(window.laceframe.chooseImage());
        if (!image) return { ok: true as const, value: null };
        try {
          const attempt = await prepare(forceNew);
          const saved = await unwrap(
            window.laceframe.command({
              type: "importResult",
              attemptId: attempt.id,
              token: image.token,
            }),
          );
          return { ok: true as const, value: saved };
        } finally {
          await window.laceframe.discardImage(image.token);
        }
      },
      (value) => {
        if (value) {
          onSnapshot(value);
          setActiveId(value.project.assets.at(-1)?.attemptId ?? "");
        }
        setReplace(null);
      },
    );
  }
  function discardReview() {
    return !qualityDirty || window.confirm(tr("studio.m0692974797"));
  }
  function requestImport(file?: File) {
    if (!discardReview()) return;
    flow.setStep("Erzeugen");
    if (providerId !== "manual-import") {
      void perform(
        async () => ({
          ok: false,
          error: tr("studio.m22be420cda"),
        }),
        () => {},
      );
      return;
    }
    if (asset) setReplace({ file });
    else importImage(file);
  }
  function editOptions(change: () => void) {
    if (!discardReview()) return;
    change();
    setActiveId("");
    setReplace(null);
  }
  function loadAttempt(id: string) {
    if (id !== activeId && !discardReview()) return;
    setActiveId(id);
    setCandidateKind("composite");
    setReplace(null);
  }
  function adoptAttempt(id: string) {
    const attempt = attempts.find((a) => a.id === id);
    if (!attempt) return;
    setActiveId(id);
    setEditMode(attempt.mask ? "hard" : "none");
    setMaskId(attempt.mask?.id ?? "");
    setCandidateKind("composite");
    setProviderId(attempt.providerId);
    setMasterId(attempt.masterId);
    setFamilyId(
      p.variants.find((v) => v.id === attempt.variantId)?.familyId ?? "",
    );
    setVariantId(attempt.variantId);
    setAction(attempt.action);
    setIntensity(attempt.intensity);
    setInstructions(attempt.promptRevision.supplementaryInstructions);
    setPromptMode("expert");
    setComposer({
      base: attempt.promptRevision.basePrompt,
      text: attempt.promptRevision.prompt,
      edited:
        attempt.promptRevision.prompt !== attempt.promptRevision.basePrompt,
      saved: true,
    });
    setReplace(null);
  }
  function command(cmd: Command, notice: string) {
    void perform(() => window.laceframe.command(cmd), onSnapshot, notice);
  }
  const running = codex.state === "running";
  const timing =
    codex.attemptId === activeId
      ? (codex.execution ?? active?.execution)
      : active?.execution;
  const requirements: Requirement[] = [];
  if (busy && !running)
    requirements.push({
      message: tr("studio.mb632c4ceb4"),
    });
  if (!character)
    requirements.push({
      message: tr("studio.m0b88139e9c"),
      target: "studio-context",
    });
  if (!master)
    requirements.push({
      message: tr("studio.m20a47d623a"),
    });
  if (!variant) requirements.push({ message: tr("studio.med0f136abc") });
  if (editMode === "soft")
    requirements.push({
      message: tr("studio.m61360f4ce8"),
    });
  if (
    editMode === "hard" &&
    (!master ||
      master.format !== "png" ||
      master.width * master.height > MAX_MASK_PIXELS ||
      hardFormat === false)
  )
    requirements.push({
      message: tr("studio.m2f6e95b714"),
    });
  if (editMode === "hard" && hardFormat === undefined)
    requirements.push({ message: tr("studio.m3d8ee134f6") });
  if (editMode === "hard" && !selectedMask)
    requirements.push({ message: tr("studio.m3ea765c32b") });
  if (providerId === "codex-native" && !codex.available && !running)
    requirements.push({ message: codex.message });
  if (
    providerId === "codex-native" &&
    styleReferences.length > 0 &&
    !codex.multipleReferences
  )
    requirements.push({
      message: tr("studio.m1cf899c764"),
    });
  if (!running)
    requirements.push(...promptRequirements(promptMode, composer, base));
  if (!valid && !running && !requirements.length)
    requirements.push({
      message: tr("studio.mad802ee11a"),
      target: "prompt-builder",
    });
  const slot = document.getElementById("create-action-slot");
  const codexLabels = {
    "not-installed": tr("studio.m36a2abb0cf"),
    "not-authenticated": tr("studio.m3af1e1869e"),
    unavailable: tr("studio.m360d989d41"),
    ready: tr("studio.mcc2de517fa"),
    running: tr("studio.m8ab68d5e03"),
    completed: tr("studio.m52a4a21b42"),
    failed: tr("studio.mf47b8595ef"),
    cancelled: tr("studio.m7b75eff51a"),
  };
  return (
    <div
      className="create-view"
      data-step={step}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {slot &&
        (visible || running) &&
        (step === "Erzeugen" || running) &&
        createPortal(
          <div className="create-action-bar">
            <div className="job-status">
              <p role="status" aria-label={tr("studio.m1546cae602")}>
                <strong>
                  {providerId === "codex-native" || running
                    ? codexLabels[codex.state]
                    : tr("studio.ma3733afa7e")}
                </strong>
                <span>
                  {providerId === "codex-native" || running
                    ? displayMessage(codex.message)
                    : tr("studio.mc81944c168")}
                </span>
              </p>
              {timing && (
                <output
                  aria-label={tr("studio.m5580293557")}
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
              {providerId === "codex-native" && (
                <small>{tr("studio.mf585c61394")}</small>
              )}
            </div>
            <div className="button-row">
              {providerId === "codex-native" && (
                <button
                  className="primary"
                  disabled={busy || !valid || running}
                  onClick={generate}
                >
                  {tr("studio.mfd1b7e32ff")}
                </button>
              )}
              {running && (
                <button
                  className="danger"
                  disabled={codex.phase === "stopping"}
                  onClick={() =>
                    void perform(
                      async () => {
                        await unwrap(window.laceframe.cancelGeneration());
                        return window.laceframe.generationStatus();
                      },
                      (value) => {
                        setCodex(value.status);
                        onSnapshot(value.snapshot);
                        setActiveId(value.status.attemptId ?? "");
                      },
                    )
                  }
                >
                  {tr("studio.m611dcba198")}
                </button>
              )}
              {providerId === "manual-import" && (
                <button
                  className="primary"
                  disabled={busy || !valid || running}
                  onClick={() => requestImport()}
                >
                  {asset ? tr("studio.m3d13f2eb9b") : tr("studio.m3dc71ce5b9")}
                </button>
              )}
            </div>
          </div>,
          slot,
        )}
      <StudioSteps {...flow} />
      {(!expert || step !== "Erzeugen") && (
        <PromptConflict state={composer} onChange={setComposer} />
      )}
      <p className="studio-context-summary">
        {tr("studio.m83fe1716b7")}
        {character?.name ?? tr("common.m1c268b3dcc")} {tr("studio.mcac8e58b3a")}
        {master?.version ?? "—"} · {family?.label} / {variant?.label} ·{" "}
        {artDirection?.name ?? "Eigener Masterstil"}
      </p>
      {providerError && (
        <p role="alert" className="error">
          {displayMessage(providerError)}
        </p>
      )}
      {!character && (
        <div className="prompt-conflict">
          <p>{tr("studio.me073caaec1")}</p>
          <button onClick={onCharacters}>{tr("studio.m6bdf20436b")}</button>
        </div>
      )}
      {(step === "Auswählen" || step === "Erzeugen") && (
        <section
          className="studio-reference"
          aria-label={tr("studio.m558170f96d")}
        >
          <PortraitPreview
            image={master}
            caption={tr("studio.mff170e17a8", {
              v0: character?.name ?? "Figur",
              v1: master?.version ?? "—",
            })}
          />
          <p>{tr("studio.m0e0d3e4ce4")}</p>
          {step === "Auswählen" && (
            <button
              className="primary"
              disabled={!master || !variant}
              onClick={() => flow.setStep("Erzeugen")}
            >
              {tr("studio.m82c05b2ccc")}
            </button>
          )}
          {step === "Erzeugen" && (
            <p className="generation-brief">
              {family?.label} · {variant?.label} ·{" "}
              {action === "silent"
                ? tr("studio.m70bcb5a44e")
                : action === "speaking"
                  ? tr("studio.mf541c979a4")
                  : tr("studio.m1b5e7851ce")}{" "}
              · {artDirection?.name ?? "Eigener Masterstil"}
            </p>
          )}
        </section>
      )}
      {step === "Auswählen" && (
        <div className="studio-settings">
          <div
            className={`create-header${p.artDirections.length ? " has-style" : ""}`}
          >
            {!contextControlled && (
              <>
                <label>
                  {tr("studio.m446cb18289")}
                  <select
                    aria-label={tr("studio.me7d205da98")}
                    value={character?.id ?? ""}
                    onChange={(e) => {
                      if (
                        !matches &&
                        formSignature !==
                          (savedSignature.current ??
                            initialSignature.current) &&
                        !window.confirm(tr("studio.m810a4771f8"))
                      )
                        return;
                      command(
                        { type: "selectCharacter", id: e.target.value },
                        tr("studio.mb0e86ee40c"),
                      );
                    }}
                  >
                    <option value="" disabled>
                      {tr("studio.m7d5bc64536")}
                    </option>
                    {p.characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label>
              {tr("studio.ma2bb34780a")}
              <select
                aria-label={tr("studio.m7e86a3db5e")}
                value={master?.id ?? ""}
                onChange={(e) => editOptions(() => setMasterId(e.target.value))}
              >
                <option disabled value="">
                  {tr("studio.m885eeebb59")}
                </option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>
                    V{m.version} · {m.width} × {m.height}{" "}
                    {tr("studio.m24df89e2f7")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("studio.maca7d726ea")}
              <select
                aria-label={tr("studio.mf2f90550b0")}
                value={family?.id ?? ""}
                onChange={(e) =>
                  editOptions(() => {
                    setFamilyId(e.target.value);
                    const selected = p.variants.find(
                      (v) => v.familyId === e.target.value,
                    );
                    setAction(selected?.suggestedAction ?? "silent");
                    setIntensity(selected?.intensity);
                    setVariantId(
                      p.variants.find((v) => v.familyId === e.target.value)
                        ?.id ?? "",
                    );
                  })
                }
              >
                {p.families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("studio.ma0f6dc6453")}
              <select
                aria-label={tr("studio.m15b5d968b0")}
                value={variant?.id ?? ""}
                onChange={(e) =>
                  editOptions(() => {
                    setVariantId(e.target.value);
                    const v = variants.find((v) => v.id === e.target.value);
                    if (v) {
                      setAction(v.suggestedAction);
                      setIntensity(v.intensity);
                    }
                  })
                }
              >
                <option disabled value="">
                  {tr("studio.m91257de3d1")}
                </option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} / {v.slug}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("studio.m9080a78b3e")}
              <select
                aria-label={tr("studio.m4e2abea6d3")}
                value={providerId}
                onChange={(e) => {
                  if (!discardReview()) return;
                  setProviderId(
                    e.target.value as "manual-import" | "codex-native",
                  );
                  setActiveId("");
                }}
              >
                <option value="manual-import">
                  {tr("studio.mfcfadfe115")}
                </option>
                <option value="codex-native">{tr("studio.ma40ff9970c")}</option>
              </select>
            </label>
          </div>
          <section
            className="studio-expression-summary"
            aria-label={tr("studio.me733fe4857")}
          >
            <div className="inspector-options">
              <label>
                {tr("studio.m1381815ac3")}
                <select
                  aria-label={tr("studio.m2d1e4feaad")}
                  value={action}
                  onChange={(e) =>
                    editOptions(() => setAction(e.target.value as VocalAction))
                  }
                >
                  <option value="silent">{tr("studio.m70bcb5a44e")}</option>
                  <option value="speaking">{tr("studio.mf541c979a4")}</option>
                  <option value="shouting">{tr("studio.m1b5e7851ce")}</option>
                </select>
              </label>
              <label>
                {tr("studio.m0f7c5a2037")}
                <input
                  aria-label={tr("studio.m34e8e23dbc")}
                  type="number"
                  min="0"
                  max="1"
                  step=".05"
                  value={intensity ?? ""}
                  onChange={(e) =>
                    editOptions(() =>
                      setIntensity(
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                      ),
                    )
                  }
                />
              </label>
            </div>
            {expert && (
              <p className="summary-direction">
                {personalPerformance?.direction || variant?.prompt}
              </p>
            )}
            <button
              disabled={!character || !variant}
              onClick={() => {
                if (character && variant)
                  onEditExpression({
                    characterId: character.id,
                    mode: "expression",
                    masterId: master?.id,
                    familyId: family?.id,
                    variantId: variant.id,
                  });
              }}
            >
              {tr("studio.m5fc7b738c6")}
            </button>
          </section>
          <section className="studio-style-choice">
            <h3>{tr("studio.m7bf114c17f")}</h3>
            {character && (
              <label>
                {tr("studio.ma75a473438")}
                <select
                  aria-label={tr("studio.md0a8680b38")}
                  value={
                    character.styleSelection?.mode === "master"
                      ? "master"
                      : character.styleSelection?.mode === "profile"
                        ? `profile:${character.styleSelection.profileId}`
                        : "project"
                  }
                  onChange={(e) =>
                    command(
                      {
                        type: "setCharacterStyle",
                        characterId: character.id,
                        selection:
                          e.target.value === "project"
                            ? { mode: "project" }
                            : e.target.value === "master"
                              ? { mode: "master" }
                              : {
                                  mode: "profile",
                                  profileId: e.target.value.slice(8),
                                },
                      },
                      tr("studio.m23e6766fb4"),
                    )
                  }
                >
                  <option value="project">{tr("studio.m469a6fdfe5")}</option>
                  <option value="master">{tr("studio.m512fe94ce9")}</option>
                  {p.artDirections.map((a) => (
                    <option key={a.id} value={`profile:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button onClick={() => onArtDirection(artDirection?.id)}>
              {tr("studio.mef0771e059")}
            </button>
          </section>
        </div>
      )}
      {step === "Erzeugen" && expert && (
        <div>
          <section className="reference-inputs">
            <h3>
              {tr("studio.m255a2b902d")}{" "}
              {master ? 1 + styleReferences.length : 0}
            </h3>
            {master && (
              <ImagePreview
                id={master.id}
                caption={tr("studio.mb8abe202c2")}
                zoom="fit"
              />
            )}
            {styleReferences.map((r, i) => (
              <ImagePreview
                key={r.id}
                id={r.id}
                caption={tr("studio.m240ca8af0d", { v0: i + 2 })}
                zoom="fit"
              />
            ))}
          </section>
        </div>
      )}
      {step === "Bearbeiten" && (
        <div className="studio-mask-tools">
          {master && (
            <div className="mask-controls">
              <label>
                {tr("studio.m3a5aea5577")}
                <select
                  aria-label={tr("studio.m3a5aea5577")}
                  value={editMode}
                  onChange={(e) =>
                    editOptions(() =>
                      setEditMode(e.target.value as typeof editMode),
                    )
                  }
                >
                  <option value="none">{tr("studio.m9e1390b77e")}</option>
                  <option value="soft">{tr("studio.m238d825372")}</option>
                  <option value="hard">{tr("studio.mfa35d233df")}</option>
                </select>
              </label>
              {editMode === "soft" && (
                <p className="warning">{tr("studio.mab49edc33a")}</p>
              )}
              {editMode === "hard" && (
                <>
                  {(master.format !== "png" ||
                    master.width * master.height > MAX_MASK_PIXELS) && (
                    <p className="warning">{tr("studio.m5535e50055")}</p>
                  )}
                  <label>
                    {tr("studio.m1deed24dff")}
                    <select
                      aria-label={tr("studio.m1deed24dff")}
                      value={mask?.id ?? ""}
                      onChange={(e) =>
                        editOptions(() => setMaskId(e.target.value))
                      }
                    >
                      <option value="">{tr("studio.m422bf07c9f")}</option>
                      {masks.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {expert
                            ? tr("studio.m5eb66b0ca5", {
                                v0: m.revision,
                                v1: m.sha256.slice(0, 8),
                              })
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={master.width * master.height > MAX_MASK_PIXELS}
                    onClick={() => setMaskEditor(true)}
                  >
                    {mask ? tr("studio.m88608d698b") : tr("studio.m45cca50395")}
                  </button>
                  {mask && (
                    <button
                      onClick={() => {
                        setMaskId("");
                        setMaskEditor(true);
                      }}
                    >
                      {tr("studio.m9ae0c5e261")}
                    </button>
                  )}
                  <small>{tr("studio.m1633b219d2")}</small>
                </>
              )}
            </div>
          )}
          {maskEditor && master && (
            <MaskEditor
              key={`${master.id}/${mask?.id ?? "new"}`}
              master={master}
              mask={mask}
              onClose={() => setMaskEditor(false)}
              onSave={async (weights, name) => {
                const saved = await unwrap(
                  window.laceframe.command({
                    type: "saveMask",
                    masterId: master.id,
                    previousId: mask?.id,
                    name,
                    weights: new Uint8Array(weights),
                  }),
                );
                onSnapshot(saved);
                setMaskId(saved.project.masks.at(-1)!.id);
                setActiveId("");
              }}
            />
          )}
        </div>
      )}
      <section
        className={`create-result ${dragging ? "drag-active" : ""}`}
        data-step={step}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          if (busy || running) return;
          if (e.dataTransfer.files.length !== 1) {
            void perform(
              async () => ({
                ok: false,
                error: tr("studio.m3bc88761b7"),
              }),
              () => {},
            );
            return;
          }
          requestImport(e.dataTransfer.files[0]);
        }}
      >
        {step !== "Auswählen" && (
          <div className="comparison-heading">
            <h2>{tr("studio.mbfdaacb06d")}</h2>
            <span className={`badge ${asset?.status ?? ""}`}>{status}</span>
          </div>
        )}
        {step !== "Auswählen" && active?.mask && (
          <div className="mask-controls">
            <label>
              {tr("studio.m191cd5aee7")}
              <select
                aria-label={tr("studio.m60d63fc023")}
                value={candidateKind}
                onChange={(e) => {
                  if (discardReview()) setCandidateKind(e.target.value);
                }}
              >
                <option value="raw">{tr("studio.m0c63256404")}</option>
                <option value="composite">
                  {tr("studio.mb4a13ecc6b")}
                  {!composite ? tr("studio.mc1af5912d8") : ""}
                </option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={maskOverlay}
                onChange={(e) => setMaskOverlay(e.target.checked)}
              />
              {tr("studio.mdbd9b468f8")}
            </label>
            <small>
              {tr("studio.m4add58eae4")}
              {activeMask?.name} {tr("studio.mda8ec3e284")}
              {active.mask.revision} · {active.mask.sha256.slice(0, 12)} ·{" "}
              {composite && asset?.composite
                ? tr("studio.m032bd26ed6", {
                    v0:
                      asset.status === "approved"
                        ? "freigegeben"
                        : asset.status === "rejected"
                          ? "abgelehnt"
                          : tr("studio.m08112f78b5"),
                  })
                : tr("studio.m2037febecf")}
            </small>
            {raw && !composite && (
              <>
                {raw.width !== reviewMaster?.width ||
                raw.height !== reviewMaster?.height ? (
                  <p className="warning">{tr("studio.m4195067109")}</p>
                ) : (
                  <button
                    onClick={() => {
                      if (window.confirm(tr("studio.m7fc576c1d9"))) {
                        void perform(
                          () =>
                            window.laceframe.command({
                              type: "createComposite",
                              rawId: raw.id,
                              registrationConfirmed: true,
                            }),
                          (value) => {
                            onSnapshot(value);
                            setCandidateKind("composite");
                          },
                          tr("studio.md0fb1752e8"),
                        );
                      }
                    }}
                  >
                    {tr("studio.m74fa28324d")}
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {(step === "Bearbeiten" || step === "Freigeben") && (
          <MasterCandidateCompare
            master={reviewMaster}
            candidate={asset}
            mask={maskOverlay ? activeMask : undefined}
          />
        )}
        {step === "Erzeugen" && asset && (
          <PortraitPreview image={asset} caption={tr("studio.m8d74fdadb0")} />
        )}
        {asset && (
          <AssetQuality
            key={asset.id}
            source={asset}
            workspaceStep={step}
            expert={expert}
            onDirtyChange={setQualityDirty}
            project={p}
            onSnapshot={onSnapshot}
            disabled={busy || running}
          />
        )}
        {!master && (
          <button onClick={onCharacters}>{tr("studio.m0d3a2a644e")}</button>
        )}
        {!asset && step !== "Auswählen" && (
          <p className="drop-hint">{tr("studio.m5259a4d93a")}</p>
        )}
        {asset && step !== "Auswählen" && !matches && (
          <p className="warning">{tr("studio.m73f844aa11")}</p>
        )}
        {replace && (
          <div className="prompt-conflict" role="alert">
            <strong>{tr("studio.md18a382e47")}</strong>
            <p>{tr("studio.m9a132df560")}</p>
            <div className="button-row">
              <button onClick={() => setReplace(null)}>
                {tr("studio.mf7ff1178af")}
              </button>
              <button
                className="primary"
                disabled={!valid || providerId !== "manual-import"}
                onClick={() => importImage(replace.file, true)}
              >
                {tr("studio.m97f0edbd18")}
              </button>
            </div>
          </div>
        )}
        {asset && step === "Freigeben" && (
          <p aria-label={tr("studio.m2596db64f0")}>
            {tr("studio.m71b6fc373b")}
            {new Date(asset.createdAt).toLocaleString(i18n.language)}{" "}
            {tr("studio.m17cf0be840")}
            {reviewMaster?.version ?? "—"} · {asset.width} × {asset.height} ·{" "}
            {active?.providerId === "codex-native"
              ? tr("studio.m616efbe968")
              : tr("studio.mfcfadfe115")}
            .
            {active && (
              <>
                {" "}
                {tr("studio.m057c916388")}
                {attempts.indexOf(active) + 1}
                {tr("studio.ma9782a71f1")}{" "}
                {new Date(active.promptRevision.createdAt).toLocaleString(
                  i18n.language,
                )}
                .
                {active.artDirectionRevision && (
                  <>
                    {" "}
                    {tr("studio.mb07cf1ca78")}
                    {active.artDirectionRevision}.
                  </>
                )}
              </>
            )}
            {expert && (
              <>
                {" "}
                {tr("studio.m6a85cca034")}
                {asset.id} {tr("studio.md7e1f4d17c")}
                {asset.sha256}
              </>
            )}
          </p>
        )}
        {asset && step === "Freigeben" && (
          <Evidence
            compact={!expert}
            id={asset.id}
            label={tr("studio.m8f5677e70d")}
          />
        )}
        {asset && step === "Freigeben" && (
          <div className="comparison-review button-row">
            <button onClick={() => onInspect(asset.id)}>
              {tr("studio.m72b8b4ea0e")}
            </button>
            {asset.status === "candidate" && (
              <>
                <button
                  className="danger"
                  onClick={() =>
                    command(
                      { type: "review", id: asset.id, status: "rejected" },
                      tr("studio.mef1679f41b"),
                    )
                  }
                >
                  {tr("studio.ma8dffbb642")}
                </button>
                <button
                  className="primary"
                  disabled={Boolean(active?.mask && !asset.composite)}
                  onClick={() =>
                    command(
                      { type: "review", id: asset.id, status: "approved" },
                      tr("studio.mb1cb8f0dc4"),
                    )
                  }
                >
                  {tr("studio.m898247d198")}
                </button>
              </>
            )}
          </div>
        )}
      </section>
      {expert && step !== "Auswählen" && (
        <div className="create-drawers">
          {step === "Erzeugen" && (
            <section className="panel prompt-drawer">
              <h3>
                {tr("studio.mb5129ac6ab")}
                {composer.edited ? tr("studio.m15ef7e8cd2") : ""}
                {composer.pendingBase !== undefined
                  ? tr("studio.med732f583d")
                  : ""}
              </h3>
              <PromptComposer
                sources={[
                  {
                    layer: tr("common.m6725e7bbcd"),
                    source: tr("studio.m0206897881"),
                  },
                  {
                    layer: tr("common.m7e744141b4"),
                    source: artDirection
                      ? `${artDirection.name} · R${artDirection.revision}`
                      : tr("studio.m8fe2cb824b"),
                  },
                  {
                    layer: tr("common.m2770dce311"),
                    source: master
                      ? `${character?.name} · Master V${master.version} · ${master.id}`
                      : tr("studio.md109bd6be5"),
                  },
                  {
                    layer: "Outfit",
                    source: tr("studio.m5f220c7d7b"),
                  },
                  {
                    layer: tr("common.m1279850d20"),
                    source: personalPerformance
                      ? tr("studio.m16a9eaa59d")
                      : tr("studio.mdcb265d778", {
                          v0: family?.label,
                          v1: variant?.label,
                        }),
                  },
                  {
                    layer: tr("common.m47fca483c8"),
                    source: tr("studio.m998f222286"),
                  },
                  {
                    layer: tr("common.m1c9b1f80be"),
                    source:
                      promptMode === "expert"
                        ? tr("studio.m8e9913b620")
                        : instructions || tr("common.m375cda06a9"),
                  },
                ]}
                state={composer}
                onChange={setComposer}
                mode={promptMode}
                onModeChange={changePromptMode}
                extraInstructions={instructions}
                onExtraChange={setInstructions}
              />
              <div className="button-row prompt-actions">
                <button
                  disabled={!valid || Boolean(matches)}
                  onClick={() => savePrompt()}
                >
                  {tr("studio.md917903a08")}
                </button>
                <button disabled={!valid} onClick={() => savePrompt(false)}>
                  {tr("studio.m754b01ae0b")}
                </button>
                <button disabled={!valid} onClick={() => savePrompt(true)}>
                  {tr("studio.m7f4442bd68")}
                </button>
              </div>
              <p className="muted">{tr("studio.m7de202ffa2")}</p>
            </section>
          )}
          <section className="panel create-inspector">
            <h3>{tr("studio.m37e6e23a04")}</h3>
            {active?.mask && (
              <p className="mono">
                {tr("studio.m93c744e1d1")}
                {active.mask.id} {tr("studio.m8d8560f759")}
                {active.mask.revision} {tr("studio.md7e1f4d17c")}
                {active.mask.sha256}
              </p>
            )}
            {asset?.composite && (
              <p className="mono">
                {tr("studio.m170de8737f")}
                {asset.composite.version} · {asset.composite.rule}{" "}
                {tr("studio.m9867e912a5")}
                {asset.composite.rawId} / {asset.composite.rawSha256}{" "}
                {tr("studio.m294c023309")}
              </p>
            )}
            <p className="mono">
              {tr("studio.m3b36e5c465")}
              {master?.id ?? "—"}
              <br />
              {tr("studio.mcd45438289")}
              {master?.sha256 ?? "—"}
              <br />
              {tr("studio.m1299a5644a")}
              {providerId} {tr("studio.maab38ff58c")}
            </p>
            <div className="button-row">
              <button onClick={checkCodex}>{tr("studio.m42511032ba")}</button>
              {master && (
                <button
                  onClick={() =>
                    void perform(
                      () => window.laceframe.revealMaster(master.id),
                      () => {},
                      tr("studio.m52d4bf5584"),
                    )
                  }
                >
                  {tr("studio.mf2efb57b4e")}
                </button>
              )}
            </div>
            {timing && (
              <p className="mono">
                {tr("studio.m84cc09ea4c")}
                {timing.startedAt}
                <br />
                {tr("studio.m0e49b1200d")}
                {timing.endedAt ?? tr("common.m121ae51aad")}
                <br />
                {tr("studio.m51a14ed031")}
                {timing.durationMs} {tr("studio.m7203edc226")}
                {uiLabel(timing.status)}
              </p>
            )}
          </section>
          <section className="panel attempt-history">
            <h3>
              {tr("studio.mea008abc03")}
              {attempts.length}
            </h3>
            {!attempts.length && <p>{tr("studio.m00601c8559")}</p>}
            {active && (
              <div className="historical-attempt">
                <h3>{tr("studio.m0f0a43645c")}</h3>
                <p>
                  {tr("studio.m460c2b5f03")}
                  {active.artDirectionRevision ?? "—"}{" "}
                  {tr("studio.m00e4353bcd")} {active.masterId}
                </p>
                <section>
                  <h3>{tr("studio.m3fcb72d18c")}</h3>
                  <pre
                    className="prompt-base"
                    aria-label={tr("studio.med66a658fe")}
                  >
                    {active.promptRevision.prompt}
                  </pre>
                </section>
                <button
                  onClick={() => {
                    if (
                      (qualityDirty ||
                        formSignature !==
                          (savedSignature.current ??
                            initialSignature.current)) &&
                      !window.confirm(tr("studio.m7b6e26275d"))
                    )
                      return;
                    adoptAttempt(active.id);
                  }}
                >
                  {tr("studio.m266b3be8de")}
                </button>
              </div>
            )}

            {[...attempts].reverse().map((a) => {
              const image = p.assets.find((image) => image.attemptId === a.id);
              return (
                <button
                  key={a.id}
                  aria-pressed={activeId === a.id}
                  onClick={() => loadAttempt(a.id)}
                >
                  <strong>
                    {p.variants.find((v) => v.id === a.variantId)?.label ??
                      "Variante"}
                  </strong>
                  <span className={`badge ${image?.status ?? ""}`}>
                    {image
                      ? {
                          candidate: tr("studio.m3c49ac4c54"),
                          approved: tr("studio.med04045dd2"),
                          rejected: tr("studio.ma9148e8654"),
                        }[image.status]
                      : a.providerId === "codex-native"
                        ? tr("studio.m7cb86c2920")
                        : tr("studio.m41282c9a1f")}
                  </span>
                  <small>
                    {new Date(a.createdAt).toLocaleString(i18n.language)} ·{" "}
                    {uiLabel(a.action)}
                    {a.execution
                      ? tr("studio.m2fa20b26a4", {
                          v0: executionLabel(
                            a.execution,
                            running && codex.attemptId === a.id,
                          ),
                        })
                      : ""}
                  </small>
                </button>
              );
            })}
          </section>
        </div>
      )}
    </div>
  );
}
