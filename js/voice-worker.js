// Natural ("HD") voice engine. Runs in a Web Worker so loading and speaking never freeze the page.
// The model is stored in the browser's cache after the first download, so it is only ever downloaded once.
var MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
var tts = null, loading = null, chain = Promise.resolve();
function load() {
  if (tts) return Promise.resolve(tts);
  if (!loading) {
    loading = (async function () {
      var mod = await import("https://esm.sh/kokoro-js@1.2.1");
      var files = {};
      tts = await mod.KokoroTTS.from_pretrained(MODEL, {
        dtype: "q8", device: "wasm",
        progress_callback: function (p) {
          if (p && p.file && typeof p.total === "number" && p.total > 0) {
            files[p.file] = { l: p.loaded || 0, t: p.total };
            var l = 0, t = 0; for (var k in files) { l += files[k].l; t += files[k].t; }
            if (t > 0) self.postMessage({ type: "progress", pct: Math.min(99, Math.round((l / t) * 100)) });
          }
        },
      });
      return tts;
    })();
    loading.catch(function () { loading = null; });
  }
  return loading;
}
self.onmessage = function (e) {
  var m = e.data || {};
  if (m.type === "load") {
    load().then(function () { self.postMessage({ type: "ready" }); }, function (err) { self.postMessage({ type: "error", message: String((err && err.message) || err) }); });
  } else if (m.type === "speak") {
    // one sentence at a time, in order, so the engine is never asked to do two things at once
    chain = chain.then(function () { return load(); }).then(function (engine) { return engine.generate(m.text, { voice: m.voice || "af_heart" }); })
      .then(function (audio) { self.postMessage({ type: "audio", id: m.id, blob: audio.toBlob() }); })
      .catch(function (err) { self.postMessage({ type: "error", id: m.id, message: String((err && err.message) || err) }); });
  }
};
