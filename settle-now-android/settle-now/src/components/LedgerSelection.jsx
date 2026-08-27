import { useState } from "react";
import Avatar from "./Avatar.jsx";
import Footer from "./Footer.jsx";
import { tint } from "../lib/format.js";
import { fetchBalances, getLedgerMembers } from "../lib/storage.js";

function InviteChip({ code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="group flex w-full items-center gap-3 rounded-xl border-2 border-gold/60 bg-ivory px-4 py-3 shadow-sm transition hover:border-gold hover:shadow-md active:scale-[0.99]"
    >
      <div className="flex-1 text-left">
        <p className="text-[9px] uppercase tracking-[0.35em] text-faded">
          Invite Code
        </p>
        <p className="mt-0.5 font-mono text-xl font-bold tracking-[0.2em] text-wine">
          {code}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-gold/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-gold transition group-hover:bg-gold/25">
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}

export default function LedgerSelection({
  user,
  ledgers,
  members,
  onSelectLedger,
  onCreateLedger,
  onJoinLedger,
  onDeleteLedger,
  onLogout,
}) {
  const [mode, setMode] = useState(null); // null | "create" | "join"
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null); // ledger id being deleted
  const [deleteError, setDeleteError] = useState("");

  const myLedgers = ledgers.filter((l) => l.memberIds.includes(user.id));

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    const n = name.trim();
    if (!n) {
      setError("Please enter a ledger name.");
      return;
    }
    setCreating(true);
    try {
      const ledger = await onCreateLedger(n);
      if (ledger) {
        onSelectLedger(ledger.id);
      } else {
        setError("Something went wrong creating the ledger. Please try again.");
      }
    } catch (err) {
      console.error("Create ledger failed:", err);
      setError("Failed to create ledger. Check your browser and try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setError("");
    const c = code.trim().toUpperCase();
    if (!c) {
      setError("Please enter an invite code.");
      return;
    }
    try {
      const result = await onJoinLedger(c);
      if (result === null) {
        setError("No ledger found with that code.");
      } else if (result === "full") {
        setError("That ledger already has 10 members.");
      } else {
        onSelectLedger(result.id);
      }
    } catch (err) {
      console.error("Join ledger failed:", err);
      setError("Failed to join ledger. Check your connection and try again.");
    }
  };

  const handleDelete = async (ledger) => {
    setDeleteError("");
    const balances = await fetchBalances(ledger.id);
    const hasUnsettled = balances && Object.values(balances).some(v => Math.abs(v) > 0.005);
    const msg = hasUnsettled
      ? `There are unsettled balances in \"${ledger.name}\". Deleting it will not settle these balances. Are you sure you want to delete?`
      : `Are you sure you want to delete \"${ledger.name}\"?`;
    if (!window.confirm(msg)) return;
    setDeleting(ledger.id);
    try {
      const result = await onDeleteLedger(ledger.id);
      if (!result.ok) setDeleteError(result.error || "Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="paper flex min-h-screen flex-col items-center px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3">
          <Avatar person={user} size="md" />
          <div className="text-left">
            <p className="text-[9px] uppercase tracking-[0.25em] text-faded">
              Signed in as
            </p>
            <p className="font-display text-lg text-charcoal">{user.name}</p>
          </div>
        </div>
        <div className="gold-hairline mx-auto mt-5 w-32" />
        <h2 className="mt-4 font-display text-2xl text-charcoal">
          Your Ledgers
        </h2>
        <p className="mt-1 text-sm italic text-faded">
          Create a new ledger or join one with an invite code.
        </p>
      </div>

      {/* Create / Join Actions */}
      <div className="w-full max-w-sm space-y-3">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "create" ? null : "create");
            setError("");
            setName("");
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-wine py-3.5 text-xs font-semibold uppercase tracking-[0.25em] text-ivory shadow transition enabled:hover:bg-[#8d2532] enabled:active:scale-[0.99]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          Create New Ledger
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "join" ? null : "join");
            setError("");
            setCode("");
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gold/50 bg-ivory py-3.5 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal shadow-sm transition hover:border-gold hover:bg-gold/10 active:scale-[0.99]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
          Join Existing Ledger
        </button>
      </div>

      {/* Create Form */}
      {mode === "create" && (
        <form onSubmit={handleCreate} className="pop-in mt-5 w-full max-w-sm space-y-4 rounded-xl border border-gold/40 bg-ivory/70 p-5 shadow-md">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold">
            New Ledger
          </p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ledger name"
            className="w-full rounded-lg border border-charcoal/25 bg-ivory px-4 py-3 font-body text-lg text-charcoal outline-none transition placeholder:text-faded/50 focus:border-gold"
          />
          {error && (
            <p className="text-center text-sm italic text-wine">{error}</p>
          )}
          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-lg bg-charcoal py-3 text-xs font-semibold uppercase tracking-[0.25em] text-ivory shadow transition enabled:hover:bg-black enabled:active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? "Creating…" : "Create & Enter"}
          </button>
        </form>
      )}

      {/* Join Form */}
      {mode === "join" && (
        <form onSubmit={handleJoin} className="pop-in mt-5 w-full max-w-sm space-y-4 rounded-xl border border-gold/40 bg-ivory/70 p-5 shadow-md">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold">
            Join Ledger
          </p>
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Invite code"
            className="w-full rounded-lg border border-charcoal/25 bg-ivory px-4 py-3 font-mono text-xl font-bold uppercase tracking-[0.2em] text-charcoal outline-none transition placeholder:text-faded/50 focus:border-gold"
          />
          {error && (
            <p className="text-center text-sm italic text-wine">{error}</p>
          )}
          <p className="text-center text-[11px] italic text-faded">
            Joining uses the internet once; everything else works offline.
          </p>
          <button
            type="submit"
            className="w-full rounded-lg bg-charcoal py-3 text-xs font-semibold uppercase tracking-[0.25em] text-ivory shadow transition enabled:hover:bg-black enabled:active:scale-[0.99]"
          >
            Join & Enter
          </button>
        </form>
      )}

      {/* Existing Ledgers List */}
      {myLedgers.length > 0 && (
        <div className="mt-8 w-full max-w-sm">
          <p className="mb-3 text-[10px] uppercase tracking-[0.25em] text-faded">
            Your Ledgers
          </p>
          <div className="space-y-2">
            {myLedgers.map((ledger) => {
              const isCreator = ledger.createdBy === user.id;
              const memberCount = getLedgerMembers(ledger, members).length;
              return (
                <div key={ledger.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelectLedger(ledger.id)}
                    className="w-full rounded-xl border border-charcoal/15 bg-ivory/70 px-4 py-3 text-left shadow-sm transition hover:border-gold/50 hover:shadow-md active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-lg text-charcoal group-hover:text-wine">
                          {ledger.name}
                        </p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-faded">
                          {memberCount} member{memberCount !== 1 ? "s" : ""}
                          {" · "}
                          <span className="font-mono text-[10px] tracking-wider text-gold">
                            {ledger.inviteCode}
                          </span>
                        </p>
                      </div>
                      <svg className="ml-2 h-4 w-4 shrink-0 text-faded transition group-hover:text-wine" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </button>
                  {isCreator && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(ledger); }}
                      disabled={deleting === ledger.id}
                      className="absolute right-2 top-2 rounded-full p-1.5 text-faded/40 transition hover:bg-wine/10 hover:text-wine disabled:opacity-40"
                      title="Delete ledger"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {deleteError && (
        <p className="mt-4 w-full max-w-sm text-center text-sm italic text-wine">{deleteError}</p>
      )}

      {/* Empty state */}
      {myLedgers.length === 0 && !mode && (
        <div className="mt-10 text-center">
          <p className="text-sm italic text-faded">
            No ledgers yet. Create one or join with a code.
          </p>
        </div>
      )}

      {/* Logout */}
      <button
        type="button"
        onClick={onLogout}
        className="mt-auto pt-10 text-[10px] uppercase tracking-[0.25em] text-faded/60 transition hover:text-wine"
      >
        Sign out
      </button>

      <Footer />
    </div>
  );
}
