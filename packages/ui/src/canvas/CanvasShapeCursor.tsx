import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { CanvasBlock, CanvasCamera } from "@nomi/core";
import { ShapeGlyph } from "./ShapeGlyph";

// Pointer-only feedback stays outside the document and React's scene updates.
export function CanvasShapeCursor({
  viewport,
  active,
  shape,
  camera,
}: {
  viewport: RefObject<HTMLDivElement | null>;
  active: boolean;
  shape: Extract<CanvasBlock, { type: "shape" }>["shape"];
  camera: CanvasCamera;
}) {
  const ghost = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const surface = viewport.current;
    const el = ghost.current;
    if (!active || !surface || !el) return;
    let panning = false;
    const hide = () => {
      el.style.visibility = "hidden";
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.buttons || panning) {
        hide();
        return;
      }
      const rect = surface.getBoundingClientRect();
      el.style.transform = `translate(${event.clientX - rect.left}px, ${event.clientY - rect.top}px)`;
      el.style.visibility = "visible";
    };
    const key = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        panning = event.type === "keydown";
        hide();
      }
    };
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerleave", hide);
    surface.addEventListener("pointerdown", hide);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", hide);
    return () => {
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerleave", hide);
      surface.removeEventListener("pointerdown", hide);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", hide);
    };
  }, [active, viewport]);
  useLayoutEffect(() => {
    if (!active && ghost.current) ghost.current.style.visibility = "hidden";
  }, [active]);
  return (
    <svg
      ref={ghost}
      className="canvas-shape-cursor"
      aria-hidden="true"
      data-shape={shape}
      style={{ width: 180 * camera.zoom, height: 120 * camera.zoom }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <ShapeGlyph shape={shape} size={{ width: 180, height: 120 }} />
    </svg>
  );
}
