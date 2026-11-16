import { useEffect, useState } from "react";
import type {
  Command,
  Snapshot,
  StagedImage,
  VocalAction,
} from "../../shared/domain";
import { MAX_IMAGE_BYTES } from "../../shared/domain";
import type { Result } from "../../shared/bridge";
import {
  CHATGPT_URL,
  sameDraft,
  composePrompt,
  draftFromAttempt,
  generationDraftSchema,
  newComposer,
  updateComposer,
  type ComposerState,
  type GenerationDraft,
  type ProviderDescriptor,
  type CodexStatus,
} from "../../shared/generation";
import { ImagePreview } from "../components/ImagePreview";
import { PromptComposer } from "../components/PromptComposer";

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
}: {
  snapshot: Snapshot;
  busy: boolean;
  perform: Perform;
  onSnapshot: (value: Snapshot) => void;
  onDirtyChange: (value: boolean) => void;
  onCharacters: () => void;
  onInspect: (id: string) => void;
  onRunningChange: (running: boolean) => void;
}) {
  const p = snapshot.project;
  const character = p.characters.find((c) => c.id === p.selectedCharacterId);
  const attempts = p.attempts.filter((a) => a.characterId === character?.id);
  const latest = attempts.at(-1);
  const [masterId, setMasterId] = useState(
    latest?.masterId ?? character?.masterId ?? "",
  );
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
  const [action, setAction] = useState<VocalAction>(
    latest?.action ?? variant?.suggestedAction ?? "silent",
  );
  const [intensity, setIntensity] = useState<number | undefined>(
    latest?.intensity ?? variant?.intensity,
  );
  const [instructions, setInstructions] = useState(
    latest?.promptRevision.supplementaryInstructions ?? "",
  );
  const base =
    master && character && variant && family
      ? composePrompt({
          characterName: character.name,
          master,
          variant,
          familyLabel: family.label,
          action,
          intensity,
          supplementaryInstructions: instructions,
        })
      : "";
  const [composer, setComposer] = useState<ComposerState>(() =>
    latest
      ? {
          base: latest.promptRevision.basePrompt,
          text: latest.promptRevision.prompt,
          edited:
            latest.promptRevision.prompt !== latest.promptRevision.basePrompt,
        }
      : newComposer(base),
  );
  useEffect(() => setComposer((old) => updateComposer(old, base)), [base]);
  const [activeId, setActiveId] = useState(latest?.id ?? "");
  const active = attempts.find((a) => a.id === activeId);
  const asset = active
    ? p.assets.find((a) => a.attemptId === active.id)
    : undefined;
  const [zoom, setZoom] = useState<number | "fit">("fit");
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
  useEffect(() => {
    onRunningChange(codex.state === "running");
  }, [codex.state, onRunningChange]);
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
    if (!draft || !valid) return;
    void perform(
      () =>
        window.laceframe.startGeneration({
          ...draft,
          providerId: "codex-native",
        }),
      (value) => {
        setCodex(value);
        setActiveId(value.attemptId ?? "");
        onRunningChange(value.state === "running");
      },
    );
  }
  const draft: GenerationDraft | undefined =
    master && character && variant
      ? {
          characterId: character.id,
          masterId: master.id,
          masterSha256: master.sha256,
          variantId: variant.id,
          action,
          intensity,
          supplementaryInstructions: instructions,
          basePrompt: composer.base,
          prompt: composer.text,
          providerId,
        }
      : undefined;
  const valid = Boolean(
    (provider?.capabilities.canImportResult ||
      (provider?.capabilities.canGenerate && codex.state !== "running")) &&
      draft &&
      generationDraftSchema.safeParse(draft).success &&
      composer.pendingBase === undefined,
  );
  const matches =
    active && draft ? sameDraft(draftFromAttempt(active), draft) : false;
  useEffect(
    () =>
      onDirtyChange(
        Boolean(!matches && (composer.edited || instructions.trim())),
      ),
    [matches, composer.edited, instructions, onDirtyChange],
  );
  const [replace, setReplace] = useState<{ file?: File } | null>(null);
  const [dragging, setDragging] = useState(false);
  const status = asset
    ? {
        candidate: "Kandidat · ungeprüft",
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
    const attempt = attempts.find((a) => a.id === id);
    if (!attempt) return;
    setActiveId(id);
    setProviderId(attempt.providerId);
    setMasterId(attempt.masterId);
    setFamilyId(
      p.variants.find((v) => v.id === attempt.variantId)?.familyId ?? "",
    );
    setVariantId(attempt.variantId);
    setAction(attempt.action);
    setIntensity(attempt.intensity);
    setInstructions(attempt.promptRevision.supplementaryInstructions);
    setComposer({
      base: attempt.promptRevision.basePrompt,
      text: attempt.promptRevision.prompt,
      edited: true,
    });
    setReplace(null);
  }
  function command(cmd: Command, notice: string) {
    void perform(() => window.laceframe.command(cmd), onSnapshot, notice);
  }
  return (
    <div
      className="create-view"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="create-intro">
        <div>
          <p className="eyebrow">MASTER → PROMPT → BILD → FREIGABE</p>
          <h2>Gleicher Charakter. Neuer Ausdruck.</h2>
        </div>
        <span className="badge">
          {provider?.label ?? "Anbieter wird geladen …"}
        </span>
      </div>
      <section className="panel codex-controls">
        <label>
          Anbieter
          <select
            aria-label="Create Anbieter"
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value as "manual-import" | "codex-native");
              setActiveId("");
            }}
          >
            <option value="manual-import">Manueller Import</option>
            <option value="codex-native">Codex · native Bildbearbeitung</option>
          </select>
        </label>
        <p role="status" aria-label="Codex Status">
          <strong>
            {
              {
                "not-installed": "Codex nicht installiert",
                "not-authenticated": "Nicht angemeldet",
                unavailable: "ImageGen nicht verfügbar",
                ready: "Codex bereit",
                running: "Generierung läuft",
                completed: "Generierung abgeschlossen",
                failed: "Generierung fehlgeschlagen",
                cancelled: "Generierung abgebrochen",
              }[codex.state]
            }
          </strong>{" "}
          · {codex.message}
        </p>
        <div className="button-row">
          <button onClick={checkCodex}>Codex-Verfügbarkeit prüfen</button>
          {providerId === "codex-native" && (
            <button
              className="primary"
              disabled={
                !valid ||
                (codex.state !== "ready" && codex.state !== "completed")
              }
              onClick={generate}
            >
              Mit Masterreferenz generieren
            </button>
          )}
        </div>
        {providerId === "codex-native" && (
          <p className="muted">
            Übermittelt nach deinem Klick den freigegebenen Master und diesen
            Prompt an Codex. Nutzt dein Codex-Kontingent. Genau ein Auftrag;
            keine automatischen Wiederholungen. Das Ergebnis wird in
            Originalauflösung importiert und muss geprüft werden. Bestehende
            Ergebnisse bleiben im Verlauf.
          </p>
        )}
      </section>
      {providerError && (
        <p role="alert" className="error">
          {providerError}
        </p>
      )}
      {!character && (
        <div className="prompt-conflict">
          <p>
            Zuerst eine Figur anlegen und ihren freigegebenen Master
            importieren.
          </p>
          <button onClick={onCharacters}>Zu Characters</button>
        </div>
      )}
      <div className="create-options">
        <label>
          Figur
          <select
            aria-label="Create Figur"
            value={character?.id ?? ""}
            onChange={(e) => {
              if (
                !matches &&
                (composer.edited || instructions) &&
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
        <label>
          Emotionsfamilie
          <select
            aria-label="Create Familie"
            value={family?.id ?? ""}
            onChange={(e) =>
              editOptions(() => {
                setFamilyId(e.target.value);
                const v = p.variants.find((v) => v.familyId === e.target.value);
                setVariantId(v?.id ?? "");
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
                  e.target.value === "" ? undefined : Number(e.target.value),
                ),
              )
            }
          />
        </label>
      </div>
      <div className="create-images">
        <section className="panel create-reference">
          <div className="section-head">
            <h2>Masterreferenz</h2>
            <span className="badge approved">
              {master ? "Freigegeben · gesperrt" : "Master fehlt"}
            </span>
          </div>
          <label>
            Masterversion
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
                  Master V{m.version} · {m.width} × {m.height}
                </option>
              ))}
            </select>
          </label>
          <ImagePreview
            id={master?.id}
            caption="Create · Masterreferenz"
            zoom={zoom}
          />
          {master ? (
            <p className="image-meta">
              {master.width} × {master.height} px ·{" "}
              {master.format.toUpperCase()} · Originalauflösung
            </p>
          ) : (
            <button onClick={onCharacters}>
              Freigegebenen Master importieren
            </button>
          )}
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
          <p className="reference-reminder">
            {providerId === "codex-native"
              ? "Codex erhält beim Generieren eine unveränderte Kopie dieses Masters als tatsächliche Bildreferenz."
              : "Das tatsächliche Masterbild in ChatGPT manuell beifügen. Dateiname oder Prompt allein reichen nicht als Referenz."}
          </p>
        </section>
        <section
          className={`panel create-result ${dragging ? "drag-active" : ""}`}
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
            if (busy) return;
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
          <div className="section-head">
            <h2>Dein Ergebnis</h2>
            <span className={`badge ${asset?.status ?? ""}`}>{status}</span>
          </div>
          <label>
            Gemeinsamer Zoom
            <select
              aria-label="Create Zoom"
              value={zoom}
              onChange={(e) =>
                setZoom(
                  e.target.value === "fit" ? "fit" : Number(e.target.value),
                )
              }
            >
              <option value="fit">Einpassen</option>
              {[25, 50, 100, 200, 400].map((z) => (
                <option key={z} value={z}>
                  {z}% · native Pixel
                </option>
              ))}
            </select>
          </label>
          <ImagePreview
            id={asset?.id}
            caption="Create · Ergebnisvorschau"
            zoom={zoom}
          />
          {!asset && (
            <p className="drop-hint">PNG oder WebP hier ablegen · bis 32 MiB</p>
          )}
          {asset && (
            <>
              <p className="image-meta">
                {asset.width} × {asset.height} px · {asset.format.toUpperCase()}{" "}
                · Revision {active?.promptRevision.id.slice(0, 8)}
              </p>
              {master &&
                (master.width !== asset.width ||
                  master.height !== asset.height) && (
                  <p className="warning">
                    Abweichende Abmessungen: Master {master.width} ×{" "}
                    {master.height}, Ergebnis {asset.width} × {asset.height}.
                    Keine automatische Skalierung.
                  </p>
                )}
              {!matches && (
                <p className="warning">
                  Dieses Bild gehört zur gespeicherten Revision. Neue
                  Promptänderungen verändern seine Herkunft nicht.
                </p>
              )}
            </>
          )}
          {replace ? (
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
          ) : (
            <div className="button-row">
              <button
                className="primary"
                disabled={!valid || providerId !== "manual-import"}
                onClick={() => requestImport()}
              >
                {asset ? "Ergebnis ersetzen …" : "Ergebnis importieren …"}
              </button>
              {asset && (
                <button onClick={() => onInspect(asset.id)}>
                  An Inspect senden
                </button>
              )}
            </div>
          )}
          {asset?.status === "candidate" && (
            <div className="button-row review-actions">
              <button
                className="danger"
                onClick={() =>
                  command(
                    { type: "review", id: asset.id, status: "rejected" },
                    "Kandidat verworfen. Verlauf und Original bleiben erhalten.",
                  )
                }
              >
                Kandidat verwerfen
              </button>
              <button
                className="primary"
                onClick={() =>
                  command(
                    { type: "review", id: asset.id, status: "approved" },
                    "Als Expression freigegeben.",
                  )
                }
              >
                Als Expression freigeben
              </button>
            </div>
          )}
        </section>
      </div>
      <div className="create-bottom">
        <section className="panel">
          <label>
            Ergänzende Anweisung
            <textarea
              aria-label="Ergänzende Anweisung"
              rows={2}
              maxLength={8000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
          <PromptComposer state={composer} onChange={setComposer} />
          <div className="button-row prompt-actions">
            <button
              disabled={!valid || Boolean(matches)}
              onClick={() => savePrompt()}
            >
              Prompt-Revision speichern
            </button>
            <button disabled={!valid} onClick={() => savePrompt(false)}>
              Prompt kopieren
            </button>
            <button
              className="primary"
              disabled={!valid}
              onClick={() => savePrompt(true)}
            >
              Prompt kopieren & ChatGPT öffnen
            </button>
          </div>
          <p className="muted">
            Manueller Browser-Weg: Der Browser öffnet sich ausschließlich nach
            deinem Klick. Referenzbild und Prompt fügst du dort selbst ein. Die
            direkte Codex-Generierung hat einen eigenen ausdrücklichen
            Startknopf.
          </p>
          {!master && (
            <p className="warning">
              Prompt-Aktionen und Ergebnisimport benötigen einen freigegebenen
              Master.
            </p>
          )}
          <details>
            <summary>Erweitert · Herkunft und Varianten-Vorlage</summary>
            <p className="mono">
              Master-ID: {master?.id ?? "—"}
              <br />
              SHA-256: {master?.sha256 ?? "—"}
              <br />
              Anbieter: {providerId} · Masterreferenz:{" "}
              {provider?.capabilities.supportsReferenceImages
                ? "unterstützt"
                : "manuell beifügen"}{" "}
              · Masken: nicht unterstützt
            </p>
            {variant && (
              <form
                key={variant.id + variant.prompt + variant.label}
                onSubmit={(e) => {
                  e.preventDefault();
                  const fields = new FormData(e.currentTarget);
                  command(
                    {
                      type: "editVariant",
                      variant: {
                        ...variant,
                        label: String(fields.get("label")),
                        prompt: String(fields.get("prompt")),
                      },
                    },
                    "Varianten-Vorlage gespeichert.",
                  );
                }}
              >
                <label>
                  Vorlagenname
                  <input
                    name="label"
                    maxLength={120}
                    required
                    defaultValue={variant.label}
                  />
                </label>
                <label>
                  Vorlagenanweisung
                  <textarea
                    name="prompt"
                    aria-label="Create Vorlagenanweisung"
                    maxLength={8000}
                    rows={4}
                    defaultValue={variant.prompt}
                  />
                </label>
                <button type="submit">Varianten-Vorlage speichern</button>
              </form>
            )}
            <p className="muted">
              Weitere Familien und Varianten lassen sich unter Expressions
              anlegen.
            </p>
          </details>
        </section>
        <section className="panel attempt-history">
          <div className="section-head">
            <h2>Versuchsverlauf</h2>
            <span className="badge">{attempts.length}</span>
          </div>
          <p className="muted">
            Jede gespeicherte Revision und jeder Import bleiben erhalten. Nach
            Neustart wieder verfügbar.
          </p>
          {!attempts.length && <p>Noch kein Versuch gespeichert.</p>}
          {[...attempts].reverse().map((a) => {
            const image = p.assets.find((image) => image.attemptId === a.id);
            return (
              <button
                key={a.id}
                aria-pressed={activeId === a.id}
                onClick={() => {
                  if (
                    !matches &&
                    composer.edited &&
                    !window.confirm(
                      "Ungespeicherte Promptänderungen verwerfen und gespeicherte Revision laden?",
                    )
                  )
                    return;
                  loadAttempt(a.id);
                }}
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
                    : "Bildimport ausstehend"}
                </span>
                <small>
                  {new Date(a.createdAt).toLocaleString("de-DE")} · {a.action}
                </small>
              </button>
            );
          })}
        </section>
      </div>
    </div>
  );
}
