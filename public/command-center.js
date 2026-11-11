import {
  esc,
  money,
  when,
  icon,
  badge,
  heading,
  newActions,
  textButton,
  panelHead,
  empty,
} from "./ui.js";
import { statusLabel, eventLabel, decisionLabel } from "./merchant-labels.js";

const stages = [
  [
    "case",
    "Customer request",
    "The customer’s words, linked to the original payment. Replies and corrections stay with the case.",
    "cases",
  ],
  [
    "search",
    "Evidence retrieval",
    "Payment facts, previous refunds, merchant records and audit evidence. Customer claims never grant eligibility.",
    "search",
  ],
  [
    "spark",
    "Gemini investigation",
    "A cited recommendation, not permission to move money. Missing facts trigger clarification.",
    "cases",
  ],
  [
    "shield",
    "Policy guardrails",
    "Deterministic checks enforce eligibility, balance, per-refund limits and the daily budget.",
    "policy",
  ],
  [
    "lock",
    "Merchant approval",
    "Above the automatic limit, a merchant must approve individually. Current policy is checked again.",
    "requests",
  ],
  [
    "arrows",
    "PayPal outcome",
    "An allowed request executes through PayPal. Uncertain results are reconciled; outcomes remain on record.",
    "audit",
  ],
];

export function orchestrationCanvas(c) {
  const r = c?.request,
    d = c?.draft;
  const states = [
    c ? "Received" : "Start here",
    c?.facts ? "Records available" : "Retrieve facts",
    d
      ? d.status === "clarification"
        ? "Clarification needed"
        : "Recommendation saved"
      : "Investigate",
    r
      ? decisionLabel(r.reason)
      : c?.preview
        ? statusLabel(c.preview.status) + " · preview"
        : "Check rules",
    r?.status === "approval" ? "Your review required" : "When policy requires",
    r?.provider_id ? statusLabel(r.status) : "Only after authorization",
  ];
  return `<div class="orchestration"><div class="canvas-caption"><span class="micro-label">${c ? "CASE " + esc(c.id.slice(0, 8)) + " · RECORDED STATE" : "ILLUSTRATIVE WORKFLOW · NO ACTIVE CASE"}</span><span>SELECT A STAGE</span></div><div class="network-grid"><div class="rail-path" aria-hidden="true"></div>${stages.map(([name, title, copy, route], i) => `<button class="flow-node node-${i} ${i === 2 ? "agent-node" : ""}" data-stage="${i}" aria-expanded="${i === 0}" aria-controls="stage-inspector"><span class="node-top"><span class="node-icon">${icon(name)}</span><span class="node-number">0${i + 1}</span></span><strong>${title}</strong><small>${esc(states[i])}</small></button>`).join("")}</div><div class="stage-inspector" id="stage-inspector" aria-live="polite"><span class="stage-index">01</span><div><strong>${stages[0][1]}</strong><p>${stages[0][2]}</p></div>${textButton("Open", stages[0][3])}</div></div>`;
}

