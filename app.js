(() => {
  /* Empty = same site (Vercel). On Live Server, set <meta name="api-base"> in index.html to your deployed URL. */
  const API = ((document.querySelector('meta[name="api-base"]') || {}).content || "").replace(/\/$/, "");
  const $ = (s) => document.querySelector(s), form = $("#fb"), send = $("#send");
  const HINTS = ["Select a rating", "Poor", "Fair", "Okay", "Good", "Great"];
  const FIELDS = ["project", "rating", "category", "message", "email"];

  /* Deep links: ?project=solo2squad preselects the product; ?back=URL sets the Back link. */
  const q = new URLSearchParams(location.search);
  const pre = q.get("project") || q.get("from");
  const radio = pre && form.querySelector(`input[name=project][value="${CSS.escape(pre)}"]`);
  if (radio) radio.checked = true;
  try { const b = new URL(q.get("back") || "", location.href); if (/^https?:$/.test(b.protocol) && q.get("back")) { $("#back").href = b.href; $("#home").href = b.href; } } catch {}

  const val = (n) => (form.querySelector(`[name=${n}]:checked`) || {}).value || "";
  const setErr = (n, t) => {
    const e = $("#err-" + n); if (!e) return;
    e.hidden = !t; e.textContent = t || "";
    const c = form.elements[n]; (c && c.length === undefined ? [c] : []).forEach((x) => x.setAttribute("aria-invalid", t ? "true" : "false"));
  };
  const clearErrs = () => { [...FIELDS, "form"].forEach((n) => setErr(n, "")); };

  form.addEventListener("change", (e) => { if (e.target.name === "rating") $("#rhint").textContent = HINTS[+e.target.value] || HINTS[0]; if (FIELDS.includes(e.target.name)) setErr(e.target.name, ""); });
  $("#message").addEventListener("input", (e) => { $("#count").textContent = `${e.target.value.length} / 2000`; if (e.target.value.trim().length >= 10) setErr("message", ""); });

  function validate(d) {
    const f = {};
    if (!d.project) f.project = "Choose a product.";
    if (!d.rating) f.rating = "Choose a rating.";
    if (!d.category) f.category = "Choose a type.";
    if (d.message.trim().length < 10) f.message = "Please write at least 10 characters.";
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) f.email = "That email address does not look right.";
    return f;
  }
  const showFields = (f) => {
    Object.entries(f).forEach(([n, t]) => setErr(n, t));
    const first = FIELDS.find((n) => f[n]); if (!first) return;
    const el = first === "message" || first === "email" ? form.elements[first] : form.querySelector(`[name=${first}]`);
    el && el.focus(); el && el.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault(); clearErrs();
    const d = { project: val("project"), rating: +val("rating") || 0, category: val("category"), message: form.message.value, name: form.name.value, email: form.email.value.trim(), mayContact: form.mayContact.checked, website: form.website.value, referrer: document.referrer };
    const f = validate(d); if (Object.keys(f).length) return showFields(f);

    send.disabled = true; send.classList.add("busy"); send.querySelector(".lbl").textContent = "Sending";
    try {
      const r = await fetch(API + "/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { if (j.fields) showFields(j.fields); else setErr("form", (j.error || "Something went wrong. Please try again.") + (j.code ? ` (code: ${j.code})` : "")); if (j.error && j.fields) setErr("form", j.error); return; }
      $("#doneMsg").textContent = j.id ? `Your feedback was saved and sent to the team. Reference #${j.id}.` : "Your feedback was saved and sent to the team.";
      form.hidden = true; const done = $("#done"); done.hidden = false; done.focus();
    } catch { setErr("form", "Could not reach the server. Check your connection and try again."); }
    finally { send.disabled = false; send.classList.remove("busy"); send.querySelector(".lbl").textContent = "Send feedback"; }
  });

  $("#again").addEventListener("click", () => { form.reset(); $("#count").textContent = "0 / 2000"; $("#rhint").textContent = HINTS[0]; if (radio) radio.checked = true; $("#done").hidden = true; form.hidden = false; form.querySelector("input[type=radio]").focus(); });
})();
