import { useEffect, useState } from "react";
import type {
  QualityReport,
  MasterApprovalInput,
} from "../../shared/asset-quality";

/** UI mirrors main's gate; no renderer measurements are trusted for activation. */
export function MasterApproval({
  source,
  disabled,
  onApprove,
  onRetry,
  onCutout,
  label,
  onDirtyChange,
  visible = true,
}: {
  source: { id: string; sha256: string };
  disabled?: boolean;
  onApprove: (review: MasterApprovalInput) => void;
  onRetry?: () => void;
  onCutout: () => void;
  label: string;
  onDirtyChange?: (dirty: boolean) => void;
  visible?: boolean;
}) {
  const [report, setReport] = useState<QualityReport>();
  const [error, setError] = useState("");
  const [identity, setIdentity] = useState(false),
    [silhouette, setSilhouette] = useState(false),
    [activation, setActivation] = useState(false),
    [raster, setRaster] = useState(false),
    [notes, setNotes] = useState("");
  useEffect(() => {
    let live = true;
    setReport(undefined);
    setError("");
    setIdentity(false);
    setSilhouette(false);
    setActivation(false);
    setRaster(false);
    setNotes("");
    void window.laceframe
      .qualityReport(source.id)
      .then((r) => {
        if (live) {
          if (r.ok) setReport(r.value);
          else setError(r.error);
        }
      })
      .catch(() => {
        if (live) setError("Bildprüfung fehlgeschlagen.");
      });
    return () => {
      live = false;
    };
  }, [source.id, source.sha256]);
  useEffect(() => {
    onDirtyChange?.(
      Boolean(identity || silhouette || activation || raster || notes),
    );
  }, [identity, silhouette, activation, raster, notes, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  if (!visible) return null;
  return (
    <section className="master-approval" aria-label="Masterfreigabe">
      <p role="status" aria-label="Master Transparenzprüfung">
        {error
          ? `Ungültiges Bild – nicht freigabefähig: ${error}`
          : !report
            ? "Gespeicherte RGBA-Pixel werden geprüft …"
            : report.status === "transparent"
              ? "Transparenz vorhanden – manuelle Prüfung erforderlich"
              : report.status === "opaque"
                ? "Dieser Master-Kandidat hat keinen echten transparenten Hintergrund."
                : "Transparenz verdächtig oder Bild leer – Korrektur erforderlich"}
      </p>
      {report && (
        <small>
          {report.width} × {report.height} · Alpha-Null {report.transparent} ·
          Teilalpha {report.partial} · Deckend {report.opaque} · Rand{" "}
          {report.edgeTransparent}/{report.edgePixels} · Transparenter
          Außenbereich {report.exteriorTransparent}. Transparenz beweist keine
          perfekte Silhouette.
        </small>
      )}
      {report?.status !== "transparent" && (
        <div className="button-row">
          {onRetry && (
            <button disabled={disabled} onClick={onRetry}>
              Erneut generieren
            </button>
          )}
          <button disabled={disabled || !!error || !report} onClick={onCutout}>
            Hintergrund freistellen
          </button>
        </div>
      )}
      <label>
        <input
          aria-label="Master Identität bestätigt"
          type="checkbox"
          checked={identity}
          onChange={(e) => setIdentity(e.target.checked)}
        />
        Identität, neutrale Mimik und Outfit bestätigt
      </label>
      <label>
        <input
          aria-label="Master Silhouette geprüft"
          type="checkbox"
          checked={silhouette}
          onChange={(e) => setSilhouette(e.target.checked)}
        />
        Silhouette und Alpha-Kanten auf hellem, dunklem und
        Schachbretthintergrund geprüft
      </label>
      <label>
        <input
          type="checkbox"
          aria-label="Master Rasterqualität geprüft"
          checked={raster}
          onChange={(e) => setRaster(e.target.checked)}
        />
        Raster und Pixelcluster bei 1:1 und Vergrößerung geprüft; Mixels
        korrigiert oder bewusst manuell beurteilt
      </label>
      <p>
        Bei unsicherem Raster zuerst Pixel Snap in „Bearbeiten“ prüfen.
        Automatische Hinweise sind kein Identitäts- oder Qualitätsnachweis.
        Entscheidung in der Prüfnotiz dokumentieren.
      </p>
      <label>
        Prüfnotiz
        <textarea
          aria-label="Master Prüfnotiz"
          maxLength={8000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <label>
        <input
          aria-label="Master Aktivierung bestätigen"
          type="checkbox"
          checked={activation}
          onChange={(e) => setActivation(e.target.checked)}
        />
        Der neue Master wird als aktuelle Version dieser Figur aktiviert.
        Bisherige Master und Expressions bleiben erhalten und werden nicht
        automatisch verändert.
      </label>
      <button
        className="primary"
        disabled={
          disabled ||
          !!error ||
          report?.status !== "transparent" ||
          !identity ||
          !silhouette ||
          !activation ||
          !raster ||
          !notes.trim()
        }
        onClick={() =>
          onApprove({
            sourceSha256: source.sha256,
            identityConfirmed: true,
            silhouetteConfirmed: true,
            activationConfirmed: true,
            rasterConfirmed: true,
            notes,
          })
        }
      >
        {label}
      </button>
    </section>
  );
}
