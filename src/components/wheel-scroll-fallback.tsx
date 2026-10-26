"use client";

import { useEffect } from "react";
import { installWheelScrollFallback } from "@/lib/wheel-scroll-fallback";

export function WheelScrollFallback() {
  useEffect(() => installWheelScrollFallback(), []);

  return null;
}
