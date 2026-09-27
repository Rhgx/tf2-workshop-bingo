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
}

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
