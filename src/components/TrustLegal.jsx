import { BadgeCheck, ShieldCheck, FileText, Layers, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";
import Reveal from "./Reveal.jsx";

const TERMS_KEYS = [
  { icon: FileText, key: "terms.invoicing" },
  { icon: Layers, key: "terms.moq" },
  { icon: Truck, key: "terms.delivery" },
];

export default function TrustLegal() {
  const { t } = useTranslation();

  const terms = TERMS_KEYS.map(({ icon, key }) => ({
    icon,
    title: t(`trust.${key}.title`),
    text: t(`trust.${key}.text`),
  }));

  return (
    <section id="legal" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">{t("trust.sectionLabel")}</p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white sm:text-4xl">
            {t("trust.title1")} <span className="text-gold-gradient">{t("trust.title2")}</span>
          </h2>
          <p className="mt-4 text-slate-400">
            {t("trust.subtitle")}
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* GSTIN verified */}
          <Reveal className="relative overflow-hidden rounded-3xl border border-gold-500/30 bg-gradient-to-br from-gold-500/10 to-transparent p-8 backdrop-blur-xl sm:p-10">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-500/15 blur-3xl"></div>
            <div className="flex items-start gap-4">
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-whatsapp to-emerald-500 shadow-glow">
                <BadgeCheck className="h-7 w-7 text-navy-950" />
                <span className="animate-ping-soft absolute -inset-1 -z-10 rounded-2xl bg-emerald-400/30"></span>
              </span>
              <div>
                <h3 className="font-display text-xl font-bold text-white">{t("trust.gstTitle")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {t("trust.gstText")}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <code className="rounded-xl border border-gold-500/40 bg-navy-950/70 px-4 py-2.5 font-mono text-sm font-semibold tracking-wider text-gold-300">
                36AFMPN3258E1ZB
              </code>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> {t("trust.verified")}
              </span>
            </div>
          </Reveal>

          {/* Terms stack */}
          <div className="grid gap-6">
            {terms.map((term, i) => (
              <Reveal
                key={term.title}
                delay={i}
                className="flex items-start gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition hover:border-gold-500/40"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-400/30 bg-gold-500/15">
                  <term.icon className="h-6 w-6 text-gold-300" />
                </span>
                <div>
                  <h3 className="font-semibold text-white">{term.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{term.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}