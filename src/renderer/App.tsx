import { i18n } from "../shared/locales";
import { displayMessage } from "../shared/locales";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "./components/LanguageSelector";
import { tr } from "../shared/locales/index";
import { SplashScreen } from "./components/SplashScreen";
import { useAppLifecycle } from "./useAppLifecycle";
import { ExpressionDesigner } from "./views/ExpressionDesigner";
import { StyleLibrary } from "./components/StyleLibrary";
import { AssetLibrary } from "./views/AssetLibrary";
import type { StudioIntent, StudioMode, Workspace } from "../shared/studio";
import { CharacterCreator } from "./views/CharacterCreator";
import { ImagePreview } from "./components/ImagePreview";
import { CreateView } from "./views/CreateView";
import { useEffect, useRef, useState } from "react";
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
  useTranslation();
  const { lifecycle, state: lifecycleState } = useAppLifecycle();
  const workLock = useRef(false);
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
    if (workLock.current) return;
    workLock.current = true;
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
        error instanceof Error ? error.message : tr("common.m6aef3640ad"),
      );
    } finally {
      workLock.current = false;
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
    setCharacterName("");
    setError("");
    setMessage("");
  }
  function clearProject() {
    setSnapshot(undefined);
    setProjectSession((n) => n + 1);
    setView("Characters");
    setVisited([]);
    setDraftDirty({});
    setStyleDirty(false);
    setStudioIntent(undefined);
    setStyleIntent(undefined);
    setExpressionIntent(undefined);
    setStaged(undefined);
    setAssetId("");
    setCharacterName("");
    setMessage("");
    setError("");
    setStudioMode("expression");
  }
  const openProject = () =>
    lifecycle.project(
      "opening-project",
      () => window.laceframe.openProject(),
      changedProject,
    );
  const createProject = (name: string) =>
    lifecycle.project(
      "creating-project",
      () => window.laceframe.createProject(name),
      changedProject,
    );
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
      setError(tr("common.m5c6f7a7f7c"));
      return;
    }
    if (view === "Characters" && master) {
      setError(tr("common.m5ce6450c01"));
      return;
    }
    if (files.length !== 1) {
      setError(tr("common.m3bc88761b7"));
      return;
    }
    const file = files[0];
    if (file.size > MAX_IMAGE_BYTES) {
      setError(tr("common.mfe6b5a54d0"));
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
            rasterConfirmed: true,
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
      staged.variantId ? tr("common.m58f612e282") : tr("common.m6cc78a9310"),
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
          {tr("common.mf1f9565fea")}
          <select
            aria-label={tr("common.mf1f9565fea")}
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
              {tr("common.me027a129fa")}
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
            {tr("common.m56169128b5")}
            <input
              required
              maxLength={120}
              placeholder={tr("common.m35aa422377")}
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
            />
          </label>
          <button type="submit">{tr("common.me027a129fa")}</button>
        </form>
      </section>
    );
  const switchingProject = ["opening-project", "creating-project"].includes(
    lifecycleState.phase,
  );
  if ((lifecycleState.phase !== "workspace" && !switchingProject) || !p)
    return (
      <SplashScreen
        state={lifecycleState}
        onOpen={() => void openProject()}
        onCreate={createProject}
        onRetry={() => lifecycle.retry()}
      />
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
      <aside className="sidebar" inert={importing || switchingProject}>
        <div className="brand">
          <span className="brand-mark">L</span>
          <div>
            {tr("common.m3e06abfa73")}
            <small>{tr("common.mb12d43c08e")}</small>
          </div>
        </div>
        <p className="eyebrow">{tr("common.m5493ff8e93")}</p>
        <nav aria-label={tr("common.me8fc666068")}>
          {(
            [
              "Characters",
              "Studio",
              "Expressions",
              "Library",
              "Motion",
              "Art Direction",
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
              {tr(
                {
                  Characters: "common.navCharacters",
                  Studio: "common.navStudio",
                  Expressions: "common.navExpressions",
                  Library: "common.navLibrary",
                  Motion: "common.navMotion",
                  "Art Direction": "common.navArtDirection",
                }[name],
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <LanguageSelector />
        </div>
      </aside>
      <main
        inert={importing || switchingProject}
        className={view === "Studio" ? "create-main" : undefined}
      >
        <header>
          <div>
            <p className="eyebrow">
              {tr("common.m76fc502bc2")}
              {view.toUpperCase()}
            </p>
            <h1>{view}</h1>
          </div>
          <div className="project-info">
            <strong>{p?.name ?? tr("common.m5dce7f9897")}</strong>
            <small>{snapshot?.directory ?? tr("common.mf6fa281fb9")}</small>
          </div>
        </header>
        <div role="status" aria-live="polite" className="notice">
          {switchingProject
            ? tr("common.m19fb832ab5")
            : busy
              ? tr("common.mc0d15896db")
              : message}
        </div>
        {(error || lifecycleState.error) && (
          <div role="alert" className="error">
            {error || lifecycleState.error}
          </div>
        )}
        <div
          id="create-action-slot"
          hidden={view !== "Studio" && !generationRunning}
        />
        <fieldset
          disabled={
            busy || switchingProject || Boolean(staged) || generationRunning
          }
          className="workspace"
        >
          <section className="project-management">
            <section
              className="project-bar"
              aria-label={tr("common.m0a4d993cf5")}
            >
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (createDirty && !window.confirm(tr("common.m0ecd245a95")))
                    return;
                  void createProject(projectName);
                }}
              >
                <label>
                  {tr("common.m29ff0bdf52")}
                  <input
                    required
                    maxLength={120}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                </label>
                <button type="submit">{tr("common.m3fa71a5641")}</button>
              </form>
              <button
                onClick={() =>
                  (!createDirty || window.confirm(tr("common.m0ecd245a95"))) &&
                  void openProject()
                }
              >
                {tr("common.mf4c90fbebf")}
              </button>
              <button
                onClick={() => {
                  if (createDirty && !window.confirm(tr("common.m2fa2d5c8a6")))
                    return;
                  void lifecycle.close(
                    () => window.laceframe.closeProject(),
                    clearProject,
                  );
                }}
              >
                {tr("common.m545931b88e")}
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
                {tr("common.m446cb18289")}
                <select
                  aria-label={tr("common.mbd55ab933e")}
                  value={character?.id ?? ""}
                  onChange={(e) =>
                    void command({
                      type: "selectCharacter",
                      id: e.target.value,
                    })
                  }
                >
                  <option disabled value="">
                    {tr("common.m797950bf59")}
                  </option>
                  {p.characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.masterId
                        ? tr("common.md941d8fb01")
                        : tr("common.m8d5242b1c0")}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="studio-modes"
                role="group"
                aria-label={tr("common.m79b5c36470")}
              >
                <button
                  aria-pressed={studioMode === "master"}
                  onClick={() => setStudioMode("master")}
                >
                  {tr("common.m91efb055fb")}
                </button>
                <button
                  aria-pressed={studioMode === "expression"}
                  onClick={() =>
                    character
                      ? enterStudio({
                          mode: "expression",
                          characterId: character.id,
                          ...(character.masterId
                            ? { masterId: character.masterId }
                            : {}),
                        })
                      : setStudioMode("expression")
                  }
                >
                  {tr("common.m1e9e71c620")}
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
                {tr("common.md42458a59e")}
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
          {
            <>
              {view === "Library" && renderCharacterBar()}
              {view === "Characters" && (
                <section className={"panel characters-workspace"}>
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">
                        {character?.profile === "portrait-artistic"
                          ? tr("common.m1d12ae2efa")
                          : (character?.profile ?? "PORTRAIT ARTISTIC")}
                      </p>
                      <h2>{character?.name ?? tr("common.mc1fb3c1be3")}</h2>
                    </div>
                    {master && (
                      <span className="badge approved">
                        {tr("common.m29f9eecd72")}
                        {master.version} {tr("common.m24df89e2f7")}
                      </span>
                    )}
                  </div>
                  {master && (
                    <PortraitPreview
                      image={master}
                      caption={tr("common.m48c8e74ff9", { v0: master.version })}
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
                    {tr("common.m73239f6690")}
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
                        {tr("common.mf5f7f4d089")}
                        <input
                          name="name"
                          required
                          maxLength={120}
                          defaultValue={character.name}
                        />
                      </label>
                      <button type="submit">{tr("common.m002febf9f3")}</button>
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
                            {tr("common.m7cf71051e2")}
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
                        {tr("common.m87656e8c50")}
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
                          {tr("common.m87759f9b8c")}
                        </button>
                      )}
                      {master && (
                        <button
                          onClick={() => openLibrary(character.id, master.id)}
                        >
                          {tr("common.mebb7f4a9c3")}
                        </button>
                      )}
                    </div>
                  )}
                  {character && (
                    <section className="character-identities">
                      <h3>
                        {tr("common.me51165d8da")}{" "}
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
                              caption={tr("common.ma69b143965", {
                                v0: a.removedAt
                                  ? tr("common.mb076d37ae9")
                                  : tr("common.mc97385059e"),
                              })}
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
                      <p>
                        {tr("common.m7b5a81f16c")}
                        {master.version}
                      </p>
                      <p>
                        {master.width} × {master.height}{" "}
                        {tr("common.me27419e200")} {master.format.toUpperCase()}{" "}
                        {tr("common.m4df22c2054")}{" "}
                        {new Date(master.approvedAt).toLocaleString(
                          i18n.language,
                        )}
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
                      <p className="muted">{tr("common.m0b3fa6d2a9")}</p>
                    </>
                  ) : (
                    <div className="drop-zone">
                      <h3>{tr("common.me758618855")}</h3>
                      <p>{tr("common.maff80c3244")}</p>
                      <button
                        className="primary"
                        disabled={!character}
                        onClick={choose}
                      >
                        {tr("common.m61f68c13f7")}
                      </button>
                      <small>{tr("common.m64e437de0d")}</small>
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
                  <p className="eyebrow">{tr("common.m60692e287f")}</p>
                  <h2>{tr("common.meb31b2f771")}</h2>
                  <p>{tr("common.mf6b43b0bc5")}</p>
                  <p>
                    {tr("common.m9ebde299de")}{" "}
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
          }
        </fieldset>
        <footer>
          {tr("common.m3e06abfa73")} <span>{tr("common.m16ae3a1616")}</span>
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
            <p className="eyebrow">{tr("common.ma0517ece3e")}</p>
            {error && (
              <div role="alert" className="error">
                {displayMessage(error)}
              </div>
            )}
            <h2 id="import-title">
              {staged.variantId
                ? tr("common.m18d3b9b2f2")
                : tr("common.m64b535dba9")}
            </h2>
            <p>
              {staged.image.name} · {staged.image.width} × {staged.image.height}{" "}
              {tr("common.me27419e200")}
              {staged.image.format.toUpperCase()}
            </p>
            <div className="checker staged">
              <img alt={tr("common.m37a53c653a")} src={staged.image.preview} />
            </div>
            <p className="mono">SHA-256 {staged.image.sha256}</p>
            <p>
              {staged.variantId
                ? tr("common.m1109931ff9")
                : tr("common.mf37951ce81")}
            </p>
            {!staged.variantId && (
              <>
                <p role="status">
                  {staged.image.quality?.status === "transparent"
                    ? tr("common.m219f49bcc9")
                    : tr("common.m5d059ae79d")}
                </p>
                <label>
                  <input
                    aria-label={tr("common.mb258a641cf")}
                    type="checkbox"
                    checked={importReviewed}
                    onChange={(e) => setImportReviewed(e.target.checked)}
                  />
                  {tr("common.m79dce020cc")}
                </label>
                <label>
                  {tr("common.mbcb1613882")}
                  <textarea
                    aria-label={tr("common.mac862c0a68")}
                    value={importNotes}
                    maxLength={8000}
                    onChange={(e) => setImportNotes(e.target.value)}
                  />
                </label>
              </>
            )}
            {staged.variantId && staged.image.format !== "png" && (
              <p className="warning">{tr("common.m31294358c2")}</p>
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
                {tr("common.mf7ff1178af")}
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
                  ? tr("common.mab4361410b")
                  : tr("common.m93c761fea2")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
