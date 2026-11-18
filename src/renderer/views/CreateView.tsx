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
      !intent ||
      intent.mode !== "expression" ||
      intent.characterId !== character?.id
    )
      return;
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
    } else setActiveId("");
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
        if (live)
          setProviderError(
            "Anbieter konnten nicht geladen werden. Workspace erneut öffnen.",
          );
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
    message: "Codex wird geprüft …",
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
          if (live)
            setProviderError(
              "Status konnte nicht gelesen werden. Generierung über Abbrechen beenden.",
            );
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
    flow.setStep("Erzeugen");
    if (!draft || !valid) return;
    void perform(
      () =>
        window.laceframe.startGeneration({
          ...draft,
          providerId: "codex-native",
        }),
      (value) => {
        savedSignature.current = formSignature;
        onDirtyChange(false);
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
        formSignature !== (savedSignature.current ?? initialSignature.current),
      ),
    [formSignature, onDirtyChange],
  );
  const [replace, setReplace] = useState<{ file?: File } | null>(null);
  const [dragging, setDragging] = useState(false);
  const status = asset
    ? {
        candidate: "Entwurf · ungeprüft",
        approved: "Freigegeben",
        rejected: "Abgelehnt",
      }[asset.status]
    : active
      ? active.providerId === "codex-native"
        ? "Kein bestätigtes Codex-Ergebnis"
        : "Bildimport ausstehend"
      : "Noch kein Ergebnis · nicht generiert";
  async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
    const result = await promise;
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }
  async function prepare(forceNew = false) {
    if (!draft || !valid)
      throw new Error(
        "Freigegebenen Master und Variante wählen; Prompt-Konflikt auflösen.",
      );
    if (!forceNew && active && matches && !asset) return active;
    const saved = await unwrap(
      window.laceframe.command({ type: "prepareAttempt", draft }),
    );
    onSnapshot(saved);
    savedSignature.current = formSignature;
    onDirtyChange(false);
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
        ? "Prompt-Revision gespeichert."
        : openBrowser
          ? "Prompt kopiert. Masterbild im Browser manuell als Referenz beifügen."
          : "Prompt kopiert.",
    );
  }
  function importImage(file?: File, forceNew = false) {
    void perform(
      async () => {
        if (!valid || providerId !== "manual-import")
          throw new Error(
            "Master und Variante wählen und eigenen Prompt bestätigen.",
          );
        let image: StagedImage | null;
        if (file) {
          if (file.size > MAX_IMAGE_BYTES)
            throw new Error("Das Bild überschreitet 32 MiB.");
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
  function requestImport(file?: File) {
    flow.setStep("Erzeugen");
    if (providerId !== "manual-import") {
      void perform(
        async () => ({
          ok: false,
          error:
            "Für einen manuellen Ergebnisimport den Anbieter „Manueller Import“ wählen.",
        }),
        () => {},
      );
      return;
    }
    if (asset) setReplace({ file });
    else importImage(file);
  }
  function editOptions(change: () => void) {
    change();
    setActiveId("");
    setReplace(null);
  }
  function loadAttempt(id: string) {
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
      message: "Eine andere Aktion oder Generierung läuft.",
    });
  if (!character)
    requirements.push({ message: "Figur fehlt.", target: "studio-context" });
  if (!master)
    requirements.push({
      message:
        "Kein freigegebener Master. Master im Studio erstellen oder unter Characters importieren.",
    });
  if (!variant) requirements.push({ message: "Emotionsvariante fehlt." });
  if (editMode === "soft")
    requirements.push({
      message: "Soft Lock wird vom verfügbaren Provider nicht unterstützt.",
    });
  if (
    editMode === "hard" &&
    (!master ||
      master.format !== "png" ||
      master.width * master.height > MAX_MASK_PIXELS ||
      hardFormat === false)
  )
    requirements.push({
      message:
        "Ungeeignetes Format für Hard Pixel Lock: PNG RGBA8, nicht animiert, maximal 16 MP erforderlich.",
    });
  if (editMode === "hard" && hardFormat === undefined)
    requirements.push({ message: "Hard-Pixel-Lock-Format wird geprüft." });
  if (editMode === "hard" && !selectedMask)
    requirements.push({ message: "Gespeicherte Maskenrevision fehlt." });
  if (providerId === "codex-native" && !codex.available && !running)
    requirements.push({ message: codex.message });
  if (
    providerId === "codex-native" &&
    styleReferences.length > 0 &&
    !codex.multipleReferences
  )
    requirements.push({
      message:
        "Mehrfachreferenzen nicht bestätigt. Stil ohne Referenzbilder oder eigenen Masterstil wählen.",
    });
  if (!running)
    requirements.push(...promptRequirements(promptMode, composer, base));
  if (!valid && !running && !requirements.length)
    requirements.push({
      message:
        "Einstellungen oder Prompt überschreiten die erlaubten Grenzen. Eingaben im Prompt Builder prüfen.",
      target: "prompt-builder",
    });
  const slot = document.getElementById("create-action-slot");
  const codexLabels = {
    "not-installed": "Codex nicht installiert",
    "not-authenticated": "Nicht angemeldet",
    unavailable: "ImageGen nicht verfügbar",
    ready: "Codex bereit",
    running: "Generierung läuft",
    completed: "Generierung abgeschlossen",
    failed: "Generierung fehlgeschlagen",
    cancelled: "Generierung abgebrochen",
  };
  const [promptOpen, setPromptOpen] = useState(true);
  useEffect(() => {
    if (composer.pendingBase !== undefined) setPromptOpen(true);
  }, [composer.pendingBase]);
  return (
    <div
      className="create-view"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {slot &&
        (visible || running) &&
        createPortal(
          <div className="create-action-bar">
            <div className="job-status">
              <p role="status" aria-label="Codex Status">
                <strong>
                  {providerId === "codex-native" || running
                    ? codexLabels[codex.state]
                    : "Manueller Ergebnisimport"}
                </strong>
                <span>
                  {providerId === "codex-native" || running
                    ? codex.message
                    : "PNG/WebP ablegen oder importieren · Prompt und Master bleiben zugeordnet."}
                </span>
              </p>
              {timing && (
                <output
                  aria-label="Generierungszeit"
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
                <small>
                  Master + Prompt an Codex · nutzt dein Codex-Kontingent.
                </small>
              )}
            </div>
            <div className="button-row">
              {providerId === "codex-native" && (
                <button
                  className="primary"
                  disabled={busy || !valid || running}
                  onClick={generate}
                >
                  Mit Masterreferenz generieren
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
                  Generierung abbrechen
                </button>
              )}
              {providerId === "manual-import" && (
                <button
                  className="primary"
                  disabled={busy || !valid || running}
                  onClick={() => requestImport()}
                >
                  {asset ? "Ergebnis ersetzen …" : "Ergebnis importieren …"}
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
        Arbeitsauswahl:{" "}
        {character?.name ?? "Keine Figur"} · Master V{master?.version ?? "—"} ·{" "}
        {family?.label} / {variant?.label} ·{" "}
        {artDirection?.name ?? "Eigener Masterstil"}
      </p>
      {providerError && (
        <p role="alert" className="error">
          {providerError}
        </p>
      )}
      {!character && (
        <div className="prompt-conflict">
          <p>Figur anlegen und ihren freigegebenen Master importieren.</p>
          <button onClick={onCharacters}>Zu Characters</button>
        </div>
      )}
      <div className="studio-settings" hidden={step !== "Auswählen"}>
        <div
          className={`create-header${p.artDirections.length ? " has-style" : ""}`}
        >
          {!contextControlled && (
            <>
              <label>
                Figur
                <select
                  aria-label="Create Figur"
                  value={character?.id ?? ""}
                  onChange={(e) => {
                    if (
                      !matches &&
                      formSignature !==
                        (savedSignature.current ?? initialSignature.current) &&
                      !window.confirm(
                        "Ungespeicherten Prompt verwerfen und Figur wechseln?",
                      )
                    )
                      return;
                    command(
                      { type: "selectCharacter", id: e.target.value },
                      "Figur ausgewählt.",
                    );
                  }}
                >
                  <option value="" disabled>
                    Figur wählen
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
            Master
            <select
              aria-label="Create Masterversion"
              value={master?.id ?? ""}
              onChange={(e) => editOptions(() => setMasterId(e.target.value))}
            >
              <option disabled value="">
                Master wählen
              </option>
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  V{m.version} · {m.width} × {m.height} · gesperrt
                </option>
              ))}
            </select>
          </label>
          <label>
            Emotion
            <select
              aria-label="Create Familie"
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
                    p.variants.find((v) => v.familyId === e.target.value)?.id ??
                      "",
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
            Variante
            <select
              aria-label="Create Variante"
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
                Variante wählen
              </option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} / {v.slug}
                </option>
              ))}
            </select>
          </label>
          <label>
            Anbieter
            <select
              aria-label="Create Anbieter"
              value={providerId}
              onChange={(e) => {
                setProviderId(
                  e.target.value as "manual-import" | "codex-native",
                );
                setActiveId("");
              }}
            >
              <option value="manual-import">Manueller Import</option>
              <option value="codex-native">Codex · ImageGen</option>
            </select>
          </label>
        </div>
        <section
          className="studio-expression-summary"
          aria-label="Expression Zusammenfassung"
        >
          <p>
            <strong>{character?.name ?? "Figur wählen"}</strong> · Master V
            {master?.version ?? "—"} ·{" "}
            {artDirection?.name ?? "Eigener Masterstil"} ·{" "}
            {family?.label ?? "Emotion wählen"} /{" "}
            {variant?.label ?? "Variante wählen"}
          </p>
          <div className="inspector-options">
            <label>
              Stimmaktion
              <select
                aria-label="Create Stimmaktion"
                value={action}
                onChange={(e) =>
                  editOptions(() => setAction(e.target.value as VocalAction))
                }
              >
                <option value="silent">Still</option>
                <option value="speaking">Sprechend</option>
                <option value="shouting">Rufend</option>
              </select>
            </label>
            <label>
              Intensität · optional
              <input
                aria-label="Create Intensität"
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
          <p className="summary-direction">
            <strong>
              {personalPerformance
                ? "Persönliche Performance"
                : "Globale Ausdrucksanweisung"}
              :
            </strong>{" "}
            {personalPerformance?.direction ||
              variant?.prompt ||
              "Familienname und Variante"}
          </p>
          <p className="muted summary-direction">
            Zusätzliche kreative Anweisung:{" "}
            {promptMode === "automatic"
              ? "keine (Automatisch)"
              : instructions || "keine"}
          </p>
          {promptMode === "expert" && (
            <p className="muted">
              Expert Override aktiv: Der manuelle Prompt kann von dieser
              strukturierten Zusammenfassung abweichen. Im Prompt Builder
              prüfen.
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
            Expression bearbeiten
          </button>
        </section>
        <details className="studio-lock-summary">
          <summary>Identität schützen · Outfit & Bildaufbau</summary>
          <h3>Identität schützen</h3>
          <p>
            {character?.name ?? "Figur wählen"} · Master V
            {master?.version ?? "—"} · {master?.width ?? "—"}×
            {master?.height ?? "—"}. Identität, Haare, Kleidung und Accessoires
            bleiben am gewählten Master gebunden.
          </p>
          <h3>Outfit & Composition</h3>
          <p>
            Unveränderlich aus dem gewählten Master. Gesichtsausdruck und
            Stimmaktion werden getrennt eingestellt. Echte Alpha-Transparenz ist
            verpflichtend.
          </p>
        </details>
        <h3>Art Direction / Style Lock</h3>
        <button
          className="text-link"
          onClick={() => onArtDirection(artDirection?.id)}
        >
          Art Direction bearbeiten
        </button>
        <div className="reference-roles">
          <span>
            Aktiver Stil:{" "}
            {artDirection
              ? `${artDirection.name} · R${artDirection.revision}`
              : "Eigener Masterstil"}
          </span>
          <span>Identität: eigener Master V{master?.version ?? "—"}</span>
          <span>
            Stilbilder: {styleReferences.length} · ausschließlich Darstellung
          </span>
          <span>
            Ausdruck:{" "}
            {personalPerformance
              ? "persönliches Profil"
              : "gemeinsame Variante"}
          </span>
          {character && (
            <label>
              Darstellungsstil dieser Figur
              <select
                aria-label="Charakter Stilzuordnung"
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
                    "Stilzuordnung gespeichert.",
                  )
                }
              >
                <option value="project">Projektstandard</option>
                <option value="master">
                  Eigener Masterstil · keine Stilreferenzen
                </option>
                {p.artDirections.map((a) => (
                  <option key={a.id} value={`profile:${a.id}`}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {providerId === "codex-native" && (
            <small>
              {styleReferences.length
                ? codex.multipleReferences
                  ? "Codex erhält: Bild 1 = Identitäts-Master, danach die Stilbilder der gewählten Revision. Keine Übernahme von Gesicht oder Outfit."
                  : "Mehrfachreferenzen nicht bestätigt. Auftrag blockiert; Textprofil ohne Stilbilder oder eigenen Masterstil wählen."
                : "Codex erhält nur den Identitäts-Master."}
            </small>
          )}
        </div>
        <p>
          Outfit: aus Master V{master?.version ?? "—"};{" "}
          {p.outfits
            .filter((o) => o.characterId === character?.id)
            .map((o) => `${o.name}: ${o.notes}`)
            .join(" · ") || "keine zusätzlichen Outfitnotizen"}
          .
        </p>
      </div>
      <div hidden={step !== "Erzeugen" || !expert}>
        <details className="reference-inputs">
          <summary>
            Tatsächlich verwendete Bildreferenzen ·{" "}
            {master ? 1 + styleReferences.length : 0}
          </summary>
          {master && (
            <ImagePreview
              id={master.id}
              caption="Bild 1 · Identity Master"
              zoom="fit"
            />
          )}
          {styleReferences.map((r, i) => (
            <ImagePreview
              key={r.id}
              id={r.id}
              caption={`Bild ${i + 2} · Stilreferenz, keine Identität`}
              zoom="fit"
            />
          ))}
        </details>
      </div>
      <div hidden={step !== "Bearbeiten"}>
        {master && (
          <div className="mask-controls">
            <label>
              Bearbeitungsmodus
              <select
                aria-label="Bearbeitungsmodus"
                value={editMode}
                onChange={(e) =>
                  editOptions(() =>
                    setEditMode(e.target.value as typeof editMode),
                  )
                }
              >
                <option value="none">Ohne Maske</option>
                <option value="soft">Soft Lock · nicht verfügbar</option>
                <option value="hard">Originalpixel erhalten · lokal</option>
              </select>
            </label>
            {editMode === "soft" && (
              <p className="warning">
                Keine dokumentierte Inpainting-Maskeneingabe im unterstützten
                Codex-Protokoll. Soft Lock nicht verfügbar; kein Auftrag wird
                gesendet.
              </p>
            )}
            {editMode === "hard" && (
              <>
                {(master.format !== "png" ||
                  master.width * master.height > MAX_MASK_PIXELS) && (
                  <p className="warning">
                    Hard Lock für diesen Master nicht verfügbar: benötigt PNG
                    bis 8 Bit pro Kanal und 16 Megapixel. Ohne Maske
                    weiterarbeiten; das Original wird nicht konvertiert.
                  </p>
                )}
                <label>
                  Maskenrevision
                  <select
                    aria-label="Maskenrevision"
                    value={mask?.id ?? ""}
                    onChange={(e) =>
                      editOptions(() => setMaskId(e.target.value))
                    }
                  >
                    <option value="">Maske wählen</option>
                    {masks.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · R{m.revision} · {m.sha256.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={master.width * master.height > MAX_MASK_PIXELS}
                  onClick={() => setMaskEditor(true)}
                >
                  {mask ? "Maske bearbeiten" : "Maske erstellen"}
                </button>
                {mask && (
                  <button
                    onClick={() => {
                      setMaskId("");
                      setMaskEditor(true);
                    }}
                  >
                    Neue Maske
                  </button>
                )}
                <small>
                  KI liefert Rohbild ohne Inpainting-Maske. Hard Lock berechnet
                  danach Originalpixel lokal; identische Abmessungen und
                  bestätigte Registrierung erforderlich. PNG bis 8 Bit / 16 MP.
                </small>
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
      <section
        className={`create-result ${dragging ? "drag-active" : ""}`}
        hidden={step === "Auswählen"}
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
                error: "Bitte genau ein PNG/WebP ablegen.",
              }),
              () => {},
            );
            return;
          }
          requestImport(e.dataTransfer.files[0]);
        }}
      >
        <div className="comparison-heading">
          <h2>Master / Entwurf</h2>
          <span className={`badge ${asset?.status ?? ""}`}>{status}</span>
        </div>
        {active?.mask && (
          <div className="mask-controls">
            <label>
              Ergebnisansicht
              <select
                aria-label="Rohkandidat oder Composite"
                value={candidateKind}
                onChange={(e) => setCandidateKind(e.target.value)}
              >
                <option value="raw">Rohkandidat</option>
                <option value="composite">
                  Geschütztes Ergebnis
                  {!composite ? " · noch nicht erstellt" : ""}
                </option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={maskOverlay}
                onChange={(e) => setMaskOverlay(e.target.checked)}
              />
              Gespeicherte Maskenüberlagerung
            </label>
            <small>
              Maskensnapshot: {activeMask?.name} · R{active.mask.revision} ·{" "}
              {active.mask.sha256.slice(0, 12)} ·{" "}
              {composite && asset?.composite
                ? `Geschütztes Ergebnis · ${asset.status === "approved" ? "freigegeben" : asset.status === "rejected" ? "abgelehnt" : "ungeprüft"}`
                : "KI-Rohbild · kein Pixel Lock"}
            </small>
            {raw && !composite && (
              <>
                {raw.width !== reviewMaster?.width ||
                raw.height !== reviewMaster?.height ? (
                  <p className="warning">
                    Hard Lock blockiert: unterschiedliche Abmessungen. Keine
                    automatische Skalierung oder Registrierung.
                  </p>
                ) : (
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Identische Maße beweisen keine Ausrichtung. Stimmen Ursprung (0,0), Ausschnitt und Gesichtslage überein? Nur bei bestätigter Registrierung das geschützte Ergebnis erstellen.",
                        )
                      ) {
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
                          "Geschütztes Ergebnis erstellt. Manuelle Prüfung erforderlich.",
                        );
                      }
                    }}
                  >
                    Registrierung bestätigen & geschütztes Ergebnis erstellen
                  </button>
                )}
              </>
            )}
          </div>
        )}
        <MasterCandidateCompare
          master={reviewMaster}
          candidate={asset}
          mask={maskOverlay ? activeMask : undefined}
        />
        <div hidden={step !== "Bearbeiten" && step !== "Freigeben"}>
          {asset && (
            <AssetQuality
              key={asset.id}
              source={asset}
              workspaceStep={step}
              project={p}
              onSnapshot={onSnapshot}
              disabled={busy || running}
            />
          )}
        </div>
        {!master && (
          <button onClick={onCharacters}>
            Freigegebenen Master importieren
          </button>
        )}
        {!asset && (
          <p className="drop-hint">
            PNG/WebP hier ablegen · bis 32 MiB · oder mit Masterreferenz
            generieren
          </p>
        )}
        {asset && !matches && (
          <p className="warning">
            Dieses Bild gehört zur gespeicherten Revision. Promptänderungen
            verändern seine Herkunft nicht.
          </p>
        )}
        {replace && (
          <div className="prompt-conflict" role="alert">
            <strong>Ergebnis ersetzen?</strong>
            <p>
              Ein neuer Versuch wird angelegt. Das bisherige Bild und seine
              Prompt-Revision bleiben im Verlauf erhalten.
            </p>
            <div className="button-row">
              <button onClick={() => setReplace(null)}>Abbrechen</button>
              <button
                className="primary"
                disabled={!valid || providerId !== "manual-import"}
                onClick={() => importImage(replace.file, true)}
              >
                Ersetzen bestätigen
              </button>
            </div>
          </div>
        )}
        {asset && step === "Freigeben" && (
          <p aria-label="Gespeicherte Bildherkunft">
            Entwurf vom {new Date(asset.createdAt).toLocaleString("de-DE")} ·
            Referenz: Master V{reviewMaster?.version ?? "—"} · {asset.width} ×{" "}
            {asset.height} ·{" "}
            {active?.providerId === "codex-native"
              ? "Codex"
              : "Manueller Import"}
            .
            {active && (
              <>
                {" "}
                Gespeicherter Versuch {attempts.indexOf(active) + 1};
                Generierungsanweisung vom{" "}
                {new Date(active.promptRevision.createdAt).toLocaleString(
                  "de-DE",
                )}
                .
                {active.artDirectionRevision && (
                  <> Stilrevision R{active.artDirectionRevision}.</>
                )}
              </>
            )}
            {expert && (
              <>
                {" "}
                Bild-ID {asset.id} · SHA-256 {asset.sha256}
              </>
            )}
          </p>
        )}
        {asset && step === "Freigeben" && (
          <Evidence id={asset.id} label="Expressionentwurf vor Freigabe" />
        )}
        {asset && (
          <div
            className="comparison-review button-row"
            hidden={step !== "Freigeben"}
          >
            <button onClick={() => onInspect(asset.id)}>
              In Library prüfen
            </button>
            {asset.status === "candidate" && (
              <>
                <button
                  className="danger"
                  onClick={() =>
                    command(
                      { type: "review", id: asset.id, status: "rejected" },
                      "Entwurf verworfen. Verlauf und Original bleiben erhalten.",
                    )
                  }
                >
                  Entwurf verwerfen
                </button>
                <button
                  className="primary"
                  disabled={Boolean(active?.mask && !asset.composite)}
                  onClick={() =>
                    command(
                      { type: "review", id: asset.id, status: "approved" },
                      "Als Expression freigegeben.",
                    )
                  }
                >
                  Als Expression freigeben
                </button>
              </>
            )}
          </div>
        )}
      </section>
      <div className="create-drawers" hidden={!expert || step === "Auswählen"}>
        <details
          className="panel prompt-drawer"
          hidden={step !== "Erzeugen"}
          open={promptOpen}
          onToggle={(e) => setPromptOpen(e.currentTarget.open)}
        >
          <summary>
            Prompt Builder{composer.edited ? " · eigene Bearbeitung" : ""}
            {composer.pendingBase !== undefined
              ? " · Auswahländerung bestätigen"
              : ""}
          </summary>
          <PromptComposer
            sources={[
              {
                layer: "System",
                source:
                  "Canvas, Alpha, unveränderlicher Master, sichere Herkunft und manuelle Freigabe (Main/Provider).",
              },
              {
                layer: "Style",
                source: artDirection
                  ? `${artDirection.name} · R${artDirection.revision}`
                  : "Eigener Masterstil",
              },
              {
                layer: "Character Identity",
                source: master
                  ? `${character?.name} · Master V${master.version} · ${master.id}`
                  : "Kein Master",
              },
              {
                layer: "Outfit",
                source:
                  "Unverändert aus dem ausgewählten Identity-Master; kein Outfittransfer aus Style Packs.",
              },
              {
                layer: "Expression Performance",
                source: personalPerformance
                  ? "Persönliche Performance dieser Figur"
                  : `Globale Vorlage: ${family?.label} / ${variant?.label}`,
              },
              {
                layer: "Composition",
                source:
                  "Registrierter Master-Canvas und gespeicherte Stil-/Kompositionsregeln; kein automatischer Zuschnitt.",
              },
              {
                layer: "Creative Supplements",
                source:
                  promptMode === "expert"
                    ? "Expliziter Expert Override; technische Regeln bleiben erhalten."
                    : instructions || "Keine Ergänzung",
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
              Generierungsanweisung speichern
            </button>
            <button disabled={!valid} onClick={() => savePrompt(false)}>
              Prompt kopieren
            </button>
            <button disabled={!valid} onClick={() => savePrompt(true)}>
              Prompt kopieren & ChatGPT öffnen
            </button>
          </div>
          <p className="muted">
            Browser-Weg: Prompt und tatsächliches Masterbild selbst beifügen.
            Native Codex-Generierung übermittelt beides erst nach dem
            Generieren-Klick und nutzt dein Codex-Kontingent.
          </p>
        </details>
        <details className="panel create-inspector">
          <summary>Technische Details · Herkunft</summary>
          {active?.mask && (
            <p className="mono">
              Maske {active.mask.id} · Revision {active.mask.revision} · SHA-256{" "}
              {active.mask.sha256}
            </p>
          )}
          {asset?.composite && (
            <p className="mono">
              Composite V{asset.composite.version} · {asset.composite.rule} ·
              Rohbild {asset.composite.rawId} / {asset.composite.rawSha256} ·
              Registrierung manuell bestätigt
            </p>
          )}
          <p className="mono">
            Master-ID: {master?.id ?? "—"}
            <br />
            SHA-256: {master?.sha256 ?? "—"}
            <br />
            Anbieter: {providerId} · Masken: nicht unterstützt
          </p>
          <div className="button-row">
            <button onClick={checkCodex}>Codex-Verfügbarkeit prüfen</button>
            {master && (
              <button
                onClick={() =>
                  void perform(
                    () => window.laceframe.revealMaster(master.id),
                    () => {},
                    "Referenz im Dateimanager angezeigt. Das Bild manuell im Browser beifügen.",
                  )
                }
              >
                Referenz im Ordner zeigen
              </button>
            )}
          </div>
          {timing && (
            <p className="mono">
              Start: {timing.startedAt}
              <br />
              Ende: {timing.endedAt ?? "nicht gesichert"}
              <br />
              Dauer: {timing.durationMs} ms · {timing.status}
            </p>
          )}
        </details>
        <details className="panel attempt-history">
          <summary>Versuchsverlauf · {attempts.length}</summary>
          {!attempts.length && <p>Noch kein Versuch gespeichert.</p>}
          {active && (
            <div className="historical-attempt">
              <h3>Historischer Versuch · unveränderlich</h3>
              <p>
                Die Auswahl ändert deinen Arbeitsentwurf nicht. Stilrevision R
                {active.artDirectionRevision ?? "—"} · Master-ID{" "}
                {active.masterId}
              </p>
              <details>
                <summary>Historischen Prompt ansehen</summary>
                <pre
                  className="prompt-base"
                  aria-label="Historischer Expression-Prompt"
                >
                  {active.promptRevision.prompt}
                </pre>
              </details>
              <button
                onClick={() => {
                  if (
                    formSignature !==
                      (savedSignature.current ?? initialSignature.current) &&
                    !window.confirm(
                      "Arbeitsentwurf durch diese gespeicherte Revision ersetzen?",
                    )
                  )
                    return;
                  adoptAttempt(active.id);
                }}
              >
                Als neuen Entwurf übernehmen
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
                        candidate: "Kandidat",
                        approved: "Freigegeben",
                        rejected: "Abgelehnt",
                      }[image.status]
                    : a.providerId === "codex-native"
                      ? "Kein bestätigtes Bild"
                      : "Bildimport ausstehend"}
                </span>
                <small>
                  {new Date(a.createdAt).toLocaleString("de-DE")} · {a.action}
                  {a.execution
                    ? ` · ${executionLabel(a.execution, running && codex.attemptId === a.id)}`
                    : ""}
                </small>
              </button>
            );
          })}
        </details>
      </div>
    </div>
  );
}
