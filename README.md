# BHARAT AI 🇮🇳

India's focused Study & Action Assistant for exams, recruitment, admissions, scholarships, government services, documents and application forms. It is intentionally not a general-purpose chatbot.

## Product modes (current MVP)
- **BHARAT AI Assistant:** general Hindi-first AI chat.
- **BHARAT FORM AI:** a separate text-guidance mode for identifying Indian government/service forms and asking focused follow-up questions.
- FORM AI is currently text-only. Document OCR, private on-device document processing, portal reading, autofill, and Android overlay are not implemented yet.
- The mode selector is part of the web app; the API and Gemini connection still require live end-to-end testing.

## First foundation
- Responsive Hindi-first web app and installable PWA
- Quick actions for recruitment, forms, documents and schemes
- Demo assistant with transparent demo-mode messaging
- Cloudflare Worker API scaffold with optional Gemini integration

## Run
Open index.html in a browser. Without a deployed Worker, chat uses local demo guidance.

## Deploy API
Deploy worker/index.js to Cloudflare Workers. Add GEMINI_API_KEY as a Worker secret; never commit keys. Set API_BASE_URL in app.js to the Worker URL.

## Privacy and safety
Never enter Aadhaar/PAN numbers, OTPs, passwords or bank credentials in chat. The assistant must not invent official eligibility, dates, fees or links. Users must review declarations, payments and final submission themselves. OTP, CAPTCHA and biometric steps remain user-controlled.

## Roadmap
1. Deploy and test Worker + AI.
2. Add consent-based sign-in and secure profile storage.
3. Add document extraction with user review.
4. Add official-source registry and recruitment notice parser.
5. Build tested portal-specific form assistance.
6. Package as Android app and test on real devices.

This is an MVP foundation, not a claim that every service or automatic form submission is already implemented.


## Privacy-first MVP update (2026-11-27)
- Guest chat is held only in the current page session; refreshing the page clears the conversation.
- The composer warns users not to send Aadhaar/PAN numbers, OTPs, passwords, or bank information.
- Worker rejects chat API request bodies larger than 64 KiB.
- See [Phase 1 build status](docs/BUILD_STATUS_PHASE_1.md) for verified implementation status and production launch blockers.

## Security status
This prototype is not yet production-ready. Authentication, per-user authorization, robust rate limiting, production CORS allowlisting, Firebase verification, secure document storage, and formal privacy/incident processes remain to be implemented and tested.
