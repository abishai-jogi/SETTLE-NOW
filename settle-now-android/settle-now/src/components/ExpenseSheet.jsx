import { useMemo, useState } from "react";
import { CHIP_AMOUNTS } from "../config/people.js";
import { draftMoney } from "../lib/format.js";
import { toPaise, formatPaise } from "../lib/money.js";
import { allocate } from "../lib/splitEngine.js";
import Avatar from "./Avatar.jsx";
import Numpad from "./Numpad.jsx";

const MODES = [
  { key: "EQUAL", label: "Equal" },
  { key: "EXACT", label: "Exact" },
  { key: "PERCENT", label: "Percent" },
  { key: "SHARES", label: "Shares" },
];

/**
 * Add-expense bottom sheet.
 *
 * Replaces the old "always split among everyone" hardcode:
 *  - participant picker (toggleable avatars, pre-filled with everyone)
 *  - "I am part of this split" toggle (payer_participates)
 *  - split-mode segmented control: Equal / Exact / Percent / Shares
 *  - live per-mode input with validation; EXACT blocks submit until the
 *    remaining-to-allocate figure reaches exactly ₹0.00 (integer paise)
 *
 * onSend receives a canonical bill:
 * { amount_paise, splitType, payerParticipates, splitAmongIds, shares[] }
 */
