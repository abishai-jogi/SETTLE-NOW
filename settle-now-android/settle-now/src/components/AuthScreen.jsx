import { useState } from "react";
import Avatar from "./Avatar.jsx";
import Footer from "./Footer.jsx";
import { tint } from "../lib/format.js";

function Wordmark() {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-[0.5em] text-gold">Est. 2026</p>
      <h1 className="mt-4 font-display text-5xl text-charcoal sm:text-6xl">Settle Now</h1>
      <div className="gold-hairline mx-auto my-6 w-44" />
      <p className="text-lg italic text-faded">A quiet ledger for whoever shares the house.</p>
    </div>
  );
}

const fieldClass =
  "w-full rounded-lg border border-charcoal/25 bg-ivory px-4 py-3 font-body text-lg text-charcoal outline-none transition placeholder:text-faded/50 focus:border-gold";

export default function AuthScreen({ members, onSelect, onCreate, onAuthenticate, onDeleteAccount }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [welcome, setWelcome] = useState(null);
  const [showAccounts, setShowAccounts] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // member to delete

  const switchMode = (m) => {
    setMode(m);
    setError("");
  };

  const submit = (e) => {
    e.preventDefault();
    setError("");
    const n = name.trim();
    if (!n || !password) {
      setError("Please fill in both fields.");
      return;
    }
    if (password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    if (mode === "signup") {
      const member = onCreate(n, password);
      if (!member) {
        setError("That name is already taken.");
        return;
      }
      setPassword("");
      setWelcome(member);
    } else {
      const member = onAuthenticate(n, password);
      if (!member) {
        setError("Name or password is incorrect.");
        return;
      }
      setPassword("");
      onSelect(member.id);
    }
  };

  const handleAccountClick = (member) => {
    setName(member.name);
    setMode("login");
    setError("");
    setShowAccounts(false);
  };

  const handleDeleteConfirm = (member) => {
    onDeleteAccount(member.id);
    setConfirmDelete(null);
    setShowAccounts(false);
    setName("");
    setPassword("");
  };

  return (
    <div className="paper flex min-h-screen flex-col items-center px-4 py-6">
      <Wordmark />

      <div className="pop-in mt-4 w-full max-w-sm rounded-xl border border-gold/40 bg-ivory/70 p-7 shadow-xl sm:p-9">
        {welcome ? (
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.35em] text-gold">
              Welcome aboard
            </p>
            <h2 className="mt-2 font-display text-3xl text-charcoal">{welcome.name}</h2>
            <div className="gold-hairline my-6" />
            <div className="flex items-center justify-center gap-5">
              <Avatar person={welcome} size="lg" />
              <div className="flex items-center gap-3">
                <span className="text-sm italic text-faded">Your colour</span>
                <span
                  className="h-8 w-8 rounded-full ring-2 ring-offset-2 ring-charcoal/30"
                  style={{ backgroundColor: welcome.color }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelect(welcome.id)}
              className="mt-8 w-full rounded-lg bg-wine py-3.5 text-xs font-semibold uppercase tracking-[0.25em] text-ivory shadow transition enabled:hover:bg-[#8d2532] enabled:active:scale-[0.99]"
            >
              Continue
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-center gap-8">
              {[
                ["login", "Sign in"],
                ["signup", "Create account"],
              ].map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`border-b pb-2 text-xs uppercase tracking-[0.25em] transition ${mode === m ? "border-gold text-charcoal" : "border-transparent text-faded hover:text-charcoal"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <label htmlFor="auth-name" className="text-[10px] uppercase tracking-[0.25em] text-faded">
                  Name
                </label>
                <input
                  id="auth-name"
                  autoComplete={mode === "login" ? "username" : "off"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className={fieldClass}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="auth-password" className="text-[10px] uppercase tracking-[0.25em] text-faded">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className={`${fieldClass} tracking-widest`}
                />
              </div>

              {error && <p className="text-center text-sm italic text-wine">{error}</p>}

              <button
                type="submit"
                className="w-full rounded-lg bg-charcoal py-3.5 text-xs font-semibold uppercase tracking-[0.25em] text-ivory shadow transition enabled:hover:bg-black enabled:active:scale-[0.99]"
              >
                {mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>

            <p className="mt-6 text-center text-[11px] italic leading-relaxed text-faded">
              Credentials never leave this device — passwords are hashed and kept
              in local storage only.
            </p>
          </>
        )}
      </div>

      {/* ── Account dots → opens popup ─────────────────────────── */}
      {members.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAccounts(true)}
          className="mt-8 flex items-center gap-2 rounded-lg px-3 py-2 transition hover:bg-charcoal/5 active:scale-[0.98]"
        >
          {members.map((m) => (
            <span
              key={m.id}
              title={m.name}
              className="h-3 w-3 rounded-full ring-1 ring-black/15"
              style={{ backgroundColor: m.color, boxShadow: `0 0 6px ${tint(m.color, 0.5)}` }}
            />
          ))}
          <span className="ml-1 text-[10px] uppercase tracking-[0.25em] text-faded">
            {members.length} on the ledger
          </span>
        </button>
      )}

      <div className="mt-4 pb-2">
        <Footer />
      </div>

      {/* ── Account list popup ─────────────────────────────────── */}
      {showAccounts && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => { setShowAccounts(false); setConfirmDelete(null); }}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl border border-gold/30 bg-ivory p-5 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.35em] text-gold">Accounts</p>
              <button
                type="button"
                onClick={() => { setShowAccounts(false); setConfirmDelete(null); }}
                className="text-faded transition hover:text-charcoal"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleAccountClick(m)}
                    className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-charcoal/5 active:scale-[0.98]"
                  >
                    <Avatar person={m} size="sm" />
                    <span className="font-body text-sm text-charcoal">{m.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(m)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-wine/60 transition hover:bg-wine/10 hover:text-wine"
                    title="Delete account"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-4 text-center text-[10px] italic text-faded">
              Tap a name to sign in · tap 🗑 to delete
            </p>
          </div>
        </div>
      )}

      {/* ── Delete confirmation dialog ─────────────────────────── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-wine/30 bg-ivory p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <Avatar person={confirmDelete} size="md" />
              <div>
                <p className="font-display text-xl text-charcoal">{confirmDelete.name}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-faded">Account</p>
              </div>
            </div>

            <div className="gold-hairline my-4" />

            <p className="text-sm text-charcoal">
              Are you sure you want to permanently delete <strong>{confirmDelete.name}</strong>'s account?
            </p>
            <p className="mt-2 text-[11px] italic text-faded">
              This will remove all local data for this account. This cannot be undone.
            </p>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-charcoal/20 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-charcoal transition hover:bg-charcoal/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteConfirm(confirmDelete)}
                className="flex-1 rounded-lg bg-wine py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-ivory shadow transition hover:bg-[#8d2532] active:scale-[0.98]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
