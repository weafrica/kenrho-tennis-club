// A small floating "Help" button available on every page that includes this
// script. Submits to support_messages, which admin/treasurer/secretary/
// chairman can see and reply to from the admin dashboard's Help tab.
(function () {
  function buildWidget() {
    const btn = document.createElement("button");
    btn.id = "help-widget-btn";
    btn.className = "btn btn-primary";
    btn.innerHTML = "💬 Help";
    btn.style.cssText = "position:fixed;right:16px;bottom:72px;z-index:79;box-shadow:0 8px 20px rgba(0,0,0,.25);border-radius:999px;";

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop hidden";
    backdrop.id = "help-widget-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <h3>Need help?</h3>
        <p class="muted small">Send a message to the club committee — admin, secretary, treasurer or chairman will get back to you.</p>
        <form id="help-widget-form">
          <div class="form-row"><label>Your name</label><input type="text" id="help-name" required /></div>
          <div class="form-row"><label>Your email (optional)</label><input type="email" id="help-email" /></div>
          <div class="form-row"><label>Message</label><textarea id="help-message" rows="4" required></textarea></div>
          <div class="flex gap-12 mt-16">
            <button type="submit" class="btn btn-primary" id="help-submit-btn">Send message</button>
            <button type="button" class="btn btn-outline" id="help-cancel-btn">Cancel</button>
          </div>
        </form>
        <div id="help-success" class="alert alert-info hidden mt-16">Thanks — someone from the club will get back to you soon.</div>
      </div>`;

    document.body.appendChild(btn);
    document.body.appendChild(backdrop);

    btn.addEventListener("click", () => backdrop.classList.remove("hidden"));
    backdrop.querySelector("#help-cancel-btn").addEventListener("click", () => backdrop.classList.add("hidden"));

    backdrop.querySelector("#help-widget-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const submitBtn = document.getElementById("help-submit-btn");
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
      try {
        const { data: { session } } = window.sb ? await window.sb.auth.getSession() : { data: { session: null } };
        const payload = {
          name: document.getElementById("help-name").value,
          email: document.getElementById("help-email").value || (session ? session.user.email : null),
          message: document.getElementById("help-message").value,
          member_id: session ? session.user.id : null,
        };
        const { error } = await window.sb.from("support_messages").insert(payload);
        if (error) throw error;
        backdrop.querySelector("#help-widget-form").classList.add("hidden");
        document.getElementById("help-success").classList.remove("hidden");
        setTimeout(() => {
          backdrop.classList.add("hidden");
          backdrop.querySelector("#help-widget-form").classList.remove("hidden");
          document.getElementById("help-success").classList.add("hidden");
          backdrop.querySelector("#help-widget-form").reset();
        }, 2500);
      } catch (err) {
        alert(err.message || "Could not send your message — please try again.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send message";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (window.sb) buildWidget();
  });
})();
