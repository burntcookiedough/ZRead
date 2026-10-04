import { useCallback, useEffect, useRef, useState } from "react";
import { isTauriRuntime } from "@/app/runtime";
import { getCurrentWindow } from "@tauri-apps/api/window";

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
  const fullscreenOperationRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
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

  const changeNativeFullscreen = useCallback((target: boolean | null) => {
    const appWindow = getCurrentWindow();
    const operation = fullscreenOperationRef.current.catch(() => {}).then(async () => {
      if (!mountedRef.current) return;

      try {
        const current = await appWindow.isFullscreen();
        if (!mountedRef.current) return;
        const next = target ?? !current;
        if (current !== next) await appWindow.setFullscreen(next);
        const actual = await appWindow.isFullscreen();
        if (mountedRef.current) setIsFullscreen(actual);
      } catch (error) {
        console.warn("Fullscreen request blocked or failed:", error);
        try {
          const actual = await appWindow.isFullscreen();
          if (mountedRef.current) setIsFullscreen(actual);
        } catch {
          // Keep the last known state if the native window cannot be queried.
        }
        if (mountedRef.current) showToast("Fullscreen could not be changed.");
      }
    });
    fullscreenOperationRef.current = operation;
    return operation;
  }, [showToast]);

  const toggleFullscreen = useCallback(async () => {
    if (isTauriRuntime) {
      await changeNativeFullscreen(null);
      return;
    }

    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      console.warn("Fullscreen request blocked or failed:", error);
      showToast("Fullscreen could not be changed.");
    }
  }, [changeNativeFullscreen, showToast]);

  const exitFullscreen = useCallback(async () => {
    if (isTauriRuntime) {
      await changeNativeFullscreen(false);
    } else if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
  }, [changeNativeFullscreen]);

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
    mountedRef.current = true;

    if (isTauriRuntime) {
      const appWindow = getCurrentWindow();
      let active = true;
      let unlisten: (() => void) | undefined;
      const syncFullscreenState = async () => {
        try {
          const fullscreen = await appWindow.isFullscreen();
          if (active) setIsFullscreen(fullscreen);
        } catch (error) {
          console.warn("Could not read native fullscreen state:", error);
        }
      };

      void syncFullscreenState();
      void appWindow.onResized(() => { void syncFullscreenState(); }).then((stopListening) => {
        if (active) unlisten = stopListening;
        else stopListening();
      }).catch((error) => console.warn("Could not listen for native window resize:", error));

      return () => {
        active = false;
        mountedRef.current = false;
        unlisten?.();
        fullscreenOperationRef.current = fullscreenOperationRef.current
          .catch(() => {})
          .then(() => appWindow.setFullscreen(false))
          .catch((error) => console.warn("Could not exit native fullscreen:", error));
      };
    }

    const syncFullscreenState = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", syncFullscreenState);
    syncFullscreenState();
    return () => {
      mountedRef.current = false;
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  return {
    hudVisible,
    refreshHudTimeout,
    isFullscreen,
    toggleFullscreen,
    exitFullscreen,
    notification,
    showToast,
    dismissNotification,
  };
}
