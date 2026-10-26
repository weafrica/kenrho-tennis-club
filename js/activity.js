// User activity: a fire-and-forget log (pattern copied from the weafrica activity log). Never blocks or breaks the feature it is attached to.
(function () {
  "use strict";
  var sb = window.sb; if (!sb || window.KR_ACT) return;
  window.KR_ACT = {
    log: function (event, target, meta) { try { sb.rpc("log_activity", { p_event: event, p_target: target || null, p_meta: meta || {} }).then(function () {}, function () {}); } catch (e) {} },
  };
  // staff sign-ins are recorded once per browser session
  try {
    sb.auth.onAuthStateChange(function (ev, session) {
      if (ev !== "SIGNED_IN" || !session || sessionStorage.getItem("kr_act_signin")) return; sessionStorage.setItem("kr_act_signin", "1");
      sb.from("profiles").select("role").eq("id", session.user.id).single().then(function (r) { if (r.data && r.data.role && r.data.role !== "member") window.KR_ACT.log("signed in", r.data.role, {}); }, function () {});
    });
  } catch (e) {}
})();
