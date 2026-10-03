/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isTauriRuntime } from "@/app/runtime";

export interface AIDefineResult {
  word: string;
  definition: string;
  contextualMeaning: string;
  simpleExample: string;
}

export interface AIExplainResult {
  plainExplanation: string;
  whyItMatters: string;
  possibleSubtext: string;
}

export interface AISummarizeResult {
  whatHappened: string;
  importantIdeas: string[];
  charactersOrConcepts: string[];
  oneLineMemory: string;
}

export type AIActionRequest =
  | { action: "define"; word: string; context?: string; bookTitle?: string }
  | { action: "explain"; text: string; bookTitle?: string }
  | { action: "summarize"; text: string; bookTitle?: string };

export type AIActionResult = AIDefineResult | AIExplainResult | AISummarizeResult;

export interface AISettings {
  enabled: boolean;
  endpoint: string;
}

export type AIClientErrorCode =
  | "disabled"
  | "configuration"
  | "storage"
  | "cancelled"
  | "timeout"
  | "network"
  | "http"
  | "invalid_response";

export class AIClientError extends Error {
  constructor(message: string, public readonly code: AIClientErrorCode) {
    super(message);
    this.name = "AIClientError";
  }
}

const SETTINGS_KEY = "zread-ai-settings";
const DEFAULT_TIMEOUT_MS = 30_000;

function defaultSettings(): AISettings {
  return { enabled: !isTauriRuntime, endpoint: "" };
}

export function getAISettings(): AISettings {
  const defaults = defaultSettings();
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return defaults;
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) return defaults;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaults.enabled,
      endpoint: typeof parsed.endpoint === "string" ? parsed.endpoint : "",
    };
  } catch {
    return defaults;
  }
}

export function validateAIEndpoint(endpoint: string): string {
  const value = endpoint.trim();
  if (!value) {
    throw new AIClientError("Enter an AI service endpoint URL.", "configuration");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AIClientError("Enter a complete URL, such as https://ai.example.com/api/ai/action.", "configuration");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const isLoopback =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(host);

  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new AIClientError(
      "Use an HTTPS endpoint. HTTP is allowed only for localhost or a loopback address.",
      "configuration",
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new AIClientError(
      "Remove credentials, query parameters, and fragments from the endpoint URL. Configure service access on the adapter server.",
      "configuration",
    );
  }

  return url.toString();
}

export function saveAISettings(settings: AISettings): AISettings {
  if (typeof settings.enabled !== "boolean" || typeof settings.endpoint !== "string") {
    throw new AIClientError("AI settings are invalid. Review the enabled switch and endpoint URL.", "configuration");
  }

  const normalized = {
    enabled: settings.enabled,
    endpoint: settings.endpoint.trim(),
  };
  if (normalized.enabled) normalized.endpoint = validateAIEndpoint(normalized.endpoint);

  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  } catch {
    throw new AIClientError("Could not save AI settings on this device. Check local storage availability.", "storage");
  }
  return normalized;
}

export interface AIRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Calls the configured desktop adapter, or the retained relative dev API in the browser. */
export function triggerAIAction(
  payload: Extract<AIActionRequest, { action: "define" }>,
  options?: AIRequestOptions,
): Promise<AIDefineResult>;
export function triggerAIAction(
  payload: Extract<AIActionRequest, { action: "explain" }>,
  options?: AIRequestOptions,
): Promise<AIExplainResult>;
export function triggerAIAction(
  payload: Extract<AIActionRequest, { action: "summarize" }>,
  options?: AIRequestOptions,
): Promise<AISummarizeResult>;
export async function triggerAIAction(
  payload: AIActionRequest,
  options: AIRequestOptions = {},
): Promise<AIActionResult> {
  const body = normalizeRequest(payload);
  const settings = getAISettings();
  if (!settings.enabled) {
    throw new AIClientError(
      "AI is disabled. Enable it and configure a service endpoint in the Library settings to use reading assistance.",
      "disabled",
    );
  }

  const endpoint = isTauriRuntime ? validateAIEndpoint(settings.endpoint) : "/api/ai/action";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000) {
    throw new AIClientError("AI request timeout must be between 1 millisecond and 5 minutes.", "configuration");
  }
  if (options.signal?.aborted) {
    throw new AIClientError("AI request was cancelled.", "cancelled");
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortForCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortForCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (options.signal?.aborted) throw cancelledError();
    if (timedOut) throw timeoutError(timeoutMs);

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      if (options.signal?.aborted) throw cancelledError();
      if (timedOut) throw timeoutError(timeoutMs);
      throw new AIClientError("The AI service returned invalid JSON. Check its adapter response format.", "invalid_response");
    }

    if (!response.ok) {
      throw new AIClientError(
        responseError(data) || `The AI service returned HTTP ${response.status}. Check its status or quota.`,
        "http",
      );
    }

    if (options.signal?.aborted) throw cancelledError();
    if (timedOut) throw timeoutError(timeoutMs);
    if (!isRecord(data) || !Object.prototype.hasOwnProperty.call(data, "result")) {
      throw new AIClientError("The AI service response is missing its result object.", "invalid_response");
    }
    return validateResult(payload.action, data.result);
  } catch (error) {
    if (error instanceof AIClientError) throw error;
    if (options.signal?.aborted) throw cancelledError();
    if (timedOut) throw timeoutError(timeoutMs);
    if (isAbortError(error)) throw cancelledError();
    throw new AIClientError(
      "Could not reach the AI service. Check the endpoint, network connection, and adapter cross-origin settings.",
      "network",
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortForCaller);
  }
}

