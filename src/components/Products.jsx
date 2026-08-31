import { ArrowUpRight } from "lucide-react";
import Reveal from "./Reveal.jsx";
import ProductCard from "./ProductCard.jsx";
import { waLink } from "../lib/site-config.js";

export default function Products({ products, onSelect }) {
  return (
    <section id="products" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">Products Showcase</p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white sm:text-4xl">
            Premium Jewellery <span className="text-gold-gradient">Packaging</span> Range
          </h2>
          <p className="mt-4 text-slate-400">
            Factory-made, custom-dimensioned and finished to jeweller-grade quality. Every box,
            engineered for your brand.
          </p>
        </Reveal>

        <div className="product-grid mt-14">
          {products.map((p, i) => (
            <ProductCard key={p.id || i} product={p} index={i} onSelect={onSelect} />
          ))}
        </div>

        {!products.length && (
          <div className="col-span-full mt-10 rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
            <p className="text-sm text-slate-400">
              Could not load the product list. Please refresh, or reach us directly on WhatsApp.
            </p>
            <a
              href={waLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-whatsapp px-6 py-3 text-sm font-semibold text-navy-950"
            >
              Chat on WhatsApp
            </a>
          </div>
        )}

        <Reveal className="mt-12 text-center" delay={1}>
          <a
            href={waLink(
              "Hello, I need a custom jewellery box quotation that is not listed above. Please help."
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-500/10 px-6 py-3 text-sm font-semibold text-gold-300 backdrop-blur transition hover:bg-gold-500/20"
          >
            Need a different box? Ask for a custom quotation
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
