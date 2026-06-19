export function clearDashboard() {
  ["stat-liters", "stat-total", "stat-avg-price"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "—";
  });
  const last = document.getElementById("stat-last");
  if (last) last.textContent = "—";
  const recent = document.getElementById("recent-transactions");
  if (recent) recent.innerHTML = '<li class="text-slate-500 text-sm text-center py-6">Nema podataka. Skenirajte prvi račun.</li>';
}

export function renderRecentTransactions(receipts) {
  const list = document.getElementById("recent-transactions");
  if (!list) return;

  if (!receipts.length) {
    list.innerHTML = '<li class="text-slate-500 text-sm text-center py-6">Nema podataka.</li>';
    return;
  }

  list.innerHTML = receipts.map((r) => `
    <li class="bg-surface-card border border-surface-border rounded-xl px-4 py-3 flex items-center justify-between">
      <div>
        <p class="font-medium text-sm">${r.station ?? "Nepoznata stanica"}</p>
        <p class="text-xs text-slate-400">${r.date ? new Date(r.date).toLocaleDateString("sr-RS") : "—"} · ${r.fuel_type ?? ""}</p>
      </div>
      <div class="text-right">
        <p class="font-semibold font-mono text-fuel-400">${r.total ? r.total.toFixed(0) + " RSD" : "—"}</p>
        <p class="text-xs text-slate-400">${r.liters ? r.liters.toFixed(1) + " L" : ""}</p>
      </div>
    </li>`).join("");
}