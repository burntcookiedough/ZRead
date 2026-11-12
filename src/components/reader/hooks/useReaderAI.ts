import { useCallback, useEffect, useRef, useState } from "react";
import { triggerAIAction, type AIActionRequest, type AIActionResult } from "../../../utils/aiClient";

type ReaderAIAction = AIActionRequest["action"];

interface ReaderAIState {
  visible: boolean;
  type: ReaderAIAction;
  inputText: string;
  result: AIActionResult | null;
  loading: boolean;
  error: string | null;
}

interface ReaderAIRequest {
  payload: AIActionRequest;
  inputText: string;
  actionLabel: string;
}

const INITIAL_STATE: ReaderAIState = {
  visible: false,
  type: "define",
  inputText: "",
  result: null,
  loading: false,
  error: null,
};

async function executeAIRequest(payload: AIActionRequest, signal: AbortSignal): Promise<AIActionResult> {
  switch (payload.action) {
    case "define":
      return triggerAIAction(payload, { signal });
    case "explain":
      return triggerAIAction(payload, { signal });
    case "summarize":
      return triggerAIAction(payload, { signal });
  }
}

function getActionLabel(action: ReaderAIAction) {
  switch (action) {
    case "define": return "AI definition";
    case "explain": return "AI explanation";
    case "summarize": return "AI summary";
  }
}

function getAIErrorMessage(error: unknown, actionLabel: string) {
  const detail = error instanceof Error && error.message ? `${error.message} ` : "";
  return `${detail}${actionLabel} is unavailable. Reading, copy, save, and highlight still work offline.`;
}

export function useReaderAI() {
  const [state, setState] = useState<ReaderAIState>(INITIAL_STATE);
  const controllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<ReaderAIRequest | null>(null);

  const runRequest = useCallback(async (request: ReaderAIRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({
      visible: true,
      type: request.payload.action,
      inputText: request.inputText,
      result: null,
      loading: true,
      error: null,
    });

    try {
      const result = await executeAIRequest(request.payload, controller.signal);
      if (controllerRef.current === controller) {
        setState((current) => ({ ...current, loading: false, result }));
      }
    } catch (error) {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        setState((current) => ({ ...current, loading: false, error: getAIErrorMessage(error, request.actionLabel) }));
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  const request = useCallback((payload: AIActionRequest, inputText: string) => {
    const nextRequest = { payload, inputText, actionLabel: getActionLabel(payload.action) };
    lastRequestRef.current = nextRequest;
    return runRequest(nextRequest);
  }, [runRequest]);

  const retry = useCallback(() => {
    const previousRequest = lastRequestRef.current;
    return previousRequest ? runRequest(previousRequest) : Promise.resolve();
  }, [runRequest]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const close = useCallback(() => {
    cancel();
    setState((current) => ({ ...current, visible: false, loading: false }));
  }, [cancel]);

  useEffect(() => () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  return { state, request, retry, cancel, close };
}
