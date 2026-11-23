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
    })
    .filter(Boolean)
    .slice(-12);
}

async function checkAIConnection() {
  if (!connection) return;
  connection.textContent = "AI जाँच रहा है…";
  connection.classList.remove("ready", "failed");
  connection.disabled = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(API_BASE_URL + "/health?test=1", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok || data.aiReady !== true) throw new Error(data.error || "AI कनेक्शन नहीं बना।");
    connection.textContent = "AI तैयार है · " + data.model;
    connection.classList.add("ready");
    connection.title = "Gemini से असली टेस्ट जवाब मिला।";
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
  const reply = addMessage("BHARAT AI जवाब तैयार कर रहा है…", "bot");
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
    reply.textContent = data.reply.trim();
    delete reply.dataset.pending;
  } catch (error) {
    reply.dataset.failed = "true";
    delete reply.dataset.pending;
    if (error.name === "AbortError") {
      reply.textContent = "जवाब आने में बहुत समय लगा। इंटरनेट जाँचकर दोबारा भेजें।";
    } else if (error.message === "Failed to fetch" || error instanceof TypeError) {
      reply.textContent = "सर्वर से कनेक्शन नहीं हुआ। ऊपर AI कनेक्शन पर टैप करके जाँचें।";
    } else {
      reply.textContent = "AI जवाब नहीं दे पाया: " + error.message;
    }
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
  document.querySelectorAll("[data-q]").forEach(button => {
    button.addEventListener("click", () => {
      if (!send.disabled) ask(button.dataset.q);
    });
  });
}
bindQuickPrompts();

document.querySelector("#reset").addEventListener("click", () => {
  if (send.disabled) return;
  chat.innerHTML = '<section class="welcome" id="welcome"><div class="welcome-icon">भा</div><h1>नमस्ते! मैं BHARAT AI हूँ।</h1><p>सरकारी भर्ती, फॉर्म, योजनाओं या किसी भी सवाल के बारे में लिखें।</p><div class="quick-prompts"><button data-q="राजस्थान में 12वीं पास के लिए सरकारी भर्तियाँ बताओ">सरकारी भर्तियाँ</button><button data-q="मुझे सरकारी फॉर्म भरने में मदद चाहिए">फॉर्म भरने में मदद</button><button data-q="सरकारी योजनाओं की जानकारी दो">सरकारी योजनाएँ</button><button data-q="मेरे दस्तावेज़ समझने में मदद करो">दस्तावेज़</button></div></section>';
  bindQuickPrompts();
  input.focus();
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

connection?.addEventListener("click", checkAIConnection);
checkAIConnection();
