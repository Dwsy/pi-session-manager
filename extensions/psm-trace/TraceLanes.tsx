import { Fragment, useMemo } from "react";

import { formatLatency, type TraceLane, type TraceTimeline } from "./traceModel";

const LANES: TraceLane[] = ["input", "model", "tools"];

interface TraceLanesProps {
  timeline: TraceTimeline;
  selectedUid: string;
  labels: Record<TraceLane, string>;
  onSelect: (uid: string) => void;
}

/**
 * Wall-clock strip over the whole active path. It stays unfiltered on purpose:
 * the lens filters the step list, but latency only reads correctly when every
 * entry keeps its slot on the shared time axis.
 */
export default function TraceLanes({
  timeline,
  selectedUid,
  labels,
  onSelect,
}: TraceLanesProps) {
  const byLane = useMemo(() => {
    const map = new Map(timeline.steps.map((step) => [step.uid, step]));
    return LANES.map((lane) => ({
      lane,
      blocks: timeline.blocks
        .filter((block) => block.lane === lane)
        .map((block) => ({ block, step: map.get(block.uid) })),
    }));
  }, [timeline]);

  return (
    <div className="psm-trace-lanes">
      {byLane.map(({ lane, blocks }) => (
        <Fragment key={lane}>
          <span className="psm-trace-lanes__label">{labels[lane]}</span>
          <div className="psm-trace-lanes__track">
            {blocks.map(({ block, step }) => (
              <button
                key={block.uid}
                type="button"
                data-badge={step?.badge}
                className={[
                  "psm-trace-lanes__block",
                  block.uid === selectedUid ? "is-selected" : "",
                  block.isError ? "is-error" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  left: `${block.offset * 100}%`,
                  width: `${block.size * 100}%`,
                }}
                title={
                  step
                    ? `${step.badge} · ${formatLatency(step.durationMs)} · ${step.title}`
                    : undefined
                }
                aria-label={step ? `${step.badge} ${step.title}` : block.uid}
                onClick={() => onSelect(block.uid)}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
