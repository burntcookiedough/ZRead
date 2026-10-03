export const READER_COLUMN_GAP = 48;

export type ReaderPositionAction = "first" | "last" | "restore";

export interface ReaderLayoutMetrics {
  viewportWidth: number;
  unitStride: number;
  unitCount: number;
}

export function clampUnitIndex(unitIndex: number, unitCount: number): number {
  const lastUnit = Math.max(0, Math.floor(unitCount) - 1);
  return Math.min(lastUnit, Math.max(0, Math.floor(Number.isFinite(unitIndex) ? unitIndex : 0)));
}

export function sourcePercentForUnit(unitIndex: number, unitCount: number): number {
  if (unitCount <= 1) return 0;
  return (clampUnitIndex(unitIndex, unitCount) / (unitCount - 1)) * 100;
}

export function clampSourcePercent(sourcePercent: number): number {
  return Number.isFinite(sourcePercent) ? Math.min(100, Math.max(0, sourcePercent)) : 0;
}

export function unitForSourcePercent(sourcePercent: number, unitCount: number): number {
  if (unitCount <= 1) return 0;
  return clampUnitIndex(Math.round((clampSourcePercent(sourcePercent) / 100) * (unitCount - 1)), unitCount);
}

export function measureReaderLayout(
  viewportWidth: number,
  contentScrollWidth: number,
  columnGap = READER_COLUMN_GAP,
): ReaderLayoutMetrics | null {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return null;
  const unitStride = viewportWidth + columnGap;
  const measuredWidth = Number.isFinite(contentScrollWidth) ? Math.max(0, contentScrollWidth) : 0;
  return {
    viewportWidth,
    unitStride,
    unitCount: Math.max(1, Math.ceil((measuredWidth + columnGap) / unitStride)),
  };
}
