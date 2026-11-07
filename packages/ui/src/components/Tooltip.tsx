import { useEffect, useState, type ReactElement } from "react";
import * as Primitive from "@radix-ui/react-tooltip";
import "./tooltip.css";

/** Shared non-interactive hint. The child keeps its layout, ref and handlers. */
export function Tooltip({
  label,
  shortcut,
  side = "top",
  disabled = false,
  children,
}: {
  label: string;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <Primitive.Provider
      delayDuration={200}
      skipDelayDuration={300}
      disableHoverableContent
    >
      <Primitive.Root open={!disabled && open} onOpenChange={setOpen}>
        <Primitive.Trigger asChild>{children}</Primitive.Trigger>
        <Primitive.Portal>
          <Primitive.Content
            className="nomi-tooltip"
            side={side}
            sideOffset={4}
            collisionPadding={8}
            hideWhenDetached
            aria-label={shortcut ? `${label} (${shortcut})` : label}
          >
            <span>{label}</span>
            {shortcut && <kbd>{shortcut}</kbd>}
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  );
}
