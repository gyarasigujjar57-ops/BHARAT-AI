# BHARAT FORM AI — Phase 1

## Implemented in the repository
- Separate Form AI mode with a dedicated mobile-first intake workspace.
- Inputs: form/scheme/recruitment name, state, and the kind of help needed.
- Quick starts for recruitment, certificates, scholarships and farmer schemes.
- Form-specific backend prompt used by Gemini Search, Gemini generation and Cloudflare Workers AI fallback.
- Workflow: identify form and department; verify official portal/current rules; check eligibility as meets / does not meet / unknown; prepare a tailored document checklist; explain form pages and fields one step at a time.
- New-chat reset keeps the currently selected Assistant/Form AI mode.

## Not implemented yet
- Document upload and OCR (including multi-page PDF and Hindi OCR).
- Secure document vault and Master Profile with field provenance.
- Eligibility rules engine backed by verified official notices.
- Government portal reader/browser and portal-specific adapters.
- Automatic field entry, movable overlay, pause/resume and completion report.
- Authentication, user database and native Android APK.

## Safety and accuracy rules
- Never request Aadhaar/PAN numbers, OTPs, passwords, bank credentials, UPI PINs, signatures or biometrics in chat.
- Never invent a portal URL, deadline, fee, eligibility result or document requirement.
- Prefer official government/department sources for current rules.
- Mark unknown facts as unknown and ask one focused non-sensitive question at a time.
- User remains in control of OTP, CAPTCHA, biometric, payment, declarations and final submission.

## Acceptance checks
- [ ] Open Form AI tab; intake workspace appears.
- [ ] Enter form name and state; start action sends the structured request.
- [ ] Quick category buttons launch a Form AI conversation.
- [ ] Switching tabs before starting toggles the correct workspace.
- [ ] New chat preserves the selected mode.
- [ ] Backend applies Form AI instructions to Gemini Search, Gemini standard generation and backup.
- [ ] Current text-only limitations are stated honestly.
- [ ] Test a real deployed Worker request and official-source citations.
