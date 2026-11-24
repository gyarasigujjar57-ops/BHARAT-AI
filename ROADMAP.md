# BHARAT AI — Product & Engineering Roadmap

Last audited: 2026-11-24  
Repository: `gyarasigujjar57-ops/BHARAT-AI`  
Default branch: `main`

## Product direction

BHARAT AI is an all-in-one Hindi-first personal AI assistant for India. The highest-priority workflow is still **government forms and public-service applications**, followed by recruitment, education, documents, and everyday assistant tasks. The Android app and website/PWA should share one product experience.

## Verified repository baseline

### Present in the repository
- Responsive single-page Hindi-first chat UI (`index.html`, `styles.css`, `app.js`).
- Text chat calls the Cloudflare Worker streaming endpoint.
- Quick prompts for recruitment, forms, schemes, and documents.
- Snake King full-screen loading artwork and CSS animation.
- PWA manifest and a service-worker file.
- Android Java WebView shell; web assets are copied into the APK at build time.
- Cloudflare Worker source with Gemini streaming integration and Cloudflare Workers AI fallback.
- GitHub Actions Android debug-APK workflow.
- Cloudflare Worker `bharat-ai-api` was found deployed, with a Gemini API secret binding and a Workers AI binding. Secret values were not read.
- Latest inspected Android workflow run (run 53, commit `9105f2728f85bd5a1af596177cab84479973052e`) completed successfully and uploaded `BHARAT-AI-debug-APK` (about 1.15 MB).

### Not implemented or not verified
- No Firebase sign-in, account/profile, or cloud chat history code found.
- No local encrypted document vault or device-only profile.
- No chat attachment picker, camera capture, PDF upload, OCR, or image/PDF editing flow.
- No native Android bridge for file selection, camera, local OCR, image compression, or PDF tools.
- No portal reader, portal-specific form adapters, field matching, or form-filling automation.
- No live movable form-progress overlay.
- No persistent local chat history/drafts; current history is read from visible DOM messages.
- No voice input/output or language controls.
- No multi-screen navigation for profile, settings, saved work, notifications, etc.
- Service-worker registration is not present in the inspected `app.js`; offline caching is therefore not confirmed active.
- APK build success is verified; real-device feature behavior and end-to-end AI quality are not verified.

## Critical fixes before feature expansion

1. Repair the non-streaming Worker path: `generateWithFallback()` calls `callGemini()`, but no definition was found in `worker/index.js`. The health test also uses this path, so its current result is not a reliable Gemini-only test.
2. Unify model configuration: `wrangler.toml` sets `GEMINI_MODEL`, while Worker source hard-codes separate primary/fallback model IDs.
3. Add server-side validation, rate limits, request-size limits, abuse protection, and meaningful health diagnostics.
4. Replace permissive CORS with the deployed app/PWA origins where practical.
5. Review Cloudflare observability: the inspected Worker settings had persistent logs/traces enabled with full sampling. Ensure request bodies, chat text, document contents, tokens, and personal data are never logged; reduce or disable persistence where appropriate.
6. Add explicit client-side privacy routing before cloud calls. The current chat sends the message and recent text history to Cloudflare, and the Worker forwards chat text to Gemini. Sensitive form/profile/document values must never enter that route.
7. Fix the AI scope policy: current Worker rules deliberately reject many ordinary assistant requests. The all-in-one product needs safe intent routing across supported assistant modules, while keeping forms as the first-priority workflow.
8. Add automated tests for Worker endpoints, client state, PWA assets, Android packaging, and privacy boundaries.

## Privacy architecture — non-negotiable

- Documents, OCR results, Aadhaar/PAN details, address, bank details, photos, signatures, and the user's private master profile stay on the device by default.
- Local processing: document type detection, OCR, PDF page reading, image crop/resize/compression, photo/signature preparation, field matching, and local drafts.
- Gemini and the BHARAT AI Worker receive only the minimum non-sensitive question/context required. Sensitive values must be blocked or redacted on-device before any network request.
- Government portal submission is the explicit exception: when the user chooses to submit an online application, the required fields/documents go directly to that official portal. The portal must receive the application data to process it. BHARAT AI/Gemini must not proxy or store those values.
- User controls OTP, CAPTCHA, biometrics, payments, declarations, and final submission. Never silently submit.
- Use Android Keystore-backed encryption for local private data; provide clear local delete/export controls. Do not sync private documents or master-profile values by default.
- Do not claim “nothing leaves the phone” when the user opens a remote website or submits a form; normal network metadata and submitted form data reach the portal.

## Complete product modules

### P0 — Reliable foundation
- Fix Worker routes/model configuration and health checks.
- Add structured errors, timeouts, retry policy, safe request limits, rate limiting, and API tests.
- Establish staging and production environments; keep secrets out of Git.
- Add app version/build info and a visible service-status indicator.
- Create automated APK build + artifact retention + install smoke test.
- Register and test PWA service worker; add offline shell and graceful offline state.
- Add privacy-safe diagnostics and crash reporting that excludes message/document contents.

