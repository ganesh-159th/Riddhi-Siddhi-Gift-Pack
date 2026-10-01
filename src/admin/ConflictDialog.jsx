import { X, AlertTriangle, GitMerge, RefreshCw, Upload } from "lucide-react";
import { summarizeChanges } from "./validate.js";

// Blocking conflict dialog raised when save-products answers 409: another admin
// published products.json after this device loaded its draft (issue #23).
// Nothing is written until the admin picks one of three explicit outcomes —
// load the server's version, overwrite it, or back out and keep editing.

const Row = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-cream2 py-1.5 last:border-0">
    <span className="text-xs text-[#8a8170]">{label}</span>
    <span className="truncate text-xs font-medium text-ink">{value}</span>
  </div>
);

export default function ConflictDialog({ open, conflict, draft, onLoadLatest, onOverwrite, onCancel }) {
  if (!open || !conflict) return null;

  const live = Array.isArray(conflict.liveProducts) ? conflict.liveProducts : [];
  const yours = Array.isArray(draft) ? draft : [];
  const diff = summarizeChanges(yours, live);
  const stamp = conflict.updatedAt
    ? new Date(conflict.updatedAt).toLocaleString()
    : "a moment ago";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Publishing conflict"
    >
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-cream2 bg-white shadow-card sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-cream2 px-6 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <AlertTriangle className="h-4 w-4 text-wine-500" /> Someone else published first
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
          <p className="text-sm leading-relaxed text-[#6b6353]">
            products.json on the server was updated {stamp}
            {conflict.updatedBy ? ` by ${conflict.updatedBy}` : ""}, after this device loaded its
            copy. Publishing now would replace their work, so nothing has been saved yet.
          </p>

          <div className="mt-4 rounded-xl border border-cream2 bg-cream/40 px-4 py-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8170]">
              Server vs your draft
            </p>
            <Row label="Published products" value={`${live.length} on server · ${yours.length} in your draft`} />
            <Row label="You would add" value={`${diff.added}`} />
            <Row label="You would change" value={`${diff.updated}`} />
            <Row label="You would remove" value={`${diff.deleted}`} />
            <Row
              label="Server revision"
              value={conflict.currentSha ? conflict.currentSha.slice(0, 7) : "unknown"}
            />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-[#6b6353]">
            <span className="font-semibold text-ink">Load the latest</span> replaces this device&apos;s
            draft with the server version — your unsaved edits are discarded, so save a backup
            first if you need them.{" "}
            <span className="font-semibold text-ink">Overwrite anyway</span> discards the server
            version and publishes your draft, including any new photos already uploaded.
          </p>
        </div>

        <div className="space-y-3 border-t border-cream2 px-6 py-4">
          <button
            type="button"
            onClick={onLoadLatest}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-ink/15 bg-white px-5 text-sm font-semibold text-ink transition hover:border-agold-500 active:scale-95"
          >
            <RefreshCw className="h-4 w-4" /> Load the latest and discard my draft
          </button>
          <button
            type="button"
            onClick={onOverwrite}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-cream transition hover:bg-wine-500 active:scale-95"
          >
            <Upload className="h-4 w-4" /> Overwrite with my draft
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-cream2 text-xs font-semibold text-[#8a8170] transition hover:border-ink/20 hover:text-ink active:scale-95"
          >
            <GitMerge className="h-3.5 w-3.5" /> Cancel — keep editing
          </button>
        </div>
      </div>
    </div>
  );
}