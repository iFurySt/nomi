# Desktop brand assets

Nomi 已选定 B「知己相伴」方向；可直接接入的 App 图标、黑白透明标志、
macOS ICNS 和 iOS 资源集见 [nomi-companion-v1](nomi-companion-v1/README.md)。
Electron / Web 和共享 UI 已接入该目录；下面的旧资源仅保留作迁入参考。

The legacy assets below were imported from AIFi's 2026-10-18 working tree and retain
its three-part mark as a historical baseline. The selected Nomi replacement is
now active in Electron / Web and the shared UI; these legacy
files do not redefine the existing iOS icon. See the original asset notes below.

# AIFi Brand Assets

Selected concept: 04, the three-part collaborative research symbol, 2026-10-14.
Display spelling is **AIFi**, including the lowercase final i.

| File | Use |
| --- | --- |
| symbol-master.png | Isolated alpha silhouette; authoritative shared shape |
| symbol-black.svg | Black mark on transparent background |
| symbol-white.svg | White mark on transparent background |
| symbol-green.svg | Deep green mark on transparent background |
| symbol-on-light.svg | Black mark, neutral light tile |
| symbol-on-dark.svg | White mark, dark tile |
| symbol-on-green.svg | Green mark, pale green tile |
| symbol-mask.png | Compact 256px mask used by UI and SVG variants |
| app-icon.png | Original dark rounded tile master |
| app-icon-512.png | Web touch icon and non-macOS window icon |
| app-icon-macos.png | macOS Dock/bundle/window icon with native canvas inset |
| favicon-64.png | Browser favicon |

The PNG master/app icon were made with the built-in imagegen tool from the
user-selected concept, rather than sourced from another product. SVG variants
embed the same compact PNG alpha mask: they preserve one silhouette and are scalable
containers, **not** independent vector paths. UI CSS masks also share this master
and inherit the current theme color. Generated white cutouts with artifacts were
rejected; do not reintroduce them. Pure vector tracing is a future refinement.

Re-export the committed size/color variants on macOS with
`node scripts/export-brand-assets.mjs`. sips performs only size/format exports;
normal cross-platform builds consume the committed output.
The macOS export also uses `scripts/export-macos-icon.swift` (CoreGraphics via
Xcode Command Line Tools). It scales the existing approved artwork onto a
transparent 1024px canvas: the alpha>=128 tile occupies 824px (about 80.5%) and
is centered by its actual opaque bounds. Finder/Chrome native icon exports measured
about 80.5%, versus the original AIFi export's 88.3%. Only the dedicated macOS
asset uses this inset; UI marks, browser favicon and original masters retain their
size and geometry. Both the bundle ICNS and runtime Dock override use this asset.

[Preview all variants](preview.html).

## Generation Prompts

Common prompt: Edit the supplied AIFi concept 04 reference into one production
brand asset. Preserve the central three-part symbol: top rounded wedge angled
up-right, bottom-left broad rounded wedge, right curved teardrop, central negative
space and asymmetric triangular arrangement. Remove AIFi, 04 and all other samples.
Keep crisp flat edges and the complete centered symbol. No redesign, rotation,
new shapes, gradients, texture, shadow, outline, 3D, labels or watermark.

Master variation: only near-black #202020 mark on a genuinely transparent square
background with modest optical padding, about 85% occupied width/height.

App icon variation: white version of the same mark inside a near-black #202020
rounded-square tile, occupying about 65% of its width/height, with transparent
outer corners and modest margin. No text, bevel, shadow or simulated material.

Additional generated white/green variants were previews. Production black,
white and green variants use the shared master mask to avoid shape drift.
