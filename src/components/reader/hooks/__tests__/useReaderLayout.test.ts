/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReaderLayout } from "../useReaderLayout";
import { ReaderSettings } from "../../../../types";

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

const defaultSettings: ReaderSettings = {
  theme: "light",
  fontFamily: "Literata",
  fontSize: 18,
  lineHeight: 1.8,
  contentWidth: 700,
  viewMode: "single",
};

const splitSettings: ReaderSettings = {
  ...defaultSettings,
  viewMode: "split",
};

function makeOptions(overrides: Partial<Parameters<typeof useReaderLayout>[0]> = {}) {
  return {
    loading: false,
    chapterContent: "<p>chapter one</p>",
    settings: defaultSettings,
    currentChapterIdx: 0,
    sourcePercent: 0,
    columnGap: 32,
    ...overrides,
  };
}

/**
 * Sets up a fake container div so that getLayoutMetrics() can measure it.
 * The settle effect checks `containerRef.current` before scheduling the timer,
 * so this must be called BEFORE the effect runs or before a dependency change
 * triggers it to re-run.
 */
function attachFakeContainer(
  containerRef: React.RefObject<HTMLDivElement>,
  opts: {
    clientWidth?: number;
    /** scrollWidth on the container element itself */
    scrollWidth?: number;
    /** if true, attaches a #reader-chapter-body child with the same scrollWidth */
    hasChapterBody?: boolean;
  } = {}
) {
  const { clientWidth = 800, scrollWidth = 800, hasChapterBody = false } = opts;

  const div = document.createElement("div");
  Object.defineProperty(div, "clientWidth", { configurable: true, get: () => clientWidth });
  Object.defineProperty(div, "scrollWidth", { configurable: true, get: () => scrollWidth });

  if (hasChapterBody) {
    const body = document.createElement("div");
    body.id = "reader-chapter-body";
    Object.defineProperty(body, "scrollWidth", { configurable: true, get: () => scrollWidth });
    div.appendChild(body);
  }

  // React's useRef returns a plain {current: null} object — we can write directly.
  (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = div;
}

/**
 * Renders the hook with `loading=true`, attaches the container, then rerenders
 * with `loading=false` so the settle effect re-runs with a live containerRef.
 *
 * Returns the renderHook result and a `settle()` helper that advances timers.
 */
function renderAndSettle(
  overrides: Partial<Parameters<typeof useReaderLayout>[0]> = {},
  containerOpts: Parameters<typeof attachFakeContainer>[1] = {}
) {
  type Props = Parameters<typeof useReaderLayout>[0];

  const { result, rerender } = renderHook((props: Props) => useReaderLayout(props), {
    initialProps: makeOptions({ ...overrides, loading: true }),
  });

  // Attach container while loading so the effect can see it when loading flips
  attachFakeContainer(result.current.containerRef, containerOpts);

  // Flip loading → triggers the settle effect to re-run
  rerender(makeOptions({ ...overrides, loading: false }));

  function settle() {
    act(() => {
      vi.advanceTimersByTime(200); // 150ms outer + headroom
    });
  }

  return { result, rerender, settle };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useReaderLayout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default window.innerWidth to desktop
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1280,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe("initial state", () => {
    it("returns correct default values on first render", () => {
      const { result } = renderHook(() => useReaderLayout(makeOptions()));

      expect(result.current.unitIndex).toBe(0);
      expect(result.current.unitCount).toBe(1);
      expect(result.current.viewportWidth).toBe(0);
      expect(result.current.layoutSettled).toBe(false);
      expect(result.current.suppressAnimation).toBe(true);
      expect(result.current.pendingPageAction).toBe("restore");
      expect(result.current.containerRef).toBeDefined();
    });

    it("unitStride equals viewportWidth + columnGap on first render", () => {
      const { result } = renderHook(() => useReaderLayout(makeOptions({ columnGap: 32 })));
      // viewportWidth starts at 0
      expect(result.current.unitStride).toBe(0 + 32);
    });

    it("sourcePercent is passed through to returned state", () => {
      const { result } = renderHook(() => useReaderLayout(makeOptions({ sourcePercent: 42 })));
      expect(result.current.sourcePercent).toBe(42);
    });
  });

  // -------------------------------------------------------------------------
  // viewportWidthStyle and unitsPerViewport
  // -------------------------------------------------------------------------

  describe("viewportWidthStyle", () => {
    it("single mode on desktop: uses contentWidth × 1", () => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: 1280,
      });
      const { result } = renderHook(() =>
        useReaderLayout(makeOptions({ settings: defaultSettings }))
      );
      // unitsPerViewport=1, maxWidth=700*1 + 0*32=700
      expect(result.current.viewportWidthStyle).toBe("min(calc(100vw - 96px), 700px)");
    });

    it("split mode on desktop: uses contentWidth × 2 + gap", () => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: 1280,
      });
      const { result } = renderHook(() =>
        useReaderLayout(makeOptions({ settings: splitSettings, columnGap: 32 }))
      );
      // unitsPerViewport=2, maxWidth=700*2 + 1*32=1432
      expect(result.current.viewportWidthStyle).toBe("min(calc(100vw - 96px), 1432px)");
    });

    it("split mode on mobile: collapses to single unit width style", () => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: 375,
      });
      const { result } = renderHook(() =>
        useReaderLayout(makeOptions({ settings: splitSettings }))
      );
      // isMobile=true → mobile formula
      expect(result.current.viewportWidthStyle).toBe("min(calc(100vw - 32px), 700px)");
    });

    it("single mode on mobile: uses mobile formula", () => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: 375,
      });
      const { result } = renderHook(() =>
        useReaderLayout(makeOptions({ settings: defaultSettings }))
      );
      expect(result.current.viewportWidthStyle).toBe("min(calc(100vw - 32px), 700px)");
    });
  });

  describe("unitsPerViewport", () => {
    it("is 1 in single view mode on desktop", () => {
      const { result } = renderHook(() =>
        useReaderLayout(makeOptions({ settings: defaultSettings }))
      );
      expect(result.current.unitsPerViewport).toBe(1);
    });

    it("is 2 in split view mode on desktop", () => {
      const { result } = renderHook(() =>
        useReaderLayout(makeOptions({ settings: splitSettings }))
      );
      expect(result.current.unitsPerViewport).toBe(2);
    });

    it("is 1 in split view mode on mobile (viewport < 768px)", () => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: 500,
      });
      const { result } = renderHook(() =>
        useReaderLayout(makeOptions({ settings: splitSettings }))
      );
      expect(result.current.unitsPerViewport).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // markLayoutUnsettled
  // -------------------------------------------------------------------------

  describe("markLayoutUnsettled", () => {
    it("sets layoutSettled to false and suppressAnimation to true", () => {
      const { result, settle } = renderAndSettle(
        {},
        { clientWidth: 800, scrollWidth: 800 }
      );

      settle();
      expect(result.current.layoutSettled).toBe(true);

      act(() => {
        result.current.markLayoutUnsettled();
      });

      expect(result.current.layoutSettled).toBe(false);
      expect(result.current.suppressAnimation).toBe(true);
    });

    it("is stable (referential equality) across re-renders", () => {
      const { result, rerender } = renderHook(() => useReaderLayout(makeOptions()));
      const first = result.current.markLayoutUnsettled;
      rerender();
      expect(result.current.markLayoutUnsettled).toBe(first);
    });
  });

  // -------------------------------------------------------------------------
  // setUnitIndex
  // -------------------------------------------------------------------------

  describe("setUnitIndex", () => {
    it("updates unitIndex in state", () => {
      const { result } = renderHook(() => useReaderLayout(makeOptions()));

      act(() => {
        result.current.setUnitIndex(3);
      });

      expect(result.current.unitIndex).toBe(3);
    });

    it("is stable (referential equality) across re-renders", () => {
      const { result, rerender } = renderHook(() => useReaderLayout(makeOptions()));
      const first = result.current.setUnitIndex;
      rerender();
      expect(result.current.setUnitIndex).toBe(first);
    });
  });

  // -------------------------------------------------------------------------
  // setSuppressAnimation / setPendingPageAction pass-through
  // -------------------------------------------------------------------------

  describe("setSuppressAnimation", () => {
    it("can disable suppression externally", () => {
      const { result } = renderHook(() => useReaderLayout(makeOptions()));
      act(() => {
        result.current.setSuppressAnimation(false);
      });
      expect(result.current.suppressAnimation).toBe(false);
    });
  });

  describe("setPendingPageAction", () => {
    it("updates pendingPageAction", () => {
      const { result } = renderHook(() => useReaderLayout(makeOptions()));
      act(() => {
        result.current.setPendingPageAction("last");
      });
      expect(result.current.pendingPageAction).toBe("last");
    });
  });

  // -------------------------------------------------------------------------
  // Layout settle effect – pendingPageAction dispatch
  // -------------------------------------------------------------------------

  describe("layout settle effect", () => {
    it("settles with pendingPageAction=restore, positioning at sourcePercent", () => {
      const onLayoutSettled = vi.fn();
      // clientWidth=800, columnGap=32 → stride=832
      // scrollWidth=3232 → units=ceil((3232+32)/832)=ceil(3.923)=4
      const { result, settle } = renderAndSettle(
        { sourcePercent: 50, onLayoutSettled },
        { clientWidth: 800, scrollWidth: 3232 }
      );

      settle();

      // unit for 50% of 4 units (index 0-3) = round(0.5 * 3) = 2
      expect(result.current.unitIndex).toBe(2);
      expect(result.current.unitCount).toBe(4);
      expect(result.current.viewportWidth).toBe(800);
      expect(result.current.layoutSettled).toBe(true);
      expect(result.current.pendingPageAction).toBeNull();
      expect(onLayoutSettled).toHaveBeenCalledWith(2, 4);
    });

    it("settles with pendingPageAction=first at index 0", () => {
      const onLayoutSettled = vi.fn();
      const { result, rerender, settle } = renderAndSettle(
        { sourcePercent: 100, onLayoutSettled },
        { clientWidth: 800, scrollWidth: 3232 }
      );

      // Set pendingPageAction to "first" then settle
      act(() => {
        result.current.setPendingPageAction("first");
      });

      settle();

      expect(result.current.unitIndex).toBe(0);
      expect(onLayoutSettled).toHaveBeenCalledWith(0, 4);
    });

    it("settles with pendingPageAction=last at final index", () => {
      const onLayoutSettled = vi.fn();
      const { result, settle } = renderAndSettle(
        { sourcePercent: 0, onLayoutSettled },
        { clientWidth: 800, scrollWidth: 3232 }
      );

      act(() => {
        result.current.setPendingPageAction("last");
      });

      settle();

      expect(result.current.unitIndex).toBe(3); // last of 4 pages
      expect(onLayoutSettled).toHaveBeenCalledWith(3, 4);
    });

    it("settles with pendingPageAction=null clamps current index within bounds", () => {
      const { result, settle } = renderAndSettle(
        { sourcePercent: 0 },
        { clientWidth: 800, scrollWidth: 3232 }
      );

      // Navigate to page 5 then disable the action
      act(() => {
        result.current.setUnitIndex(5);
        result.current.setPendingPageAction(null);
      });

      settle();

      // Must clamp: min(4-1, max(0, 5)) = 3
      expect(result.current.unitIndex).toBe(3);
    });

    it("does not settle when loading=true", () => {
      const onLayoutSettled = vi.fn();
      const { result } = renderHook(() =>
        useReaderLayout(makeOptions({ loading: true, onLayoutSettled }))
      );

      attachFakeContainer(result.current.containerRef, { clientWidth: 800, scrollWidth: 800 });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.layoutSettled).toBe(false);
      expect(onLayoutSettled).not.toHaveBeenCalled();
    });

    it("does not settle when chapterContent is empty", () => {
      const onLayoutSettled = vi.fn();
      const { result } = renderHook(() =>
        useReaderLayout(makeOptions({ chapterContent: "", onLayoutSettled }))
      );

      attachFakeContainer(result.current.containerRef, { clientWidth: 800, scrollWidth: 800 });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.layoutSettled).toBe(false);
      expect(onLayoutSettled).not.toHaveBeenCalled();
    });

    it("does not settle when containerRef is null at effect run time", () => {
      const onLayoutSettled = vi.fn();
      // No attachFakeContainer → containerRef.current stays null
      renderHook(() => useReaderLayout(makeOptions({ onLayoutSettled })));

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(onLayoutSettled).not.toHaveBeenCalled();
    });

    it("disables suppressAnimation 50ms after settling", () => {
      const { result, rerender } = renderHook(
        (props: Parameters<typeof useReaderLayout>[0]) => useReaderLayout(props),
        { initialProps: makeOptions({ loading: true }) }
      );

      attachFakeContainer(result.current.containerRef, { clientWidth: 800, scrollWidth: 800 });

      rerender(makeOptions({ loading: false }));

      // Advance past the 150ms outer timer
      act(() => {
        vi.advanceTimersByTime(150);
      });

      // suppressAnimation still true (inner 50ms timer hasn't fired)
      expect(result.current.suppressAnimation).toBe(true);

      // Advance past the 50ms inner timer
      act(() => {
        vi.advanceTimersByTime(60);
      });

      expect(result.current.suppressAnimation).toBe(false);
    });

    it("falls back to container.scrollWidth when #reader-chapter-body is absent", () => {
      // clientWidth=800, scrollWidth=1664, hasChapterBody=false
      // stride=832, units=ceil((1664+32)/832)=ceil(2.038)=3
      const { result, settle } = renderAndSettle(
        { sourcePercent: 0 },
        { clientWidth: 800, scrollWidth: 1664, hasChapterBody: false }
      );

      settle();

      expect(result.current.unitCount).toBe(3);
    });

    it("uses #reader-chapter-body scrollWidth when present", () => {
      // hasChapterBody=true, scrollWidth=2496
      // stride=832, units=ceil((2496+32)/832)=ceil(3.038)=4
      const { result, settle } = renderAndSettle(
        { sourcePercent: 0 },
        { clientWidth: 800, scrollWidth: 2496, hasChapterBody: true }
      );

      settle();

      expect(result.current.unitCount).toBe(4);
    });

    it("always has at least 1 unit even for very short content", () => {
      // scrollWidth << clientWidth → formula still gives 1
      const { result, settle } = renderAndSettle(
        { sourcePercent: 0 },
        { clientWidth: 800, scrollWidth: 100 }
      );

      settle();

      expect(result.current.unitCount).toBe(1);
    });

    it("calls onLayoutSettled with the resolved indices after settling", () => {
      const onLayoutSettled = vi.fn();
      const { settle } = renderAndSettle(
        { sourcePercent: 0, onLayoutSettled },
        { clientWidth: 800, scrollWidth: 800 }
      );

      settle();

      expect(onLayoutSettled).toHaveBeenCalledTimes(1);
      expect(onLayoutSettled).toHaveBeenCalledWith(0, 1);
    });

    it("uses updated onLayoutSettled callback without re-running effects", () => {
      const first = vi.fn();
      const second = vi.fn();

      type Props = Parameters<typeof useReaderLayout>[0];
      const { result, rerender } = renderHook(
        (props: Props) => useReaderLayout(props),
        {
          initialProps: makeOptions({ loading: true, onLayoutSettled: first }),
        }
      );

      attachFakeContainer(result.current.containerRef, { clientWidth: 800, scrollWidth: 800 });

      // Flip loading and update callback simultaneously
      rerender(makeOptions({ loading: false, onLayoutSettled: second }));

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("cleans up the pending timer when unmounted before it fires", () => {
      const onLayoutSettled = vi.fn();
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

      type Props = Parameters<typeof useReaderLayout>[0];
      const { result, rerender, unmount } = renderHook(
        (props: Props) => useReaderLayout(props),
        { initialProps: makeOptions({ loading: true, onLayoutSettled }) }
      );

      attachFakeContainer(result.current.containerRef, { clientWidth: 800, scrollWidth: 800 });

      // Start the timer by flipping loading
      rerender(makeOptions({ loading: false, onLayoutSettled }));

      // Unmount before the 150ms timer fires
      unmount();

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(onLayoutSettled).not.toHaveBeenCalled();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // markLayoutUnsettled triggered by dependency changes
  // -------------------------------------------------------------------------

  describe("markLayoutUnsettled effect on dependency change", () => {
    it("resets layout when chapterContent changes", () => {
      const { result, rerender, settle } = renderAndSettle(
        { chapterContent: "<p>chapter one</p>" },
        { clientWidth: 800, scrollWidth: 800 }
      );

      settle();
      expect(result.current.layoutSettled).toBe(true);

      // Simulate chapter navigation (content change should reset layout)
      rerender(makeOptions({ chapterContent: "<p>chapter two</p>" }));

      expect(result.current.layoutSettled).toBe(false);
      expect(result.current.suppressAnimation).toBe(true);
    });

    it("resets layout when settings change", () => {
      const { result, rerender, settle } = renderAndSettle(
        { settings: defaultSettings },
        { clientWidth: 800, scrollWidth: 800 }
      );

      settle();
      expect(result.current.layoutSettled).toBe(true);

      rerender(makeOptions({ settings: { ...defaultSettings, fontSize: 24 } }));

      expect(result.current.layoutSettled).toBe(false);
      expect(result.current.suppressAnimation).toBe(true);
    });

    it("resets layout when currentChapterIdx changes", () => {
      const { result, rerender, settle } = renderAndSettle(
        { currentChapterIdx: 0 },
        { clientWidth: 800, scrollWidth: 800 }
      );

      settle();
      expect(result.current.layoutSettled).toBe(true);

      rerender(makeOptions({ currentChapterIdx: 1 }));

      expect(result.current.layoutSettled).toBe(false);
      expect(result.current.suppressAnimation).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // unitForSourcePercent mapping
  // -------------------------------------------------------------------------

  describe("unitForSourcePercent mapping (via pendingPageAction=restore)", () => {
    // stride=832 (clientWidth=800, columnGap=32)
    // scrollWidth=4000 → units=ceil((4000+32)/832)=ceil(4.846)=5 (indices 0-4)

    it("maps 0% to first unit", () => {
      const { result, settle } = renderAndSettle(
        { sourcePercent: 0 },
        { clientWidth: 800, scrollWidth: 4000 }
      );

      settle();

      expect(result.current.unitIndex).toBe(0);
    });

    it("maps 100% to last unit", () => {
      const { result, settle } = renderAndSettle(
        { sourcePercent: 100 },
        { clientWidth: 800, scrollWidth: 4000 }
      );

      settle();

      // 5 units (index 0-4): round(1 * 4) = 4
      expect(result.current.unitIndex).toBe(4);
    });

    it("maps 50% to middle unit", () => {
      const { result, settle } = renderAndSettle(
        { sourcePercent: 50 },
        { clientWidth: 800, scrollWidth: 4000 }
      );

      settle();

      // round(0.5 * 4) = 2
      expect(result.current.unitIndex).toBe(2);
    });

    it("clamps out-of-range percent to last valid index", () => {
      const { result, settle } = renderAndSettle(
        { sourcePercent: 150 },
        { clientWidth: 800, scrollWidth: 4000 }
      );

      settle();

      // min(4, max(0, round(1.5*4))) = min(4, 6) = 4
      expect(result.current.unitIndex).toBe(4);
    });

    it("maps any percent to 0 when there is exactly 1 unit", () => {
      const { result, settle } = renderAndSettle(
        { sourcePercent: 75 },
        { clientWidth: 800, scrollWidth: 100 }
      );

      settle();

      // 1 unit (index 0 only): round(0.75 * 0) = 0
      expect(result.current.unitIndex).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Window resize handling
  // -------------------------------------------------------------------------

  describe("window resize handling", () => {
    it("updates isMobile when viewport changes to narrow on resize", () => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: 1280,
      });
      const { result } = renderHook(() =>
        useReaderLayout(makeOptions({ settings: splitSettings }))
      );

      // Desktop: split gives 2 units per viewport
      expect(result.current.unitsPerViewport).toBe(2);

      attachFakeContainer(result.current.containerRef, { clientWidth: 400, scrollWidth: 800 });

      act(() => {
        Object.defineProperty(window, "innerWidth", {
          configurable: true,
          writable: true,
          value: 375,
        });
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.unitsPerViewport).toBe(1);
    });

    it("recalculates units and updates viewportWidth on resize", () => {
      const { result } = renderHook(() => useReaderLayout(makeOptions()));

      // stride=832, scrollWidth=1664 → units=ceil(1696/832)=ceil(2.038)=3
      attachFakeContainer(result.current.containerRef, { clientWidth: 800, scrollWidth: 1664 });

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      act(() => {
        vi.advanceTimersByTime(60);
      });

      expect(result.current.viewportWidth).toBe(800);
      expect(result.current.unitCount).toBe(3);
      expect(result.current.layoutSettled).toBe(true);
    });

    it("clamps unitIndex to new unitCount on resize when content shrinks", () => {
      const { result, settle } = renderAndSettle(
        { sourcePercent: 0 },
        { clientWidth: 800, scrollWidth: 4000 }
      );

      settle();

      // Navigate to page 4 (index 4 out of 5 units)
      act(() => result.current.setUnitIndex(4));

      // Resize to smaller content — stride=832, scrollWidth=2000 → units=ceil(2032/832)=3
      attachFakeContainer(result.current.containerRef, { clientWidth: 800, scrollWidth: 2000 });

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      act(() => {
        vi.advanceTimersByTime(60);
      });

      // Index 4 clamped to 2 (max index for 3 units)
      expect(result.current.unitIndex).toBeLessThanOrEqual(result.current.unitCount - 1);
    });

    it("disables suppressAnimation 50ms after resize recalculation", () => {
      const { result } = renderHook(() => useReaderLayout(makeOptions()));

      attachFakeContainer(result.current.containerRef, { clientWidth: 800, scrollWidth: 800 });

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      // Animation still suppressed right after resize
      expect(result.current.suppressAnimation).toBe(true);

      act(() => {
        vi.advanceTimersByTime(60);
      });

      expect(result.current.suppressAnimation).toBe(false);
    });

    it("removes the resize listener on unmount", () => {
      const removeListenerSpy = vi.spyOn(window, "removeEventListener");
      const { unmount } = renderHook(() => useReaderLayout(makeOptions()));

      unmount();

      const resizeCalls = removeListenerSpy.mock.calls.filter(([event]) => event === "resize");
      expect(resizeCalls.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // getLayoutMetrics edge cases
  // -------------------------------------------------------------------------

  describe("getLayoutMetrics edge cases", () => {
    it("skips layout settle when containerRef.current has clientWidth=0", () => {
      const onLayoutSettled = vi.fn();

      // Attach a zero-width container — metrics should return null
      type Props = Parameters<typeof useReaderLayout>[0];
      const { result, rerender } = renderHook(
        (props: Props) => useReaderLayout(props),
        { initialProps: makeOptions({ loading: true, onLayoutSettled }) }
      );

      attachFakeContainer(result.current.containerRef, { clientWidth: 0, scrollWidth: 800 });

      rerender(makeOptions({ loading: false, onLayoutSettled }));

      act(() => vi.advanceTimersByTime(200));

      expect(result.current.layoutSettled).toBe(false);
      expect(onLayoutSettled).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // unitStride computation
  // -------------------------------------------------------------------------

  describe("unitStride", () => {
    it("equals viewportWidth + columnGap after layout settles", () => {
      const { result, settle } = renderAndSettle(
        { columnGap: 40 },
        { clientWidth: 900, scrollWidth: 900 }
      );

      settle();

      expect(result.current.viewportWidth).toBe(900);
      expect(result.current.unitStride).toBe(900 + 40);
    });

    it("remains at columnGap when viewportWidth is 0 (before settle)", () => {
      const { result } = renderHook(() => useReaderLayout(makeOptions({ columnGap: 32 })));
      expect(result.current.unitStride).toBe(32);
    });
  });

  // -------------------------------------------------------------------------
  // Boundary / regression
  // -------------------------------------------------------------------------

  describe("boundary and regression cases", () => {
    it("settles correctly when content is exactly one viewport wide", () => {
      // scrollWidth=800, clientWidth=800, columnGap=32
      // stride=832, units=ceil(832/832)=1
      const { result, settle } = renderAndSettle(
        { sourcePercent: 0, columnGap: 32 },
        { clientWidth: 800, scrollWidth: 800 }
      );

      settle();

      expect(result.current.unitCount).toBe(1);
      expect(result.current.unitIndex).toBe(0);
    });

    it("onLayoutSettled is not called when getLayoutMetrics returns null", () => {
      const onLayoutSettled = vi.fn();
      // No container attached → getLayoutMetrics returns null → timer body exits early
      renderHook(() => useReaderLayout(makeOptions({ onLayoutSettled })));

      act(() => vi.advanceTimersByTime(200));

      expect(onLayoutSettled).not.toHaveBeenCalled();
    });

    it("multiple rapid chapter changes only settle once for the final chapter", () => {
      const onLayoutSettled = vi.fn();

      type Props = Parameters<typeof useReaderLayout>[0];
      const { result, rerender } = renderHook(
        (props: Props) => useReaderLayout(props),
        {
          initialProps: makeOptions({
            loading: true,
            currentChapterIdx: 0,
            chapterContent: "<p>ch0</p>",
            onLayoutSettled,
          }),
        }
      );

      attachFakeContainer(result.current.containerRef, { clientWidth: 800, scrollWidth: 800 });

      rerender(
        makeOptions({
          loading: false,
          currentChapterIdx: 0,
          chapterContent: "<p>ch0</p>",
          onLayoutSettled,
        })
      );

      // Rapid chapter navigation before the 150ms timer fires
      rerender(
        makeOptions({
          loading: false,
          currentChapterIdx: 1,
          chapterContent: "<p>ch1</p>",
          onLayoutSettled,
        })
      );
      rerender(
        makeOptions({
          loading: false,
          currentChapterIdx: 2,
          chapterContent: "<p>ch2</p>",
          onLayoutSettled,
        })
      );

      act(() => vi.advanceTimersByTime(200));

      // Each new effect cancels the previous timer → only one settle call at the end
      expect(onLayoutSettled).toHaveBeenCalledTimes(1);
    });

    it("sourcePercent=NaN does not throw a JavaScript error during hook execution", () => {
      // NaN propagates through the arithmetic so unitIndex becomes NaN —
      // the important invariant is that no exception is thrown by the hook itself.
      let caughtError: unknown;
      try {
        const { settle } = renderAndSettle(
          { sourcePercent: NaN },
          { clientWidth: 800, scrollWidth: 4000 }
        );
        settle();
      } catch (e) {
        caughtError = e;
      }
      expect(caughtError).toBeUndefined();
    });

    it("unitIndex stays within unitCount after settle and manual navigation", () => {
      const { result, settle } = renderAndSettle(
        { sourcePercent: 0 },
        { clientWidth: 800, scrollWidth: 4000 }
      );

      settle();

      const totalUnits = result.current.unitCount; // should be 5

      act(() => result.current.setUnitIndex(totalUnits - 1));

      expect(result.current.unitIndex).toBeLessThan(totalUnits);
    });
  });
});