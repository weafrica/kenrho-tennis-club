// Natural ("HD") voice engine. Runs in a Web Worker so loading and speaking never freeze the page.
var MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
var tts = null, loading = null;
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
self.onmessage = async function (e) {
  var m = e.data || {};
  try {
    if (m.type === "load") { await load(); self.postMessage({ type: "ready" }); }
    else if (m.type === "speak") {
      var engine = await load();
      var audio = await engine.generate(m.text, { voice: m.voice || "af_heart" });
      self.postMessage({ type: "audio", id: m.id, blob: audio.toBlob() });
    }
  } catch (err) { self.postMessage({ type: "error", id: m.id, message: String((err && err.message) || err) }); }
};
