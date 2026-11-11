# AgentGate interface redesign

## Repository audit

AgentGate is a local, single-merchant refund control desk. Its frontend is native JavaScript ES modules and HTML/CSS, served by Node, with AG Grid Community for request review. It has no React runtime, bundler, public authentication flow or remote merchant dashboard.

The existing journeys are preserved: PayPal checkout and capture; manual and AI-assisted proposals; case creation, conversation and investigation; merchant evidence import and eligibility review; policy enforcement; individual approval/rejection; uncertain-outcome reconciliation; linked reconsideration; Elastic evidence search; and the audit trail. Session headers, API paths, payload shapes, SQLite operations and PayPal/Gemini/Elastic adapters are unchanged. The server change only allowlists new presentation modules, favicon and font assets with correct content types.

The old interface gave similar weight to supporting records, long forms and immediate actions. Narrow-screen navigation became a long horizontal strip. The redesign prioritizes the real case workflow and the decision needing merchant attention.

## Direction and implementation

- Warm white surfaces, navy navigation and restrained cobalt actions. Shared CSS variables govern the palette, radii, typography and surfaces.
- Locally hosted Geist Variable with system fallbacks. No runtime font CDN or remote image requests.
- The overview is the entry point: editorial introduction, a real latest-case card, actual workspace metrics, recent refunds and agent boundaries. There is no marketing gate before the workspace.
- Refund cases show conversation, investigation and next action first. Payment facts, merchant records, prior refunds and the timeline remain available in expandable sections. Investigation has an explicit busy state and cited results.
- Request review retains AG Grid and all per-request controls, with counted queues and a details panel.
- Permissions, audit, search and provider configuration use the same primitives. How it works explains actual capabilities and routes to working actions.
- Mobile navigation uses a drawer, scrim, Escape dismissal and keyboard focus cycling. Hash deep links and browser history are supported. Reduced motion is honored; loading, empty, error and notification states are styled.

`public/ui.js` contains shared primitives; `workspace-views.js` contains screen templates; `case-presentation.js` contains case markup. Controllers retain API interactions and lifecycle behavior. No financial amounts or customer records are fabricated for the redesign.

## Reference exploration

1. [MotionPrompt](https://prompt-library-lemon-omega.vercel.app/) was inspected through its published HTML and public prompt catalog when the search tool could not render it. Its analytics dashboard entry informed product-interface storytelling. No prompt text, claims, video or template was copied.
2. [Skiper UI quick start](https://skiper-ui.com/docs/quick-start) and the free [CssLink / skiper40](https://skiper-ui.com/v1/skiper40) were inspected. The source is at `https://skiper-ui.com/r/skiper40.json`; the documented install command is `npx shadcn add @skiper-ui/skiper40`. The Link001 underline transform/origin pattern is adapted to `.text-link`. Attribution is in THIRD_PARTY_NOTICES.md. No Pro component is used.
3. [Vengeance Perspective Grid](https://www.vengenceui.com/components/perspective-grid), Spotlight Navbar and Kinetic Text Loader documentation and sources were inspected. Perspective Grid's source, at `https://raw.githubusercontent.com/Ashutoshx7/VengeanceUI/main/public/r/perspective-grid.json`, informed the native CSS hero background. A single background replaces its tile DOM. Navigation and loaders are custom native controls, not copies of its React API.

These registries target React/shadcn. Small published source patterns are adapted to the existing stack; no framework migration or shadcn CLI execution was needed. Full attribution and the Vengeance MIT notice are in THIRD_PARTY_NOTICES.md.

## Setup and verification

Run `npm ci`, then `npm run dev`. Asset preparation copies Geist's Latin font and SIL Open Font License from the pinned dependency. No new API keys or environment changes are required.

Run `npm run test:ui` after `npx playwright install chromium`. Playwright starts a disposable demo database on port 4320 with provider and AI credentials disabled. It checks the actual application, AG Grid, navigation, modal accessibility, automatic demo refunds, individual approvals, search filters, date-column controls, conversation replies, merchant evidence import, invalid-input recovery and permission saves.

For a read-only screenshot and accessibility review of the running local workspace, use `node scripts/capture-ui.mjs`. Screenshots and its JSON report go under ignored `data/ui-review/`. It waits for each requested view to finish loading before capture. It never opens checkout or submits a refund.

## Verification — 11 November 2026, Asia/Kolkata

- 83 existing automated tests passed.
- 33 Postman assertions passed against a separate disposable demo server.
- All five Playwright suites passed. Eight screens were checked at 1440, 768 and 375 CSS pixels, covering desktop, tablet and mobile.
- Each of those 24 screen/viewport combinations had no document overflow, no page/console errors, and no detected axe WCAG 2 A/AA or 2.1 AA violations. The proposal dialog also passed the automated accessibility check. Automated scans are not a complete accessibility certification.
- A second read-only Playwright pass inspected the existing Sandbox workspace with its real recorded case and signed webhook evidence. All 24 combinations had no document overflow or detected accessibility violations; screenshots were captured and key desktop/mobile layouts visually reviewed.
- The built-in browser tool continued to report disabled access. Following the user's explicit direction, visual verification used a separate Playwright Chromium session; Firefox was not used for the completed review.
- JavaScript syntax and Git whitespace checks passed. This native-module repository has no configured build, lint or typecheck command.

The redesign did not create a new PayPal purchase or refund. Provider behavior is covered by the existing tests and previously verified Sandbox records; browser workflow mutations used simulated money in the disposable database.
