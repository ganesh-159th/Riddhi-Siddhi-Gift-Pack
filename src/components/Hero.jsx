import {
  Gem,
  Crown,
  Sparkles,
  Truck,
  Stamp,
  Building2,
  Phone,
  BadgeCheck,
  Layers,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { WaIcon } from "./icons.jsx";
import { waLink } from "../lib/site-config.js";

const MARQUEE = [
  [Gem, "marquee.b2bBulk", "text-gold-300"],
  [Crown, "marquee.customBox", "text-slate-400"],
  [Sparkles, "marquee.premiumFinish", "text-gold-300"],
  [Truck, "marquee.panIndiaDelivery", "text-slate-400"],
  [Stamp, "marquee.customLogo", "text-gold-300"],
  [Building2, "marquee.hyderabadFactory", "text-slate-400"],
];

export default function Hero() {
  const { t } = useTranslation();
  return (
    <section id="home" className="relative overflow-hidden pb-16 pt-32 sm:pb-24 sm:pt-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {/* Copy */}
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-4 py-1.5 text-xs font-medium tracking-wide text-gold-300 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-400"></span>
              </span>
              {t("hero.badge")}
            </span>

            <h1 className="font-display mt-6 text-4xl font-bold leading-[1.12] tracking-tight text-white sm:text-5xl xl:text-6xl">
              {t("hero.title1")}
              <span className="text-gold-gradient">{t("hero.title2")}</span>
              {t("hero.title3")}
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              {t("hero.subtitle")}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={waLink(t("waMessages.catalogue"))}
                target="_blank"
                rel="noopener noreferrer"
                className="sheen inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-7 py-3.5 font-semibold text-navy-950 shadow-glow transition hover:brightness-110"
              >
                <WaIcon /> {t("hero.ctaCatalogue")}
              </a>
              <a
                href="tel:+919346797060"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-3.5 font-semibold text-white backdrop-blur transition hover:border-gold-500/50 hover:bg-white/10"
              >
                <Phone className="h-5 w-5 text-gold-400" /> {t("hero.ctaCall")}
              </a>
            </div>

            <ul className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-gold-400" /> {t("hero.gstRegistered")}
              </li>
              <li className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-gold-400" /> {t("hero.moqPricing")}
              </li>
              <li className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-gold-400" /> {t("hero.panIndia")}
              </li>
            </ul>
          </div>

          {/* Visual showcase */}
          <div className="relative mx-auto w-full max-w-lg">
            <div className="animate-floaty-slow absolute -right-4 -top-8 z-20 hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl sm:block">
              <p className="text-xs uppercase tracking-widest text-slate-400">{t("hero.finishLabel")}</p>
              <p className="mt-1 text-sm font-semibold text-gold-300">{t("hero.finishValues")}</p>
            </div>

            <div className="animate-floaty absolute -bottom-6 -left-4 z-20 hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl sm:block">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-whatsapp opacity-75"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-whatsapp"></span>
                </span>
                <p className="text-sm font-semibold text-white">{t("hero.bulkAccepted")}</p>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] border border-gold-500/25 bg-gradient-to-br from-navy-700 via-navy-900 to-wine-700 shadow-card">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(238,196,79,.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(138,28,60,.4),transparent_55%)]"></div>

              <div className="absolute inset-0 m-auto h-72 w-72 rounded-full border border-gold-500/15"></div>
              <div className="absolute inset-0 m-auto h-52 w-52 rounded-full border border-gold-500/15"></div>

              <div className="relative z-10 mx-auto mb-10 mt-14 flex aspect-square w-3/4 items-center justify-center">
                <div className="relative h-full w-full rounded-2xl bg-gradient-to-br from-gold-300 via-gold-500 to-wine-600 p-2 shadow-glow">
                  <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-xl bg-navy-950/85 backdrop-blur">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 shadow-glow">
                      <Gem className="h-10 w-10 text-navy-950" />
                    </div>
                    <p className="font-display text-sm font-semibold uppercase tracking-[0.35em] text-gold-300">
                      {t("hero.brandBadge")}
                    </p>
                    <span className="rounded-full border border-gold-500/40 bg-gold-500/10 px-4 py-1 text-xs text-gold-300">
                      {t("hero.customProduction")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="relative z-10 flex items-center justify-center gap-8 pb-8 text-center">
                <div>
                  <p className="font-display text-xl font-bold text-white">100%</p>
                  <p className="text-[11px] uppercase tracking-widest text-slate-400">{t("hero.customSizing")}</p>
                </div>
                <div className="h-10 w-px bg-white/15"></div>
                <div>
                  <p className="font-display text-xl font-bold text-white">B2B</p>
                  <p className="text-[11px] uppercase tracking-widest text-slate-400">{t("hero.factoryDirect")}</p>
                </div>
                <div className="h-10 w-px bg-white/15"></div>
                <div>
                  <p className="font-display text-xl font-bold text-white">GST</p>
                  <p className="text-[11px] uppercase tracking-widest text-slate-400">{t("hero.invoiced")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Gold marquee strip */}
      <div className="relative mt-20 overflow-hidden border-y border-gold-500/20 bg-gradient-to-r from-navy-800/60 via-navy-900/40 to-navy-800/60 py-4 backdrop-blur">
        <div className="animate-marquee flex w-max items-center gap-10 whitespace-nowrap">
          {[...MARQUEE, ...MARQUEE].map(([Icon, key, color], i) => (
            <span
              key={i}
              className={`flex items-center gap-3 text-sm font-medium tracking-wide ${color}`}
            >
              <Icon className="h-4 w-4" /> {t(`hero.${key}`)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
