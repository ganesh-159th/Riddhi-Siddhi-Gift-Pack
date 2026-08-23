import { Briefcase } from "lucide-react";
import Reveal from "./Reveal.jsx";
import { WaIcon } from "./icons.jsx";

export default function Careers() {
  return (
    <section id="careers" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="relative overflow-hidden rounded-[2.5rem] border border-gold-500/25 bg-gradient-to-br from-wine-700 via-navy-900 to-navy-800 shadow-card">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(238,196,79,.28),transparent_50%),radial-gradient(circle_at_85%_85%,rgba(138,28,60,.45),transparent_55%)]"></div>

          <div className="relative z-10 grid items-center gap-10 p-8 sm:p-14 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-4 py-1.5 text-xs font-medium tracking-wide text-gold-300 backdrop-blur">
                <Briefcase className="h-3.5 w-3.5" /> Careers at Riddhi Siddhi
              </span>
              <h2 className="font-display mt-5 text-3xl font-bold leading-tight text-white sm:text-4xl">
                We're Hiring <span className="text-gold-gradient">Men &amp; Women</span> in Hyderabad
              </h2>
              <p className="mt-4 max-w-lg text-slate-300">
                Join our manufacturing team today. Stable work, timely salaries and a growing
                factory environment for residents of Hyderabad.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Box Making & Assembly", "Velvet & Foam Finishing", "Printing & Embossing"].map((r) => (
                  <span
                    key={r}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-slate-200 backdrop-blur"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-end">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-whatsapp/30 bg-whatsapp/15">
                    <WaIcon className="icon-em text-whatsapp" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">Apply via WhatsApp</p>
                    <p className="text-xs text-slate-400">Share your name, role &amp; experience</p>
                  </div>
                </div>
              </div>
              <a
                href="https://wa.me/919346797060"
                target="_blank"
                rel="noopener"
                className="sheen inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-7 py-3.5 font-semibold text-navy-950 shadow-glow transition hover:brightness-110"
              >
                <WaIcon /> Apply via WhatsApp
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
