const API_BASE_URL = "https://bharat-ai-api.gyarasigujjar57.workers.dev";
const chat = document.querySelector("#chat");
const form = document.querySelector("#form");
const input = document.querySelector("#message");
const send = document.querySelector("#send");
const connection = document.querySelector("#connection");
let activeMode = "assistant";
const modeHint = document.querySelector("#modeHint");
const modeTabs = [...document.querySelectorAll("[data-mode]")];
function setMode(mode) {
  activeMode = mode === "form" ? "form" : "assistant";
  modeTabs.forEach(tab => {
    const selected = tab.dataset.mode === activeMode;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-pressed", String(selected));
  });
  const formStart = document.querySelector("#formStart");
  const welcome = document.querySelector("#welcome");
  if (formStart && welcome && !chat.querySelector(".message")) {
    welcome.hidden = activeMode === "form";
    formStart.hidden = activeMode !== "form";
  }
  if (activeMode === "form") {
    modeHint.textContent = "फॉर्म पहचानें → पात्रता जाँचें → दस्तावेज़ तैयार करें → आवेदन में मदद लें";
    input.placeholder = "फॉर्म या आवेदन से जुड़ा सवाल लिखें…";
  } else {
    modeHint.textContent = "सामान्य सवाल, पढ़ाई, टेक्नोलॉजी और जानकारी के लिए";
    input.placeholder = "कुछ भी पूछें — ज़रूरत पड़ने पर BHARAT AI वेब पर खोजे...";
  }
}
modeTabs.forEach(tab => tab.addEventListener("click", () => setMode(tab.dataset.mode)));

function addMessage(text, role) {
  const wrap = document.createElement("div");
  wrap.className = "message " + role;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  wrap.append(bubble);
  chat.append(wrap);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

function hideWelcome() {
  const welcome = document.querySelector("#welcome");
  const formStart = document.querySelector("#formStart");
  if (welcome) welcome.hidden = true;
  if (formStart) formStart.hidden = true;
}

// Privacy-first MVP: conversation history exists only in the current page session.

function getHistory() {
  return [...chat.querySelectorAll(".message")]
    .map(el => {
      const bubble = el.querySelector(".bubble");
      const text = bubble?.textContent?.trim() || "";
      if (!text || bubble?.dataset.failed === "true" || bubble?.dataset.pending === "true") return null;
      if (el.classList.contains("user")) return { role: "user", parts: [{ text }] };
      if (el.classList.contains("bot")) return { role: "model", parts: [{ text }] };
      return null;
    }).filter(Boolean).slice(-12);
}

// Render common Markdown safely: no raw HTML is ever inserted into the page.
function appendInline(parent, text) {
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<]+|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0, match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parent.append(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith("[")) {
      const parsed = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (parsed) {
        const link = document.createElement("a");
        link.href = parsed[2];
        link.textContent = parsed[1];
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        parent.append(link);
      }
    } else if (/^https?:\/\//i.test(token)) {
      const link = document.createElement("a");
      link.href = token;
      link.textContent = token;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      parent.append(link);
    } else {
      const node = token.startsWith("**") ? document.createElement("strong")
        : token.startsWith("`") ? document.createElement("code") : document.createElement("em");
      node.textContent = token.startsWith("**") ? token.slice(2, -2) : token.slice(1, -1);
      parent.append(node);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
}

function renderMarkdown(element, markdown) {
  element.replaceChildren();
  const lines = markdown.replace(/\r/g, "").split("\n");
  let list = null, listKind = "";
  const closeList = () => { list = null; listKind = ""; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (heading) {
      closeList();
      const h = document.createElement("h" + Math.min(heading[1].length + 2, 4));
      appendInline(h, heading[2]); element.append(h);
    } else if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      if (!list || listKind !== kind) {
        closeList(); list = document.createElement(kind); listKind = kind; element.append(list);
      }
      const li = document.createElement("li");
      appendInline(li, (bullet || numbered)[1]); list.append(li);
    } else {
      closeList();
      const p = document.createElement("p"); appendInline(p, line); element.append(p);
    }
  }
  chat.scrollTop = chat.scrollHeight;
}

