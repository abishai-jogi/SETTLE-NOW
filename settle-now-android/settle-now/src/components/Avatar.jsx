import { initials, contrastInk } from "../lib/format.js";

const sizes = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-lg",
};

export default function Avatar({ person, size = "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`${sizes[size]} inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-semibold shadow-sm ring-1 ring-black/10`}
      style={{ backgroundColor: person.color, color: contrastInk(person.color) }}
    >
      {initials(person.name)}
    </span>
  );
}
