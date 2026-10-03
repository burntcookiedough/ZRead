import assert from "node:assert/strict";
import test from "node:test";
import { findHighlightOffset, safeHighlightColor } from "./highlightAnchors";

test("context anchors select the right repeated passage", () => {
  const text = "first word here. second word there.";
  assert.equal(findHighlightOffset(text, { text: "word", prefixContext: "second ", suffixContext: " there." }), 24);
  assert.equal(findHighlightOffset(text, { text: "word" }), -1);
  assert.equal(findHighlightOffset(text, { text: "word", textOffset: 6 }), 6);
  assert.equal(findHighlightOffset(text, { text: "absent" }), -1);
  assert.equal(safeHighlightColor("fixed inset-0 z-50 bg-black"), "custom-highlight-gray");
});
