// ============================================================================
// audio.js — fully synthesized WebAudio SFX + minimal procedural music.
// No asset files. The context is created on the first user gesture (START).
// ============================================================================

let AC = null;
let masterGain = null;
let noiseBuffer = null;
let audioMuted = localStorage.getItem('contraryLarryMuted') === '1';
let activeVoices = 0;
const MAX_VOICES = 8;
const sfxLastAt = {};
let musicTimer = null;
let nextNoteTime = 0;
let musicBeat = 0;

function initAudio() {
    if (AC) {
        if (AC.state === 'suspended') AC.resume();
        return;
    }
    try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        AC = new Ctor();
    } catch (e) {
        AC = null;
        return;
    }
    masterGain = AC.createGain();
    masterGain.gain.value = audioMuted ? 0 : 0.5;
    masterGain.connect(AC.destination);
    // 1s of white noise, reused by every noise burst
    noiseBuffer = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    startMusic();
}

function setMuted(m) {
    audioMuted = m;
    localStorage.setItem('contraryLarryMuted', m ? '1' : '0');
    if (masterGain) masterGain.gain.value = m ? 0 : 0.5;
}
function isMuted() { return audioMuted; }
function toggleMute() { setMuted(!audioMuted); }

// --- Synth primitives -------------------------------------------------------

function voiceDone() { activeVoices = Math.max(0, activeVoices - 1); }

function blip(freq, type, dur, slideTo, vol = 0.18) {
    if (!AC || activeVoices >= MAX_VOICES) return;
    activeVoices++;
    const t = AC.currentTime;
    const osc = AC.createOscillator();
    const g = AC.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = voiceDone;
}

function noiseBurst(dur, filterFreq, q = 1, vol = 0.2, slideTo) {
    if (!AC || activeVoices >= MAX_VOICES) return;
    activeVoices++;
    const t = AC.currentTime;
    const src = AC.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = AC.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    filter.Q.value = q;
    const g = AC.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = voiceDone;
}

function subHit(freq, dur, vol = 0.3) {
    if (!AC || activeVoices >= MAX_VOICES) return;
    activeVoices++;
    const t = AC.currentTime;
    const osc = AC.createOscillator();
    const g = AC.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.4), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = voiceDone;
}

// --- SFX registry -----------------------------------------------------------

const SFX = {
    shoot_pistol: () => blip(880, 'square', 0.07, 330, 0.10),
    shoot_sniper: () => { blip(1500, 'sawtooth', 0.22, 150, 0.16); noiseBurst(0.12, 2200, 1.5, 0.10); },
    shoot_shotgun: () => { noiseBurst(0.16, 900, 0.8, 0.24, 300); subHit(90, 0.12, 0.2); },
    shoot_machinegun: () => blip(700, 'square', 0.05, 380, 0.08),
    shoot_flamethrower: () => noiseBurst(0.10, 500, 0.6, 0.07, 260),
    shoot_railgun: () => { blip(1200, 'sawtooth', 0.30, 90, 0.18); noiseBurst(0.20, 3200, 2, 0.10, 500); },
    shoot_grenadelauncher: () => { blip(300, 'square', 0.14, 130, 0.16); noiseBurst(0.08, 700, 1, 0.10); },
    hit: () => blip(320, 'square', 0.045, 190, 0.06),
    crit: () => { blip(320, 'square', 0.05, 190, 0.08); blip(1900, 'sine', 0.09, 2400, 0.10); },
    explosion: () => { noiseBurst(0.35, 700, 0.7, 0.22, 120); subHit(60, 0.30, 0.28); },
    playerHurt: () => { blip(110, 'sawtooth', 0.18, 60, 0.22); noiseBurst(0.10, 400, 1, 0.10); },
    pickup: () => { blip(660, 'sine', 0.07, undefined, 0.12); setTimeout(() => blip(990, 'sine', 0.09, undefined, 0.12), 60); },
    shard: () => blip(1320, 'sine', 0.10, 1760, 0.10),
    swordSwing: () => noiseBurst(0.13, 1400, 2.5, 0.14, 350),
    staffShot: () => blip(520, 'sine', 0.12, 240, 0.12),
    staffBlast: () => { blip(180, 'sawtooth', 0.35, 50, 0.20); noiseBurst(0.25, 900, 1, 0.14, 150); subHit(70, 0.3, 0.24); },
    dash: () => noiseBurst(0.09, 2000, 2, 0.10, 700),
    waveStart: () => { blip(440, 'square', 0.09, undefined, 0.10); setTimeout(() => blip(587, 'square', 0.12, undefined, 0.10), 90); },
    bossAlarm: () => { blip(220, 'sawtooth', 0.25, 175, 0.18); setTimeout(() => blip(220, 'sawtooth', 0.25, 175, 0.18), 260); },
    awaken: () => { blip(392, 'sine', 0.20, undefined, 0.14); setTimeout(() => blip(523, 'sine', 0.20, undefined, 0.14), 140); setTimeout(() => blip(784, 'sine', 0.35, undefined, 0.14), 280); },
    death: () => { blip(300, 'sawtooth', 0.8, 40, 0.22); noiseBurst(0.6, 500, 0.8, 0.14, 80); },
};

function sfx(name) {
    if (!AC || audioMuted) return;
    const fn = SFX[name];
    if (!fn) return;
    const now = performance.now();
    if (sfxLastAt[name] && now - sfxLastAt[name] < 45) return; // throttle spam
    sfxLastAt[name] = now;
    fn();
}

// --- Procedural music -------------------------------------------------------
// Sparse minor-key pulse; doubles tempo intensity while a boss is alive.

const MUSIC_BASS = [55, 55, 65.4, 49];           // A1, A1, C2, G1
const MUSIC_ARP = [220, 261.6, 329.6, 261.6, 220, 329.6, 392, 329.6]; // A3 C4 E4 ...

function startMusic() {
    if (musicTimer || !AC) return;
    nextNoteTime = AC.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 150);
}

function scheduleMusic() {
    if (!AC || audioMuted) return;
    if (typeof game === 'undefined' || game.state !== 'playing') {
        nextNoteTime = AC.currentTime + 0.1;
        return;
    }
    const bossAlive = typeof enemies !== 'undefined' && enemies.some(e => e.bossRank);
    const beatLen = bossAlive ? 0.17 : 0.26;
    while (nextNoteTime < AC.currentTime + 0.35) {
        const t = nextNoteTime;
        const bar = Math.floor(musicBeat / 8) % MUSIC_BASS.length;
        if (musicBeat % 4 === 0) {
            playNoteAt(MUSIC_BASS[bar], 'triangle', t, beatLen * 3.5, 0.10);
        }
        if (musicBeat % 2 === 0) {
            playNoteAt(MUSIC_ARP[musicBeat % MUSIC_ARP.length] * (bossAlive ? 2 : 1), 'square', t, beatLen * 0.9, bossAlive ? 0.035 : 0.025);
        }
        nextNoteTime += beatLen;
        musicBeat++;
    }
}

function playNoteAt(freq, type, when, dur, vol) {
    if (!AC) return;
    const osc = AC.createOscillator();
    const g = AC.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
}
