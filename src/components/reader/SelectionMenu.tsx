/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from "react";
import { Sparkles, Bookmark, Highlighter, Trash2 } from "lucide-react";

interface SelectionMenuProps {
  onAction: (action: "define" | "explain" | "save" | "highlight", extra?: string) => void;
  onClose: () => void;
}

export default function SelectionMenu({ onAction, onClose }: SelectionMenuProps) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const colors = [
    { value: "bg-yellow-250", label: "Yellow", class: "custom-highlight-yellow", colorHex: "rgba(253, 224, 71, 0.4)" },
    { value: "bg-green-250", label: "Green", class: "custom-highlight-green", colorHex: "rgba(134, 239, 172, 0.4)" },
    { value: "bg-blue-250", label: "Blue", class: "custom-highlight-blue", colorHex: "rgba(147, 197, 253, 0.4)" },
    { value: "bg-purple-250", label: "Purple", class: "custom-highlight-purple", colorHex: "rgba(216, 180, 254, 0.4)" },
    { value: "bg-pink-250", label: "Pink", class: "custom-highlight-pink", colorHex: "rgba(244, 180, 220, 0.4)" },
  ];

  useEffect(() => {
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

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes current floating state
      if (e.key === "Escape") {
        onClose();
        window.getSelection()?.removeAllRanges();
        return;
      }

      // Case-insensitive matching
      const key = e.key.toLowerCase();
      if (key === "d") {
        e.preventDefault();
        onAction("define");
      } else if (key === "e") {
        e.preventDefault();
        onAction("explain");
      } else if (key === "s") {
        e.preventDefault();
        onAction("save");
      } else if (key === "h") {
        e.preventDefault();
        // Default highlight to yellow
        onAction("highlight", "custom-highlight-yellow");
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
          onAction("define");
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
          onAction("explain");
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
          onAction("save");
          window.getSelection()?.removeAllRanges();
        }}
        id="btn-sel-save"
        title="Save word to Vocab [Key: S]"
        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-sans font-bold uppercase tracking-wider text-black/75 dark:text-white/75 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        <span>Save</span>
      </button>

      <div className="w-px h-3 bg-black/10 dark:bg-white/10" />

      {/* Highlighter palettes */}
      <div className="flex items-center gap-1.5 px-3 py-1.5" id="sel-highlighters">
        {colors.map((c) => (
          <button
            key={c.value}
            onClick={() => {
              onAction("highlight", c.class);
              window.getSelection()?.removeAllRanges();
            }}
            id={`btn-color-${c.label}`}
            className="w-3.5 h-3.5 rounded-sm border border-black/5 dark:border-white/5 hover:scale-110 shadow-sm transition-transform cursor-pointer relative"
            title={`Highlight ${c.label} [Key: H]`}
            style={{ backgroundColor: c.colorHex }}
          />
        ))}
      </div>
    </div>
  );
}
export type { SelectionMenuProps };
