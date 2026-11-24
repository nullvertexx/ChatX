require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* Which AI to use:
   - GEMINI_API_KEY    -> Google Gemini (has a FREE tier)
   - ANTHROPIC_API_KEY -> Claude (paid)
   If both are set, Gemini is used. */
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const PROVIDER = GEMINI_KEY ? "gemini" : CLAUDE_KEY ? "claude" : null;

app.use(express.json({ limit: "1mb" }));

/* Serve ONLY the frontend files (never .env or server.js) */
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
["style.css", "extra.css", "script.js"].forEach((file) => {
  app.get("/" + file, (_req, res) => res.sendFile(path.join(__dirname, file)));
});

/* Each chat in the sidebar is a different "persona" (system prompt).
   The prompts live here on the server so the browser can't change them. */
const BASE =
  "Reply in the same language the user writes in (if they write Hinglish, reply in Hinglish). " +
  "Keep answers clear and reasonably short unless the user asks for detail. " +
  "Use plain text; use triple backticks only for code.";

const personas = {
  assistant: "You are a friendly, helpful general-purpose AI assistant. " + BASE,
  coder:
    "You are a patient senior software engineer. Help with coding questions, debugging and explaining concepts. " +
    "Give working code examples and explain the fix briefly. " + BASE,
  writer:
    "You are a creative writing buddy. Help with emails, captions, stories, essays and editing. " +
    "Offer a polished draft first, then ask if they want a different tone. " + BASE,
  tutor:
    "You are a kind study tutor. Explain topics step by step with simple examples, " +
    "and check understanding with a small question at the end when it helps. " + BASE,
  dost:
    "You are a casual, warm Hinglish-speaking dost (friend). Chat naturally, give practical advice, " +
    "and keep it light. Always reply in Hinglish (Hindi written in English letters). " + BASE
};

/* ---------- provider calls ---------- */
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function callGemini(system, messages, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      })),
      generationConfig: { maxOutputTokens: 1024 }
    })
  });
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    const raw = data?.error?.message || `Gemini API error (${r.status})`;
    console.error("Gemini API error:", r.status, raw);
    if (r.status === 400 && /api key/i.test(raw)) throw new ApiError(500, "Invalid Gemini API key. Check your .env file.");
    if (r.status === 403) throw new ApiError(500, "Gemini key was rejected (permission denied). Check the key in Google AI Studio.");
    if (r.status === 404) throw new ApiError(500, `Model "${GEMINI_MODEL}" not found. Set GEMINI_MODEL in .env to a model listed in Google AI Studio.`);
    if (r.status === 429) throw new ApiError(429, "Free-tier limit reached. Wait a minute and try again.");
    throw new ApiError(r.status, raw);
  }

  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!text) {
    const block = data.promptFeedback?.blockReason;
    return block ? `(The AI blocked this request: ${block})` : "(No response)";
  }
  return text;
}

async function callClaude(system, messages, signal) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": CLAUDE_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1024, system, messages })
  });
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    const raw = data?.error?.message || `Claude API error (${r.status})`;
    console.error("Claude API error:", r.status, raw);
    if (r.status === 401) throw new ApiError(500, "Invalid Claude API key. Check your .env file.");
    throw new ApiError(r.status, raw);
  }
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  return text || "(No response)";
}

/* ---------- route ---------- */
app.post("/api/chat", async (req, res) => {
  if (!PROVIDER) {
    return res.status(500).json({
      error: "No API key found. Add GEMINI_API_KEY=your_key to a .env file and restart the server."
    });
  }

  const { persona = "assistant", messages } = req.body || {};
  const system = personas[persona] || personas.assistant;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "No messages provided." });
  }

  let clean = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
    .slice(-30);

  // conversation must start with a user message
  while (clean.length && clean[0].role !== "user") clean.shift();
  if (!clean.length) return res.status(400).json({ error: "Conversation must contain a user message." });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const reply = PROVIDER === "gemini"
      ? await callGemini(system, clean, controller.signal)
      : await callClaude(system, clean, controller.signal);
    res.json({ reply });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("Request failed:", err.message);
    res.status(502).json({
      error: err.name === "AbortError"
        ? "The AI took too long to respond. Try again."
        : "Could not reach the AI service. Check your internet connection."
    });
  } finally {
    clearTimeout(timer);
  }
});

app.listen(PORT, () => {
  console.log(`ChatWave running at http://localhost:${PORT}`);
  if (!PROVIDER) console.warn("WARNING: No API key set. Add GEMINI_API_KEY to a .env file.");
  else console.log(`Using provider: ${PROVIDER} (${PROVIDER === "gemini" ? GEMINI_MODEL : CLAUDE_MODEL})`);
});