import { ChevronDown } from "lucide-react";
import Reveal from "./Reveal.jsx";

const FAQS = [
  {
    q: "What is your minimum order quantity (MOQ)?",
    a: "MOQs vary by box type and customisation level — typically starting from 100–500 pieces for standard designs. Share your requirement on WhatsApp and we'll confirm the exact MOQ and slab pricing upfront.",
  },
  {
    q: "Can you print or emboss our jewellery brand logo?",
    a: "Yes. We offer foil stamping, embossing, debossing and full-colour printing of your logo, monogram or artwork in your brand colours. Send us your logo file to receive design mockups before production.",
  },
  {
    q: "Where do you deliver, and what are the timelines?",
    a: "We ship across India directly from our Hyderabad factory. Standard production takes 7–15 working days depending on quantity and customisation, plus transit time. Express options are available for urgent orders.",
  },
  {
    q: "What materials and finishes do you work with?",
    a: "Rigid paper board, leatherette, velvet, satin and foam inserts. Every interior is engineered to cradle delicate pieces — rings, necklaces, bangles and heavy bridal sets — without scratching.",
  },
  {
    q: "Can we see samples before confirming a bulk order?",
    a: "Absolutely. We can produce a pre-production sample of your custom design so you can check size, material and finish. Sample cost is adjusted against your bulk order confirmation.",
  },
  {
    q: "Do you provide GST invoices for business purchases?",
    a: "Yes — we are fully GST registered (GSTIN: 36AFMPN3258E1ZB) and issue proper tax invoices for every B2B order, suitable for your accounting and procurement records.",
  },
  {
    q: "How do I get a quotation?",
    a: "Use the enquiry form above or message us on WhatsApp at +91 93467 97060 with your box types, quantities and branding needs — you'll receive pricing, MOQ and delivery estimates, usually the same day.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">Frequently Asked</p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white sm:text-4xl">
            Questions, <span className="text-gold-gradient">Answered</span>
          </h2>
          <p className="mt-4 text-slate-400">
            Everything jewellers usually ask before placing their first bulk order with us.
          </p>
        </Reveal>

        <div className="mx-auto mt-12 max-w-3xl space-y-3">
          {FAQS.map((f, i) => (
            <Reveal
              key={i}
              as="details"
              delay={Math.min(i, 3)}
              className="group rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl transition hover:border-gold-500/30 open:border-gold-500/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold text-white [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-gold-400 transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
