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

export function getMonthlyComparison(receipts) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // Poboljšano filtriranje: proveravamo da li datum uopšte postoji
    const filterByMonth = (m, y) => receipts.filter(r => {
        if (!r.date) return false;
        const d = new Date(r.date);
        // Ako je datum nevalidan, preskoči
        if (isNaN(d.getTime())) return false; 
        return d.getMonth() === m && d.getFullYear() === y;
    });

    const thisMonth = filterByMonth(currentMonth, currentYear);
    const lastMonth = filterByMonth(prevMonth, prevMonthYear);

    // OVO JE KLJUČNO: Proveri konzolu (F12) da vidiš šta aplikacija vidi
    console.log("Računi ovog meseca:", thisMonth.length, thisMonth);
    console.log("Računi prošlog meseca:", lastMonth.length, lastMonth);

    // Pronađi ovaj deo u funkciji getMonthlyComparison i izmeni ga ovako:
    const calcTotal = (arr, key) => arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);

    const thisSpent = calcTotal(thisMonth, 'total'); // Bilo je 'price', sad je 'total'
    const lastSpent = calcTotal(lastMonth, 'total'); // Bilo je 'price', sad je 'total'
    const thisLiters = calcTotal(thisMonth, 'liters'); // Ovo je već bilo tačno
    const lastLiters = calcTotal(lastMonth, 'liters'); // Ovo je već bilo tačno

    // Ažuriranje UI-ja direktno ovde ili kroz povratnu vrednost
    // Proveri da li su cifre uopšte izračunate
    console.log("Suma ovog meseca (RSD):", thisSpent, "Suma ovog meseca (L):", thisLiters);

    const getDiff = (curr, prev) => {
        if (prev === 0) return { text: "", isIncrease: false };
        const diff = curr - prev;
        const percent = ((diff / prev) * 100).toFixed(0);
        return { 
            text: diff === 0 ? "Isto" : `${diff > 0 ? '+' : ''}${percent}% u odnosu na prethodni mesec`,
            isIncrease: diff > 0 
        };
    };

    return {
        spent: getDiff(thisSpent, lastSpent),
        liters: getDiff(thisLiters, lastLiters),
        totals: { thisSpent, thisLiters } // Vraćamo i prave vrednosti
    };
}