import { useCallback, useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { WaIcon } from "./icons.jsx";
import { BADGE_CLS, waLink } from "../lib/site-config.js";
import { imgsOf, asset, quoteMsgFor } from "../lib/products.js";

export default function ProductModal({ product, startImage = 0, onClose }) {
  const [index, setIndex] = useState(startImage);
  const imgs = imgsOf(product);

  const step = useCallback(
    (dir) => {
      if (!product || !imgs.length) return;
      setIndex((i) => (i + dir + imgs.length) % imgs.length);
    },
    [product, imgs.length]
  );

  useEffect(() => {
    if (product) setIndex(startImage);
  }, [product, startImage]);

  useEffect(() => {
    if (!product) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [product, onClose, step]);

  if (!product) return null;

  const img = imgs[index] || "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-navy-950/95 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Product details"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-navy-900 shadow-card sm:max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full border border-white/15 bg-navy-950/70 p-3 text-white transition hover:bg-white/15"
          aria-label="Close product details"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1.2fr_1fr] lg:overflow-hidden">
          {/* Gallery */}
          <div className="flex min-h-0 flex-col p-5 pb-2 sm:p-8 sm:pb-3 lg:border-r lg:border-white/10 lg:pb-8 xl:p-10 xl:pb-4">
            <div className="relative h-[36vh] w-full shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] sm:h-[42vh] lg:h-auto lg:min-h-0 lg:flex-1">
              <img
                src={asset(img)}
                alt={product.name + " — photo " + (index + 1)}
                onClick={() => step(1)}
                className="absolute inset-0 m-auto max-h-full max-w-full cursor-zoom-in object-contain p-2"
              />
              <button
                onClick={() => step(-1)}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-navy-950/80 p-3 text-white transition hover:bg-navy-950"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => step(1)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-navy-950/80 p-3 text-white transition hover:bg-navy-950"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <span className="absolute bottom-3 right-3 rounded-full bg-navy-950/85 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-gold-300">
                {index + 1} / {imgs.length}
              </span>
            </div>
            <div className="mt-4 flex shrink-0 flex-wrap gap-2.5">
              {imgs.map((src, j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => setIndex(j)}
                  aria-label={"Photo " + (j + 1)}
                  className={`h-14 w-14 overflow-hidden rounded-lg border transition hover:opacity-100 sm:h-16 sm:w-16 xl:h-20 xl:w-20 ${
                    j === index ? "border-gold-500 opacity-100" : "border-white/15 opacity-60"
                  }`}
                >
                  <img src={asset(src)} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Details */}
          <div className="flex min-h-0 flex-col gap-7 overflow-y-auto p-5 pt-2 sm:p-8 sm:pt-4 lg:pt-8 xl:p-10 xl:pt-8">
            <div>
              <div className="flex flex-wrap gap-2">
                {(product.badges || []).map((b, i) => (
                  <span key={i} className={`rounded-full px-3 py-1 text-[11px] font-bold ${BADGE_CLS[b.style] || BADGE_CLS.gold}`}>
                    {b.text}
                  </span>
                ))}
              </div>
              <h3 className="pm-name font-display mt-5 font-bold leading-tight text-white">{product.name}</h3>
              <p className="pm-tagline mt-4 leading-relaxed text-slate-400">{product.tagline || ""}</p>
              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">Highlights</p>
              <ul className="mt-3 flex flex-wrap gap-2.5 text-xs">
                {(product.specs || []).map((s, i) => (
                  <li key={i} className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-slate-300">
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-auto border-t border-white/10 pt-6">
              <a
                href={waLink(quoteMsgFor(product))}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2.5 rounded-full bg-whatsapp px-4 py-4 text-base font-semibold text-navy-950 transition hover:brightness-110"
              >
                <WaIcon /> Have a query? Chat on WhatsApp
              </a>
              <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
                Factory-direct B2B pricing · Bulk orders · Custom sizes
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
