import Reveal, { useRevealSelf } from "./Reveal.jsx";
import { imgsOf, asset, imgOnError } from "../lib/products.js";

function GalleryItem({ product: p, imgIdx, index, onSelect }) {
  const ref = useRevealSelf();

  return (
    <figure
      ref={ref}
      data-img-index={imgIdx}
      onClick={() => onSelect(p, imgIdx)}
      className={`reveal ${["", "reveal-delay-1", "reveal-delay-2", "reveal-delay-3"][index % 4]} break-inside-avoid cursor-zoom-in overflow-hidden rounded-2xl border border-white/10 bg-white/5`}
    >
      <img
        src={asset(imgsOf(p)[imgIdx])}
        alt={p.name}
        loading="lazy"
        onError={imgOnError}
        className="w-full object-cover transition duration-500 hover:scale-105"
      />
    </figure>
  );
}

export default function Gallery({ products, onSelect }) {
  let n = 0;
  const items = [];
  products.forEach((p) => {
    imgsOf(p).forEach((_, imgIdx) => {
      items.push(<GalleryItem key={`${p.id}-${imgIdx}`} product={p} imgIdx={imgIdx} index={n++} onSelect={onSelect} />);
    });
  });

  return (
    <section id="gallery" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">Factory Gallery</p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white sm:text-4xl">
            Craftsmanship in <span className="text-gold-gradient">Every Detail</span>
          </h2>
          <p className="mt-4 text-slate-400">
            A glimpse of our packaging range — finishes, inserts and custom branding produced at
            our Hyderabad unit.
          </p>
        </Reveal>

        {items.length ? (
          <div className="gallery-grid mt-14">{items}</div>
        ) : (
          <div className="mt-14 rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
            <p className="text-sm text-slate-400">
              Gallery images are unavailable right now. Please refresh, or reach us on WhatsApp.
            </p>
            <a
              href="https://wa.me/919346797060"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-whatsapp px-6 py-3 text-sm font-semibold text-navy-950"
            >
              Chat on WhatsApp
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
