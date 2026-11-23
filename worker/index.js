const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...cors, "Cache-Control": "no-store" }
});

const PRIMARY_MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";
const SYSTEM = `You are BHARAT AI, a genuinely useful, clear and up-to-date assistant for people in India.
LANGUAGE AND VOICE:
Reply in the same language and script the user uses. If they write Hinglish, use natural easy Hinglish; if Hindi, use clean everyday Hindi. Sound warm, alert, confident and human—not robotic, salesy, overexcited or fake-friendly. Understand what the person actually means before answering.
WRITING STYLE:
Write clean, readable paragraphs. Start with the direct answer. Use bullets or numbered steps only when they make information easier to scan. Do not decorate ordinary replies with markdown headings, repeated **bold**, ###, star symbols, emojis, or excessive lists. No "wow", "amazing", "great question" filler. Avoid repeating the question. Explain unfamiliar terms in simple words. Keep simple answers short; give detail when the question needs it.
ACCURACY:
Never make up facts, dates, recruitment notices, eligibility, fees, salaries, deadlines, links, or current status. Clearly distinguish confirmed facts from estimates and unknowns. If information may have changed, verify it using Google Search grounding before stating it. Prefer official government/department/recruitment-board sources. Give the exact notification date and application deadline when confirmed. If sources disagree, explain the difference. If search does not establish the answer, say you could not verify it—do not present old information as today's update.
INDIAN RECRUITMENT:
For questions about latest/current/new government jobs or recruitments, actively search the web using Google Search grounding. Check current official notices, not memory alone. Match the user's state, age, education and category only when those details are known; ask one essential missing question rather than guessing. For each confirmed vacancy, explain post, department, qualification, age limit and relaxations, important dates, fee, selection process, salary/pay level, and official application/notification link. State "as of" today's date when possible. Clearly label closed, upcoming, and open applications.
SAFETY AND TRUST:
Never request Aadhaar/PAN numbers, OTPs, passwords, or bank credentials. The user must personally handle OTP, CAPTCHA, biometrics, payments, declarations and final submission. Never claim to have submitted a form or performed an action unless actually done.
IDENTITY:
You are BHARAT AI. Do not claim a feature, live access, source, or action that was not actually used.`;

async function callGemini(model, key, contents, maxOutputTokens = 1400) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    return await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens, temperature: 0.55 }
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readGeminiError(response) {
  try {
    const payload = await response.json();
    return payload?.error?.message || "";
  } catch (_) {
    return "";
  }
}

async function generateWithFallback(key, contents, maxOutputTokens = 1400) {
  let response;
  let model = PRIMARY_MODEL;
  let firstError = "";
  try {
    response = await callGemini(model, key, contents, maxOutputTokens);
    if (response.ok) return { response, model };

    const status = response.status;
    firstError = await readGeminiError(response);

    // Try the alternate model when the primary model is unavailable,
    // rate-limited, over quota, or temporarily failing.
    const shouldFallback =
      status === 404 ||
      status === 429 ||
      status >= 500 ||
      (status === 400 && /model|not found|not supported/i.test(firstError));

    if (!shouldFallback) return { response, model, error: firstError };

    model = FALLBACK_MODEL;
    response = await callGemini(model, key, contents, maxOutputTokens);
    return { response, model, error: firstError };
  } catch (error) {
    const firstFailure = error?.name === "AbortError" ? "timeout" : "network";
    try {
      model = FALLBACK_MODEL;
      response = await callGemini(model, key, contents, maxOutputTokens);
      return { response, model, error: firstFailure };
    } catch (fallbackError) {
      return {
        response: null,
        model,
        error: fallbackError?.name === "AbortError" ? "timeout" : "network"
      };
    }
  }
}

function extractReply(payload) {
  return payload?.candidates?.[0]?.content?.parts
    ?.map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim() || "";
}