// Read the real token stream from the backend; no simulated typing.
async function readLiveReply(response, element) {
  const streamText = document.createElement("span");
  streamText.className = "stream-text";
  const snake = document.createElement("span");
  snake.className = "snake-cursor";
  snake.setAttribute("aria-hidden", "true");
  snake.innerHTML = "<i></i><i></i><i></i><i></i><b></b>";
  element.replaceChildren(streamText, snake);

  if (!response.body?.getReader) {
    const data = await response.json();
    const answer = data.reply || "";
    renderMarkdown(element, answer);
    return answer;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", fullText = "";
  const consumeEvent = event => {
    const data = event.split("\n")
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") return;
    let packet;
    try { packet = JSON.parse(data); } catch (_) { return; }
    if (packet.error) throw new Error(packet.error);
    if (packet.text) {
      fullText += packet.text;
      streamText.textContent = fullText;
      chat.scrollTop = chat.scrollHeight;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.replace(/\r\n/g, "\n").split("\n\n");
      buffer = events.pop() || "";
      for (const event of events) consumeEvent(event);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeEvent(buffer);
  } finally {
    reader.releaseLock();
  }

  snake.remove();
  if (fullText.trim()) renderMarkdown(element, fullText);
  return fullText;
}
async function checkAIConnection(testAI = false) {
  if (!connection) return;
  connection.textContent = testAI ? "असली AI टेस्ट चल रहा है…" : "सर्वर जाँच रहा है…";
  connection.classList.remove("ready", "failed");
  connection.disabled = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), testAI ? 60000 : 15000);
  try {
    // Opening the app performs only a cheap health check. A real model test
    // runs only after the user taps the connection control.
    const endpoint = API_BASE_URL + "/health" + (testAI ? "?test=1" : "");
    const response = await fetch(endpoint, {
      method: "GET", cache: "no-store", signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok || data.ok !== true || data.aiKeyConfigured !== true) {
      throw new Error(data.error || "सर्वर कनेक्शन नहीं बना।");
    }
    if (testAI) {
      if (data.aiReady !== true) throw new Error("AI टेस्ट पूरा नहीं हुआ।");
      if (String(data.model || "").includes("Cloudflare Workers AI")) {
        connection.textContent = "Backup AI टेस्ट सफल · Gemini की पुष्टि नहीं";
        connection.title = "Backup AI ने जवाब दिया। Gemini का असली जवाब अभी सफलतापूर्वक सत्यापित नहीं हुआ।";
      } else {
        connection.textContent = "Gemini AI टेस्ट सफल";
        connection.title = "Gemini से वास्तविक टेस्ट जवाब मिला: " + String(data.testReply || "").slice(0, 160);
      }
    } else {
      connection.textContent = "सर्वर जुड़ा है · AI सवाल पर चलेगा";
      connection.title = "सर्वर उपलब्ध है। असली AI टेस्ट के लिए यहाँ टैप करें।";
    }
    connection.classList.add("ready");
  } catch (error) {
    connection.textContent = testAI ? "AI टेस्ट असफल · फिर कोशिश करें" : "AI कनेक्शन में समस्या · फिर जाँचें";
    connection.classList.add("failed");
    connection.title = error.name === "AbortError" ? "AI जाँच में समय लग गया।" : error.message;
  } finally {
    clearTimeout(timer);
    connection.disabled = false;
  }
}
async function ask(question) {
  hideWelcome();
  const history = getHistory();
  addMessage(question, "user");
  const reply = addMessage("", "bot");
  reply.classList.add("thinking");
  reply.setAttribute("aria-label", "BHARAT AI जवाब तैयार कर रहा है");
  reply.innerHTML = '<span class="snake-loader" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><b></b></span>';
  reply.dataset.pending = "true";
  send.disabled = true;
  input.disabled = true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(API_BASE_URL + "/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: activeMode === "form"
          ? "BHARAT FORM AI MODE: You are BHARAT FORM AI, a careful India government-form assistant. Follow this workflow: identify the exact form and department; use live Google Search and official sources to verify portal, current dates, fees, eligibility and document rules; ask one focused question at a time for missing non-sensitive facts; show eligibility as meets / does not meet / unknown with reasons; create a tailored document checklist; then explain each page and field step by step. Never guess or invent a portal, deadline, eligibility result or required document. Do not ask for Aadhaar/PAN numbers, OTPs, passwords, bank credentials, UPI PIN, signatures or biometrics. This MVP can extract text from selected images/PDFs locally in the browser, but it does not automatically send OCR text to the AI. Only analyze non-sensitive text the user deliberately shares after review. Do not claim secure document storage, website access, autofill, submission or an overlay. The user performs OTP, CAPTCHA, payment, declarations and final submission.\n\nUser request: " + question
          : question,
        history, language: "hi"
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      let err = {};
      try { err = await response.json(); } catch (_) {}
      throw new Error(err.error || err.message || ("सर्वर त्रुटि " + response.status));
    }
    delete reply.dataset.pending;
    reply.classList.remove("thinking");
    reply.removeAttribute("aria-label");
    const liveText = await readLiveReply(response, reply);
    if (!liveText.trim()) throw new Error("AI से खाली जवाब मिला।");
  } catch (error) {
    reply.dataset.failed = "true";
    reply.classList.remove("thinking");
    reply.removeAttribute("aria-label");
    delete reply.dataset.pending;
    reply.textContent = error.name === "AbortError"
      ? "जवाब आने में बहुत समय लगा। इंटरनेट जाँचकर दोबारा भेजें।"
      : (error.message === "Failed to fetch" || error instanceof TypeError)
        ? "सर्वर से कनेक्शन नहीं हुआ। ऊपर AI कनेक्शन पर टैप करके जाँचें।"
        : "AI जवाब नहीं दे पाया: " + error.message;
    checkAIConnection();
  } finally {
    clearTimeout(timeout);
    send.disabled = false;
    input.disabled = false;
    input.focus();
    chat.scrollTop = chat.scrollHeight;

  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question || send.disabled) return;
  input.value = "";
  input.style.height = "46px";
  ask(question);
});


