// Small, dependency-free presentation primitives. All record values are escaped.
import { statusLabel } from "./merchant-labels.js";
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const money = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value / 100,
  );
export const when = (value) =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " IST";
const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  case: "M8 6V4h8v2 M3 6h18v14H3z M3 11h18 M10 11v3h4v-3",
  arrows: "M4 7h15m-4-4 4 4-4 4 M20 17H5m4-4-4 4 4 4",
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z M8 12l3 3 5-6",
  search: "M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  audit: "M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4",
  plug: "M8 3v5 M16 3v5 M5 8h14v3a7 7 0 0 1-14 0z M12 18v4",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  arrowUp: "M6 18 18 6 M6 6h12v12",
  plus: "M12 5v14 M5 12h14",
  check: "M5 12l4 4L19 6",
  clock: "M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  wallet: "M4 6h15v15H4z M4 6V3h13v3 M15 11h6v5h-6z",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "m6 6 12 12 M6 18 18 6",
  chevron: "m9 5 7 7-7 7",
  refresh:
    "M20 7v5h-5 M4 17v-5h5 M5.5 7A8 8 0 0 1 20 12 M4 12a8 8 0 0 0 14.5 5",
  book: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3z M12 6v16",
  lock: "M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3",
  info: "M12 11v6 M12 7v.1 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
};
export function icon(name, cls = "") {
  return `<svg class="ui-icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.grid}"/></svg>`;
}
export const mark = () =>
  '<svg class="brand-mark" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m16 3 12 7v12l-12 7L4 22V10z" stroke="currentColor" stroke-width="1.5"/><path d="m16 10 6 3.5v5L16 22l-6-3.5v-5z" fill="currentColor"/><path d="M16 3v7m12 12-6-3.5M4 22l6-3.5" stroke="currentColor" stroke-width="1.5"/></svg>';
export const badge = (value, label = statusLabel(value)) =>
  `<span class="badge ${["active", "completed", "approval", "pending", "unknown", "denied", "failed", "executing", "paused"].includes(value) ? value : ""}">${esc(label)}</span>`;
export const empty = (title, copy, name = "case") =>
  `<div class="empty"><span class="empty-icon">${icon(name)}</span><strong>${esc(title)}</strong><p>${esc(copy)}</p></div>`;
export const heading = (
  title,
  sub,
  action = "",
  eyebrow = "MERCHANT WORKSPACE",
) =>
  `<div class="heading"><div><p class="eyebrow">${eyebrow}</p><h1 tabindex="-1">${title}</h1><p class="subtitle">${sub}</p></div>${action}</div>`;
export const panelHead = (title, action = "") =>
  `<div class="panel-title"><h2>${title}</h2>${action}</div>`;
export const newActions = () =>
  `<div class="heading-actions"><button class="secondary" data-new>Manual proposal</button><button class="primary" data-go="cases">${icon("plus")} New refund case</button></div>`;
export const textButton = (label, view) =>
  `<button class="text-link" data-go="${view}">${label}${icon("arrow")}</button>`;
export const facts = (items) =>
  '<dl class="case-facts">' +
  items
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join("") +
  "</dl>";
