export const money = (n: number | null | undefined, currency = "USD") => {
  if (n == null || Number.isNaN(n)) return "–";
  const sym = currency === "USD" ? "$" : "";
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}${sym}${s}${sym ? "" : ` ${currency}`}`;
};

export const signedMoney = (n: number | null | undefined, currency = "USD") =>
  n == null ? "–" : `${n > 0 ? "+" : ""}${money(n, currency)}`;

export const pct = (n: number | null | undefined, digits = 2) =>
  n == null || Number.isNaN(n) ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;

export const num = (n: number | null | undefined, digits = 2) =>
  n == null || Number.isNaN(n) ? "–" : n.toLocaleString("en-US", { maximumFractionDigits: digits });

export const toneOf = (n: number | null | undefined) =>
  n == null ? "text-muted" : n > 0 ? "text-up" : n < 0 ? "text-down" : "text-muted";

export function daysUntil(date: string): number {
  const t = new Date(date + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - now.getTime()) / 86_400_000);
}

export function timeAgo(ms: number | null) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function marketTime(sec: number) {
  return new Date(sec * 1000).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
