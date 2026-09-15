import { contrastInk } from "../lib/format.js";

export default function Numpad({ onKey, onSend, canSend, label = "Record payment", decimal = true, accentHex = "#7a1e2a" }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "", "0", "back"];
  const fg = contrastInk(accentHex);
  return (
    <div className="w-full space-y-1.5">
      <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
        {keys.map((k, i) =>
          k === "" ? (
            <span key={`spacer-${i}`} aria-hidden="true" />
          ) : (
            <button
              key={k}
              type="button"
              aria-label={k === "back" ? "Backspace" : k === "." ? "Decimal point" : k}
              onClick={() => onKey(k)}
              className="flex h-14 select-none items-center justify-center rounded-lg bg-charcoal font-display text-2xl text-ivory shadow-sm transition duration-75 hover:bg-ink active:scale-[0.97] active:bg-black sm:h-16 sm:text-[1.7rem]"
            >
              {k === "back" ? (
                <svg className="h-6 w-6 sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z" />
                </svg>
              ) : (
                k
              )}
            </button>
          )
        )}
      </div>
      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        className="flex h-14 w-full select-none items-center justify-center gap-2 rounded-lg text-xs font-semibold uppercase tracking-[0.25em] shadow transition duration-75 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:h-16"
        style={{
          backgroundColor: canSend ? accentHex : "rgba(115,104,89,0.35)",
          color: canSend ? fg : "rgba(246,241,231,0.5)",
        }}
      >
        {label}
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  );
}
