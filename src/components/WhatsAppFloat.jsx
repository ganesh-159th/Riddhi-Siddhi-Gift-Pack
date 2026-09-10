import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { WaIcon } from "./icons.jsx";
import { waLink } from "../lib/site-config.js";

export default function WhatsAppFloat() {
  const [showTip, setShowTip] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const id = setTimeout(() => setShowTip(true), 2000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="wa-float fixed z-50">
      <div
        className={`mb-3 hidden items-center gap-3 rounded-2xl border border-white/10 bg-navy-900/95 p-3 pr-2 shadow-card backdrop-blur-xl ${
          showTip ? "sm:flex" : ""
        }`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-whatsapp/30 bg-whatsapp/15">
          <WaIcon className="icon-em text-whatsapp" />
        </span>
        <div className="pr-1">
          <p className="text-xs font-semibold text-white">{t("whatsappFloat.chatWithName")}</p>
          <p className="text-[11px] text-slate-400">{t("whatsappFloat.chatHint")}</p>
        </div>
        <button
          onClick={() => setShowTip(false)}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label={t("whatsappFloat.closePopup")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <a
        href={waLink(t("waMessages.interested"))}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("whatsappFloat.chatAriaLabel")}
        className="animate-pulse-glow relative flex h-16 w-16 items-center justify-center rounded-full bg-whatsapp shadow-glow transition hover:scale-105"
      >
        <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-whatsapp/60"></span>
        <WaIcon className="icon-em text-navy-950" />
      </a>
    </div>
  );
}
