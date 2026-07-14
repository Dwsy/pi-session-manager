import { useCallback, useEffect, useState } from "react";

import type { ReplayCheckpoint } from "@/utils/session-branch";

export type ReplaySpeed = 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128;

const REPLAY_INTERVAL_MS = 860;
const MIN_REPLAY_TICK_MS = 16;

export function useAtlasReplay(checkpoints: readonly ReplayCheckpoint[]) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const lastIndex = Math.max(0, checkpoints.length - 1);

  useEffect(() => {
    setIndex((current) => Math.min(current, lastIndex));
    setPlaying(false);
    setStarted(false);
  }, [lastIndex]);

  useEffect(() => {
    if (!playing) return;
    if (index >= lastIndex) {
      setPlaying(false);
      return;
    }
    const delay = Math.max(MIN_REPLAY_TICK_MS, REPLAY_INTERVAL_MS / speed);
    const stepCount = Math.max(
      1,
      Math.round((speed * delay) / REPLAY_INTERVAL_MS),
    );
    const timer = window.setTimeout(() => {
      setIndex((current) => Math.min(current + stepCount, lastIndex));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [index, lastIndex, playing, speed]);

  const playPause = useCallback(() => {
    if (!checkpoints.length) return;
    setStarted(true);
    setPlaying((current) => {
      if (!current && index >= lastIndex) {
        setIndex(0);
      }
      return !current;
    });
  }, [checkpoints.length, index, lastIndex]);

  const step = useCallback(
    (direction: -1 | 1) => {
      setStarted(true);
      setPlaying(false);
      setIndex((current) =>
        Math.max(0, Math.min(lastIndex, current + direction)),
      );
    },
    [lastIndex],
  );

  const seek = useCallback(
    (nextIndex: number) => {
      setStarted(true);
      setPlaying(false);
      setIndex(Math.max(0, Math.min(lastIndex, nextIndex)));
    },
    [lastIndex],
  );

  const stop = useCallback(() => setPlaying(false), []);

  return {
    current: checkpoints[index] ?? null,
    index,
    lastIndex,
    playing,
    started,
    speed,
    setSpeed,
    playPause,
    step,
    seek,
    stop,
  };
}
