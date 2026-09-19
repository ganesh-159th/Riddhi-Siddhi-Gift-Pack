import { WaIcon, PhotosIcon } from "./icons.jsx";
import { useTranslation } from "react-i18next";
import { useRevealSelf } from "./Reveal.jsx";
import { BADGE_CLS, waLink } from "../lib/site-config.js";
import { imgsOf, imgUrl, imgSrcSet, webpSrcSet, quoteMsgFor, imgOnError, imgOnLoad } from "../lib/products.js";

export default function ProductCard({ product: p, index, onSelect }) {
  const { t } = useTranslation();
  const ref = useRevealSelf();
  const imgs = imgsOf(p);
  const msg = quoteMsgFor(p);
  const badges = p.badges || [];
  const specs = p.specs || [];

  return (
    <article
      ref={ref}
      onClick={() => onSelect && onSelect(p)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect && onSelect(p);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${p.name}`}
      className={`product-card reveal group cursor-pointer overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl transition hover:border-gold-500/40 focus-visible:outline-2 focus-visible:outline-gold-400 focus-visible:outline-offset-2 ${["", "reveal-delay-1", "reveal-delay-2", "reveal-delay-3"][index % 4]}`}
    >
      <div className="product-frame relative aspect-[4/3] overflow-hidden">
        <picture>
          <source type="image/webp" srcSet={imgs[0] && webpSrcSet(imgs[0])} />
          <img src={imgs[0] ? imgUrl(imgs[0]) : ""} alt={p.alt || p.name} width={400} height={300} srcSet={imgs[0] && imgSrcSet(imgs[0])} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 100vw" loading="lazy" decoding="async" onError={imgOnError} onLoad={imgOnLoad} className="img-lazy absolute inset-0 h-full w-full object-cover bg-navy-800 transition-opacity duration-300" />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/80 via-transparent to-transparent"></div>
        {badges.map((b, j) => (
          <span
            key={j}
            className={`absolute top-3 rounded-full px-3 py-1 text-[11px] font-bold ${j % 2 === 0 ? "left-3" : "right-3"} ${BADGE_CLS[b.style] || BADGE_CLS.gold}`}
          >
            {b.text}
          </span>
        ))}
        {imgs.length > 1 && (
          <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-navy-950/80 px-3 py-1 text-[11px] font-semibold text-gold-300 backdrop-blur">
            <PhotosIcon /> {imgs.length} {t("products.photos")}
          </span>
        )}
      </div>
      <div className="card-body">
        <h3 className="font-display font-bold text-white">{p.name}</h3>
        <p className="tagline mt-2 leading-relaxed text-slate-400">{p.tagline}</p>
        {specs.length ? (
          <ul className="mt-4 flex flex-wrap gap-2 text-[11px]">
            {specs.map((s, i) => (
              <li key={i} className="rounded-full bg-white/5 px-2.5 py-1 text-slate-300">{s}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[11px] italic text-slate-500">
            {t("products.noSpecs")}
          </p>
        )}
        <div className="card-actions">
          <a
            href={waLink(msg)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-whatsapp px-4 py-3 text-sm font-semibold text-navy-950 transition hover:brightness-110"
          >
            <WaIcon /> {t("products.getQuote")}
          </a>
        </div>
      </div>
    </article>
  );
}
