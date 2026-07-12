/**
 * audio.js - Web Audio synthesized sound engine for SKY STRIKE.
 * No external assets; every sound is generated procedurally.
 */
(function (global) {
  "use strict";

  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let abGain = null;
  let afterburnerSrc = null;
  let active = false;

  function init() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.22;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.75;
    sfxGain.connect(master);
    active = true;
    startEngine();
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function tone(freq, dur, type, gainPeak, slideTo, when) {
    if (!active) return;
    when = when || 0;
    const t0 = now() + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) {
      o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
    return { osc: o, gain: g };
  }

  function noiseBurst(dur, gainPeak, filterFreq, sweepTo, type, when) {
    if (!active) return;
    when = when || 0;
    const t0 = now() + when;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = type || "bandpass";
    filt.frequency.setValueAtTime(filterFreq, t0);
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    filt.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  function startEngine() {
    if (!active) return;
    engineOsc = ctx.createOscillator();
    engineGain = ctx.createGain();
    engineFilter = ctx.createBiquadFilter();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 70;
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 320;
    engineFilter.Q.value = 1.8;
    engineGain.gain.value = 0.0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(sfxGain);
    engineOsc.start();
    abGain = ctx.createGain();
    abGain.gain.value = 0;
    const abBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ad = abBuf.getChannelData(0);
    for (let i = 0; i < ad.length; i++) ad[i] = (Math.random() * 2 - 1) * 0.6;
    afterburnerSrc = ctx.createBufferSource();
    afterburnerSrc.buffer = abBuf;
    afterburnerSrc.loop = true;
    const abFilt = ctx.createBiquadFilter();
    abFilt.type = "bandpass";
    abFilt.frequency.value = 280;
    abFilt.Q.value = 0.6;
    afterburnerSrc.connect(abFilt);
    abFilt.connect(abGain);
    abGain.connect(sfxGain);
    afterburnerSrc.start();
  }

  function updateEngine(throttle, speed) {
    if (!active) return;
    const t = now();
    const rpm = 55 + throttle * 75;
    engineOsc.frequency.setTargetAtTime(rpm, t, 0.15);
    engineFilter.frequency.setTargetAtTime(200 + throttle * 260, t, 0.15);
    engineGain.gain.setTargetAtTime(0.04 + throttle * 0.05, t, 0.2);
    abGain.gain.setTargetAtTime(throttle > 1.0 ? 0.05 + (throttle - 1) * 0.07 : 0.0, t, 0.25);
  }

  function lockBeep() {
    if (!active) return;
    tone(740, 0.07, "square", 0.18, 0, 0);
    noiseBurst(0.04, 0.08, 2000, 0, "bandpass", 0);
  }

  function lockAlert() {
    if (!active) return;
    for (let i = 0; i < 3; i++) {
      tone(880, 0.09, "square", 0.28, 0, i * 0.12);
    }
    noiseBurst(0.4, 0.18, 1500, 400, "bandpass", 0);
  }

  function launch() {
    if (!active) return;
    tone(900, 0.5, "sawtooth", 0.16, 180, 0);
    noiseBurst(0.55, 0.22, 1400, 180, "bandpass", 0);
    tone(140, 0.4, "square", 0.12, 60, 0.02);
  }

  function enemyLaunchHeard() {
    if (!active) return;
    noiseBurst(0.3, 0.05, 800, 200, "bandpass", 0);
  }

  function explosion(scale) {
    if (!active) return;
    scale = scale || 1;
    noiseBurst(0.9 * scale, 0.6, 120, 40, "lowpass", 0);
    noiseBurst(0.4 * scale, 0.4, 3000, 300, "bandpass", 0);
    tone(60, 0.7 * scale, "sine", 0.5, 25, 0);
    tone(38, 0.9 * scale, "square", 0.18, 18, 0.02);
  }

  function bombWhistle(dur) {
    if (!active) return;
    dur = dur || 2.5;
    const t0 = now();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(420, t0);
    o.frequency.exponentialRampToValueAtTime(900, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.3);
    g.gain.setValueAtTime(0.12, t0 + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function warning() {
    if (!active) return;
    for (let i = 0; i < 2; i++) {
      tone(420, 0.14, "sawtooth", 0.2, 380, i * 0.22);
    }
  }

  function hit() {
    if (!active) return;
    noiseBurst(0.12, 0.18, 900, 300, "bandpass", 0);
    tone(300, 0.1, "square", 0.1, 120, 0);
  }

  function uiClick() {
    if (!active) return;
    tone(600, 0.05, "square", 0.12, 0, 0);
  }

  function uiBeep() {
    if (!active) return;
    tone(880, 0.08, "sine", 0.12, 0, 0);
  }

  function uiLow() {
    if (!active) return;
    tone(330, 0.12, "square", 0.14, 0, 0);
  }

  function success() {
    if (!active) return;
    tone(523, 0.12, "sine", 0.16, 0, 0);
    tone(659, 0.12, "sine", 0.16, 0, 0.1);
    tone(784, 0.2, "sine", 0.16, 0, 0.2);
  }

  function fail() {
    if (!active) return;
    tone(440, 0.2, "sawtooth", 0.16, 0, 0);
    tone(330, 0.3, "sawtooth", 0.16, 0, 0.18);
    tone(165, 0.5, "sawtooth", 0.18, 80, 0.4);
  }

  function stopAll() {
    if (!active) return;
    try {
      if (engineOsc) engineOsc.stop();
      if (afterburnerSrc) afterburnerSrc.stop();
    } catch (e) {}
    active = false;
  }

  global.SkyAudio = {
    init: init,
    updateEngine: updateEngine,
    lockBeep: lockBeep,
    lockAlert: lockAlert,
    launch: launch,
    enemyLaunchHeard: enemyLaunchHeard,
    explosion: explosion,
    bombWhistle: bombWhistle,
    warning: warning,
    hit: hit,
    uiClick: uiClick,
    uiBeep: uiBeep,
    uiLow: uiLow,
    success: success,
    fail: fail,
    stopAll: stopAll
  };
})(typeof window !== "undefined" ? window : this);
