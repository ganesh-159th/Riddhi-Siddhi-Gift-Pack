const CONSENT_KEY = "rsp-consent";
const SCROLL_KEY = "rsp-scroll-fired";

export const CONSENT = {
  UNKNOWN: "unknown",
  GRANTED: "granted",
  DENIED: "denied",
};

const GA4_ID = import.meta.env.VITE_GA4_ID || "";
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || "";

export function getConsent() {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === CONSENT.GRANTED
      ? CONSENT.GRANTED
      : v === CONSENT.DENIED
        ? CONSENT.DENIED
        : CONSENT.UNKNOWN;
  } catch {
    return CONSENT.UNKNOWN;
  }
}

let analyticsLoaded = false;

function loadAnalytics() {
  if (analyticsLoaded) return;
  analyticsLoaded = true;

  if (GA4_ID) {
    // gtag.js is injected dynamically and marked async so it never blocks render.
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA4_ID;
    s.addEventListener("error", () => {
      analyticsLoaded = false;
    });
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA4_ID, { anonymize_ip: true });
    window.gtag("consent", "default", { analytics_storage: "granted" });
  }

  if (META_PIXEL_ID) {
    // Meta (Facebook) Pixel bootstrapped lazily — async and consent-gated.
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");
  }
}

export function setConsent(value) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Storage unavailable — still apply consent for this session.
  }
  if (value === CONSENT.GRANTED) loadAnalytics();
  trackEvent("consent_choice", { consent: value });
  return value;
}

function gtag() {
  if (typeof window.gtag === "function") window.gtag(...arguments);
}

export function trackEvent(name, params = {}) {
  try {
    gtag("event", name, params);
    if (typeof window.fbq === "function") {
      window.fbq("trackCustom", name, params);
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...params });
  } catch {
    // Tracking must never break the page.
  }
}

export function trackWhatsAppClick(label = "") {
  trackEvent("wa_click", { wa_label: label });
}

export function trackProductView(product) {
  trackEvent("product_view", {
    product_name: product?.name || "",
    product_id: product?.id || "",
  });
}

export function trackLeadSubmit(product = "") {
  trackEvent("lead_submit", { product });
}

export function trackScrollDepth() {
  const fired = new Set(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(SCROLL_KEY) || "[]");
      } catch {
        return [];
      }
    })()
  );
  const THRESHOLDS = [25, 50, 75, 100];

  const onScroll = () => {
    const doc = document.documentElement;
    const max = Math.max(doc.scrollHeight - window.innerHeight, 1);
    const pct = Math.round((window.scrollY / max) * 100);
    for (const t of THRESHOLDS) {
      if (pct >= t && !fired.has(t)) {
        fired.add(t);
        trackEvent("scroll_depth", { percent: t });
      }
    }
    try {
      localStorage.setItem(SCROLL_KEY, JSON.stringify([...fired]));
    } catch {
      // Non-fatal.
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  onScroll();
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  };
}

function waHref(anchor) {
  const href = anchor.getAttribute("href") || "";
  const lower = href.toLowerCase();
  if (lower.startsWith("https://wa.me") || lower.startsWith("http://wa.me")) return "wa.me";
  if (lower.startsWith("https://api.whatsapp.com") || lower.startsWith("http://api.whatsapp.com")) return "api.whatsapp.com";
  return "";
}

function closestLabel(anchor) {
  const el = anchor.closest("[data-track-label]");
  if (el) return el.getAttribute("data-track-label") || "";
  return anchor.textContent.trim().slice(0, 60);
}

export function trackWhatsAppLinks() {
  const onClick = (e) => {
    const anchor = e.target.closest ? e.target.closest("a") : null;
    if (!anchor) return;
    const kind = waHref(anchor);
    if (!kind) return;
    trackWhatsAppClick(kind + ":" + closestLabel(anchor));
  };
  document.addEventListener("click", onClick, { capture: true });
  return () => document.removeEventListener("click", onClick, { capture: true });
}

export function initAnalytics() {
  if (getConsent() === CONSENT.GRANTED) loadAnalytics();
}