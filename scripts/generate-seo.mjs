import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SITE_URL = "https://dd4hzdnwrj3px.cloudfront.net";

export const STATIC_PAGES = [
  { path: "", changefreq: "weekly", priority: "1.0", lastmod: null },
];

const escXml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const joinUrl = (base, path) =>
  base.replace(/\/+$/, "") + "/" + String(path || "").replace(/^\/+/, "");

const imagesOf = (product) => {
  if (!product) return [];
  const arr = product.images?.length ? product.images : [product.image];
  return arr.filter(Boolean);
};

const isoDate = (d) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;

export function buildSitemapXml({
  siteUrl = DEFAULT_SITE_URL,
  products = [],
  pages = STATIC_PAGES,
  generatedAt = new Date(),
} = {}) {
  const root = siteUrl.replace(/\/+$/, "");
  const lastmod = isoDate(generatedAt);

  const imageLocs = [...new Set(
    products.flatMap(imagesOf)
      .filter(Boolean)
      .map((img) => escXml(joinUrl(root, img)))
  )];

  const urlBlocks = pages.map((page) => {
    const loc = escXml(joinUrl(root, page.path));
    const mod = page.lastmod ? escXml(page.lastmod) : lastmod;
    return [
      "  <url>",
      `    <loc>${loc}</loc>`,
      `    <lastmod>${mod}</lastmod>`,
      `    <changefreq>${escXml(page.changefreq || "monthly")}</changefreq>`,
      `    <priority>${escXml(page.priority || "0.5")}</priority>`,
      ...(page.path === ""
        ? imageLocs.map(
            (img) => `    <image:image>\n      <image:loc>${img}</image:loc>\n    </image:image>`
          )
        : []),
      "  </url>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urlBlocks,
    "</urlset>",
  ].join("\n");
}

export function buildRobotsTxt({ siteUrl = DEFAULT_SITE_URL } = {}) {
  const root = siteUrl.replace(/\/+$/, "");
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin.html",
    "",
    `Sitemap: ${root}/sitemap.xml`,
    "",
  ].join("\n");
}

const ORG_NAME = "Riddhi Siddhi Gift & Pack";

export function buildSchemasJsonLd({ siteUrl = DEFAULT_SITE_URL } = {}) {
  const root = siteUrl.replace(/\/+$/, "");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": root + "/#organization",
        name: ORG_NAME,
        url: root + "/",
        logo: root + "/favicon.svg",
        image: root + "/images/og-cover.jpg",
        contactPoint: {
          "@type": "ContactPoint",
          telephone: "+919346797060",
          contactType: "sales",
          areaServed: "IN",
          availableLanguage: ["en", "hi"],
        },
        sameAs: ["https://wa.me/919346797060", "https://maps.app.goo.gl/YxEgkFFrhVhBpqjB7"],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: root + "/" },
          { "@type": "ListItem", position: 2, name: "Products", item: root + "/#products" },
        ],
      },
    ],
  };
}

function main() {
  const siteUrl = process.env.SITE_URL?.trim() || DEFAULT_SITE_URL;
  const { products } = JSON.parse(
    readFileSync(resolve(SCRIPT_DIR, "../public/products.json"), "utf8")
  );
  const distDir = resolve(SCRIPT_DIR, "../dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(
    resolve(distDir, "sitemap.xml"),
    buildSitemapXml({ siteUrl, products }) + "\n",
    "utf8"
  );
  writeFileSync(
    resolve(distDir, "robots.txt"),
    buildRobotsTxt({ siteUrl }) + "\n",
    "utf8"
  );
  writeFileSync(
    resolve(distDir, "schemas.jsonld"),
    JSON.stringify(buildSchemasJsonLd({ siteUrl }), null, 2) + "\n",
    "utf8"
  );
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}