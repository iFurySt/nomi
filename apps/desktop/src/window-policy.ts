import type { MenuItemConstructorOptions, WebContents } from "electron";

export function viewMenu(development: boolean): MenuItemConstructorOptions {
  return {
    label: "View",
    submenu: [
      { role: "togglefullscreen" },
      ...(development
        ? [{ type: "separator" as const }, { role: "toggleDevTools" as const }]
        : []),
    ],
  };
}

export function configureWindowInput(contents: WebContents) {
  // Keep app chrome at its designed scale, including profiles previously zoomed
  // through Electron's default menu. Canvas/PDF zoom stays in the renderer.
  contents.on("did-finish-load", () => contents.setZoomFactor(1));
  void contents.setVisualZoomLevelLimits(1, 1);
  contents.on("before-input-event", (event, input) => {
    const key = input.key.toLowerCase();
    const command = process.platform === "darwin" ? input.meta : input.control;
    const reload = key === "f5" || (command && !input.alt && key === "r");
    const pageZoom =
      command && !input.alt && ["+", "=", "-", "0"].includes(key);
    if (reload || pageZoom) event.preventDefault();
  });
}
