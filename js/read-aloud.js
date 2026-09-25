// Lets visitors have any "read aloud" block on the page read out loud —
// handy for announcements, especially for members who'd rather listen than
// read on a phone. Uses the browser's built-in Web Speech API, so it needs
// no server, no API key, and works offline once the page is loaded.
(function () {
  const synth = window.speechSynthesis;
  if (!synth) return; // unsupported browser: buttons just won't be added

  // Picks the most natural-sounding voice the visitor's browser/OS happens
  // to ship. Left to its own devices, speechSynthesis often defaults to a
  // flat robotic system voice even when a far better one is installed, so
  // we go looking for one instead of just taking index 0.
  let cachedVoice = null;
  function bestAvailableVoice() {
    const voices = synth.getVoices();
    if (!voices.length) return null;

    // Known good, natural-sounding voices worth asking for by name first.
    const wishlist = [
      "Google UK English Female",
      "Google US English",
      "Microsoft Aria Online (Natural)",
      "Microsoft Jenny Online (Natural)",
      "Samantha",
    ];
    for (const wanted of wishlist) {
      const hit = voices.find((v) => v.name.indexOf(wanted) !== -1);
      if (hit) return hit;
    }
    // Otherwise, prefer any English voice local to the device (usually
    // clearer than a remote/network voice on a shaky connection).
    const enLocal = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("en") && v.localService);
    if (enLocal) return enLocal;
    const enAny = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
    return enAny || voices[0];
  }
  function getVoice() {
    if (!cachedVoice) cachedVoice = bestAvailableVoice();
    return cachedVoice;
  }
  // Voice lists load asynchronously in some browsers — refresh the cache
  // once they're actually available.
  synth.addEventListener?.("voiceschanged", () => { cachedVoice = bestAvailableVoice(); });

  let currentBtn = null;
  let currentUtterance = null;

  function setButtonState(btn, state) {
    // state: "idle" | "speaking" | "paused"
    const icon = { idle: "🔊", speaking: "⏸", paused: "▶" }[state];
    const label = { idle: "Read aloud", speaking: "Pause", paused: "Resume" }[state];
    btn.innerHTML = `${icon} ${label}`;
    btn.dataset.state = state;
  }

  function stopAll() {
    synth.cancel();
    if (currentBtn) setButtonState(currentBtn, "idle");
    currentBtn = null;
    currentUtterance = null;
  }

  function handleClick(btn) {
    const targetId = btn.getAttribute("data-read-aloud");
    const textEl = document.getElementById(targetId);
    if (!textEl) return;

    // Clicking the button that's already speaking toggles pause/resume.
    if (currentBtn === btn) {
      if (btn.dataset.state === "speaking") {
        synth.pause();
        setButtonState(btn, "paused");
      } else if (btn.dataset.state === "paused") {
        synth.resume();
        setButtonState(btn, "speaking");
      }
      return;
    }

    // Starting a new one stops whatever else was playing.
    stopAll();
    const utter = new SpeechSynthesisUtterance(textEl.innerText || textEl.textContent);
    utter.rate = 0.98;
    const voice = getVoice();
    if (voice) utter.voice = voice;
    utter.onend = () => { if (currentBtn === btn) { setButtonState(btn, "idle"); currentBtn = null; } };
    utter.onerror = () => { if (currentBtn === btn) { setButtonState(btn, "idle"); currentBtn = null; } };
    currentBtn = btn;
    currentUtterance = utter;
    setButtonState(btn, "speaking");
    synth.speak(utter);
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-read-aloud]");
    if (btn) handleClick(btn);
  });

  document.querySelectorAll("[data-read-aloud]").forEach((btn) => setButtonState(btn, "idle"));
  window.addEventListener("beforeunload", stopAll);
})();
