import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_READER_SETTINGS, storage } from "@/features/storage";
import type { ReaderSettings } from "../../../types";

export function useReaderSettings(onSaveError: (message: string) => void) {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_READER_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const disposedRef = useRef(false);
  const onSaveErrorRef = useRef(onSaveError);
  onSaveErrorRef.current = onSaveError;

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
    };
  }, []);

  useEffect(() => {
    let active = true;
    storage.getReaderSettings().then((storedSettings) => {
      if (active) setSettings(storedSettings);
    }).catch((err) => {
      console.error("Reader settings could not be loaded:", err);
      if (active) setError("Reader settings could not be loaded from local storage.");
    }).finally(() => {
      if (active) setSettingsReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const updateSettings = useCallback((newSettings: ReaderSettings) => {
    setSettings(newSettings);
    saveQueueRef.current = saveQueueRef.current
      .catch(() => {})
      .then(() => storage.saveReaderSettings(newSettings))
      .catch((err) => {
        console.error("Reader settings could not be saved:", err);
        if (!disposedRef.current) onSaveErrorRef.current("Reader settings could not be saved.");
      });
  }, []);

  const flushSettings = useCallback(() => saveQueueRef.current, []);

  return { settings, settingsReady, error, updateSettings, flushSettings };
}
