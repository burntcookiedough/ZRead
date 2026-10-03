import assert from "node:assert/strict";
import test from "node:test";
import {
  AIClientError,
  triggerAIAction,
  validateAIEndpoint,
} from "../../utils/aiClient";

function installFetch(handler: typeof fetch): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stalledJsonResponse(signal: AbortSignal, onRead?: () => void): Response {
  const response = new Response(null);
  Object.defineProperty(response, "json", {
    value: () => {
      onRead?.();
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    },
  });
  return response;
}

test("AI client validates transport settings, cancellation, and action results", async () => {
  assert.equal(validateAIEndpoint("https://reader.example/api/ai/action"), "https://reader.example/api/ai/action");
  assert.equal(validateAIEndpoint("http://127.0.0.1:8080/ai"), "http://127.0.0.1:8080/ai");
  assert.throws(() => validateAIEndpoint("http://reader.example/api/ai/action"), AIClientError);
  assert.throws(() => validateAIEndpoint("https://user:secret@reader.example/ai"), AIClientError);
  assert.throws(() => validateAIEndpoint("https://reader.example/ai?key=secret"), AIClientError);

  let restoreFetch = installFetch(async (input, init) => {
    assert.equal(input, "/api/ai/action");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { action: "define", word: "sonder", context: "She felt sonder." });
    return jsonResponse({ result: {
      word: "sonder",
      definition: "The realization that others have inner lives.",
      contextualMeaning: "She noticed the private lives around her.",
      simpleExample: "On the train, he felt sonder for each passenger.",
    } });
  });
  try {
    const result = await triggerAIAction({ action: "define", word: "sonder", context: "She felt sonder." });
    assert.equal(result.word, "sonder");
  } finally {
    restoreFetch();
  }

  restoreFetch = installFetch(async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as { text: string; bookTitle: string };
    assert.equal(request.text.length, 8000);
    assert.equal(request.bookTitle.length, 500);
    return jsonResponse({ result: {
      plainExplanation: "A clear explanation.",
      whyItMatters: "It changes the character's view.",
      possibleSubtext: "It suggests a larger conflict.",
    } });
  });
  try {
    const result = await triggerAIAction({
      action: "explain",
      text: "p".repeat(9000),
      bookTitle: "b".repeat(600),
    });
    assert.equal(result.plainExplanation, "A clear explanation.");
  } finally {
    restoreFetch();
  }

  restoreFetch = installFetch(async () => jsonResponse({ result: { word: "sonder", definition: "Only one field." } }));
  try {
    await assert.rejects(
      triggerAIAction({ action: "define", word: "sonder" }),
      (error: unknown) => error instanceof AIClientError && error.code === "invalid_response",
    );
  } finally {
    restoreFetch();
  }

  restoreFetch = installFetch(async () => jsonResponse({ error: "Service quota exceeded." }, 429));
  try {
    await assert.rejects(
      triggerAIAction({ action: "explain", text: "A short passage." }),
      (error: unknown) => error instanceof AIClientError && error.code === "http" && error.message.includes("quota"),
    );
  } finally {
    restoreFetch();
  }

  restoreFetch = installFetch(async (_input, init) => stalledJsonResponse(init!.signal!));
  try {
    await assert.rejects(
      triggerAIAction({ action: "explain", text: "A short passage." }, { timeoutMs: 20 }),
      (error: unknown) => error instanceof AIClientError && error.code === "timeout",
    );
  } finally {
    restoreFetch();
  }

  let markJsonStarted!: () => void;
  const jsonStarted = new Promise<void>((resolve) => { markJsonStarted = resolve; });
  restoreFetch = installFetch(async (_input, init) => stalledJsonResponse(init!.signal!, markJsonStarted));
  try {
    const controller = new AbortController();
    const request = triggerAIAction({ action: "explain", text: "A short passage." }, { signal: controller.signal });
    await jsonStarted;
    controller.abort();
    await assert.rejects(
      request,
      (error: unknown) => error instanceof AIClientError && error.code === "cancelled",
    );
  } finally {
    restoreFetch();
  }

  restoreFetch = installFetch(async () => new Response("not JSON"));
  try {
    await assert.rejects(
      triggerAIAction({ action: "explain", text: "A short passage." }),
      (error: unknown) => error instanceof AIClientError && error.code === "invalid_response",
    );
  } finally {
    restoreFetch();
  }

  restoreFetch = installFetch((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }));
  try {
    await assert.rejects(
      triggerAIAction({ action: "summarize", text: "A short chapter." }, { timeoutMs: 5 }),
      (error: unknown) => error instanceof AIClientError && error.code === "timeout",
    );
    const controller = new AbortController();
    const request = triggerAIAction({ action: "explain", text: "A short passage." }, { signal: controller.signal });
    controller.abort();
    await assert.rejects(
      request,
      (error: unknown) => error instanceof AIClientError && error.code === "cancelled",
    );
  } finally {
    restoreFetch();
  }
});
