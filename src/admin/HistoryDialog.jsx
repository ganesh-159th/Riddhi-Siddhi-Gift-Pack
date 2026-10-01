import { useEffect, useState } from "react";
import {
  X,
  History,
  RotateCcw,
  Loader2,
  CheckCircle,
  AlertTriangle,
  User,
  Clock,
  GitCompare,
  GitBranch,
} from "lucide-react";
import { diffLines, squashDiff } from "./diff.js";

// Version history & rollback (issue #20). Shows the git commit history of
// products.json, lets the admin diff any two versions and restore to any
// previous one. Reads go through history-products; the restore write goes
// through rollback-products — both session-guarded like the rest of the panel.

const prettyProducts = (content) => {
  try {
    const products = content && Array.isArray(content.products) ? content.products : [];
    return JSON.stringify(products, null, 2);
  } catch {
    return "";
  }
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }) + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

const revisionLabel = (revs, sha) => {
  const r = (Array.isArray(revs) ? revs : []).find((x) => x.sha === sha);
  return r ? r.short : String(sha || "").slice(0, 7);
};

export default function HistoryDialog({ open, token, post, onClose, onRestored }) {
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromSha, setFromSha] = useState("");
  const [toSha, setToSha] = useState("");
  const [diff, setDiff] = useState(null); // { a, b, added, removed, lines } | { error }
  const [comparing, setComparing] = useState(false);
  const [restoring, setRestoring] = useState(null); // revision
  const [restoreNotes, setRestoreNotes] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [status, setStatus] = useState(null);

  // ---- load the revision list every time the dialog opens ----
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRevisions([]);
    setDiff(null);
    setRestoring(null);
    setRestoreNotes("");
    setStatus(null);
    post("history-products", { token, action: "list" })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.d?.message || "Could not load version history.");
          setLoading(false);
          return;
        }
        const revs = Array.isArray(res.d?.revisions) ? res.d.revisions : [];
        setRevisions(revs);
        setLoading(false);
        if (revs.length >= 2) {
          setFromSha(revs[revs.length - 1].sha);
          setToSha(revs[0].sha);
        } else if (revs.length === 1) {
          setFromSha(revs[0].sha);
          setToSha(revs[0].sha);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message || e) || "Could not load version history.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // ---- auto-compare whenever both versions are selected ----
  useEffect(() => {
    if (!open || !fromSha || !toSha || fromSha === toSha) return;
    let cancelled = false;
    setComparing(true);
    setDiff((d) => (d && d.error ? null : d));
    Promise.all([
      post("history-products", { token, action: "get", sha: fromSha }),
      post("history-products", { token, action: "get", sha: toSha }),
    ])
      .then(([a, b]) => {
        if (cancelled) return;
        if (!a.ok || !b.ok) {
          setDiff({ error: (a.d?.message || b.d?.message) || "Could not load one of the versions." });
          return;
        }
        const lines = squashDiff(diffLines(prettyProducts(a.d.content), prettyProducts(b.d.content)), 3);
        setDiff({
          a: fromSha,
          b: toSha,
          added: lines.filter((l) => l.type === "add").length,
          removed: lines.filter((l) => l.type === "del").length,
          lines,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setDiff({ error: String(e?.message || e) || "Could not compare these versions." });
      })
      .finally(() => {
        if (!cancelled) setComparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, fromSha, toSha]);

  const confirmRestore = async () => {
    if (!restoring) return;
    setRestoreBusy(true);
    setStatus(null);
    try {
      const res = await post("rollback-products", {
        token,
        sha: restoring.sha,
        notes: restoreNotes,
      });
      if (!res.ok) {
        setStatus({ msg: res.d?.message || "Restore failed.", isError: true });
        return;
      }
      if (res.d?.conflict) {
        setStatus({ msg: res.d.message || "Restore failed — products.json changed on the server.", isError: true });
        setRestoring(null);
        return;
      }
      setStatus({ msg: res.d?.message || "Restored. Your live site will redeploy in about a minute.", isError: false });
      if (Array.isArray(res.d?.products)) onRestored(res.d.products, res.d.sha);
      setRestoring(null);
      setRestoreNotes("");
      const lst = await post("history-products", { token, action: "list" });
      if (lst.ok && Array.isArray(lst.d?.revisions)) setRevisions(lst.d.revisions);
    } catch (e) {
      setStatus({ msg: String(e?.message || e) || "Restore failed.", isError: true });
    } finally {
      setRestoreBusy(false);
    }
  };

  if (!open) return null;

  const current = (revisions[0] && revisions[0].sha) || null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Product version history"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-cream2 bg-white shadow-card sm:max-w-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-cream2 px-6 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <History className="h-4 w-4 text-agold-600" /> Version history
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-[#8a8170] transition hover:border-wine-500 hover:text-wine-500 active:scale-95"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <p className="text-sm text-[#6b6353]">
            Every publish (and restore) creates a git commit of{" "}
            <span className="font-mono text-xs">products.json</span>. Pick two versions to compare, or
            restore to any earlier one — restoring creates a fresh commit, so nothing is overwritten.
          </p>

          {status && (
            <div
              className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                status.isError
                  ? "border-red-400/40 bg-red-500/10 text-red-600"
                  : "border-agold-400/40 bg-agold-500/10 text-agold-600"
              }`}
            >
              {status.isError ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle className="h-4 w-4 shrink-0" />}
              {status.msg}
            </div>
          )}

          {loading ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-[#6b6353]">
              <Loader2 className="h-4 w-4 animate-spin text-agold-600" /> Loading version history…
            </p>
          ) : error ? (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : !revisions.length ? (
            <p className="mt-5 text-sm text-[#8a8170]">No published versions yet.</p>
          ) : (
            <>
              {/* Revisions list */}
              <div className="mt-5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8a8170]">
                  <GitBranch className="h-3.5 w-3.5" /> Published versions
                </div>
                {revisions.map((r) => (
                  <div
                    key={r.sha}
                    className="flex gap-3 rounded-xl border border-cream2 bg-cream/40 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                            r.sha === current
                              ? "bg-agold-500/15 text-agold-600"
                              : "bg-ink/5 text-[#8a8170]"
                          }`}
                        >
                          {r.short}
                        </span>
                        {r.sha === current && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-agold-600">
                            Latest
                          </span>
                        )}
                      </div>
                      {r.message && (
                        <p className="mt-1.5 truncate text-sm font-medium text-ink">{r.message}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#8a8170]">
                        {r.author && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {r.author}
                          </span>
                        )}
                        {r.date && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {fmtDate(r.date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end justify-center gap-1.5">
                      {r.sha === current ? (
                        <span className="rounded-full border border-agold-400/40 bg-agold-500/10 px-3 py-1 text-[10px] font-semibold text-agold-600">
                          Current
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRestoring(r)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-full border border-wine-500/40 px-3 py-1 text-[11px] font-semibold text-wine-500 transition hover:bg-wine-500 hover:text-cream active:scale-95"
                        >
                          <RotateCcw className="h-3 w-3" /> Restore
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Compare */}
              <div className="mt-6 rounded-xl border border-cream2 bg-cream/40 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8a8170]">
                  <GitCompare className="h-3.5 w-3.5" /> Compare versions
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                  <label className="block">
                    <span className="text-[11px] font-medium text-[#6b6353]">From (older)</span>
                    <select
                      value={fromSha}
                      onChange={(e) => setFromSha(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-cream2 bg-white px-3 py-2.5 text-sm text-ink focus:border-agold-500"
                    >
                      {revisions.map((r) => (
                        <option key={r.sha} value={r.sha}>
                          {r.short} — {(r.message || "Update").slice(0, 40)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ArrowSwap />
                  <label className="block">
                    <span className="text-[11px] font-medium text-[#6b6353]">To (newer)</span>
                    <select
                      value={toSha}
                      onChange={(e) => setToSha(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-cream2 bg-white px-3 py-2.5 text-sm text-ink focus:border-agold-500"
                    >
                      {revisions.map((r) => (
                        <option key={r.sha} value={r.sha}>
                          {r.short} — {(r.message || "Update").slice(0, 40)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {comparing ? (
                  <p className="mt-4 flex items-center gap-2 text-sm text-[#6b6353]">
                    <Loader2 className="h-4 w-4 animate-spin text-agold-600" /> Comparing versions…
                  </p>
                ) : diff && diff.error ? (
                  <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-600">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {diff.error}
                  </p>
                ) : diff && diff.lines ? (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#6b6353]">
                      <span className="rounded-full border border-red-400/40 bg-red-500/10 px-2.5 py-1 font-semibold text-red-600">
                        − {diff.removed} removed
                      </span>
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-600">
                        + {diff.added} added
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-[#8a8170]">
                        {revisionLabel(revisions, diff.a)} → {revisionLabel(revisions, diff.b)}
                      </span>
                    </div>
                    <div className="mt-3 max-h-[40vh] overflow-auto rounded-xl border border-cream2 bg-ink p-3 text-[11px] leading-relaxed">
                      <DiffView diff={diff} />
                    </div>
                  </>
                ) : null}
              </div>

              {/* Restore confirm */}
              {restoring && (
                <div className="mt-6 rounded-xl border border-wine-500/30 bg-wine-500/5 p-4">
                  <p className="flex items-start gap-2 text-sm font-medium text-ink">
                    <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-wine-500" />
                    Restore products.json to{" "}
                    <span className="font-mono text-xs">{restoring.short}</span> (
                    {(restoring.message || "version") + "."})
                  </p>
                  <p className="mt-2 text-xs text-[#6b6353]">
                    This creates a new commit and the live site redeploys. Your current local draft
                    will be replaced by this version.
                  </p>
                  <label className="mt-3 block">
                    <span className="text-[11px] font-medium text-[#6b6353]">
                      Change summary (optional)
                    </span>
                    <input
                      value={restoreNotes}
                      onChange={(e) => setRestoreNotes(e.target.value)}
                      placeholder="e.g. Reverted pricing update for commander box"
                      maxLength={200}
                      className="mt-1 w-full rounded-xl border border-cream2 bg-white px-3 py-2.5 text-sm text-ink focus:border-wine-500"
                    />
                  </label>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRestoring(null)}
                      disabled={restoreBusy}
                      className="min-h-11 flex-1 rounded-full border border-ink/15 bg-white px-4 text-sm font-semibold text-ink transition hover:border-agold-500 active:scale-95 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmRestore}
                      disabled={restoreBusy}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-wine-500 px-4 text-sm font-semibold text-cream transition hover:bg-wine-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {restoreBusy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Restoring…
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4" /> Confirm restore
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const ArrowSwap = () => (
  <div className="hidden items-center justify-center pb-1 text-[#8a8170] sm:flex" aria-hidden="true">
    <span className="text-xs font-bold">&larr;</span>
    &nbsp;
    <span className="text-xs font-bold">&rarr;</span>
  </div>
);

const DiffView = ({ diff }) => {
  const { lines } = diff;
  return (
    <code className="block font-mono">
      {lines.map((l, i) => {
        if (l.type === "gap") {
          return (
            <div key={i} className="px-3 py-0.5 text-center text-[10px] text-[#8a8170]">
              ⋯ {l.count} unchanged lines ⋯
            </div>
          );
        }
        const cls =
          l.type === "add"
            ? "bg-emerald-500/20 text-emerald-200"
            : l.type === "del"
              ? "bg-red-500/20 text-red-300"
              : "text-[#a4a1b5]";
        const sign = l.type === "add" ? "+" : l.type === "del" ? "−" : " ";
        return (
          <div key={i} className={`flex whitespace-pre px-3 ${cls}`}>
            <span className="w-4 shrink-0 select-none">{sign}</span>
            <span className="overflow-x-auto">{l.line || " "}</span>
          </div>
        );
      })}
    </code>
  );
};