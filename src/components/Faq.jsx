import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import Reveal from "./Reveal.jsx";

export default function Faq() {
  const { t } = useTranslation();
  const faqs = t("faq.items", { returnObjects: true });

  return (
    <section id="faq" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">{t("faq.sectionLabel")}</p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white sm:text-4xl">
            {t("faq.title1")}<span className="text-gold-gradient">{t("faq.title2")}</span>
          </h2>
          <p className="mt-4 text-slate-400">
            {t("faq.subtitle")}
          </p>
        </Reveal>

        <div className="mx-auto mt-12 max-w-3xl space-y-3">
          {faqs.map((f, i) => (
            <Reveal
              key={i}
              as="details"
              delay={Math.min(i, 3)}
              className="group rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl transition hover:border-gold-500/30 open:border-gold-500/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold text-white [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-gold-400 transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}