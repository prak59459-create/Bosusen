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

/* ---------- 探索モード用の環境風音（ループ） ---------- */
let ambientNodes = null;
export function startAmbientWind() {
  if (ambientNodes) return;
  const bufferSize = actx.sampleRate * 2;
  const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const filter = actx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 400;
  filter.Q.value = 0.6;
  const gain = actx.createGain();
  gain.gain.value = 0.05;
  src.connect(filter); filter.connect(gain); gain.connect(masterGain);
  src.start();
  ambientNodes = { src, filter, gain };
}
export function stopAmbientWind() {
  if (!ambientNodes) return;
  ambientNodes.gain.gain.setTargetAtTime(0, actx.currentTime, 0.3);
  const nodes = ambientNodes;
  setTimeout(() => { try { nodes.src.stop(); } catch (e) {} }, 500);
  ambientNodes = null;
}

/* ---------- 雨のアンビエント音（強度を可変で制御） ---------- */
let rainNodes = null;
export function setRainIntensity(v) {
  const target = Math.max(0, Math.min(1, v));
  if (target <= 0.001) {
    if (rainNodes) {
      rainNodes.gain.gain.setTargetAtTime(0, actx.currentTime, 0.4);
      const nodes = rainNodes;
      setTimeout(() => { try { nodes.src.stop(); } catch (e) {} }, 700);
      rainNodes = null;
    }
    return;
  }
  if (!rainNodes) {
    const bufferSize = actx.sampleRate * 2;
    const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = actx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    const gain = actx.createGain();
    gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(masterGain);
    src.start();
    rainNodes = { src, filter, gain };
  }
  rainNodes.gain.gain.setTargetAtTime(target * 0.09, actx.currentTime, 0.6);
}

/* ---------- バイオームごとの環境ドローン音 ---------- */
const DRONE_FREQ = { forest: 220, desert: 130, cyber: 90, snow: 260, swamp: 150, volcanic: 70, crystal: 330, wasteland: 100 };
let droneNodes = null;
let droneCategory = null;
export function setBiomeDrone(category) {
  if (category === droneCategory) return;
  droneCategory = category;
  const freq = DRONE_FREQ[category];
  if (!freq) {
    if (droneNodes) {
      droneNodes.gain.gain.setTargetAtTime(0, actx.currentTime, 0.8);
      const nodes = droneNodes;
      setTimeout(() => { try { nodes.osc.stop(); } catch (e) {} }, 1500);
      droneNodes = null;
    }
    return;
  }
  if (!droneNodes) {
    const osc = actx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = actx.createGain();
    gain.gain.value = 0;
    osc.connect(gain); gain.connect(masterGain);
    osc.start();
    droneNodes = { osc, gain };
    droneNodes.gain.gain.setTargetAtTime(0.025, actx.currentTime, 1.2);
  } else {
    droneNodes.osc.frequency.setTargetAtTime(freq, actx.currentTime, 1.5);
  }
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
  critHit: () => { playNoise(0.2, 0.35); playTone(200, 0.1, 'square', 0.2, 900); playTone(900, 0.15, 'sine', 0.15, 1400); },
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
  lowBossHp: () => { playTone(660, 0.15, 'sawtooth', 0.2, 880); playTone(220, 0.4, 'sawtooth', 0.15, 140); },
  uiClick: () => playTone(500, 0.05, 'square', 0.06, 600),
  menuOpen: () => playTone(400, 0.1, 'sine', 0.1, 550),
  menuClose: () => playTone(400, 0.1, 'sine', 0.1, 300),
  footstep: () => playNoise(0.06, 0.05),
  footstepSand: () => playNoise(0.1, 0.035),
  footstepSnow: () => { playNoise(0.05, 0.06); playTone(1200, 0.03, 'square', 0.02, 900); },
  footstepWater: () => { playNoise(0.08, 0.08); playTone(500, 0.06, 'sine', 0.05, 300); },
  footstepMetal: () => playTone(700, 0.05, 'square', 0.04, 500),
  footstepSwamp: () => { playNoise(0.14, 0.1); playTone(220, 0.08, 'sine', 0.06, 140); },
  footstepCrystal: () => { playTone(1600, 0.05, 'sine', 0.04, 2000); playTone(2400, 0.03, 'triangle', 0.03, 2600); },
  footstepVolcanic: () => { playNoise(0.1, 0.15); playTone(150, 0.1, 'sawtooth', 0.06, 90); },
  footstepAsh: () => playNoise(0.12, 0.06),
  critterChirp: () => { playTone(1800 + Math.random() * 600, 0.06, 'sine', 0.04, 2400); },
  frogCroak: () => { playTone(220, 0.12, 'square', 0.05, 160); },
  crowCaw: () => { playTone(500, 0.15, 'sawtooth', 0.05, 350); },
  scorpionClick: () => { playTone(2600, 0.02, 'square', 0.03, 2200); setTimeout(() => playTone(2600, 0.02, 'square', 0.03, 2200), 60); },
  foxYip: () => { playTone(900, 0.08, 'sine', 0.05, 1400); },
  droneHum: () => { playTone(1200, 0.2, 'sine', 0.03, 1100); },
  spiritChime: () => { playTone(1400, 0.3, 'sine', 0.04, 1900); },
  thunder: () => { playNoise(1.1, 0.35); playTone(60, 1.2, 'sawtooth', 0.3, 30); },
  lowHp: () => { playTone(220, 0.18, 'triangle', 0.18, 160); },
};
