/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { ReaderSettings } from "../../../types";

type PendingPageAction = "first" | "last" | "restore" | null;

interface ReaderLayoutOptions {
  loading: boolean;
  chapterContent: string;
  settings: ReaderSettings;
  currentChapterIdx: number;
  sourcePercent: number;
  columnGap: number;
  onLayoutSettled?: (unitIndex: number, unitCount: number) => void;
}

interface ReaderLayoutMetrics {
  viewport: number;
  unitCount: number;
}

export interface ReaderLayoutState {
  containerRef: RefObject<HTMLDivElement>;
  unitIndex: number;
  setUnitIndex: (unitIndex: number) => void;
  unitCount: number;
  viewportWidth: number;
  unitStride: number;
  unitsPerViewport: number;
  sourcePercent: number;
  layoutSettled: boolean;
  suppressAnimation: boolean;
  setSuppressAnimation: (suppressAnimation: boolean) => void;
  pendingPageAction: PendingPageAction;
  setPendingPageAction: (action: PendingPageAction) => void;
  viewportWidthStyle: string;
  markLayoutUnsettled: () => void;
}

const isNarrowViewport = () => typeof window !== "undefined" && window.innerWidth < 768;

/**
 * Owns Reader layout measurement, resize recalculation, and unit restore mapping.
 */
export function useReaderLayout({
  loading,
  chapterContent,
  settings,
  currentChapterIdx,
  sourcePercent,
  columnGap,
  onLayoutSettled,
}: ReaderLayoutOptions): ReaderLayoutState {
  const containerRef = useRef<HTMLDivElement>(null);
  const unitIndexRef = useRef(0);
  const onLayoutSettledRef = useRef(onLayoutSettled);

  const [unitIndex, setUnitIndexState] = useState(0);
  const [unitCount, setUnitCount] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [pendingPageAction, setPendingPageAction] = useState<PendingPageAction>("restore");
  const [suppressAnimation, setSuppressAnimation] = useState(true);
  const [layoutSettled, setLayoutSettled] = useState(false);
  const [isMobile, setIsMobile] = useState(isNarrowViewport);

  const unitsPerViewport = settings.viewMode === "split" && !isMobile ? 2 : 1;
  const viewportMaxWidth = settings.contentWidth * unitsPerViewport + (unitsPerViewport - 1) * columnGap;
  const viewportWidthStyle = isMobile
    ? `min(calc(100vw - 32px), ${settings.contentWidth}px)`
    : `min(calc(100vw - 96px), ${viewportMaxWidth}px)`;
  const unitStride = viewportWidth + columnGap;

  useEffect(() => {
    onLayoutSettledRef.current = onLayoutSettled;
  }, [onLayoutSettled]);

  const setUnitIndex = useCallback((nextUnitIndex: number) => {
    unitIndexRef.current = nextUnitIndex;
    setUnitIndexState(nextUnitIndex);
  }, []);

  const markLayoutUnsettled = useCallback(() => {
    setLayoutSettled(false);
    setSuppressAnimation(true);
  }, []);

  const getLayoutMetrics = useCallback((): ReaderLayoutMetrics | null => {
    const container = containerRef.current;
    if (!container) return null;

    const viewport = container.clientWidth;
    if (viewport <= 0) return null;

    const content = container.querySelector<HTMLElement>("#reader-chapter-body");
    const scrollWidth = content?.scrollWidth || container.scrollWidth;
    const stride = viewport + columnGap;
    const measuredUnitCount = Math.max(1, Math.ceil((scrollWidth + columnGap) / stride));

    return { viewport, unitCount: measuredUnitCount };
  }, [columnGap]);

  const unitForSourcePercent = useCallback(
    (nextUnitCount: number) => {
      return Math.min(
        nextUnitCount - 1,
        Math.max(0, Math.round((sourcePercent / 100) * (nextUnitCount - 1)))
      );
    },
    [sourcePercent]
  );

  const recalculateUnits = useCallback(() => {
    setSuppressAnimation(true);
    const metrics = getLayoutMetrics();
    if (!metrics) return;

    const targetUnitIndex = Math.min(metrics.unitCount - 1, unitIndexRef.current);
    setViewportWidth(metrics.viewport);
    setUnitCount(metrics.unitCount);
    setUnitIndex(targetUnitIndex);
    setLayoutSettled(true);

    setTimeout(() => {
      setSuppressAnimation(false);
    }, 50);
  }, [getLayoutMetrics, setUnitIndex]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isNarrowViewport());
      recalculateUnits();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [recalculateUnits]);

  useEffect(() => {
    markLayoutUnsettled();
  }, [chapterContent, settings, currentChapterIdx, markLayoutUnsettled]);

  useEffect(() => {
    if (loading || !chapterContent || !containerRef.current) return;

    const timer = setTimeout(() => {
      const metrics = getLayoutMetrics();
      if (!metrics) return;

      let targetUnitIndex = unitIndexRef.current;
      if (pendingPageAction === "last") {
        targetUnitIndex = metrics.unitCount - 1;
      } else if (pendingPageAction === "first") {
        targetUnitIndex = 0;
      } else if (pendingPageAction === "restore") {
        targetUnitIndex = unitForSourcePercent(metrics.unitCount);
      } else {
        targetUnitIndex = Math.min(metrics.unitCount - 1, Math.max(0, unitIndexRef.current));
      }

      setViewportWidth(metrics.viewport);
      setUnitCount(metrics.unitCount);
      setUnitIndex(targetUnitIndex);
      setPendingPageAction(null);
      setLayoutSettled(true);
      onLayoutSettledRef.current?.(targetUnitIndex, metrics.unitCount);

      setTimeout(() => {
        setSuppressAnimation(false);
      }, 50);
    }, 150);

    return () => clearTimeout(timer);
  }, [
    loading,
    chapterContent,
    pendingPageAction,
    settings,
    currentChapterIdx,
    getLayoutMetrics,
    unitForSourcePercent,
    setUnitIndex,
  ]);

  return {
    containerRef,
    unitIndex,
    setUnitIndex,
    unitCount,
    viewportWidth,
    unitStride,
    unitsPerViewport,
    sourcePercent,
    layoutSettled,
    suppressAnimation,
    setSuppressAnimation,
    pendingPageAction,
    setPendingPageAction,
    viewportWidthStyle,
    markLayoutUnsettled,
  };
}

