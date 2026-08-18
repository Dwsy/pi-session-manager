import { useEffect, useRef, useState } from "react";

import { formatLatency, type TraceStep } from "./traceModel";

const ROW_HEIGHT = 26;
const OVERSCAN = 12;

interface TraceStepListProps {
  steps: TraceStep[];
  selectedUid: string;
  emptyLabel: string;
  turnLabel: (turn: number) => string;
  onSelect: (uid: string) => void;
  onActivate: (uid: string) => void;
}

export default function TraceStepList({
  steps,
  selectedUid,
  emptyLabel,
  turnLabel,
  onSelect,
  onActivate,
}: TraceStepListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(entry?.contentRect.height || element.clientHeight || 480);
    });
    observer.observe(element);
    setViewportHeight(element.clientHeight || 480);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const index = steps.findIndex((step) => step.uid === selectedUid);
    const scroll = scrollRef.current;
    if (index < 0 || !scroll) return;
    const top = index * ROW_HEIGHT;
    if (top < scroll.scrollTop || top + ROW_HEIGHT > scroll.scrollTop + scroll.clientHeight) {
      scroll.scrollTo({ top: Math.max(0, top - scroll.clientHeight / 3) });
    }
  }, [selectedUid, steps]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    steps.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
  );

  return (
    <div
      ref={scrollRef}
      className="psm-trace-list"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div
        className="psm-trace-list__spacer"
        style={{ height: steps.length * ROW_HEIGHT }}
      >
        {steps.slice(startIndex, endIndex).map((step, offset) => {
          const index = startIndex + offset;
          return (
            <TraceRow
              key={step.uid}
              step={step}
              top={index * ROW_HEIGHT}
              turnStart={steps[index - 1]?.turn !== step.turn}
              turnBreak={index > 0 && steps[index - 1]?.turn !== step.turn}
              selected={step.uid === selectedUid}
              turnLabel={turnLabel}
              onSelect={() => onSelect(step.uid)}
              onActivate={() => onActivate(step.uid)}
            />
          );
        })}
      </div>
      {steps.length === 0 ? (
        <div className="psm-trace-empty">{emptyLabel}</div>
      ) : null}
    </div>
  );
}

function TraceRow({
  step,
  top,
  turnStart,
  turnBreak,
  selected,
  turnLabel,
  onSelect,
  onActivate,
}: {
  step: TraceStep;
  top: number;
  turnStart: boolean;
  turnBreak: boolean;
  selected: boolean;
  turnLabel: (turn: number) => string;
  onSelect: () => void;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "psm-trace-row",
        `kind-${step.badge}`,
        selected ? "is-selected" : "",
        step.isError ? "is-error" : "",
        turnBreak ? "is-turn-break" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ transform: `translateY(${top}px)` }}
      aria-pressed={selected}
      onClick={onSelect}
      onDoubleClick={onActivate}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        onActivate();
      }}
    >
      <span className="psm-trace-row__gutter">
        {turnStart ? turnLabel(step.turn) : ""}
      </span>
      <span className="psm-trace-badge" data-badge={step.badge}>
        {step.badge}
      </span>
      <span className="psm-trace-row__body">
        <span className="psm-trace-row__title">{step.title}</span>
        {step.detail ? (
          <>
            <span className="psm-trace-row__arrow" aria-hidden="true">
              →
            </span>
            <span className="psm-trace-row__detail">{step.detail}</span>
          </>
        ) : null}
      </span>
      <span className="psm-trace-row__meta">{formatLatency(step.durationMs)}</span>
    </button>
  );
}
