import { BadgeCheck, ShieldCheck, FileText, Layers, Truck } from "lucide-react";
import Reveal from "./Reveal.jsx";

const TERMS = [
  {
    icon: FileText,
    title: "B2B Invoicing",
    text: "GST-compliant invoices issued for every business order, suitable for buyer accounts & procurement.",
  },
  {
    icon: Layers,
    title: "Minimum Order Quantities (MOQ)",
    text: "Transparent MOQs shared upfront on WhatsApp — ideal for jewellers stocking in bulk.",
  },
  {
    icon: Truck,
    title: "Direct Factory Delivery",
    text: "Stock leaves straight from our Hyderabad factory to your store or warehouse — fast and traceable.",
  },
];

export default function TrustLegal() {
  return (
    <section id="legal" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">Trust &amp; Compliance</p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white sm:text-4xl">
            A Registered, <span className="text-gold-gradient">Compliant Business</span>
          </h2>
          <p className="mt-4 text-slate-400">
            Clear terms, proper invoicing and a verified GST registration — so your procurement team
            can work with confidence.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* GSTIN verified */}
          <Reveal className="relative overflow-hidden rounded-3xl border border-gold-500/30 bg-gradient-to-br from-gold-500/10 to-transparent p-8 backdrop-blur-xl sm:p-10">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-500/15 blur-3xl"></div>
            <div className="flex items-start gap-4">
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-whatsapp to-emerald-500 shadow-glow">
                <BadgeCheck className="h-7 w-7 text-navy-950" />
                <span className="animate-ping-soft absolute -inset-1 -z-10 rounded-2xl bg-emerald-400/30"></span>
              </span>
              <div>
                <h3 className="font-display text-xl font-bold text-white">GST Registered &amp; Verified</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Fully registered under the Goods &amp; Services Tax. Valid GSTIN across all B2B
                  transactions.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <code className="rounded-xl border border-gold-500/40 bg-navy-950/70 px-4 py-2.5 font-mono text-sm font-semibold tracking-wider text-gold-300">
                36AFMPN3258E1ZB
              </code>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Verified
              </span>
            </div>
          </Reveal>

          {/* Terms stack */}
          <div className="grid gap-6">
            {TERMS.map((t, i) => (
              <Reveal
                key={t.title}
                delay={i}
                className="flex items-start gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition hover:border-gold-500/40"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-400/30 bg-gold-500/15">
                  <t.icon className="h-6 w-6 text-gold-300" />
                </span>
                <div>
                  <h3 className="font-semibold text-white">{t.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{t.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
