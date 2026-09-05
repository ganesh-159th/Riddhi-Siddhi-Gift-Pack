import { useEffect, useState } from "react";
import { Gem, Menu, X } from "lucide-react";
import { WaIcon } from "./icons.jsx";
import { waLink } from "../lib/site-config.js";

const NAV_LINKS = [
  ["#home", "Home"],
  ["#products", "Products"],
  ["#gallery", "Gallery"],
  ["#process", "Manufacturing Process"],
  ["#careers", "Job Hiring"],
  ["#contact", "Contact"],
];

const WA_ENQUIRE_MSG =
  "Hello Riddhi Siddhi Gift & Pack, I'd like to enquire about your premium jewellery boxes.";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`navbar fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? "nav-scrolled" : ""}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center justify-between gap-4 py-4" aria-label="Main navigation">
          <a href="#home" className="group flex items-center gap-2 sm:gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 via-gold-500 to-wine-600 shadow-glow min-[420px]:h-11 min-[420px]:w-11 min-[420px]:rounded-2xl">
              <Gem className="h-5 w-5 text-navy-950 min-[420px]:h-6 min-[420px]:w-6" />
              <div className="absolute -inset-1 -z-10 rounded-2xl bg-gold-500/40 opacity-0 blur-md transition-opacity group-hover:opacity-100"></div>
            </div>
            <div className="leading-tight">
              <p className="font-display text-base font-bold tracking-wide text-white min-[420px]:text-lg">
                Riddhi <span className="text-gold-gradient">Siddhi</span>
              </p>
              <p className="hidden text-[10px] uppercase tracking-[0.28em] text-gold-300/80 min-[420px]:block">
                Jewellery Box Manufacturer
              </p>
            </div>
          </a>

          <ul className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map(([href, label]) => (
              <li key={href}>
                <a href={href} className="rounded-full px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-gold-300">
                  {label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <a
              href={waLink(WA_ENQUIRE_MSG)}
              target="_blank"
              rel="noopener noreferrer"
              className="animate-pulse-glow relative hidden items-center gap-2 rounded-full bg-whatsapp px-5 py-2.5 text-sm font-semibold text-navy-950 transition hover:brightness-110 sm:inline-flex"
            >
              <WaIcon /> WhatsApp Enquire
            </a>
            <button
              onClick={() => setOpen(!open)}
              className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-white backdrop-blur transition hover:bg-white/10 lg:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>
      </div>

      <div
        id="mobile-menu"
        role="region"
        aria-label="Mobile navigation"
        className={`mx-4 overflow-hidden rounded-2xl border border-white/10 bg-navy-900/95 shadow-card backdrop-blur-xl lg:hidden ${
          open ? "block" : "hidden"
        }`}
      >
        <ul className="flex flex-col p-4">
          {NAV_LINKS.map(([href, label]) => (
            <li key={href}>
              <a
                href={href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-3 text-slate-200 transition hover:bg-white/5 hover:text-gold-300"
              >
                {label}
              </a>
            </li>
          ))}
          <li className="mt-2 border-t border-white/10 pt-2">
            <a
              href={waLink(WA_ENQUIRE_MSG)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-whatsapp px-4 py-3 font-semibold text-navy-950"
            >
              <WaIcon /> WhatsApp Enquire
            </a>
          </li>
        </ul>
      </div>
    </header>
  );
}
