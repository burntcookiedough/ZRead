import { RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ReaderSettings } from "../../../types";

export type PendingPageAction = "first" | "last" | "restore" | null;

interface UseReaderLayoutOptions {
  containerRef: RefObject<HTMLDivElement>;
  chapterContent: string;
  loading: boolean;
  settings: ReaderSettings;
  chapterIndex: number;
  pendingPageAction: PendingPageAction;
  sourcePercent: number;
  columnGap: number;
  onPendingPageActionSettled: () => void;
  onSettledProgress: (pageIndex: number, totalPages: number) => void;
}

interface PaginationMetrics {
  viewport: number;
  height: number;
  maxOffset: number;
  total: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const layoutKeyFor = (settings: ReaderSettings, chapterIndex: number, chapterContent: string) =>
  `${chapterIndex}:${settings.fontFamily}:${settings.fontSize}:${settings.lineHeight}:${settings.contentWidth}:${settings.viewMode}:${chapterContent.length}`;

function pageForPercent(sourcePercent: number, totalPages: number) {
  if (totalPages <= 1) return 0;
  return clamp(Math.round((sourcePercent / 100) * (totalPages - 1)), 0, totalPages - 1);
}

/**
 * Owns reader pagination measurement and source-percent restore semantics.
 */
export function useReaderLayout({
  containerRef,
  chapterContent,
  loading,
  settings,
  chapterIndex,
  pendingPageAction,
  sourcePercent,
  columnGap,
  onPendingPageActionSettled,
  onSettledProgress,
}: UseReaderLayoutOptions) {
  const [pageIndex, setPageIndexState] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [suppressAnimation, setSuppressAnimation] = useState(true);
  const pageIndexRef = useRef(pageIndex);
  const sourcePercentRef = useRef(sourcePercent);
  const pendingPageActionRef = useRef(pendingPageAction);
  const layoutSettledRef = useRef(false);
  const isSettlingRef = useRef(false);
  const settleFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const lastSettledRef = useRef({
    key: "",
    viewport: 0,
    height: 0,
  });

  sourcePercentRef.current = sourcePercent;
  pendingPageActionRef.current = pendingPageAction;

  const cancelSettleFrame = useCallback(() => {
    if (settleFrameRef.current !== null) {
      cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }
    isSettlingRef.current = false;
  }, []);

  const getPaginationMetrics = useCallback((): PaginationMetrics | null => {
    const container = containerRef.current;
    if (!container) return null;

    const viewport = container.clientWidth;
    const height = container.clientHeight;
    if (viewport <= 0 || height <= 0) return null;

    const content = container.querySelector<HTMLElement>("#reader-chapter-body");
    const scrollWidth = content?.scrollWidth || container.scrollWidth;
    const stride = viewport + columnGap;
    const maxOffset = Math.max(0, scrollWidth - viewport);
    const total = Math.max(1, Math.ceil(maxOffset / stride) + 1);

    return { viewport, height, maxOffset, total };
  }, [columnGap, containerRef]);

  const settleLayout = useCallback(
    (_reason: string, deferMeasurement = true) => {
      if (loading || !chapterContent || !containerRef.current || isSettlingRef.current) return;
      isSettlingRef.current = true;
      setSuppressAnimation(true);
      layoutSettledRef.current = false;

      const measureAndCommit = () => {
        settleFrameRef.current = null;
        const metrics = getPaginationMetrics();
        if (!metrics) {
          isSettlingRef.current = false;
          return;
        }

        const { viewport, height, total } = metrics;
        const action = pendingPageActionRef.current;
        let targetPage = pageForPercent(sourcePercentRef.current, total);

        if (action === "first") {
          targetPage = 0;
        } else if (action === "last") {
          targetPage = total - 1;
        }

        setViewportWidth(viewport);
        setTotalPages(total);
        pageIndexRef.current = targetPage;
        setPageIndexState(targetPage);
        if (action !== null) {
          onPendingPageActionSettled();
        }
        if (action === "first" || action === "last") {
          onSettledProgress(targetPage, total);
        }
        lastSettledRef.current = {
          key: layoutKeyFor(settings, chapterIndex, chapterContent),
          viewport,
          height,
        };
        layoutSettledRef.current = true;
        isSettlingRef.current = false;
      };

      if (deferMeasurement) {
        settleFrameRef.current = requestAnimationFrame(measureAndCommit);
      } else {
        measureAndCommit();
      }
    },
    [
      chapterContent,
      chapterIndex,
      containerRef,
      getPaginationMetrics,
      loading,
      onPendingPageActionSettled,
      onSettledProgress,
      settings.contentWidth,
      settings.fontFamily,
      settings.fontSize,
      settings.lineHeight,
      settings.viewMode,
    ]
  );

  useLayoutEffect(() => {
    if (loading || !chapterContent) return;

    const container = containerRef.current;
    const last = lastSettledRef.current;
    const layoutAlreadySettled =
      pendingPageAction === null &&
      layoutSettledRef.current &&
      container !== null &&
      last.key === layoutKeyFor(settings, chapterIndex, chapterContent) &&
      last.viewport === container.clientWidth &&
      last.height === container.clientHeight;
    if (layoutAlreadySettled) return;

    // New chapter HTML initially renders with the previous chapter's transform.
    // Measure in the layout phase so the target page is committed before paint.
    settleLayout("content", false);
    return cancelSettleFrame;
  }, [cancelSettleFrame, chapterContent, chapterIndex, containerRef, loading, pendingPageAction, settings, settleLayout]);

  useEffect(() => {
    if (loading || !chapterContent || !containerRef.current) return;

    const container = containerRef.current;
    const content = container.querySelector<HTMLElement>("#reader-chapter-body");
    const observer = new ResizeObserver(() => {
      const key = layoutKeyFor(settings, chapterIndex, chapterContent);
      const last = lastSettledRef.current;
      const viewport = container.clientWidth;
      const height = container.clientHeight;
      const dimensionsChanged = viewport !== last.viewport || height !== last.height;
      const layoutInputChanged = key !== last.key;

      if ((layoutInputChanged || dimensionsChanged || !layoutSettledRef.current) && resizeFrameRef.current === null) {
        resizeFrameRef.current = requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          if (layoutInputChanged || dimensionsChanged || !layoutSettledRef.current) {
            settleLayout("resize");
          }
        });
      }
    });

    const windowResizeHandler = () => {
      if (resizeFrameRef.current === null) {
        resizeFrameRef.current = requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          settleLayout("resize");
        });
      }
    };

    window.addEventListener("resize", windowResizeHandler);
    document.addEventListener("fullscreenchange", windowResizeHandler);

    let disposed = false;
    const handleFontLayoutChange = () => {
      if (!disposed) windowResizeHandler();
    };
    if ("fonts" in document) {
      document.fonts.addEventListener("loadingdone", handleFontLayoutChange);
      document.fonts.addEventListener("loadingerror", handleFontLayoutChange);
      void document.fonts.ready.then(handleFontLayoutChange, handleFontLayoutChange);
    }

    observer.observe(container);
    if (content) observer.observe(content);

    const images = Array.from(container.querySelectorAll("img, image"));
    const imageListeners: Array<() => void> = [];
    images.forEach((img) => {
      const element = img as HTMLImageElement;
      const onLoad = () => settleLayout("media");
      element.addEventListener("load", onLoad, { once: true });
      imageListeners.push(() => element.removeEventListener("load", onLoad));
      if ("decode" in element && !element.complete) {
        void element.decode().then(onLoad, () => {});
      }
    });

    return () => {
      disposed = true;
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      window.removeEventListener("resize", windowResizeHandler);
      document.removeEventListener("fullscreenchange", windowResizeHandler);
      if ("fonts" in document) {
        document.fonts.removeEventListener("loadingdone", handleFontLayoutChange);
        document.fonts.removeEventListener("loadingerror", handleFontLayoutChange);
      }
      observer.disconnect();
      imageListeners.forEach((cleanup) => cleanup());
    };
  }, [chapterContent, chapterIndex, containerRef, loading, settings, settleLayout]);

  const setPageIndex = useCallback((nextPage: number, animate: boolean) => {
    setSuppressAnimation(!animate);
    setPageIndexState(nextPage);
    pageIndexRef.current = nextPage;
  }, []);

  return {
    pageIndex,
    totalPages,
    viewportWidth,
    suppressAnimation,
    setPageIndex,
  };
}
