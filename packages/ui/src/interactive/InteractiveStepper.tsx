import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { Tooltip } from "../components/Tooltip";

/** Playback is view-local. Every advance invokes the same validated action as a click. */
export function InteractiveStepper({
  position,
  previousAction,
  nextAction,
  atStart,
  disabled,
  checkpoint,
  delay,
  nextLabel,
  onAction,
  restartControl,
}: {
  position: number;
  previousAction: string;
  nextAction: string;
  atStart: boolean;
  disabled: boolean;
  checkpoint: boolean;
  delay: number;
  nextLabel: string;
  onAction: (id: string) => void;
  restartControl?: ReactNode;
}) {
  const [auto, setAuto] = useState(false);
  const [playing, setPlaying] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const action = useRef(onAction);
  action.current = onAction;
  useEffect(() => {
    if (!playing) return;
    if (disabled || checkpoint || position === 0) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => action.current(nextAction), delay);
    return () => clearTimeout(timer);
  }, [playing, position, disabled, checkpoint, delay, nextAction]);
  useEffect(() => {
    const stop = () => setPlaying(false);
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) stop();
    });
    observer.observe(root.current!);
    document.addEventListener("visibilitychange", stop);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", stop);
    };
  }, []);
  return (
    <div className="lesson-stepper" ref={root}>
      <div className="lesson-mode" role="group" aria-label="播放方式">
        <button
          aria-pressed={auto}
          onClick={() => {
            setPlaying(false);
            setAuto(true);
          }}
        >
          自动
        </button>
        <button
          aria-pressed={!auto}
          onClick={() => {
            setPlaying(false);
            setAuto(false);
          }}
        >
          手动
        </button>
      </div>
      <div className="lesson-navigation">
        {restartControl}
        <Tooltip label="上一步">
          <button
            aria-label="上一步"
            disabled={atStart}
            onClick={() => {
              setPlaying(false);
              onAction(previousAction);
            }}
          >
            <ArrowLeft size={16} />
          </button>
        </Tooltip>
        <Tooltip label={playing ? "暂停" : nextLabel}>
          <button
            aria-label={playing ? "暂停" : nextLabel}
            disabled={disabled}
            onClick={() => {
              if (playing) {
                setPlaying(false);
                return;
              }
              onAction(nextAction);
              if (auto) setPlaying(true);
            }}
          >
            {playing ? (
              <Pause size={16} />
            ) : auto ? (
              <Play size={16} />
            ) : (
              <ArrowRight size={16} />
            )}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
