const API_BASE_URL = "https://bharat-ai-api.gyarasigujjar57.workers.dev";
const chat = document.querySelector("#chat");
const form = document.querySelector("#form");
const input = document.querySelector("#message");
const send = document.querySelector("#send");
const connection = document.querySelector("#connection");

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
  document.querySelector("#welcome")?.remove();
}

const CHAT_STORAGE_KEY = "bharat_ai_guest_chat_v1";
function saveGuestChat() {
  try {
    const messages = [...chat.querySelectorAll(".message")].map(el => ({
      role: el.classList.contains("user") ? "user" : "bot",
      text: el.querySelector(".bubble")?.textContent || ""
    })).filter(item => item.text && !item.text.includes("जवाब तैयार कर रहा है"));
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  } catch (_) {}
}
function restoreGuestChat() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "[]");
    if (!Array.isArray(saved) || !saved.length) return;
    hideWelcome();
    for (const item of saved.slice(-40)) {
      if (!item || !["user","bot"].includes(item.role) || typeof item.text !== "string") continue;
      const bubble = addMessage(item.text, item.role);
      if (item.role === "bot") renderMarkdown(bubble, item.text);
    }
  } catch (_) {
    try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch (_) {}
  }
}

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
async function checkAIConnection() {
  if (!connection) return;
  connection.textContent = "AI जाँच रहा है…";
  connection.classList.remove("ready", "failed");
  connection.disabled = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    // Cheap health check only. Never spend a Gemini request just because
    // someone opened the app or tapped the connection indicator.
    const response = await fetch(API_BASE_URL + "/health", { method: "GET", cache: "no-store", signal: controller.signal });
    const data = await response.json();
    if (!response.ok || data.ok !== true || data.aiKeyConfigured !== true) throw new Error(data.error || "सर्वर कनेक्शन नहीं बना।");
    connection.textContent = "सर्वर जुड़ा है · AI सवाल पर चलेगा";
    connection.classList.add("ready");
    connection.title = "सर्वर उपलब्ध है। Gemini का उपयोग तभी होगा जब आप सवाल भेजेंगे।";
  } catch (error) {
    connection.textContent = "AI कनेक्शन में समस्या · फिर जाँचें";
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
      body: JSON.stringify({ message: question, history, language: "hi" }),
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
    saveGuestChat();
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
input.addEventListener("input", () => {
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
  chat.innerHTML = '<section class="welcome" id="welcome"><div class="welcome-icon">भा</div><h1>नमस्ते! मैं BHARAT AI हूँ।</h1><p>परीक्षा, भर्ती, दाखिले, छात्रवृत्ति और फॉर्म से जुड़े काम के लिए पूछें।</p><div class="quick-prompts"><button data-q="राजस्थान में 12वीं पास के लिए सरकारी भर्तियाँ बताओ">सरकारी भर्तियाँ</button><button data-q="मुझे सरकारी फॉर्म भरने में मदद चाहिए">फॉर्म भरने में मदद</button><button data-q="सरकारी योजनाओं की जानकारी दो">सरकारी योजनाएँ</button><button data-q="मेरे दस्तावेज़ समझने में मदद करो">दस्तावेज़</button></div></section>';
  try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch (_) {}
  bindQuickPrompts(); input.focus();
});
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});
connection?.addEventListener("click", checkAIConnection);
checkAIConnection();
