import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminApp from "../src/admin/AdminApp.jsx";

// The publish dialog probes image URLs with a real <img>; jsdom never fires
// onload, so stub that network check to keep the CRUD tests deterministic.
vi.mock("../src/admin/validate.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, findBrokenImages: vi.fn(async () => ({ missing: [], checked: 0 })) };
});

const LS_KEY = "rsp_products_v1";
const SESSION_KEY = "rsp_admin_session";

const liveProduct = {
  id: "ring-box",
  name: "Ring Box",
  tagline: "Velvet-lined gift box",
  specs: ["Velvet Lined"],
  image: "images/ring-box-1.jpg",
  images: ["images/ring-box-1.jpg"],
  alt: "Ring box",
  badges: [{ text: "B2B", style: "gold" }],
  quoteNote: "Please share pricing.",
};

const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

function mockApi({
  live = [liveProduct],
  historySha = "sha1",
  saveResponse,
  saveStatus = 200,
} = {}) {
  const saveBodies = [];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith("products.json")) return response({ products: live });
    if (target.includes("history-products")) return response({ ok: true, sha: historySha });
    if (target.includes("save-products")) {
      saveBodies.push(JSON.parse(options.body || "{}"));
      return response(
        saveResponse || { ok: true, message: "Published products.json.", sha: "sha2" },
        saveStatus
      );
    }
    return response({}, 404);
  });
  return { fetchMock, saveBodies };
}

function storedDraft() {
  return JSON.parse(localStorage.getItem(LS_KEY));
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ token: "tok", exp: Date.now() + 60 * 60 * 1000 })
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("AdminApp CRUD", () => {
  test("loads the published catalogue and reports it is in sync", async () => {
    mockApi();
    render(<AdminApp />);

    expect(await screen.findByText("Ring Box")).toBeInTheDocument();
    expect(await screen.findByText("In sync")).toBeInTheDocument();
    expect(screen.queryByText(/Draft saved on this device only/)).not.toBeInTheDocument();
  });

  test("creates a product, persists it as a draft and resets the form", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<AdminApp />);
    await screen.findByText("Ring Box");

    await user.type(await screen.findByLabelText("Product Name *"), "Gift Hamper");
    await user.type(screen.getByLabelText("Description"), "Festive wicker hamper");
    await user.type(screen.getByLabelText("Features / Specs"), "Wicker, Ribbon");
    await user.type(screen.getByLabelText("Badge 1 (e.g. Bulk Orders)"), "New");
    await user.click(screen.getByRole("button", { name: /save product/i }));

    expect(await screen.findByText("Gift Hamper")).toBeInTheDocument();
    expect(screen.getByLabelText("Product Name *")).toHaveValue("");
    expect(await screen.findByText(/Draft saved on this device only/)).toBeInTheDocument();

    const draft = storedDraft();
    const created = draft.products.find((p) => p.id === "gift-hamper");
    expect(created).toMatchObject({
      id: "gift-hamper",
      name: "Gift Hamper",
      tagline: "Festive wicker hamper",
      specs: ["Wicker", "Ribbon"],
      badges: [{ text: "New", style: "gold" }],
      quoteNote: "Please share your B2B quote and bulk pricing.",
      image: "",
      images: [],
    });
  });

  test("edits an existing product without changing its id", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<AdminApp />);
    await screen.findByText("Ring Box");

    await user.click(screen.getByRole("button", { name: /edit/i }));
    expect(await screen.findByRole("heading", { name: "Edit Product" })).toBeInTheDocument();

    const nameInput = screen.getByLabelText("Product Name *");
    expect(nameInput).toHaveValue("Ring Box");
    await user.clear(nameInput);
    await user.type(nameInput, "Ring Box Deluxe");
    await user.click(screen.getByRole("button", { name: /save product/i }));

    expect(await screen.findByText("Ring Box Deluxe")).toBeInTheDocument();
    expect(screen.queryByText("Ring Box")).not.toBeInTheDocument();

    const draft = storedDraft();
    expect(draft.products).toHaveLength(1);
    expect(draft.products[0]).toMatchObject({ id: "ring-box", name: "Ring Box Deluxe" });
  });

  test("deletes a product after confirmation and persists the empty draft", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<AdminApp />);
    await screen.findByText("Ring Box");

    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Ring Box")).not.toBeInTheDocument());
    expect(screen.getByText(/No products yet/)).toBeInTheDocument();
    expect(await screen.findByText(/deleted\. Remember to publish/)).toBeInTheDocument();
    expect(storedDraft().products).toEqual([]);
  });

  test("does not delete when the confirmation is cancelled", async () => {
    window.confirm.mockReturnValue(false);
    mockApi();
    const user = userEvent.setup();
    render(<AdminApp />);
    await screen.findByText("Ring Box");

    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(screen.getByText("Ring Box")).toBeInTheDocument();
    expect(storedDraft()).toBeNull();
  });
});

