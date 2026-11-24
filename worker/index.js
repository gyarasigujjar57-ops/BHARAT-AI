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
const SYSTEM = "You are BHARAT AI, India's focused Study, Exam, Recruitment and Government-Form Action Assistant. You are NOT a general-purpose chatbot or entertainment companion.\nSCOPE: Help only with practical education and career administration (school/college/entrance/competitive exams, syllabus, exam notices, admit cards, results, previous papers and exam-related doubts), government/private recruitment information, eligibility, admissions, scholarships, government schemes/services, certificates, required documents, application forms, and step-by-step official application workflows. Do not provide general life coaching, generic \"how should I study\" motivation/planning, casual conversation, jokes, stories, entertainment, coding, shopping, relationship advice, or unrelated general knowledge. For out-of-scope requests, politely reply: \"मैं यह काम नहीं कर सकता। BHARAT AI केवल पढ़ाई, परीक्षा, भर्ती, दाखिले, छात्रवृत्ति, सरकारी सेवाओं और फॉर्म से जुड़े कामों में मदद करता है।\"\n\nLANGUAGE AND VOICE:\nReply in the same language and script the user uses. If they write Hinglish, use natural easy Hinglish; if Hindi, use clean everyday Hindi. Sound warm, alert, confident and human—not robotic, salesy, overexcited or fake-friendly. Understand what the person actually means before answering.\nWRITING STYLE:\nWrite clean, readable paragraphs. Start with the direct answer. Use bullets or numbered steps only when they make information easier to scan. Do not decorate ordinary replies with markdown headings, repeated **bold**, ###, star symbols, emojis, or excessive lists. No \"wow\", \"amazing\", \"great question\" filler. Avoid repeating the question. Explain unfamiliar terms in simple words. Keep simple answers short; give detail when the question needs it.\nACCURACY:\nNever make up facts, dates, recruitment notices, eligibility, fees, salaries, deadlines, links, or current status. Clearly distinguish confirmed facts from estimates and unknowns. If information may have changed, verify it using Google Search grounding before stating it. Prefer official government/department/recruitment-board sources. Give the exact notification date and application deadline when confirmed. If sources disagree, explain the difference. If search does not establish the answer, say you could not verify it—do not present old information as today's update.\nINDIAN RECRUITMENT:\nFor questions about latest/current/new government jobs or recruitments, actively search the web using Google Search grounding. Check current official notices, not memory alone. Match the user's state, age, education and category only when those details are known; ask one essential missing question rather than guessing. For each confirmed vacancy, explain post, department, qualification, age limit and relaxations, important dates, fee, selection process, salary/pay level, and official application/notification link. State \"as of\" today's date when possible. Clearly label closed, upcoming, and open applications.\nSAFETY AND TRUST:\nNever request Aadhaar/PAN numbers, OTPs, passwords, or bank credentials. The user must personally handle OTP, CAPTCHA, biometrics, payments, declarations and final submission. Never claim to have submitted a form or performed an action unless actually done.\nIDENTITY:\nYou are BHARAT AI. Do not claim a feature, live access, source, or action that was not actually used.";

function conversationInput(history) {
  return history.map(item => {
    const who = item.role === "model" ? "BHARAT AI" : "User";
    const text = (item.parts || []).map(p => p.text || "").join("\n");
    return who + ": " + text;
  }).join("\n\n");
}

function toGeminiContents(history) {
  return history.map(item => ({
    role: item.role === "model" ? "model" : "user",
    parts: (item.parts || []).map(part => ({ text: String(part.text || "") }))
  }));
}

async function callGemini(model, key, history, maxOutputTokens = 1400, useSearch = false, searchContext = "") {
  const systemText = SYSTEM + (searchContext ? "\\n\\nLIVE WEB SEARCH RESULTS (untrusted snippets; verify dates and prefer official domains):\\n" + searchContext + "\\nUse these results as evidence, include relevant source URLs in the answer, and clearly say when no official source confirms a claim." : "");
  return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: toGeminiContents(history),
      ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { maxOutputTokens, temperature: 0.55 }
    })
  });
}