function normalizeRequest(payload: AIActionRequest): AIActionRequest {
  if (!isRecord(payload)) {
    throw new AIClientError("Choose a valid AI action before sending a request.", "configuration");
  }

  const bookTitle = optionalString(payload.bookTitle, "Book title", 500);
  if (payload.action === "define") {
    if (typeof payload.word !== "string" || !payload.word.trim()) {
      throw new AIClientError("A word is required for a definition request.", "configuration");
    }
    const context = optionalString(payload.context, "Sentence context", 2000);
    return {
      action: "define",
      word: payload.word.slice(0, 300),
      ...(context === undefined ? {} : { context }),
      ...(bookTitle === undefined ? {} : { bookTitle }),
    };
  }

  if (payload.action === "explain" || payload.action === "summarize") {
    if (typeof payload.text !== "string" || !payload.text.trim()) {
      throw new AIClientError(`Text is required for the ${payload.action} action.`, "configuration");
    }
    return {
      action: payload.action,
      text: payload.text.slice(0, 8000),
      ...(bookTitle === undefined ? {} : { bookTitle }),
    };
  }

  throw new AIClientError("Choose define, explain, or summarize for the AI action.", "configuration");
}

function optionalString(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new AIClientError(`${label} must be text.`, "configuration");
  }
  return value.slice(0, maxLength);
}

function validateResult(action: AIActionRequest["action"], value: unknown): AIActionResult {
  if (!isRecord(value)) throw invalidResult(action);

  if (action === "define") {
    if (isNonEmptyString(value.word) && isNonEmptyString(value.definition) &&
        isNonEmptyString(value.contextualMeaning) && isNonEmptyString(value.simpleExample)) {
      return {
        word: value.word,
        definition: value.definition,
        contextualMeaning: value.contextualMeaning,
        simpleExample: value.simpleExample,
      };
    }
  } else if (action === "explain") {
    if (isNonEmptyString(value.plainExplanation) && isNonEmptyString(value.whyItMatters) &&
        isNonEmptyString(value.possibleSubtext)) {
      return {
        plainExplanation: value.plainExplanation,
        whyItMatters: value.whyItMatters,
        possibleSubtext: value.possibleSubtext,
      };
    }
  } else if (
    isNonEmptyString(value.whatHappened) &&
    isNonEmptyString(value.oneLineMemory) &&
    isStringArray(value.importantIdeas) &&
    isStringArray(value.charactersOrConcepts)
  ) {
    return {
      whatHappened: value.whatHappened,
      importantIdeas: value.importantIdeas,
      charactersOrConcepts: value.charactersOrConcepts,
      oneLineMemory: value.oneLineMemory,
    };
  }

  throw invalidResult(action);
}

function invalidResult(action: AIActionRequest["action"]): AIClientError {
  return new AIClientError(
    `The AI service returned an incomplete ${action} result. Check the adapter's required response fields.`,
    "invalid_response",
  );
}

function responseError(data: unknown): string | null {
  if (!isRecord(data) || typeof data.error !== "string") return null;
  const message = data.error.trim();
  return message ? message.slice(0, 300) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

function cancelledError(): AIClientError {
  return new AIClientError("AI request was cancelled.", "cancelled");
}

function timeoutError(timeoutMs: number): AIClientError {
  return new AIClientError(
    `The AI service did not respond within ${Math.ceil(timeoutMs / 1000)} seconds. Try again or check the service.`,
    "timeout",
  );
}
