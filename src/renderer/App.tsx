import { ExpressionDesigner } from "./views/ExpressionDesigner";
import { StyleLibrary } from "./components/StyleLibrary";
import { AssetLibrary } from "./views/AssetLibrary";
import type { StudioIntent, StudioMode, Workspace } from "../shared/studio";
import { CharacterCreator } from "./views/CharacterCreator";
import { ImagePreview } from "./components/ImagePreview";
import { CreateView } from "./views/CreateView";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  Command,
  Snapshot,
  StagedImage,
  VocalAction,
} from "../shared/domain";
import { PortraitPreview } from "./components/PortraitPreview";
import { MasterHistory } from "./components/MasterHistory";
import { MAX_IMAGE_BYTES } from "../shared/domain";
import type { Result } from "../shared/bridge";

type View = Workspace;
export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [projectSession, setProjectSession] = useState(0);
  const [view, setView] = useState<View>("Characters");
  const [expressionRunning, setExpressionRunning] = useState(false);
  const [creatorRunning, setCreatorRunning] = useState(false);
  const generationRunning = expressionRunning || creatorRunning;
  const [draftDirty, setDraftDirty] = useState<Record<string, boolean>>({});
  const [styleDirty, setStyleDirty] = useState(false);
  const createDirty = styleDirty || Object.values(draftDirty).some(Boolean);
  const [studioMode, setStudioMode] = useState<StudioMode>("expression");
  const [studioIntent, setStudioIntent] = useState<StudioIntent>();
  const [styleIntent, setStyleIntent] = useState<{
    id?: string;
    serial: number;
  }>();
  const [visited, setVisited] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [projectName, setProjectName] = useState("Mein Portraitstudio");
  const [characterName, setCharacterName] = useState("");
  const [expressionIntent, setExpressionIntent] = useState<StudioIntent>();
  const [assetId, setAssetId] = useState("");
  const [staged, setStaged] = useState<{
    image: StagedImage;
    characterId: string;
    variantId?: string;
    action: VocalAction;
  }>();
  const [importReviewed, setImportReviewed] = useState(false),
    [importNotes, setImportNotes] = useState("");
  useEffect(() => {
    setImportReviewed(false);
    setImportNotes("");
  }, [staged?.image.token]);
  const importing = Boolean(staged);
  useEffect(() => {
    if (!importing) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>(".modal");
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !modal) return;
      const buttons = [
        ...modal.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      ];
      const first = buttons[0],
        last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    modal?.querySelector<HTMLButtonElement>("button")?.focus();
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [importing]);
  const p = snapshot?.project;
  const character = p?.characters.find((c) => c.id === p.selectedCharacterId);
  const master = p?.masters.find((m) => m.id === character?.masterId);
  async function run<T>(
    work: () => Promise<Result<T>>,
    success: (value: T) => void,
    notice = "",
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await work();
      if (!result.ok) setError(result.error);
      else {
        success(result.value);
        setMessage(notice);
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Vorgang fehlgeschlagen. Bitte erneut versuchen.",
      );
    } finally {
      setBusy(false);
    }
  }
  const command = (cmd: Command, notice = "Gespeichert.") =>
    run(() => window.laceframe.command(cmd), setSnapshot, notice);
  function changedProject(value: Snapshot | null) {
    if (!value) return;
    setSnapshot(value);
    setProjectSession((old) => old + 1);
    setView("Characters");
    setVisited([]);
    setDraftDirty({});
    setStyleDirty(false);
    setStudioIntent(undefined);
    setStyleIntent(undefined);
    setStaged(undefined);
    setAssetId("");
    setExpressionIntent(undefined);
  }
  function stage(image: StagedImage | null) {
    if (image && character)
      setStaged({
        image,
        characterId: character.id,
        action: "silent",
      });
  }
  const choose = () => run(() => window.laceframe.chooseImage(), stage);
  async function drop(files: FileList) {
    if (busy || staged) return;
    if (!character) {
      setError("Zuerst Figur, Master und Variante auswählen.");
      return;
    }
    if (view === "Characters" && master) {
      setError("Master ist gesperrt. Kandidaten im Studio importieren.");
      return;
    }
    if (files.length !== 1) {
      setError("Bitte genau ein PNG/WebP ablegen.");
      return;
    }
    const file = files[0];
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Das Bild überschreitet 32 MiB.");
      return;
    }
    await run(
      async () =>
        window.laceframe.stageImage(
          new Uint8Array(await file.arrayBuffer()),
          file.name,
        ),
      stage,
    );
  }
  function confirmImport() {
    if (!staged) return;
    const cmd: Command = staged.variantId
      ? {
          type: "importCandidate",
          characterId: staged.characterId,
          variantId: staged.variantId,
          action: staged.action,
          token: staged.image.token,
        }
      : {
          type: "confirmMaster",
          characterId: staged.characterId,
          token: staged.image.token,
          review: {
            sourceSha256: staged.image.sha256,
            identityConfirmed: true,
            silhouetteConfirmed: true,
            activationConfirmed: true,
            notes: importNotes,
          },
        };
    void run(
      () => window.laceframe.command(cmd),
      (value) => {
        setSnapshot(value);
        setStaged(undefined);
        setAssetId(value.project.assets.at(-1)?.id ?? "");
      },
      staged.variantId
        ? "Kandidat importiert. Manuelle Prüfung erforderlich."
        : "Master V1 bestätigt und unveränderlich gesperrt.",
    );
  }
  function addCharacter(e: FormEvent) {
    e.preventDefault();
    void command({ type: "addCharacter", name: characterName });
  }
  useEffect(() => {
    if (p?.selectedCharacterId) {
      const key = `${p.id}:${p.selectedCharacterId}`;
      setVisited((old) => (old.includes(key) ? old : [...old, key]));
      setDraftDirty((old) =>
        old[`empty:${p.id}`] ? { ...old, [`empty:${p.id}`]: false } : old,
      );
    }
  }, [p?.id, p?.selectedCharacterId]);
  useEffect(() => {
    if (p && p.characters.length === 0) setStudioMode("master");
  }, [p?.id, p?.characters.length]);
  function dirtyFor(key: string, value: boolean) {
    setDraftDirty((old) =>
      old[key] === value ? old : { ...old, [key]: value },
    );
  }
  function enterStudio(input: Omit<StudioIntent, "serial">) {
    const apply = () => {
      setStudioMode(input.mode);
      setStudioIntent((old) => ({ ...input, serial: (old?.serial ?? 0) + 1 }));
      setView("Studio");
    };
    if (p?.selectedCharacterId === input.characterId) apply();
    else
      void run(
        () =>
          window.laceframe.command({
            type: "selectCharacter",
            id: input.characterId,
          }),
        (s) => {
          setSnapshot(s);
          apply();
        },
      );
  }
  function openLibrary(characterId: string, id: string) {
    const apply = () => {
      setAssetId(id);
      setView("Library");
    };
    if (p?.selectedCharacterId === characterId) apply();
    else
      void run(
        () =>
          window.laceframe.command({
            type: "selectCharacter",
            id: characterId,
          }),
        (s) => {
          setSnapshot(s);
          apply();
        },
      );
  }
  function editStyle(id?: string) {
    setStyleIntent((old) => ({ id, serial: (old?.serial ?? 0) + 1 }));
    setView("Art Direction");
  }
  const renderCharacterBar = () =>
    p && (
      <section className="character-bar">
        <label>
          Aktive Figur
          <select
            aria-label="Aktive Figur"
            value={character?.id ?? ""}
            onChange={(e) => {
              setAssetId("");
              void command({
                type: "selectCharacter",
                id: e.target.value,
              });
            }}
          >
            <option disabled value="">
              Figur erstellen
            </option>
            {p.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <form
          className="inline-form"
          onSubmit={addCharacter}
          hidden={view !== "Characters"}
        >
          <label>
            Neue Figur
            <input
              required
              maxLength={120}
              placeholder="z. B. Ada Voss"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
            />
          </label>
          <button type="submit">Figur erstellen</button>
        </form>
      </section>
    );
  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (p && view === "Characters") void drop(e.dataTransfer.files);
      }}
    >
      <aside className="sidebar" inert={importing}>
        <div className="brand">
          <span className="brand-mark">L</span>
          <div>
            LACEFRAME<small>Portrait studio</small>
          </div>
        </div>
        <p className="eyebrow">WORKSPACE</p>
        <nav aria-label="Hauptnavigation">
          {(
            [
              "Characters",
              "Art Direction",
              "Expressions",
              "Studio",
              "Library",
              "Motion",
            ] as const
          ).map((name, i) => (
            <button
              key={name}
              aria-current={view === name ? "page" : undefined}
              onClick={() => {
                if (name === "Expressions") setExpressionIntent(undefined);
                setView(name);
              }}
            >
              <span className="nav-index">0{i + 1}</span>
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="badge">Offline · lokal</span>
          <p>Deine Bilder bleiben auf diesem Gerät.</p>
          <small>
            Portrait Artistic
            <br />
            Originalauflösung bleibt erhalten.
          </small>
        </div>
      </aside>
      <main
        inert={importing}
        className={view === "Studio" ? "create-main" : undefined}
      >
        <header>
          <div>
            <p className="eyebrow">
              CHARACTER WORKSPACE / {view.toUpperCase()}
            </p>
            <h1>{view}</h1>
          </div>
          <div className="project-info">
            <strong>{p?.name ?? "Kein Projekt geöffnet"}</strong>
            <small>
              {snapshot?.directory ??
                "Ein lokales Projekt beginnt mit einem leeren Ordner."}
            </small>
          </div>
        </header>
        <div role="status" aria-live="polite" className="notice">
          {busy ? "Verarbeite …" : message}
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <div
          id="create-action-slot"
          hidden={view !== "Studio" && !generationRunning}
        />
        <fieldset
          disabled={busy || Boolean(staged) || generationRunning}
          className="workspace"
        >
          <section className="project-management">
            <section className="project-bar" aria-label="Projektverwaltung">
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    createDirty &&
                    !window.confirm(
                      "Ungespeicherte Studio-, Expressions- und Stilentwürfe verwerfen und Projekt wechseln?",
                    )
                  )
                    return;
                  void run(
                    () => window.laceframe.createProject(projectName),
                    changedProject,
                  );
                }}
              >
                <label>
                  Projektname
                  <input
                    required
                    maxLength={120}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                </label>
                <button type="submit">Projekt erstellen …</button>
              </form>
              <button
                onClick={() =>
                  (!createDirty ||
                    window.confirm(
                      "Ungespeicherte Studio-, Expressions- und Stilentwürfe verwerfen und Projekt wechseln?",
                    )) &&
                  void run(() => window.laceframe.openProject(), changedProject)
                }
              >
                Projekt öffnen …
              </button>
            </section>
          </section>
          {p && (
            <section
              className="studio-context"
              id="studio-context"
              hidden={view !== "Studio"}
            >
              <label>
                Figur
                <select
                  aria-label="Studio Figur"
                  value={character?.id ?? ""}
                  onChange={(e) =>
                    void command({
                      type: "selectCharacter",
                      id: e.target.value,
                    })
                  }
                >
                  <option disabled value="">
                    Figur anlegen
                  </option>
                  {p.characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.masterId ? " · Master gesperrt" : " · Entwurf"}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="studio-modes"
                role="group"
                aria-label="Studio Modus"
              >
                <button
                  aria-pressed={studioMode === "master"}
                  onClick={() => setStudioMode("master")}
                >
                  Master erstellen
                </button>
                <button
                  aria-pressed={studioMode === "expression"}
                  onClick={() => setStudioMode("expression")}
                >
                  Expression erstellen
                </button>
              </div>
            </section>
          )}
          {p && !p.characters.length && (
            <div
              className="studio-editor"
              data-operation="master"
              hidden={view !== "Studio"}
            >
              <CharacterCreator
                contextControlled
                snapshot={snapshot!}
                visible={view === "Studio" && !expressionRunning}
                busy={busy || generationRunning}
                perform={run}
                onSnapshot={setSnapshot}
                onDirtyChange={(dirty) => dirtyFor(`empty:${p.id}`, dirty)}
                onRunningChange={setCreatorRunning}
                onClose={() => setView("Characters")}
                onArtDirection={editStyle}
                onLibrary={(id) => {
                  setAssetId(id);
                  setView("Library");
                }}
                onExpressions={() => setStudioMode("expression")}
              />
            </div>
          )}
          {p &&
            p.characters
              .filter((c) => visited.includes(`${p.id}:${c.id}`))
              .map((c) => {
                const bound = {
                    ...snapshot!,
                    project: { ...p, selectedCharacterId: c.id },
                  },
                  active = view === "Studio" && p.selectedCharacterId === c.id;
                return (
                  <div key={`${p.id}:${c.id}`}>
                    <div
                      className="studio-editor"
                      data-operation="expression"
                      hidden={!active || studioMode !== "expression"}
                    >
                      <CreateView
                        contextControlled
                        intent={
                          studioIntent?.characterId === c.id
                            ? studioIntent
                            : undefined
                        }
                        visible={
                          active &&
                          studioMode === "expression" &&
                          !creatorRunning
                        }
                        snapshot={bound}
                        busy={busy || creatorRunning}
                        perform={run}
                        onSnapshot={setSnapshot}
                        onDirtyChange={(dirty) =>
                          dirtyFor(`expression:${p.id}:${c.id}`, dirty)
                        }
                        onRunningChange={setExpressionRunning}
                        onCharacters={() => setView("Characters")}
                        onArtDirection={editStyle}
                        onEditExpression={(context) => {
                          setExpressionIntent((old) => ({
                            ...context,
                            serial: (old?.serial ?? 0) + 1,
                          }));
                          setView("Expressions");
                        }}
                        onInspect={(id) => openLibrary(c.id, id)}
                      />
                    </div>
                    <div
                      className="studio-editor"
                      data-operation="master"
                      hidden={!active || studioMode !== "master"}
                    >
                      <CharacterCreator
                        contextControlled
                        intent={
                          studioIntent?.characterId === c.id
                            ? studioIntent
                            : undefined
                        }
                        snapshot={bound}
                        visible={
                          active &&
                          studioMode === "master" &&
                          !expressionRunning
                        }
                        busy={busy || expressionRunning}
                        perform={run}
                        onSnapshot={setSnapshot}
                        onDirtyChange={(dirty) =>
                          dirtyFor(`master:${p.id}:${c.id}`, dirty)
                        }
                        onRunningChange={setCreatorRunning}
                        onClose={() => setView("Characters")}
                        onArtDirection={editStyle}
                        onLibrary={(id) => openLibrary(c.id, id)}
                        onExpressions={() =>
                          enterStudio({
                            mode: "expression",
                            characterId: c.id,
                            masterId: p.characters.find((a) => a.id === c.id)
                              ?.masterId,
                          })
                        }
                      />
                    </div>
                  </div>
                );
              })}
          {p && (
            <section hidden={view !== "Expressions"}>
              <ExpressionDesigner
                key={`${p.id}:${projectSession}`}
                snapshot={snapshot!}
                busy={busy || generationRunning}
                perform={run}
                onSnapshot={setSnapshot}
                intent={expressionIntent}
                onDirtyChange={(dirty) => dirtyFor(`designer:${p.id}`, dirty)}
                onStudio={enterStudio}
                onBack={() => {
                  if (expressionIntent) {
                    const apply = () => setView("Studio");
                    if (p.selectedCharacterId === expressionIntent.characterId)
                      apply();
                    else
                      void run(
                        () =>
                          window.laceframe.command({
                            type: "selectCharacter",
                            id: expressionIntent.characterId,
                          }),
                        (value) => {
                          setSnapshot(value);
                          apply();
                        },
                      );
                  } else setView("Studio");
                }}
              />
            </section>
          )}
          {p && (
            <section
              className="art-direction-workspace"
              hidden={view !== "Art Direction"}
            >
              <button onClick={() => setView("Studio")}>
                Zurück zum Studio
              </button>
              <StyleLibrary
                key={p.id}
                snapshot={snapshot!}
                busy={busy || generationRunning}
                perform={run}
                onSnapshot={setSnapshot}
                selectedId={styleIntent?.id}
                requestSerial={styleIntent?.serial}
                onDirtyChange={setStyleDirty}
              />
            </section>
          )}
          {!p ? (
            <section className="welcome">
              <p className="eyebrow">VOM PORTRAIT ZUM AUSDRUCK</p>
              <h2>Ein sicherer Ort für deine Charaktere.</h2>
              <p>
                Projekt erstellen, Figur benennen und ein freigegebenes Portrait
                als unveränderlichen Master importieren. Danach eigene
                Ausdruckskandidaten vergleichen und prüfen.
              </p>
              <ol>
                <li>Lokalen Projektordner wählen</li>
                <li>PNG/WebP in Originalauflösung importieren</li>
                <li>Ausdrücke organisieren und freigeben</li>
              </ol>
            </section>
          ) : (
            <>
              {view === "Library" && renderCharacterBar()}
              {view === "Characters" && (
                <section className="panel characters-workspace">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">
                        {character?.profile === "portrait-artistic"
                          ? "PORTRAIT ARTISTIC"
                          : (character?.profile ?? "PORTRAIT ARTISTIC")}
                      </p>
                      <h2>{character?.name ?? "Erste Figur erstellen"}</h2>
                    </div>
                    {master && (
                      <span className="badge approved">
                        Master V{master.version} · gesperrt
                      </span>
                    )}
                  </div>
                  {master && (
                    <PortraitPreview
                      image={master}
                      caption={`Freigegebener Master V${master.version}`}
                    />
                  )}
                  {renderCharacterBar()}

                  <button
                    className="primary"
                    onClick={() => {
                      setStudioMode("master");
                      setView("Studio");
                    }}
                  >
                    Neuen Charakter erstellen
                  </button>
                  {character && (
                    <form
                      key={character.id + character.name}
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        void command({
                          type: "renameCharacter",
                          id: character.id,
                          name: String(data.get("name")),
                        });
                      }}
                    >
                      <label>
                        Figurenname
                        <input
                          name="name"
                          required
                          maxLength={120}
                          defaultValue={character.name}
                        />
                      </label>
                      <button type="submit">Namen speichern</button>
                    </form>
                  )}
                  {character && (
                    <div className="button-row">
                      {!master && (
                        <>
                          <button
                            onClick={() =>
                              enterStudio({
                                mode: "master",
                                characterId: character.id,
                              })
                            }
                          >
                            Master im Studio erstellen
                          </button>
                        </>
                      )}
                      <button
                        disabled={!master}
                        onClick={() =>
                          enterStudio({
                            mode: "expression",
                            characterId: character.id,
                            masterId: master?.id,
                          })
                        }
                      >
                        Expressions im Studio erstellen
                      </button>
                      {master && (
                        <button
                          onClick={() =>
                            enterStudio({
                              mode: "master",
                              characterId: character.id,
                              masterId: master.id,
                              rebuild: true,
                            })
                          }
                        >
                          Master neu aufbauen
                        </button>
                      )}
                      {master && (
                        <button
                          onClick={() => openLibrary(character.id, master.id)}
                        >
                          Master in Library prüfen
                        </button>
                      )}
                    </div>
                  )}
                  {character && (
                    <section className="character-identities">
                      <h3>
                        Identitätsquellen ·{" "}
                        {
                          p.identityAssets.filter(
                            (a) => a.characterId === character.id,
                          ).length
                        }
                      </h3>
                      {p.identityAssets
                        .filter((a) => a.characterId === character.id)
                        .map((a) => (
                          <div key={a.id}>
                            <ImagePreview
                              id={a.id}
                              caption={`Identitätsquelle${a.removedAt ? " · archiviert" : " · aktiv"}`}
                              zoom="fit"
                            />
                            <small>
                              {a.width}×{a.height}
                            </small>
                          </div>
                        ))}
                    </section>
                  )}
                  {master ? (
                    <>
                      <p>Aktueller Master V{master.version}</p>
                      <p>
                        {master.width} × {master.height} px ·{" "}
                        {master.format.toUpperCase()} · bestätigt{" "}
                        {new Date(master.approvedAt).toLocaleString("de-DE")}
                      </p>
                      <MasterHistory
                        project={p!}
                        characterId={character!.id}
                        onInspect={(id) => openLibrary(character!.id, id)}
                        onStudio={(id) =>
                          enterStudio({
                            mode: "expression",
                            characterId: character!.id,
                            masterId: id,
                          })
                        }
                      />
                      <p className="muted">
                        Die Originaldatei bleibt unverändert. Jede neue
                        Ausdrucksdatei verweist auf diesen Master.
                      </p>
                    </>
                  ) : (
                    <div className="drop-zone">
                      <h3>Dein freigegebenes Masterportrait</h3>
                      <p>
                        Ein PNG/WebP hier ablegen oder lokal auswählen.
                        Anschließend prüfen und bestätigen.
                      </p>
                      <button
                        className="primary"
                        disabled={!character}
                        onClick={choose}
                      >
                        Masterportrait auswählen …
                      </button>
                      <small>
                        Bis 32 MiB · keine Skalierung · keine Uploads
                      </small>
                    </div>
                  )}
                </section>
              )}
              <div hidden={view !== "Library"}>
                <AssetLibrary
                  key={p.id}
                  snapshot={snapshot!}
                  selectedId={assetId}
                  onSelect={setAssetId}
                  onSnapshot={setSnapshot}
                  onStudio={enterStudio}
                  disabled={busy || generationRunning}
                  command={(cmd, notice) => void command(cmd, notice)}
                />
              </div>
              {view === "Motion" && (
                <section className="welcome">
                  <p className="eyebrow">ALS NÄCHSTES</p>
                  <h2>Motion · späterer Meilenstein.</h2>
                  <p>
                    Nach Style Intelligence geplant: manuell geladene Blink- und
                    Mundframes, Timeline mit individueller Dauer, Play/Pause und
                    JSON- sowie PNG-Export. Die freigegebenen Ausdrücke bilden
                    die Grundlage.
                  </p>
                  <p>
                    Aktuell freigegeben:{" "}
                    {
                      p.assets.filter(
                        (a) =>
                          a.characterId === character?.id &&
                          a.status === "approved",
                      ).length
                    }
                  </p>
                </section>
              )}
            </>
          )}
        </fieldset>
        <footer>
          LACEFRAME{" "}
          <span>
            Lokale Dateien · manuelle Freigabe · unveränderlicher Master
          </span>
        </footer>
      </main>
      {staged && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <p className="eyebrow">IMPORT PRÜFEN</p>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <h2 id="import-title">
              {staged.variantId
                ? "Als Kandidat importieren"
                : "Als Master V1 bestätigen & sperren"}
            </h2>
            <p>
              {staged.image.name} · {staged.image.width} × {staged.image.height}{" "}
              px · {staged.image.format.toUpperCase()}
            </p>
            <div className="checker staged">
              <img alt="Importvorschau" src={staged.image.preview} />
            </div>
            <p className="mono">SHA-256 {staged.image.sha256}</p>
            <p>
              {staged.variantId
                ? "Das Bild wird als ungeprüfter Kandidat mit dem exakten Master verknüpft."
                : "Bestätige, dass dieses Portrait als Master freigegeben ist. Master V1 bleibt unverändert; Verbesserungen werden als neue Version freigegeben. Die Quelldatei wird unverändert kopiert."}
            </p>
            {!staged.variantId && (
              <>
                <p role="status">
                  {staged.image.quality?.status === "transparent"
                    ? "Transparenz vorhanden – manuelle Prüfung erforderlich"
                    : "Kein geeigneter transparenter Master: Hintergrund freistellen oder im Character Creator neu generieren. Freigabe gesperrt."}
                </p>
                <label>
                  <input
                    aria-label="Import Master Sichtprüfung"
                    type="checkbox"
                    checked={importReviewed}
                    onChange={(e) => setImportReviewed(e.target.checked)}
                  />
                  Identität, Silhouette und Alpha-Kanten geprüft; diesen Master
                  ausdrücklich aktivieren
                </label>
                <label>
                  Prüfnotiz
                  <textarea
                    aria-label="Import Master Prüfnotiz"
                    value={importNotes}
                    maxLength={8000}
                    onChange={(e) => setImportNotes(e.target.value)}
                  />
                </label>
              </>
            )}
            {staged.variantId && staged.image.format !== "png" && (
              <p className="warning">
                Für Kandidaten sind ausschließlich PNG-Dateien erlaubt.
              </p>
            )}
            <div className="button-row">
              <button
                disabled={busy}
                onClick={() =>
                  void run(
                    () => window.laceframe.discardImage(staged.image.token),
                    () => setStaged(undefined),
                  )
                }
              >
                Abbrechen
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  Boolean(staged.variantId && staged.image.format !== "png") ||
                  (!staged.variantId &&
                    (staged.image.quality?.status !== "transparent" ||
                      !importReviewed ||
                      !importNotes.trim()))
                }
                onClick={confirmImport}
              >
                {staged.variantId
                  ? "Kandidat importieren"
                  : "Freigegebenen Master sperren"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
