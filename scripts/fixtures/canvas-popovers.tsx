import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CANVAS_SHAPES, type CanvasShape } from "@nomi/core";
import { ConnectorToolbar } from "../../packages/ui/src/canvas/ConnectorToolbar";
import { SelectionToolbar } from "../../packages/ui/src/canvas/SelectionToolbar";
import "../../packages/ui/src/styles.css";
import "../../packages/ui/src/canvas/canvas.css";
const noop = () => {};
function Fixture() {
  const [options, setOptions] = useState<{
    kind: string;
    bottom: boolean;
    zoom: number;
    shape?: CanvasShape;
  }>({
    kind: "connector",
    bottom: false,
    zoom: 1,
  });
  Object.assign(window, {
    popoverFixture: setOptions,
    popoverShapes: CANVAS_SHAPES,
  });
  const width = innerWidth,
    height = innerHeight,
    y = options.bottom ? height - 160 : 110,
    camera = { x: 0, y: 0, zoom: options.zoom },
    rect = {
      id: "shape",
      content: "shape",
      x: width / 2 - 90,
      y: y - 40,
      width: 180,
      height: 40,
    };
  return (
    <main
      className="canvas-workspace"
      style={{
        position: "relative",
        height: "100vh",
        background: "var(--surface-muted)",
      }}
    >
      {options.kind === "connector" ? (
        <ConnectorToolbar
          connector={{
            id: "line",
            from: {
              point: {
                x: (width / 2 - 80) / options.zoom,
                y: y / options.zoom,
              },
              side: "e",
            },
            to: {
              point: {
                x: (width / 2 + 80) / options.zoom,
                y: y / options.zoom,
              },
              side: "w",
            },
            routing: "straight",
            style: "solid",
            startArrow: false,
            endArrow: true,
            label: "",
          }}
          rectangles={[]}
          camera={camera}
          viewportWidth={width}
          viewportHeight={height}
          onChange={noop}
          onAction={noop}
          endGroup={noop}
          editLabel={false}
          onEditLabel={noop}
          hasStyle={true}
        />
      ) : (
        <SelectionToolbar
          rects={[rect]}
          blocks={[
            {
              id: "shape",
              type: "shape",
              shape: options.shape ?? "rectangle",
              text: "",
              tone: "sage",
            },
          ]}
          camera={{ x: 0, y: 0, zoom: 1 }}
          width={width}
          height={height}
          onStyle={noop}
          onShape={noop}
          onArrange={noop}
          onAction={noop}
          hasStyle={true}
          editable={true}
          onFilter={noop}
          onEndGroup={noop}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
