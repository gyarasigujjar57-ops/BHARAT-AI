const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...cors }
});

const SYSTEM = `You are BHARAT AI, a capable, thoughtful, accurate assistant for people in India.
Reply in the language the user uses. If Hindi/Hinglish, use natural simple Hindi/Hinglish.
Understand conversation history and answer the exact question first. Be clear, practical, specific, and thoughtful. For complex requests, use concise headings and numbered steps. Avoid filler and repetition.
Never invent current vacancies, deadlines, eligibility, fees, scheme rules, official links, or live facts. If not verified, say so clearly.
Never request Aadhaar/PAN numbers, OTPs, passwords, or bank credentials. The user must handle OTP, CAPTCHA, biometrics, payments, declarations and final submission.
You are BHARAT AI. Do not claim live browsing, databases, or actions that are not available.`;

async function askGemini(model, key, contents) {
  return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      generationConfig: { maxOutputTokens: 1400, temperature: 0.7 }
    }),
    signal: AbortSignal.timeout(30000)
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "BHARAT AI API",
        aiKeyConfigured: Boolean(env.GEMINI_API_KEY),
        primaryModel: "gemini-3.8-flash",
        fallbackModel: "gemini-2.5-flash"
      });
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

    let response;
    try {
      response = await askGemini("gemini-3.8-flash", env.GEMINI_API_KEY, history);
      if (response.status === 404) {
        response = await askGemini("gemini-2.5-flash", env.GEMINI_API_KEY, history);
      }
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      return json({
        error: timedOut
          ? "AI को जवाब तैयार करने में बहुत समय लगा। थोड़ी देर बाद फिर कोशिश करें।"
          : "Gemini सर्वर से कनेक्शन नहीं हो पाया।"
      }, 502);
    }

    if (!response.ok) {
      let detail = "";
      try {
        const payload = await response.json();
        detail = payload?.error?.message || "";
      } catch (_) {}

      if (response.status === 401 || response.status === 403) {
        return json({ error: "Gemini API key अमान्य है या इस API की अनुमति नहीं है। Cloudflare Secret जाँचें।" }, 502);
      }
      if (response.status === 429) {
        return json({ error: "Gemini की मुफ्त उपयोग सीमा अभी पूरी हो गई है। कुछ देर बाद कोशिश करें।" }, 429);
      }
      return json({
        error: "Gemini API ने जवाब नहीं दिया।" + (detail ? " विवरण: " + detail.slice(0, 220) : ""),
        upstreamStatus: response.status
      }, 502);
    }

    let payload;
    try { payload = await response.json(); }
    catch { return json({ error: "Gemini से सही जवाब नहीं पढ़ा जा सका।" }, 502); }

    const reply = payload?.candidates?.[0]?.content?.parts
      ?.map(part => typeof part.text === "string" ? part.text : "")
      .join("")
      .trim();

    if (!reply) {
      const reason = payload?.promptFeedback?.blockReason;
      return json({
        error: reason
          ? "यह सवाल सुरक्षा नियमों के कारण पूरा नहीं हो सका।"
          : "Gemini ने खाली जवाब भेजा। दोबारा कोशिश करें।"
      }, 502);
    }

    return json({ reply });
  }
};
