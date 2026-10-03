import type { Highlight } from "../types";

export function safeHighlightColor(color: string): string {
  return ["custom-highlight-underline", "custom-highlight-dotted", "custom-highlight-gray", "custom-highlight-yellow"].includes(color)
    ? color : "custom-highlight-gray";
}

export function captureHighlightAnchor(root: Node, range: Range) {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return {};
  const preceding = range.cloneRange();
  preceding.selectNodeContents(root);
  preceding.setEnd(range.startContainer, range.startOffset);
  const cover = root instanceof Element ? root.querySelector("#book-front-cover") : null;
  if (cover?.contains(range.startContainer) || cover?.contains(range.endContainer)) return {};
  const coverLength = cover?.textContent?.length || 0;
  const start = preceding.toString().length - coverLength;
  const text = (root.textContent || "").slice(coverLength);
  const selected = range.toString();
  const trimStart = selected.length - selected.trimStart().length;
  const offset = start + trimStart;
  return {
    ...(selected.trim() ? { text: selected.trim() } : {}),
    textOffset: offset,
    prefixContext: text.slice(Math.max(0, offset - 48), offset),
    suffixContext: text.slice(offset + selected.trim().length, offset + selected.trim().length + 48),
  };
}

export function findHighlightOffset(text: string, highlight: Pick<Highlight, "text" | "textOffset" | "prefixContext" | "suffixContext">): number {
  if (!highlight.text) return -1;
  const matches: number[] = [];
  for (let from = 0; from <= text.length;) {
    const offset = text.indexOf(highlight.text, from);
    if (offset < 0) break;
    const prefix = highlight.prefixContext;
    const suffix = highlight.suffixContext;
    if ((!prefix || text.slice(0, offset).endsWith(prefix)) &&
        (!suffix || text.slice(offset + highlight.text.length).startsWith(suffix))) matches.push(offset);
    from = offset + highlight.text.length;
  }
  if (highlight.textOffset !== undefined && matches.includes(highlight.textOffset)) return highlight.textOffset;
  // Legacy ambiguous matches stay unmarked rather than attaching to the wrong passage.
  return matches.length === 1 ? matches[0] : -1;
}

export function restoreHighlights(html: string, highlights: Highlight[]): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = doc.body.textContent || "";
  const spans = highlights.map(highlight => ({ highlight, start: findHighlightOffset(text, highlight) }))
    .filter(item => item.start >= 0).sort((a, b) => b.start - a.start);
  // Wrap each text-node segment, preserving inline markup and selections spanning elements.
  for (const { highlight, start } of spans) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let offset = 0;
    const segments: { node: Text; start: number; end: number }[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const end = offset + node.length;
      if (end > start && offset < start + highlight.text.length &&
          !node.parentElement?.closest("[data-highlight-id]")) {
        segments.push({ node, start: Math.max(0, start - offset), end: Math.min(node.length, start + highlight.text.length - offset) });
      }
      offset = end;
    }
    for (const segment of segments.reverse()) {
      const range = doc.createRange();
      range.setStart(segment.node, segment.start);
      range.setEnd(segment.node, segment.end);
      const span = doc.createElement("span");
      span.className = `${safeHighlightColor(highlight.color)} cursor-pointer hover:opacity-95`;
      span.dataset.highlightId = highlight.id;
      span.title = "Delete highlight";
      range.surroundContents(span);
    }
  }
  return doc.body.innerHTML;
}
