import { useCallback, useEffect, useRef, useState } from "react";

export interface ReaderNotification {
  text: string;
  onUndo?: () => void | Promise<void>;
}

export function useReaderChrome(hasBlockingOverlay: boolean) {
  const [hudVisible, setHudVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notification, setNotification] = useState<ReaderNotification | null>(null);
  const blockingOverlayRef = useRef(hasBlockingOverlay);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  blockingOverlayRef.current = hasBlockingOverlay;

  const refreshHudTimeout = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      const focusedControl = document.activeElement instanceof HTMLElement &&
        !!document.activeElement.closest("button, input, textarea, select, a, [role='button']");
      if (!blockingOverlayRef.current && !focusedControl) setHudVisible(false);
    }, 2500);
  }, []);

  const showToast = useCallback((text: string, onUndo?: ReaderNotification["onUndo"]) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setNotification({ text, onUndo });
    toastTimerRef.current = setTimeout(() => {
      setNotification(null);
      toastTimerRef.current = null;
    }, onUndo ? 5000 : 2800);
  }, []);

  const dismissNotification = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    setNotification(null);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      console.warn("Fullscreen request blocked or failed:", error);
      showToast("Fullscreen could not be changed.");
    }
  }, [showToast]);

  useEffect(() => {
    refreshHudTimeout();
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, [hasBlockingOverlay, refreshHudTimeout]);

  useEffect(() => {
    document.addEventListener("focusin", refreshHudTimeout);
    document.addEventListener("focusout", refreshHudTimeout);
    return () => {
      document.removeEventListener("focusin", refreshHudTimeout);
      document.removeEventListener("focusout", refreshHudTimeout);
    };
  }, [refreshHudTimeout]);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", syncFullscreenState);
    syncFullscreenState();
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  return {
    hudVisible,
    refreshHudTimeout,
    isFullscreen,
    toggleFullscreen,
    notification,
    showToast,
    dismissNotification,
  };
}
