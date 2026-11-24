# BHARAT AI — 10,000 Daily Active Users Capacity & Cost Plan

**Plan date:** 24 November 2026  
**Target:** 10,000 daily active users (DAU) who actually ask BHARAT AI questions.

## 1. Traffic model

DAU is not the same as registrations. Capacity is sized by questions sent per active user.

| Average questions per active user/day | AI requests/day | Approx. requests/30 days |
|---:|---:|---:|
| 2 | 20,000 | 600,000 |
| 3 | 30,000 | 900,000 |
| 5 | 50,000 | 1,500,000 |

**Initial design point:** 10,000 DAU × 3 questions = 30,000 chat requests/day. This is a planning target, not a claim that the current app can already handle it.

## 2. Request-routing design

Every request should pass through this order:

1. **Local/deterministic answer:** India clock/date, simple calculations, app help, and other answers that do not need an LLM.
2. **Verified answer cache:** Reuse an answer only when the underlying official source and its validity date are still current. Expired notices must not be served as current.
3. **Official-data lookup:** Search the curated government/recruitment/scholarship knowledge base first.
4. **Gemini:** Use Gemini only when the question needs language understanding, reasoning, or a response not already available in verified data.
5. **Live web grounding:** Reserve for genuinely time-sensitive questions that cannot be answered from a recently checked official source. Never silently replace a failed live lookup with stale information.

Do not send Aadhaar/PAN numbers, OTPs, passwords, bank credentials, or raw identity documents to the model.

## 3. Initial guardrails to implement

These are proposed launch controls, not yet active in the Worker:

- Per installation: **5 AI requests/day** as an initial abuse-control limit.
- Global free-tier safety ceiling: **30,000 metered AI requests/day**.
- Maximum user message: 2,500 characters.
- Keep only the last 6 short conversation turns in model context.
- Keep ordinary answer output around 700–1,000 tokens; allow longer output only for tasks that need it.
- Health checks must never call Gemini.
- Stop and return a clear message when the daily budget is reached; do not make a second paid call just to hide a quota error.
- Live Search must have a separate monthly budget. A single grounded prompt can trigger multiple underlying search queries, so count actual usage in Google AI Studio, not just app requests.

The installation ID is only a temporary launch-stage limiter. It can be reset by clearing app data and is not a secure identity system. Before public scale, use authenticated accounts, server-side abuse controls, and a stronger quota policy.

## 4. Infrastructure capacity

### Cloudflare Workers

Cloudflare currently lists 100,000 Worker requests/day on the Free plan. At 30,000 chat API requests/day there is room for other API calls, but the entire account's Worker traffic must be monitored. The Free plan also has a 10 ms CPU limit per request. Network waiting time is not counted as CPU time. See [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/).

### Cloudflare D1 usage ledger

A D1 database named `bharat-ai-usage` has been created in APAC. The following tables/triggers were created:

- `client_daily_usage`
- `global_daily_usage`
- `search_daily_usage`
- Client usage triggers that maintain a daily global count.

**Important:** The database is provisioned, but it is not yet bound to the deployed Worker and the Worker does not yet enforce these counters. Do not treat quota enforcement as live until the D1 binding, Worker code, and load tests are complete.

Cloudflare's current D1 Free limits list 5 million rows read/day, 100,000 rows written/day, and 5 GB total storage. At the proposed 30,000 requests/day, a two-row-per-request ledger would be about 60,000 row writes/day before any extra writes; actual metering must be verified in D1 analytics. See [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

### Firebase

Do not write every chat token or every typing event to Firestore. Store only the minimum profile/history records needed. Firestore's free quota is 50,000 document reads/day, 20,000 writes/day, 1 GiB storage and 10 GiB/month outbound transfer for one qualifying database. This is not enough for a design that writes several records per chat turn at 30,000 turns/day. See [Firestore pricing](https://firebase.google.com/docs/firestore/pricing).

## 5. Gemini cost model (illustrative, not a bill quote)

The official Gemini pricing page currently lists Gemini 3.8 Flash standard-tier token rates of **$0.75 per 1 million input tokens** and **$3.75 per 1 million output tokens through 31 December 2026**. It lists higher rates from 1 January 2027. Free-tier model availability and quotas are limited; a 10,000-DAU production service must not assume unlimited free inference. See [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing).

For a simple planning example, assume each model call uses 2,000 input tokens and 400 output tokens:

- Estimated cost per model call: about **$0.003** at the listed 2026 standard rates.
- 20,000 model calls/day × 30 days: about **$1,800/month**.
- 30,000 model calls/day × 30 days: about **$2,700/month**.
- 50,000 model calls/day × 30 days: about **$4,500/month**.

These estimates exclude Search grounding, other AI providers, storage, payment fees, taxes, and unexpected retries. Actual tokens must be measured from API usage metadata. Repeated system instructions and conversation history can make input usage higher.

If 70% of requests are correctly answered by local logic or a verified cache, only 30% need Gemini. At the 30,000-request/day design point, that is 270,000 model calls/month and roughly **$810/month** under the same token assumptions. This is a target to measure—not current performance.

## 6. Live Search budget

Gemini 3+ Google Search grounding is separately metered. The current pricing page lists 5,000 free search requests/month on the paid tier, then $14 per 1,000 search queries, with a default daily cap. One app prompt can cause more than one search query. Therefore:

- Do not ground every message.
- Prefer a recently verified official-notice cache.
- Track grounding requests separately from model tokens.
- Never show an old recruitment deadline as current when live verification fails.

## 7. Rollout gates

Do not announce 10,000-user readiness until all of these pass:

1. D1 binding attached to the production Worker.
2. Per-install and global daily counters enforced before any paid model call.
3. Search grounding budget enforced and visible in operations metrics.
4. No Gemini call from app startup/health checks.
5. Cache hit rate, model calls, input/output tokens, 429s, latency and D1 rows read/written recorded.
6. Load tests at 100, 500, 2,000, then 10,000 simulated users.
7. Verify that a failed or exhausted budget returns a clear message and does not trigger repeated paid retries.

## 8. Current honest status

- Worker + Gemini chat endpoint: exists.
- India clock direct response: deployed in the Worker.
- Startup health check no longer needs to spend a Gemini request: source change committed.
- D1 usage database and base tables: created.
- D1 binding to Worker: **not yet configured**.
- Per-user/global request limits: **not yet enforced**.
- Government-answer cache and scheduled official-source ingestion: **not yet built**.
- Firebase login, trusted user identity, and production usage dashboard: **not yet built**.
- 10,000-DAU load test: **not yet run**.

**Decision:** 10,000 DAU is an engineering target, not a free-tier promise. A controlled free beta can validate the product, but sustained 10,000-DAU AI usage requires measured caching, strict budgets, and a funded inference plan.
