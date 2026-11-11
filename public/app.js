import { decisionLabel, statusLabel } from "./merchant-labels.js";
import { mountCaseWorkspace, destroyCaseWorkspace } from "./case-workspace.js";
import { mountReviewPanel } from "./review-panel.js";
import { mountRefundGrid, destroyRefundGrid } from "./refund-grid.js";
import { createDraftState } from "./draft-state.js";
import { renderWorkspaceView, viewNames } from "./workspace-views.js";
import { installCommandInteractions } from './command-center.js';
installCommandInteractions();
import { esc, money, when, icon, empty } from "./ui.js";

const drafting = createDraftState(),
  $ = (s) => document.querySelector(s);
let token = "",
  data,
  view = viewNames[location.hash.slice(1)]
    ? location.hash.slice(1)
    : "overview";
let navigationRevision = 0;
function notice(text, error = false) {
  if ($("#proposal").open) {
    $("#dialog-notice").hidden = false;
    $("#dialog-notice").textContent = text;
    $("#dialog-notice").classList.toggle("error", error);
  }
  $("#notice").hidden = false;
  $("#notice-text").textContent = text;
  $("#notice").classList.toggle("error", error);
}
async function api(path, body, signal) {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-AgentGate-Key": token },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "Request failed");
  return result;
}
function syncShell() {
  $("#mode").textContent =
    data.mode === "demo" ? "Simulated demo" : "PayPal Sandbox";
  $("#environment-label").textContent =
    data.mode === "demo" ? "Simulated payments" : "Test money only";
  const n = data.requests.filter((r) => r.status === "approval").length;
  $("#approval-count").textContent = n;
  $("#approval-count").hidden = !n;
  $("#rail-ai-status").textContent = data.ai
    ? "AI configured"
    : "Manual proposals";
}
function render() {
  destroyRefundGrid();
  destroyCaseWorkspace();
  $("#view").innerHTML = renderWorkspaceView(view, data);
  $("#view").dataset.view = view;
  $("#view").removeAttribute("aria-busy");
  if (view === "requests") {
    const select = mountReviewPanel({ host: $("#review-panel"), data, api });
    mountRefundGrid(data.requests, select);
  }
  if (view === "cases")
    mountCaseWorkspace({
      host: $("#case-workspace"),
      data,
      api,
      onState: (next) => {
        data = next;
        syncShell();
      },
    });
  $("#breadcrumb").textContent = viewNames[view];
  document.title = viewNames[view] + " · AgentGate";
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
    if (b.dataset.view === view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  syncShell();
}
async function refresh() {
  data = await api("state");
  render();
}
function toggleNavigation(open) {
  document.body.classList.toggle("nav-open", open);
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
  if (open) document.querySelector(".app-sidebar .active")?.focus();
  else $("#menu-toggle").focus();
}
async function navigate(next) {
  if (!viewNames[next]) return;
  const previous = view;
  destroyCaseWorkspace();
  $("#view").setAttribute("aria-busy", "true");
  const ticket = ++navigationRevision;
  try {
    const updated = await api("state");
    if (ticket !== navigationRevision) return;
    data = updated;
    view = next;
    if (location.hash !== "#" + view)
      history.pushState({ view }, "", "#" + view);
    render();
    document.body.classList.remove("nav-open");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
    window.scrollTo({ top: 0, behavior: "instant" });
    $("#view h1")?.focus({ preventScroll: true });
  } catch (error) {
    if (ticket !== navigationRevision) return;
    view = previous;
    render();
    notice(error.message, true);
  }
}
window.addEventListener("popstate", () =>
  navigate(
    viewNames[location.hash.slice(1)] ? location.hash.slice(1) : "overview",
  ),
);
window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1);
  if (viewNames[next] && next !== view) navigate(next);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("nav-open"))
    toggleNavigation(false);
  if (
    e.key === "Tab" &&
    document.body.classList.contains("nav-open") &&
    matchMedia("(max-width: 800px)").matches
  ) {
    const controls = [
      ...document.querySelectorAll(".app-sidebar a,.app-sidebar button"),
    ].filter((el) => el.getClientRects().length);
    const first = controls[0],
      last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
function syncDraftButtons() {
  const f = $("#proposal-form");
  f.querySelector("button[type=submit]").disabled = drafting.busy;
  $("#draft").disabled = drafting.busy || !data?.ai;
  $("#draft").innerHTML =
    icon("spark") + (drafting.busy ? " Drafting…" : " Draft with AI");
  $("#draft-note").classList.toggle("is-loading", drafting.busy);
}
function invalidateDraft(message) {
  drafting.invalidate();
  syncDraftButtons();
  $("#dialog-notice").hidden = true;
  $("#proposal-form").elements.amount.value = "";
  $("#draft-note").textContent = message;
}
$("#proposal").addEventListener("close", () => {
  drafting.invalidate();
  syncDraftButtons();
});
$("#proposal-form").addEventListener("input", (e) => {
  if (["note", "capture"].includes(e.target.name))
    invalidateDraft(
      "Request changed. Draft again or enter an amount manually.",
    );
  if (e.target.name === "amount") {
    drafting.invalidate();
    syncDraftButtons();
    $("#draft-note").textContent = "Manual amount. Policy checks still apply.";
  }
});
$("#capture-select").addEventListener("change", () =>
  invalidateDraft("Payment changed. Draft again or enter an amount manually."),
);
async function generateDraft() {
  const f = $("#proposal-form").elements,
    snapshot = { capture: f.capture.value, message: f.note.value };
  if (!snapshot.message.trim()) {
    notice("Enter the customer request first.", true);
    return;
  }
  const ticket = drafting.begin();
  syncDraftButtons();
  f.amount.value = "";
  $("#dialog-notice").hidden = true;
  $("#draft-note").textContent =
    "Drafting with " +
    data.aiModel +
    "… Temporary failures may be retried twice.";
  try {
    const result = await api("agent", snapshot, ticket.signal);
    if (
      !drafting.current(ticket) ||
      !$("#proposal").open ||
      f.capture.value !== snapshot.capture ||
      f.note.value !== snapshot.message
    )
      return;
    if (result.status === "clarification") {
      $("#draft-note").textContent = "Needs clarification: " + result.question;
      return;
    }
    f.amount.value = result.amount;
    $("#draft-note").textContent =
      "AI draft · " +
      result.model +
      " · " +
      result.rationale +
      " Review the amount before submitting.";
  } catch (error) {
    if (drafting.current(ticket) && error.name !== "AbortError")
      notice(error.message + " You can enter an amount manually.", true);
  } finally {
    drafting.finish(ticket);
    syncDraftButtons();
  }
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "menu-toggle") {
    toggleNavigation(!document.body.classList.contains("nav-open"));
    return;
  }
  if (["close-navigation", "nav-scrim"].includes(b.id)) {
    toggleNavigation(false);
    return;
  }
  if (b.id === "dismiss-notice") {
    $("#notice").hidden = true;
    return;
  }
  if (b.id === "retry-workspace") {
    location.reload();
    return;
  }
  if (b.id === "draft") {
    await generateDraft();
    return;
  }
  try {
    if (b.dataset.view || b.dataset.go) {
      await navigate(b.dataset.view || b.dataset.go);
      return;
    }
    if (b.hasAttribute("data-new")) {
      if (!data?.captures.length) {
        notice(
          "Create a test payment in Connections before proposing a refund.",
          true,
        );
        return;
      }
      drafting.invalidate();
      const form = $("#proposal-form");
      form.reset();
      form.elements.amount.value = "";
      $("#dialog-notice").hidden = true;
      $("#capture-select").innerHTML = data.captures
        .map(
          (c) =>
            '<option value="' +
            esc(c.id) +
            '">' +
            esc(c.id) +
            " · " +
            money(c.remaining ?? c.amount) +
            " remaining · " +
            (c.eligible ? "eligible" : "unverified") +
            "</option>",
        )
        .join("");
      form.elements.idem.value = crypto.randomUUID();
      syncDraftButtons();
      $("#draft-note").textContent = data.ai
        ? "Draft with AI, or enter the amount manually."
        : "Manual proposal mode · configure the AI key to enable drafting.";
      $("#proposal").showModal();
    }
    if (b.id === "manual") {
      invalidateDraft(
        "Manual entry selected. Enter the refund amount and review it before submitting.",
      );
      $("#proposal-form").elements.amount.focus();
    }
    if (b.id === "close-dialog") $("#proposal").close();
    if (b.id === "close-detail") $("#request-detail").close();
    if (b.dataset.detail) {
      const r = data.requests.find((r) => r.id === b.dataset.detail);
      if (r) {
        $("#detail-body").innerHTML =
          '<div class="detail-amount">' +
          money(r.amount) +
          "</div><dl>" +
          [
            ["Request", r.id],
            ["Payment", r.capture],
            ["Status", statusLabel(r.status)],
            ["Decision", decisionLabel(r.reason)],
            ["Customer request", r.note],
            ["PayPal refund", r.provider_id || "Not executed"],
            ["Requested", when(r.created)],
          ]
            .map(
              ([label, value]) =>
                "<dt>" + esc(label) + "</dt><dd>" + esc(value) + "</dd>",
            )
            .join("") +
          "</dl>";
        $("#request-detail").showModal();
      }
    }
    if (b.dataset.approve || b.dataset.reject) {
      b.disabled = true;
      await api("review", {
        id: b.dataset.approve || b.dataset.reject,
        accept: !!b.dataset.approve,
      });
      notice("Review recorded; refund outcome updated.");
      await refresh();
    }
    if (b.dataset.reconcile) {
      b.disabled = true;
      await api("reconcile", { id: b.dataset.reconcile });
      await refresh();
    }
    if (b.dataset.eligible) {
      b.disabled = true;
      await api("eligibility", {
        id: b.dataset.eligible,
        eligible: b.dataset.value === "true",
      });
      await refresh();
    }
  } catch (error) {
    notice(error.message, true);
  } finally {
    b.disabled = false;
  }
});
async function searchEvidence(form) {
  const box = $("#evidence-results"),
    button = form.querySelector("button");
  button.disabled = true;
  box.setAttribute("aria-busy", "true");
  box.innerHTML =
    '<div class="search-loading"><span class="spinner"></span><strong>Searching your evidence…</strong><p>Syncing operational records and retrieving matches.</p></div>';
  try {
    const r = await api(
      "evidence/search",
      Object.fromEntries(new FormData(form)),
    );
    if (!box.isConnected) return;
    box.innerHTML =
      '<div class="panel-title"><h2>' +
      esc(r.total) +
      ' matching records</h2><span class="muted">Up to 50 shown · synced ' +
      esc(when(r.lastSync)) +
      '</span></div><div class="evidence-records">' +
      r.results
        .map(
          (d) =>
            '<article class="evidence-item"><div class="event-heading"><p><span class="badge">' +
            esc(d.kind) +
            "</span> <strong>" +
            esc(d.type || statusLabel(d.status)) +
            "</strong></p><time>" +
            esc(when(d.at)) +
            "</time></div><p>" +
            esc(d.reason ? decisionLabel(d.reason) : d.eventType || "") +
            "</p><dl>" +
            [
              ["Payment", d.capture],
              ["Request", d.requestId],
              [
                "Amount",
                Number.isSafeInteger(d.amount) ? money(d.amount) : null,
              ],
              ["Audit sequence", d.seq],
              ["Audit hash", d.hash],
              ["Provider", d.providerId || d.resourceId],
            ]
              .filter(([, v]) => v !== undefined && v !== null && v !== "")
              .map(
                ([k, v]) =>
                  "<div><dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>",
              )
              .join("") +
            "</dl>" +
            (d.kind === "refund"
              ? '<button class="secondary" data-detail="' +
                esc(d.requestId) +
                '">Open refund details ' +
                icon("arrow") +
                "</button>"
              : "") +
            "</article>",
        )
        .join("") +
      "</div>" +
      (r.total
        ? ""
        : empty(
            "No matching evidence",
            "Try fewer search terms or broaden the filters.",
            "search",
          ));
  } catch (error) {
    if (box.isConnected)
      box.innerHTML = empty("Search could not complete", error.message, "info");
  } finally {
    button.disabled = false;
    box.removeAttribute("aria-busy");
  }
}
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === "evidence-form") {
    await searchEvidence(f);
    return;
  }
  if (f.id === "proposal-form" && drafting.busy) {
    notice("Wait for the draft, or choose Enter manually.", true);
    return;
  }
  const button = f.querySelector('button[type="submit"],button.primary');
  if (button) button.disabled = true;
  try {
    const v = Object.fromEntries(new FormData(f));
    if (f.id === "proposal-form") {
      const r = await api("propose", v);
      $("#proposal").close();
      notice(
        `${r.duplicate ? "Existing request" : "Request"}: ${statusLabel(r.status)} · ${decisionLabel(r.reason)}`,
      );
      await refresh();
    }
    if (f.id === "policy-form") {
      await api("policy", {
        enabled: !!v.enabled,
        auto: Math.round(Number(v.auto) * 100),
        maximum: Math.round(Number(v.maximum) * 100),
        daily: Math.round(Number(v.daily) * 100),
      });
      notice("Permissions updated.");
      await refresh();
    }
    if (f.id === "checkout-form") {
      const r = await api("checkout", v);
      if (!r.url) throw Error("PayPal did not return an approval link");
      location.href = r.url;
    }
  } catch (error) {
    notice(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
});
try {
  token = (await (await fetch("/api/session")).json()).token;
  if (location.pathname === "/checkout-return") {
    const id = new URLSearchParams(location.search).get("token");
    await api("capture", { id });
    history.replaceState({}, "", "/#requests");
    notice(
      "Sandbox payment captured. Review its eligibility in Refund requests.",
    );
    view = "requests";
  }
  await refresh();
} catch (error) {
  notice(error.message, true);
  $("#view").innerHTML =
    empty("Your workspace could not load", error.message, "info") +
    '<button class="primary" id="retry-workspace">Try again ' +
    icon("refresh") +
    "</button>";
  $("#view").removeAttribute("aria-busy");
}
