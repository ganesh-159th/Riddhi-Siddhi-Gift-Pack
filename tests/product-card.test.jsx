import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../src/lib/i18n.js";
import ProductCard from "../src/components/ProductCard.jsx";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const product = {
  id: "jewellery-box",
  name: "Jewellery Box",
  tagline: "Velvet-lined keepsake box",
  alt: "Red velvet jewellery box",
  image: "images/box.jpg",
  images: ["images/box.jpg", "images/box-2.jpg", "images/box-3.jpg"],
  badges: [
    { text: "Bestseller", style: "gold" },
    { text: "New", style: "wine" },
  ],
  specs: ["12 x 8 in", "Velvet finish"],
};

describe("ProductCard", () => {
  test("renders name, tagline, badges, specs and image", () => {
    render(<ProductCard product={product} index={0} />);

    expect(screen.getByRole("heading", { name: "Jewellery Box" })).toBeInTheDocument();
    expect(screen.getByText("Velvet-lined keepsake box")).toBeInTheDocument();
    expect(screen.getByText("Bestseller")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("12 x 8 in")).toBeInTheDocument();
    expect(screen.getByText("Velvet finish")).toBeInTheDocument();

    const img = screen.getByAltText("Red velvet jewellery box");
    expect(img).toHaveAttribute("src", expect.stringContaining("images/box.jpg"));
    expect(img.getAttribute("srcset")).toContain("400w");
  });

  test("shows the photo count when a product has multiple images", () => {
    render(<ProductCard product={product} index={0} />);
    expect(screen.getByText(/3 photos/)).toBeInTheDocument();
  });

  test("hides the photo count for a single image", () => {
    render(<ProductCard product={{ ...product, images: ["images/box.jpg"] }} index={0} />);
    expect(screen.queryByText(/photos/)).not.toBeInTheDocument();
  });

  test("shows the no-specs fallback when specs are missing", () => {
    render(<ProductCard product={{ ...product, specs: [] }} index={0} />);
    expect(
      screen.getByText("Custom sizes and finishes available on request.")
    ).toBeInTheDocument();
  });

  test("selects the product on click", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ProductCard product={product} index={0} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /view details for jewellery box/i }));
    expect(onSelect).toHaveBeenCalledWith(product);
  });

  test("selects the product with Enter and Space", () => {
    const onSelect = vi.fn();
    render(<ProductCard product={product} index={0} onSelect={onSelect} />);
    const card = screen.getByRole("button", { name: /view details for jewellery box/i });

    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  test("builds a WhatsApp quote link and does not select the card when clicked", () => {
    const onSelect = vi.fn();
    render(<ProductCard product={product} index={0} onSelect={onSelect} />);
    const link = screen.getByRole("link", { name: /get whatsapp quote/i });

    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/919346797060"));
    expect(decodeURIComponent(link.getAttribute("href"))).toContain("Jewellery Box");

    fireEvent.click(link);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
