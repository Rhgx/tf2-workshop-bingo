// TF2 UI sounds, extracted from tf2_sound_misc_dir.vpk.
const sounds = {
  click: "buttonclick.wav",
  pickup: "item_default_pickup.wav",
  drop: "item_default_drop.wav",
  added: "item_acquired.mp3",
  remove: "panel_close.wav",
  clear: "item_bag_drop.mp3",
  error: "trade_failure.mp3",
  copy: "item_paper_pickup.mp3",
  download: "trade_success.mp3",
  folder: "quest_folder_open_halloween.wav",
} as const;

let muted = localStorage.getItem("bingo-muted") === "1";

export const isMuted = () => muted;

export function toggleMuted() {
  muted = !muted;
  localStorage.setItem("bingo-muted", muted ? "1" : "0");
}

export function play(name: keyof typeof sounds) {
  if (muted) return;
  const audio = new Audio(`ui/sfx/${sounds[name]}`);
  audio.volume = 0.5;
  audio.play().catch(() => {});
}
