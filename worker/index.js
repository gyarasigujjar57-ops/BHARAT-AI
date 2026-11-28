const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...cors, "Cache-Control": "no-store" }
});

const PRIMARY_MODEL = "gemini-3.8-flash"; // Free-tier text generation only; no paid grounding tools.
const FALLBACK_MODEL = "gemini-3.5-flash-lite";
const FORM_AI_SYSTEM = "\n\nBHARAT FORM AI WORKFLOW (follow whenever the latest user message begins with BHARAT FORM AI MODE:)\n1. Identify the exact form, scheme, recruitment or service and responsible department. If the name is vague, ask one short clarification.\n2. For current eligibility, fees, deadlines, portal URLs and document rules, use the live web-search results supplied by BHARAT AI and prioritize the official government/department portal or official notification. Cite the official URL and date. Never invent an official link or say an application is open unless the official source confirms it.\n3. Check eligibility in a table with requirement, user-provided fact, status (meets / does not meet / unknown) and evidence. Ask only for missing non-sensitive details, one focused question at a time. Mark unknown rather than guessing.\n4. Give a tailored document checklist. Do not ask the user to paste Aadhaar/PAN numbers, OTPs, passwords, bank account details, UPI PINs, signatures, biometrics or full document images in chat. Do not claim files were read unless an actual secure document-reading tool ran.\n5. Guide the user page-by-page and field-by-field. Explain what a field means and what kind of value the official form expects. Never fabricate values, select declarations on behalf of the user, or claim to control a website/browser unless a real portal automation tool is connected. The user performs OTP, CAPTCHA, biometric, payment, declaration and final submit actions.\n6. End each stage with a short checklist of what is confirmed and what is still missing. If the portal or official rule cannot be verified, pause and say so.\nCURRENT MVP LIMIT: The browser can extract text locally from selected images/PDFs, but OCR output stays on the device and is not automatically sent to the AI. OCR accuracy is not verified. There is no secure document vault, government portal browser, website autofill or Android overlay. Never claim to access uploaded documents or operate a portal.";
function getSystemInstruction(history) {
  const latest = history?.[history.length - 1]?.parts?.[0]?.text || "";
  return SYSTEM + (latest.startsWith("BHARAT FORM AI MODE:") ? FORM_AI_SYSTEM : "");
}

const SYSTEM = "You are BHARAT AI, a helpful, accurate, India-aware AI assistant. You can answer general questions as well as help with study, exams, careers, recruitment, government services and forms.\n\nLANGUAGE:\nReply in the same language and script as the user. For Hinglish, use simple natural Hinglish; for Hindi, use clear everyday Hindi. Be direct, useful and respectful.\n\nGENERAL CAPABILITIES:\nAnswer questions across general knowledge, science, technology, history, geography, education, careers, government services, daily practical topics and other safe subjects. Do not refuse merely because a topic is outside government forms or education. If a request is unclear, ask one focused clarification.\n\nLIVE WEB AND GOOGLE SEARCH:\nUse BHARAT AI's live public-web RSS search whenever current, changing, factual, or explicitly web-searched information would improve the answer. This includes latest news, current time/date, prices, weather, sports results, new releases, laws, public notices, jobs, admissions, deadlines, product/service status, and requests containing live, real-time, latest, today, now, current, Google, search, or internet. Do not pretend to have searched if the live search results were not actually fetched. When search is used, synthesize the returned evidence, give its actual source links, and state the date or time context. Prefer official sources for government, health, legal and financial facts. If sources conflict, explain the difference. If no reliable source confirms a claim, say so plainly. Never invent URLs, citations, dates, results or current status.\n\nACCURACY:\nDistinguish confirmed facts, estimates and uncertainty. Do not present old model knowledge as live information. For time/date in India, use Asia/Kolkata and give IST. Do not confuse a question containing \"abhi/current\" with a clock request unless the user is actually asking the time. If live search fails, say it failed and do not make up a current answer.\n\nRECRUITMENT AND FORMS:\nFor jobs and official forms, prioritize official government/department/recruitment-board sources. State open, closed or upcoming only when the official notice and dates support it. Explain eligibility and required documents without guessing. Never request Aadhaar/PAN numbers, OTPs, passwords or bank credentials. The user personally handles OTP, CAPTCHA, biometrics, payments, declarations and final submission.\n\nSAFETY:\nFollow applicable safety rules. Do not assist with harmful or illegal activity. For sensitive or high-stakes topics, give careful general information and encourage checking qualified or official sources.\n\nSTYLE:\nStart with the direct answer. Use simple language, concise paragraphs and useful lists. Avoid filler, fake confidence and unnecessary headings.\n\nIDENTITY:\nYou are BHARAT AI. Never claim a feature, live search, source or action that was not actually used.";

