# BHARAT AI — Build Status & Phase 1 Acceptance

Last updated: 2026-11-27

## Verified repository baseline
- Hindi-first responsive web/PWA shell exists.
- Two UI modes exist: BHARAT AI Assistant and BHARAT FORM AI.
- Browser sends chat requests to the Cloudflare Worker stream endpoint.
- Worker contains Gemini integration, a health endpoint, and a Cloudflare Workers AI fallback path.
- Form AI has a dedicated intake workspace for form name, state and task type, plus a structured AI workflow for official-source verification, eligibility status, document checklist and field-by-field guidance. Local browser OCR now reads images and PDFs (PDF text extraction first, OCR for scanned pages) without sending files to the Worker. No government portal access, autofill, submit or Android overlay.

## Changes in this phase
- Added a dedicated mobile-first Form AI intake workspace with form/scheme name, state selector, help-purpose selector, quick categories and a start action. New-chat reset preserves the correct mode workspace.
- Added Form AI-specific backend instructions: official-source-first verification, meets/does-not-meet/unknown eligibility, tailored document checklist, one focused non-sensitive follow-up at a time, and field-by-field explanation. The same rules apply to Gemini Search, standard Gemini and the Cloudflare backup path.
- Form AI clearly states current limits: local OCR is an early prototype; there is no secure document vault, government portal browser, website autofill or Android overlay.
- Added a user-triggered real AI test from the app's connection control. App startup still performs only a cheap health check; the paid/quota-consuming model test runs only after a deliberate tap. The UI distinguishes Gemini success from a Cloudflare backup response.
- Updated the Wrangler model setting from the retired `gemini-2.0-flash` value to `gemini-3.8-flash`. The Worker source currently selects its model in code; keep the configuration and source aligned during the next deployment.
- Guest chat is no longer persisted to localStorage. Conversation context remains in the current page session only and is lost on refresh.
- The composer now warns users not to send Aadhaar/PAN numbers, OTPs, passwords, or bank information.
- This is a privacy improvement for the unauthenticated prototype, not a complete privacy/security solution.

## Must pass before a public launch
1. Deploy the latest repository Worker code only after reviewing the production origin and security configuration; then run a real end-to-end Gemini request from a phone browser using the new manual AI test control.
2. Fix and test API security: authentication, per-user authorization, robust rate limiting/abuse controls, request-size limits, and a restrictive CORS allowlist for the actual production frontend domain.
3. Review the Worker route behavior for live search, streaming, fallback, timeouts, quota errors, and source citations.
4. Keep secrets only in Cloudflare Worker secrets; scan repository history and rotate any exposed key.
5. Choose one primary authentication/database architecture and test cross-user isolation.
6. Publish clear privacy notice, consent, retention, export/delete, and incident response processes.
7. Add automated tests and staging/rollback procedures.

## Current known risks / not yet implemented
- Chat API currently has no verified user authentication or per-user authorization.
- Deployed Worker CORS is currently wildcard; production must use a controlled origin allowlist after the actual frontend origin is confirmed. CORS alone is not authentication.
- Robust server-side rate limiting has not yet been demonstrated.
- Chat messages are sent to the AI provider; do not send sensitive identity or banking data.
- Firebase Auth/database integration is not verified.
- Secure document vault/storage, upload scanning, Master Profile, automated eligibility rules engine, maintained official source registry, portal adapters, website autofill, Android overlay, and native APK are not implemented/verified. Local browser OCR exists but has not yet been validated across real Android devices and diverse document scans.

## Phase 1 acceptance tests
- [ ] Test image OCR and multi-page/scanned PDF OCR on a real Android phone; confirm files never appear in Worker requests.
- [ ] Test OCR language accuracy for Hindi and English, large/rotated/blurred images, and memory limits.
- [ ] Health endpoint returns healthy status without exposing secrets.
- [ ] A real prompt sent from the deployed app returns a non-empty Gemini answer.
- [ ] Streaming completes correctly and handles an interrupted connection.
- [ ] Invalid key, quota/rate limit, timeout, malformed request, and provider outage show safe user messages.
- [ ] No secret appears in frontend files, app bundle, Git history, logs, or error responses.
- [ ] Oversized requests are rejected.
- [ ] CORS allows only the intended deployed frontend origin.
- [ ] Abuse/rate limits are active and tested.
- [ ] User data is not exposed across accounts (once auth is added).
- [ ] Phone tests pass on Android Chrome and installed PWA.

## Definition of done
A feature is complete only when code is deployed, the real user path is tested, negative/error cases are tested, security/privacy impact is reviewed, and evidence is recorded. A green health endpoint alone does not prove that Gemini replies successfully.