async function generateCloudflareFallback(env, history) {
  if (!env.AI?.run) return "";
  try {
    const messages = [
      { role: "system", content: SYSTEM + "\\n\\nIMPORTANT: This is the backup model. You do not have live web search in this request. Never claim that you checked today's news, vacancies, dates, or official websites. For current facts, clearly say they could not be verified in this reply." },
      ...history.map(item => ({
        role: item.role === "model" ? "assistant" : "user",
        content: item.parts.map(part => part.text).join("\\n")
      }))
    ];
    const result = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
      messages,
      max_tokens: 1200,
      temperature: 0.55
    });
    const answer = typeof result === "string"
      ? result
      : (result?.response || result?.output || result?.text || "");
    return typeof answer === "string" ? answer.trim() : "";
  } catch (_) {
    return "";
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      if (!env.GEMINI_API_KEY) {
        return json({ ok: false, aiKeyConfigured: false, error: "Cloudflare में Gemini API key जुड़ी नहीं है।" }, 503);
      }
      if (url.searchParams.get("test") !== "1") {
        return json({ ok: true, service: "BHARAT AI API", aiKeyConfigured: true, aiReady: "not_tested" });
      }

      const check = await generateWithFallback(env.GEMINI_API_KEY, [
        { role: "user", parts: [{ text: "Reply with exactly: BHARAT AI READY" }] }
      ], 20);
      let reply = "";
      let activeModel = check.model;
      if (check.response?.ok) {
        try { reply = extractReply(await check.response.json()); } catch (_) {}
      }
      if (!reply) {
        reply = await generateCloudflareFallback(env, [
          { role: "user", parts: [{ text: "Reply with exactly: BHARAT AI READY" }] }
        ]);
        activeModel = reply ? "Cloudflare Workers AI (Gemma 4 backup)" : check.model;
      }
      if (!reply) {
        const detail = check.response ? (check.error || await readGeminiError(check.response)) : check.error;
        return json({
          ok: false, aiKeyConfigured: true, aiReady: false,
          error: detail && /429|quota|limit/i.test(detail)
            ? "Gemini की सीमा पूरी है और backup AI भी उपलब्ध नहीं है।"
            : "Gemini और backup AI में से कोई जवाब नहीं दे पाया।"
        }, 502);
      }
      return json({ ok: true, aiKeyConfigured: true, aiReady: true, model: activeModel, testReply: reply });
    }

    if (url.pathname !== "/api/chat" || request.method !== "POST") {
      return json({ error: "यह API रास्ता उपलब्ध नहीं है।" }, 404);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "संदेश का डेटा सही नहीं है। दोबारा भेजें।" }, 400); }

    const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
    if (!message) return json({ error: "पहले अपना सवाल लिखें।" }, 400);
    if (!env.GEMINI_API_KEY) {
      return json({ error: "Cloudflare में Gemini API key जुड़ी नहीं है।" }, 503);
    }

    let history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    history = history
      .filter(item => ["user", "model"].includes(item?.role) && Array.isArray(item?.parts))
      .map(item => ({
        role: item.role,
        parts: item.parts.slice(0, 1).map(part => ({ text: String(part?.text || "").trim().slice(0, 3500) }))
      }))
      .filter(item => item.parts[0].text);

    while (history.length && history[0].role !== "user") history.shift();
    if (history.length && history[history.length - 1].role !== "model") history.pop();
    history.push({ role: "user", parts: [{ text: message }] });

    const result = await generateWithFallback(env.GEMINI_API_KEY, history);
    let reply = "";
    let activeModel = result.model;
    if (result.response?.ok) {
      try { reply = extractReply(await result.response.json()); } catch (_) {}
    }

    if (!reply) {
      reply = await generateCloudflareFallback(env, history);
      if (reply) activeModel = "Cloudflare Workers AI (Gemma 4 backup)";
    }

    if (!reply) {
      const detail = result.response
        ? (result.error || await readGeminiError(result.response))
        : result.error;
      if (result.response?.status === 401 || result.response?.status === 403) {
        return json({ error: "Gemini key की अनुमति में समस्या है और backup AI भी जवाब नहीं दे पाया।" }, 502);
      }
      if (result.response?.status === 429) {
        return json({ error: "Gemini की सीमा पूरी है और backup AI भी अभी उपलब्ध नहीं है। थोड़ी देर बाद फिर कोशिश करें।" }, 429);
      }
      return json({
        error: "मुख्य AI और backup AI दोनों से जवाब नहीं मिला।" + (detail ? " विवरण: " + detail.slice(0, 180) : ""),
        upstreamStatus: result.response?.status || 502
      }, 502);
    }

    return json({ reply, model: activeModel });
  }
};
