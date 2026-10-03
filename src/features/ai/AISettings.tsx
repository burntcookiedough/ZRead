/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { isTauriRuntime } from "@/app/runtime";
import {
  AIClientError,
  getAISettings,
  saveAISettings,
  validateAIEndpoint,
  type AISettings as AISettingsValue,
} from "@/utils/aiClient";

/** Small Library settings section for the optional desktop AI adapter. */
export default function AISettings() {
  const [settings, setSettings] = useState<AISettingsValue>(() => getAISettings());
  const [draftEndpoint, setDraftEndpoint] = useState(settings.endpoint);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!isTauriRuntime) return null;

  const handleSave = () => {
    setError(null);
    setSaved(false);
    try {
      const next = saveAISettings({ enabled: settings.enabled, endpoint: draftEndpoint });
      setSettings(next);
      setDraftEndpoint(next.endpoint);
      setSaved(true);
    } catch (err) {
      setError(err instanceof AIClientError ? err.message : "Could not save AI settings.");
    }
  };

  let endpointError: string | null = null;
  if (settings.enabled) {
    try {
      validateAIEndpoint(draftEndpoint);
    } catch (err) {
      endpointError = err instanceof AIClientError ? err.message : "Enter a valid AI service endpoint.";
    }
  }

  return (
    <section className="mb-10 rounded-sm border border-black/10 dark:border-white/10 p-5" aria-labelledby="ai-settings-heading">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 id="ai-settings-heading" className="font-serif text-lg font-semibold">AI reading assistance</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-black/60 dark:text-white/60">
            AI is optional and starts disabled. When you choose Define, Explain, or Summarize, ZRead sends only that action’s word and sentence context, selected passage, or chapter excerpt (up to 8,000 characters) to this service. Books are not uploaded in full.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => {
              setSettings((current) => ({ ...current, enabled: event.target.checked }));
              setSaved(false);
              setError(null);
            }}
            aria-label="Enable AI reading assistance"
          />
          Enable AI
        </label>
      </div>

      <div className="mt-4">
        <label htmlFor="ai-service-endpoint" className="block text-[9px] font-bold uppercase tracking-[0.15em] text-black/50 dark:text-white/50">
          AI service endpoint
        </label>
        <input
          id="ai-service-endpoint"
          type="url"
          autoComplete="url"
          value={draftEndpoint}
          onChange={(event) => {
            setDraftEndpoint(event.target.value);
            setSaved(false);
            setError(null);
          }}
          placeholder="https://ai.example.com/api/ai/action"
          aria-describedby="ai-endpoint-help ai-endpoint-error"
          className="mt-1 w-full rounded-sm border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black dark:focus:border-white"
        />
        <p id="ai-endpoint-help" className="mt-1 text-[11px] leading-relaxed text-black/50 dark:text-white/50">
          Enter the URL of a ZRead-compatible AI service you trust to process reading text. Endpoint configuration is stored on this device and does not include a provider key.
        </p>
        {endpointError && (
          <p id="ai-endpoint-error" role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
            {endpointError}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="mt-2 text-xs text-green-700 dark:text-green-300">
            AI settings saved on this device.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleSave}
        className="mt-4 rounded-sm border border-black dark:border-white bg-black dark:bg-white px-4 py-2 text-[9px] font-bold uppercase tracking-[0.15em] text-white dark:text-black transition-colors hover:bg-transparent hover:text-black dark:hover:bg-transparent dark:hover:text-white"
      >
        Save AI settings
      </button>
    </section>
  );
}
