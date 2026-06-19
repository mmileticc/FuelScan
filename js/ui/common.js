import { clearDashboard } from "./dashboard.js";

export const SCREENS = ["dashboard", "scan", "history", "result", "statistics"];

export function showToast(message, type = "info", duration = 3000) {
  const toast = document.getElementById("toast");
  const inner = document.getElementById("toast-inner");

  const styles = {
    info: "bg-slate-800 border-slate-600 text-white",
    success: "bg-emerald-900 border-emerald-600 text-emerald-100",
    warning: "bg-amber-900 border-amber-600 text-amber-100",
    error: "bg-red-900 border-red-600 text-red-100",
  };

  inner.className = `text-sm px-4 py-3 rounded-xl shadow-xl text-center border ${styles[type] || styles.info}`;
  inner.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.add("hidden"), duration);
}

export function showScreen(name) {
  SCREENS.forEach((id) => {
    const el = document.getElementById(`screen-${id}`);
    if (el) el.classList.toggle("hidden", id !== name);
  });

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    const active = tab.dataset.target === name;
    tab.classList.toggle("text-fuel-400", active && !tab.classList.contains("bg-fuel-600"));
    tab.classList.toggle("text-slate-400", !active && !tab.classList.contains("bg-fuel-600"));
  });
}

export function handleSignedInUI(user) {
  document.getElementById("btn-login")?.classList.add("hidden");
  const userInfo = document.getElementById("user-info");
  userInfo?.classList.remove("hidden");
  userInfo?.classList.add("flex");

  const avatar = document.getElementById("user-avatar");
  if (avatar) avatar.src = user.user_metadata?.avatar_url || "./assets/default-avatar.png";

  const greeting = document.getElementById("greeting-name");
  if (greeting) greeting.textContent = user.user_metadata?.full_name?.split(" ")[0] || "Korisnik";
}

export function handleSignedOutUI() {
  document.getElementById("btn-login")?.classList.remove("hidden");
  const userInfo = document.getElementById("user-info");
  userInfo?.classList.add("hidden");
  userInfo?.classList.remove("flex");

  const greeting = document.getElementById("greeting-name");
  if (greeting) greeting.textContent = "Korisnik";

  clearDashboard();
}