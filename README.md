# BHARAT AI 🇮🇳

India's all-in-one personal AI assistant — a free-first MVP for recruitment, government services, document guidance and everyday digital tasks.

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
