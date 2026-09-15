const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const money = (n) => INR.format(n);

export const clock = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(ts) {
  const now = new Date();
  if (dayKey(ts) === dayKey(now.getTime())) return "Today";
  if (dayKey(ts) === dayKey(now.getTime() - 86400000)) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function tint(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function contrastInk(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l =
    (0.299 * ((n >> 16) & 255) +
      0.587 * ((n >> 8) & 255) +
      0.114 * (n & 255)) /
    255;
  return l > 0.55 ? "#262220" : "#f6f1e7";
}

export function draftMoney(raw) {
  if (!raw) return "";
  const [int, dec] = raw.split(".");
  const grouped = Number(int || "0").toLocaleString("en-IN");
  return `₹${grouped}${dec !== undefined ? "." + dec : ""}`;
}