describe("AdminApp publish", () => {
  async function openPublish(user) {
    await screen.findByText("Ring Box");
    await user.click(screen.getByRole("button", { name: /review & publish/i }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm publish" });
    expect(await within(dialog).findByText(/ready to publish/i)).toBeInTheDocument();
    return dialog;
  }

  test("publishes the draft with its base sha and change summary", async () => {
    const { fetchMock, saveBodies } = mockApi();
    const user = userEvent.setup();
    render(<AdminApp />);
    await screen.findByText("Ring Box");

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("history-products"))
      ).toBe(true)
    );

    const dialog = await openPublish(user);
    await user.type(
      within(dialog).getByPlaceholderText(/updated pricing/i),
      "Initial publish"
    );
    await user.click(within(dialog).getByRole("button", { name: /publish now/i }));

    await waitFor(() => expect(saveBodies).toHaveLength(1));
    expect(saveBodies[0]).toMatchObject({
      token: "tok",
      notes: "Initial publish",
      baseSha: "sha1",
      force: false,
    });
    expect(saveBodies[0].products.map((p) => p.id)).toEqual(["ring-box"]);

    expect(await screen.findByText("Published products.json.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Confirm publish" })).not.toBeInTheDocument()
    );
    expect(storedDraft().baseSha).toBe("sha2");
  });

  test("surfaces server-side validation errors and closes the dialog", async () => {
    mockApi({
      saveResponse: {
        ok: false,
        message: "Products rejected.",
        errors: [{ message: "Duplicate product id." }],
      },
    });
    const user = userEvent.setup();
    render(<AdminApp />);

    const dialog = await openPublish(user);
    await user.click(within(dialog).getByRole("button", { name: /publish now/i }));

    expect(
      await screen.findByText(/Products rejected\. Duplicate product id\./)
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Confirm publish" })).not.toBeInTheDocument()
    );
  });

  test("shows a conflict and can overwrite it with force", async () => {
    const { saveBodies } = mockApi({
      saveStatus: 409,
      saveResponse: {
        ok: false,
        conflict: true,
        message: "Another admin published first.",
        currentSha: "sha9",
        liveProducts: [{ ...liveProduct, name: "Server Box" }],
        draft: [{ ...liveProduct, name: "Ring Box" }],
      },
    });
    const user = userEvent.setup();
    render(<AdminApp />);

    const dialog = await openPublish(user);
    await user.click(within(dialog).getByRole("button", { name: /publish now/i }));

    const conflictDialog = await screen.findByRole("dialog", { name: "Publishing conflict" });
    expect(within(conflictDialog).getByText(/Someone else published first/i)).toBeInTheDocument();

    const overwrite = within(conflictDialog).getByRole("button", { name: /overwrite/i });
    await user.click(overwrite);

    await waitFor(() => expect(saveBodies.length).toBeGreaterThanOrEqual(2));
    expect(saveBodies[saveBodies.length - 1].force).toBe(true);
  });
});
