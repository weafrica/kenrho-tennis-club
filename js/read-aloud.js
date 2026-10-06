// KenRho Park — read aloud (v2)
//
// Any button with  data-read-aloud="some-element-id"  reads that element out.
// Three voice tiers, best available wins, and every tier falls back to the next:
//
//   1. PRE-RECORDED  <button data-read-aloud="id" data-audio="audio/welcome.mp3">
//      A real recorded/synthesised file served from the site itself. Best quality,
//      instant, tiny (mono MP3). Cached on the device after the first play, so a
//      repeat listen costs no data at all. (Same idea as the Stories narration.)
//
//   2. HD VOICE (opt-in)  Kokoro neural voice running 100% in the visitor's
//      browser. One-time ~90 MB model download from Hugging Face (NOT from this
//      site and NOT from Supabase), cached by the browser afterwards. Never starts
//      without the visitor saying yes, because it's real mobile data.
//
//   3. BROWSER VOICE  The best voice the device ships (Edge "Natural", Apple
//      Premium/Enhanced, Google...), preferring South African / UK English, read
//      sentence-by-sentence so it never cuts out mid-announcement.
(function () {
  "use strict";

  var synth = window.speechSynthesis || null;
  var HD_KEY = "kr_hd_voice";            // "1" = enabled, "no" = declined
  var AUDIO_CACHE = "kr-audio-v1";
  var KOKORO_URL = "https://esm.sh/kokoro-js@1.2.1";
  var KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
  var HD_VOICE = window.KR_HD_VOICE_NAME || "af_heart";

  var player = new Audio();
  var session = 0;            // bumps on every stop/pause/start so stale loops exit
  var cancelPlay = null;      // resolves the audio element wait when stopped
  var current = null;         // { btn, mode, chunks, index, paused }
  var hdEngine = null, hdLoading = null, hdFailed = false;
  var cachedVoice = null;

  // ------------------------------------------------------------- helpers
  function setState(btn, state, extra) {
    var map = {
      idle:    ["🔊", "Read aloud"],
      loading: ["⏳", extra || "Loading voice…"],
      speaking:["⏸", "Pause"],
      paused:  ["▶", "Resume"]
    };
    var m = map[state] || map.idle;
    btn.innerHTML = m[0] + " " + m[1];
    btn.dataset.state = state;
    btn.setAttribute("aria-label", m[1]);
  }

  function cleanText(el) {
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  // Sentence chunks (<= ~220 chars). Chrome silently stops long utterances after
  // ~15 s, and chunking also gives natural pauses and reliable pause/resume.
  function toChunks(text) {
    var sentences = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [text];
    var out = [];
    sentences.forEach(function (s) {
      s = s.trim();
      while (s.length > 220) {
        var cut = s.lastIndexOf(",", 220);
        if (cut < 80) cut = s.lastIndexOf(" ", 220);
        if (cut < 40) cut = 220;
        out.push(s.slice(0, cut + 1).trim());
        s = s.slice(cut + 1).trim();
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
    if (/online \(natural\)|neural|natural/.test(n)) s += 100;     // Edge / Windows natural voices
    if (/premium|enhanced/.test(n)) s += 85;                        // Apple downloaded voices
    if (/siri/.test(n)) s += 70;
    if (/google/.test(n)) s += 60;
    if (/samantha|daniel|karen|moira|tessa|serena|jenny|aria|leah|libby|sonia/.test(n)) s += 35;
    if (/espeak|compact|novelty|zarvox|whisper|bad news|bells|boing/.test(n)) s -= 80;
    if (l === "en-za") s += 30; else if (l === "en-gb") s += 20; else if (l === "en-us") s += 15;
    if (v.localService) s += 4;
    return s;
  }
  function bestVoice() {
    if (!synth) return null;
    var voices = synth.getVoices();
    if (!voices.length) return null;
    var best = null, bestScore = -Infinity;
    voices.forEach(function (v) { var sc = scoreVoice(v); if (sc > bestScore) { best = v; bestScore = sc; } });
    return best;
  }
  function getVoice() { return cachedVoice || (cachedVoice = bestVoice()); }
  if (synth && synth.addEventListener) {
    synth.addEventListener("voiceschanged", function () { cachedVoice = bestVoice(); });
  }

  function speakChunk(text) {
    return new Promise(function (resolve, reject) {
      var u = new SpeechSynthesisUtterance(text);
      var v = getVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = 0.97; u.pitch = 1;
      u.onend = function () { resolve(); };
      u.onerror = function (e) {
        if (e && (e.error === "canceled" || e.error === "interrupted")) resolve("cancelled");
        else reject(e);
      };
      synth.speak(u);
    });
  }

  async function runBrowser(btn, chunks, start, my) {
    for (var i = start; i < chunks.length; i++) {
      if (my !== session) return;
      current.index = i;
      try { await speakChunk(chunks[i]); } catch (e) { break; }
    }
    if (my === session) finish(btn);
  }

  // ------------------------------------------------------------- audio element
  function playUrl(url) {
    return new Promise(function (resolve, reject) {
      player.onended = function () { cancelPlay = null; resolve(); };
      player.onerror = function () { cancelPlay = null; reject(new Error("audio error")); };
      cancelPlay = function () { cancelPlay = null; resolve("cancelled"); };
      player.src = url;
      var p = player.play();
      if (p && p.catch) p.catch(function (e) { cancelPlay = null; reject(e); });
    });
  }

  // ------------------------------------------------------------- tier 1: files
  async function cachedFileUrl(url) {
    if (!("caches" in window)) return url;
    try {
      var cache = await caches.open(AUDIO_CACHE);
      var res = await cache.match(url);
      if (!res) {
        var fresh = await fetch(url);
        if (!fresh.ok) throw new Error("missing");
        await cache.put(url, fresh.clone());
        res = fresh;
      }
      return URL.createObjectURL(await res.blob());
    } catch (e) { throw e; }
  }
  async function runFile(btn, src, my) {
    var url = await cachedFileUrl(src);          // throws if the file isn't there
    if (my !== session) return;
    current.mode = "audio";
    setState(btn, "speaking");
    var r = await playUrl(url);
    if (r !== "cancelled" && my === session) finish(btn);
  }

  // ------------------------------------------------------------- tier 2: HD voice
  function hdEnabled() { return localStorage.getItem(HD_KEY) === "1" && !hdFailed; }

  function loadHD(btn) {
    if (hdEngine) return Promise.resolve(hdEngine);
    if (hdLoading) return hdLoading;
    var files = {};
    hdLoading = (async function () {
      var mod = await import(KOKORO_URL);
      var tts = await mod.KokoroTTS.from_pretrained(KOKORO_MODEL, {
        dtype: "q8", device: "wasm",
        progress_callback: function (p) {
          if (p && p.file && typeof p.total === "number" && p.total > 0) {
            files[p.file] = { l: p.loaded || 0, t: p.total };
            var l = 0, t = 0;
            Object.keys(files).forEach(function (k) { l += files[k].l; t += files[k].t; });
            if (t > 0 && btn && btn.dataset.state === "loading") {
              setState(btn, "loading", "Downloading voice " + Math.min(99, Math.round((l / t) * 100)) + "%");
            }
          }
        }
      });
      hdEngine = tts;
      return tts;
    })();
    hdLoading.catch(function () { hdLoading = null; hdFailed = true; });
    return hdLoading;
  }

  async function runHD(btn, chunks, start, my) {
    setState(btn, "loading");
    var tts = await loadHD(btn);
    if (my !== session) return;
    current.mode = "hd";
    var gen = async function (t) { var a = await tts.generate(t, { voice: HD_VOICE }); return a.toBlob(); };
    var next = gen(chunks[start]);
    for (var i = start; i < chunks.length; i++) {
      if (my !== session) return;
      var blob = await next;
      if (my !== session) return;
      current.index = i;
      if (i + 1 < chunks.length) next = gen(chunks[i + 1]);   // synthesise next while this plays
      setState(btn, "speaking");
      var r = await playUrl(URL.createObjectURL(blob));
      if (r === "cancelled") return;
    }
    if (my === session) finish(btn);
  }

  // ------------------------------------------------------------- HD opt-in prompt
  function maybeOfferHD(btn) {
    if (localStorage.getItem(HD_KEY)) return;                         // already decided
    var c = navigator.connection || {};
    if (c.saveData || /(^|-)2g$/.test(c.effectiveType || "")) return;  // don't nag on data saver / slow links
    if (typeof navigator.deviceMemory === "number" && navigator.deviceMemory < 4) return;
    if (document.getElementById("kr-hd-offer")) return;
    var box = document.createElement("div");
    box.id = "kr-hd-offer";
    box.setAttribute("role", "dialog");
    box.style.cssText = "margin-top:10px;padding:12px 14px;border-radius:10px;background:#eef6d9;color:#1f3d1a;font-size:.88rem;line-height:1.4;max-width:420px;";
    box.innerHTML =
      "<strong>Want a more natural voice?</strong><br>" +
      "HD voice downloads about 90&nbsp;MB once (best on Wi-Fi) and then works every time." +
      "<div style=\"display:flex;gap:8px;margin-top:10px;flex-wrap:wrap\">" +
      "<button type=\"button\" class=\"btn btn-primary btn-sm\" data-hd=\"yes\">Get HD voice</button>" +
      "<button type=\"button\" class=\"btn btn-outline btn-sm\" data-hd=\"no\">No thanks</button></div>";
    btn.insertAdjacentElement("afterend", box);
    box.addEventListener("click", function (e) {
      var t = e.target.closest("[data-hd]");
      if (!t) return;
      if (t.dataset.hd === "yes") { localStorage.setItem(HD_KEY, "1"); box.remove(); handleClick(btn, true); }
      else { localStorage.setItem(HD_KEY, "no"); box.remove(); }
    });
  }

  // ------------------------------------------------------------- control flow
  function stopAll() {
    session++;
    if (synth) synth.cancel();
    try { player.pause(); } catch (e) {}
    if (cancelPlay) cancelPlay();
    if (current && current.btn) setState(current.btn, "idle");
    current = null;
  }
  function finish(btn) {
    if (current && current.btn === btn) { setState(btn, "idle"); current = null; }
  }

  async function handleClick(btn, forceRestart) {
    var targetId = btn.getAttribute("data-read-aloud");
    var el = document.getElementById(targetId);
    if (!el) return;

    // Same button: pause / resume
    if (current && current.btn === btn && !forceRestart) {
      if (btn.dataset.state === "speaking") {
        if (current.mode === "browser") { session++; if (synth) synth.cancel(); }
        else player.pause();
        current.paused = true; setState(btn, "paused");
      } else if (btn.dataset.state === "paused") {
        current.paused = false; setState(btn, "speaking");
        if (current.mode === "browser") { var my2 = ++session; runBrowser(btn, current.chunks, current.index, my2); }
        else player.play();
      }
      return;
    }

    stopAll();
    var my = ++session;
    var chunks = toChunks(cleanText(el));
    if (!chunks.length) return;
    current = { btn: btn, mode: "browser", chunks: chunks, index: 0, paused: false };
    setState(btn, "loading", "Preparing…");

    // Tier 1: pre-recorded file
    var src = btn.getAttribute("data-audio") || el.getAttribute("data-audio");
    if (src) {
      try { await runFile(btn, src, my); return; } catch (e) { if (my !== session) return; }
    }
    // Tier 2: HD voice (only if the visitor opted in)
    if (hdEnabled()) {
      try { await runHD(btn, chunks, 0, my); return; }
      catch (e) { if (my !== session) return; console.warn("HD voice unavailable, using browser voice", e); }
    }
    // Tier 3: best browser voice
    if (!synth) { setState(btn, "idle"); current = null; return; }
    current.mode = "browser";
    setState(btn, "speaking");
    runBrowser(btn, chunks, 0, my);
    if (!localStorage.getItem(HD_KEY)) maybeOfferHD(btn);
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-read-aloud]");
    if (btn) handleClick(btn);
  });

  function init() {
    document.querySelectorAll("[data-read-aloud]").forEach(function (b) { setState(b, "idle"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.addEventListener("pagehide", stopAll);
})();
