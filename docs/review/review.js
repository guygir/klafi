const KEY = "kalpi-review-done";

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
};

const save = (state) => localStorage.setItem(KEY, JSON.stringify(state));

const done = load();
const buttons = document.querySelectorAll("[data-slug]");
const total = 23;

buttons.forEach((el) => {
  const slug = el.getAttribute("data-slug");
  if (done[slug]) {
    el.classList.add("done");
    if (el.tagName === "BUTTON") el.textContent = "Reviewed";
  }
  if (el.tagName === "BUTTON") {
    el.addEventListener("click", () => {
      const state = load();
      state[slug] = !state[slug];
      save(state);
      el.textContent = state[slug] ? "Reviewed" : "Mark reviewed";
      el.classList.toggle("done", !!state[slug]);
    });
  }
});

const hub = document.getElementById("hub-progress");
if (hub) {
  const n = Object.values(load()).filter(Boolean).length;
  hub.textContent = `${n} / ${total} marked reviewed`;
}

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, iframe")) return;
  const next = document.getElementById("next-page");
  const prev = document.getElementById("prev-page");
  if (e.key === "ArrowRight" && next) { e.preventDefault(); location.href = next.href; }
  if (e.key === "ArrowLeft" && prev) { e.preventDefault(); location.href = prev.href; }
});
