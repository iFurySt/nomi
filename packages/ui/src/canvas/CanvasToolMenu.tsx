import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";

/** Side-opening menus stay in screen space, including when the tool rail scrolls. */
export function CanvasToolMenu({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button aria-label={label} title={label} aria-pressed={open}>
          {icon}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="canvas-tool-menu"
          side="right"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          aria-label={label}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          {children(() => setOpen(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