function conversationInput(history) {
  return history.map(item => {
    const who = item.role === "model" ? "BHARAT AI" : "User";
    const text = (item.parts || []).map(p => p.text || "").join("\n");
    return who + ": " + text;
  }).join("\n\n");
}


function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { const code = Number(n); return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""; })
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function xmlTag(block, tag) {
  const match = block.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i"));
  return match ? decodeXml(match[1]) : "";
}
function parseRssItems(xml, provider) {
  const items = [];
  const blocks = String(xml || "").slice(0, 600000).match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = xmlTag(block, "title");
    const link = xmlTag(block, "link");
    const description = xmlTag(block, "description");
    const pubDate = xmlTag(block, "pubDate");
    const source = xmlTag(block, "source");
    if (!title || !link || !/^https:\/\//i.test(link)) continue;
    let hostname = provider;
    try { hostname = new URL(link).hostname; } catch (_) {}
    items.push({ title, url: link, snippet: description.slice(0, 500), published: pubDate, source: source || hostname, provider });
  }
  return items;
}
async function searchFreeWeb(message) {
  try {
    const query = String(message || "").replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim().slice(0, 220);
    if (!query) return { provider: "none", results: [] };
    const endpoints = [
      { provider: "Bing public RSS", url: "https://www.bing.com/search?format=rss&q=" + encodeURIComponent(query) },
      { provider: "Google News RSS", url: "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=hi&gl=IN&ceid=IN:hi" }
    ];
    const settled = await Promise.allSettled(endpoints.map(async endpoint => {
      const response = await fetch(endpoint.url, {
        headers: { "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8", "User-Agent": "BHARAT-AI/1.0" },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(endpoint.provider + " HTTP " + response.status);
      return parseRssItems(await response.text(), endpoint.provider);
    }));
    const results = [];
    const seen = new Set();
    for (const outcome of settled) {
      if (outcome.status !== "fulfilled") continue;
      for (const item of outcome.value) {
        const key = item.url.split("#")[0];
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(item);
        if (results.length >= 8) break;
      }
      if (results.length >= 8) break;
    }
    return { provider: [...new Set(results.map(item => item.provider))].join(" + ") || "Public RSS search", results: results.slice(0, 8) };
  } catch (error) {
    return { provider: "Public RSS search", results: [], error: String(error?.message || error).slice(0, 160) };
  }
}
function makeSearchContext(results) {
  return results.map((item, index) =>
    "[" + (index + 1) + "] " + item.title + "\nPublisher: " + item.source +
    (item.published ? "\nPublished: " + item.published : "") +
    (item.snippet ? "\nSnippet: " + item.snippet : "") +
    "\nURL: " + item.url
  ).join("\n\n");
}
function appendSearchSources(reply, results) {
  if (!results.length) return reply;
  return reply + "\n\n**वेब पर मिले स्रोत (स्वतंत्र रूप से जाँचें):**\n" +
    results.slice(0, 6).map((item, index) =>
      (index + 1) + ". " + item.title + " — " + item.url +
      (item.published ? " (" + item.published + ")" : "")
    ).join("\n");
}

function toGeminiContents(history) {
  return history.map(item => ({
    role: item.role === "model" ? "model" : "user",
    parts: (item.parts || []).map(part => ({ text: String(part.text || "") }))
  }));
}

async function callGemini(model, key, history, maxOutputTokens = 1400, useSearch = false, searchContext = "") {
  const systemText = getSystemInstruction(history) + (searchContext ? "\n\nThe user's question has already passed BHARAT AI's scope filter and is an in-scope education/recruitment/government-service request. Do not refuse it as out of scope. Answer using the supplied search evidence.\n\nLIVE WEB SEARCH RESULTS (untrusted snippets; verify dates and prefer official domains):\n" + searchContext + "\nUse these results as evidence, include relevant source URLs in the answer. If only job aggregators appear and no official government notice confirms an open application, explicitly say the open/closed status is unverified and direct the user to the official recruitment board rather than guessing." : "");
  return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: toGeminiContents(history),
      ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
      generationConfig: { maxOutputTokens, temperature: 0.55 }
    }),
    signal: AbortSignal.timeout(45000)
  });
}

