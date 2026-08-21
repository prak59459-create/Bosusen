const actx = new (window.AudioContext || window.webkitAudioContext)();
const masterGain = actx.createGain();
masterGain.gain.value = 0.7;
masterGain.connect(actx.destination);

export function setMasterVolume(v) {
  masterGain.gain.value = Math.max(0, Math.min(1, v));
}

export function resumeAudio() {
  if (actx.state === 'suspended') actx.resume();
}

function playTone(freq, dur, type = 'sine', vol = 0.2, glideTo = null) {
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, actx.currentTime);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, actx.currentTime + dur);
  gain.gain.setValueAtTime(vol, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(); osc.stop(actx.currentTime + dur);
}

function playNoise(dur, vol = 0.25) {
  const bufferSize = actx.sampleRate * dur;
  const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = actx.createBufferSource();
  src.buffer = buffer;
  const gain = actx.createGain();
  gain.gain.setValueAtTime(vol, actx.currentTime);
  src.connect(gain); gain.connect(masterGain);
  src.start();
}

export const sfx = {
  swing: () => playTone(280, 0.12, 'square', 0.08, 150),
  hit: () => { playNoise(0.15, 0.3); playTone(120, 0.15, 'sawtooth', 0.15, 60); },
  heavyHit: () => { playNoise(0.25, 0.4); playTone(80, 0.3, 'sawtooth', 0.25, 40); },
  heal: () => { playTone(440, 0.12, 'sine', 0.15, 660); setTimeout(() => playTone(660, 0.15, 'sine', 0.15, 880), 100); },
  skill: () => { playTone(200, 0.3, 'sawtooth', 0.2, 900); playNoise(0.3, 0.2); },
  guard: () => playTone(150, 0.15, 'triangle', 0.15),
  parry: () => { playTone(1400, 0.08, 'square', 0.25, 1800); playNoise(0.08, 0.2); },
  roar: () => { playTone(90, 0.5, 'sawtooth', 0.25, 50); playNoise(0.5, 0.15); },
  dodgeSuccess: () => playTone(880, 0.15, 'sine', 0.2, 1200),
  dodgeFail: () => playTone(150, 0.3, 'sawtooth', 0.2, 60),
  victory: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.35, 'sine', 0.2), i * 140)); },
  defeat: () => { [400, 300, 200, 120].forEach((f, i) => setTimeout(() => playTone(f, 0.4, 'sawtooth', 0.2), i * 180)); },
  shardGet: () => { playTone(660, 0.1, 'sine', 0.15, 990); setTimeout(() => playTone(990, 0.12, 'sine', 0.15, 1320), 80); },
  questDone: () => { [440, 660, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 'triangle', 0.15), i * 90)); },
  skillUnlock: () => { playTone(300, 0.2, 'sine', 0.2, 700); playNoise(0.2, 0.1); },
  achievement: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.22, 'triangle', 0.18), i * 100)); },
  uiClick: () => playTone(500, 0.05, 'square', 0.06, 600),
  menuOpen: () => playTone(400, 0.1, 'sine', 0.1, 550),
  menuClose: () => playTone(400, 0.1, 'sine', 0.1, 300),
  footstep: () => playNoise(0.06, 0.05),
  lowHp: () => { playTone(220, 0.18, 'triangle', 0.18, 160); },
};