### P1 — Core app shell and chat
- Premium white/light UI, responsive Android and web layouts.
- Chat drawer/history, new chat, drafts, rename/delete, search, copy/share, retry, stop generation.
- Attachment button inside the chat composer (not separate OCR/crop/resize tool screens).
- Camera, gallery, files, PDF, and multiple attachment support.
- Voice input, text-to-speech/read-aloud, Hindi/Hinglish/English and Indian-language selection.
- Markdown, tables, links, progress cards, citations, and source labels.
- Local persistence and restoration after app restart.
- Settings, profile, notifications, help, privacy controls, and accessibility.

### P2 — All-in-one assistant
- General Q&A and explanation, writing/rewrite/translation, summarization, brainstorming, and learning help.
- Web research with source links and checked dates for current information.
- Study tools: syllabus, notes, practice questions, explanations, revision sets, and exam preparation.
- Recruitment/admission/scholarship/scheme discovery, eligibility comparison, deadline tracking, and official-source alerts.
- Everyday productivity: calculations, unit conversions, checklists, reminders, planning, and document drafting.
- Route each request to the right capability; do not pretend unavailable tools were used.

### P3 — On-device documents and media
- Encrypted local document vault with categories, labels, duplicate detection, and expiry reminders.
- On-device OCR for supported Indian scripts/languages; page-by-page PDF extraction.
- Document quality checks: blur, glare, cut-off edges, missing pages, and unreadable text.
- Extract fields into a review screen with source/page references and confidence scores.
- Master Profile with a source record for each field; detect conflicts and ask the user rather than guessing.
- In-chat image actions: crop, rotate, resize, convert format, compress to requested KB, and prepare passport-size photos.
- In-chat PDF actions: reorder, rotate, split, merge, compress, and extract pages/text.
- Photo background processing only where allowed; never alter identity/face features. User reviews every output.
- Local drafts and explicit delete/export controls.

### P4 — Government form assistant (top priority)
- Official-source registry and verified portal allowlist.
- Read official notifications and explain eligibility, dates, fees, required documents, and selection steps with citations.
- Start with one tested portal adapter at a time (first a safe test/demo form, then selected real portals).
- Read page title, URL, labels, required fields, dropdowns, validation messages, and upload requirements.
- Map reviewed local profile values to form fields; show mismatches and confidence before filling.
- Fill fields locally in the supported portal session; never send private field values to Gemini or the BHARAT AI backend.
- User-controlled OTP/CAPTCHA/biometrics/payment/declarations/final submit.
- Draggable/minimizable progress panel appears only after form assistance begins; show current portal/page, completed/remaining fields, warnings, user action, pause/resume/stop.
- Re-check page state after navigation, session expiry, or validation errors.
- Save local draft and produce a completion report; never claim successful submission without portal confirmation.
- Test portal-by-portal; universal automation cannot be promised because portals differ and may restrict embedded browsers or automation.

### P5 — Accounts, sync, and notifications
- Optional sign-in; clearly explain what account data is sent to the identity provider.
- Keep sensitive profile/documents device-only by default.
- Optional encrypted sync only after explicit opt-in and a separate threat-model review.
- Application history, saved notifications, reminders, and multi-device settings sync only non-sensitive metadata by default.
- Account recovery, logout, session management, and account deletion.

### P6 — Website, Android release, and operations
- Website/PWA parity with Android; install prompt and offline shell.
- Android file/camera permissions requested only when needed; robust WebView/native bridge.
- Test on real Android devices, slow networks, small screens, rotation, back navigation, and low storage.
- Accessibility, screen readers, large text, keyboard handling, and reduced motion.
- Security review, privacy review, dependency updates, and portal-specific regression tests.
- Release signing, versioning, changelog, APK/AAB release workflow, and rollback plan.
- Admin/support console only after user app is stable; least-privilege access and audit trail.

## Definition of done

A module is “done” only when:
1. Its UI is connected to a real implementation (not a placeholder).
2. Success, empty, loading, offline, permission-denied, and error states work.
3. Unit/integration tests pass.
4. Android and web/PWA behavior is tested.
5. Privacy boundaries are verified with network/request tests.
6. The user can complete the flow without manual code edits.
7. The feature status is reported honestly as built, tested, or still pending.

## Suggested build order

1. Fix and test Worker/API + privacy boundary.
2. Stabilize Android/WebView + PWA + chat persistence.
3. Add in-chat attachments and on-device document/image/PDF processing.
4. Build the local profile/document vault.
5. Implement the first official-source recruitment/form workflow.
6. Add portal progress overlay and one portal adapter end-to-end.
7. Expand assistant modules, voice, reminders, settings, and account features.
8. Run security, device, accessibility, and release testing.

This roadmap is a plan, not a claim that the listed modules are already implemented.
