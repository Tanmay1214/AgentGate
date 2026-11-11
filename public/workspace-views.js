import { decisionLabel, eventLabel, statusLabel } from "./merchant-labels.js";
import { renderCommandCenter } from "./command-center.js";
import {
  esc,
  money,
  when,
  icon,
  mark,
  badge,
  empty,
  heading,
  panelHead,
  newActions,
  textButton,
} from "./ui.js";

const overview = renderCommandCenter;
function requests(data) {
  return (
    heading(
      "Every request. A clear outcome.",
      "Review proposals, approve individual refunds and follow provider outcomes.",
      newActions(),
      "REFUND OPERATIONS",
    ) +
    `
  <div class="review-workbench"><section class="panel refund-grid-panel"><div class="queue-tabs" aria-label="Review queues">${[
    ["all", "All requests", data.requests.length],
    [
      "approval",
      "Needs approval",
      data.requests.filter((r) => r.status === "approval").length,
    ],
    [
      "uncertain",
      "Uncertain",
      data.requests.filter((r) =>
        ["pending", "unknown", "executing"].includes(r.status),
      ).length,
    ],
    [
      "blocked",
      "Policy blocks",
      data.requests.filter((r) => r.status === "denied").length,
    ],
  ]
    .map(
      ([key, label, n]) =>
        `<button data-refund-queue="${key}">${label}<span>${n}</span></button>`,
    )
    .join(
      "",
    )}</div><div class="grid-toolbar"><label>Search requests<input id="refund-search" type="search" placeholder="Payment, request or decision…"></label><label>Status<select id="refund-status"><option value="">All statuses</option>${["approval", "completed", "denied", "pending", "unknown", "failed"].map((s) => `<option value="${s}">${esc(statusLabel(s))}</option>`).join("")}</select></label><button id="clear-refund-filters" class="secondary">Clear filters</button></div><div id="refund-grid" class="ag-theme-quartz" aria-label="Refund review grid"></div><div class="grid-caption"><span>AG Grid Community · sort, filter and inspect requests.</span><button type="button" class="text-link" id="toggle-refund-date" aria-pressed="false">Show request dates</button></div></section><aside id="review-panel" class="card review-panel"></aside></div>
  <div class="section-heading"><div><p class="eyebrow">PAYMENT REGISTER</p><h2>Original payments</h2><p class="muted">Verify eligibility against your return records before authorising a refund.</p></div><span class="count-pill">${data.captures.length} payments</span></div><div class="panel"><div class="table-wrap"><table><thead><tr><th>Payment capture</th><th>Original amount</th><th>Remaining</th><th>Merchant eligibility</th></tr></thead><tbody>${data.captures.map((c) => `<tr><td class="table-id">${esc(c.id)}<small>${esc(c.label)}</small></td><td class="amount-cell">${money(c.amount)}</td><td>${money(c.remaining)}</td><td><button class="secondary eligibility-button" data-eligible="${esc(c.id)}" data-value="${!c.eligible}">${icon(c.eligible ? "check" : "shield")}${c.eligible ? "Eligible · mark unverified" : "Unverified · mark eligible"}</button></td></tr>`).join("")}</tbody></table>${!data.captures.length ? empty("No payments yet", "Create a PayPal test checkout in Connections.", "wallet") : ""}</div></div>`
  );
}
function policy(data) {
  const p = data.policy;
  return (
    heading(
      "Your rules are the guardrails.",
      "Deterministic checks enforce every limit, independently of the AI.",
      "",
      "AGENT PERMISSIONS",
    ) +
    `<div class="settings-layout"><form id="policy-form" class="card permission-form"><div class="card-heading"><span class="feature-icon">${icon("shield")}</span><div><h2>Support agent permissions</h2><p class="muted">Changes apply to subsequent actions and approval checks.</p></div></div><label class="switch"><span><strong>Allow refund proposals</strong><small>Pause or enable the agent’s refund permission.</small></span><input type="checkbox" name="enabled" role="switch" ${p.enabled ? "checked" : ""}></label>${[
      [
        "auto",
        "Automatic approval limit",
        "Allowed requests up to this amount can execute without a separate approval.",
      ],
      [
        "maximum",
        "Maximum per refund",
        "No individual refund may exceed this amount.",
      ],
      [
        "daily",
        "Daily refund budget",
        "Total allowance for refunds initiated in this workspace.",
      ],
    ]
      .map(
        ([key, label, copy]) =>
          `<label class="money-field"><span>${label}<small>${copy}</small></span><span class="currency-input"><span>USD</span><input aria-label="${label} in USD" name="${key}" type="number" min="0" step="0.01" value="${(p[key] / 100).toFixed(2)}" required></span></label>`,
      )
      .join(
        "",
      )}<div class="form-footer"><p class="muted">All amounts in US dollars.</p><button class="primary" type="submit">Save permissions ${icon("check")}</button></div></form><div class="settings-notes"><section class="card navy-card"><p class="eyebrow">PERMISSION BEFORE EXECUTION</p><h2>Intelligence within boundaries.</h2><p>The agent recommends. Your policy checks eligibility, balance and budget before a provider action.</p><div class="mini-flow"><span>Recommendation</span>${icon("arrow")}<span>Policy</span>${icon("arrow")}<span>PayPal</span></div></section><section class="card"><h3>How limits work</h3><ul class="explainer-list"><li>${icon("clock")}<span><strong>Daily windows use UTC</strong>Unresolved operations keep their reservations across day boundaries.</span></li><li>${icon("shield")}<span><strong>Approvals recheck the rules</strong>Current access, eligibility and funds are checked again when you approve.</span></li><li>${icon("lock")}<span><strong>AI cannot change permission</strong>Customer text and model outputs never grant eligibility or raise limits.</span></li></ul></section></div></div>`
  );
}
function audit(data) {
  return (
    heading(
      "The full story, on record.",
      "Inspect the sequence behind every proposal, review and provider outcome.",
      "",
      "AUDIT TRAIL",
    ) +
    `<div class="integrity-banner ${data.integrity.valid ? "" : "invalid"}"><span class="integrity-icon">${icon(data.integrity.valid ? "shield" : "info")}</span><div><h2>${data.integrity.valid ? "Your audit chain is intact." : "Audit chain verification failed."}</h2><p>${data.integrity.count || 0} linked events · SHA-256 integrity checks</p></div><span class="badge ${data.integrity.valid ? "completed" : "failed"}">${data.integrity.valid ? "Verified" : "Needs attention"}</span></div><p class="audit-note">Local tamper detection. The chain is not independently anchored outside this database.</p><section class="panel audit-list">${panelHead("Workspace timeline", '<span class="micro-label">MOST RECENT FIRST · IST</span>')}${data.events.length ? data.events.map((e) => `<article class="audit-event"><span class="event-icon">${icon(e.data.type === "PAYPAL_WEBHOOK" ? "plug" : e.data.type?.includes("POLICY") ? "shield" : e.data.type?.includes("AI") ? "spark" : "audit")}</span><div class="event-content"><div class="event-heading"><h3>${esc(eventLabel(e.data.type))}</h3><span class="muted">${esc(when(e.data.at))}</span></div><p>${esc(e.data.reason ? decisionLabel(e.data.reason) : e.data.status ? statusLabel(e.data.status) : e.data.capture ? "Payment " + e.data.capture : "Workspace activity recorded")}</p><details><summary>Inspect record <span>#${e.seq}</span></summary><pre>${esc(JSON.stringify(e.data, null, 2))}</pre><p class="hash-label">RECORD HASH</p><code>${esc(e.hash)}</code></details></div></article>`).join("") : empty("Your history starts here", "Workspace actions will appear in this timeline.", "audit")}</section>`
  );
}
function search(data) {
  return (
    heading(
      "Evidence, without the guesswork.",
      "Find the records behind a payment, refund or policy decision.",
      "",
      "EVIDENCE SEARCH",
    ) +
    `<div class="search-layout"><section class="card search-card"><div class="card-heading"><span class="feature-icon">${icon("search")}</span><div><h2>Search your workspace</h2><p class="muted">Powered by Elasticsearch · operational records only</p></div>${badge(data.elastic?.configured ? "active" : "paused", data.elastic?.configured ? "Configured" : "Not configured")}</div><form id="evidence-form"><label>Search terms<input name="query" type="search" maxlength="300" placeholder="Try a payment ID, completed or denied…"></label><div class="evidence-filters"><label>Record type<select name="kind"><option value="">All evidence</option><option value="refund">Refunds</option><option value="event">Audit events</option></select></label><label>Refund status<select name="status"><option value="">All statuses</option>${["approval", "completed", "denied", "pending", "unknown", "failed"].map((v) => `<option value="${v}">${esc(statusLabel(v))}</option>`).join("")}</select></label><label>Time window<select name="days"><option value="">All time</option><option value="1">Last day</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label></div><div class="form-footer"><p class="muted">New local records sync before each search.</p><button class="primary" ${data.elastic?.configured ? "" : "disabled"}>${icon("search")} Search evidence</button></div></form></section><div class="note-box">${icon("lock")}<span>Customer messages are excluded from the index. Search results support review; they never authorise a payment.</span></div></div><section id="evidence-results" aria-live="polite" class="panel search-results">${empty(data.elastic?.configured ? "The answer is in the records." : "Connect Elasticsearch to search.", data.elastic?.configured ? "Search a payment identifier or use filters to narrow the evidence." : "Configure the Elastic endpoint and API key locally, then restart the server.", "search")}</section>`
  );
}
function setup(data) {
  return (
    heading(
      "A connected control room.",
      "Payment execution, AI investigation and searchable evidence.",
      "",
      "CONNECTIONS",
    ) +
    `<div class="connection-grid"><section class="card connection-card"><div class="connection-top"><span class="provider-logo paypal-logo">P</span>${badge(data.configured ? "active" : "paused", data.configured ? "Credentials present" : "Not configured")}</div><p class="eyebrow">PAYMENT PROVIDER</p><h2>PayPal Sandbox</h2><p>Test checkout, capture, refunds and signed provider events.</p><div class="rule"><span>Execution environment</span><b>${data.mode === "sandbox" ? "Sandbox · test money" : "Simulated demo"}</b></div><div class="rule"><span>Webhook registration</span><b>${data.webhook ? "ID configured" : "Not configured"}</b></div><form id="checkout-form"><label>Create a test purchase<span class="currency-input"><span>USD</span><input aria-label="Test purchase amount in USD" name="amount" type="number" value="25.00" min="0.01" max="100" step="0.01" required></span></label><button class="primary full" ${data.mode !== "sandbox" ? "disabled" : ""}>Open PayPal test checkout ${icon("arrowUp")}</button></form><p class="muted">Use your sandbox Personal buyer. After capture, verify return eligibility before requesting a refund.</p><details><summary>Local configuration</summary><p class="muted">Set PAYPAL_ENV=sandbox and your sandbox Client ID and Secret in .env, then restart. Credentials present does not verify provider connectivity.</p></details></section><section class="card connection-card"><div class="connection-top"><span class="provider-logo gemini-logo">${icon("spark")}</span>${badge(data.ai ? "active" : "paused", data.ai ? "Key present" : "Not configured")}</div><p class="eyebrow">AI INVESTIGATOR</p><h2>Google Gemini</h2><p>Read-only investigation with cited evidence and structured recommendations.</p><div class="model-name">${esc(data.aiModel)}</div><ul class="explainer-list"><li>${icon("search")}<span>Retrieves payment, policy, refund and return evidence</span></li><li>${icon("shield")}<span>Validates amounts and asks for clarification</span></li><li>${icon("lock")}<span>Cannot execute a refund or change permissions</span></li></ul><details><summary>Local configuration</summary><p class="muted">Set GEMINI_API_KEY and optionally GEMINI_MODEL in .env, then restart. A configured key does not guarantee current provider availability.</p></details></section><section class="card connection-card"><div class="connection-top"><span class="provider-logo elastic-logo">${icon("search")}</span>${badge(data.elastic?.configured ? "active" : "paused", data.elastic?.configured ? "Configured" : "Not configured")}</div><p class="eyebrow">EVIDENCE RETRIEVAL</p><h2>Elasticsearch</h2><p>Search refund records and audit events, scoped to this workspace.</p><ul class="explainer-list"><li>${icon("audit")}<span>Operational metadata with verified local audit citations</span></li><li>${icon("refresh")}<span>Syncs local evidence before searching</span></li><li>${icon("lock")}<span>Customer messages stay out of the search index</span></li></ul><button class="secondary full" data-go="search">Open evidence search ${icon("arrow")}</button><details><summary>Local configuration</summary><p class="muted">Configure ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY in .env, then restart. Credentials remain on the backend.</p></details></section></div><div class="note-box">${icon("info")}<span>This is a local, single-merchant prototype. Connection badges indicate configuration, not a live service health check. All PayPal actions use test money.</span></div>`
  );
}
function guide() {
  return (
    heading(
      "A better path from request to refund.",
      "One workspace for the conversation, the evidence and the decision.",
      "",
      "THE AGENTGATE WORKFLOW",
    ) +
    `<section class="guide-hero navy-card"><p class="eyebrow">BUILT FOR MERCHANT OVERSIGHT</p><h2>Let the agent investigate.<br><span>Keep the final say.</span></h2><p>AgentGate brings AI investigation into a refund workflow with explicit permissions, individual review and a traceable outcome.</p><button class="primary light" data-go="cases">Open your first case ${icon("arrow")}</button></section><div class="guide-steps">${[
      [
        "01",
        "case",
        "Start with the customer",
        "Open a case against a payment. Keep the request, clarification replies and corrections in one conversation.",
      ],
      [
        "02",
        "search",
        "Bring the facts together",
        "Import order and return records. The investigator retrieves payment facts, prior refunds, policy and audit evidence.",
      ],
      [
        "03",
        "shield",
        "Apply your boundaries",
        "Review the recommendation. The policy engine enforces eligibility, amount limits and available budget. Larger refunds wait for approval.",
      ],
      [
        "04",
        "audit",
        "Follow the actual outcome",
        "PayPal confirms the refund. Inspect its status, signed webhook records and the linked audit trail.",
      ],
    ]
      .map(
        ([n, i, t, p]) =>
          `<article class="card"><div class="guide-step-top"><span>${n}</span>${icon(i)}</div><h2>${t}</h2><p>${p}</p></article>`,
      )
      .join(
        "",
      )}</div><div class="guide-bottom"><div><h2>Your next refund starts with a case.</h2><p class="muted">Already know the amount? Manual proposals use the same policy checks.</p></div>${newActions()}</div>`
  );
}
export const viewNames = {
  overview: "Overview",
  cases: "Refund cases",
  requests: "Refund requests",
  policy: "Agent permissions",
  search: "Evidence search",
  audit: "Audit trail",
  setup: "Connections",
  guide: "How it works",
};
export function renderWorkspaceView(view, data) {
  if (view === "cases")
    return (
      heading(
        "Bring the whole case into focus.",
        "Customer context, merchant evidence and a clear next action.",
        "",
        "REFUND CASES",
      ) + '<div id="case-workspace"></div>'
    );
  return (
    { overview, requests, policy, audit, search, setup, guide }[view] ||
    overview
  )(data);
}