export function renderCommandCenter(data) {
  const p = data.policy,
    latest = data.cases?.[0],
    approvals = data.requests.filter((r) => r.status === "approval"),
    done = data.requests.filter((r) => r.status === "completed");
  const used = p.daily
    ? Math.min(100, Math.round((data.reserved / p.daily) * 100))
    : 0;
  return (
    heading(
      "Command center",
      "Intelligence in motion. Authority in your hands.",
      newActions(),
      "AGENTGATE / OPERATIONS",
    ) +
    `<section class="command-hero" aria-labelledby="hero-title"><div class="command-copy"><p class="hero-eyebrow">THE REFUND ORCHESTRATION LAYER</p><h2 id="hero-title">Every refund.<br><span>Investigated.</span><br>Verified.<br><em>Controlled.</em></h2><p>From a customer’s words to a payment decision. Every step connected. Every boundary enforced.</p><button class="text-link" data-go="cases">Enter the investigation ${icon("arrow")}</button></div>${orchestrationCanvas(latest)}</section>
  <div class="ops-strip"><span>${icon("lock")} ${data.mode === "sandbox" ? "PAYPAL SANDBOX · TEST MONEY" : "DEMO · SIMULATED PAYMENTS"}</span><span>${icon("shield")} ${data.integrity.valid ? "Audit chain intact" : "Audit needs attention"} · ${data.integrity.count || 0} events</span><button data-go="setup">${icon("plug")} Connections ${icon("arrowUp")}</button></div>
  <div class="command-bento"><section class="review-spotlight"><div class="micro-label">HUMAN DECISION REQUIRED</div><div class="review-count">${approvals.length}<span>awaiting<br>your review</span></div><p>${approvals.length ? "These proposals cannot proceed without individual merchant approval." : "Your approval queue is clear. New requests above the automatic limit will appear here."}</p>${approvals
    .slice(0, 2)
    .map(
      (r) =>
        `<button class="approval-row" data-detail="${esc(r.id)}"><span>Request ${esc(r.id.slice(0, 8))}</span><b>${money(r.amount)}</b>${icon("arrowUp")}</button>`,
    )
    .join(
      "",
    )}<button class="primary" data-go="requests">Open review queue ${icon("arrow")}</button></section>
  <section class="settlement-tile"><p class="micro-label">COMPLETED REFUNDS</p><div class="financial-number">${money(done.reduce((a, r) => a + r.amount, 0))}</div><p>${done.length} completed requests · USD</p><div class="settlement-bottom">${icon("arrows")} Provider outcomes recorded</div></section>
  <section class="boundary-tile"><div class="boundary-top"><span class="micro-label">POLICY ENVELOPE</span>${badge(p.enabled ? "active" : "paused")}</div><div class="budget-value">${money(Math.max(0, p.daily - data.reserved))}<small>available today · UTC</small></div><div class="segmented-budget" role="meter" aria-label="Daily allowance reserved" aria-valuenow="${used}" aria-valuemin="0" aria-valuemax="100">${Array.from({ length: 24 }, (_, i) => `<i class="${i < Math.ceil((used / 100) * 24) ? "reserved" : ""}"></i>`).join("")}</div><div class="boundary-facts"><span>Automatic limit <b>${money(p.auto)}</b></span><span>Per-refund maximum <b>${money(p.maximum)}</b></span></div>${textButton("Adjust boundaries", "policy")}</section>
  <section class="panel activity-deck">${panelHead("Latest investigation", textButton("All cases", "cases"))}${
    latest
      ? `<div class="latest-summary"><span class="case-monogram">${icon("case")}</span><div><strong>Case ${esc(latest.id.slice(0, 8))}</strong><p>${esc(latest.draft?.rationale || "Waiting for an evidence-backed investigation.")}</p></div>${badge(latest.request?.status || "", latest.request ? statusLabel(latest.request.status) : latest.draft ? "Recommendation saved" : "Needs investigation")}</div><div class="activity-rail">${
          (latest.timeline || [])
            .slice(-3)
            .map(
              (e) =>
                `<div><span class="rail-point"></span><strong>${esc(eventLabel(e.type))}</strong><small>${esc(when(e.at))}</small></div>`,
            )
            .join("") || '<p class="muted">No timeline events recorded yet.</p>'
        }</div>`
      : empty(
          "Ready for your first investigation",
          "Open a case to connect the conversation, evidence and outcome.",
        )
  }</section>
  <section class="signal-panel"><p class="micro-label">INDEPENDENT CHECKS</p><div class="signal-row">${icon("spark")}<span>Gemini recommends<small>${data.ai ? "Key configured" : "Not configured"} · no payment authority</small></span></div><div class="signal-row">${icon("shield")}<span>Policy authorizes<small>${data.requests.filter((r) => r.status === "denied").length} requests blocked by policy</small></span></div><div class="signal-row">${icon("search")}<span>Evidence supports<small>Elastic ${data.elastic?.configured ? "configured" : "not configured"}</small></span></div><p class="signal-note">Configuration is not a live connectivity check.</p></section></div>`
  );
}

// Delegated once: works across route redraws and preserves keyboard activation.
export function installCommandInteractions() {
  document.addEventListener("click", (e) => {
    const button = e.target.closest("[data-stage]");
    if (!button) return;
    const i = Number(button.dataset.stage),
      stage = stages[i];
    if (!stage) return;
    const canvas = button.closest(".orchestration");
    canvas
      .querySelectorAll("[data-stage]")
      .forEach((b) => b.setAttribute("aria-expanded", String(b === button)));
    canvas.querySelector(".stage-inspector").innerHTML =
      `<span class="stage-index">0${i + 1}</span><div><strong>${stage[1]}</strong><p>${stage[2]}</p></div>${textButton("Open", stage[3])}`;
  });
  // Spotlight Navbar (Vengeance UI): adapt pointer lighting to the vertical rail.
  const nav = document.querySelector(".app-sidebar");
  let frame = 0;
  nav.addEventListener("pointermove", (e) => {
    if (
      e.pointerType === "touch" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const bounds = nav.getBoundingClientRect();
      nav.style.setProperty("--spot-y", `${e.clientY - bounds.top}px`);
    });
  });
}
