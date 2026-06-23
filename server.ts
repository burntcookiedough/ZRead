import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

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

// Unified API endpoint for AI reading assistance actions
app.post("/api/ai/action", async (req, res) => {
  const { action, text, context, word, bookTitle } = req.body;

  if (!action) {
    res.status(400).json({ error: "Action is required." });
    return;
  }

  try {
    const ai = getGeminiClient();

    if (action === "define") {
      if (!word) {
        res.status(400).json({ error: "word is required for define action" });
        return;
      }
      
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
      if (!text) {
        res.status(400).json({ error: "text is required for explain action" });
        return;
      }

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
      if (!text) {
        res.status(400).json({ error: "text is required for summarize action" });
        return;
      }

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

    } else {
      res.status(400).json({ error: "Invalid action. Choose 'define', 'explain', or 'summarize'." });
      return;
    }

  } catch (error: any) {
    console.error("Gemini server action error:", error);
    res.status(500).json({ error: error.message || "An error occurred with the AI assistant." });
  }
});

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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
