/* ChatWave AI – frontend (talks to /api/chat on server.js) */

const chats = [
  {
    id: "assistant", name: "Claude Assistant", initials: "CA", color: "violet", pinned: true,
    status: "Ready to help", about: "Your all-purpose AI assistant. Ask me anything.",
    greeting: "Hi! 👋 I'm your AI assistant. Ask me anything: questions, ideas, summaries, planning.",
    prompts: ["Explain how the internet works in simple words", "Give me a 3-day workout plan for beginners", "Help me plan a budget trip to Goa"]
  },
  {
    id: "coder", name: "Code Helper", initials: "CH", color: "blue", pinned: true,
    status: "Debugging since forever", about: "Debug code, learn concepts, and get working examples.",
    greeting: "Hey! 💻 Paste your code or error, and I'll help you fix it.",
    prompts: ["What is the difference between let, const and var?", "Write a JavaScript function to reverse a string", "Explain async/await like I'm a beginner"]
  },
  {
    id: "writer", name: "Writing Buddy", initials: "WB", color: "rose",
    status: "Words on tap", about: "Emails, captions, stories, essays, and editing.",
    greeting: "Hello! ✍️ Tell me what you want to write and I'll draft it for you.",
    prompts: ["Write a polite email asking for a day off", "Give me 5 Instagram captions for a travel photo", "Make this sentence sound more professional"]
  },
  {
    id: "tutor", name: "Study Tutor", initials: "ST", color: "green",
    status: "Learning mode on", about: "Step-by-step explanations with simple examples.",
    greeting: "Hi! 📚 What topic are we learning today?",
    prompts: ["Explain photosynthesis step by step", "How do I solve quadratic equations?", "Quiz me on basic Python"]
  },
  {
    id: "dost", name: "Hinglish Dost", initials: "HD", color: "amber",
    status: "Hamesha online", about: "Ek casual dost jo Hinglish mein baat karta hai.",
    greeting: "Arre bhai! 😄 Bol, kya chal raha hai? Kuch bhi pooch le.",
    prompts: ["Bhai, interview ke liye kaise prepare karu?", "Aaj kya khana banau, kuch idea de", "Mujhe motivate kar, bahut lazy feel ho raha hai"]
  }
];

/* ---------- state ---------- */
const STORE_KEY = "chatwave.ai.v1";

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveHistory() {
  try {
    const clean = {};
    for (const [id, list] of Object.entries(state.history)) clean[id] = list.filter((m) => m.role !== "error");
    localStorage.setItem(STORE_KEY, JSON.stringify(clean));
  } catch { /* storage may be unavailable */ }
}

const state = {
  activeId: "assistant",
  query: "",
  showDetails: window.innerWidth > 1100,
  mobileChat: false,
  history: loadHistory(),
  loading: {}
};
let toastTimer = null;

/* ---------- helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (name, size = 16, cls = "") => `<i data-lucide="${name}" width="${size}" height="${size}" class="${cls}"></i>`;
const activeChat = () => chats.find((c) => c.id === state.activeId) || chats[0];
const historyOf = (id) => state.history[id] || (state.history[id] = []);
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/* tiny formatter: ```code blocks```, `inline code`, **bold** */
function format(text) {
  return text.split("```").map((part, i) => {
    if (i % 2 === 1) {
      const code = part.replace(/^[\w+#-]*\n/, "").replace(/\n$/, "");
      return `<pre><code>${esc(code)}</code></pre>`;
    }
    return esc(part)
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  }).join("");
}

function avatar(chat, opts = {}) {
  const { large = false, profile = false } = opts;
  return `<span class="cw-avatar avatar-${chat.color} ${large ? "large" : ""} ${profile ? "profile" : ""}" aria-hidden="true">${chat.initials}<i class="cw-presence"></i></span>`;
}

function messageHTML(m, chat) {
  const mine = m.role === "user";
  const isError = m.role === "error";
  const body = mine ? esc(m.content) : isError ? esc(m.content) : format(m.content);
  return `
    <div class="cw-message-row ${mine ? "mine" : ""}">
      ${mine ? "" : avatar(chat)}
      <div class="cw-message-content">
        <span class="cw-message-author">${mine ? "You" : esc(chat.name)}</span>
        <div class="cw-bubble ${isError ? "error" : ""}">${body}</div>
        <div class="cw-message-meta">
          ${m.ts ? `<time>${fmtTime(m.ts)}</time>` : ""}
          ${mine ? icon("check-check", 14, "cw-read") : ""}
        </div>
      </div>
    </div>`;
}

function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }

function showNotice(text) {
  $("#toastText").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("#toast").hidden = true; }, 3200);
}

