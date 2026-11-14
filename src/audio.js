let context = null;
let master = null;
let muted = false;

try {
  muted = window.localStorage.getItem('pokeke:muted') === '1';
} catch {
  muted = false;
}

export function initAudio() {
  if (context) {
    if (context.state === 'suspended') context.resume();
    return;
  }
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  context = new AudioCtor();
  master = context.createGain();
  master.gain.value = muted ? 0 : 0.6;
  master.connect(context.destination);
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = !!value;
  try {
    window.localStorage.setItem('pokeke:muted', muted ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (master) master.gain.value = muted ? 0 : 0.6;
}

function tone(freq, duration, { type = 'sine', gain = 0.2, delay = 0, slideTo = 0 } = {}) {
  if (!context || muted) return;
  const t0 = context.currentTime + delay;
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, duration / 3));
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

function noise(duration = 0.08, { freq = 2200, q = 0.9, gain = 0.12, delay = 0 } = {}) {
  if (!context || muted) return;
  const t0 = context.currentTime + delay;
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const amp = context.createGain();
  amp.gain.value = gain;
  source.connect(filter).connect(amp).connect(master);
  source.start(t0);
}

function chipSound() {
  tone(880, 0.06, { type: 'triangle', gain: 0.1 });
  tone(1320, 0.05, { type: 'triangle', gain: 0.06, delay: 0.035 });
}

export const sfx = {
  deal() {
    noise(0.06, { freq: 1500, q: 0.7, gain: 0.1 });
    noise(0.05, { freq: 2600, q: 0.8, gain: 0.07, delay: 0.12 });
  },
  flip() {
    noise(0.09, { freq: 1300, q: 1.1, gain: 0.12 });
  },
  chip: chipSound,
  raise() {
    chipSound();
    tone(620, 0.09, { type: 'triangle', gain: 0.05, delay: 0.05 });
  },
  allin() {
    chipSound();
    tone(420, 0.28, { type: 'sawtooth', gain: 0.04, slideTo: 820 });
  },
  check() {
    tone(300, 0.08, { type: 'sine', gain: 0.07 });
  },
  fold() {
    noise(0.2, { freq: 600, q: 0.5, gain: 0.045 });
  },
  turn() {
    tone(740, 0.16, { type: 'sine', gain: 0.09 });
    tone(1108, 0.2, { type: 'sine', gain: 0.06, delay: 0.1 });
  },
  reveal() {
    noise(0.14, { freq: 2600, q: 0.8, gain: 0.09 });
  },
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
      tone(freq, 0.4, { type: 'triangle', gain: 0.09, delay: index * 0.09 });
    });
  },
  lose() {
    [392, 349.23, 293.66].forEach((freq, index) => {
      tone(freq, 0.3, { type: 'sine', gain: 0.06, delay: index * 0.1 });
    });
  },
};
