import { useState } from "react";
import type { Snapshot } from "../../shared/domain";
import type { PackKind, PackPreview } from "../../shared/packs";
import type { Perform } from "./StyleLibrary";

export function PackTools({
  snapshot,
  kind,
  profileId,
  familyId,
  disabled,
  perform,
  onSnapshot,
}: {
  snapshot: Snapshot;
  kind: PackKind;
  profileId?: string;
  familyId?: string;
  disabled: boolean;
  perform: Perform;
  onSnapshot: (s: Snapshot) => void;
}) {
  const [preview, setPreview] = useState<PackPreview>();
  const [choices, setChoices] = useState<
    Record<string, "new" | "update" | "skip">
  >({});
  const [all, setAll] = useState(true);
  const [scopeReviewed, setScopeReviewed] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <section className="pack-tools" aria-label={`${kind} Packs`}>
      <h3>
        {kind === "style" ? "Style Pack" : "Expression Pack"} · JSON-Austausch
      </h3>
      <p>
        Nur gespeicherte globale Regeln. Keine Bilder, lokalen Pfade, Figuren,
        Outfits oder persönlichen Expression Performances. Freitexte vor dem
        Teilen selbst auf personenbezogene Angaben prüfen.
      </p>
      {kind === "style" && (
        <label>
          <input
            type="checkbox"
            aria-label="Style Pack Inhaltsprüfung"
            checked={scopeReviewed}
            onChange={(e) => setScopeReviewed(e.target.checked)}
          />
          Gespeicherte Stilregeln geprüft: ausschließlich Rendering und
          Komposition; keine persönlichen Identitäts-, Outfit- oder
          Emotionsanweisungen. Linterhinweise prüfen, bei Bedarf
          Migrationsassistent verwenden.
        </label>
      )}
      {kind === "expressions" && (
        <label>
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          Alle Familien exportieren (sonst ausgewählte Familie)
        </label>
      )}
      <div className="button-row">
        <button
          disabled={
            disabled ||
            (kind === "style" && (!profileId || !scopeReviewed)) ||
            (kind === "expressions" && !all && !familyId)
          }
          onClick={() =>
            void perform(
              () =>
                window.laceframe.exportPack({
                  kind,
                  ...(kind === "style"
                    ? { styleScopeReviewed: true as const }
                    : {}),
                  ...(profileId ? { profileId } : {}),
                  ...(kind === "expressions"
                    ? {
                        familyIds: all
                          ? snapshot.project.families.map((f) => f.id)
                          : [familyId!],
                      }
                    : {}),
                }),
              (r) => {
                if (r) setNotice(`Exportiert: ${r.name}`);
              },
            )
          }
        >
          JSON-Pack exportieren …
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            void perform(
              () => window.laceframe.choosePack(kind),
              (r) => {
                if (r) {
                  setPreview(r);
                  setChoices(
                    Object.fromEntries(
                      r.rows.map((row) => [
                        row.key,
                        row.status === "neu" ? "new" : "skip",
                      ]),
                    ),
                  );
                  setNotice("");
                }
              },
            )
          }
        >
          JSON-Pack importieren …
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {preview && (
        <section aria-label="Pack Importvorschau">
          <h4>Importvorschau · {preview.pack.format} · Schema 1</h4>
          <p>
            Keine automatische Überschreibung. „Aktualisieren“ ist nur bei
            eindeutiger stabiler ID möglich. Bei Expressions bleiben
            ausgelassene Varianten und persönliche Overrides erhalten.
          </p>
          {preview.rows.map((row) => (
            <article key={row.key}>
              <strong>
                {row.label} ·{" "}
                {choices[row.key] === "skip" ? "übersprungen · " : ""}
                {row.status}
              </strong>
              <p>{row.reason}</p>
              <label>
                Importentscheidung {row.label}
                <select
                  aria-label={`Importentscheidung ${row.label}`}
                  value={choices[row.key]}
                  disabled={disabled}
                  onChange={(e) =>
                    setChoices({
                      ...choices,
                      [row.key]: e.target.value as "new" | "update" | "skip",
                    })
                  }
                >
                  <option value="skip">Überspringen</option>
                  <option value="new">Als neu importieren</option>
                  <option
                    value="update"
                    disabled={!row.targetId || row.status === "Konflikt"}
                  >
                    Ausdrücklich aktualisieren
                  </option>
                </select>
              </label>
            </article>
          ))}
          <details>
            <summary>Vollständige Pack-Regeln und Herkunft prüfen</summary>
            <pre>{JSON.stringify(preview.pack, null, 2)}</pre>
          </details>
          <button
            disabled={
              disabled || preview.rows.every((r) => choices[r.key] === "skip")
            }
            onClick={() =>
              void perform(
                () =>
                  window.laceframe.command({
                    type: "importPack",
                    pack: preview.pack,
                    projectHash: preview.projectHash,
                    choices: preview.rows.map((r) => ({
                      key: r.key,
                      action: choices[r.key],
                    })),
                  }),
                (s) => {
                  onSnapshot(s);
                  setPreview(undefined);
                  setNotice("Gewählte Pack-Regeln importiert.");
                },
              )
            }
          >
            Geprüften Import übernehmen
          </button>
          <button disabled={disabled} onClick={() => setPreview(undefined)}>
            Pack-Import abbrechen
          </button>
        </section>
      )}
    </section>
  );
}
