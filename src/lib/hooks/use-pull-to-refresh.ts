"use client";

import { useEffect, useRef } from "react";

export const PULL_TO_REFRESH_THRESHOLD_PX = 72;

export function shouldPullToRefresh(input: {
  atTop: boolean;
  deltaX: number;
  deltaY: number;
}): boolean {
  return (
    input.atTop &&
    input.deltaY >= PULL_TO_REFRESH_THRESHOLD_PX &&
    input.deltaY > Math.abs(input.deltaX) * 1.15
  );
}

type PullGesture = {
  startX: number;
  startY: number;
  atTop: boolean;
  scrollHost: HTMLElement | Element;
  previousOverscrollBehaviorY: string | null;
};

const registeredBoundaries = new WeakSet<HTMLElement>();
const ignoredTargets =
  "button, a, input, textarea, select, label, summary, [role='button'], [role='dialog'], [contenteditable='true'], [data-pull-to-refresh-ignore]";

function closestPullBoundary(target: EventTarget | null): HTMLElement | null {
  let current = target instanceof Element ? target : null;

  while (current) {
    if (current instanceof HTMLElement && registeredBoundaries.has(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function findScrollHost(target: EventTarget | null): HTMLElement | Element {
  let current = target instanceof Element ? target : null;

  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return document.scrollingElement ?? document.documentElement;
}

function scrollTopOf(element: HTMLElement | Element): number {
  if (
    element === document.scrollingElement ||
    element === document.documentElement ||
    element === document.body
  ) {
    return window.scrollY;
  }

  return element.scrollTop;
}

export function usePullToRefresh<T extends HTMLElement>(
  onRefresh: () => void | Promise<unknown>,
  enabled = true,
) {
  const boundaryRef = useRef<T | null>(null);
  const onRefreshRef = useRef(onRefresh);
  const enabledRef = useRef(enabled);
  const refreshingRef = useRef(false);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
    enabledRef.current = enabled;
  }, [enabled, onRefresh]);

  useEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary) return;

    let gesture: PullGesture | null = null;
    registeredBoundaries.add(boundary);

    function handleTouchStart(event: TouchEvent) {
      if (closestPullBoundary(event.target) !== boundary) {
        resetGesture();
        return;
      }
      if (event.touches.length !== 1 || !enabledRef.current || refreshingRef.current) {
        resetGesture();
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(ignoredTargets)) {
        resetGesture();
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;
      const scrollHost = findScrollHost(event.target);
      const atTop = scrollTopOf(scrollHost) <= 1;
      const previousOverscrollBehaviorY = scrollHost instanceof HTMLElement
        ? scrollHost.style.overscrollBehaviorY
        : null;
      if (atTop && scrollHost instanceof HTMLElement) {
        scrollHost.style.overscrollBehaviorY = "contain";
      }

      gesture = {
        startX: touch.clientX,
        startY: touch.clientY,
        atTop,
        scrollHost,
        previousOverscrollBehaviorY,
      };
    }

    function resetGesture() {
      if (gesture?.scrollHost instanceof HTMLElement && gesture.previousOverscrollBehaviorY !== null) {
        gesture.scrollHost.style.overscrollBehaviorY = gesture.previousOverscrollBehaviorY;
      }
      gesture = null;
    }

    function handleTouchEnd(event: TouchEvent) {
      if (!gesture) return;
      if (event.touches.length !== 0 || event.changedTouches.length !== 1) {
        resetGesture();
        return;
      }
      const touch = event.changedTouches[0];
      const currentGesture = gesture;
      resetGesture();
      if (!touch) return;

      const shouldRefresh = shouldPullToRefresh({
        atTop: currentGesture.atTop,
        deltaX: touch.clientX - currentGesture.startX,
        deltaY: touch.clientY - currentGesture.startY,
      });
      if (!shouldRefresh || !enabledRef.current || refreshingRef.current) return;

      refreshingRef.current = true;
      void Promise.resolve()
        .then(() => onRefreshRef.current())
        .catch(() => undefined)
        .finally(() => {
          refreshingRef.current = false;
        });
    }

    function handleTouchCancel() {
      resetGesture();
    }

    boundary.addEventListener("touchstart", handleTouchStart, { passive: true });
    boundary.addEventListener("touchend", handleTouchEnd, { passive: true });
    boundary.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      resetGesture();
      registeredBoundaries.delete(boundary);
      boundary.removeEventListener("touchstart", handleTouchStart);
      boundary.removeEventListener("touchend", handleTouchEnd);
      boundary.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, []);

  return boundaryRef;
}
