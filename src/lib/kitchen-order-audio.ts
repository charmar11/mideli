const KITCHEN_ORDER_SOUND_SRC =
  "/sounds/akshai26-notification-for-orders-313025.mp3";
const KITCHEN_AUDIO_PREFERENCE_KEY = "mideli-kitchen-order-audio";

let kitchenOrderAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;

function getAudio() {
  if (typeof window === "undefined") return null;
  if (!kitchenOrderAudio) {
    kitchenOrderAudio = new Audio(KITCHEN_ORDER_SOUND_SRC);
    kitchenOrderAudio.loop = false;
    kitchenOrderAudio.preload = "auto";
    kitchenOrderAudio.volume = 1;
  }
  return kitchenOrderAudio;
}

export function isKitchenOrderAudioEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(KITCHEN_AUDIO_PREFERENCE_KEY) !== "disabled";
}

export function setKitchenOrderAudioEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    KITCHEN_AUDIO_PREFERENCE_KEY,
    enabled ? "enabled" : "disabled"
  );
  if (!enabled) stopKitchenOrderAudio();
}

export function isKitchenOrderAudioUnlocked() {
  return audioUnlocked;
}

export async function primeKitchenOrderAudio() {
  const audio = getAudio();
  if (!audio) return false;

  try {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audio.volume = 0.01;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    audioUnlocked = true;
    return true;
  } catch {
    audio.volume = 1;
    return false;
  }
}

export async function playKitchenOrderSound() {
  if (!isKitchenOrderAudioEnabled()) return false;
  const audio = getAudio();
  if (!audio) return false;

  try {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audio.volume = 1;
    await audio.play();
    audioUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

export function stopKitchenOrderAudio() {
  const audio = kitchenOrderAudio;
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}
