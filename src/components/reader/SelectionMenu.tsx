/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from "react";
// No icons needed for text-only menu

interface SelectionMenuProps {
  onAction: (action: "copy" | "define" | "explain" | "save" | "highlight", extra?: string, selectedText?: string) => void;
  onClose: () => void;
}

/**
 * Shows contextual actions for selected reader text and forwards the captured selection to callers.
 */
export default function SelectionMenu({ onAction, onClose }: SelectionMenuProps) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const highlightStyles = [
    { label: "Underline", class: "custom-highlight-underline" },
    { label: "Dotted", class: "custom-highlight-dotted" },
    { label: "Gray", class: "custom-highlight-gray" },
  ];

  useEffect(() => {
    /**
     * Tracks the active text selection and positions the floating menu above reader content.
     */
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setCoords(null);
        return;
      }

      const text = selection.toString().trim();
      if (!text || text.length === 0) {
        setCoords(null);
        return;
      }

      // Check if the selection is inside the reader content container
      let node: Node | null = selection.anchorNode;
      let insideReader = false;
      while (node) {
        if (node instanceof HTMLElement && node.id === "reader-chapter-body") {
          insideReader = true;
          break;
        }
        node = node.parentNode;
      }

      if (!insideReader) {
        setCoords(null);
        return;
      }

      setSelectedText(text);

      const range = selection.getRangeAt(0);
      const rects = range.getClientRects();
      if (rects.length > 0) {
        // We find the mid point of the top of the selection
        const rect = rects[0];
        
        // Relative to current viewport scrolling
        const top = rect.top + window.scrollY - 55; // 55px offset above selection
        const left = rect.left + window.scrollX + rect.width / 2;
        
        setCoords({ top, left });
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  // Keyboard shortcut listener to quicktrigger actions when selection exists
  useEffect(() => {
    if (!coords || !selectedText) return;

    /**
     * Handles keyboard shortcuts for the currently visible selection menu.
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes current floating state
      if (e.key === "Escape") {
        onClose();
        window.getSelection()?.removeAllRanges();
        return;
      }

      // Case-insensitive matching
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "c") {
        // Let the browser's native copy run; avoid a duplicate clipboard write and false failure toast.
        return;
      } else if (key === "c") {
        e.preventDefault();
        onAction("copy", undefined, selectedText);
      } else if (key === "d") {
        e.preventDefault();
        onAction("define", undefined, selectedText);
      } else if (key === "e") {
        e.preventDefault();
        onAction("explain", undefined, selectedText);
      } else if (key === "s") {
        e.preventDefault();
        onAction("save", undefined, selectedText);
      } else if (key === "h") {
        e.preventDefault();
        // Default highlight to underline
        onAction("highlight", "custom-highlight-underline", selectedText);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [coords, selectedText, onAction, onClose]);

  if (!coords) return null;

  return (
    <div
      ref={menuRef}
      id="selection-floating-menu"
      style={{
        position: "absolute",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        transform: "translateX(-50%)",
        zIndex: 9999,
      }}
      className="flex items-center gap-px p-0.5 rounded-sm shadow-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 backdrop-blur-md transition-all duration-150 animate-in fade-in zoom-in-95 font-sans"
    >
      {/* Short quick action labels */}
      <button
        onClick={() => {
          onAction("copy", undefined, selectedText);
          window.getSelection()?.removeAllRanges();
        }}
        id="btn-sel-copy"
        title="Copy text [Key: C]"
        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-sans font-bold uppercase tracking-wider text-black/75 dark:text-white/75 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        <span>Copy</span>
      </button>

      <div className="w-px h-3 bg-black/10 dark:bg-white/10" />

      <button
        onClick={() => {
          onAction("define", undefined, selectedText);
          window.getSelection()?.removeAllRanges();
        }}
        id="btn-sel-define"
        title="Define word [Key: D]"
        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-sans font-bold uppercase tracking-wider text-black/75 dark:text-white/75 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        <span>Define</span>
      </button>

      <div className="w-px h-3 bg-black/10 dark:bg-white/10" />

      <button
        onClick={() => {
          onAction("explain", undefined, selectedText);
          window.getSelection()?.removeAllRanges();
        }}
        id="btn-sel-explain"
        title="Explain passage [Key: E]"
        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-sans font-bold uppercase tracking-wider text-black/75 dark:text-white/75 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        <span>Explain</span>
      </button>

      <div className="w-px h-3 bg-black/10 dark:bg-white/10" />

      <button
        onClick={() => {
          onAction("save", undefined, selectedText);
          window.getSelection()?.removeAllRanges();
        }}
        id="btn-sel-save"
        title="Save word to Vocab [Key: S]"
        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-sans font-bold uppercase tracking-wider text-black/75 dark:text-white/75 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        <span>Save</span>
      </button>

      <div className="w-px h-3 bg-black/10 dark:bg-white/10" />

      {/* Highlighter styles */}
      <div className="flex items-center gap-1.5 px-3 py-1.5" id="sel-highlighters">
        <span className="text-[9px] uppercase tracking-wider text-black/40 dark:text-white/40 font-bold mr-1">Highlight:</span>
        {highlightStyles.map((style) => (
          <button
            key={style.class}
            onClick={() => {
              onAction("highlight", style.class, selectedText);
              window.getSelection()?.removeAllRanges();
            }}
            id={`btn-style-${style.label}`}
            className="px-2 py-1 text-[9px] font-sans font-bold uppercase tracking-wider text-black/70 dark:text-white/70 border border-black/10 dark:border-white/10 hover:border-black dark:hover:border-white rounded-sm transition-all cursor-pointer"
            title={`Highlight ${style.label}`}
          >
            {style.label}
          </button>
        ))}
      </div>
    </div>
  );
}
export type { SelectionMenuProps };