export default function ExpenseSheet({ user, members, onSend, onClose }) {
  const [draft, setDraft] = useState(""); // rupee-string amount, owned here
  const [mode, setMode] = useState("EQUAL");
  const [participantIds, setParticipantIds] = useState(() => members.map((m) => m.id));
  const [payerParticipates, setPayerParticipates] = useState(true);
  // per-participant draft values keyed by user id
  const [exactDrafts, setExactDrafts] = useState({});
  const [percentDrafts, setPercentDrafts] = useState({});
  const [weightDrafts, setWeightDrafts] = useState({});

  const amountPaise = toPaise(draft || "0");
  const amountValid = Number.isSafeInteger(amountPaise) && amountPaise > 0;

  const toggleParticipant = (id) => {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const num = (s) => {
    const v = Number(s);
    return s !== "" && Number.isFinite(v) && v >= 0 ? v : null;
  };

  // shares payload for the current mode, in the engine's shape
  const sharesPayload = useMemo(() => {
    if (mode === "EQUAL") return undefined;
    return participantIds.map((id) => {
      if (mode === "EXACT") return { user_id: id, amount_paise: toPaise(exactDrafts[id] || "0") || 0 };
      if (mode === "PERCENT") return { user_id: id, percent: num(percentDrafts[id]) ?? 0 };
      return { user_id: id, weight: num(weightDrafts[id]) ?? 0 };
    });
  }, [mode, participantIds, exactDrafts, percentDrafts, weightDrafts]);

  // live preview through the SAME engine the server uses
  const preview = useMemo(() => {
    if (!amountValid || participantIds.length === 0) return null;
    return allocate({
      amountPaise,
      userIds: participantIds,
      type: mode,
      shares: sharesPayload,
    });
  }, [amountPaise, participantIds, mode, sharesPayload, amountValid]);

  const remainingPaise = useMemo(() => {
    if (!amountValid || mode !== "EXACT") return null;
    const allocated = participantIds.reduce(
      (s, id) => s + (toPaise(exactDrafts[id] || "0") || 0), 0
    );
    return amountPaise - allocated;
  }, [mode, participantIds, exactDrafts, amountPaise, amountValid]);

  const participantList = participantIds.map((id) => members.find((m) => m.id === id)).filter(Boolean);

  const send = () => {
    if (!preview?.ok) return;
    const sharesForServer = mode === "EQUAL"
      ? undefined
      : preview.shares.map((s, i) => ({
          userId: s.user_id,
          ...(mode === "EXACT" ? { amount_paise: s.share_paise } : {}),
          ...(mode === "PERCENT" ? { percent: num(percentDrafts[s.user_id]) ?? 0 } : {}),
          ...(mode === "SHARES" ? { weight: num(weightDrafts[s.user_id]) ?? 0 } : {}),
        }));
    onSend({
      amount_paise: amountPaise,
      splitType: mode,
      payerParticipates,
      splitAmongIds: participantIds,
      shares: sharesForServer,
    });
  };

  const blocked =
    !amountValid ||
    participantIds.length === 0 ||
    !preview?.ok ||
    (mode === "EXACT" && remainingPaise !== 0);

  const perModeInput = (id) => {
    if (mode === "EQUAL") return null;
    if (mode === "EXACT") {
      const value = exactDrafts[id] ?? "";
      return (
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || /^\d{0,7}(\.\d{0,2})?$/.test(v)) {
              setExactDrafts((d) => ({ ...d, [id]: v }));
            }
          }}
          placeholder="0.00"
          className="w-24 rounded-md border border-charcoal/20 bg-ivory px-2 py-1 text-right text-sm tabular-nums text-charcoal outline-none focus:border-gold"
        />
      );
    }
    if (mode === "PERCENT") {
      const value = percentDrafts[id] ?? "";
      return (
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || /^\d{0,3}(\.\d{0,2})?$/.test(v)) {
              setPercentDrafts((d) => ({ ...d, [id]: v }));
            }
          }}
          placeholder="%"
          className="w-20 rounded-md border border-charcoal/20 bg-ivory px-2 py-1 text-right text-sm tabular-nums text-charcoal outline-none focus:border-gold"
        />
      );
    }
    const value = weightDrafts[id] ?? "";
    return (
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || /^\d{0,4}(\.\d{0,2})?$/.test(v)) {
            setWeightDrafts((d) => ({ ...d, [id]: v }));
          }
        }}
        placeholder="×"
        className="w-16 rounded-md border border-charcoal/20 bg-ivory px-2 py-1 text-right text-sm tabular-nums text-charcoal outline-none focus:border-gold"
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0" />
      <div
        className="pop-in relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-parchment shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3">
          <div className="h-1 w-8 rounded-full bg-charcoal/15" />
        </div>

        <div className="mx-auto max-w-3xl space-y-3 px-3 pb-5 pt-2">
          {/* Chips + amount field + numpad (unchanged behaviour) */}
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {CHIP_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setDraft(String(amt))}
                className="shrink-0 rounded-full border border-gold/50 bg-ivory px-4 py-1.5 text-sm text-ink shadow-sm transition hover:bg-gold/15 active:scale-95"
              >
                ₹{amt}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-charcoal/20 bg-ivory px-4 py-2 shadow-sm">
            <span className="whitespace-nowrap text-[10px] uppercase tracking-[0.25em] text-faded">
              {user.name} pays
            </span>
            <input
              readOnly
              tabIndex={-1}
              inputMode="none"
              value={draftMoney(draft)}
              placeholder="₹ 0"
              onMouseDown={(e) => e.preventDefault()}
              className="w-full min-w-0 bg-transparent text-right font-display text-2xl tabular-nums text-charcoal outline-none placeholder:text-faded/50"
            />
          </div>

          <Numpad
            onKey={(k) =>
              setDraft((d) => {
                if (k === "back") return d.slice(0, -1);
                if (k === ".") {
                  if (d.includes(".")) return d;
                  return d === "" ? "0." : d + ".";
                }
                if (!/^\d$/.test(k)) return d;
                if (d.includes(".")) {
                  return d.length - d.indexOf(".") <= 2 ? d + k : d;
                }
                if (d.length >= 7) return d;
                if (d === "0") return k;
                return d + k;
              })
            }
            onSend={send}
            canSend={!blocked}
            accentHex={user.color}
            label={amountValid ? `Record ${draftMoney(draft)}` : "Record payment"}
          />

          {/* Split mode segmented control */}
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-[0.25em] text-faded">Split mode</p>
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-charcoal/5 p-1">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                    mode === m.key ? "bg-charcoal text-ivory shadow-sm" : "text-faded hover:text-charcoal"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Payer participation toggle */}
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-gold/40 bg-ivory px-4 py-2.5 shadow-sm">
            <span className="text-xs text-charcoal">
              I am part of this split
              <span className="ml-2 text-[9px] uppercase tracking-[0.2em] text-faded">
                {payerParticipates ? "included" : "payer only"}
              </span>
            </span>
            <input
              type="checkbox"
              checked={payerParticipates}
              onChange={(e) => setPayerParticipates(e.target.checked)}
              className="h-4 w-4 accent-[#4f6f52]"
            />
          </label>

          {/* Participant picker */}
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-[9px] uppercase tracking-[0.25em] text-faded">
                Split between
              </p>
              <button
                type="button"
                onClick={() =>
                  setParticipantIds(
                    participantIds.length === members.length ? [] : members.map((m) => m.id)
                  )
                }
                className="text-[9px] uppercase tracking-[0.2em] text-gold transition hover:text-wine"
              >
                {participantIds.length === members.length ? "clear all" : "select all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => {
                const on = participantIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleParticipant(m.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-1.5 py-1 pr-3 transition active:scale-95 ${
                      on ? "border-gold/60 bg-gold/10 shadow-sm" : "border-charcoal/15 bg-ivory/60 opacity-50"
                    }`}
                  >
                    <Avatar person={m} size="sm" />
                    <span className="text-xs text-charcoal">{m.name}</span>
                    {on && <span className="text-[9px] text-sage">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Per-mode share editor + live preview */}
          {mode !== "EQUAL" && participantList.length > 0 && (
            <div className="rounded-lg border border-charcoal/15 bg-ivory/80 p-3">
              <p className="mb-2 text-[9px] uppercase tracking-[0.25em] text-faded">
                {mode === "EXACT" ? "Exact amounts" : mode === "PERCENT" ? "Percentages" : "Weights"}
              </p>
              <div className="space-y-1.5">
                {participantList.map((m) => {
                  const row = preview?.ok
                    ? preview.shares.find((s) => s.user_id === m.id)
                    : null;
                  return (
                    <div key={m.id} className="flex items-center gap-2">
                      <Avatar person={m} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-xs text-charcoal">{m.name}</span>
                      {perModeInput(m.id)}
                      {mode !== "EXACT" && row && (
                        <span className="w-20 text-right text-xs tabular-nums text-faded">
                          {formatPaise(row.share_paise)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {mode === "EXACT" && remainingPaise !== null && (
                <p
                  className={`mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] ${
                    remainingPaise === 0 ? "text-sage" : "text-wine"
                  }`}
                >
                  {remainingPaise === 0
                    ? "✓ fully allocated"
                    : `remaining to allocate: ${formatPaise(Math.abs(remainingPaise))}${remainingPaise < 0 ? " over" : ""}`}
                </p>
              )}
              {mode !== "EXACT" && !preview?.ok && preview && (
                <p className="mt-2 text-center text-[10px] text-wine">{preview.message}</p>
              )}
            </div>
          )}

          {blocked && amountValid && (
            <p className="text-center text-[10px] italic text-wine">
              {participantIds.length === 0
                ? "Select at least one participant."
                : !preview?.ok
                  ? preview?.message || "Check the split values."
                  : mode === "EXACT" && remainingPaise !== 0
                    ? "Exact amounts must add up to the total before recording."
                    : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