let localOcrWorker = null;
async function getLocalOcrWorker() {
  if (localOcrWorker) return localOcrWorker;
  if (!window.Tesseract) throw new Error("OCR लाइब्रेरी लोड नहीं हुई। इंटरनेट जाँचकर पेज refresh करें।");
  localOcrWorker = await window.Tesseract.createWorker("eng+hin", 1);
  return localOcrWorker;
}
function setOcrStatus(message) {
  const status = document.querySelector("#ocrStatus");
  if (status) status.textContent = message;
}
function redactForCopy(value) {
  return String(value || "")
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, "[12-अंकों की पहचान संख्या हटाई]")
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, "[PAN हटाया]")
    .replace(/\b(?:\+91[- ]?)?[6-9]\d{9}\b/g, "[मोबाइल नंबर हटाया]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[ईमेल हटाया]");
}
async function readPdfLocally(file, worker) {
  if (!window.pdfjsLib) throw new Error("PDF reader लोड नहीं हुआ। इंटरनेट जाँचकर refresh करें।");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageCount = Math.min(pdf.numPages, 10);
  let output = "";
  for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
    setOcrStatus(file.name + " — पेज " + pageNo + "/" + pageCount + " पढ़ रहा है…");
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const textLayer = content.items.map(item => item.str || "").join(" ").trim();
    if (textLayer.length > 25) {
      output += "\n[पेज " + pageNo + "]\n" + textLayer + "\n";
      continue;
    }
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const result = await worker.recognize(canvas);
    output += "\n[पेज " + pageNo + " — OCR]\n" + (result.data.text || "") + "\n";
    canvas.width = 1; canvas.height = 1;
  }
  if (pdf.numPages > 10) output += "\n[बाकी " + (pdf.numPages - 10) + " पेज इस मोबाइल MVP में नहीं पढ़े गए]\n";
  return output;
}
document.querySelector("#runOcr")?.addEventListener("click", async () => {
  const picker = document.querySelector("#formDocs");
  const files = [...(picker?.files || [])];
  const output = document.querySelector("#ocrText");
  const copyButton = document.querySelector("#copyOcr");
  if (!files.length) { setOcrStatus("पहले फोटो या PDF चुनें।"); return; }
  if (files.length > 5) { setOcrStatus("एक बार में अधिकतम 5 फाइलें चुनें।"); return; }
  if (files.some(file => file.size > 8 * 1024 * 1024)) { setOcrStatus("कोई फाइल 8 MB से बड़ी है। छोटी फाइल चुनें।"); return; }
  const runButton = document.querySelector("#runOcr");
  runButton.disabled = true;
  if (copyButton) copyButton.disabled = true;
  if (output) output.value = "";
  try {
    setOcrStatus("फोन पर OCR तैयार हो रहा है। पहली बार भाषा फ़ाइलें डाउनलोड हो सकती हैं…");
    const worker = await getLocalOcrWorker();
    let combined = "";
    for (const file of files) {
      setOcrStatus(file.name + " पढ़ रहा है…");
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        combined += "\n===== " + file.name + " =====\n" + await readPdfLocally(file, worker);
      } else if (["image/jpeg","image/png","image/webp"].includes(file.type)) {
        const result = await worker.recognize(file);
        combined += "\n===== " + file.name + " =====\n" + (result.data.text || "") + "\n";
      } else {
        throw new Error("यह फाइल प्रकार समर्थित नहीं है: " + file.name);
      }
    }
    if (output) output.value = combined.trim();
    if (copyButton) copyButton.disabled = !combined.trim();
    setOcrStatus("पढ़ना पूरा हुआ। टेक्स्ट नीचे केवल इसी डिवाइस के पेज में है। मूल दस्तावेज़ से जाँचें।");
  } catch (error) {
    setOcrStatus("OCR पूरा नहीं हुआ: " + error.message);
  } finally {
    runButton.disabled = false;
  }
});
document.querySelector("#copyOcr")?.addEventListener("click", async () => {
  const value = document.querySelector("#ocrText")?.value || "";
  if (!value) return;
  const safe = redactForCopy(value);
  try {
    await navigator.clipboard.writeText(safe);
    setOcrStatus("नंबरों की सामान्य पहचान हटाकर टेक्स्ट कॉपी हुआ। नाम, जन्मतिथि, पता और बाकी निजी जानकारी भेजने से पहले खुद हटाएँ।");
  } catch (_) {
    setOcrStatus("कॉपी नहीं हुआ। टेक्स्ट बॉक्स से चुनकर खुद कॉपी करें और निजी जानकारी हटाएँ।");
  }
});

