export const SITE_URL = "https://dd4hzdnwrj3px.cloudfront.net";
export const ORG_NAME = "Riddhi Siddhi Gift & Pack";

export const assetUrl = (p) => SITE_URL + "/" + String(p || "").replace(/^\//, "");

export const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": SITE_URL + "/#organization",
  name: ORG_NAME,
  url: SITE_URL + "/",
  logo: assetUrl("favicon.svg"),
  image: assetUrl("images/og-cover.jpg"),
  description:
    "Premium jewellery box manufacturer serving jewellers and brands across India with custom production, bulk orders and factory-direct pricing.",
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+919346797060",
    contactType: "sales",
    areaServed: "IN",
    availableLanguage: ["en", "hi"],
  },
  sameAs: [
    "https://wa.me/919346797060",
    "https://maps.app.goo.gl/YxEgkFFrhVhBpqjB7",
  ],
};

export const BREADCRUMB_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL + "/" },
    {
      "@type": "ListItem",
      position: 2,
      name: "Products",
      item: SITE_URL + "/#products",
    },
  ],
};

export const buildProductSchema = (product) => {
  const imgs = (product.images && product.images.length ? product.images : [product.image]).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: imgs.map(assetUrl),
    description: product.tagline || product.name,
    brand: { "@type": "Brand", name: ORG_NAME },
    category: "Jewellery packaging",
    offers: {
      "@type": "Offer",
      url: SITE_URL + "/#products",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: ORG_NAME, url: SITE_URL + "/" },
    },
  };
};

export const buildItemListSchema = (products) => ({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Riddhi Siddhi Gift & Pack products",
  numberOfItems: products.length,
  itemListElement: products.map((p, i) => ({
    "@type": "ListItem",
    position: i + 1,
    item: {
      "@type": "Product",
      name: p.name,
      image: assetUrl((p.images && p.images.length ? p.images : [p.image]).filter(Boolean)[0]),
      description: p.tagline || p.name,
      brand: { "@type": "Brand", name: ORG_NAME },
      offers: {
        "@type": "Offer",
        url: SITE_URL + "/#products",
        priceCurrency: "INR",
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@type": "Organization", name: ORG_NAME, url: SITE_URL + "/" },
      },
    },
  })),
});

export function injectJsonLd(schema, id) {
  removeJsonLd(id);
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = id;
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
  return script;
}

export function removeJsonLd(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}