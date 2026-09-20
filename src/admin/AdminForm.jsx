import { Save } from "lucide-react";

export default function AdminForm({
  form,
  set,
  editingId,
  gallery,
  onRemovePhoto,
  onFilesPicked,
  addPath,
  onSubmit,
  onReset,
}) {
  return (
    <div className="rounded-2xl border border-cream2 bg-white p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">
          {editingId ? "Edit Product" : "Add New Product"}
        </h2>
        <button
          type="button"
          onClick={onReset}
          className="min-h-11 rounded-full border border-cream2 px-3 py-1.5 text-xs font-medium text-[#8a8170] transition hover:text-wine-500 active:scale-95"
        >
          Reset form
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="name" className="admin-label">
            Product Name *
          </label>
          <input
            id="name"
            className="field"
            type="text"
            placeholder="e.g. Ring & Pendant Boxes"
            required
            value={form.name}
            onChange={set("name")}
          />
        </div>

        <div>
          <label htmlFor="tagline" className="admin-label">
            Description
          </label>
          <textarea
            id="tagline"
            className="field"
            rows="2"
            placeholder="Short description shown on the card"
            value={form.tagline}
            onChange={set("tagline")}
          ></textarea>
        </div>

        <div>
          <label htmlFor="specs" className="admin-label">
            Features / Specs
          </label>
          <input
            id="specs"
            className="field"
            type="text"
            placeholder="Comma separated, e.g. Velvet Lined, Custom Sizes"
            value={form.specs}
            onChange={set("specs")}
          />
        </div>

        <div>
          <label htmlFor="quoteNote" className="admin-label">
            WhatsApp quote message
          </label>
          <input
            id="quoteNote"
            className="field"
            type="text"
            placeholder="Please share your B2B quote and pricing."
            value={form.quoteNote}
            onChange={set("quoteNote")}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="publishAt" className="admin-label">
              Publish on (optional)
            </label>
            <input
              id="publishAt"
              className="field"
              type="datetime-local"
              value={form.publishAt || ""}
              onChange={set("publishAt")}
            />
            <p className="mt-1 text-[11px] text-[#8a8170]">
              Leave empty to go live on the next publish. A future date keeps the
              product hidden until then (shown as “scheduled”).
            </p>
          </div>
          <div>
            <label className="admin-label">&nbsp;</label>
            <div className="field flex h-full items-center text-[11px] text-[#8a8170]">
              Products to publish now don&apos;t need a date — this is only for
              planned releases.
            </div>
          </div>
        </div>

        {/* Photos — first one is the cover */}
        <div>
          <label className="admin-label">Photos — first one is the cover</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {gallery.length ? (
              gallery.map((g, i) => (
                <div key={i} className="relative">
                  {i === 0 && (
                    <span className="absolute left-1 top-1 z-10 rounded-full bg-agold-500 px-2 py-0.5 text-[9px] font-bold text-white">
                      COVER
                    </span>
                  )}
                  <img
                    src={g.dataURI || g.path}
                    alt=""
                    className="h-20 w-20 rounded-lg border border-cream2 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemovePhoto(i)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-wine-500 text-xs font-bold text-white hover:bg-wine-600"
                  >
                    ✕
                  </button>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-[#8a8170]">
                No photos yet — upload or add a file name below.
              </p>
            )}
          </div>
          <input
            className="field mt-3 file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-agold-500 file:px-4 file:py-2.5 file:text-xs file:font-semibold file:text-white hover:file:bg-agold-600"
            type="file"
            accept="image/*"
            multiple
            onChange={onFilesPicked}
          />
          <div className="mt-2 flex gap-2">
            <input
              className="field"
              type="text"
              placeholder="…or add an existing file name, e.g. images/jewellery-box-44.jpg"
              value={form.imagePath}
              onChange={set("imagePath")}
            />
            <button
              type="button"
              onClick={addPath}
              className="shrink-0 rounded-full border border-agold-500 px-4 text-xs font-semibold text-agold-600 hover:bg-agold-500/10 active:scale-95"
            >
              Add
            </button>
          </div>
          <p className="mt-1 text-[11px] text-[#8a8170]">
            Tap the button above to pick photos from this device — your camera roll (or camera)
            works too. Uploads are compressed, sent to the image CDN (S3) and served back through
            CloudFront when you publish. Click ✕ on a photo to remove it.
          </p>
        </div>

        {/* Badges */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="badge1Text" className="admin-label">
              Badge 1 (e.g. Bulk Orders)
            </label>
            <input
              id="badge1Text"
              className="field"
              type="text"
              placeholder="Bulk Orders"
              value={form.badge1Text}
              onChange={set("badge1Text")}
            />
            <select
              className="field mt-2"
              aria-label="Badge 1 style"
              value={form.badge1Style}
              onChange={set("badge1Style")}
            >
              <option value="gold">Gold</option>
              <option value="wine">Wine</option>
              <option value="ink">Dark</option>
            </select>
          </div>
          <div>
            <label htmlFor="badge2Text" className="admin-label">
              Badge 2 (e.g. B2B)
            </label>
            <input
              id="badge2Text"
              className="field"
              type="text"
              placeholder="B2B"
              value={form.badge2Text}
              onChange={set("badge2Text")}
            />
            <select
              className="field mt-2"
              aria-label="Badge 2 style"
              value={form.badge2Style}
              onChange={set("badge2Style")}
            >
              <option value="ink">Dark</option>
              <option value="gold">Gold</option>
              <option value="wine">Wine</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button
            type="submit"
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-agold-500 px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-agold-600 active:scale-95"
          >
            <Save className="h-4 w-4" /> Save Product
          </button>
          {editingId && (
            <button
              type="button"
              onClick={onReset}
              className="min-h-12 rounded-full border border-ink/15 bg-white px-6 py-3 text-sm font-medium text-ink transition hover:border-agold-500 active:scale-95"
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>
    </div>
  );
}