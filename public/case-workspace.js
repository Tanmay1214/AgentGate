import {
  recordFromForm,
  fillEvidenceForm,
  sampleRecord,
} from "./evidence-form.js";
import { casePresentation } from "./case-presentation.js";
let selected = "",
  active = null;
export function destroyCaseWorkspace() {
  active?.abort();
  active = null;
}
export function mountCaseWorkspace({ host, data, api, onState = () => {} }) {
  const controller = new AbortController();
  active = controller;
  let busy = false,
    message = "",
    operation = "";
  let c = data.cases?.find((c) => c.id === selected) || data.cases?.[0] || null;
  if (c) selected = c.id;
  function draw() {
    if (controller.signal.aborted) return;
    host.innerHTML = casePresentation({ c, data, busy, message, operation });
    if (busy)
      host
        .querySelectorAll("button,input,textarea,select")
        .forEach((b) => (b.disabled = true));
  }
  async function run(fn, label = "update") {
    if (busy) return;
    const savedForms = [...host.querySelectorAll("form")].map((f) => ({
      id: f.id,
      values: [...new FormData(f)].filter(([, v]) => typeof v === "string"),
      open: f.closest("details")?.open,
    }));
    const openSections = [...host.querySelectorAll(".card-details")].map(
      (d) => d.open,
    );
    let failed = false;
    busy = true;
    operation = label;
    message = "";
    draw();
    try {
      await fn();
    } catch (e) {
      failed = true;
      if (!controller.signal.aborted) message = e.message;
    } finally {
      busy = false;
      operation = "";
      if (!controller.signal.aborted) {
        draw();
        host
          .querySelectorAll(".card-details")
          .forEach((d, i) => (d.open = openSections[i] || false));
        if (failed)
          for (const saved of savedForms) {
            const f = host.querySelector("#" + saved.id);
            if (!f) continue;
            for (const [k, v] of saved.values) {
              const field = f.elements.namedItem(k);
              if (field && field.type !== "file") field.value = v;
            }
            if (saved.open && f.closest("details")) {
              f.closest("details").open = true;
              const parent = f.closest(".card-details");
              if (parent) parent.open = true;
            }
          }
      }
    }
  }
  host.onclick = async (e) => {
    const jump = e.target.closest("[data-case-jump]");
    if (jump) {
      e.preventDefault();
      e.stopPropagation();
      const target = host.querySelector("#" + jump.dataset.caseJump);
      if (jump.dataset.caseJump === "case-records")
        target?.querySelector("details")?.setAttribute("open", "");
      target?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      target?.focus({ preventScroll: true });
      return;
    }
    const b = e.target.closest("button");
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.caseSelect) {
      selected = b.dataset.caseSelect;
      c = data.cases.find((c) => c.id === selected);
      message = "";
      draw();
      return;
    }
    if (!b.dataset.caseAction || !c) return;
    if (b.dataset.caseAction === "sample") {
      fillEvidenceForm(
        host.querySelector("#case-evidence"),
        sampleRecord(c),
        c.capture,
      );
      return;
    }
    await run(async () => {
      const action = b.dataset.caseAction;
      if (action === "explain") {
        const result = await api(
          "cases/explain",
          { id: c.request.id },
          controller.signal,
        );
        message =
          result.explanation +
          " Evidence: " +
          result.citations.map((e) => "audit #" + e.seq).join(", ") +
          " (" +
          result.source +
          "). " +
          (result.notice || "");
        return;
      }
      if (["approve", "reject"].includes(action))
        await api(
          "review",
          { id: c.request.id, accept: action === "approve" },
          controller.signal,
        );
      else if (action === "reconcile")
        await api("reconcile", { id: c.request.id }, controller.signal);
      else if (action === "submit")
        await api("cases/submit", { id: c.id }, controller.signal);
      else if (action === "investigate")
        c = await api("cases/investigate", { id: c.id }, controller.signal);
      c = await api("cases/get", { id: c.id }, controller.signal);
      data = await api("state", undefined, controller.signal);
      onState(data);
    }, b.dataset.caseAction);
  };
  host.onsubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.target,
      values = Object.fromEntries(new FormData(f));
    await run(async () => {
      if (f.id === "case-create") {
        c = await api(
          "cases/create",
          { id: crypto.randomUUID(), ...values },
          controller.signal,
        );
        selected = c.id;
      }
      if (f.id === "case-reply")
        c = await api(
          "cases/reply",
          { id: c.id, message: values.message, key: crypto.randomUUID() },
          controller.signal,
        );
      if (f.id === "case-evidence")
        c = await api(
          "cases/evidence",
          { id: c.id, record: recordFromForm(values, c.capture) },
          controller.signal,
        );
      if (f.id === "case-reconsider") {
        c = await api(
          "cases/reconsider",
          { id: c.id, reason: values.reason },
          controller.signal,
        );
        selected = c.id;
      }
      if (f.id === "case-return")
        c = await api(
          "cases/return-review",
          {
            id: c.id,
            reference: values.reference,
            verified: values.verified === "true",
          },
          controller.signal,
        );
      data = await api("state", undefined, controller.signal);
      onState(data);
    });
  };
  host.onchange = async (e) => {
    if (e.target.name !== "evidenceFile") return;
    const file = e.target.files?.[0];
    if (!file) return;
    const box = host.querySelector("#import-message");
    try {
      if (file.size > 24000) throw Error("Use a JSON file smaller than 24 KB");
      fillEvidenceForm(
        host.querySelector("#case-evidence"),
        JSON.parse(await file.text()),
        c.capture,
      );
      box.textContent = "Record loaded. Review the fields and save.";
    } catch (error) {
      box.textContent = "Could not load record: " + error.message;
    }
  };
  draw();
}
