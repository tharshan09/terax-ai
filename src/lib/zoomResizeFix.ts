// react-resizable-panels detects drags positionally: on a document-level
// pointerdown it compares the pointer coordinates (clientX/Y, in *visual*
// space) against `getBoundingClientRect()` of its own elements. Our app zoom
// uses CSS `zoom` on `.zoom-content`, and in the WebKit build Tauri ships,
// `getBoundingClientRect()` returns UN-zoomed layout coordinates while pointer
// events report zoomed (visual) coordinates. At zoom != 1 the two coordinate
// spaces drift apart by exactly the zoom factor, so the resize grab zone lands
// off the visible divider (measured 1020 vs. clicked 918 at zoom 0.9).
//
// Fix: scale the rects of the library's OWN elements (they carry
// `data-panel-group` / `data-panel` / `data-separator`) by the zoom factor so
// they live in the same visual space as the pointer. Panel *sizes* are computed
// as ratios (panel.width / group.width), so scaling both by the same factor
// leaves them unchanged — only the absolute positions used for hit-testing are
// corrected. At zoom === 1 this is a no-op with an early return (no overhead).

let appZoom = 1;

/** Kept in sync by useZoom whenever `--app-zoom` changes. */
export function setResizeZoomFactor(z: number): void {
  appZoom = Number.isFinite(z) && z > 0 ? z : 1;
}

let installed = false;

export function installZoomResizeFix(): void {
  if (installed) return;
  installed = true;

  const proto = Element.prototype;
  const original = proto.getBoundingClientRect;

  proto.getBoundingClientRect = function patchedGetBoundingClientRect(
    this: Element,
  ): DOMRect {
    const rect = original.call(this);
    if (appZoom === 1) return rect;
    if (
      this.hasAttribute("data-separator") ||
      this.hasAttribute("data-panel") ||
      this.hasAttribute("data-panel-group")
    ) {
      return new DOMRect(
        rect.x * appZoom,
        rect.y * appZoom,
        rect.width * appZoom,
        rect.height * appZoom,
      );
    }
    return rect;
  };
}
