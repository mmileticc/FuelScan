let consumptionChartInstance = null;

export function renderStatistics(receipts, period = "all") {
  const now = new Date();
  const filteredReceipts = receipts.filter((r) => {
    if (!r.date) return false;
    const receiptDate = new Date(r.date);
    
    if (period === "month") {
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(now.getDate() - 30);
      return receiptDate >= oneMonthAgo;
    } else if (period === "year") {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      return receiptDate >= oneYearAgo;
    }
    return true;
  });

  const validForStats = filteredReceipts.filter((r) => Number(r.price_per_l) > 0 && r.station);
  
  const cheapestEl = document.getElementById("stats-cheapest-station");
  const cheapestPriceEl = document.getElementById("stats-cheapest-price");
  const expensiveEl = document.getElementById("stats-expensive-station");
  const expensivePriceEl = document.getElementById("stats-expensive-price");

  const periodTotal = filteredReceipts.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
  const periodLiters = filteredReceipts.reduce((sum, r) => sum + (Number(r.liters) || 0), 0);

  const periodTotalEl = document.getElementById("stats-period-total");
  const periodLitersEl = document.getElementById("stats-period-liters");
  
  if (periodTotalEl) periodTotalEl.textContent = `${periodTotal.toFixed(0)} RSD`;
  if (periodLitersEl) periodLitersEl.textContent = `${periodLiters.toFixed(1)} L`;

  if (validForStats.length > 0) {
    const cheapest = validForStats.reduce((min, r) => Number(r.price_per_l) < Number(min.price_per_l) ? r : min, validForStats[0]);
    const expensive = validForStats.reduce((max, r) => Number(r.price_per_l) > Number(max.price_per_l) ? r : max, validForStats[0]);

    if (cheapestEl) cheapestEl.textContent = cheapest.station;
    if (cheapestPriceEl) cheapestPriceEl.textContent = `${Number(cheapest.price_per_l).toFixed(2)} RSD/L`;
    if (expensiveEl) expensiveEl.textContent = expensive.station;
    if (expensivePriceEl) expensivePriceEl.textContent = `${Number(expensive.price_per_l).toFixed(2)} RSD/L`;
  } else {
    if (cheapestEl) cheapestEl.textContent = "Nema podataka";
    if (cheapestPriceEl) cheapestPriceEl.textContent = "—";
    if (expensiveEl) expensiveEl.textContent = "Nema podataka";
    if (expensivePriceEl) expensivePriceEl.textContent = "—";
  }

  const chartData = [...validForStats].sort((a, b) => new Date(a.date) - new Date(b.date));

  const labels = chartData.map((r) => {
    return new Date(r.date).toLocaleDateString("sr-RS", { day: "2-digit", month: "2-digit" });
  });
  const prices = chartData.map((r) => Number(r.price_per_l));

  const ctx = document.getElementById("chart-consumption");
  if (!ctx) return;

  if (consumptionChartInstance) {
    consumptionChartInstance.destroy();
  }

  consumptionChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Cena po litru",
          data: prices,
          borderColor: "#0284c7",
          backgroundColor: "rgba(2, 132, 199, 0.1)",
          borderWidth: 3,
          tension: 0.3,
          pointBackgroundColor: "#0ea5e9",
          pointRadius: chartData.length > 15 ? 2 : 4,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#94a3b8",
          bodyColor: "#f8fafc",
          borderColor: "#334155",
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: function (context) {
              const item = chartData[context.dataIndex];
              return [`Cena: ${context.parsed.y.toFixed(2)} RSD/L`, `Pumpa: ${item.station}`];
            }
          }
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#94a3b8", font: { size: 10 } },
        },
        y: {
          grid: { color: "rgba(51, 65, 85, 0.2)" },
          ticks: { color: "#94a3b8", font: { size: 10 } },
        },
      },
    },
  });
}