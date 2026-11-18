import { tr } from "../../shared/locales/index";
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
        if (live) setError(tr("characters.mbdb3c8753d"));
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
    <section
      className="master-approval"
      aria-label={tr("characters.me55c5672c2")}
    >
      <p role="status" aria-label={tr("characters.m5aab71c5c1")}>
        {error
          ? tr("characters.me73ef4df3e", { v0: error })
          : !report
            ? tr("characters.m44c6e90c11")
            : report.status === "transparent"
              ? tr("characters.m219f49bcc9")
              : report.status === "opaque"
                ? tr("characters.m9a3b03866d")
                : tr("characters.m309473cac1")}
      </p>
      {report && (
        <small>
          {report.width} × {report.height} {tr("characters.m38fe578dc6")}
          {report.transparent} {tr("characters.m6db683287a")}
          {report.partial} {tr("characters.me97b73245b")}
          {report.opaque} {tr("characters.m16e3eaed7f")}{" "}
          {report.edgeTransparent}/{report.edgePixels}{" "}
          {tr("characters.me3e8100f6a")}
          {report.exteriorTransparent}
          {tr("common.m6bac5d6dae")}
        </small>
      )}
      {report?.status !== "transparent" && (
        <div className="button-row">
          {onRetry && (
            <button disabled={disabled} onClick={onRetry}>
              {tr("characters.me5c1eb29cb")}
            </button>
          )}
          <button disabled={disabled || !!error || !report} onClick={onCutout}>
            {tr("characters.m46746f197e")}
          </button>
        </div>
      )}
      <label>
        <input
          aria-label={tr("characters.meaa9efbb3f")}
          type="checkbox"
          checked={identity}
          onChange={(e) => setIdentity(e.target.checked)}
        />
        {tr("characters.m056045b14d")}
      </label>
      <label>
        <input
          aria-label={tr("characters.m2278b82bc5")}
          type="checkbox"
          checked={silhouette}
          onChange={(e) => setSilhouette(e.target.checked)}
        />
        {tr("characters.m60a43fa340")}
      </label>
      <label>
        <input
          type="checkbox"
          aria-label={tr("characters.mb2f3510676")}
          checked={raster}
          onChange={(e) => setRaster(e.target.checked)}
        />
        {tr("characters.m8295c64aed")}
      </label>
      <p>{tr("characters.m453416428d")}</p>
      <label>
        {tr("characters.mbcb1613882")}
        <textarea
          aria-label={tr("characters.mb261f549e9")}
          maxLength={8000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <label>
        <input
          aria-label={tr("characters.md800bc277d")}
          type="checkbox"
          checked={activation}
          onChange={(e) => setActivation(e.target.checked)}
        />
        {tr("characters.maddb80a58f")}
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
