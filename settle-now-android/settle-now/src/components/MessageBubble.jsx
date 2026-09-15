import { clock, contrastInk } from "../lib/format.js";
import Avatar from "./Avatar.jsx";

export default function MessageBubble({ bill, person, mine }) {
  const fg = contrastInk(person.color);
  return (
    <div
      className={`flex items-end gap-2.5 py-1 ${mine ? "justify-end" : "justify-start"}`}
    >
      {!mine && <Avatar person={person} size="sm" />}
      <div
        className={`flex max-w-[78%] flex-col sm:max-w-[62%] ${mine ? "items-end" : "items-start"}`}
      >
        {!mine && (
          <span className="mb-1 ml-1 text-[10px] uppercase tracking-[0.22em] text-faded">
            {person.name}
          </span>
        )}
        <div
          className={`rounded-2xl px-4 py-2.5 shadow-md ring-1 ring-black/15 ${mine ? "rounded-br-md" : "rounded-bl-md"}`}
          style={{ backgroundColor: person.color }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <span
              className="text-[10px] uppercase tracking-[0.24em]"
              style={{ color: fg, opacity: 0.8 }}
            >
              {mine ? "You paid" : "Paid"}
            </span>
            <span
              className="text-[10px] tabular-nums"
              style={{ color: fg, opacity: 0.65 }}
            >
              {clock(bill.timestamp)}
            </span>
          </div>
          <div
            className="mt-0.5 font-display text-[1.35rem] leading-snug tabular-nums"
            style={{ color: fg }}
          >
            ₹{Number(bill.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
}
