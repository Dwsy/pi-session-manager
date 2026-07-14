import { useLayoutEffect, useState, type RefObject } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

export function useElementSize<T extends Element>(
  ref: RefObject<T | null>,
): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (): void => {
      const rect = element.getBoundingClientRect();
      setSize((previous) => {
        const next = {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        return previous.width === next.width && previous.height === next.height
          ? previous
          : next;
      });
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
