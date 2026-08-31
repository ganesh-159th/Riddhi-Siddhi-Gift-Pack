import { Gem, ShieldCheck, UserRound, Phone, MapPin } from "lucide-react";
import { WaIcon } from "./icons.jsx";
import { waLink } from "../lib/site-config.js";

const QUICK_LINKS = [
  ["#home", "Home"],
  ["#products", "Products"],
  ["#gallery", "Gallery"],
  ["#process", "Manufacturing Process"],
  ["#contact", "Get A Quote"],
  ["#faq", "FAQ"],
  ["#legal", "Legal Info"],
];

export default function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-navy-950/60 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 via-gold-500 to-wine-600 shadow-glow">
                <Gem className="h-6 w-6 text-navy-950" />
              </div>
              <div className="leading-tight">
                <p className="font-display text-lg font-bold text-white">
                  Riddhi <span className="text-gold-gradient">Siddhi</span> Gift &amp; Pack
                </p>
                <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/80">
                  Jewellery Box Manufacturer
                </p>
              </div>
            </div>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-400">
              Premium jewellery packaging manufacturer serving jewellers and brands across India.
              Custom production, bulk orders and factory-direct pricing from Hyderabad, Telangana.
            </p>
            <div className="mt-6 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur sm:w-fit">
              <ShieldCheck className="h-5 w-5 text-gold-400" />
              <p className="text-sm text-slate-300">
                GSTIN:{" "}
                <code className="font-mono font-semibold text-gold-300">36AFMPN3258E1ZB</code>
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-400">Quick Links</h4>
            <ul className="mt-5 space-y-3 text-sm">
              {QUICK_LINKS.map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="text-slate-400 transition hover:text-gold-300">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-400">Contact</h4>
            <ul className="mt-5 space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                <span className="text-slate-300">Bhagyanarayan Das</span>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                <a href="tel:+919346797060" className="text-slate-300 transition hover:text-gold-300">
                  +91 93467 97060
                </a>
              </li>
              <li className="flex items-start gap-3">
                <WaIcon className="icon-em mt-0.5 text-gold-400" />
                <a
                  href="https://wa.me/919346797060"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-300 transition hover:text-gold-300"
                >
                  WhatsApp Business
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                <a
                  href="https://maps.app.goo.gl/YxEgkFFrhVhBpqjB7"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-300 transition hover:text-gold-300"
                >
                  Hyderabad, Telangana, India
                  <span className="block text-xs text-slate-500">
                    Plus Code: 9CMW+QW · Find Us on Google Maps
                  </span>
                </a>
              </li>
            </ul>
            <a
              href={waLink("Hello Riddhi Siddhi Gift & Pack, I'd like to place a bulk order.")}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-whatsapp px-5 py-3 text-sm font-semibold text-navy-950 transition hover:brightness-110"
            >
              <WaIcon /> Start a Bulk Order
            </a>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs text-slate-500 sm:flex-row">
          <p>&copy; 2026 Riddhi Siddhi Gift &amp; Pack. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <Gem className="h-3.5 w-3.5 text-gold-500" /> Crafted with pride in Hyderabad, India
          </p>
        </div>
      </div>
    </footer>
  );
}
