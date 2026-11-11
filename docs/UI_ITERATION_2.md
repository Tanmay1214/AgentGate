# AgentGate — orchestration interface, iteration 2

## What changed

The overview no longer uses a full-width rectangular hero, tilted case card or four identical KPI tiles. Editorial typography sits beside an interactive six-stage orchestration canvas. The canvas shows the latest case's recorded state and labels the no-case version as illustrative. Each stage explains its authority and links to an existing working screen. No animation pretends that a backend investigation is running.

The operational composition emphasizes the approval queue, completed refund total, available policy budget, latest actual investigation timeline and independent configuration signals. Credentials-present indicators are explicitly not live health checks.

Refund Cases now uses a case navigator, an expandable new-case form, section navigation, conversation/evidence lane and investigation/authorization lane. Evidence summaries show actual refundable balance, return verification and citation count. Gemini is labeled read-only and recommendation-only. Deterministic policy and provider outcome have a separate visual treatment. The existing forms, evidence import, conversation, approval, reconsideration and reconciliation handlers remain in place.

Refund Requests, Agent Permissions, Evidence Search, Audit Trail, Connections and How it works share the new typography, surfaces, interaction states and responsive shell. AG Grid sorting, filtering, pagination and request inspection remain native AG Grid behavior.

## Reference patterns actually implemented

All three reference websites were opened in the built-in browser, including live component previews. Published registry sources were read before adaptation.

1. **Vengeance Spotlight Navbar:** pointer-position lighting adapted to the vertical sidebar. Native requestAnimationFrame updates one CSS variable; React and Framer Motion are not required. Active-state illumination is also available without a pointer.
   - https://www.vengenceui.com/components/spotlight-navbar
   - https://raw.githubusercontent.com/Ashutoshx7/VengeanceUI/main/public/r/spotlight-navbar.json
2. **Vengeance Perspective Grid:** projected, radially faded grid adapted as the orchestration canvas's restrained depth layer. One CSS background replaces the tile matrix. The six-stage workflow and connectors are custom AgentGate UI.
   - https://www.vengenceui.com/components/perspective-grid
   - https://raw.githubusercontent.com/Ashutoshx7/VengeanceUI/main/public/r/perspective-grid.json
3. **Free Skiper CssLink / Link001:** directional underline reveal and arrow motion used on contextual navigation actions. Keyboard focus remains visibly indicated.
   - https://skiper-ui.com/v1/skiper40
   - https://skiper-ui.com/r/skiper40.json

MotionPrompt's live catalog was inspected for editorial hierarchy and contrasting compositions. No template, testimonials, video assets or fabricated performance claims were copied. See THIRD_PARTY_NOTICES.md for Skiper attribution and the Vengeance MIT notice.

Additional custom motion includes short staged node entrances, page/text reveals, panel expansion, button feedback and a scan indicator only during an actual investigation request. Reduced-motion preferences disable all animation and pointer tracking. No new runtime dependency, remote font, image, inline script or weakened CSP was introduced.

## Files

- `public/command-center.js`: overview renderer, six-stage canvas and delegated interactions.
- `public/command.css`: responsive shell, operational layouts, case workspace and motion.
- `public/workspace-views.js`, `public/app.js`, `public/index.html`: presentation integration.
- `public/case-presentation.js`, `public/case-workspace.js`: investigative layout and accessible section navigation; API contracts unchanged.
- `server.mjs`: static allowlist entries for the new JS/CSS files only.
- `test/browser/workspace.spec.mjs`: updated viewport/metric assertions and canvas interaction coverage.
- `scripts/capture-ui.mjs`, `scripts/review-contact-sheet.mjs`: read-only screenshot/accessibility review and responsive contact sheets.

## Verification and limits

Review sizes are 1440×900, 1280×800, 768×1024 and 390×844, across all eight screens. Screenshots and the machine-readable report are in ignored `data/ui-review/`. Contact sheets were visually inspected at every size, with enlarged overview and case screenshots and built-in browser interaction checks. The automated browser suite runs in a disposable demo database with payment/AI credentials disabled; review of the existing PayPal workspace is read-only.

The app uses a single document scroll for the case workspace. AG Grid retains its necessary internal scrolling and a long case list can scroll within a bounded navigator on narrow layouts. Automated axe checks are not a complete accessibility certification. No new real PayPal purchase/refund or live Gemini request was made for this visual iteration.

No environment changes or manual setup are required in the existing installed workspace. Start with `npm run dev`; verification uses `npm test`, `npm run test:postman`, `npm run test:ui`, and `node scripts/capture-ui.mjs`. There is no configured bundler build, lint or typecheck task in this native JavaScript project. Changes remain local until explicitly committed/pushed.

Verified on 11 November 2026: 83/83 automated tests, 33/33 Postman assertions and 6/6 browser suites passed. The read-only running-workspace review covered 32 screen/viewport combinations without document overflow, page errors or detected axe WCAG A/AA violations. The final layout-only refinement was additionally checked by the all-screen browser suite. Contrast issues found in the conversation label, request queue and empty-case helper were corrected during the review.
