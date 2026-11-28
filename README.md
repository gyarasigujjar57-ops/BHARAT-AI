# BHARAT AI 🇮🇳

India's focused Study & Action Assistant for exams, recruitment, admissions, scholarships, government services, documents and application forms. It is intentionally not a general-purpose chatbot.

## Product modes (current MVP)
- **BHARAT AI Assistant:** general Hindi-first AI chat.
- **BHARAT FORM AI:** a dedicated form-intake workspace with local browser OCR for images and PDFs, plus official-source-first AI guidance for eligibility, document checklists and page-by-page form fields.
- FORM AI can extract text from selected images and PDFs locally in the browser (up to 5 files, 8 MB each, and 10 PDF pages per file). Files are not posted to the BHARAT AI Worker. OCR text stays in the open page until refresh; a copy action removes common number patterns, but users must manually remove names, dates, addresses and other private details. Secure document storage, robust OCR review, live portal reading, field autofill and Android overlay are not implemented yet.
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
3. Validate local document OCR on real Android devices; add reviewed Master Profile extraction.
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

 
## Safe portal reader prototype
- Opens only HTTPS links whose host is under `.gov.in` or `.nic.in` (including the root domains).
- Does not fetch arbitrary user URLs through the Worker. This avoids creating an unsafe server-side URL proxy.
- User manually copies text from a blank official form; the browser maps it to a fixed set of generic field categories locally. Raw pasted labels/values are not forwarded; only generic categories can be placed into the chat composer after a separate tap.
- No personal values are retained by the mapper, no autofill occurs, and the user must verify every field against the official portal.
