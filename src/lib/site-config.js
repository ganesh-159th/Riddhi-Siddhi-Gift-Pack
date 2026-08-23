export const SITE = {
  phone: "919346797060",
  defaultMsg:
    "Hello Riddhi Siddhi Gift & Pack, please share your product catalogue and B2B pricing.",
};

export const waLink = (text) =>
  "https://wa.me/" + SITE.phone + "?text=" + encodeURIComponent(text || SITE.defaultMsg);

export const waChat = () => "https://wa.me/" + SITE.phone;

export const telLink = () => "tel:+" + SITE.phone;

export const BADGE_CLS = {
  gold: "bg-gold-500 text-navy-950",
  wine: "bg-wine-500 text-white",
  ink: "bg-white/10 border border-white/15 text-white backdrop-blur",
};
