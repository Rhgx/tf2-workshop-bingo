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

type Sound = keyof typeof sounds;

// Web Audio rather than `new Audio()` per play: a fresh media element per click clips short sounds
// (the click is 79ms) at the start or end. Files are fetched up front; the context is created on the
// first play, inside a user gesture, so the autoplay policy never blocks it.
const files = new Map(Object.entries(sounds).map(([name, file]) =>
  [name, fetch(`ui/sfx/${file}`).then((response) => response.arrayBuffer())]));
const buffers = new Map<Sound, Promise<AudioBuffer>>();
let context: AudioContext | undefined;
let output: GainNode;

let muted = localStorage.getItem("bingo-muted") === "1";

export const isMuted = () => muted;

export function toggleMuted() {
  muted = !muted;
  localStorage.setItem("bingo-muted", muted ? "1" : "0");
  music.muted = muted;
}

// Menu music like GameUI: one random sound/ui/gamestartup*.mp3 per launch (holiday/gamestartup_halloween*.mp3
// around Halloween), played once, then silence. Browsers only allow sound after a real click or key press,
// so it fades in on the first one instead of on load.
// Tracks are re-encoded to 64k Opus to keep the repo small.
const tracks = "halloween" in document.documentElement.dataset
  ? ["gamestartup_halloween", "gamestartup_halloween1"]
  : Array.from({ length: 29 }, (_, index) => `gamestartup${index + 1}`);
const music = new Audio(`ui/music/${tracks[Math.floor(Math.random() * tracks.length)]}.webm`);
music.preload = "none";
music.muted = muted;
const musicVolume = 0.1;
const fadeMs = 4000;

function fadeIn() {
  let start: number | undefined;
  const step = (now: number) => {
    start ??= now;
    music.volume = musicVolume * Math.min(1, (now - start) / fadeMs);
    if (now - start < fadeMs) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Started even while muted (the sound button only toggles `muted`), so unmuting mid-track works like the game.
function startMusic() {
  if (!music.paused || music.ended) return;
  music.volume = 0;
  music.play().then(() => {
    removeEventListener("pointerdown", startMusic);
    removeEventListener("keydown", startMusic);
    fadeIn();
  }, () => {});
}
addEventListener("pointerdown", startMusic);
addEventListener("keydown", startMusic);

export function play(name: Sound) {
  if (muted) return;
  if (!context) {
    context = new AudioContext();
    output = context.createGain();
    output.gain.value = 0.5;
    output.connect(context.destination);
  }
  void context.resume();
  const ready = context;
  if (!buffers.has(name)) buffers.set(name, files.get(name)!.then((data) => ready.decodeAudioData(data)));
  buffers.get(name)!.then((buffer) => {
    const source = ready.createBufferSource();
    source.buffer = buffer;
    source.connect(output);
    source.start();
  }).catch(() => {});
}
