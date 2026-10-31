import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../src/lib/i18n.js";
import Contact from "../src/components/Contact.jsx";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const products = [
  { id: "jewellery-box", name: "Jewellery Box" },
  { id: "gift-hamper", name: "Gift Hamper" },
];

function setup() {
  const user = userEvent.setup();
  render(<Contact products={products} />);
  return user;
}

async function fillValid(user, overrides = {}) {
  const { name = "Rahul Jewellers", phone = "+91 98765 43210", message = "Need 500 boxes" } =
    overrides;
  if (name) await user.type(screen.getByLabelText(/your name/i), name);
  if (phone) await user.type(screen.getByLabelText(/phone/i), phone);
  if (message) await user.type(screen.getByLabelText(/message/i), message);
}

const submit = (user) => user.click(screen.getByRole("button", { name: /send enquiry/i }));

describe("Contact form", () => {
  test("lists the catalogue products plus a custom option", () => {
    setup();
    expect(screen.getByRole("option", { name: "Jewellery Box" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Gift Hamper" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Something else / custom design" })
    ).toBeInTheDocument();
  });

  test("rejects a name containing a URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const user = setup();

    await fillValid(user, { name: "Visit https://spam.example" });
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please enter a valid business or contact name."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects spammy message content", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const user = setup();

    await fillValid(user, { message: "buy now casino free money" });
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your message looks like spam. Please rephrase and try again."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects an invalid phone number", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const user = setup();

    await fillValid(user, { phone: "abc" });
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please enter a valid phone number."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("silently ignores submissions that fill the honeypot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const user = setup();

    const honeypot = document.querySelector('input[name="tf_hp_name"]');
    await user.type(honeypot, "i-am-a-bot");
    await fillValid(user);
    await submit(user);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("submits a valid enquiry and hands off to WhatsApp", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = setup();

    await fillValid(user);
    await submit(user);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/.netlify/functions/submit-enquiry");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      name: "Rahul Jewellers",
      phone: "+91 98765 43210",
      message: "Need 500 boxes",
      tf_hp_name: "",
      tf_hp_email: "",
    });
    expect(typeof body.tf_fill_ms).toBe("number");

    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1));
    const waUrl = openMock.mock.calls[0][0];
    expect(waUrl).toMatch(/^https:\/\/wa\.me\//);
    expect(decodeURIComponent(waUrl)).toContain("Rahul Jewellers");
    expect(decodeURIComponent(waUrl)).toContain("Need 500 boxes");

    expect(await screen.findByRole("status")).toHaveTextContent("Enquiry sent!");
    expect(screen.getByLabelText(/your name/i)).toHaveValue("");
  });

  test("shows the server error message on a rejected submission", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Too many requests. Try again later." }),
    });
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = setup();

    await fillValid(user);
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests. Try again later."
    );
    expect(openMock).not.toHaveBeenCalled();
  });

  test("shows a network error when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const user = setup();

    await fillValid(user);
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Network error — please check your connection and try again."
    );
  });

  test("disables the button and shows progress while submitting", async () => {
    let resolveFetch;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    vi.spyOn(window, "open").mockImplementation(() => null);
    const user = setup();

    await fillValid(user);
    await submit(user);

    expect(await screen.findByText("Checking…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /checking/i })).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({}) });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sent!/i })).toBeInTheDocument()
    );
  });
});