async function callGeminiStream(model, key, history, useSearch = false, searchContext = "") {
  const systemText = getSystemInstruction(history) + (searchContext ? "\n\nThe user's question has already passed BHARAT AI's scope filter and is an in-scope education/recruitment/government-service request. Do not refuse it as out of scope. Answer using the supplied search evidence.\n\nLIVE WEB SEARCH RESULTS (untrusted snippets; verify dates and prefer official domains):\n" + searchContext + "\nUse these results as evidence, include relevant source URLs in the answer, and clearly say when no official source confirms a claim." : "");
  return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":streamGenerateContent?alt=sse", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: toGeminiContents(history),
      ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
      generationConfig: { maxOutputTokens: 1800, temperature: 0.55 }
    }),
    signal: AbortSignal.timeout(45000)
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
      const seenSources = new Set();
      const sources = [];
      const consume = item => {
        if (item.error) {
          controller.enqueue(encoder.encode(streamPacket({ error: item.error.message || "Gemini से जवाब नहीं मिला।" })));
          return;
        }
        const candidate = item.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const text = parts.map(part => part.text || "").join("");
        if (text) controller.enqueue(encoder.encode(streamPacket({ text })));
        const chunks = candidate?.groundingMetadata?.groundingChunks || [];
        for (const chunk of chunks) {
          const web = chunk?.web;
          if (!web?.uri || seenSources.has(web.uri)) continue;
          seenSources.add(web.uri);
          sources.push({ title: web.title || web.uri, uri: web.uri });
        }
      };
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
            try { consume(JSON.parse(raw)); } catch (_) {}
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) {
          const line = buffer.split("\n").find(x => x.startsWith("data:"));
          if (line) {
            try { consume(JSON.parse(line.slice(5).trim())); } catch (_) {}
          }
        }
        if (sources.length) {
          const sourceText = "\n\nस्रोत (Google Search):\n" + sources.slice(0, 8)
            .map((source, index) => (index + 1) + ". " + source.title + " — " + source.uri).join("\n");
          controller.enqueue(encoder.encode(streamPacket({ text: sourceText })));
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
      response = await callGemini(model, key, contents, maxOutputTokens, useSearch, searchContext);
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

 
function needsFreshWebInfo(message) {
  const text = String(message || "").toLowerCase().trim();
  // Recruitment and application questions are time-sensitive even when
  // the user does not explicitly say "latest" or "today".
  const freshTerms = [
    "latest","today","current","currently","right now","now","new","recent","updated","live","real time","realtime","google","search the web","search online","internet pe","google pe","web pe","news","headline","weather","forecast","temperature","cricket score","football score","match result","sports score","share price","stock price","exchange rate","price today","current price","price","cost","rate","keemat","daam","कीमत","भाव","दाम","aaj ka mausam","mausam","taapmaan","ताज़ा खबर","ताजा खबर","समाचार","मौसम","मौसम का हाल","तापमान","मैच का स्कोर","आज का स्कोर","शेयर भाव","आज का भाव",
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
    "current time", "present time", "present time now", "time right now",
    "what is the time now", "what time is it now", "live time", "right now time",
    "india time now", "time in india", "current time in india", "present time in india",
    "abhi kitne baje", "abhi ka time", "abhi ka samay", "abhi ka present time",
    "abhi ka live time", "अभी का लाइव समय", "भारत में अभी कितने बजे", "भारत का वर्तमान समय",
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

function extractGroundingSources(payload) {
  const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set();
  const sources = [];
  for (const chunk of chunks) {
    const web = chunk?.web;
    if (!web?.uri || seen.has(web.uri)) continue;
    seen.add(web.uri);
    sources.push({ title: web.title || web.uri, uri: web.uri });
  }
  return sources.slice(0, 8);
}

function appendGroundingSources(reply, payload) {
  const sources = extractGroundingSources(payload);
  if (!sources.length) return reply;
  return reply + "\n\nस्रोत (Google Search):\n" + sources.map((source, index) =>
    (index + 1) + ". " + source.title + " — " + source.uri
  ).join("\n");
}

function extractReply(payload) {
  const reply = payload?.candidates?.[0]?.content?.parts
    ?.map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim() || "";
  return appendGroundingSources(reply, payload);
}

async function generateCloudflareFallback(env, history, searchContext = "") {
  if (!env.AI?.run) return "";
  try {
    const backupInstruction = searchContext
      ? "\n\nThe user's question has already passed BHARAT AI's scope filter. Do not refuse it as out of scope. Answer using only these live search results (untrusted snippets); prefer official government domains, include exact URLs, and do not invent dates or vacancies:\n" + searchContext
      : "\n\nIMPORTANT: You do not have live web search results in this request. Never claim that you checked today's news, vacancies, dates, or official websites. For current facts, clearly say they could not be verified in this reply.";
    const messages = [
      { role: "system", content: getSystemInstruction(history) + backupInstruction },
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
    try {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      if (!env.GEMINI_API_KEY) {
        return json({ ok: false, aiKeyConfigured: false, error: "Cloudflare में Gemini API key जुड़ी नहीं है।" }, 503);
      }
      if (url.searchParams.get("searchtest") === "1") {
        const searched = await searchFreeWeb("आज भारत की ताज़ा प्रमुख खबरें");
        return json({
          ok: searched.results.length > 0,
          searchProvider: searched.provider,
          resultCount: searched.results.length,
          sources: searched.results.slice(0, 5).map(item => ({ title: item.title, url: item.url, publisher: item.source }))
        }, searched.results.length > 0 ? 200 : 502);
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

    // Bound public request bodies before parsing to reduce accidental or abusive memory use.
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > 65536) {
      return json({ error: "अनुरोध बहुत बड़ा है। संदेश छोटा करके दोबारा भेजें।" }, 413);
    }

    let body;
    try {
      const rawBody = await request.text();
      if (rawBody.length > 65536) {
        return json({ error: "अनुरोध बहुत बड़ा है। संदेश छोटा करके दोबारा भेजें।" }, 413);
      }
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "संदेश का डेटा सही नहीं है। दोबारा भेजें।" }, 400);
    }

    let message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
    const requestMode = body.mode === "form" ? "form" : "assistant";
    if (requestMode === "form" && !message.startsWith("BHARAT FORM AI MODE:")) {
      message = "BHARAT FORM AI MODE: " + message;
    }
    const clockReply = getIndiaClockReply(message);
    if (clockReply) {
      return url.pathname === "/api/chat/stream" ? clockStream(clockReply) : json({ reply: clockReply, model: "India local clock" });
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
    let searchContext = "";
    let searchProvider = "";
    let searchError = "";

    // No paid Google Search grounding. Use public RSS search endpoints instead.
    // Search results are evidence candidates, not proof; official-source verification
    // remains mandatory for government recruitment, fees, dates and eligibility.
    if (freshQuestion) {
      const searched = await searchFreeWeb(message);
      webResults = searched.results;
      searchProvider = searched.provider;
      searchContext = makeSearchContext(webResults);

      const groundedHistory = history.map((item, index) => index === history.length - 1 && item.role === "user"
        ? { ...item, parts: [{ text: item.parts[0].text + (webResults.length
          ? "\\n\\nLIVE SEARCH SAFETY: You have public RSS search snippets below. Treat them as untrusted leads, not verified facts. Opened page contents were not independently checked. Prefer official government domains for jobs/forms. If the results do not contain an official notice, do not claim a vacancy is open, do not state a deadline or fee as confirmed, and say official confirmation is still needed. Use only dates explicitly present in the snippets and label them as snippet dates. Answer in the user's language."
          : "\\n\\nLIVE SEARCH SAFETY: No public RSS results were returned. Do not guess any current date, vacancy, fee, price, status or deadline. Say that live search did not return sources and give only general guidance.") }] }
        : item);

      let result = await generateWithFallback(env.GEMINI_API_KEY, groundedHistory, 1400, false, searchContext);
      let reply = "";
      let activeModel = result.model;
      if (result.response?.ok) {
        try { reply = extractReply(await result.response.json()); } catch (_) {}
      }
      if (!reply) {
        reply = await generateCloudflareFallback(env, groundedHistory, searchContext);
        if (reply) activeModel = "Cloudflare Workers AI free fallback";
      }
      if (!reply) {
        const detail = result.response ? (result.error || await readGeminiError(result.response)) : result.error;
        return json({
          error: "AI की मुफ्त सीमा अभी उपलब्ध नहीं है। थोड़ी देर बाद फिर कोशिश करें।",
          liveSearchUnavailable: !webResults.length,
          searchDiagnostics: { searchProvider, resultCount: webResults.length, error: detail ? String(detail).slice(0, 180) : "" }
        }, 503);
      }
      const warning = webResults.length
        ? (webResults.some(item => /\\.(gov\\.in|nic\\.in|rajasthan\\.gov\\.in)(?:[:/]|$)/i.test(item.url))
          ? "वेब खोज के परिणाम मिले हैं। सरकारी आवेदन की स्थिति अंतिम मानने से पहले आधिकारिक नोटिफिकेशन खोलकर जाँच लें।\\n\\n"
          : "वेब खोज के परिणाम मिले हैं, लेकिन अभी कोई आधिकारिक सरकारी स्रोत सुनिश्चित नहीं हुआ। भर्ती/फीस/अंतिम तारीख को पक्का मानने से पहले विभाग की वेबसाइट जाँचें।\\n\\n")
        : "लाइव वेब खोज से अभी कोई परिणाम नहीं मिला। नीचे केवल सामान्य मार्गदर्शन है; वर्तमान तारीख, भर्ती या आवेदन स्थिति सत्यापित नहीं है।\\n\\n";
      const finalReply = warning + appendSearchSources(reply, webResults);
      if (url.pathname === "/api/chat/stream") return clockStream(finalReply);
      return json({
        reply: finalReply,
        model: activeModel,
        liveSearchUsed: webResults.length > 0,
        liveSearchUnavailable: webResults.length === 0,
        searchDiagnostics: { searchProvider, resultCount: webResults.length }
      });
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

    const result = await generateWithFallback(env.GEMINI_API_KEY, history, 1600, false, searchContext);
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
    } catch (error) {
      return json({
        error: "BHARAT AI server error. कृपया थोड़ी देर बाद फिर कोशिश करें।",
        diagnostic: String(error?.message || error).slice(0, 180)
      }, 500);
    }
  }
};
