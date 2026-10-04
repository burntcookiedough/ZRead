import { useEffect, useRef } from "react";

interface ReaderKeyboardHandlers {
  closeTopmostOverlay: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onToggleSettings: () => void;
}

export function useReaderKeyboard(handlers: ReaderKeyboardHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handlersRef.current.closeTopmostOverlay();
        return;
      }

      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlersRef.current.onPreviousPage();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handlersRef.current.onNextPage();
      } else if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        handlersRef.current.onToggleSettings();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
