import {
  Factory,
  Ruler,
  Sparkles,
  Truck,
  MessagesSquare,
  Package,
  Hammer,
  ShieldCheck,
} from "lucide-react";
import Reveal from "./Reveal.jsx";
import { WaIcon } from "./icons.jsx";

const STRENGTHS = [
  {
    icon: Factory,
    title: "Direct Factory Pricing",
    text: "No middlemen. Deal straight with the manufacturing unit and get honest, transparent bulk rates.",
  },
  {
    icon: Ruler,
    title: "Custom Dimensions",
    text: "Build boxes to your exact measurements — perfect fit for every ring, pendant, chain and heavy set.",
  },
  {
    icon: Sparkles,
    title: "Premium Finish",
    text: "Velvet, leatherette and rigid paper construction with soft-touch interiors and crisp edges.",
  },
  {
    icon: Truck,
    title: "Fast Bulk Delivery",
    text: "Reliable dispatch across Hyderabad and all major cities in India, on schedule every time.",
  },
];

const STEPS = [
  {
    icon: MessagesSquare,
    title: "Consultation & Sample",
    text: "Share your requirement on WhatsApp. We guide you on sizes, materials and finish, then confirm a sample.",
  },
  {
    icon: Package,
    title: "Material Selection",
    text: "Velvet, leatherette or rigid paper — selected to match your brand aesthetic and jewellery type.",
  },
  {
    icon: Hammer,
    title: "Custom Production",
    text: "Precision cutting, foaming, gluing and finishing on your exact dimensions with your logo and artwork.",
  },
  {
    icon: ShieldCheck,
    title: "Quality Inspection",
    text: "Every batch is checked for finish, alignment and durability before it reaches the packing line.",
  },
  {
    icon: Truck,
    title: "Bulk Delivery",
    text: "Secure packing and on-time dispatch to Hyderabad, Telangana and across India.",
  },
];

export default function Process() {
  return (
    <section id="process" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">Why Choose Us</p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white sm:text-4xl">
            Manufacturing &amp; <span className="text-gold-gradient">B2B Strengths</span>
          </h2>
          <p className="mt-4 text-slate-400">
            A dedicated in-house manufacturing unit built for jewellers who demand quality, speed
            and consistency.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STRENGTHS.map((s, i) => (
            <Reveal key={s.title} delay={i} className="group rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur-xl transition hover:border-gold-500/40 hover:bg-white/10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 shadow-glow transition group-hover:scale-110">
                <s.icon className="h-7 w-7 text-navy-950" />
              </div>
              <h3 className="font-display mt-5 text-lg font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.text}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-16 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl sm:p-12">
          <div className="grid items-start gap-10 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">Our Process</p>
              <h3 className="font-display mt-3 text-2xl font-bold text-white sm:text-3xl">
                From Sample to <span className="text-gold-gradient">Bulk Delivery</span>
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                A disciplined, step-by-step production line that keeps your order on track.
              </p>
              <a
                href="https://wa.me/919346797060"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-whatsapp px-6 py-3 text-sm font-semibold text-navy-950 transition hover:brightness-110"
              >
                <WaIcon /> Discuss Your Order
              </a>
            </div>

            <ol className="relative grid gap-8 lg:col-span-2">
              <span className="absolute bottom-2 left-[23px] top-2 hidden w-px bg-gradient-to-b from-gold-500/60 via-gold-500/25 to-transparent sm:block"></span>

              {STEPS.map((step) => (
                <li key={step.title} className="relative flex gap-5">
                  <span className="z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold-500/40 bg-navy-900 shadow-glow">
                    <step.icon className="h-5 w-5 text-gold-400" />
                  </span>
                  <div>
                    <h4 className="font-semibold text-white">{step.title}</h4>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
