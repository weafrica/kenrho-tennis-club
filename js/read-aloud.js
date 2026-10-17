// KenRho Park — read aloud (v5)
// WEBSITE (browser tab): reads with the phone / computer's own voice — instant, nothing to download.
// INSTALLED APP: uses the natural (HD) voice. It starts preparing the moment the app opens (same time as the page), in a
// background worker so nothing freezes, and is saved on the phone after the first download.
// Any button with  data-read-aloud="element-id"  reads that element out. Voice tiers:
//   1. PRE-RECORDED  data-audio="audio/welcome.mp3"
//   2. NATURAL VOICE (Kokoro) — downloads ONCE, automatically, in a background worker; saved on the phone and reused
//      forever. It never blocks the page. If a sentence is slow, the phone's own voice covers it so there is no silence.
//   3. PHONE VOICE   data-voice="system" forces this tier (used by Help me). Also the instant fallback.
// Reading is queued as whole passages, so it does not stop at every full stop.
(function () {
  "use strict";
  window.__krReadAloud = true;
  var synth = window.speechSynthesis || null;
  var READY_KEY = "kr_hd_ready", AUDIO_CACHE = "kr-audio-v1", HD_VOICE = window.KR_HD_VOICE_NAME || "af_heart";
  var me = document.currentScript || document.querySelector('script[src*="read-aloud.js"]');
  var WORKER_URL = (me && me.src ? me.src.replace(/read-aloud\.js.*$/, "") : "js/") + "voice-worker.js";
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  function isApp() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
  var player = new Audio(), session = 0, cancelPlay = null, current = null, cachedVoice = null, live = [], stallTimer = null, keepAlive = null;

  // ------------------------------------------------------------- natural voice: one download, then reuse
  var worker = null, hdState = "idle"; // idle | loading | ready | failed
  var pending = {}, nextId = 1, pill = null, firstDownload = false;
  function lowEnd() {
    var c = navigator.connection || {};
    return !!(c.saveData || /(^|-)2g$/.test(c.effectiveType || "") || (typeof navigator.deviceMemory === "number" && navigator.deviceMemory < 3) || typeof Worker === "undefined");
  }
  function hasModelCache() {
    if (!("caches" in window)) return Promise.resolve(false);
    return caches.keys().then(function (ks) { return ks.some(function (k) { return /transformers/i.test(k); }); }).catch(function () { return false; });
  }
  function ensureWorker() {
    if (worker || hdState === "failed") return worker;
    try { worker = new Worker(WORKER_URL, { type: "module" }); } catch (e) { hdState = "failed"; return null; }
    worker.onmessage = function (e) {
      var m = e.data || {};
      if (m.type === "progress") { if (firstDownload) showPill("Preparing natural voice " + m.pct + "%"); }
      else if (m.type === "ready") { hdState = "ready"; ls.set(READY_KEY, "1"); hidePill(); }
      else if (m.type === "audio" && pending[m.id]) { pending[m.id].resolve(m.blob); delete pending[m.id]; }
      else if (m.type === "error") {
        if (m.id && pending[m.id]) { pending[m.id].reject(new Error(m.message)); delete pending[m.id]; }
        else { hdState = "failed"; hidePill(); }
      }
    };
    worker.onerror = function () { hdState = "failed"; hidePill(); };
    return worker;
  }
  // start (or resume) preparing the voice; silent when it is already saved on the device
  function prepare(force) {
    if (!force && !isApp()) return;   // the website uses the phone's voice; only the installed app prepares the natural one
    if (lowEnd() || hdState === "ready" || hdState === "loading" || hdState === "failed") return;
    if (!ensureWorker()) return;
    hdState = "loading"; firstDownload = ls.get(READY_KEY) !== "1";
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    if (firstDownload) showPill("Preparing natural voice…");
    worker.postMessage({ type: "load" });
  }
  function synthHD(text) {
    return new Promise(function (resolve, reject) {
      var w = ensureWorker(); if (!w) return reject(new Error("no worker"));
      var id = nextId++; pending[id] = { resolve: resolve, reject: reject }; w.postMessage({ type: "speak", id: id, text: text, voice: HD_VOICE });
    });
  }
  function showPill(t) {
    if (!pill) { pill = document.createElement("div"); pill.style.cssText = "position:fixed;left:12px;bottom:calc(64px + env(safe-area-inset-bottom,0px));z-index:78;background:#1f3d1a;color:#fff;font:600 .78rem system-ui,sans-serif;padding:7px 12px;border-radius:99px;box-shadow:0 6px 16px rgba(0,0,0,.25);pointer-events:none"; (document.body || document.documentElement).appendChild(pill); }
    pill.textContent = t; pill.style.display = "block";
  }
  function hidePill() { if (pill) pill.style.display = "none"; }
  window.KR_VOICE = { preload: function () { prepare(true); }, status: function () { return { state: hdState, lowEnd: lowEnd(), app: isApp() }; } };

  // ------------------------------------------------------------- helpers
  function setState(btn, state, extra) {
    var label = btn.getAttribute("data-label") || "Read aloud";
    var map = { idle: ["🔊", label], loading: ["⏳", extra || "Preparing…"], speaking: ["⏸", "Pause"], paused: ["▶", "Resume"] };
    var m = map[state] || map.idle; btn.innerHTML = m[0] + " " + m[1]; btn.dataset.state = state; btn.setAttribute("aria-label", m[1]);
  }
  function cleanText(el) { return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(); }
  // whole passages: a few sentences per piece, queued together so the voice flows
  function toChunks(text, max) {
    var sentences = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [text], out = [], cur = "";
    sentences.forEach(function (s) {
      s = s.trim(); if (!s) return;
      if (cur && (cur + " " + s).length > max) { out.push(cur); cur = ""; }
      while (s.length > max) { var cut = s.lastIndexOf(",", max); if (cut < 60) cut = s.lastIndexOf(" ", max); if (cut < 30) cut = max; cur = (cur ? cur + " " : "") + s.slice(0, cut + 1).trim(); out.push(cur); cur = ""; s = s.slice(cut + 1).trim(); }
      cur = cur ? cur + " " + s : s;
    });
    if (cur) out.push(cur); return out;
  }

  // ------------------------------------------------------------- phone voice
  function scoreVoice(v) {
    var n = (v.name || "").toLowerCase(), l = (v.lang || "").toLowerCase().replace("_", "-");
    if (l.indexOf("en") !== 0) return -1000;
    var s = 0;
    if (/online \(natural\)|neural|natural/.test(n)) s += 100; if (/premium|enhanced/.test(n)) s += 85; if (/siri/.test(n)) s += 70; if (/google/.test(n)) s += 60;
    if (/samantha|daniel|karen|moira|tessa|serena|jenny|aria|leah|libby|sonia/.test(n)) s += 35; if (/espeak|compact|novelty|zarvox|whisper|bad news|bells|boing/.test(n)) s -= 80;
    if (l === "en-za") s += 30; else if (l === "en-gb") s += 20; else if (l === "en-us") s += 15; if (v.localService) s += 4; return s;
  }
  function bestVoice() { if (!synth) return null; var vs = synth.getVoices(); if (!vs.length) return null; var b = null, bs = -Infinity; vs.forEach(function (v) { var sc = scoreVoice(v); if (sc > bs) { b = v; bs = sc; } }); return b; }
  function getVoice() { return cachedVoice || (cachedVoice = bestVoice()); }
  if (synth && synth.addEventListener) synth.addEventListener("voiceschanged", function () { cachedVoice = bestVoice(); });
  if (synth) { try { synth.cancel(); } catch (e) {} }   // wakes a sleeping engine (first speak() on desktop can be swallowed)
  function clearTimers() { clearTimeout(stallTimer); stallTimer = null; if (keepAlive) { clearInterval(keepAlive); keepAlive = null; } }
  function speakOne(text) {
    return new Promise(function (resolve) {
      var u = new SpeechSynthesisUtterance(text), v = getVoice(); if (v) { u.voice = v; u.lang = v.lang; } u.rate = 0.97; live.push(u);
      var done = false, fin = function () { if (!done) { done = true; clearTimeout(t); resolve(); } }, t = setTimeout(fin, text.length * 90 + 4000);
      u.onend = fin; u.onerror = fin; synth.speak(u);
    });
  }
  // queue every chunk at once so the engine never waits for us between sentences
  function runBrowser(btn, chunks, start, my) {
    if (!synth) { finish(btn); return; }
    synth.cancel(); clearTimers(); live = [];
    chunks.slice(start).forEach(function (t, k) {
      var idx = start + k, last = idx === chunks.length - 1, u = new SpeechSynthesisUtterance(t), v = getVoice();
      if (v) { u.voice = v; u.lang = v.lang; } u.rate = 0.97; u.pitch = 1; live.push(u);
      u.onstart = function () {
        if (my !== session) return; current.index = idx; clearTimeout(stallTimer);
        // if the engine goes quiet without telling us (a known browser bug), carry on from the next piece
        stallTimer = setTimeout(function () { if (my === session && !current.paused) runBrowser(btn, chunks, idx + 1, my); }, t.length * 95 + 5000);
      };
      u.onend = function () { if (my === session && last) { clearTimers(); finish(btn); } };
      u.onerror = function (e) { if (e && (e.error === "canceled" || e.error === "interrupted")) return; if (my === session && last) { clearTimers(); finish(btn); } };
      synth.speak(u);
    });
    if (!isMobile) keepAlive = setInterval(function () { if (my !== session) return clearTimers(); if (current && current.paused) return; if (synth.speaking) { synth.pause(); synth.resume(); } }, 5000);
  }

  // ------------------------------------------------------------- recorded audio / natural voice playback
  function playUrl(url) {
    return new Promise(function (resolve, reject) {
      player.onended = function () { cancelPlay = null; resolve(); }; player.onerror = function () { cancelPlay = null; reject(new Error("audio error")); };
      cancelPlay = function () { cancelPlay = null; resolve("cancelled"); }; player.src = url; var p = player.play(); if (p && p.catch) p.catch(function (e) { cancelPlay = null; reject(e); });
    });
  }
  async function cachedFileUrl(url) {
    if (!("caches" in window)) return url;
    var cache = await caches.open(AUDIO_CACHE), res = await cache.match(url);
    if (!res) { var fresh = await fetch(url); if (!fresh.ok) throw new Error("missing"); await cache.put(url, fresh.clone()); res = fresh; }
    return URL.createObjectURL(await res.blob());
  }
  async function runFile(btn, src, my) { var url = await cachedFileUrl(src); if (my !== session) return; current.mode = "audio"; setState(btn, "speaking"); var r = await playUrl(url); if (r !== "cancelled" && my === session) finish(btn); }
  // natural voice with a safety net: if a sentence takes too long, the phone voice reads it so there is never a long silence
  async function runHD(btn, chunks, start, my) {
    current.mode = "hd"; setState(btn, "speaking");
    var jobs = {}, ahead = 3;
    var request = function (i) { if (i < chunks.length && !jobs[i]) { jobs[i] = synthHD(chunks[i]); jobs[i].catch(function () {}); } };
    for (var k = 0; k < ahead; k++) request(start + k);
    for (var i = start; i < chunks.length; i++) {
      if (my !== session) return; current.index = i; request(i + ahead);
      var blob = await Promise.race([jobs[i].catch(function () { return null; }), new Promise(function (r) { setTimeout(function () { r(null); }, i === start ? 9000 : 6000); })]);
      if (my !== session) return;
      if (blob) { var r = await playUrl(URL.createObjectURL(blob)); if (r === "cancelled") return; }
      else if (synth) { await speakOne(chunks[i]); if (my !== session) return; }
    }
    if (my === session) finish(btn);
  }

  // ------------------------------------------------------------- control
  function stopAll() { session++; clearTimers(); if (synth) synth.cancel(); try { player.pause(); } catch (e) {} if (cancelPlay) cancelPlay(); if (current && current.btn) setState(current.btn, "idle"); current = null; }
  function finish(btn) { if (current && current.btn === btn) { setState(btn, "idle"); current = null; } clearTimers(); }
  async function handleClick(btn) {
    var el = document.getElementById(btn.getAttribute("data-read-aloud")); if (!el) return;
    if (current && current.btn === btn) {
      if (btn.dataset.state === "speaking") {
        current.paused = true; setState(btn, "paused");
        if (current.mode === "browser") { if (isMobile) { session++; clearTimers(); synth.cancel(); } else synth.pause(); } else player.pause();
      } else if (btn.dataset.state === "paused") {
        current.paused = false; setState(btn, "speaking");
        if (current.mode === "browser") { if (isMobile) runBrowser(btn, current.chunks, current.index, ++session); else synth.resume(); } else player.play();
      }
      return;
    }
    stopAll();
    var my = ++session, text = cleanText(el); if (!text) return;
    var forceSystem = btn.getAttribute("data-voice") === "system", src = btn.getAttribute("data-audio") || el.getAttribute("data-audio");
    var useHD = !forceSystem && !src && isApp() && hdState === "ready" && !!ensureWorker();   // browser tab = phone voice, installed app = natural voice
    var chunks = toChunks(text, useHD ? 240 : 380);
    current = { btn: btn, mode: useHD ? "hd" : "browser", chunks: chunks, index: 0, paused: false };
    setState(btn, "loading");
    if (src) { try { await runFile(btn, src, my); return; } catch (e) { if (my !== session) return; } }
    if (useHD) { try { await runHD(btn, chunks, 0, my); return; } catch (e) { if (my !== session) return; } }
    current.mode = "browser"; setState(btn, "speaking"); runBrowser(btn, chunks, 0, my);
  }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-read-aloud]"); if (b) handleClick(b); });
  window.KR_READ = { init: function (b) { setState(b, "idle"); }, stop: stopAll };
  function init() { document.querySelectorAll("[data-read-aloud]").forEach(function (b) { setState(b, "idle"); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.addEventListener("pagehide", stopAll);

  // Installed app: start preparing the natural voice immediately — at the same time as the page loads (it runs in a worker, so the
  // page is never blocked). First launch downloads it (about 90 MB); every launch after that just reuses the saved copy.
  window.addEventListener("appinstalled", function () { prepare(true); });
  if (isApp() && !lowEnd()) {
    prepare(true);
    hasModelCache().then(function (cached) { if (cached) ls.set(READY_KEY, "1"); });
  }
})();