document.querySelector("#startForm")?.addEventListener("click", () => {
  if (send.disabled) return;
  const name = document.querySelector("#formName")?.value.trim() || "";
  const state = document.querySelector("#formState")?.value || "";
  const task = document.querySelector("#formTask")?.value || "फॉर्म पहचानना और सही सरकारी वेबसाइट ढूँढना";
  if (!name && !state) {
    document.querySelector("#formName")?.focus();
    return;
  }
  const details = [
    "मुझे भारतीय सरकारी/सेवा फॉर्म में मदद चाहिए।",
    name ? "फॉर्म/योजना/भर्ती: " + name : "",
    state ? "राज्य: " + state : "",
    "मदद का उद्देश्य: " + task,
    "पहले आधिकारिक वेबसाइट/विभाग की पुष्टि करो। फिर एक-एक करके केवल जरूरी गैर-संवेदनशील सवाल पूछो। पात्रता, दस्तावेज और आवेदन के चरण अलग-अलग समझाओ। अभी किसी दस्तावेज़ को पढ़ने या वेबसाइट पर खुद फॉर्म भरने का दावा मत करना।"
  ].filter(Boolean).join("\n");
  ask(details);
});
document.querySelectorAll("[data-form-prompt]").forEach(button => button.addEventListener("click", () => {
  if (send.disabled) return;
  setMode("form");
  ask(button.dataset.formPrompt);
}));

