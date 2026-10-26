export function installWheelScrollFallback() {
  const scrollableSelector = [
    ".mideli-page-scroll",
    ".pos-scroll",
    ".whatsapp-scroll-y",
    "[data-wheel-scroll-container]",
    '[class*="scroll"]',
    '[style*="overflow"]',
    '[class~="overflow-y-auto"]',
    '[class~="overflow-y-scroll"]',
    '[class~="overflow-y-overlay"]',
    '[class~="overflow-auto"]',
    '[class~="overflow-scroll"]',
  ].join(",");

  function isScrollable(element: Element): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false;

    const overflowY = window.getComputedStyle(element).overflowY;
    return (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      element.scrollHeight > element.clientHeight + 1
    );
  }

  function canScroll(element: HTMLElement, deltaY: number) {
    const maxScrollTop = element.scrollHeight - element.clientHeight;
    return deltaY > 0
      ? element.scrollTop < maxScrollTop - 1
      : element.scrollTop > 1;
  }

  function scrollDistance(element: HTMLElement, x: number, y: number) {
    const rect = element.getBoundingClientRect();
    const distanceX = Math.max(rect.left - x, 0, x - rect.right);
    const distanceY = Math.max(rect.top - y, 0, y - rect.bottom);
    return distanceX * 1.5 + distanceY;
  }

  function isVisible(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function scrollByWheel(element: HTMLElement, deltaY: number, event: WheelEvent) {
    event.preventDefault();
    element.scrollBy({ top: deltaY, behavior: "auto" });
  }

  function handleWheel(event: WheelEvent) {
    if (
      event.defaultPrevented ||
      event.deltaY === 0 ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [data-wheel-scroll-ignore]'
      )
    ) {
      return;
    }

    const dialogSelector = '[role="dialog"][aria-modal="true"], [data-wheel-scroll-boundary]';
    const dialog = target.closest<HTMLElement>(dialogSelector);
    const activeDialogs = Array.from(
      document.querySelectorAll<HTMLElement>(dialogSelector)
    ).filter(isVisible);
    const topDialog = activeDialogs[activeDialogs.length - 1] ?? null;
    if (topDialog && !topDialog.contains(target)) return;

    const shell = target.closest<HTMLElement>(".mideli-dashboard-shell");
    const main = shell
      ? shell.querySelector<HTMLElement>(".mideli-dashboard-main")
      : target.closest<HTMLElement>("main");
    const sidebar = target.closest<HTMLElement>("aside");
    const root = dialog ?? sidebar ?? main ?? shell ?? document.body;
    if (!root) return;

    const deltaY = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? event.deltaY * 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? event.deltaY * window.innerHeight
        : event.deltaY;

    const scrollableAncestors: HTMLElement[] = [];
    for (let element: Element | null = target; element; element = element.parentElement) {
      if (isScrollable(element)) scrollableAncestors.push(element);
      if (element === root) break;
    }

    if (scrollableAncestors.length > 0) {
      if (canScroll(scrollableAncestors[0], deltaY)) return;

      const scrollableParent = scrollableAncestors
        .slice(1)
        .find((element) => canScroll(element, deltaY));
      if (scrollableParent) {
        scrollByWheel(scrollableParent, deltaY, event);
      }
      return;
    }

    const fallbackRoot = dialog ?? sidebar ?? main ?? shell ?? document.body;

    const fallback = Array.from(
      fallbackRoot.querySelectorAll<HTMLElement>(scrollableSelector)
    )
      .filter((element) => isScrollable(element) && canScroll(element, deltaY) && isVisible(element))
      .sort(
        (left, right) =>
          scrollDistance(left, event.clientX, event.clientY) -
          scrollDistance(right, event.clientX, event.clientY)
      )[0];

    if (fallback) scrollByWheel(fallback, deltaY, event);
  }

  document.addEventListener("wheel", handleWheel, { passive: false });
  return () => document.removeEventListener("wheel", handleWheel);
}
