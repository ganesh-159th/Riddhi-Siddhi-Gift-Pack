import { useState } from "react";
import { Send, CheckCircle2, MapPin, Clock, Navigation } from "lucide-react";
import Reveal from "./Reveal.jsx";
import { WaIcon } from "./icons.jsx";
import { waLink } from "../lib/site-config.js";

const inputCls =
  "w-full rounded-xl border border-white/10 bg-navy-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-gold-500/60 focus:ring-2 focus:ring-gold-500/20";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-gold-300";

const URL_RE = /https?:\/\/|www\.|\b[a-z0-9-]+(\.[a-z0-9-]+)+\b/i;
const GARBAGE_RE = /(.)\1{4,}|[<>{}[\]\\^`|~@$%#*+=]/;
const SPAM_RE =
  /\b(viagra|casino|bitcoin|forex|seo|insurance|loan|crypto|porn|buy now|click here|free money|earn money|make money|xrp|fdgfi)\b/i;

export default function Contact({ products }) {
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("success");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [start, setStart] = useState(0);
  const [hpName, setHpName] = useState("");
  const [hpEmail, setHpEmail] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    product: "",
    quantity: "",
    message: "",
  });

  const set = (k) => (e) => {
    setStart((s) => (s === 0 ? Date.now() : s));
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const showStatus = (msg, type = "success") => {
    setStatus(msg);
    setStatusType(type);
    setTimeout(() => setStatus(""), 8000);
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    // Client-side spam guard: invisible honeypot fields must stay empty.
    if (hpName || hpEmail) return;

    // Client-side content filtering before anything goes anywhere.
    if (URL_RE.test(form.name) || GARBAGE_RE.test(form.name)) {
      showStatus("Please enter a valid business or contact name.", "error");
      return;
    }
    if (SPAM_RE.test(form.message) || GARBAGE_RE.test(form.message)) {
      showStatus("Your message looks like spam. Please rephrase and try again.", "error");
      return;
    }
    if (!/^[+0-9][0-9 ().-]{6,16}$/.test(form.phone)) {
      showStatus("Please enter a valid phone number.", "error");
      return;
    }

    setSubmitting(true);
    try {
      // Ask the server to validate + rate limit before we open WhatsApp.
      const res = await fetch("/.netlify/functions/submit-enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tf_fill_ms: Date.now() - start,
          tf_hp_name: hpName,
          tf_hp_email: hpEmail,
        }),
      });
      const result = await res.json().catch(() => ({}));

      if (!res.ok || result.honeypot) {
        showStatus(
          result.error || "Submission could not be completed. Please try again.",
          res.status === 429 ? "error" : "error"
        );
        setSubmitting(false);
        return;
      }

      // Only a verified human reaches here — hand off to WhatsApp.
      const lines = [
        "Hello Riddhi Siddhi Gift & Pack, new website enquiry:",
        "Name: " + (form.name || "-"),
        "Phone: " + (form.phone || "-"),
        form.product ? "Product: " + form.product : "",
        form.quantity ? "Quantity: " + form.quantity : "",
        "Message: " + (form.message || "-"),
      ]
        .filter(Boolean)
        .join("\n");
      window.open(waLink(lines), "_blank", "noopener");

      showStatus("Enquiry sent! WhatsApp is opening so we can reply instantly.");
      setSent(true);
      setStart(0);
      setForm({ name: "", phone: "", product: "", quantity: "", message: "" });
      setTimeout(() => setSent(false), 6000);
    } catch {
      showStatus("Network error — please check your connection and try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="contact" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">Get A Quote</p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white sm:text-4xl">
            Tell Us What You <span className="text-gold-gradient">Need</span>
          </h2>
          <p className="mt-4 text-slate-400">
            Share your requirement and we&apos;ll reply on WhatsApp with pricing, MOQ and delivery
            timelines.
          </p>
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-6xl items-start gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Reveal
              as="form"
              name="enquiry"
              method="POST"
              data-netlify="true"
              netlify-honeypot="bot-field"
              onSubmit={onSubmit}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-10"
            >
              <input type="hidden" name="form-name" value="enquiry" />
              {/* Netlify's built-in honeypot */}
              <p className="hidden">
                <label>
                  Don&apos;t fill this out: <input name="bot-field" tabIndex={-1} autoComplete="off" />
                </label>
              </p>
              {/* Invisible (CSS-hidden) honeypot fields — bots fill them, humans never see them */}
              <div className="absolute -left-[9999px] -top-[9999px] h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
                <label>
                  Website
                  <input
                    name="tf_hp_name"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={hpName}
                    onChange={(e) => setHpName(e.target.value)}
                  />
                </label>
                <label>
                  Email 2
                  <input
                    name="tf_hp_email"
                    type="email"
                    tabIndex={-1}
                    autoComplete="off"
                    value={hpEmail}
                    onChange={(e) => setHpEmail(e.target.value)}
                  />
                </label>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="cf-name" className={labelCls}>
                    Your Name *
                  </label>
                  <input
                    id="cf-name"
                    name="name"
                    type="text"
                    required
                    placeholder="e.g. Rahul Jewellers"
                    value={form.name}
                    onChange={set("name")}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="cf-phone" className={labelCls}>
                    Phone / WhatsApp *
                  </label>
                  <input
                    id="cf-phone"
                    name="phone"
                    type="tel"
                    required
                    placeholder="+91 ..."
                    value={form.phone}
                    onChange={set("phone")}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="cf-product" className={labelCls}>
                    Product Interest
                  </label>
                  <select
                    id="cf-product"
                    name="product"
                    value={form.product}
                    onChange={set("product")}
                    className={`${inputCls} appearance-none [&>option]:bg-navy-900`}
                  >
                    <option value="">Select a product…</option>
                    {products.map((p) => (
                      <option key={p.id || p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                    <option value="Something else / custom design">Something else / custom design</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="cf-qty" className={labelCls}>
                    Approx. Quantity
                  </label>
                  <input
                    id="cf-qty"
                    name="quantity"
                    type="text"
                    placeholder="e.g. 500 pieces"
                    value={form.quantity}
                    onChange={set("quantity")}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="cf-msg" className={labelCls}>
                  Message *
                </label>
                <textarea
                  id="cf-msg"
                  name="message"
                  rows="4"
                  required
                  placeholder="Box types, sizes, branding requirements, delivery city…"
                  value={form.message}
                  onChange={set("message")}
                  className={`${inputCls} resize-y`}
                ></textarea>
              </div>

              {status && (
                <div
                  className={
                    "mt-4 rounded-xl border px-4 py-3 text-sm " +
                    (statusType === "error"
                      ? "border-red-400/30 bg-red-500/10 text-red-300"
                      : "border-emerald-400/30 bg-emerald-500/10 text-emerald-300")
                  }
                  role={statusType === "error" ? "alert" : "status"}
                >
                  {status}
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={sent || submitting}
                  aria-live="polite"
                  className="sheen inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-6 py-3.5 font-semibold text-navy-950 shadow-glow transition hover:brightness-110 disabled:opacity-70"
                >
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">Checking…</span>
                  ) : sent ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Sent!
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> Send Enquiry
                    </>
                  )}
                </button>
                <a
                  href={waLink("Hello Riddhi Siddhi Gift & Pack, I'd like to discuss a bulk order.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-whatsapp/40 bg-whatsapp/10 px-6 py-3.5 font-semibold text-whatsapp transition hover:bg-whatsapp/20"
                >
                  <WaIcon /> Chat Instead
                </a>
              </div>
              <p className="mt-4 text-center text-[11px] text-slate-400">
                Your enquiry is sent to our WhatsApp Business — expect a reply within working hours.
              </p>
            </Reveal>
          </div>

          {/* Location / Map */}
          <Reveal as="aside" delay={1} className="flex flex-col gap-6 lg:col-span-2">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-card backdrop-blur-xl">
              <iframe
                title="Riddhi Siddhi Gift & Pack location on Google Maps"
                src="https://www.google.com/maps?q=Riddhi%20Siddhi%20Gift%20%26%20Pack%2C%20Hyderabad&output=embed"
                className="map-dark block h-64 w-full border-0 sm:h-80"
                loading="lazy"
                allowfullscreen
                referrerPolicy="no-referrer-when-downgrade"
              ></iframe>
            </div>

            <div className="flex-1 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
              <h3 className="font-display text-xl font-bold text-white">
                Visit Our <span className="text-gold-gradient">Factory</span>
              </h3>
              <ul className="mt-5 space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                  <span className="text-slate-300">
                    Plus Code <code className="font-mono font-semibold text-gold-300">9CMW+QW</code>,
                    Hyderabad, Telangana, India
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                  <span className="text-slate-300">Mon – Sat · 9:30 AM – 7:00 PM</span>
                </li>
              </ul>
              <a
                href="https://maps.app.goo.gl/YxEgkFFrhVhBpqjB7"
                target="_blank"
                rel="noopener noreferrer"
                className="sheen mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-6 py-3.5 font-semibold text-navy-950 transition hover:brightness-110"
              >
                <Navigation className="h-4 w-4" /> Get Directions
              </a>
              <p className="mt-3 text-center text-[11px] text-slate-400">
                Factory visits by appointment — message us on WhatsApp first.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
