import type { RelightEligibility } from "../../shared/relighting";
import { StyleComparison } from "./StyleComparison";
import { RelightingEditor } from "./RelightingEditor";
import { useEffect, useState } from "react";
import type { Command, Project, Snapshot } from "../../shared/domain";
import { effectiveStyle } from "../../shared/domain";
import {
  RESOLUTION_PROFILES,
  type QualityReport,
  type ResolutionProfile,
} from "../../shared/asset-quality";
import { MaskEditor } from "./MaskEditor";
import { MasterCandidateCompare } from "./MasterCandidateCompare";
import { ImagePreview } from "./ImagePreview";
type Asset = { id: string; width: number; height: number; characterId: string };
export function Evidence({ id, label }: { id: string; label: string }) {
  const [report, setReport] = useState<QualityReport>(),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setReport(undefined);
    setError("");
    void window.laceframe
      .qualityReport(id)
      .then((r) => {
        if (live) {
          if (r.ok) setReport(r.value);
          else setError(r.error);
        }
      })
      .catch(() => {
        if (live) setError("Qualitätsprüfung fehlgeschlagen.");
      });
    return () => {
      live = false;
    };
  }, [id]);
  if (error)
    return (
      <p className="warning">
        {label}: {error} · kein Transparenznachweis.
      </p>
    );
  if (!report) return <p>{label}: Pixel werden geprüft …</p>;
  const names = {
    transparent: "Transparenz vorhanden · Silhouette manuell prüfen",
    suspicious: "Hintergrund verdächtig · Freistellung erforderlich",
    opaque: "Vollständig deckend · Freistellung erforderlich",
    empty: "Leeres transparentes Bild · nicht produktionsfertig",
  };
  return (
    <div className="quality-evidence" data-quality-status={report.status}>
      <strong>
        {label} · {names[report.status]}
      </strong>
      <small>
        {report.width} × {report.height} · {report.format.toUpperCase()} ·
        Alpha-Null: {report.transparent} · Teilalpha: {report.partial} ·
        Deckend: {report.opaque} · Transparenter Rand: {report.edgeTransparent}/
        {report.edgePixels}
      </small>
      <div className="quality-palette" aria-label={`${label} dominante Farben`}>
        {report.palette.map((p) => (
          <span
            key={p.color}
            title={`${p.color} · ${p.pixels} Pixel (5-Bit-Farbgruppe)`}
            style={{ background: p.color }}
          />
        ))}
      </div>
      <small>
        Dominante 5-Bit-Farbgruppen sichtbarer Pixel. Nachbarwechsel:{" "}
        {report.neighborChanges}/{report.neighborPairs}. Vergleichshilfe für
        Detaildichte, kein Stilscore.
      </small>
      <small>{report.warnings.join(" ")}</small>
    </div>
  );
}
export function AssetQuality({
  source,
  project,
  onSnapshot,
  disabled = false,
  cutoutRequested = 0,
  onCutoutOpened,
}: {
  source: Asset;
  project: Project;
  onSnapshot: (s: Snapshot) => void;
  disabled?: boolean;
  cutoutRequested?: number;
  onCutoutOpened?: () => void;
}) {
  const [relighting, setRelighting] = useState<{
    source: Asset;
    recipeId?: string;
  }>();
  const [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [working, setWorking] = useState(false),
    [notes, setNotes] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [includeProvenance, setIncludeProvenance] = useState(true);
  const [expanded, setExpanded] = useState(false),
    [styleExpanded, setStyleExpanded] = useState(false);
  const [profile, setProfile] = useState<ResolutionProfile>(
    RESOLUTION_PROFILES[0],
  );
  const [editor, setEditor] = useState<{
    source: Asset;
    weights?: Uint8Array;
    recipeId?: string;
    name?: string;
  }>();
  useEffect(() => {
    if (cutoutRequested) {
      setExpanded(true);
      setEditor({ source });
      onCutoutOpened?.();
    }
  }, [cutoutRequested]);
  const derivatives = project.qualityAssets.filter((q) => {
    let id = q.sourceId;
    const seen = new Set<string>();
    while (id !== source.id) {
      if (seen.has(id)) return false;
      seen.add(id);
      const parent = project.qualityAssets.find((a) => a.id === id);
      if (!parent) return false;
      id = parent.sourceId;
    }
    return true;
  });
  const promotedSource = [...project.masters, ...project.assets].find(
    (a) => a.id === source.id,
  );
  const sourceQuality = project.qualityAssets.find(
    (q) => q.id === promotedSource?.qualitySourceId,
  );
  const selectedSource = project.qualityAssets.find((q) => q.id === source.id);
  const derivative =
      (selected === source.id
        ? selectedSource
        : derivatives.find((q) => q.id === selected)) ??
      selectedSource ??
      derivatives.at(-1),
    active = derivative ?? source;
  let root = source;
  const visited = new Set<string>();
  while (true) {
    const promoted = [...project.masters, ...project.assets].find(
      (a) => a.id === root.id,
    );
    const q = project.qualityAssets.find(
      (q) => q.id === (promoted?.qualitySourceId ?? root.id),
    );
    if (!q || visited.has(q.id)) break;
    visited.add(q.id);
    const parent = [
      ...project.masters,
      ...project.assets,
      ...project.masterCandidates,
      ...project.qualityAssets,
    ].find((a) => a.id === q.sourceId);
    if (!parent) break;
    root = parent;
  }
  const rootExpression = project.assets.find((a) => a.id === root.id),
    rootCandidate = project.masterCandidates.find(
      (a) => a.id === root.id || a.approvedMasterId === root.id,
    );
  const attempt =
    project.attempts.find((a) => a.id === rootExpression?.attemptId) ??
    project.masterAttempts.find((a) => a.id === rootCandidate?.attemptId);
  const currentStyle = effectiveStyle(project, source.characterId);
  const style = attempt
    ? project.artDirectionRevisions.find(
        (s) =>
          s.profileId === attempt.artDirectionId &&
          s.revision === attempt.artDirectionRevision,
      )
    : currentStyle;
  const styleIds = attempt
    ? (attempt.styleReferences?.map((r) => r.id) ?? [])
    : (currentStyle?.styleReferenceIds ?? []);
  const lightingRecipe = derivative?.relighting
    ? derivative
    : sourceQuality?.relighting
      ? sourceQuality
      : undefined;
  const [eligibility, setEligibility] = useState<RelightEligibility>();
  const [recipeEligibility, setRecipeEligibility] =
    useState<RelightEligibility>();
  useEffect(() => {
    if (!expanded) return;
    let live = true;
    setEligibility(undefined);
    setRecipeEligibility(undefined);
    const read = (id: string, set: (e: RelightEligibility) => void) => {
      void window.laceframe
        .relightEligibility(id)
        .then((r) => {
          if (live) set(r.ok ? r.value : { allowed: false, reason: r.error });
        })
        .catch(() => {
          if (live)
            set({
              allowed: false,
              reason:
                "Freistellungsprüfung fehlgeschlagen. Quelle erneut öffnen.",
            });
        });
    };
    read(active.id, setEligibility);
    if (lightingRecipe) read(lightingRecipe.sourceId, setRecipeEligibility);
    return () => {
      live = false;
    };
  }, [expanded, active.id, project, lightingRecipe?.id]);
  const busy = disabled || working;
  async function command(c: Command) {
    setWorking(true);
    setError("");
    try {
      const r = await window.laceframe.command(c);
      if (!r.ok) throw new Error(r.error);
      onSnapshot(r.value);
      return r.value;
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setWorking(false);
    }
  }
  async function beginCutout() {
    setError("");
    try {
      if (derivative?.mask) {
        const r = await window.laceframe.cutoutMask(derivative.id);
        if (!r.ok) throw new Error(r.error);
        const original = [
          ...project.masters,
          ...project.assets,
          ...project.masterCandidates,
          ...project.qualityAssets,
        ].find((a) => a.id === derivative.sourceId)!;
        setEditor({
          source: original,
          weights: r.value,
          name: derivative.mask.name,
          ...(derivative.smartCutout ? { recipeId: derivative.id } : {}),
        });
      } else setEditor({ source: active });
    } catch (e) {
      setError(String(e));
    }
  }
  async function exportImage(raw: boolean) {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const r = await window.laceframe.exportAsset({
        id: active.id,
        raw,
        provenance: includeProvenance,
      });
      if (!r.ok) throw new Error(r.error);
      if (r.value)
        setNotice(
          `Exportiert: ${r.value.name}${includeProvenance ? " + Provenienz-JSON" : ""}`,
        );
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="quality-container">
      <Evidence
        id={active.id}
        label={
          derivative
            ? "Qualitätsversion"
            : sourceQuality?.operation === "cutout"
              ? "Freigestellte freigegebene Version"
              : "Bildprüfung"
        }
      />
      <details
        className="asset-quality"
        open={expanded}
        data-testid="asset-quality"
        onToggle={(e) => setExpanded(e.currentTarget.open)}
      >
        <summary>
          Assetqualität · Transparenz, Freistellung, Stil & Export
        </summary>
        {expanded && (
          <>
            <StyleComparison project={project} sourceId={active.id} />
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
            <p>
              Quelle:{" "}
              {derivative
                ? derivative.operation === "cutout"
                  ? "Freigestellter Kandidat"
                  : derivative.operation === "relighting"
                    ? `2D-Lichtkandidat · R${derivative.relighting?.revision}`
                    : "Separate Auflösungsvariante"
                : sourceQuality
                  ? "Freigegebene abgeleitete Version"
                  : "Unverändertes Rohbild"}
              . Rohfreigabe allein ist kein Nachweis für ein produktionsfertiges
              Transparenzasset.
            </p>
            {sourceQuality && (
              <p className="mono">
                Abgeleitet aus {sourceQuality.sourceId} · SHA-256{" "}
                {sourceQuality.sourceSha256}. Das Rohoriginal bleibt erhalten.
              </p>
            )}
            <p>
              {derivative
                ? `Prüfstatus: ${derivative.status} · ${derivative.notes ?? "Freigabe steht aus"}`
                : "Eine bestehende Freigabe belegt keine Transparenz. Deckende Assets bleiben als Rohbilder nutzbar."}
            </p>
            <div className="button-row">
              <button
                disabled={busy || !eligibility?.allowed}
                onClick={() => setRelighting({ source: active })}
              >
                Live Relighting öffnen
              </button>
              {lightingRecipe && (
                <button
                  disabled={busy || !recipeEligibility?.allowed}
                  onClick={() => {
                    const parent = [
                      ...project.masters,
                      ...project.assets,
                      ...project.masterCandidates,
                      ...project.qualityAssets,
                    ].find((a) => a.id === lightingRecipe.sourceId)!;
                    setRelighting({
                      source: parent,
                      recipeId: lightingRecipe.id,
                    });
                  }}
                >
                  Lichtrevision bearbeiten
                </button>
              )}
              <button disabled={busy} onClick={() => void beginCutout()}>
                Hintergrund freistellen
              </button>
              <button disabled={busy} onClick={() => void exportImage(false)}>
                Transparentes PNG exportieren
              </button>
              <button disabled={busy} onClick={() => void exportImage(true)}>
                Ausdrücklich Rohbild exportieren
              </button>
            </div>
            <p role="status" aria-label="Relighting Freigabe">
              {eligibility?.reason ??
                "Freistellungs-Herkunft und Alpha werden geprüft …"}
            </p>
            {lightingRecipe &&
              recipeEligibility &&
              !recipeEligibility.allowed && (
                <p className="warning">
                  Lichtrevision bleibt historisch erhalten. Keine neue Revision:{" "}
                  {recipeEligibility.reason}
                </p>
              )}
            <label>
              <input
                type="checkbox"
                checked={includeProvenance}
                disabled={busy}
                onChange={(e) => setIncludeProvenance(e.target.checked)}
              />
              Provenienz-JSON exportieren (Prompt, Herkunft, Prüfnotizen)
            </label>
            {(derivatives.length > 0 || derivative) && (
              <>
                <label>
                  Qualitätsversion
                  <select
                    aria-label="Qualitätsversion"
                    value={derivative?.id ?? ""}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {(selectedSource
                      ? [selectedSource, ...derivatives]
                      : derivatives
                    ).map((d, i) => (
                      <option key={d.id} value={d.id}>
                        {i + 1} · {d.operation} · {d.width}×{d.height} ·{" "}
                        {d.status}
                      </option>
                    ))}
                  </select>
                </label>
                <MasterCandidateCompare
                  master={
                    project.qualityAssets.some((q) => q.id === source.id)
                      ? [
                          ...project.masters,
                          ...project.assets,
                          ...project.masterCandidates,
                          ...project.qualityAssets,
                        ].find((a) => a.id === derivative?.sourceId)
                      : source
                  }
                  candidate={derivative}
                  beforeLabel="Original"
                  previewPrefix="Qualität"
                />
                {derivative?.status === "candidate" && (
                  <div className="quality-review">
                    <label>
                      Stil-/Silhouettenprüfung und Abweichungen
                      <textarea
                        aria-label="Qualitätsnotiz"
                        maxLength={8000}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      Identität, Outfit, Konturen, Stil und Alpha-Kanten visuell
                      geprüft
                    </label>
                    <small>
                      Notiz und Sichtprüfung erforderlich. Deckende, leere oder
                      verdächtige Ergebnisse können nicht produktiv freigegeben
                      werden. Eine Masterfreigabe erzeugt eine neue Version;
                      alte Verknüpfungen bleiben erhalten.
                    </small>
                    <div className="button-row">
                      <button
                        disabled={busy || !confirmed || !notes.trim()}
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Qualitätsversion ausdrücklich freigeben? Ein neuer Master wird als aktuelle Version aktiviert; bisherige Master und Expressions bleiben unverändert erhalten.",
                            )
                          )
                            return;
                          void command({
                            type: "reviewQuality",
                            id: derivative.id,
                            status: "approved",
                            notes,
                            confirmStyleAndSilhouette: true,
                          }).catch(() => {});
                        }}
                      >
                        Qualitätsversion freigeben
                      </button>
                      <button
                        disabled={busy || !notes.trim()}
                        onClick={() => {
                          void command({
                            type: "reviewQuality",
                            id: derivative.id,
                            status: "rejected",
                            notes,
                            confirmStyleAndSilhouette: true,
                          }).catch(() => {});
                        }}
                      >
                        Qualitätsversion ablehnen
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            <details>
              <summary>Auflösungsprofil · separate Variante</summary>
              <div className="inline-form">
                <label>
                  Vorlage
                  <select
                    aria-label="Auflösungsvorlage"
                    onChange={(e) =>
                      setProfile({
                        ...RESOLUTION_PROFILES[Number(e.target.value)],
                      })
                    }
                  >
                    {RESOLUTION_PROFILES.map((p, i) => (
                      <option key={p.name} value={i}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Profilname
                  <input
                    value={profile.name}
                    onChange={(e) =>
                      setProfile({ ...profile, name: e.target.value })
                    }
                  />
                </label>
                {(["width", "height"] as const).map((k) => (
                  <label key={k}>
                    {k === "width" ? "Breite" : "Höhe"}
                    <input
                      aria-label={`Profil ${k}`}
                      type="number"
                      min={1}
                      max={4096}
                      value={profile[k]}
                      onChange={(e) =>
                        setProfile({ ...profile, [k]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
                <label>
                  Skalierung
                  <select
                    value={profile.sampling}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        sampling: e.target
                          .value as ResolutionProfile["sampling"],
                      })
                    }
                  >
                    <option value="nearest">Nearest Neighbor · Pixelart</option>
                    <option value="bilinear">Bilinear · alpha-korrekt</option>
                  </select>
                </label>
                <label>
                  Seitenverhältnis
                  <select
                    value={profile.fit}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        fit: e.target.value as ResolutionProfile["fit"],
                      })
                    }
                  >
                    <option value="contain">
                      Einpassen + transparentes Padding
                    </option>
                    <option value="cover">
                      Füllen + zentrierter Zuschnitt
                    </option>
                  </select>
                </label>
              </div>
              <p>
                {active.width === profile.width &&
                active.height === profile.height
                  ? "Auflösung entspricht Profil"
                  : "Auflösung weicht ab"}{" "}
                · Ist {active.width}×{active.height} / Ziel {profile.width}×
                {profile.height}. Nearest Neighbor erzeugt keinen Pixelart-Stil
                aus Fotorealismus. Keine Verzerrung; Quelle bleibt erhalten.
              </p>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    profile.fit === "cover" &&
                    !window.confirm(
                      "Zentrierten Zuschnitt ausdrücklich anwenden? Die Quelle bleibt erhalten.",
                    )
                  )
                    return;
                  void command({
                    type: "deriveResolution",
                    sourceId: active.id,
                    profile,
                  }).catch(() => {});
                }}
              >
                Separate Auflösungsvariante erstellen
              </button>
            </details>
            <details onToggle={(e) => setStyleExpanded(e.currentTarget.open)}>
              <summary>
                Art-Direction-Vergleich · {style?.name ?? "Eigener Masterstil"}{" "}
                · {styleIds.length} Stilreferenzen
              </summary>
              <p>
                Zielpalette:{" "}
                {style?.colorRules ??
                  "Keine explizite Zielpalette; dominante Referenzfarben vergleichen."}
                . Identität, Outfit und Hintergrund sind unabhängig vom
                Renderingstil. Konturen, Farbflächen, Cluster und Details bei
                gleichem Zoom prüfen; keine automatische Stilfreigabe.
              </p>
              {styleExpanded &&
                styleIds.map((id) => (
                  <div key={id}>
                    <ImagePreview
                      id={id}
                      caption="Stilreferenz · keine Identitäts-/Outfitvorlage"
                      zoom={100}
                    />
                    <Evidence id={id} label="Stilreferenz" />
                    <MasterCandidateCompare
                      master={project.styleAssets.find((a) => a.id === id)}
                      candidate={active}
                      beforeLabel="Stilreferenz"
                      previewPrefix="Stilprüfung"
                    />
                  </div>
                ))}
            </details>
            {relighting && (
              <RelightingEditor
                source={relighting.source}
                recipeId={relighting.recipeId}
                project={project}
                onClose={() => setRelighting(undefined)}
                onSaved={(s) => {
                  onSnapshot(s);
                  setSelected(s.project.qualityAssets.at(-1)!.id);
                }}
              />
            )}
            {editor && (
              <MaskEditor
                master={editor.source}
                cutout
                initialWeights={editor.weights}
                initialName={editor.name}
                recipeId={editor.recipeId}
                onClose={() => setEditor(undefined)}
                onSave={async (weights, name, smart) => {
                  const s = await command({
                    type: "createCutout",
                    name,
                    sourceId: editor.source.id,
                    weights: new Uint8Array(weights),
                    ...(smart ? { smart } : {}),
                  });
                  setSelected(s.project.qualityAssets.at(-1)!.id);
                }}
              />
            )}
          </>
        )}
      </details>
    </div>
  );
}
