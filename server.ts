import express from "express";
import type { ErrorRequestHandler, RequestHandler } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const allowedOrigins = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...configuredAllowedOrigins(),
]);

const cors: RequestHandler = (req, res, next) => {
  const origin = req.get("Origin");
  res.vary("Origin");
  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json({ error: "This origin is not allowed by the AI adapter." });
    return;
  }
  if (origin) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
};

app.use(cors);
app.use(express.json({ limit: "64kb" }));
const jsonBodyErrors: ErrorRequestHandler = (error, _req, res, next) => {
  if (isRecord(error) && error.type === "entity.too.large") {
    res.status(413).json({ error: "The AI action request is too large. Limit text to 8,000 characters." });
    return;
  }
  next(error);
};
app.use(jsonBodyErrors);

const PORT = 3000;
const HOST = process.env.ZREAD_HOST || "127.0.0.1";

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Browser development adapter. The desktop app calls its configured HTTPS adapter directly.
app.post("/api/ai/action", async (req, res) => {
  const body: unknown = req.body;
  if (!isRecord(body)) {
    res.status(400).json({ error: "A JSON action request is required." });
    return;
  }

  const { action, text, context, word, bookTitle } = body;

  if (action !== "define" && action !== "explain" && action !== "summarize") {
    res.status(400).json({ error: "Choose define, explain, or summarize for the action." });
    return;
  }
  if (bookTitle !== undefined && typeof bookTitle !== "string") {
    res.status(400).json({ error: "bookTitle must be text." });
    return;
  }
  if (action === "define" && context !== undefined && typeof context !== "string") {
    res.status(400).json({ error: "context must be text for define action." });
    return;
  }
  if (action === "define" && (typeof word !== "string" || !word.trim() || word.length > 300)) {
    res.status(400).json({ error: "word is required and must be 300 characters or fewer." });
    return;
  }
  if (action === "define" && typeof context === "string" && context.length > 2000) {
    res.status(400).json({ error: "context must be 2,000 characters or fewer." });
    return;
  }
  if ((action === "explain" || action === "summarize") && (typeof text !== "string" || !text.trim() || text.length > 8000)) {
    res.status(400).json({ error: `text is required for ${action} and must be 8,000 characters or fewer.` });
    return;
  }
  if (typeof bookTitle === "string" && bookTitle.length > 500) {
    res.status(400).json({ error: "bookTitle must be 500 characters or fewer." });
    return;
  }

  try {
    const ai = getGeminiClient();

    if (action === "define") {
      const prompt = `Analyze the selected word: "${word}" inside the following sentence context: "${context || ''}".
Provide a clear, brief definition, explain what it means in this specific context, and provide a single simple example sentence.
Keep definitions precise and scholarly but easy to read. Let the book title be "${bookTitle || 'Unknown'}".`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an expert literary scholar and senior dictionary editor. Return response in strict JSON matching the schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              definition: { type: Type.STRING, description: "Standard general dictionary definition" },
              contextualMeaning: { type: Type.STRING, description: "Specific meaning of this word in current passage's context" },
              simpleExample: { type: Type.STRING, description: "One simple example sentence illustrating the word's usage" }
            },
            required: ["word", "definition", "contextualMeaning", "simpleExample"]
          }
        }
      });

      res.json({ result: JSON.parse(response.text || "{}") });
      return;

    } else if (action === "explain") {
      const prompt = `Explain the following paragraph or excerpt: "${text}".
Provide an plain explanation, summarize why it matters or its significance, and explore any possible literary subtext or hidden meanings.
Let the book title be "${bookTitle || 'Unknown'}".`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an expert literary academic and sympathetic reading companion. Return response in strict JSON matching the schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              plainExplanation: { type: Type.STRING, description: "A warm, 3-5 sentence crystal-clear explanation of the literal and conceptual meaning" },
              whyItMatters: { type: Type.STRING, description: "Why this passage is significant or has intellectual value" },
              possibleSubtext: { type: Type.STRING, description: "Nuances, themes, historical context or subtext present in the writing" }
            },
            required: ["plainExplanation", "whyItMatters", "possibleSubtext"]
          }
        }
      });

      res.json({ result: JSON.parse(response.text || "{}") });
      return;

    } else if (action === "summarize") {
      const prompt = `Summarize this chapter or section of text: "${text}".
Describe what happened, extract the important ideas, list any key characters or concepts introduced, and formulate a punchy, one-line summary.
Let the book title be "${bookTitle || 'Unknown'}".`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are a professional literary analyst and reading coach. Return response in strict JSON matching the schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              whatHappened: { type: Type.STRING, description: "A concise description of the main events or arguments" },
              importantIdeas: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "Array of key ideas, insights, or thematic milestones" 
              },
              charactersOrConcepts: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "Array of characters, key terms, or concepts that take center stage in this section" 
              },
              oneLineMemory: { type: Type.STRING, description: "One simple, memorable sentence summarizing the core of this section" }
            },
            required: ["whatHappened", "importantIdeas", "charactersOrConcepts", "oneLineMemory"]
          }
        }
      });

      res.json({ result: JSON.parse(response.text || "{}") });
      return;

    }

  } catch (error) {
    console.error("Gemini server action error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "An error occurred with the AI assistant." });
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configuredAllowedOrigins(): string[] {
  return (process.env.ZREAD_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
}

function normalizeOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid origin in ZREAD_ALLOWED_ORIGINS: ${value}`);
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`ZREAD_ALLOWED_ORIGINS entries must be origins without paths or credentials: ${value}`);
  }
  if (url.protocol === "tauri:") return `tauri://${url.host}`;
  if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  throw new Error(`ZREAD_ALLOWED_ORIGINS supports only tauri, http, or https origins: ${value}`);
}

// Setup Vite Dev Server / Static production serves
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

startServer();
