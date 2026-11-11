import { decisionLabel, statusLabel, eventLabel } from "./merchant-labels.js";
import { evidenceForm } from "./evidence-form.js";
import { esc, money, when, icon, badge, empty, facts } from "./ui.js";

const section = (title, body, name = "case", className = "", step = "") =>
  `<section class="card ${className}"><div class="case-section-head">${icon(name)}<h2>${title}</h2>${step ? '<span class="step-number">' + step + "</span>" : ""}</div>${body}</section>`;
const disclosure = (title, body, name = "audit", hint = "") =>
  `<section class="card evidence-card"><details class="card-details"><summary>${icon(name)}${title}${hint ? "<span>" + hint + "</span>" : ""}</summary>${body}</details></section>`;
function sidebar(c, data, busy) {
  const form = `<form id="case-create"><label>Payment<select name="capture" required>${data.captures.map((p) => `<option value="${esc(p.id)}">${esc(p.id)} · ${money(p.remaining)} remaining</option>`).join("")}</select></label><label>Customer request<textarea name="message" rows="3" maxlength="4000" required placeholder="What happened, and what refund does the customer need?"></textarea></label><button class="primary" ${busy || !data.captures.length ? "disabled" : ""}>${icon("plus")} Open case</button>${!data.captures.length ? '<p class="muted">Create a test payment in Connections first.</p>' : ""}</form>`;
  const list = `<div class="case-list">${(data.cases || []).map((item) => `<button class="case-list-item ${item.id === c?.id ? "selected" : ""}" data-case-select="${esc(item.id)}" ${item.id === c?.id ? 'aria-current="true"' : ""}>${icon("case")}<span><strong>Case ${esc(item.id.slice(0, 8))}</strong><small>${esc(statusLabel(item.request?.status || item.draft?.status || "new"))}</small></span>${icon("chevron")}</button>`).join("") || '<p class="muted">Your cases will appear here.</p>'}</div>`;
  return (
    '<div class="case-sidebar">' +
    section(
      'Case navigator <span class="count-pill">' +
        (data.cases || []).length +
        "</span>",
      list,
      "case",
    ) +
    '<section class="card case-create-panel"><details class="case-create-disclosure" ' +
    (!c ? "open" : "") +
    "><summary>" +
    icon("plus") +
    ' Open a refund case</summary><p class="muted">Start with a payment and the customer’s own words.</p>' +
    form +
    '</details></section><div class="case-rail-note">' +
    icon("lock") +
    "<p>A recommendation is a starting point.<br><strong>Your policy holds the keys.</strong></p></div></div>"
  );
}
function conversation(c, stage) {
  const r = c.request,
    d = c.draft;
  const reached = r
    ? ["completed", "denied", "failed"].includes(r.status)
      ? 4
      : r.status === "approval"
        ? 2
        : 3
    : d?.status === "draft"
      ? 2
      : 1;
  return `<section class="card"><div class="case-header"><div><p class="eyebrow">REFUND INVESTIGATION</p><h2>Case ${esc(c.id.slice(0, 8))}</h2></div>${badge(r?.status || "", stage)}</div><ol class="case-progress" aria-label="Case progress">${["Request received", "Gather evidence", "Review proposal", "Track outcome"].map((label, i) => `<li class="${i < reached ? "done" : i === reached ? "current" : ""}" ${i === reached ? 'aria-current="step"' : ""}><span class="step-dot">${i < reached ? "✓" : i + 1}</span>${label}</li>`).join("")}</ol>${c.parent_id ? `<p class="case-linked">Follow-up of <button class="secondary" data-case-select="${esc(c.parent_id)}">the original blocked case ${icon("arrowUp")}</button></p>` : ""}${c.followupId ? `<p class="case-linked"><button class="secondary" data-case-select="${esc(c.followupId)}">View follow-up review ${icon("arrowUp")}</button></p>` : ""}<ol class="case-conversation" aria-label="Case conversation">${(c.messages || []).map((m) => `<li class="${m.kind === "question" ? "question" : ""}"><div class="conversation-heading"><strong>${esc({ customer: "Customer request", question: "Agent question", correction: "Customer correction", merchant: "Merchant review note" }[m.kind] || "Message")}</strong><small>${esc(when(m.created))}</small></div><p>${esc(m.message)}</p></li>`).join("")}</ol>${!r ? `<details ${d?.status === "clarification" ? "open" : ""}><summary>${d?.status === "clarification" ? "Answer the agent’s question" : "Add a customer reply or correction"}</summary><form id="case-reply"><label>Customer ${d?.status === "clarification" ? "answer" : "reply"}<textarea name="message" rows="2" maxlength="4000" required placeholder="Add the customer’s response…"></textarea></label><button class="secondary">Save reply ${icon("arrow")}</button><p class="muted">Saving clears the old recommendation. Investigate again using the updated conversation.</p></form></details>` : ""}</section>`;
}
function investigation(c, data, busy, operation) {
  const d = c.draft,
    r = c.request;
  const controls = !r
    ? `<div class="investigation-actions"><button class="primary" data-case-action="investigate" ${busy || !data.ai ? "disabled" : ""}>${icon("spark")} ${busy && operation === "investigate" ? "Investigating…" : d ? "Investigate again" : "Investigate case"}</button><button class="secondary" data-case-action="reload" ${busy ? "disabled" : ""}>${icon("refresh")} Refresh evidence</button></div>`
    : "";
  const loading =
    busy && operation === "investigate"
      ? '<div class="ai-progress" role="status"><span class="spinner"></span><div><strong>Building the evidence, then the recommendation.</strong><p>Reading payment, refund, policy, return and audit records. This can take a minute.</p></div></div>'
      : "";
  const result = d
    ? `<div class="recommendation"><div class="recommendation-meta"><div><span class="micro-label">${d.status === "clarification" ? "NEXT STEP" : "RECOMMENDED REFUND"}</span><div class="refund-value">${d.status === "clarification" ? "Needs clarification" : money(Math.round(Number(d.amount) * 100))}</div></div>${d.status === "draft" ? badge("", "Recommendation only") : badge("approval", "Customer reply needed")}</div><p>${esc(d.rationale)}</p>${d.status === "clarification" ? '<p class="case-warning">' + esc(d.question) + "</p>" : ""}</div><p class="case-record-footnote">${esc(d.model)} · ${(c.duration_ms / 1000).toFixed(1)}s investigation · ${d.citations.length} cited sources</p><details><summary>Investigation steps & cited evidence</summary><ol>${d.trace.map((t) => "<li>" + esc(t.tool.replaceAll("_", " ")) + " · " + esc(t.source) + "</li>").join("")}</ol>${d.evidence
        .filter((e) => d.citations.includes(e.id))
        .map(
          (e) =>
            '<div class="case-citation"><strong>' +
            esc(e.id) +
            "</strong><pre>" +
            esc(JSON.stringify(e.data || e, null, 2)) +
            "</pre></div>",
        )
        .join("")}</details>`
    : !loading
      ? `<div class="investigation-empty">${icon("spark")}<p>Five sources. One considered recommendation.<br>The investigator reads payment facts, previous refunds, policy, order and return records, and audit evidence.</p></div>`
      : "";
  return section(
    "Gemini investigation",
    '<p class="authority-label">READ-ONLY INTELLIGENCE · NOT AUTHORIZATION</p>' +
      controls +
      (!data.ai
        ? '<p class="case-warning">Configure Gemini in Connections to enable investigation.</p>'
        : "") +
      loading +
      (c.stale && !r
        ? '<p class="case-warning">The evidence or permissions changed. Investigate again before submitting.</p>'
        : "") +
      result,
    "spark",
    "investigation-card",
    "RECOMMENDATION",
  );
}
function outcome(c, busy) {
  const r = c.request,
    d = c.draft;
  let content;
  if (r) {
    content =
      '<div class="case-outcome-amount">' +
      money(r.amount) +
      "</div>" +
      facts([
        ["Outcome", statusLabel(r.status)],
        ["Decision", decisionLabel(r.reason)],
        ["Provider refund", r.provider_id || "No provider ID recorded"],
        ["Request", r.id.slice(0, 8)],
      ]) +
      `<div class="case-actions">${r.status === "approval" ? '<button class="primary" data-case-action="approve">Approve this refund</button><button class="secondary" data-case-action="reject">Reject</button>' : ""}${["pending", "unknown"].includes(r.status) ? '<button class="secondary" data-case-action="reconcile">Check provider outcome</button>' : ""}<button class="secondary" data-case-action="explain">Explain decision</button><button class="secondary" data-case-action="reload">${icon("refresh")} Refresh outcome</button></div><div id="case-explanation"></div>` +
      (r.status === "denied" && !c.followupId
        ? `<details><summary>Something changed? Start a follow-up.</summary><form id="case-reconsider"><label>What changed since this request was blocked?<textarea name="reason" rows="2" minlength="3" maxlength="1000" required></textarea></label><button class="secondary">Start a follow-up review ${icon("arrow")}</button><p class="muted">The original decision remains on record. A linked case opens for fresh investigation.</p></form></details>`
        : "");
  } else if (d?.status === "draft") {
    content = `<div class="case-next-action"><p>${c.preview.status === "approval" ? "This proposal needs your individual approval after submission." : c.preview.status === "denied" ? "Current policy blocks this proposal. You can record the blocked attempt for follow-up." : "Review the recommendation above. Submission checks the current policy and executes an allowed refund."}</p><button class="primary" data-case-action="submit" ${busy || c.stale ? "disabled" : ""}>${icon("shield")}${c.preview.status === "approval" ? "Submit for approval" : c.preview.status === "denied" ? "Record blocked proposal" : "Submit & execute refund"}</button></div>`;
  } else
    content =
      '<div class="case-next-action"><p>' +
      (d?.status === "clarification"
        ? "Add the customer’s reply above, then investigate again."
        : "Investigate the case to prepare a recommendation for review.") +
      "</p></div>";
  return section(
    "Policy, review & outcome",
    '<p class="authority-label">DETERMINISTIC AUTHORIZATION · PAYMENT CONTROL</p>' +
      content,
    "shield",
    "authorization-card",
    "YOUR NEXT ACTION",
  );
}
function paymentEvidence(c) {
  const f = c.facts;
  return disclosure(
    "Payment & merchant evidence",
    facts([
      ["Payment", f.payment.id],
      ["Original payment", money(f.payment.originalCents)],
      ["Remaining refundable", money(f.payment.remainingCents)],
      [
        "Return eligibility",
        f.payment.returnVerified ? "Merchant verified" : "Unverified",
      ],
      [
        "Return reference",
        f.payment.returnReview?.reference || "No review reference",
      ],
      ["Automatic limit", money(f.policy.auto)],
      ["Maximum per refund", money(f.policy.maximum)],
      ["Daily budget available", money(f.policy.available)],
    ]) +
      `<details><summary>Record merchant eligibility review</summary><p class="muted">Use your inspected return records. Customer claims alone do not verify eligibility.</p><form id="case-return"><label>Return-review reference<input name="reference" required minlength="3" maxlength="200" value="${esc(f.payment.returnReview?.reference || "")}" placeholder="RETURN-123 / inspection record"></label><label>Review decision<select name="verified"><option value="false" ${!f.payment.returnVerified ? "selected" : ""}>Not verified / ineligible</option><option value="true" ${f.payment.returnVerified ? "selected" : ""}>Verified eligible</option></select></label><button class="secondary">Save eligibility review</button></form></details>`,
    "wallet",
    money(f.payment.remainingCents) + " remaining",
  );
}
export function casePresentation({ c, data, busy, message, operation }) {
  const d = c?.draft,
    r = c?.request;
  const stage = r
    ? statusLabel(r.status)
    : d
      ? c.stale
        ? "Evidence changed"
        : d.status === "clarification"
          ? "Needs a reply"
          : c.preview?.status === "denied"
            ? "Needs attention"
            : "Ready for review"
      : "Needs investigation";
  const records = c
    ? '<div class="evidence-digest"><div>' +
      icon("wallet") +
      "<small>REFUNDABLE</small><strong>" +
      money(c.facts.payment.remainingCents) +
      "</strong></div><div>" +
      icon("shield") +
      "<small>RETURN REVIEW</small><strong>" +
      (c.facts.payment.returnVerified ? "Verified" : "Unverified") +
      "</strong></div><div>" +
      icon("search") +
      "<small>CITED SOURCES</small><strong>" +
      (c.draft?.citations.length ?? "Not yet investigated") +
      "</strong></div></div>" +
      paymentEvidence(c) +
      disclosure(
        "Order, return & policy",
        evidenceForm(c, data.mode),
        "book",
        c.facts.merchant?.record ? "Records imported" : "Add merchant records",
      ) +
      disclosure(
        "Case timeline",
        '<ol class="case-timeline">' +
          (c.timeline || [])
            .map(
              (e) =>
                `<li><strong>${esc(eventLabel(e.type))}</strong><small>${esc(when(e.at))} · #${e.seq}</small>${e.reason ? "<p>" + esc(decisionLabel(e.reason)) + "</p>" : ""}${e.status ? "<p>" + esc(statusLabel(e.status)) + "</p>" : ""}</li>`,
            )
            .join("") +
          "</ol>",
        "audit",
        (c.timeline || []).length + " events",
      ) +
      disclosure(
        "Prior refunds",
        c.facts.history.length
          ? c.facts.history
              .map(
                (p) =>
                  `<div class="case-history-row"><span><strong>${money(p.amount)}</strong><small>${esc(decisionLabel(p.reason))}</small></span>${badge(p.status)}</div>`,
              )
              .join("")
          : '<p class="muted">No previous requests on this payment.</p>',
        "arrows",
        c.facts.history.length + " requests",
      )
    : "";
  return (
    '<div class="case-layout">' +
    sidebar(c, data, busy) +
    '<div class="case-main">' +
    (message
      ? '<p class="case-message" role="status">' + esc(message) + "</p>"
      : "") +
    (busy && operation !== "investigate"
      ? '<div class="case-message" role="status"><span class="spinner"></span> Updating the case…</div>'
      : "") +
    (c
      ? '<div class="case-route-map" aria-label="Investigation sections"><a href="#case-context" data-case-jump="case-context">01 <span>Conversation</span></a><a href="#case-records" data-case-jump="case-records">02 <span>Evidence</span></a><a href="#case-intelligence" data-case-jump="case-intelligence">03 <span>Investigation</span></a><a href="#case-authority" data-case-jump="case-authority">04 <span>Authorization</span></a></div>' +
        '<div class="investigation-workbench"><div class="case-context-column"><div id="case-context" tabindex="-1">' +
        conversation(c, stage) +
        '</div><div id="case-records" tabindex="-1" class="case-records">' +
        records +
        '</div></div><div class="case-decision-column"><div id="case-intelligence" tabindex="-1">' +
        investigation(c, data, busy, operation) +
        '</div><div class="decision-bridge">' +
        icon("lock") +
        '<span>Recommendation crosses a policy boundary</span></div><div id="case-authority" tabindex="-1">' +
        outcome(c, busy) +
        "</div></div></div>"
      : section(
          "One case. A clear path to resolution.",
          empty(
            "Start with the customer’s request",
            "Select a payment, enter the request and open a case. Your investigator will gather evidence for review.",
            "case",
          ),
          "case",
        )) +
    "</div></div>"
  );
}
