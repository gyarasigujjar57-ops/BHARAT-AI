# BHARAT AI — Build Status & Phase 1 Acceptance

Last updated: 2026-11-27

## Verified repository baseline
- Hindi-first responsive web/PWA shell exists.
- Two UI modes exist: BHARAT AI Assistant and BHARAT FORM AI.
- Browser sends chat requests to the Cloudflare Worker stream endpoint.
- Worker contains Gemini integration, a health endpoint, and a Cloudflare Workers AI fallback path.
- Current Form AI is text guidance only. It does not OCR documents, access government portals, autofill, submit forms, or display an Android overlay.

## Changes in this phase
- Guest chat is no longer persisted to localStorage. Conversation context remains in the current page session only and is lost on refresh.
- The composer now warns users not to send Aadhaar/PAN numbers, OTPs, passwords, or bank information.
- This is a privacy improvement for the unauthenticated prototype, not a complete privacy/security solution.

## Must pass before a public launch
1. Verify the deployed Worker and run a real end-to-end Gemini request from a phone browser.
2. Fix and test API security: authentication, per-user authorization, robust rate limiting/abuse controls, request-size limits, and a restrictive CORS allowlist for the actual production frontend domain.
3. Review the Worker route behavior for live search, streaming, fallback, timeouts, quota errors, and source citations.
4. Keep secrets only in Cloudflare Worker secrets; scan repository history and rotate any exposed key.
5. Choose one primary authentication/database architecture and test cross-user isolation.
6. Publish clear privacy notice, consent, retention, export/delete, and incident response processes.
7. Add automated tests and staging/rollback procedures.

## Current known risks / not yet implemented
- Chat API currently has no verified user authentication or per-user authorization.
- Worker CORS is currently wildcard; production must use a controlled origin allowlist.
- Robust server-side rate limiting has not yet been demonstrated.
- Chat messages are sent to the AI provider; do not send sensitive identity or banking data.
- Firebase Auth/database integration is not verified.
- Secure document storage, upload scanning, OCR, Master Profile, eligibility rules, official source registry, portal adapters, autofill, Android overlay, and native APK are not implemented/verified.

## Phase 1 acceptance tests
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
