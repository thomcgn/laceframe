import { displayMessage } from "../../shared/locales";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { languages, i18n, setLanguage, tr } from "../../shared/locales";
export function LanguageSelector() {
  useTranslation();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function choose(language: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await window.laceframe.setLanguage(language);
      if (!r.ok) throw new Error(r.error);
      await setLanguage(r.value.language);
      document.documentElement.lang = r.value.language;
    } catch {
      setError(tr("common.languageSaveFailed"));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <div>
      <label className="language-selector">
        {tr("common.language")}
        <select
          aria-label={tr("common.language")}
          value={i18n.language}
          disabled={busy}
          onChange={(e) => void choose(e.target.value)}
        >
          {languages.map((code) => (
            <option key={code} value={code}>
              {new Intl.DisplayNames([code], { type: "language" }).of(code) ??
                code}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{displayMessage(error)}</p>}
    </div>
  );
}
