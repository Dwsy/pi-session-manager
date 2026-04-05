import React, { useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { triggerHaptic } from "../../utils/haptics";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  pullDownThreshold?: number;
  maxPullDown?: number;
  scrollRef?: React.RefObject<HTMLDivElement>;
}

export default function PullToRefresh({
  onRefresh,
  children,
  pullDownThreshold = 60,
  maxPullDown = 100,
  scrollRef,
}: PullToRefreshProps) {
  const [pullDownDistance, setPullDownDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const fallbackRef = useRef<HTMLDivElement | null>(null);
  const containerRef = scrollRef ?? fallbackRef;
  const startY = useRef(0);
  const currentY = useRef(0);

  // To avoid interfering with internal scrolling,
  // we only allow pull to refresh when the container's scroll top is 0
  const [isAtTop, setIsAtTop] = useState(true);

  const handleScroll = (e: React.UIEvent) => {
    setIsAtTop((e.target as HTMLElement).scrollTop <= 0);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (!isAtTop || isRefreshing) return;
    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || !isAtTop || isRefreshing) return;
    currentY.current = e.touches[0].clientY;
    let distance = currentY.current - startY.current;

    // Only care about pulling down
    if (distance > 0) {
      // Add friction as it goes further
      distance = distance * 0.4;
      if (distance > maxPullDown) distance = maxPullDown;
      setPullDownDistance(distance);

      // If we just crossed the threshold, provide haptic feedback
      if (
        distance >= pullDownThreshold &&
        pullDownDistance < pullDownThreshold
      ) {
        triggerHaptic("medium");
      }
    } else {
      setPullDownDistance(0);
    }
  };

  const onTouchEnd = async () => {
    if (!isPulling || isRefreshing) return;
    setIsPulling(false);

    if (pullDownDistance >= pullDownThreshold) {
      setPullDownDistance(pullDownThreshold); // Snap back to refresh loading point
      setIsRefreshing(true);
      triggerHaptic("success");
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDownDistance(0);
      }
    } else {
      setPullDownDistance(0); // Didn't pull far enough, snap back to 0
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">
      {/* Refresh indicator */}
      <div
        className="absolute top-0 left-0 right-0 flex justify-center items-center z-20 pointer-events-none motion-transform"
        style={{
          height: `${pullDownThreshold}px`,
          transform: `translateY(${Math.min(0, pullDownDistance - pullDownThreshold)}px)`,
          opacity: Math.min(1, pullDownDistance / pullDownThreshold),
        }}
      >
        <div className="bg-popover shadow-md rounded-full p-2 text-primary">
          <Loader2
            className={`h-5 w-5 ${isRefreshing ? "animate-spin text-blue-500" : "text-muted-foreground"}`}
            style={{
              transform: !isRefreshing
                ? `rotate(${pullDownDistance * 3}deg)`
                : undefined,
            }}
          />
        </div>
      </div>

      {/* Content wrapper */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full overflow-y-auto custom-scrollbar"
        onScroll={handleScroll}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateY(${isRefreshing ? pullDownThreshold : pullDownDistance}px)`,
          transition: isPulling
            ? "none"
            : "transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
