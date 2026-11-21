import { useState } from "react";
import { Box, Lock, LogIn, Loader2, AlertTriangle, CheckCircle } from "lucide-react";

// Admin login gate (issue #18): the whole admin panel stays hidden until the
// password is verified by the admin-login Lambda route, which returns a
// short-lived signed session token. Nothing is stored until login succeeds.

export default function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onLogin(password.trim(), remember);
    } catch (err) {
      setError(err && err.message ? err.message : "Could not log in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-cream2 bg-white p-8 shadow-soft">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-agold-400/50 bg-white">
            <Box className="h-6 w-6 text-agold-600" />
          </div>
          <h1 className="mt-5 font-semibold text-ink">Product Manager</h1>
          <p className="mt-1 text-sm text-[#8a8170]">Riddhi Siddhi Gift &amp; Pack</p>
          <p className="mt-1 text-xs text-[#8a8170]">Sign in with your admin password to continue.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label htmlFor="loginPassword" className="admin-label">
              Admin password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b5ab97]" />
              <input
                id="loginPassword"
                className="field pl-10"
                type="password"
                placeholder="Enter admin password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-[#6b6353]">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 accent-agold-600"
              />
              Keep me signed in on this device
            </label>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-wine-500/30 bg-wine-500/5 px-3 py-2.5 text-xs text-wine-500"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !password.trim()}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-cream transition hover:bg-agold-600 active:scale-95 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" /> Sign in
                </>
              )}
            </button>
          </form>

          {!remember && (
            <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-[#b5ab97]">
              <CheckCircle className="mt-0.5 h-3 w-3 shrink-0" />
              Your session ends automatically after a few hours — sign in again when it does.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}