const READY_ORDER_SOUND_SRC = "/sounds/universfield-new-notification-051-494246.mp3";
const AUDIO_PREFERENCE_KEY = "mideli-ready-order-audio";

let readyOrderAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;

function getAudio() {
  if (typeof window === "undefined") return null;
  if (!readyOrderAudio) {
    readyOrderAudio = new Audio(READY_ORDER_SOUND_SRC);
    readyOrderAudio.preload = "auto";
    readyOrderAudio.volume = 1;
  }
  return readyOrderAudio;
}

export function shouldPrimeReadyOrderAudio() {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(AUDIO_PREFERENCE_KEY) === "enabled" ||
    ("Notification" in window && Notification.permission === "granted")
  );
}

export function isReadyOrderAudioUnlocked() {
  return audioUnlocked;
}

export async function primeReadyOrderAudio(playPreview = false) {
  const audio = getAudio();
  if (!audio) return false;

  try {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audio.volume = playPreview ? 1 : 0.01;
    await audio.play();

    audioUnlocked = true;
    window.localStorage.setItem(AUDIO_PREFERENCE_KEY, "enabled");

    if (!playPreview) {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
    }

    return true;
  } catch {
    audio.volume = 1;
    return false;
  }
}

export async function playReadyOrderSound() {
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