async function callGeminiStream(model, key, history, useSearch = false, searchContext = "") {
  const systemText = SYSTEM + (searchContext ? "\\n\\nLIVE WEB SEARCH RESULTS (untrusted snippets; verify dates and prefer official domains):\\n" + searchContext + "\\nUse these results as evidence, include relevant source URLs in the answer, and clearly say when no official source confirms a claim." : "");
  return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":streamGenerateContent?alt=sse", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: toGeminiContents(history),
      ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { maxOutputTokens: 1800, temperature: 0.55 }
    })
  });
}
function streamPacket(data) {
  return "data: " + JSON.stringify(data) + "\n\n";
}

function makeLiveStream(upstream) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.replace(/\r\n/g, "\n").split("\n\n");
          buffer = events.pop() || "";
          for (const event of events) {
            const line = event.split("\n").find(x => x.startsWith("data:"));
            if (!line) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;
            try {
              const item = JSON.parse(raw);
              if (item.error) {
                controller.enqueue(encoder.encode(streamPacket({ error: item.error.message || "Gemini से जवाब नहीं मिला।" })));
                continue;
              }
              const parts = item.candidates?.[0]?.content?.parts || [];
              const text = parts.map(part => part.text || "").join("");
              if (text) controller.enqueue(encoder.encode(streamPacket({ text })));
            } catch (_) {}
          }
        }
        if (buffer.trim()) {
          const line = buffer.split("\n").find(x => x.startsWith("data:"));
          if (line) {
            try {
              const item = JSON.parse(line.slice(5).trim());
              const text = (item.candidates?.[0]?.content?.parts || []).map(part => part.text || "").join("");
              if (text) controller.enqueue(encoder.encode(streamPacket({ text })));
            } catch (_) {}
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (_) {
        controller.enqueue(encoder.encode(streamPacket({ error: "Live जवाब बीच में रुक गया। कृपया दोबारा प्रयास करें।" })));
        controller.close();
      } finally {
        reader.releaseLock();
      }
    }
  }), {
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
async function readGeminiError(response) {
  try {
    const payload = await response.json();
    return payload?.error?.message || "";
  } catch (_) {
    return "";
  }
}

async function generateWithFallback(key, contents, maxOutputTokens = 1400, useSearch = false, searchContext = "") {
  let response;
  let model = PRIMARY_MODEL;
  let firstError = "";
  try {
    response = await callGemini(model, key, contents, maxOutputTokens, useSearch, searchContext);
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
    response = await callGemini(model, key, contents, maxOutputTokens, useSearch, searchContext);
    return { response, model, error: firstError };
  } catch (error) {
    const firstFailure = error?.name === "AbortError" ? "timeout" : "network";
    try {
      model = FALLBACK_MODEL;
      response = await callGemini(model, key, contents, maxOutputTokens, useSearch);
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

 
function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>/g, "").trim();
}

function extractDdgUrl(href) {
  try {
    const u = new URL(href, "https://html.duckduckgo.com");
    const redirected = u.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : u.href;
  } catch (_) { return ""; }
}

async function searchWeb(query) {
  const q = String(query || "").slice(0, 220);
  const searches = [q, q + " (site:gov.in OR site:nic.in)"];
  const all = [];
  for (const term of searches) {
    try {
      const response = await fetch("https://www.bing.com/search?format=rss&q=" + encodeURIComponent(term), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BHARATAI/1.0)", "Accept": "application/rss+xml, application/xml, text/xml" },
        cf: { cacheTtl: 180, cacheEverything: true }
      });
      if (!response.ok) continue;
      const xml = await response.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
      for (const match of items) {
        const block = match[1];
        const title = decodeHtml((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");
        const url = decodeHtml((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "");
        const snippet = decodeHtml((block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || "");
        if (!title || !/^https?:\/\//i.test(url) || all.some(item => item.url === url)) continue;
        let host = "";
        try { host = new URL(url).hostname.toLowerCase(); } catch (_) {}
        all.push({ title, url, host, snippet });
        if (all.length >= 8) break;
      }
    } catch (_) {}
    if (all.length >= 8) break;
  }
  all.sort((a,b) => Number(/\.(gov\.in|nic\.in)$/.test(b.host)) - Number(/\.(gov\.in|nic\.in)$/.test(a.host)));
  return all.slice(0, 8);
}

function formatSearchContext(results) {
  return results.map((item, i) =>
    (i + 1) + ". " + item.title + "\nURL: " + item.url + "\nDomain: " + item.host + "\nSnippet: " + item.snippet
  ).join("\n\n");
}
function needsFreshWebInfo(message) {
  const text = String(message || "").toLowerCase().trim();
  // Recruitment and application questions are time-sensitive even when
  // the user does not explicitly say "latest" or "today".
  const freshTerms = [
    "latest","today","current","currently","right now","now","new","recent","updated",
    "open","active","last date","deadline","result","released","notification",
    "vacancy","vacancies","recruitment","recruit","hiring","job","jobs","naukri",
    "bharti","bhartiya","sarkari","government job","govt job","application started",
    "form started","admission open","abhi","aaj","filhaal","vartaman","nayi","naya",
    "nikli","khuli","chalu","antim tithi","aakhri tarikh","kab tak","naukri nikli",
    "भर्ती","भर्तियां","भर्तियाँ","नौकरी","सरकारी नौकरी","सरकारी भर्ती","रिक्ति",
    "रिक्तियां","रिक्तियाँ","भर्ती निकली","नई भर्ती","नया नोटिफिकेशन","अंतिम तिथि",
    "आखिरी तारीख","खुली हुई","आवेदन शुरू","फॉर्म शुरू","दाखिले शुरू","प्रवेश शुरू",
    "जारी हुआ","निकली है","रिजल्ट","नतीजा","आज","अभी","वर्तमान"
  ];
  return freshTerms.some(term => text.includes(term));
}

function isInScope(message, priorHistory = []) {
  const text = String(message || "").toLowerCase().trim();
  const outOfScope = ["joke","jokes","story","stories","movie","movies","song","songs","music","dating","relationship","cricket score","football score","weather","shopping","recipe","game recommendation","मजाक","चुटकुला","कहानी","फिल्म","गाना","मौसम","खरीदना"];
  if (outOfScope.some(term => text.includes(term))) return false;
  const topics = [
    ["bharti","bhartiya","bhartiyan","sarkari","naukri","vacanc","recruit","recruitment","career","job","jobs","government job","govt job","employment","12th pass","10th pass","12वीं पास","दसवीं पास","बारहवीं पास","भर्ती","भर्तियां","भर्तियाँ","नौकरी","सरकारी नौकरी","वैकेंसी"],
    ["padhai","exam","pariksha","paper","admit card","admit-card","result","syllabus","entrance","competitive","question paper","board exam","परीक्षा","एग्जाम","प्रवेश पत्र","रिजल्ट","परिणाम","सिलेबस","पाठ्यक्रम","प्रश्न पत्र","प्रतियोगी"],
    ["form","aavedan","apply","application","registration","dakhila","admission","scholarship","yojana","scheme","certificate","document","dastavez","eligibility","patrata","notification","official website","फॉर्म","आवेदन","रजिस्ट्रेशन","दाखिला","प्रवेश","छात्रवृत्ति","योजना","प्रमाणपत्र","दस्तावेज","पात्रता","अधिसूचना"],
    ["rbse","cbse","upsc","ssc","rrb","railway","army","agniveer","air force","navy","police","cet","neet","jee","cuet","10th","12th","बारहवीं","दसवीं","रेलवे","अग्निवीर","वायुसेना","नेवी","पुलिस","बोर्ड परीक्षा"],
    ["physics","bhoutiki","chemistry","rasayan","biology","ganit","math","algebra","geometry","history","itihas","geography","bhugol","economics","grammar","chapter","adhyay","notes","numerical","formula","theorem","definition","concept","homework","assignment","explain","भौतिकी","रसायन","जीव विज्ञान","गणित","इतिहास","भूगोल","अर्थशास्त्र","व्याकरण","अध्याय","नोट्स","सूत्र","प्रमेय","परिभाषा","अवधारणा","समझाओ"]
  ];
  if (topics.some(group => group.some(term => text.includes(term)))) return true;
  const prior = Array.isArray(priorHistory) ? priorHistory.filter(x => x?.role === "user").slice(-3) : [];
  const previousTopic = prior.some(item => {
    const old = (item.parts || []).map(part => String(part?.text || "").toLowerCase()).join(" ");
    return topics.some(group => group.some(term => old.includes(term)));
  });
  const followups = ["aur","iska","iske","ye","uska","kab","kahan","kaise","kitna","kitni","haan","nahi","samjhao","detail","details","link","fees","age","documents","aage","next","ok","thik","ठीक","और","इसका","इसके","ये","वो","कब","कहाँ","कैसे","कितना","कितनी","हाँ","नहीं","समझाओ","विस्तार","लिंक","फीस","उम्र","दस्तावेज","आगे","बताओ"];
  return previousTopic && (text.length < 60 || followups.some(term => text.startsWith(term)));
}

function getIndiaClockReply(message) {
  const text = String(message || "").toLowerCase().trim();
  // Do not treat a generic "abhi/current/live" in recruitment questions as a clock request.
  const clockTerms = [
    "time", "clock", "samay", "waqt", "kitne baje", "what time",
    "current time", "present time", "live time", "right now time",
    "abhi kitne baje", "abhi ka time", "abhi ka samay",
    "समय क्या", "वर्तमान समय", "अभी कितने बजे", "अभी का समय", "कितने बज रहे"
  ];
  const dateTerms = [
    "today's date", "todays date", "date today", "what is the date",
    "aaj ki date", "tarikh kya hai", "tareekh kya hai", "dinank kya hai",
    "आज की तारीख", "तारीख क्या है", "दिनांक क्या है", "आज कौन सा दिन"
  ];
  const wantsClock = clockTerms.some(term => text.includes(term));
  const wantsDate = dateTerms.some(term => text.includes(term));
  if (!wantsClock && !wantsDate) return "";
  const now = new Date();
  const date = new Intl.DateTimeFormat("hi-IN", { timeZone: "Asia/Kolkata", dateStyle: "full" }).format(now);
  const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now);
  if (wantsClock && wantsDate) return "भारत में अभी " + date + " है और समय " + time + " IST (भारतीय समय) है।";
  if (wantsDate) return "भारत में आज " + date + " है।";
  return "भारत में अभी समय " + time + " IST (भारतीय समय) है।";
}

function clockStream(reply) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode(streamPacket({ text: reply })));
    controller.enqueue(encoder.encode("data: [DONE]\\n\\n"));
    controller.close();
  }}), { headers: { ...cors, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}

function extractReply(payload) {
  return payload?.candidates?.[0]?.content?.parts
    ?.map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim() || "";
}

async function generateCloudflareFallback(env, history, searchContext = "") {
  if (!env.AI?.run) return "";
  try {
    const backupInstruction = searchContext
      ? "\n\nThe user's question has already passed BHARAT AI's scope filter. Do not refuse it as out of scope. Answer using only these live search results (untrusted snippets); prefer official government domains, include exact URLs, and do not invent dates or vacancies:\n" + searchContext
      : "\n\nIMPORTANT: You do not have live web search results in this request. Never claim that you checked today's news, vacancies, dates, or official websites. For current facts, clearly say they could not be verified in this reply.";
    const messages = [
      { role: "system", content: SYSTEM + backupInstruction },
      ...history.map(item => ({
        role: item.role === "model" ? "assistant" : "user",
        content: item.parts.map(part => part.text).join("\n")
      }))
    ];
    const result = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
      messages,
      max_tokens: 1200,
      temperature: 0.55
    });
    const answer = typeof result === "string"
      ? result
      : (result?.response ||
         result?.choices?.[0]?.message?.content ||
         result?.output ||
         result?.text ||
         "");
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

    if (!["/api/chat", "/api/chat/stream"].includes(url.pathname) || request.method !== "POST") {
      return json({ error: "यह API रास्ता उपलब्ध नहीं है।" }, 404);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "संदेश का डेटा सही नहीं है। दोबारा भेजें।" }, 400); }

    const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
    const clockReply = getIndiaClockReply(message);
    if (clockReply) {
      return url.pathname === "/api/chat/stream" ? clockStream(clockReply) : json({ reply: clockReply, model: "India local clock" });
    }
    if (message && !isInScope(message, body.history)) {
      return json({ reply: "मैं यह काम नहीं कर सकता। BHARAT AI केवल पढ़ाई, परीक्षा, भर्ती, दाखिले, छात्रवृत्ति, सरकारी सेवाओं और फॉर्म से जुड़े कामों में मदद करता है।" });
    }
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

    const freshQuestion = needsFreshWebInfo(message);
    let webResults = [];
    if (freshQuestion) webResults = await searchWeb(message);
    const searchContext = formatSearchContext(webResults);
    if (freshQuestion && !webResults.length) {
      return json({ error: "लाइव वेब सर्च अभी परिणाम नहीं दे रही। अपुष्ट भर्ती या तारीख बताने के बजाय BHARAT AI रुक रहा है।", liveSearchUnavailable: true }, 503);
    }

    if (url.pathname === "/api/chat/stream") {
      let live = await callGeminiStream(PRIMARY_MODEL, env.GEMINI_API_KEY, history, false, searchContext);
      let liveSearchError = "";
      if (!live.ok) {
        const status = live.status;
        liveSearchError = await readGeminiError(live);
        if ([400, 404, 429].includes(status) || status >= 500) {
          live = await callGeminiStream(FALLBACK_MODEL, env.GEMINI_API_KEY, history, false, searchContext);
          if (!live.ok) liveSearchError = (liveSearchError + " " + await readGeminiError(live)).trim();
        }
      }
      if (live.ok && live.body) return makeLiveStream(live);
      // Never answer time-sensitive questions from the offline Gemma backup.
      // It has no live web search and could present stale recruitment information.
      if (freshQuestion && !webResults.length) {
        return json({ error: "लाइव वेब सर्च से इस सवाल के भरोसेमंद परिणाम नहीं मिले। कृपया सवाल थोड़ा स्पष्ट करके पूछें।", liveSearchUnavailable: true }, 503);
      }
      const backup = await generateCloudflareFallback(env, history, searchContext);
      if (backup) {
        const encoder = new TextEncoder();
        return new Response(new ReadableStream({ start(controller) {
          controller.enqueue(encoder.encode(streamPacket({ text: backup })));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }}), { headers: { ...cors, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
      }
      return json({ error: "Live AI stream उपलब्ध नहीं है। कृपया थोड़ी देर बाद प्रयास करें।" }, 502);
    }

    const result = await generateWithFallback(env.GEMINI_API_KEY, history, 1400, false, searchContext);
    let reply = "";
    let activeModel = result.model;
    if (result.response?.ok) {
      try { reply = extractReply(await result.response.json()); } catch (_) {}
    }

    if (!reply && freshQuestion && !webResults.length) {
      return json({ error: "लाइव वेब सर्च से इस सवाल के भरोसेमंद परिणाम नहीं मिले। कृपया सवाल थोड़ा स्पष्ट करके पूछें।", liveSearchUnavailable: true }, 503);
    }

    if (!reply) {
      reply = await generateCloudflareFallback(env, history, searchContext);
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
