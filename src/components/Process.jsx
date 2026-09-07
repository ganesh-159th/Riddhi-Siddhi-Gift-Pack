import {
  Factory,
  Ruler,
  Sparkles,
  Truck,
  MessagesSquare,
  Package,
  Hammer,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import Reveal from "./Reveal.jsx";
import { WaIcon } from "./icons.jsx";
import { waLink } from "../lib/site-config.js";

const STRENGTHS_KEYS = [
  { icon: Factory, key: "strengths.directPricing" },
  { icon: Ruler, key: "strengths.customDimensions" },
  { icon: Sparkles, key: "strengths.premiumFinish" },
  { icon: Truck, key: "strengths.fastDelivery" },
];

const STEPS_KEYS = [
  { icon: MessagesSquare, key: "steps.consultation" },
  { icon: Package, key: "steps.material" },
  { icon: Hammer, key: "steps.production" },
  { icon: ShieldCheck, key: "steps.quality" },
  { icon: Truck, key: "steps.delivery" },
];

export default function Process() {
  const { t } = useTranslation();

  const strengths = STRENGTHS_KEYS.map(({ icon, key }) => ({
    icon,
    title: t(`process.${key}.title`),
    text: t(`process.${key}.text`),
  }));

  const steps = STEPS_KEYS.map(({ icon, key }) => ({
    icon,
    title: t(`process.${key}.title`),
    text: t(`process.${key}.text`),
  }));

  return (
    <section id="process" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">{t("process.sectionLabel")}</p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white sm:text-4xl">
            {t("process.title1")}
            <span className="text-gold-gradient">{t("process.title2")}</span>
          </h2>
          <p className="mt-4 text-slate-400">
            {t("process.subtitle")}
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {strengths.map((s, i) => (
            <Reveal key={s.title} delay={i} className="group rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur-xl transition hover:border-gold-500/40 hover:bg-white/10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 shadow-glow transition group-hover:scale-110">
                <s.icon className="h-7 w-7 text-navy-950" />
              </div>
              <h3 className="font-display mt-5 text-lg font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.text}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-16 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl sm:p-12">
          <div className="grid items-start gap-10 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">{t("process.processLabel")}</p>
              <h3 className="font-display mt-3 text-2xl font-bold text-white sm:text-3xl">
                {t("process.processTitle1")}
                <span className="text-gold-gradient">{t("process.processTitle2")}</span>
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                {t("process.processSubtitle")}
              </p>
              <a
                href={waLink(t("waMessages.bulkDiscuss"))}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-whatsapp px-6 py-3 text-sm font-semibold text-navy-950 transition hover:brightness-110"
              >
                <WaIcon /> {t("process.discussOrder")}
              </a>
            </div>

            <ol className="relative grid gap-8 lg:col-span-2">
              <span className="absolute bottom-2 left-[23px] top-2 hidden w-px bg-gradient-to-b from-gold-500/60 via-gold-500/25 to-transparent sm:block"></span>

              {steps.map((step) => (
                <li key={step.title} className="relative flex gap-5">
                  <span className="z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold-500/40 bg-navy-900 shadow-glow">
                    <step.icon className="h-5 w-5 text-gold-400" />
                  </span>
                  <div>
                    <h4 className="font-semibold text-white">{step.title}</h4>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
