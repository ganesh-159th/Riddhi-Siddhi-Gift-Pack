import { useRef, useState } from "react";
import { Globe, Check } from "lucide-react";
import { useLanguage, LANGUAGES } from "../lib/useLanguage.js";

export default function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  const select = (code) => {
    setLang(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 backdrop-blur transition hover:border-gold-500/50 hover:bg-white/10"
        aria-label="Change language"
        aria-expanded={open}
      >
        <Globe className="h-4 w-4 text-gold-400" />
        <span className="min-w-[2rem] text-center">{current.label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-2xl border border-white/10 bg-navy-900/95 shadow-card backdrop-blur-xl">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => select(l.code)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/5 hover:text-gold-300"
            >
              <span>
                <span className="font-semibold">{l.label}</span>
                <span className="ml-2 text-xs text-slate-400">{l.full}</span>
              </span>
              {l.code === lang && <Check className="h-4 w-4 text-gold-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}