import { useEffect, useRef, useState } from "react";
import type { Project, Snapshot } from "../../shared/domain";
import {
  DEFAULT_LIGHT,
  type Light,
  type LightRegion,
  type RelightPixels,
} from "../../shared/relighting";
import { MaskEditor } from "./MaskEditor";
import { RelightCanvas } from "./RelightCanvas";
type Draft = { light: Light; regions: LightRegion[] };
const controls: [
  keyof Pick<
    Light,
    | "direction"
    | "intensity"
    | "temperature"
    | "ambient"
    | "shadows"
    | "contrast"
    | "highlights"
  >,
  string,
  number,
  number,
  number,
][] = [
  ["direction", "Lichtrichtung", 0, 360, 1],
  ["intensity", "Intensität", 0, 2, 0.01],
  ["temperature", "Farbtemperatur", -1, 1, 0.01],
  ["ambient", "Umgebungslicht", 0, 2, 0.01],
  ["shadows", "Schattenstärke", 0, 1, 0.01],
  ["contrast", "Kontrast", 0.25, 2, 0.01],
  ["highlights", "Highlight-Stärke", 0, 1, 0.01],
];
const roles = {
  skin: "Gesicht und Haut",
  hair: "Haare / Bart",
  clothes: "Kleidung",
  accessories: "Accessoires",
  custom: "Eigene Region",
};
export function RelightingEditor({
  source,
  project,
  recipeId,
  onClose,
  onSaved,
}: {
  source: { id: string; width: number; height: number; characterId: string };
  project: Project;
  recipeId?: string;
  onClose: () => void;
  onSaved: (snapshot: Snapshot) => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    light: { ...DEFAULT_LIGHT },
    regions: [],
  });
  const [past, setPast] = useState<Draft[]>([]),
    [future, setFuture] = useState<Draft[]>([]);
  const [pixels, setPixels] = useState<RelightPixels>(),
    [output, setOutput] = useState<{
      pixels: RelightPixels;
      sha: string;
      serial: number;
      ms: number;
    }>();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [serial, setSerial] = useState(0);
  const [selected, setSelected] = useState("global"),
    [maskRegion, setMaskRegion] = useState<string>(),
    [zoom, setZoom] = useState(1),
    [showOriginal, setShowOriginal] = useState(false),
    [cpu, setCPU] = useState(false);
  const [reuse, setReuse] = useState("");
  const modal = useRef<HTMLElement>(null),
    worker = useRef<Worker | null>(null),
    inFlight = useRef(false),
    latest = useRef({ draft, serial });
  latest.current = { draft, serial };
  const locked = useRef(false),
    dirty = useRef(false);
  function edit(next: Draft) {
    dirty.current = true;
    setPast((old) => [...old, draft].slice(-8));
    setFuture([]);
    setDraft(next);
    setSerial((n) => n + 1);
    setError("");
  }
  function close() {
    if (!locked.current) onClose();
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (modal.current?.querySelector(".modal-backdrop")) return;
      if (e.key === "Escape" && !locked.current) {
        e.preventDefault();
        if (!dirty.current || window.confirm("Lichtentwurf verwerfen?"))
          onClose();
      }
      if (e.key === "Tab") {
        const items = [
          ...modal.current!.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ),
        ].filter((e) => e.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    modal.current?.focus();
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    let live = true;
    const w = new Worker(
      new URL("../workers/relighting.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = w;
    w.onerror = () => {
      if (live) {
        inFlight.current = false;
        setError(
          "Licht-Worker ausgefallen. Editor schließen und neu öffnen; keine Datei gespeichert.",
        );
        setReady(false);
      }
    };
    w.onmessage = (e) => {
      inFlight.current = false;
      if (!live) return;
      const v = e.data;
      if (v.serial === latest.current.serial) {
        if (v.error) {
          setError(v.error);
          setReady(false);
        } else
          setOutput({
            pixels: v.result,
            sha: v.sha256,
            serial: v.serial,
            ms: v.durationMs,
          });
      }
    };
    void (async () => {
      const r = await window.laceframe.relightSource(source.id);
      if (!r.ok) throw new Error(r.error);
      let start: Draft = { light: { ...DEFAULT_LIGHT }, regions: [] };
      if (recipeId) {
        const r = await window.laceframe.relightRecipe(recipeId);
        if (!r.ok) throw new Error(r.error);
        start = {
          light: r.value.recipe.light,
          regions: r.value.recipe.regions.map(
            ({ id, name, role, revision, light, reusedExpressionMask }, i) => ({
              id,
              name,
              role,
              revision,
              light,
              reusedExpressionMask,
              weights: r.value.weights[i],
            }),
          ),
        };
      }
      if (!live) return;
      dirty.current = false;
      setDraft(start);
      setPixels(r.value);
      w.postMessage({ source: r.value, serial: 0, ...start });
      inFlight.current = true;
      setReady(true);
    })().catch((e) => {
      if (live) setError(String(e));
    });
    return () => {
      live = false;
      w.terminate();
      worker.current = null;
    };
  }, [source.id, recipeId]);
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => {
      if (inFlight.current || output?.serial === latest.current.serial) return;
      inFlight.current = true;
      worker.current?.postMessage({
        ...latest.current.draft,
        serial: latest.current.serial,
      });
    }, 40);
    return () => clearInterval(timer);
  }, [ready, output?.serial]);
  const region = draft.regions.find((r) => r.id === selected),
    light = region?.light ?? draft.light;
  function changeLight(next: Light) {
    edit(
      region
        ? {
            ...draft,
            regions: draft.regions.map((r) =>
              r.id === region.id ? { ...r, light: next } : r,
            ),
          }
        : { ...draft, light: next },
    );
  }
  const mask = draft.regions.find((r) => r.id === maskRegion);
  const compatibleMasks = project.masks.filter(
    (m) =>
      m.characterId === source.characterId &&
      m.width === source.width &&
      m.height === source.height,
  );
  async function save() {
    if (!output || output.serial !== serial || !ready) return;
    setBusy(true);
    locked.current = true;
    setError("");
    try {
      const r = await window.laceframe.command({
        type: "createRelighting",
        sourceId: source.id,
        light: draft.light,
        regions: draft.regions.map((r) => ({
          ...r,
          weights: new Uint8Array(r.weights),
        })),
        previewPixelSha256: output.sha,
      });
      if (!r.ok) throw new Error(r.error);
      onSaved(r.value);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop relight-backdrop">
      <section
        className="relight-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Live Relighting"
        tabIndex={-1}
        ref={modal}
      >
        <div className="section-head">
          <div>
            <h2>Live Relighting · 2D</h2>
            <small>
              {source.width}×{source.height} · Original bleibt unverändert ·
              maximal 4 MP
            </small>
          </div>
          <button disabled={busy} onClick={close}>
            Verwerfen & schließen
          </button>
        </div>
        <p className="muted">
          Tonwerte und gerichteter 2D-Lichtverlauf. Keine
          Tiefen-/Normalenerkennung und keine physikalisch korrekte
          3D-Beleuchtung. Alpha bleibt unverändert; kein Bloom, keine neuen
          Hintergründe.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="relight-layout">
          <fieldset disabled={busy || !ready} className="relight-controls">
            <label>
              Bearbeitungsregion
              <select
                aria-label="Lichtregion"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="global">Gesamtes Bild</option>
                {draft.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · R{r.revision}
                  </option>
                ))}
              </select>
            </label>
            <small>
              Regionen werden manuell zugeordnet. Weiß bearbeitet, Schwarz
              schützt. Regionale Werte ersetzen den globalen Ton; Überlappungen
              folgen der Listenreihenfolge.
            </small>
            {controls.map(([key, label, min, max, step]) => (
              <label key={key}>
                {label} · {light[key]}
                {key === "direction" ? "°" : ""}
                <input
                  aria-label={label}
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={light[key]}
                  onChange={(e) =>
                    changeLight({ ...light, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                aria-label="Pixelart-Licht"
                checked={light.pixelArt}
                onChange={(e) =>
                  changeLight({ ...light, pixelArt: e.target.checked })
                }
              />
              Pixelart · quantisierte Lichtstufen, Nearest-Anzeige
            </label>
            {light.pixelArt && (
              <label>
                Lichtstufen
                <input
                  aria-label="Lichtstufen"
                  type="range"
                  min={2}
                  max={16}
                  value={light.levels}
                  onChange={(e) =>
                    changeLight({ ...light, levels: Number(e.target.value) })
                  }
                />
              </label>
            )}
            <details>
              <summary>
                Manuelle Lichtregionen · {draft.regions.length}/5
              </summary>
              {Object.entries(roles).map(([role, name]) => (
                <button
                  key={role}
                  disabled={draft.regions.length >= 5}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    edit({
                      ...draft,
                      regions: [
                        ...draft.regions,
                        {
                          id,
                          name,
                          role: role as LightRegion["role"],
                          revision: 1,
                          light: { ...DEFAULT_LIGHT },
                          weights: new Uint8Array(source.width * source.height),
                        },
                      ],
                    });
                    setSelected(id);
                    setMaskRegion(id);
                  }}
                >
                  {name} anlegen
                </button>
              ))}
              {region && (
                <>
                  <label>
                    Regionsname
                    <input
                      maxLength={120}
                      value={region.name}
                      onChange={(e) =>
                        edit({
                          ...draft,
                          regions: draft.regions.map((r) =>
                            r.id === region.id
                              ? { ...r, name: e.target.value }
                              : r,
                          ),
                        })
                      }
                    />
                  </label>
                  <button onClick={() => setMaskRegion(region.id)}>
                    Lichtmaske bearbeiten
                  </button>
                  <button
                    onClick={() => {
                      edit({
                        ...draft,
                        regions: draft.regions.filter(
                          (r) => r.id !== region.id,
                        ),
                      });
                      setSelected("global");
                    }}
                  >
                    Region entfernen
                  </button>
                  <label>
                    Bearbeitungsmaske als Lichtgewicht kopieren
                    <select
                      aria-label="Vorhandene Maske"
                      value={reuse}
                      onChange={(e) => setReuse(e.target.value)}
                    >
                      <option value="">Maske auswählen</option>
                      {compatibleMasks.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} · R{m.revision} · nur gleiche
                          Pixelkoordinaten
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={!reuse}
                    onClick={async () => {
                      try {
                        const m = compatibleMasks.find((m) => m.id === reuse)!;
                        const preview = await window.laceframe.preview(m.id);
                        if (!preview.ok) throw new Error(preview.error);
                        const image = new Image();
                        image.src = preview.value;
                        await image.decode();
                        const c = document.createElement("canvas");
                        c.width = m.width;
                        c.height = m.height;
                        const ctx = c.getContext("2d")!;
                        ctx.drawImage(image, 0, 0);
                        const rgba = ctx.getImageData(
                          0,
                          0,
                          m.width,
                          m.height,
                        ).data;
                        const weights = Uint8Array.from(
                          { length: m.width * m.height },
                          (_, i) => rgba[i * 4],
                        );
                        edit({
                          ...draft,
                          regions: draft.regions.map((r) =>
                            r.id === region.id
                              ? {
                                  ...r,
                                  weights,
                                  revision: r.revision + 1,
                                  reusedExpressionMask: {
                                    id: m.id,
                                    sha256: m.sha256,
                                    revision: m.revision,
                                  },
                                }
                              : r,
                          ),
                        });
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    Maske kopieren · Original bleibt Bearbeitungsfreigabe
                  </button>
                  <small>
                    Nur Gewichte kopieren. Ausrichtung selbst prüfen; gleiche
                    Maße beweisen keine Registrierung.
                  </small>
                </>
              )}
            </details>
          </fieldset>
          <div className="relight-preview">
            <div className="button-row">
              <button
                aria-pressed={showOriginal}
                onClick={() => setShowOriginal((v) => !v)}
              >
                Original / Vorschau vergleichen
              </button>
              <label>
                Zoom
                <select
                  aria-label="Lichtzoom"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                >
                  <option value={0.25}>25%</option>
                  <option value={0.5}>50%</option>
                  <option value={1}>100%</option>
                  <option value={2}>200%</option>
                  <option value={4}>400%</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  aria-label="CPU-Anzeige erzwingen"
                  checked={cpu}
                  onChange={(e) => setCPU(e.target.checked)}
                />
                CPU-Anzeige
              </label>
            </div>
            {(showOriginal ? pixels : output?.pixels) && (
              <RelightCanvas
                pixels={(showOriginal ? pixels : output?.pixels)!}
                zoom={zoom}
                pixelArt={
                  draft.light.pixelArt ||
                  draft.regions.some((r) => r.light.pixelArt)
                }
                forceCPU={cpu}
              />
            )}
            <p role="status" aria-label="Lichtberechnung">
              {output?.serial === serial
                ? `Vorschau bereit · ${Math.round(output.ms)} ms · RGBA8 SHA-256 ${output.sha.slice(0, 12)}`
                : "Lichtvorschau wird berechnet …"}
            </p>
            <small>
              Berechnung im CPU-Worker; GPU zeigt dieselben Pixel. Kein
              Dateischreiben bei Slideränderungen. Darstellungsalpha wird
              premultipliziert, PNG erhält unveränderte Alpha- und transparente
              RGB-Werte.
            </small>
          </div>
        </div>
        <div className="relight-actions button-row">
          <button
            disabled={busy || !past.length}
            onClick={() => {
              dirty.current = true;
              setFuture((old) => [draft, ...old]);
              setDraft(past.at(-1)!);
              setPast((old) => old.slice(0, -1));
              setSerial((n) => n + 1);
            }}
          >
            Licht rückgängig
          </button>
          <button
            disabled={busy || !future.length}
            onClick={() => {
              setPast((old) => [...old, draft].slice(-8));
              setDraft(future[0]);
              setFuture((old) => old.slice(1));
              setSerial((n) => n + 1);
            }}
          >
            Licht wiederholen
          </button>
          <button
            disabled={busy || !ready}
            onClick={() => edit({ light: { ...DEFAULT_LIGHT }, regions: [] })}
          >
            Licht zurücksetzen
          </button>
          <button
            className="primary"
            disabled={
              busy || !ready || output?.serial !== serial || Boolean(error)
            }
            onClick={() => void save()}
          >
            Als Lichtkandidat übernehmen
          </button>
        </div>
        {mask && (
          <MaskEditor
            master={source}
            initialWeights={mask.weights}
            initialName={mask.name}
            onClose={() => setMaskRegion(undefined)}
            onSave={async (weights, name) => {
              edit({
                ...draft,
                regions: draft.regions.map((r) =>
                  r.id === mask.id
                    ? {
                        ...r,
                        weights,
                        name,
                        revision: r.revision + 1,
                        reusedExpressionMask: undefined,
                      }
                    : r,
                ),
              });
              setMaskRegion(undefined);
            }}
          />
        )}
      </section>
    </div>
  );
}
