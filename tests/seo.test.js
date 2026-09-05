import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  buildSitemapXml,
  buildRobotsTxt,
  DEFAULT_SITE_URL,
  STATIC_PAGES,
} from "../scripts/generate-seo.mjs";

const PUBLIC = resolve(import.meta.dirname, "../public");
const { products } = JSON.parse(readFileSync(join(PUBLIC, "products.json"), "utf8"));

const imagesOf = (p) =>
  (p.images && p.images.length ? p.images : [p.image]).filter(Boolean);

const allImageLocs = [
  ...new Set(products.flatMap(imagesOf).map((img) => `${DEFAULT_SITE_URL}/${img}`)),
];

const sitemap = buildSitemapXml({ products, generatedAt: new Date("2026-01-15T00:00:00Z") });
const robots = buildRobotsTxt();

test("sitemap declares standard and image namespaces", () => {
  expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  expect(sitemap).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
});

test("sitemap lists the homepage with lastmod, changefreq and priority", () => {
  expect(sitemap).toContain(`<loc>${DEFAULT_SITE_URL}/</loc>`);
  expect(sitemap).toContain("<lastmod>2026-01-15</lastmod>");
  expect(sitemap).toContain("<changefreq>weekly</changefreq>");
  expect(sitemap).toContain("<priority>1.0</priority>");
});

test("every product image appears as an image:loc entry", () => {
  for (const img of allImageLocs) {
    expect(sitemap, img).toContain(`<image:loc>${img}</image:loc>`);
  }
  const entries = sitemap.match(/<image:image>/g);
  expect(entries).toHaveLength(allImageLocs.length);
});

test("image entries live under the homepage url block only", () => {
  const homepageBlock =
    sitemap.split("<url>").find((b) => b.includes(`${DEFAULT_SITE_URL}/</loc>`)) || "";
  expect(homepageBlock).toContain("<image:image>");
});

test("image URLs are XML-escaped", () => {
  const withAmp = buildSitemapXml({
    products: [{ image: "images/a&b.jpg" }],
    generatedAt: new Date("2026-01-15T00:00:00Z"),
  });
  expect(withAmp).toContain("<image:loc>https://dd4hzdnwrj3px.cloudfront.net/images/a&amp;b.jpg</image:loc>");
});

test("SITE_URL override is respected and trailing slashes are normalised", () => {
  const custom = buildSitemapXml({
    siteUrl: "https://shop.example.com/",
    products,
    generatedAt: new Date("2026-01-15T00:00:00Z"),
  });
  expect(custom).toContain("<loc>https://shop.example.com/</loc>");
  expect(custom).toContain("<image:loc>https://shop.example.com/");
  const customRobots = buildRobotsTxt({ siteUrl: "https://shop.example.com/" });
  expect(customRobots).toContain("Sitemap: https://shop.example.com/sitemap.xml");
});

test("robots.txt allows crawling but blocks admin and references the sitemap", () => {
  expect(robots).toContain("User-agent: *");
  expect(robots).toContain("Allow: /");
  expect(robots).toContain("Disallow: /admin.html");
  expect(robots).toContain(`Sitemap: ${DEFAULT_SITE_URL}/sitemap.xml`);
  expect(robots).toMatch(/Disallow: \/admin\.html[\s\S]*Sitemap:/);
});

test("STATIC_PAGES drives the generated page list", () => {
  const onePage = buildSitemapXml({
    products: [],
    pages: [...STATIC_PAGES, { path: "blog/a-post", changefreq: "monthly", priority: "0.8", lastmod: null }],
    generatedAt: new Date("2026-01-15T00:00:00Z"),
  });
  expect(onePage).toContain(`<loc>${DEFAULT_SITE_URL}/blog/a-post</loc>`);
  expect(onePage.match(/<url>/g)).toHaveLength(2);
});