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
  const pattern = /(\\*\\*[^*]+\\*\\*|`[^`]+`|\\*[^*]+\\*)/g;
  let last = 0, match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parent.append(document.createTextNode(text.slice(last, match.index)));
    const token = match[0], node = token.startsWith("**") ? document.createElement("strong")
      : token.startsWith("`") ? document.createElement("code") : document.createElement("em");
    node.textContent = token.startsWith("**") ? token.slice(2, -2) : token.slice(1, -1);
    parent.append(node);
    last = pattern.lastIndex;
  }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
}

function renderMarkdown(element, markdown) {
  element.replaceChildren();
  const lines = markdown.replace(/\\r/g, "").split("\\n");
  let list = null, listKind = "";
  const closeList = () => { list = null; listKind = ""; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    const heading = line.match(/^\\s{0,3}(#{1,3})\\s+(.+)$/);
    const bullet = line.match(/^\\s*[-*+]\\s+(.+)$/);
    const numbered = line.match(/^\\s*\\d+[.)]\\s+(.+)$/);
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

// The API currently returns a complete reply; reveal it progressively in the chat UI.
async function revealReply(element, text) {
  let shown = "";
  const step = 7;
  for (let i = 0; i < text.length; i += step) {
    shown += text.slice(i, i + step);
    renderMarkdown(element, shown);
    await new Promise(resolve => setTimeout(resolve, 18));
  }
  renderMarkdown(element, text);
}

async function checkAIConnection() {
  if (!connection) return;
  connection.textContent = "AI जाँच रहा है…";
  connection.classList.remove("ready", "failed");
  connection.disabled = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(API_BASE_URL + "/health?test=1", { method: "GET", cache: "no-store", signal: controller.signal });
    const data = await response.json();
    if (!response.ok || data.aiReady !== true) throw new Error(data.error || "AI कनेक्शन नहीं बना।");
    connection.textContent = "AI तैयार है · " + data.model;
    connection.classList.add("ready");
    connection.title = "AI से टेस्ट जवाब मिला।";
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
  reply.innerHTML = '<span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  reply.dataset.pending = "true";
  send.disabled = true;
  input.disabled = true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  try {
    const response = await fetch(API_BASE_URL + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: question, history, language: "hi" }),
      signal: controller.signal
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.error || data.message || ("सर्वर त्रुटि " + response.status));
    if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("AI से खाली जवाब मिला।");
    delete reply.dataset.pending;
    reply.classList.remove("thinking");
    reply.removeAttribute("aria-label");
    await revealReply(reply, data.reply.trim());
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
  bindQuickPrompts(); input.focus();
});
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});
connection?.addEventListener("click", checkAIConnection);
checkAIConnection();
