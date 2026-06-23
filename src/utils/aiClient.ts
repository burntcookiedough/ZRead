/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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

/**
 * Triggers the backend AI action endpoint
 */
export async function triggerAIAction(payload: {
  action: "define" | "explain" | "summarize";
  text?: string;
  context?: string;
  word?: string;
  bookTitle?: string;
}): Promise<any> {
  const response = await fetch("/api/ai/action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Server responded with status ${response.status}`);
  }

  const data = await response.json();
  return data.result;
}
