import { parseLocalReceiptDate } from "../dateUtil.js";

export function setScanStatus(message, type = "idle") {
  const el = document.getElementById("scan-status-text");
  if (!el) return;

  const colors = {
    idle: "text-slate-400",
    loading: "text-fuel-400 animate-pulse",
    success: "text-emerald-400",
    warning: "text-amber-400",
    error: "text-red-400",
  };

  el.className = colors[type] || colors.idle;
  el.textContent = message;
}

export function renderResultCard(data, state, errorMsg = "") {
  const card = document.getElementById("result-card");
  if (!card) return;

  if (state === "loading") {
    card.innerHTML = `<p class="text-fuel-400">Preuzimam podatke sa servera...</p>`;
    return;
  }

  if (state === "error") {
    card.innerHTML = `
      <p class="text-red-400 font-semibold">Greška pri obradi</p>
      <p class="text-slate-400 text-sm mt-1">${errorMsg || "Nepoznata greška."}</p>`;
    return;
  }

  const normalizedDateStr = parseLocalReceiptDate(data?.date);
  const parsedDate = new Date(normalizedDateStr);
  const date = !isNaN(parsedDate) ? parsedDate.toLocaleDateString("sr-RS") : "—";
  
  const locationText = [data?.address, data?.city].filter(Boolean).join(", ") || "Nepoznata lokacija";

  card.innerHTML = `
    <div class="flex items-start justify-between">
      <div class="flex-1 pr-2">
        <p class="font-semibold text-base leading-tight">${data?.station ?? "Nepoznata stanica"}</p>
        <p class="text-xs text-slate-400 mt-0.5">${locationText}</p>
        <p class="text-xs text-slate-500 mt-1">${date}</p>
      </div>
      <span class="bg-fuel-900 text-fuel-300 text-xs font-medium px-2 py-1 rounded-lg shrink-0">${data?.fuel_type ?? "—"}</span>
    </div>
    <div class="border-t border-surface-border pt-3 grid grid-cols-3 gap-3 text-center mt-3">
      <div>
        <p class="text-xs text-slate-400 mb-1">Litara</p>
        <p class="text-xl font-bold font-mono">${data?.liters ?? "—"}</p>
      </div>
      <div>
        <p class="text-xs text-slate-400 mb-1">Cena/L</p>
        <p class="text-xl font-bold font-mono">${data?.price_per_l ? data.price_per_l.toFixed(2) : "—"}</p>
      </div>
      <div>
        <p class="text-xs text-slate-400 mb-1">Ukupno</p>
        <p class="text-xl font-bold font-mono text-fuel-400">${data?.total ? data.total.toFixed(2) : "—"}</p>
      </div>
    </div>`;
}