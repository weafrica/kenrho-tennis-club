// KenRho Park — read aloud (v3)
// Any button with  data-read-aloud="element-id"  reads that element out. Voice tiers (each falls back to the next):
//   1. PRE-RECORDED  data-audio="audio/welcome.mp3"  (cached on the device)
//   2. HD VOICE      natural neural voice (Kokoro) running in a Web Worker, so the page never freezes.
//                    It downloads automatically in the background once the app is installed (or when the
//                    person turns it on), is cached, and is used as soon as it's ready.
//   3. BROWSER VOICE the best voice the device ships; used instantly while HD is still downloading.
(function () {
  "use strict";
  window.__krReadAloud = true;
  var synth = window.speechSynthesis || null;
  var HD_KEY = "kr_hd_voice", AUTO_KEY = "kr_voice_auto", READY_KEY = "kr_hd_ready", AUDIO_CACHE = "kr-audio-v1";
  var HD_VOICE = window.KR_HD_VOICE_NAME || "af_heart";
  var me = document.currentScript || document.querySelector('script[src*="read-aloud.js"]');
  var WORKER_URL = (me && me.src ? me.src.replace(/read-aloud\.js.*$/, "") : "js/") + "voice-worker.js";
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  var player = new Audio(), session = 0, cancelPlay = null, current = null, cachedVoice = null;

  // ------------------------------------------------------------- HD voice worker (never blocks the page)
  var worker = null, hdState = ls.get(READY_KEY) === "1" ? "cached" : "idle"; // idle | loading | ready | cached | failed
  var pending = {}, nextId = 1, pct = 0, pill = null;
  function lowEnd() {
    var c = navigator.connection || {};
    return !!(c.saveData || /(^|-)2g$/.test(c.effectiveType || "") || (typeof navigator.deviceMemory === "number" && navigator.deviceMemory < 4) || typeof Worker === "undefined");
  }
  function ensureWorker() {
    if (worker || hdState === "failed") return worker;
    try { worker = new Worker(WORKER_URL, { type: "module" }); } catch (e) { hdState = "failed"; return null; }
    worker.onmessage = function (e) {
      var m = e.data || {};
      if (m.type === "progress") { pct = m.pct; showPill("Downloading natural voice " + pct + "%"); }
      else if (m.type === "ready") { hdState = "ready"; ls.set(READY_KEY, "1"); showPill("Natural voice ready ✓", 3500); }
      else if (m.type === "audio" && pending[m.id]) { pending[m.id].resolve(m.blob); delete pending[m.id]; }
      else if (m.type === "error") {
        if (m.id && pending[m.id]) { pending[m.id].reject(new Error(m.message)); delete pending[m.id]; }
        else { hdState = "failed"; hidePill(); }
      }
    };
    worker.onerror = function () { hdState = "failed"; hidePill(); };
    return worker;
  }
  function preload() {
    if (lowEnd() || hdState === "ready" || hdState === "loading" || hdState === "failed") return;
    if (!ensureWorker()) return;
    hdState = "loading"; ls.set(HD_KEY, "1");
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    showPill("Downloading natural voice…");
    worker.postMessage({ type: "load" });
  }
  function hdUsable() { return ls.get(HD_KEY) === "1" && (hdState === "ready" || hdState === "cached") && !!ensureWorker(); }
  function synthHD(text) {
    return new Promise(function (resolve, reject) {
      var w = ensureWorker(); if (!w) return reject(new Error("no worker"));
      var id = nextId++; pending[id] = { resolve: resolve, reject: reject };
      w.postMessage({ type: "speak", id: id, text: text, voice: HD_VOICE });
    });
  }
  function showPill(text, ms) {
    if (!pill) {
      pill = document.createElement("div");
      pill.style.cssText = "position:fixed;left:12px;bottom:calc(64px + env(safe-area-inset-bottom,0px));z-index:78;background:#1f3d1a;color:#fff;font:600 .78rem system-ui,sans-serif;padding:7px 12px;border-radius:99px;box-shadow:0 6px 16px rgba(0,0,0,.25);max-width:80vw;pointer-events:none";
      document.body.appendChild(pill);
    }
    pill.textContent = text; pill.style.display = "block";
    if (ms) setTimeout(hidePill, ms);
  }
  function hidePill() { if (pill) pill.style.display = "none"; }
  window.KR_VOICE = {
    preload: preload,
    status: function () { return { state: hdState, pct: pct, auto: ls.get(AUTO_KEY) !== "off", lowEnd: lowEnd() }; },
    setAuto: function (on) { ls.set(AUTO_KEY, on ? "on" : "off"); if (on) preload(); },
  };

  // ------------------------------------------------------------- helpers
  function setState(btn, state, extra) {
    var label = btn.getAttribute("data-label") || "Read aloud";
    var map = { idle: ["🔊", label], loading: ["⏳", extra || "Preparing…"], speaking: ["⏸", "Pause"], paused: ["▶", "Resume"] };
    var m = map[state] || map.idle;
    btn.innerHTML = m[0] + " " + m[1]; btn.dataset.state = state; btn.setAttribute("aria-label", m[1]);
  }
  function cleanText(el) { return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(); }
  function toChunks(text) {
    var sentences = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [text], out = [];
    sentences.forEach(function (s) {
      s = s.trim();
      while (s.length > 220) {
        var cut = s.lastIndexOf(",", 220); if (cut < 80) cut = s.lastIndexOf(" ", 220); if (cut < 40) cut = 220;
        out.push(s.slice(0, cut + 1).trim()); s = s.slice(cut + 1).trim();
      }
      if (s) out.push(s);
    });
    return out;
  }

  // ------------------------------------------------------------- browser voice
  function scoreVoice(v) {
    var n = (v.name || "").toLowerCase(), l = (v.lang || "").toLowerCase().replace("_", "-");
    if (l.indexOf("en") !== 0) return -1000;
    var s = 0;
    if (/online \(natural\)|neural|natural/.test(n)) s += 100;
    if (/premium|enhanced/.test(n)) s += 85;
    if (/siri/.test(n)) s += 70;
    if (/google/.test(n)) s += 60;
    if (/samantha|daniel|karen|moira|tessa|serena|jenny|aria|leah|libby|sonia/.test(n)) s += 35;
    if (/espeak|compact|novelty|zarvox|whisper|bad news|bells|boing/.test(n)) s -= 80;
    if (l === "en-za") s += 30; else if (l === "en-gb") s += 20; else if (l === "en-us") s += 15;
    if (v.localService) s += 4;
    return s;
  }
  function bestVoice() {
    if (!synth) return null; var voices = synth.getVoices(); if (!voices.length) return null;
    var best = null, bs = -Infinity; voices.forEach(function (v) { var sc = scoreVoice(v); if (sc > bs) { best = v; bs = sc; } }); return best;
  }
  function getVoice() { return cachedVoice || (cachedVoice = bestVoice()); }
  if (synth && synth.addEventListener) synth.addEventListener("voiceschanged", function () { cachedVoice = bestVoice(); });
  function speakChunk(text) {
    return new Promise(function (resolve, reject) {
      var u = new SpeechSynthesisUtterance(text), v = getVoice();
      if (v) { u.voice = v; u.lang = v.lang; } u.rate = 0.97; u.pitch = 1;
      u.onend = function () { resolve(); };
      u.onerror = function (e) { if (e && (e.error === "canceled" || e.error === "interrupted")) resolve("cancelled"); else reject(e); };
      synth.speak(u);
    });
  }
  async function runBrowser(btn, chunks, start, my) {
    for (var i = start; i < chunks.length; i++) {
      if (my !== session) return; current.index = i;
      try { await speakChunk(chunks[i]); } catch (e) { break; }
    }
    if (my === session) finish(btn);
  }

  // ------------------------------------------------------------- audio files / HD playback
  function playUrl(url) {
    return new Promise(function (resolve, reject) {
      player.onended = function () { cancelPlay = null; resolve(); };
      player.onerror = function () { cancelPlay = null; reject(new Error("audio error")); };
      cancelPlay = function () { cancelPlay = null; resolve("cancelled"); };
      player.src = url; var p = player.play(); if (p && p.catch) p.catch(function (e) { cancelPlay = null; reject(e); });
    });
  }
  async function cachedFileUrl(url) {
    if (!("caches" in window)) return url;
    var cache = await caches.open(AUDIO_CACHE), res = await cache.match(url);
    if (!res) { var fresh = await fetch(url); if (!fresh.ok) throw new Error("missing"); await cache.put(url, fresh.clone()); res = fresh; }
    return URL.createObjectURL(await res.blob());
  }
  async function runFile(btn, src, my) {
    var url = await cachedFileUrl(src); if (my !== session) return;
    current.mode = "audio"; setState(btn, "speaking");
    var r = await playUrl(url); if (r !== "cancelled" && my === session) finish(btn);
  }
  async function runHD(btn, chunks, start, my) {
    current.mode = "hd"; setState(btn, "loading", "Preparing…");
    var next = synthHD(chunks[start]);
    for (var i = start; i < chunks.length; i++) {
      if (my !== session) return;
      var blob = await next; if (my !== session) return;
      current.index = i; if (i + 1 < chunks.length) next = synthHD(chunks[i + 1]);
      setState(btn, "speaking");
      var r = await playUrl(URL.createObjectURL(blob)); if (r === "cancelled") return;
    }
    if (my === session) finish(btn);
  }

  // ------------------------------------------------------------- one-time offer (non-installed visitors)
  function maybeOfferHD(btn) {
    if (ls.get(HD_KEY) || lowEnd() || document.getElementById("kr-hd-offer")) return;
    var box = document.createElement("div"); box.id = "kr-hd-offer"; box.setAttribute("role", "dialog");
    box.style.cssText = "margin-top:10px;padding:12px 14px;border-radius:10px;background:#eef6d9;color:#1f3d1a;font-size:.88rem;line-height:1.4;max-width:420px;";
    box.innerHTML = "<strong>Want a more natural voice?</strong><br>It downloads about 90&nbsp;MB once in the background (best on Wi-Fi) and your phone keeps working normally." +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" class="btn btn-primary btn-sm" data-hd="yes">Get natural voice</button><button type="button" class="btn btn-outline btn-sm" data-hd="no">No thanks</button></div>';
    btn.insertAdjacentElement("afterend", box);
    box.addEventListener("click", function (e) {
      var t = e.target.closest("[data-hd]"); if (!t) return;
      if (t.dataset.hd === "yes") { ls.set(AUTO_KEY, "on"); preload(); } else ls.set(HD_KEY, "no");
      box.remove();
    });
  }

  // ------------------------------------------------------------- control flow
  function stopAll() {
    session++; if (synth) synth.cancel(); try { player.pause(); } catch (e) {} if (cancelPlay) cancelPlay();
    if (current && current.btn) setState(current.btn, "idle"); current = null;
  }
  function finish(btn) { if (current && current.btn === btn) { setState(btn, "idle"); current = null; } }

  async function handleClick(btn) {
    var el = document.getElementById(btn.getAttribute("data-read-aloud")); if (!el) return;
    if (current && current.btn === btn) {
      if (btn.dataset.state === "speaking") {
        if (current.mode === "browser") { session++; if (synth) synth.cancel(); } else player.pause();
        current.paused = true; setState(btn, "paused");
      } else if (btn.dataset.state === "paused") {
        current.paused = false; setState(btn, "speaking");
        if (current.mode === "browser") { var my2 = ++session; runBrowser(btn, current.chunks, current.index, my2); } else player.play();
      }
      return;
    }
    stopAll();
    var my = ++session, chunks = toChunks(cleanText(el)); if (!chunks.length) return;
    current = { btn: btn, mode: "browser", chunks: chunks, index: 0, paused: false };
    setState(btn, "loading");
    var src = btn.getAttribute("data-audio") || el.getAttribute("data-audio");
    if (src) { try { await runFile(btn, src, my); return; } catch (e) { if (my !== session) return; } }
    if (hdUsable()) { try { await runHD(btn, chunks, 0, my); return; } catch (e) { if (my !== session) return; console.warn("HD voice unavailable, using browser voice", e); } }
    if (!synth) { setState(btn, "idle"); current = null; return; }
    current.mode = "browser"; setState(btn, "speaking"); runBrowser(btn, chunks, 0, my);
    if (!ls.get(HD_KEY)) maybeOfferHD(btn);
  }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-read-aloud]"); if (b) handleClick(b); });
  window.KR_READ = { init: function (b) { setState(b, "idle"); } };
  function init() { document.querySelectorAll("[data-read-aloud]").forEach(function (b) { setState(b, "idle"); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.addEventListener("pagehide", stopAll);

  // Installed app (or opted in earlier): fetch the natural voice quietly in the background.
  window.addEventListener("load", function () {
    var auto = ls.get(AUTO_KEY) !== "off";
    var installed = ls.get("kr_installed") === "1" || window.matchMedia("(display-mode: standalone)").matches;
    if (auto && (installed || ls.get(HD_KEY) === "1") && hdState !== "ready") {
      var go = function () { hdState === "cached" ? ensureWorker() && worker.postMessage({ type: "load" }) : preload(); };
      if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 6000 }); else setTimeout(go, 3000);
    }
  });
})();