// Official portal helper: allowlisted HTTPS link + local field-label mapping.
// It deliberately does not proxy/fetch arbitrary user URLs or automate form submission.
function isAllowedGovernmentPortal(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const trustedDomain = host === "gov.in" || host.endsWith(".gov.in") ||
      host === "nic.in" || host.endsWith(".nic.in");
    if (url.protocol !== "https:" || !trustedDomain || url.username || url.password ||
        (url.port && url.port !== "443")) return null;
    return url;
  } catch (_) { return null; }
}
document.querySelector("#openPortal")?.addEventListener("click", () => {
  const field = document.querySelector("#portalUrl");
  const status = document.querySelector("#portalStatus");
  const url = isAllowedGovernmentPortal(field?.value.trim() || "");
  if (!url) {
    status.textContent = "यह लिंक स्वीकार नहीं हुआ। पूरा HTTPS लिंक दें और जाँचें कि डोमेन .gov.in या .nic.in पर खत्म होता है।";
    return;
  }
  const opened = window.open(url.href, "_blank", "noopener,noreferrer");
  status.textContent = opened === null
    ? "ब्राउज़र ने नया टैब रोका हो सकता है। अपने ब्राउज़र की अनुमति जाँचें।"
    : "आधिकारिक डोमेन लिंक नए टैब में खोला गया।";
});
const portalFieldTerms = [
  ["नाम", /\bname\b|applicant|नाम|आवेदक|प्रार्थी/i],
  ["पिता / माता का नाम", /father|mother|guardian|पिता|माता|अभिभावक/i],
  ["जन्मतिथि", /date of birth|\bdob\b|जन्म.?तिथि/i],
  ["लिंग", /gender|sex|लिंग/i],
  ["श्रेणी", /category|caste|वर्ग|श्रेणी|जाति/i],
  ["पता", /address|पता|मकान|गली/i],
  ["जिला / तहसील", /district|tehsil|तहसील|जिला|ब्लॉक/i],
  ["पिन कोड", /pin ?code|postal code|पिन.?कोड/i],
  ["मोबाइल / ईमेल", /mobile|phone|email|मोबाइल|दूरभाष|ई.?मेल/i],
  ["शैक्षणिक योग्यता", /qualification|education|शिक्षा|योग्यता|कक्षा|बोर्ड/i],
  ["रोल नंबर / अंक", /roll ?no|marks|percentage|रोल.?नंबर|अंक|प्रतिशत/i],
  ["फोटो / हस्ताक्षर", /photo|photograph|signature|फोटो|हस्ताक्षर/i],
  ["बैंक विवरण", /bank|ifsc|account|बैंक|खाता/i]
];
let latestPortalFieldLabels = [];
document.querySelector("#mapPortalFields")?.addEventListener("click", () => {
  const raw = document.querySelector("#portalPageText")?.value || "";
  const output = document.querySelector("#portalFieldMap");
  const sendMap = document.querySelector("#sendPortalMap");
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const found = new Set();
  for (const line of lines) {
    // Only retain a possible label, never the text after a colon (which may be a value).
    const label = line.split(/[:：]/, 1)[0].replace(/[＊*•·]+$/g, "").trim();
    if (!label || label.length > 90) continue;
    if (portalFieldTerms.some(([, pattern]) => pattern.test(label))) found.add(label);
  }
  latestPortalFieldLabels = [...found].slice(0, 40);
  output.replaceChildren();
  if (!latestPortalFieldLabels.length) {
    output.textContent = "कोई साफ field-label नहीं मिला। खाली फॉर्म से label को अलग-अलग लाइन में कॉपी करें; निजी values न डालें।";
    sendMap.disabled = true;
    return;
  }
  const heading = document.createElement("p");
  heading.textContent = "संभावित fields (" + latestPortalFieldLabels.length + ") — मूल वेबसाइट से मिलान करें:";
  output.append(heading);
  const list = document.createElement("ul");
  latestPortalFieldLabels.forEach(label => {
    const item = document.createElement("li");
    item.textContent = label;
    list.append(item);
  });
  output.append(list);
  sendMap.disabled = false;
});
document.querySelector("#sendPortalMap")?.addEventListener("click", () => {
  if (!latestPortalFieldLabels.length || send.disabled) return;
  setMode("form");
  const summary = "मैंने आधिकारिक फॉर्म के खाली पेज से ये संभावित field labels जाँचे हैं। हर field का अर्थ और कौन-सी जानकारी/दस्तावेज़ चाहिए, एक-एक करके समझाओ। कोई value मत मानना।\n" +
    latestPortalFieldLabels.map((label, index) => (index + 1) + ". " + label).join("\n");
  input.value = summary;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
});
\ninput.addEventListener("input", () => {
  input.style.height = "46px";
  input.style.height = Math.min(input.scrollHeight, 130) + "px";
});
function bindQuickPrompts() {
  document.querySelectorAll("[data-q]").forEach(button => button.addEventListener("click", () => {
    if (!send.disabled) ask(button.dataset.q);
  }));
}
bindQuickPrompts();
document.querySelector("#reset").addEventListener("click", () => {
  if (send.disabled) return;
  chat.querySelectorAll(".message").forEach(message => message.remove());
  const welcome = document.querySelector("#welcome");
  const formStart = document.querySelector("#formStart");
  if (welcome) welcome.hidden = activeMode === "form";
  if (formStart) formStart.hidden = activeMode !== "form";
  input.focus();
});
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});
connection?.addEventListener("click", () => checkAIConnection(true));
checkAIConnection();
