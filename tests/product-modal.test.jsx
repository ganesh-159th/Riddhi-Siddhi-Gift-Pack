import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../src/lib/i18n.js";
import ProductModal from "../src/components/ProductModal.jsx";
import { trackProductView } from "../src/lib/analytics.js";

vi.mock("../src/lib/analytics.js", () => ({
  trackProductView: vi.fn(),
}));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const product = {
  id: "jewellery-box",
  name: "Jewellery Box",
  tagline: "Velvet-lined keepsake box",
  image: "images/box.jpg",
  images: ["images/box.jpg", "images/box-2.jpg", "images/box-3.jpg"],
  badges: [{ text: "Bestseller", style: "gold" }],
  specs: ["12 x 8 in", "Velvet finish"],
};

const counter = () =>
  document.querySelector('[aria-live="polite"][aria-atomic="true"]').textContent.trim();

describe("ProductModal", () => {
  test("renders nothing when there is no product", () => {
    const { container } = render(<ProductModal product={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders product details, badges and the WhatsApp CTA", () => {
    render(<ProductModal product={product} onClose={() => {}} />);

    expect(
      screen.getByRole("dialog", { name: "Product details: Jewellery Box" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Jewellery Box" })).toBeInTheDocument();
    expect(screen.getByText("Velvet-lined keepsake box")).toBeInTheDocument();
    expect(screen.getByText("Bestseller")).toBeInTheDocument();
    expect(screen.getByText("12 x 8 in")).toBeInTheDocument();
    expect(screen.getByText("Velvet finish")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /have a query/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/919346797060"));
    expect(decodeURIComponent(link.getAttribute("href"))).toContain("Jewellery Box");
  });

  test("falls back to a B2B badge and no-specs copy", () => {
    render(<ProductModal product={{ ...product, badges: [], specs: [] }} onClose={() => {}} />);
    expect(screen.getByText("B2B")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Custom sizes, finishes and branding available. Contact us for full specifications."
      )
    ).toBeInTheDocument();
  });

  test("navigates the gallery with buttons and wraps around", async () => {
    const user = userEvent.setup();
    render(<ProductModal product={product} onClose={() => {}} />);

    expect(counter()).toBe("1 / 3");
    await user.click(screen.getByRole("button", { name: "Next image" }));
    expect(counter()).toBe("2 / 3");
    await user.click(screen.getByRole("button", { name: "Previous image" }));
    expect(counter()).toBe("1 / 3");
    await user.click(screen.getByRole("button", { name: "Previous image" }));
    expect(counter()).toBe("3 / 3");
  });

  test("jumps to a thumbnail and to the start image", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ProductModal product={product} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Photo 3" }));
    expect(counter()).toBe("3 / 3");
    unmount();

    render(<ProductModal product={product} startImage={2} onClose={() => {}} />);
    expect(counter()).toBe("3 / 3");
  });

  test("advances when the main image is clicked", async () => {
    const user = userEvent.setup();
    render(<ProductModal product={product} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Show next image" }));
    expect(counter()).toBe("2 / 3");
  });

  test("supports ArrowLeft / ArrowRight / Escape keyboard navigation", () => {
    const onClose = vi.fn();
    render(<ProductModal product={product} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(counter()).toBe("2 / 3");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(counter()).toBe("1 / 3");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("traps Tab focus inside the dialog", () => {
    render(<ProductModal product={product} onClose={() => {}} />);
    const close = screen.getByRole("button", { name: "Close product details" });
    const links = screen.getAllByRole("link");
    const last = links[links.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  test("closes on overlay click but not on inner clicks", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ProductModal product={product} onClose={onClose} />);

    await user.click(screen.getByRole("heading", { name: "Jewellery Box" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("closes with the close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ProductModal product={product} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close product details" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("locks body scroll while open and restores it on unmount", () => {
    const { unmount } = render(<ProductModal product={product} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  test("tracks a product view", () => {
    render(<ProductModal product={product} onClose={() => {}} />);
    expect(trackProductView).toHaveBeenCalledWith(product);
  });
});
