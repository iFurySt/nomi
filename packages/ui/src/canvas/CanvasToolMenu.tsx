import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import * as Popover from "@radix-ui/react-popover";

function useHover() {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enter = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return { open, setOpen, enter, leave };
}
export function CanvasToolMenu({
  label,
  icon,
  children,
  active,
  onSelect,
  compact = false,
}: {
  label: string;
  icon: ReactNode;
  children: (close: () => void) => ReactNode;
  active?: boolean;
  onSelect?: () => void;
  compact?: boolean;
}) {
  const h = useHover();
  return (
    <Popover.Root open={h.open} onOpenChange={h.setOpen}>
      <Popover.Trigger asChild>
        <button
          aria-label={label}
          aria-pressed={active ?? h.open}
          onPointerEnter={h.enter}
          onPointerLeave={h.leave}
          onClick={onSelect}
        >
          {icon}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={`canvas-tool-menu${compact ? " canvas-line-menu" : ""}`}
          side="right"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          aria-label={label}
          onPointerEnter={h.enter}
          onPointerLeave={h.leave}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          {children(() => h.setOpen(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function CanvasToolButton({
  label,
  shortcut,
  side = "right",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  shortcut?: string;
  side?: "right" | "top";
  children: ReactNode;
}) {
  const h = useHover();
  return (
    <Popover.Root open={h.open} onOpenChange={h.setOpen}>
      <Popover.Anchor asChild>
        <button
          {...props}
          aria-label={props["aria-label"] ?? label}
          onPointerEnter={h.enter}
          onPointerLeave={h.leave}
          onFocus={h.enter}
          onBlur={h.leave}
        >
          {children}
        </button>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          role="tooltip"
          className="canvas-tool-tip"
          side={side}
          sideOffset={10}
          collisionPadding={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {label}
          {shortcut && <kbd>{shortcut}</kbd>}
          <Popover.Arrow />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function CanvasLineToolIcon({
  mode,
}: {
  mode: "line" | "arrow" | "rounded" | "curve";
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={
          mode === "line"
            ? "M5 19L19 5"
            : mode === "arrow"
              ? "M5 19L19 5M9 5H19V15"
              : mode === "rounded"
                ? "M3 20H8Q10 20 10 18V10Q10 8 12 8H21M16 3L21 8L16 13"
                : "M3 20C3 9 10 8 21 8M16 3L21 8L16 13"
        }
      />
    </svg>
  );
}
