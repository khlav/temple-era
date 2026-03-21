"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "~/lib/utils";

interface VirtualizedListProps<T> {
  items: T[];
  itemKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => React.ReactNode;
  estimateItemHeight: number;
  overscan?: number;
  className?: string;
  innerClassName?: string;
  emptyState?: React.ReactNode;
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function VirtualizedList<T>({
  items,
  itemKey,
  renderItem,
  estimateItemHeight,
  overscan = 4,
  className,
  innerClassName,
  emptyState,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState<
    Record<number, number>
  >({});

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateViewportHeight = () => {
      setViewportHeight(container.clientHeight);
    };

    updateViewportHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateViewportHeight();
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const metrics = useMemo(() => {
    const offsets = new Array<number>(items.length);
    let runningTop = 0;

    for (let index = 0; index < items.length; index += 1) {
      offsets[index] = runningTop;
      runningTop += measuredHeights[index] ?? estimateItemHeight;
    }

    return {
      offsets,
      totalHeight: runningTop,
    };
  }, [estimateItemHeight, items.length, measuredHeights]);

  const visibleRange = useMemo(() => {
    if (items.length === 0) {
      return { start: 0, end: -1 };
    }

    const windowTop = Math.max(0, scrollTop - overscan * estimateItemHeight);
    const windowBottom =
      scrollTop +
      (viewportHeight || estimateItemHeight * (overscan + 1)) +
      overscan * estimateItemHeight;

    let start = 0;
    while (
      start < items.length - 1 &&
      metrics.offsets[start + 1]! <= windowTop
    ) {
      start += 1;
    }

    let end = start;
    while (end < items.length - 1 && metrics.offsets[end]! < windowBottom) {
      end += 1;
    }

    return { start, end };
  }, [
    estimateItemHeight,
    items.length,
    metrics.offsets,
    overscan,
    scrollTop,
    viewportHeight,
  ]);

  const visibleItems = useMemo(() => {
    if (visibleRange.end < visibleRange.start) return [];

    return items
      .slice(visibleRange.start, visibleRange.end + 1)
      .map((item, relativeIndex) => {
        const index = visibleRange.start + relativeIndex;
        return {
          item,
          index,
          top: metrics.offsets[index] ?? 0,
        };
      });
  }, [items, metrics.offsets, visibleRange.end, visibleRange.start]);

  const handleMeasuredHeight = (index: number, height: number) => {
    setMeasuredHeights((prev) => {
      if (prev[index] === height) {
        return prev;
      }

      return {
        ...prev,
        [index]: height,
      };
    });
  };

  if (items.length === 0) {
    return emptyState ? <>{emptyState}</> : null;
  }

  return (
    <div
      ref={containerRef}
      className={cn("overflow-y-auto overflow-x-hidden", className)}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div
        className={cn("relative w-full", innerClassName)}
        style={{ height: metrics.totalHeight }}
      >
        {visibleItems.map(({ item, index, top }) => (
          <MeasuredItem
            key={itemKey(item, index)}
            index={index}
            top={top}
            onHeightChange={handleMeasuredHeight}
          >
            {renderItem(item, index)}
          </MeasuredItem>
        ))}
      </div>
    </div>
  );
}

function MeasuredItem({
  children,
  index,
  top,
  onHeightChange,
}: {
  children: React.ReactNode;
  index: number;
  top: number;
  onHeightChange: (index: number, height: number) => void;
}) {
  const itemRef = useRef<HTMLDivElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = itemRef.current;
    if (!node) return;

    const updateHeight = () => {
      onHeightChange(index, node.getBoundingClientRect().height);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, [index, onHeightChange]);

  return (
    <div ref={itemRef} className="absolute left-0 right-0" style={{ top }}>
      {children}
    </div>
  );
}
