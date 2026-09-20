import { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  Box,
  Eye,
  Pencil,
  Trash2,
  ImageOff,
  Rocket,
  FileDown,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { slugify, splitSpecs, badgeClass, compressImage, dataUriToBlob } from "./helpers.js";

const BASE = import.meta.env.BASE_URL;
const LS_KEY = "rsp_products_v1";
const TOKEN_SESSION_KEY = "rsp_admin_token";

// Load the (largest) admin panel screen — the product form — only when the
// admin app itself is open, keeping the admin entry chunk's initial JS light.
const AdminForm = lazy(() => import("./AdminForm.jsx"));

export default function AdminApp() {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState(null); // { msg, isError }
  const [editingId, setEditingId] = useState(null);
  const [gallery, setGallery] = useState([]); // [{path} | {dataURI, name, width, height, size}]
  const pendingFilesRef = useRef({}); // "images/name.jpg" -> { dataURI, name, width, height, size }
  const [publishing, setPublishing] = useState(false);
  const [password, setPassword] = useState("");

  const [form, setForm] = useState({
    name: "",
    tagline: "",
    specs: "",
    quoteNote: "",
    imagePath: "",
    badge1Text: "",
    badge1Style: "gold",
    badge2Text: "",
    badge2Style: "ink",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const statusTimerRef = useRef(null);

  const showStatus = (msg, isError = false) => {
    setStatus({ msg, isError });
    clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus(null), 5000);
  };

  // ---- load: local draft wins over live products.json ----
  useEffect(() => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(LS_KEY));
    } catch {
      saved = null;
    }
    if (saved && saved.products && saved.products.length) {
      setProducts(saved.products);
      return;
    }
    fetch(BASE + "products.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then((data) => setProducts(data.products || []))
      .catch(() =>
        showStatus("Could not load products.json — is the local server running?", true)
      );
  }, []);

  const persist = (prods) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ products: prods }));
    } catch {}
  };

  const updateProducts = (prods) => {
    setProducts(prods);
    persist(prods);
  };

  const emptyForm = () => {
    setEditingId(null);
    setGallery([]);
    setForm({
      name: "",
      tagline: "",
      specs: "",
      quoteNote: "",
      imagePath: "",
      badge1Text: "",
      badge1Style: "gold",
      badge2Text: "",
      badge2Style: "ink",
    });
  };

  const editProduct = (i) => {
    const p = products[i];
    setEditingId(p.id || slugify(p.name));
    setGallery(
      (p.images && p.images.length ? p.images : [p.image])
        .filter(Boolean)
        .map((path) => ({ path }))
    );
    setForm({
      name: p.name || "",
      tagline: p.tagline || "",
      specs: (p.specs || []).join(", "),
      quoteNote: p.quoteNote || "",
      imagePath: "",
      badge1Text: (p.badges && p.badges[0] ? p.badges[0].text : "") || "",
      badge1Style: (p.badges && p.badges[0] ? p.badges[0].style : "gold") || "gold",
      badge2Text: (p.badges && p.badges[1] ? p.badges[1].text : "") || "",
      badge2Style: (p.badges && p.badges[1] ? p.badges[1].style : "ink") || "ink",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteProduct = (i) => {
    const p = products[i];
    if (!window.confirm('Delete "' + p.name + '"?')) return;
    updateProducts(products.filter((_, j) => j !== i));
    showStatus('"' + p.name + '" deleted. Remember to publish your changes.');
  };

  const uniqueImagePath = (pid) => {
    const taken = {};
    products.forEach((p) => (p.images || []).concat([p.image]).forEach((i) => i && (taken[i] = 1)));
    Object.keys(pendingFilesRef.current).forEach((k) => (taken[k] = 1));
    for (let n = 1; n < 500; n++) {
      const cand = `images/${pid}-${n}.jpg`;
      if (!taken[cand]) return cand;
    }
    return `images/${pid}-${Date.now()}.jpg`;
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      showStatus("Please enter a product name.", true);
      return;
    }
    const pid = editingId || slugify(name);

    // assign target paths to newly uploaded photos and stage them for Publish
    const images = gallery.map((g) => {
      if (g.path) return g.path;
      const target = uniqueImagePath(pid);
      pendingFilesRef.current[target] = {
        dataURI: g.dataURI,
        name: g.name,
        width: g.width,
        height: g.height,
        size: g.size,
      };
      return target;
    });

    const badges = [];
    const b1 = form.badge1Text.trim();
    const b2 = form.badge2Text.trim();
    if (b1) badges.push({ text: b1, style: form.badge1Style });
    if (b2) badges.push({ text: b2, style: form.badge2Style });

    const product = {
      id: pid,
      name,
      tagline: form.tagline.trim(),
      specs: splitSpecs(form.specs),
      image: images[0] || "",
      images,
      alt: name,
      badges,
      quoteNote: form.quoteNote.trim() || "Please share your B2B quote and bulk pricing.",
    };

    let next;
    if (editingId) {
      const idx = products.findIndex((p) => p.id === editingId);
      next = idx > -1 ? products.map((p, i) => (i === idx ? product : p)) : [...products, product];
    } else {
      next = [...products, product];
    }

    // drop staged uploads that are no longer referenced by any product
    const referenced = {};
    next.forEach((p) => (p.images || []).concat([p.image]).forEach((i) => i && (referenced[i] = 1)));
    Object.keys(pendingFilesRef.current).forEach((k) => {
      if (!referenced[k]) delete pendingFilesRef.current[k];
    });

    updateProducts(next);
    emptyForm();
    const staged = Object.keys(pendingFilesRef.current).length;
    showStatus(
      `"${name}" saved. ` +
        (staged ? `${staged} new photo(s) will upload when you Publish.` : "Publish to make it live.")
    );
  };

  const onFilesPicked = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    try {
      const results = await Promise.all(files.map(compressImage));
      setGallery((g) => [
        ...g,
        ...results.map((r) => ({
          dataURI: r.dataURI,
          name: r.name,
          width: r.width,
          height: r.height,
          size: r.size,
        })),
      ]);
    } catch {
      showStatus("Could not read one of the images.", true);
    }
  };

  const addPath = () => {
    const path = form.imagePath.trim();
    if (!path) return;
    if (gallery.some((g) => g.path === path)) {
      showStatus("That photo is already in the list.", true);
      return;
    }
    setGallery((g) => [...g, { path }]);
    setForm((f) => ({ ...f, imagePath: "" }));
  };

  // ---- publish: upload new photos to S3, then save products to GitHub ----
  const fnUrl = (name) => "/.netlify/functions/" + name;

  const post = (name, body) =>
    fetch(fnUrl(name), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json().then((d) => ({ ok: r.ok && !!d.ok, d })));

  // One photo: request a presigned PUT, upload straight to S3, then ask the
  // lambda to build responsive variants + metadata. Returns the final S3 key.
  const uploadPhoto = async ({ token, placeholder, productId, taken }) => {
    const pending = pendingFilesRef.current[placeholder];
    const base = String(placeholder)
      .replace(/^images\//, "")
      .replace(/\.(jpe?g|png|webp)$/i, "");
    const desiredKey = `products/${productId}/${base}.jpg`;

    const presign = await post("presign-image", {
      token,
      productId,
      name: pending.name,
      key: desiredKey,
      taken,
      contentLength: pending.size,
    });
    if (!presign.ok) {
      throw new Error((presign.d && presign.d.message) || "Could not get a photo upload link.");
    }

    const putRes = await fetch(presign.d.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: dataUriToBlob(pending.dataURI),
    });
    if (!putRes.ok) {
      throw new Error("Photo upload to S3 failed (" + putRes.status + ").");
    }

    const processed = await post("process-image", {
      token,
      key: presign.d.key,
    });
    if (!processed.ok) {
      throw new Error((processed.d && processed.d.message) || "Could not build image variants.");
    }

    return { path: presign.d.key, meta: processed.d.metadata };
  };

  // Replace every staged placeholder path with its real S3 key, recording the
  // image metadata returned by the processing lambda on the product.
  const bakeUploads = (resultMap) =>
    products.map((p) => {
      const source = (p.images && p.images.length ? p.images : [p.image]).filter(Boolean);
      let touched = false;
      const images = source.map((img) => {
        if (!resultMap[img]) return img;
        touched = true;
        return resultMap[img].path;
      });
      if (!touched) return p;
      return {
        ...p,
        images,
        image: images[0] || p.image,
        imagesMeta: (p.imagesMeta || [])
          .filter((m) => !resultMap[m.path])
          .concat(images.map((img) => resultMap[img] && resultMap[img].meta).filter(Boolean)),
      };
    });

  const publish = () => {
    const token =
      password.trim() || sessionStorage.getItem(TOKEN_SESSION_KEY) || "";
    if (!token) {
      showStatus("Enter your admin password first.", true);
      return;
    }

    setPublishing(true);

    const placeholders = Object.keys(pendingFilesRef.current);
    const finish = (ok) => {
      setPublishing(false);
      if (ok) {
        sessionStorage.setItem(TOKEN_SESSION_KEY, token);
        setPassword("");
        pendingFilesRef.current = {};
      }
    };

    const run = async () => {
      let toSave = products;
      try {
        if (placeholders.length) {
          showStatus("Uploading photos to the image CDN…");
          const taken = new Set(
            products.flatMap((p) => (p.images || []).concat([p.image]).filter(Boolean))
          );
          const pidOf = new Map();
          products.forEach((p) =>
            (p.images || []).concat([p.image]).forEach((i) => i && pidOf.set(i, p.id))
          );

          const resultMap = {};
          for (const placeholder of placeholders) {
            const productId = pidOf.get(placeholder) || placeholder.split("-")[0];
            const { path, meta } = await uploadPhoto({
              token,
              placeholder,
              productId,
              taken,
            });
            resultMap[placeholder] = { path, meta };
            taken.add(path);
          }

          toSave = bakeUploads(resultMap);
          showStatus("Saved photos. Publishing products…");
        }

        const res = await post("save-products", { products: toSave, token });
        if (res.ok) {
          const msg =
            res.d.deletedImages > 0
              ? res.d.message + " Removed " + res.d.deletedImages + " orphaned image(s) from S3."
              : res.d.message;
          finish(true);
          showStatus(msg);
        } else {
          throw new Error(res.d.message || "Publish failed.");
        }
      } catch (e) {
        finish(false);
        showStatus(e.message || "Publish failed.", true);
      }
    };

    run();
  };

  const downloadJson = () => {
    const json = JSON.stringify({ products }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "products.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showStatus("products.json downloaded as a backup.");
  };

  const resetAll = () => {
    if (
      !window.confirm(
        "Reset all products back to the live products.json? Your local draft will be lost."
      )
    )
      return;
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
    emptyForm();
    fetch(BASE + "products.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setProducts(data.products || []))
      .catch(() => {});
    showStatus("Reset to the live products.json.");
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-cream2 bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-agold-400/50 bg-white">
              <Box className="h-5 w-5 text-agold-600" />
            </div>
            <div>
              <p className="font-semibold leading-tight text-ink">Product Manager</p>
              <p className="text-[11px] text-[#8a8170]">Riddhi Siddhi Gift &amp; Pack</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={BASE}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-xs font-semibold text-ink transition hover:border-agold-500"
            >
              <Eye className="h-3.5 w-3.5" /> View Website
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Status bar */}
        {status && (
          <div
            className={`mb-6 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
              status.isError
                ? "border-red-400/40 bg-red-500/10 text-red-600"
                : "border-agold-400/40 bg-agold-500/10 text-agold-600"
            }`}
          >
            {status.isError ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            {status.msg}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Form (lazy-loaded so the admin shell paints first) */}
          <Suspense
            fallback={
              <div className="rounded-2xl border border-cream2 bg-white p-6 shadow-soft">
                <p className="text-sm text-[#8a8170]">Loading form…</p>
              </div>
            }
          >
            <AdminForm
              key={editingId || "new"}
              form={form}
              set={set}
              editingId={editingId}
              gallery={gallery}
              onRemovePhoto={(i) => setGallery(gallery.filter((_, j) => j !== i))}
              onFilesPicked={onFilesPicked}
              addPath={addPath}
              onSubmit={onSubmit}
              onReset={emptyForm}
            />
          </Suspense>

          {/* List + Export */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-cream2 bg-white p-6 shadow-soft">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-ink">
                  Products{" "}
                  <span className="ml-1 rounded-full bg-cream px-2 py-0.5 text-xs text-[#8a8170]">
                    {products.length}
                  </span>
                </h2>
              </div>
              <div className="mt-4 space-y-3">
                {!products.length ? (
                  <p className="text-sm text-[#8a8170]">
                    No products yet. Add your first product on the left.
                  </p>
                ) : (
                  products.map((p, i) => (
                    <div
                      key={p.id || i}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-cream2 bg-cream/40 p-3"
                    >
                      {p.image ? (
                        <img
                          src={p.image}
                          alt=""
                          className="h-14 w-14 rounded-lg border border-cream2 object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-cream2 bg-cream">
                          <ImageOff className="h-5 w-5 text-[#b5ab97]" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(p.badges || []).map((b, j) => (
                            <span
                              key={j}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass(b.style)}`}
                            >
                              {b.text}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex w-full gap-2 min-[420px]:w-auto min-[420px]:flex-col">
                        <button
                          onClick={() => editProduct(i)}
                          className="flex-1 rounded-full border border-ink/15 bg-white px-3 py-1 text-xs font-medium text-ink transition hover:border-agold-500 min-[420px]:flex-none"
                        >
                          <Pencil className="mr-1 inline h-3 w-3" /> Edit
                        </button>
                        <button
                          onClick={() => deleteProduct(i)}
                          className="flex-1 rounded-full border border-wine-500/30 px-3 py-1 text-xs font-medium text-wine-500 transition hover:bg-wine-500 hover:text-cream min-[420px]:flex-none"
                        >
                          <Trash2 className="mr-1 inline h-3 w-3" /> Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Publish */}
            <div className="rounded-2xl border border-agold-400/40 bg-gradient-to-br from-cream to-white p-6 shadow-soft">
              <h3 className="flex items-center gap-2 font-semibold text-ink">
                <Rocket className="h-4 w-4 text-agold-600" /> Publish to the live website
              </h3>
<p className="mt-2 text-sm text-[#6b6353]">
                  Photos upload straight to the S3 image CDN (no repo bloat), and product data
                  saves to GitHub — your Netlify site auto-deploys within a minute. First time
                  only: enter your admin password and tick “remember”.
                </p>

              <div className="mt-4 flex flex-col gap-3">
                <label htmlFor="adminPassword" className="admin-label">
                  Admin password (same one set in Netlify env ADMIN_TOKEN)
                </label>
                <div className="flex gap-2">
                  <input
                    id="adminPassword"
                    className="field"
                    type="password"
                    placeholder="Enter admin password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.removeItem(TOKEN_SESSION_KEY);
                      setPassword("");
                      showStatus("Saved password cleared.");
                    }}
                    className="shrink-0 rounded-full border border-ink/15 bg-white px-4 text-xs font-medium text-ink transition hover:border-wine-500 hover:text-wine-500"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={publish}
                  disabled={publishing}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-cream transition hover:bg-agold-600 disabled:opacity-70"
                >
                  {publishing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Publishing…
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4" /> Publish products
                    </>
                  )}
                </button>
                <button
                  onClick={downloadJson}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:border-agold-500"
                >
                  <FileDown className="h-4 w-4" /> Download products.json
                </button>
              </div>
              <button
                onClick={resetAll}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-full border border-wine-500/40 px-5 py-2.5 text-xs font-semibold text-wine-500 transition hover:bg-wine-500 hover:text-cream"
              >
                <RotateCcw className="h-4 w-4" /> Reset to defaults
              </button>

              <div className="mt-5 rounded-xl border border-cream2 bg-white p-4 text-xs leading-relaxed text-[#6b6353]">
                <p className="font-semibold text-ink">How publishing works:</p>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>Edit your products on the left. Changes are auto-saved on this device as a draft.</li>
                  <li>
                    Click <span className="font-medium text-ink">Publish products</span>. New photos
                    upload to the image CDN (S3 via presigned URLs), then <span className="font-mono">products.json</span> is
                    saved to your GitHub repo.
                  </li>
                  <li>Netlify detects the change and auto-deploys. Your live site updates in about a minute.</li>
                  <li>
                    <span className="font-medium text-ink">Download products.json</span> is a backup /
                    manual fallback.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