function scrollMessagesToBottom() {
  const el = $("#messages");
  el.scrollTop = el.scrollHeight;
}

/* ---------- renderers ---------- */
function renderList() {
  const q = state.query.toLowerCase();
  const filtered = chats.filter((c) => c.name.toLowerCase().includes(q));
  $("#chatList").innerHTML = filtered.length
    ? filtered.map((chat) => {
        const list = historyOf(chat.id).filter((m) => m.role !== "error");
        const last = list[list.length - 1];
        const preview = last ? (last.role === "user" ? "You: " : "") + last.content.replace(/\s+/g, " ") : chat.about;
        return `
        <button class="cw-chat-row ${chat.id === state.activeId ? "active" : ""}" data-chat="${chat.id}">
          ${avatar(chat)}
          <span class="cw-chat-meta">
            <span class="cw-chat-name">${esc(chat.name)}${chat.pinned ? '<span class="cw-pin">✦</span>' : ""}</span>
            <span class="cw-chat-preview">${esc(preview)}</span>
          </span>
          <span class="cw-chat-side"><small>${last ? fmtTime(last.ts) : ""}</small></span>
        </button>`;
      }).join("")
    : `<p class="cw-no-results">No conversations found.</p>`;
}

function renderHeader() {
  const chat = activeChat();
  const typing = state.loading[chat.id];
  $("#chatHeader").innerHTML = `
    <button class="cw-back cw-icon-button" aria-label="Back to conversations" data-action="back">${icon("arrow-left", 18)}</button>
    ${avatar(chat, { large: true })}
    <div class="cw-header-person">
      <strong>${esc(chat.name)}</strong>
      <span><i class="online"></i>${typing ? "typing…" : esc(chat.status)}</span>
    </div>
    <div class="cw-header-actions">
      <button class="cw-icon-button" aria-label="Clear this chat" title="Clear this chat" data-action="clear">${icon("trash-2", 18)}</button>
      <span class="cw-action-divider"></span>
      <button class="cw-icon-button ${state.showDetails ? "active" : ""}" aria-label="Toggle details" data-action="toggle-details">${icon("info", 18)}</button>
    </div>`;
}

function renderMessages() {
  const chat = activeChat();
  const list = historyOf(chat.id);
  let html = `<div class="cw-history-note"><span>✳</span><p>This is the start of your conversation with <strong>${esc(chat.name)}</strong>.</p></div>`;

  // greeting is display-only (not sent to the API)
  html += messageHTML({ role: "assistant", content: chat.greeting }, chat);

  if (list.length === 0) {
    html += `<div class="cw-empty-chat">
      <div class="cw-empty-icon">${icon("sparkles", 24)}</div>
      <strong>Try asking</strong>
      <div class="cw-chips">${chat.prompts.map((p) => `<button class="cw-chip" data-prompt="${esc(p)}">${esc(p)}</button>`).join("")}</div>
    </div>`;
  } else {
    html += list.map((m) => messageHTML(m, chat)).join("");
  }

  if (state.loading[chat.id]) {
    html += `<div class="cw-message-row">${avatar(chat)}<div class="cw-message-content"><span class="cw-message-author">${esc(chat.name)}</span><div class="cw-bubble cw-typing"><i></i><i></i><i></i></div></div></div>`;
  }
  $("#messages").innerHTML = html;
}

function renderDetails() {
  const chat = activeChat();
  $("#details").innerHTML = `
    <div class="cw-details-head">
      <span>DETAILS</span>
      <button class="cw-icon-button cw-mobile-close" aria-label="Close details" data-action="close-details">${icon("x", 17)}</button>
    </div>
    <div class="cw-profile">
      ${avatar(chat, { profile: true })}
      <h2>${esc(chat.name)}</h2>
      <p>${esc(chat.about)}</p>
      <span class="cw-profile-status"><i class="online"></i>${esc(chat.status)}</span>
      <div class="cw-profile-actions">
        <button data-action="clear">${icon("trash-2", 16)}<span>Clear chat</span></button>
      </div>
    </div>
    <div class="cw-detail-section">
      <div class="cw-detail-title"><span>TRY ASKING</span></div>
      <div class="cw-try-list">
        ${chat.prompts.map((p) => `<button data-prompt="${esc(p)}">${esc(p)}</button>`).join("")}
      </div>
    </div>
    <div class="cw-details-foot"><span>ChatWave AI</span><span>Built with love ${icon("sparkles", 12)}</span></div>`;
}

