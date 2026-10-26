"use client";

import { useSyncExternalStore } from "react";

/**
 * Reloj compartido de un segundo.
 *
 * Todos los componentes que muestran un cronómetro (hora de Cocina, tiempo
 * transcurrido de cada comanda) se suscriben al mismo intervalo. Así solo se
 * redibujan esos textos cada segundo y no la pantalla completa.
 */

const listeners = new Set<() => void>();
let currentMs = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  currentMs = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    currentMs = Date.now();
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  // Debe devolver el mismo valor entre llamadas hasta el siguiente tick.
  if (currentMs === 0) currentMs = Date.now();
  return currentMs;
}

function getServerSnapshot() {
  return null;
}

/** Hora actual en milisegundos, actualizada cada segundo. `null` durante SSR. */
export function useSecondTick(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
