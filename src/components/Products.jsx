import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import Reveal from "./Reveal.jsx";
import ProductCard from "./ProductCard.jsx";
import { waLink } from "../lib/site-config.js";
import { buildItemListSchema, injectJsonLd, removeJsonLd } from "../lib/schema.js";

const PRODUCTS_SCHEMA_ID = "rs-schema-products";

function Skeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-3xl border border-white/10 bg-white/5">
      <div className="aspect-[4/3] bg-white/10"></div>
      <div className="space-y-3 p-6">
        <div className="h-4 w-2/3 rounded bg-white/10"></div>
        <div className="h-3 w-full rounded bg-white/10"></div>
        <div className="h-3 w-5/6 rounded bg-white/10"></div>
        <div className="h-10 w-full rounded-full bg-white/10"></div>
      </div>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="product-grid mt-14">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="col-span-full mt-14 rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
      <p className="text-sm text-slate-400">{t("products.loadErrorRetry")}</p>
      <button
        onClick={onRetry}
        className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-navy-950 transition hover:brightness-110"
      >
        <RefreshCw className="h-4 w-4" /> {t("products.retry")}
      </button>
      <p className="mt-5 text-xs text-slate-500">
        {t("products.reachDirectly")}{" "}
        <a href={waLink()} target="_blank" rel="noopener noreferrer" className="text-whatsapp underline">
          WhatsApp
        </a>.
      </p>
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="col-span-full mt-14 rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
      <p className="text-sm text-slate-400">{t("products.emptyState")}</p>
      <a
        href={waLink()}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-whatsapp px-6 py-3 text-sm font-semibold text-navy-950"
      >
        {t("products.chatWhatsApp")}
      </a>
    </div>
  );
}

export default function Products({ products, state = "ready", onRetry, onSelect }) {
  const { t } = useTranslation();

  useEffect(() => {
    if (state === "ready" && products.length > 0) {
      injectJsonLd(buildItemListSchema(products), PRODUCTS_SCHEMA_ID);
    } else {
      removeJsonLd(PRODUCTS_SCHEMA_ID);
    }
    return () => removeJsonLd(PRODUCTS_SCHEMA_ID);
  }, [state, products]);

  return (
    <section id="products" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">{t("products.sectionLabel")}</p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white sm:text-4xl">
            {t("products.title1")}<span className="text-gold-gradient">{t("products.title2")}</span>{t("products.title3")}
          </h2>
          <p className="mt-4 text-slate-400">
            {t("products.subtitle")}
          </p>
        </Reveal>

        {state === "loading" && <LoadingGrid />}

        {state === "error" && <ErrorState onRetry={onRetry} />}

        {state === "ready" && !products.length && <EmptyState />}

        {state === "ready" && products.length > 0 && (
          <div className="product-grid mt-14">
            {products.map((p, i) => (
              <ProductCard key={p.id || i} product={p} index={i} onSelect={onSelect} />
            ))}
          </div>
        )}

        <Reveal className="mt-12 text-center" delay={1}>
          <a
            href={waLink(t("waMessages.customQuote"))}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-500/10 px-6 py-3 text-sm font-semibold text-gold-300 backdrop-blur transition hover:bg-gold-500/20"
          >
            {t("products.customQuote")}
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}