function applyLayout() {
  $("#shell").classList.toggle("no-details", !state.showDetails);
  $("#rail").classList.toggle("cw-hidden-mobile", state.mobileChat);
  $("#conversation").classList.toggle("cw-show-mobile", state.mobileChat);
}

function renderAll() {
  renderList();
  renderHeader();
  renderMessages();
  renderDetails();
  applyLayout();
  $("#draft").placeholder = `Message ${activeChat().name}…`;
  refreshIcons();
  scrollMessagesToBottom();
}

/* ---------- sending ---------- */
function updateSendButton() {
  $("#sendBtn").disabled = !$("#draft").value.trim() || !!state.loading[state.activeId];
}

function autoGrow() {
  const t = $("#draft");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 140) + "px";
}

async function sendText(raw) {
  const text = raw.trim();
  const id = state.activeId;
  if (!text || state.loading[id]) return;

  const list = historyOf(id);
  list.push({ role: "user", content: text, ts: Date.now() });
  state.loading[id] = true;
  saveHistory();

  $("#draft").value = "";
  autoGrow();
  updateSendButton();
  renderList(); renderHeader(); renderMessages(); refreshIcons(); scrollMessagesToBottom();

  try {
    const payload = list
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-30)
      .map(({ role, content }) => ({ role, content }));

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: id, messages: payload })
    });

    let data = {};
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);

    list.push({ role: "assistant", content: data.reply, ts: Date.now() });
  } catch (err) {
    const msg = /Failed to fetch|NetworkError/i.test(err.message)
      ? "Can't reach the server. Make sure `npm start` is running and you opened http://localhost:3000"
      : err.message;
    list.push({ role: "error", content: msg, ts: Date.now() });
  } finally {
    state.loading[id] = false;
    saveHistory();
    renderList();
    if (state.activeId === id) {
      renderHeader(); renderMessages(); scrollMessagesToBottom();
    }
    updateSendButton();
    refreshIcons();
  }
}

function clearChat(id) {
  historyOf(id).length = 0;
  saveHistory();
  renderAll();
}

/* ---------- events ---------- */
document.addEventListener("click", (event) => {
  const promptEl = event.target.closest("[data-prompt]");
  if (promptEl) { sendText(promptEl.dataset.prompt); return; }

  const chatRow = event.target.closest("[data-chat]");
  if (chatRow) {
    state.activeId = chatRow.dataset.chat;
    state.mobileChat = true;
    renderAll();
    updateSendButton();
    return;
  }

  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;

  switch (actionEl.dataset.action) {
    case "back":
      state.mobileChat = false;
      applyLayout();
      break;
    case "toggle-details":
      state.showDetails = !state.showDetails;
      applyLayout(); renderHeader(); refreshIcons();
      break;
    case "close-details":
      state.showDetails = false;
      applyLayout(); renderHeader(); refreshIcons();
      break;
    case "emoji": {
      const draft = $("#draft");
      draft.value = `${draft.value} 😊`;
      updateSendButton(); autoGrow(); draft.focus();
      break;
    }
    case "send":
      sendText($("#draft").value);
      break;
    case "clear":
      if (confirm(`Clear your chat with ${activeChat().name}?`)) clearChat(state.activeId);
      break;
    case "clear-all":
      if (confirm("Delete ALL chats? This cannot be undone.")) {
        state.history = {};
        saveHistory();
        renderAll();
      }
      break;
    case "dismiss-toast":
      $("#toast").hidden = true;
      break;
  }
});

$("#searchInput").addEventListener("input", (e) => {
  state.query = e.target.value;
  renderList();
  refreshIcons();
});

$("#draft").addEventListener("input", () => { updateSendButton(); autoGrow(); });

$("#draft").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendText($("#draft").value);
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("#searchInput").focus();
  }
});

/* ---------- init ---------- */
renderAll();
updateSendButton();