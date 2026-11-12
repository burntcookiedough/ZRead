import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampUnitIndex,
  clampSourcePercent,
  measureReaderLayout,
  READER_COLUMN_GAP,
  ReaderPositionAction,
  sourcePercentForUnit,
  unitForSourcePercent,
} from "../readerLayout";

interface UseReaderLayoutOptions {
  contentReady: boolean;
  contentKey: string;
  layoutKey: string;
  savedProgressPercent: number;
}

export function useReaderLayout({
  contentReady,
  contentKey,
  layoutKey,
  savedProgressPercent,
}: UseReaderLayoutOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [unitIndex, setUnitIndex] = useState(0);
  const [unitCount, setUnitCount] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [unitStride, setUnitStride] = useState(0);
  const [layoutSettled, setLayoutSettled] = useState(false);
  const [suppressAnimation, setSuppressAnimation] = useState(true);
  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );

  const unitIndexRef = useRef(unitIndex);
  const unitCountRef = useRef(unitCount);
  const sourcePercentRef = useRef(0);
  const narrowViewportRef = useRef(isNarrowViewport);
  const pendingActionRef = useRef<ReaderPositionAction | null>("restore");
  const animationFrameRef = useRef<number | null>(null);
  const optionsRef = useRef({ contentReady, savedProgressPercent });
  unitIndexRef.current = unitIndex;
  unitCountRef.current = unitCount;
  narrowViewportRef.current = isNarrowViewport;
  optionsRef.current = { contentReady, savedProgressPercent };

  const scheduleMeasurement = useCallback(() => {
    if (!optionsRef.current.contentReady || animationFrameRef.current !== null) return;

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      if (!optionsRef.current.contentReady) return;

      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const metrics = measureReaderLayout(
        container.clientWidth,
        content.scrollWidth,
        READER_COLUMN_GAP,
      );
      if (!metrics) return;

      const action = pendingActionRef.current;
      if (action === "restore") sourcePercentRef.current = clampSourcePercent(optionsRef.current.savedProgressPercent);
      else if (action === "first") sourcePercentRef.current = 0;
      else if (action === "last") sourcePercentRef.current = 100;
      const nextUnitIndex = action === "first"
        ? 0
        : action === "last"
          ? metrics.unitCount - 1
          : unitForSourcePercent(sourcePercentRef.current, metrics.unitCount);

      pendingActionRef.current = null;
      unitIndexRef.current = nextUnitIndex;
      unitCountRef.current = metrics.unitCount;
      setViewportWidth(metrics.viewportWidth);
      setUnitStride(metrics.unitStride);
      setUnitCount(metrics.unitCount);
      setUnitIndex(nextUnitIndex);
      setLayoutSettled(true);
      setSuppressAnimation(false);
    });
  }, []);

  const invalidateAndMeasure = useCallback(() => {
    if (!optionsRef.current.contentReady) return;
    setLayoutSettled(false);
    setSuppressAnimation(true);
    scheduleMeasurement();
  }, [scheduleMeasurement]);

  const setNextPosition = useCallback((action: ReaderPositionAction) => {
    pendingActionRef.current = action;
    setLayoutSettled(false);
    setSuppressAnimation(true);
  }, []);

  const requestPosition = useCallback((action: ReaderPositionAction) => {
    pendingActionRef.current = action;
    invalidateAndMeasure();
  }, [invalidateAndMeasure]);

  const goToUnit = useCallback((index: number, animate = true) => {
    const nextUnitIndex = clampUnitIndex(index, unitCountRef.current);
    sourcePercentRef.current = sourcePercentForUnit(nextUnitIndex, unitCountRef.current);
    unitIndexRef.current = nextUnitIndex;
    setUnitIndex(nextUnitIndex);
    setSuppressAnimation(!animate);
  }, []);

  const getPosition = useCallback(() => ({
    unitIndex: unitIndexRef.current,
    unitCount: unitCountRef.current,
  }), []);

  const getSourcePercent = useCallback(() => sourcePercentRef.current, []);

  useEffect(() => {
    if (!contentReady) {
      setLayoutSettled(false);
      return;
    }
    setLayoutSettled(false);
    setSuppressAnimation(true);
    scheduleMeasurement();
  }, [contentReady, contentKey, layoutKey, isNarrowViewport, scheduleMeasurement]);

  useEffect(() => {
    if (!contentReady) return;
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const observer = new ResizeObserver(() => {
      const narrow = document.documentElement.clientWidth < 768;
      if (narrow !== narrowViewportRef.current) {
        narrowViewportRef.current = narrow;
        setIsNarrowViewport(narrow);
        setLayoutSettled(false);
        return;
      }
      invalidateAndMeasure();
    });

    observer.observe(document.documentElement);
    observer.observe(container);
    observer.observe(content);
    content.querySelectorAll("img, svg, video").forEach((media) => observer.observe(media));

    const handleMediaLoad = () => invalidateAndMeasure();
    const handleFontsLoaded = () => invalidateAndMeasure();
    let active = true;
    document.fonts?.ready.then(() => {
      if (active) invalidateAndMeasure();
    });
    document.fonts?.addEventListener("loadingdone", handleFontsLoaded);
    container.addEventListener("load", handleMediaLoad, true);
    return () => {
      active = false;
      document.fonts?.removeEventListener("loadingdone", handleFontsLoaded);
      observer.disconnect();
      container.removeEventListener("load", handleMediaLoad, true);
    };
  }, [contentReady, contentKey, invalidateAndMeasure]);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  return {
    containerRef,
    contentRef,
    unitIndex,
    unitCount,
    viewportWidth,
    unitStride,
    layoutSettled,
    suppressAnimation,
    isNarrowViewport,
    setNextPosition,
    requestPosition,
    goToUnit,
    getPosition,
    getSourcePercent,
  };
}
