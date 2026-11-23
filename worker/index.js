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
const SYSTEM = `You are BHARAT AI, a capable, thoughtful, accurate assistant for people in India.
Reply in the language the user uses. If Hindi/Hinglish, use natural simple Hindi/Hinglish.
Understand conversation history and answer the exact question first. Be clear, practical, specific, and thoughtful. For complex requests, use concise headings and numbered steps. Avoid filler and repetition.
Never invent current vacancies, deadlines, eligibility, fees, scheme rules, official links, or live facts. If not verified, say so clearly.
Never request Aadhaar/PAN numbers, OTPs, passwords, or bank credentials. The user must handle OTP, CAPTCHA, biometrics, payments, declarations and final submission.
You are BHARAT AI. Do not claim live browsing, databases, or actions that are not available.`;

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
        generationConfig: { maxOutputTokens, temperature: 0.7 }
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
      if (!check.response) {
        return json({
          ok: false, aiKeyConfigured: true, aiReady: false,
          error: check.error === "timeout"
            ? "Gemini ने जाँच का जवाब समय पर नहीं दिया।"
            : "Cloudflare से Gemini तक कनेक्शन नहीं हो पाया।"
        }, 502);
      }
      if (!check.response.ok) {
        const detail = check.error || await readGeminiError(check.response);
        return json({
          ok: false, aiKeyConfigured: true, aiReady: false,
          error: check.response.status === 401 || check.response.status === 403
            ? "Gemini API key अमान्य है या API की अनुमति नहीं है।"
            : check.response.status === 429
              ? "Gemini की उपयोग सीमा अभी पूरी है।"
              : "Gemini ने जाँच अस्वीकार की: " + (detail || ("HTTP " + check.response.status)).slice(0, 180)
        }, 502);
      }
      let payload;
      try { payload = await check.response.json(); }
      catch (_) { return json({ ok: false, aiReady: false, error: "Gemini का टेस्ट जवाब पढ़ा नहीं जा सका।" }, 502); }
      const reply = extractReply(payload);
      if (!reply) return json({ ok: false, aiReady: false, error: "Gemini ने टेस्ट में खाली जवाब भेजा।" }, 502);
      return json({ ok: true, aiKeyConfigured: true, aiReady: true, model: check.model, testReply: reply });
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
    if (!result.response) {
      return json({
        error: result.error === "timeout"
          ? "Gemini ने जवाब देने में बहुत समय लिया। दोबारा कोशिश करें।"
          : "Cloudflare से Gemini तक कनेक्शन नहीं हो पाया।"
      }, 502);
    }

    if (!result.response.ok) {
      const detail = result.error || await readGeminiError(result.response);
      if (result.response.status === 401 || result.response.status === 403) {
        return json({ error: "Gemini API key अमान्य है या इस API की अनुमति नहीं है। Cloudflare Secret जाँचें।" }, 502);
      }
      if (result.response.status === 429) {
        return json({ error: "Gemini की उपयोग सीमा अभी पूरी हो गई है। कुछ देर बाद फिर कोशिश करें।" }, 429);
      }
      return json({
        error: "Gemini API ने जवाब नहीं दिया।" + (detail ? " विवरण: " + detail.slice(0, 220) : ""),
        upstreamStatus: result.response.status
      }, 502);
    }

    let payload;
    try { payload = await result.response.json(); }
    catch (_) { return json({ error: "Gemini से सही जवाब नहीं पढ़ा जा सका।" }, 502); }

    const reply = extractReply(payload);
    if (!reply) {
      const reason = payload?.promptFeedback?.blockReason;
      return json({
        error: reason
          ? "यह सवाल सुरक्षा नियमों के कारण पूरा नहीं हो सका।"
          : "Gemini ने खाली जवाब भेजा। दोबारा कोशिश करें।"
      }, 502);
    }

    return json({ reply, model: result.model });
  }
};
