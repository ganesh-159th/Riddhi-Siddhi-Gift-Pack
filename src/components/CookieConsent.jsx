import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CONSENT, getConsent, setConsent } from "../lib/analytics.js";

export default function CookieConsent() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent() === CONSENT.UNKNOWN) setVisible(true);
  }, []);

  if (!visible) return null;

  const decide = (value) => {
    setConsent(value);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("consent.ariaLabel")}
      className="cookie-banner fixed inset-x-0 bottom-0 z-[80] p-4 sm:p-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-3xl border border-white/10 bg-navy-900/95 p-5 shadow-card backdrop-blur-xl sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold-500/30 bg-gold-500/10">
            <Cookie className="h-5 w-5 text-gold-300" />
          </span>
          <p className="text-sm leading-relaxed text-slate-300">
            {t("consent.text")}{" "}
            <a href="#trust" className="whitespace-nowrap text-gold-300 underline transition hover:text-gold-200">
              {t("consent.learnMore")}
            </a>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={() => decide(CONSENT.DENIED)}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            {t("consent.reject")}
          </button>
          <button
            onClick={() => decide(CONSENT.GRANTED)}
            className="rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-6 py-2.5 text-sm font-semibold text-navy-950 shadow-glow transition hover:brightness-110"
          >
            {t("consent.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}