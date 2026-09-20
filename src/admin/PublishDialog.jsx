import { useEffect, useState } from "react";
import { X, AlertTriangle, CheckCircle, Loader2, Rocket, CalendarClock } from "lucide-react";
import { validateProductList, findBrokenImages, summarizeChanges } from "./validate.js";

// Publish confirmation (issue #21): every publish now requires an explicit
// confirmation that re-validates the draft, hunts for broken/missing images
// on the live CDN, and summarises exactly what will change. Invalid data or
// missing images block the publish with clear errors.

const CountTile = ({ label, value, tone = "default" }) => (
  <div className="flex flex-col items-center rounded-xl border border-cream2 bg-cream/40 px-3 py-3">
    <span
      className={`text-xl font-bold leading-none ${
        tone === "good" ? "text-agold-600" : tone === "warn" ? "text-wine-500" : "text-ink"
      }`}
    >
      {value}
    </span>
    <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a8170]">{label}</span>
  </div>
);

export default function PublishDialog({
  open,
  products,
  live,
  pendingCount,
  pendingTargets,
  tokenReady,
  publishing,
  onCancel,
  onConfirm,
}) {
  const [checks, setChecks] = useState(null); // { errors, warnings, summary, images:{checking,missing} }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const { errors, warnings } = validateProductList(products);
    const summary = summarizeChanges(products, live);
    setChecks({ errors, warnings, summary, images: { checking: true, missing: [] } });
    findBrokenImages(products, pendingTargets).then(({ missing }) => {
      if (cancelled) return;
      setChecks((c) => (c ? { ...c, images: { checking: false, missing } } : c));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const errors = (checks?.errors || []).map((e) => e.message);
  const warnings = (checks?.warnings || []).map((w) => w.message);
  const missing = (checks?.images?.missing || []).filter(Boolean);
  const checkingImages = !checks || checks.images.checking;
  const summary = checks?.summary || { added: 0, updated: 0, deleted: 0, scheduled: 0 };

  const blocking = errors.length + missing.length;
  const isReady = blocking === 0;

  const tiles = [
    { label: "New", value: summary.added, tone: "good" },
    { label: "Updated", value: summary.updated, tone: summary.updated ? "warn" : "default" },
    { label: "Deleted", value: summary.deleted, tone: summary.deleted ? "warn" : "default" },
    { label: "Scheduled", value: summary.scheduled, tone: summary.scheduled ? "good" : "default" },
    { label: "New photos", value: pendingCount, tone: pendingCount ? "good" : "default" },
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm publish"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-cream2 bg-white shadow-card sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-cream2 px-6 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <Rocket className="h-4 w-4 text-agold-600" /> Confirm publish?
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-[#8a8170] transition hover:border-wine-500 hover:text-wine-500 active:scale-95"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {/* Change summary */}
          <div className="grid grid-cols-5 gap-2">
            {tiles.map((t) => (
              <CountTile key={t.label} {...t} />
            ))}
          </div>

          {/* Validation */}
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8a8170]">
              Validation
            </p>

            {checkingImages ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-[#6b6353]">
                <Loader2 className="h-4 w-4 animate-spin text-agold-600" /> Checking products and photos…
              </p>
            ) : (
              <>
                {isReady ? (
                  <p className="mt-2 flex items-center gap-2 text-sm font-medium text-agold-600">
                    <CheckCircle className="h-4 w-4 shrink-0" /> All products valid — ready to publish.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {[...errors, ...missing.map((m) => `Missing image: ${m}`)].map((msg, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-wine-500">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{msg}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {warnings.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {warnings.map((msg, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-amber-600">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{msg}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {summary.scheduled > 0 && (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-agold-400/40 bg-agold-500/10 px-3 py-2.5 text-xs text-agold-600">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {summary.scheduled} product(s) are scheduled for a future date — they will be saved to
                products.json but stay hidden from the live site until then.
              </span>
            </p>
          )}

          {!tokenReady && (
            <p className="mt-4 rounded-xl border border-wine-500/30 bg-wine-500/5 px-3 py-2.5 text-xs text-wine-500">
              Enter your admin password below the Publish button to unlock publishing.
            </p>
          )}
        </div>

        <div className="flex gap-3 border-t border-cream2 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 flex-1 rounded-full border border-ink/15 bg-white px-5 font-semibold text-ink transition hover:border-agold-500 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isReady || !tokenReady || publishing}
            onClick={onConfirm}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-cream transition hover:bg-agold-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Publishing…
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" /> Publish now
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}