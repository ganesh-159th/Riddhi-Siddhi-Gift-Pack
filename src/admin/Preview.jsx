import { useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { BADGE_CLS, waLink } from "../lib/site-config.js";
import { imgOnError, isScheduled } from "../lib/products.js";

// Preview mode (issue #21): renders the local draft exactly the way the live
// site does — navy stage, product cards + detail modal — using the same
// markup/classes as src/components/ProductCard.jsx / ProductModal.jsx, so the
// admin can see exactly what visitors will see before hitting Publish. Photos
// uploaded but not yet on the CDN are resolved to their local copy via
// `resolveImg` (a data URI), so the preview is accurate even mid-upload.

const dateLabel = (iso) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const imgsOf = (p) => (p.images && p.images.length ? p.images : [p.image]).filter(Boolean);

export default function Preview({ products, resolveImg, onClose }) {
  const [selected, setSelected] = useState(null); // { product, index }
  const now = new Date();
  const scheduledIds = new Set(
    (products || []).filter((p) => isScheduled(p, now)).map((p) => p.id)
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-navy-950">
      {/* Preview chrome (kept out of the scrollable stage) */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-navy-900/90 px-4 py-3 backdrop-blur sm:px-6">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">
          <span className="inline-block h-2 w-2 rounded-full bg-gold-500" />
          Preview — product changes, not yet published
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15 active:scale-95"
        >
          <X className="h-3.5 w-3.5" /> Close preview
        </button>
      </div>

      {/* Site-style stage */}
      <div className="flex-1 overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 -top-40 h-[520px] w-[520px] rounded-full bg-gold-500/10 blur-[140px]"></div>
          <div className="absolute -right-40 top-1/3 h-[560px] w-[560px] rounded-full bg-wine-500/20 blur-[160px]"></div>
          <div className="absolute bottom-0 left-1/4 h-[480px] w-[480px] rounded-full bg-navy-700/50 blur-[140px]"></div>
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
              Our Products
            </h2>
            <p className="mt-3 text-slate-400">
              Handmade gift &amp; packaging boxes, produced in Hyderabad.
            </p>
          </div>

          {!products || !products.length ? (
            <p className="mt-14 text-center text-sm text-slate-400">
              No products in the draft yet — preview would be empty.
            </p>
          ) : (
            <div className="product-grid mt-12">
              {products.map((p) => {
                const imgs = imgsOf(p);
                return (
                  <article
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Preview details for ${p.name}`}
                    onClick={() => setSelected({ product: p, index: 0 })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected({ product: p, index: 0 });
                      }
                    }}
                    className="product-card group cursor-pointer overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl transition hover:border-gold-500/40"
                  >
                    <div className="product-frame relative aspect-[4/3] overflow-hidden bg-navy-800">
                      <img
                        src={resolveImg(imgs[0])}
                        alt={p.name}
                        onError={imgOnError}
                        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-navy-950/80 via-transparent to-transparent"></div>
                      {(p.badges || []).map((b, j) => (
                        <span
                          key={j}
                          className={`absolute top-3 rounded-full px-3 py-1 text-[11px] font-bold ${j % 2 === 0 ? "left-3" : "right-3"} ${BADGE_CLS[b.style] || BADGE_CLS.gold}`}
                        >
                          {b.text}
                        </span>
                      ))}
                      {imgs.length > 1 && (
                        <span className="absolute bottom-3 right-3 rounded-full bg-navy-950/80 px-3 py-1 text-[11px] font-semibold text-gold-300 backdrop-blur">
                          {imgs.length} photos
                        </span>
                      )}
                      {scheduledIds.has(p.id) && p.publishAt && (
                        <span className="absolute bottom-3 left-3 rounded-full bg-ink/80 px-3 py-1 text-[11px] font-semibold text-cream backdrop-blur">
                          Scheduled · {dateLabel(p.publishAt)}
                        </span>
                      )}
                    </div>
                    <div className="card-body">
                      <h3 className="font-display font-bold text-white">{p.name}</h3>
                      <p className="mt-2 leading-relaxed text-slate-400">{p.tagline}</p>
                      {(p.specs || []).length ? (
                        <ul className="mt-4 flex flex-wrap gap-2 text-[11px]">
                          {(p.specs || []).map((s, i) => (
                            <li key={i} className="rounded-full bg-white/5 px-2.5 py-1 text-slate-300">
                              {s}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-4 text-[11px] italic text-slate-500">No specs added</p>
                      )}
                      <div className="card-actions">
                        <a
                          href={waLink(`Hello, I'm interested in ${p.name}.`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex w-full items-center justify-center gap-2 rounded-full bg-whatsapp px-4 py-3 text-sm font-semibold text-navy-950 transition hover:brightness-110"
                        >
                          Get Quote
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <p className="mt-12 text-center text-xs text-slate-500">
            Cards marked <span className="font-semibold text-gold-300">Scheduled</span> will only appear
            on the live site after their publish date.
          </p>
        </div>
      </div>

      {/* Detail modal preview */}
      {selected && (
        <PreviewModal
          product={selected.product}
          startIndex={selected.index}
          resolveImg={resolveImg}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function PreviewModal({ product, startIndex, resolveImg, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const imgs = imgsOf(product);
  const step = (dir) => setIndex((i) => (i + dir + imgs.length) % imgs.length);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-navy-950/95 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${product.name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-navy-900 shadow-card sm:max-w-2xl md:max-w-3xl lg:max-w-5xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full border border-white/15 bg-navy-950/70 p-3 text-white transition hover:bg-white/15"
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1.2fr_1fr] lg:overflow-hidden">
          <div className="flex min-h-0 flex-col p-5 pb-2 sm:p-8 sm:pb-3 lg:border-r lg:border-white/10 lg:pb-8">
            <div className="relative h-[36vh] w-full shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] sm:h-[42vh] lg:h-auto lg:flex-1">
              <img
                src={resolveImg(imgs[index])}
                alt={product.name + " photo " + (index + 1)}
                onError={imgOnError}
                className="absolute inset-0 m-auto max-h-full max-w-full object-contain p-2"
              />
              {imgs.length > 1 && (
                <>
                  <button
                    onClick={() => step(-1)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-navy-950/80 p-3 text-white transition hover:bg-navy-950"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => step(1)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-navy-950/80 p-3 text-white transition hover:bg-navy-950"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <span className="absolute bottom-3 right-3 rounded-full bg-navy-950/85 px-3.5 py-1.5 text-xs font-semibold text-gold-300">
                    {index + 1} / {imgs.length}
                  </span>
                </>
              )}
            </div>
            <div className="mt-4 flex shrink-0 flex-wrap gap-2.5">
              {imgs.map((src, j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => setIndex(j)}
                  className={`h-14 w-14 overflow-hidden rounded-lg border transition sm:h-16 sm:w-16 ${
                    j === index ? "border-gold-500 opacity-100" : "border-white/15 opacity-60"
                  }`}
                >
                  <img
                    src={resolveImg(src)}
                    alt=""
                    onError={imgOnError}
                    className="h-full w-full object-cover bg-navy-800"
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-7 overflow-y-auto p-5 pt-2 sm:p-8 sm:pt-4 lg:pt-8">
            <div>
              <div className="flex flex-wrap gap-2">
                {(product.badges || []).length ? (
                  (product.badges || []).map((b, i) => (
                    <span key={i} className={`rounded-full px-3 py-1 text-[11px] font-bold ${BADGE_CLS[b.style] || BADGE_CLS.gold}`}>
                      {b.text}
                    </span>
                  ))
                ) : (
                  <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${BADGE_CLS.gold}`}>B2B</span>
                )}
              </div>
              <h3 className="font-display mt-5 font-bold leading-tight text-white">{product.name}</h3>
              <p className="mt-4 leading-relaxed text-slate-400">{product.tagline || ""}</p>
              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">Highlights</p>
              {(product.specs || []).length ? (
                <ul className="mt-3 flex flex-wrap gap-2.5 text-xs">
                  {(product.specs || []).map((s, i) => (
                    <li key={i} className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-slate-300">
                      {s}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm italic text-slate-500">No highlights added</p>
              )}
            </div>

            <div className="mt-auto border-t border-white/10 pt-6">
              <a
                href={waLink(`Hello, I'm interested in ${product.name}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2.5 rounded-full bg-whatsapp px-4 py-4 text-base font-semibold text-navy-950 transition hover:brightness-110"
              >
                Get Quote
              </a>
              <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
                Factory-direct B2B pricing on bulk orders.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}