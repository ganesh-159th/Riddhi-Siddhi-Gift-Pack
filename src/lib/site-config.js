export const SITE = {
  phone: "919346797060",
  defaultMsg:
    "Hello Riddhi Siddhi Gift & Pack, please share your product catalogue and B2B pricing.",
};

export const waLink = (text) =>
  "https://wa.me/" + SITE.phone + "?text=" + encodeURIComponent(text || SITE.defaultMsg);

export const waChat = () => "https://wa.me/" + SITE.phone;

export const telLink = () => "tel:+" + SITE.phone;

export const MAPS_EMBED_URL =
  "https://www.google.com/maps?q=Riddhi%20Siddhi%20Gift%20%26%20Pack%2C%209CMW%2BQW%2C%20Hyderabad&output=embed";

export const REVIEW_CID = "";

export const googleReviewUrl = () =>
  REVIEW_CID
    ? `https://g.page/r/${REVIEW_CID}/review`
    : "https://www.google.com/maps/search/?api=1&query=Riddhi+Siddhi+Gift+%26+Pack%2C+9CMW%2BQW+Hyderabad";

export const BADGE_CLS = {
  gold: "bg-gold-500 text-navy-950",
  wine: "bg-wine-500 text-white",
  ink: "bg-white/10 border border-white/15 text-white backdrop-blur",
};
