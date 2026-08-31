import { expect, test } from "vitest";
import { waLink, waChat, telLink, SITE } from "../src/lib/site-config.js";

test("waLink builds an encoded WhatsApp message link", () => {
  expect(waLink("Hi there")).toBe(`https://wa.me/${SITE.phone}?text=${encodeURIComponent("Hi there")}`);
  expect(waLink()).toContain(encodeURIComponent(SITE.defaultMsg));
});

test("waChat returns the plain WhatsApp number link", () => {
  expect(waChat()).toBe(`https://wa.me/${SITE.phone}`);
});

test("telLink uses the international tel: format", () => {
  expect(telLink()).toBe(`tel:+${SITE.phone}`);
});