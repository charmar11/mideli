import { expect, test } from "@playwright/test";
import {
  PULL_TO_REFRESH_THRESHOLD_PX,
  shouldPullToRefresh,
} from "../../src/lib/hooks/use-pull-to-refresh";

test("actualiza con un deslizamiento vertical suficiente desde arriba", () => {
  expect(PULL_TO_REFRESH_THRESHOLD_PX).toBe(72);
  expect(shouldPullToRefresh({ atTop: true, deltaX: 4, deltaY: 72 })).toBe(true);
});

test("no actualiza si el gesto empieza a media lista", () => {
  expect(shouldPullToRefresh({ atTop: false, deltaX: 0, deltaY: 120 })).toBe(false);
});

test("ignora gestos cortos, hacia arriba y horizontales", () => {
  expect(shouldPullToRefresh({ atTop: true, deltaX: 0, deltaY: 71 })).toBe(false);
  expect(shouldPullToRefresh({ atTop: true, deltaX: 0, deltaY: -100 })).toBe(false);
  expect(shouldPullToRefresh({ atTop: true, deltaX: 100, deltaY: 72 })).toBe(false);
});
