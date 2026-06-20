import { initAuth, signInWithGoogle, signOut, onAuthReady, getCurrentUser } from "./auth.js";
import {
  showScreen,
  showToast,
  handleSignedInUI,
  handleSignedOutUI,
  renderRecentTransactions,
  renderHistoryList,
  setupDeleteHandler,
  clearDashboard,
  renderStatistics
} from "./ui/index.js";
import { fetchUserReceipts, saveReceiptToSupabase, deleteReceipt } from "./api.js";
import { startCamera, stopCamera, bindScannerUI, handleScan, resetScannerState } from "./scanner.js";

async function loadDashboardData() {
  try {
    const receipts = await fetchUserReceipts();

    if (!receipts.length) {
      clearDashboard();
      renderHistoryList([]);
      return;
    }

    const totalLiters = receipts.reduce((s, r) => s + (Number(r.liters) || 0), 0);
    const totalSpent = receipts.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const avgPrice = totalLiters > 0 ? totalSpent / totalLiters : 0;
    const lastReceipt = receipts[0];

    document.getElementById("stat-liters").textContent = `${totalLiters.toFixed(1)} L`;
    document.getElementById("stat-total").textContent = `${totalSpent.toFixed(0)} RSD`;
    document.getElementById("stat-avg-price").textContent = `${avgPrice.toFixed(2)}`;
    document.getElementById("stat-last").textContent = lastReceipt.date ? new Date(lastReceipt.date).toLocaleDateString("sr-RS") : "—";

    renderRecentTransactions(receipts.slice(0, 3));
    renderHistoryList(receipts);

    // OVO JE NOVI DEO:
    setupDeleteHandler(async (id) => {
        try {
            await deleteReceipt(id);
            showToast("Zapis obrisan.", "success");
            loadDashboardData(); // Osveži listu
        } catch (err) {
            showToast("Greška pri brisanju: " + err.message, "error");
        }
    });
  } catch (err) {
    showToast(err.message || "Greška pri učitavanju podataka.", "error");
  }
}

function bindNavigation() {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      const target = tab.dataset.target;
      showScreen(target);

      if (target === "scan") {
        setTimeout(() => startCamera(), 50);
      } else {
        stopCamera();
      }
      

      // OVO JE NOVI DEO: Ako korisnik klikne na statistiku, osveži grafikone
      if (target === "statistics") {
        try {
          // 1. Povuci sve račune iz baze
          const receipts = await fetchUserReceipts();
          
          // 2. Sačuvaj ih u privremenu globalnu promenljivu prozora da bismo menjali filtere bez ponovnog mučenja baze
          window.__cachedReceiptsForStats = receipts;
          
          // 3. Resetuj aktivno dugme na "Sve" pri svakom ulasku na ekran
          document.querySelectorAll(".btn-period").forEach((b) => {
            const isAll = b.dataset.period === "all";
            b.className = `btn-period flex-1 text-xs font-medium py-2 rounded-lg transition-all ${
              isAll ? "bg-fuel-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`;
          });

          // 4. Nacrtaj inicijalnu statistiku za sve podatke
          renderStatistics(receipts, "all");
        } catch (err) {
          showToast("Greška pri učitavanju statistike.", "error");
        }
      }
    });
  });

  document.getElementById("btn-login")?.addEventListener("click", async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      showToast(err.message || "Greška pri prijavi.", "error");
    }
  });

  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    try {
      await signOut();
      showToast("Uspešno ste odjavljeni.", "success");
    } catch (err) {
      showToast(err.message || "Greška pri odjavi.", "error");
    }
  });

  document.getElementById("btn-back-from-result")?.addEventListener("click", async () => {
    await resetScannerState(); // <--- DODATO
    showScreen("scan");
  });

  document.getElementById("btn-save-result")?.addEventListener("click", async () => {
    const receipt = window.__pendingReceipt;
    if (!receipt) {
      showToast("Nema podataka za čuvanje.", "error");
      return;
    }

    try {
      await saveReceiptToSupabase(receipt);
      window.__pendingReceipt = null;
      await resetScannerState(); // <--- DODATO: Čistimo sve za sledeći sken
      showToast("Račun je sačuvan!", "success");
      showScreen("dashboard");
      await loadDashboardData();
    } catch (err) {
      showToast(err.message || "Greška pri čuvanju.\", \"error");
    }
  });

  document.getElementById("btn-discard-result")?.addEventListener("click", async () => {
    window.__pendingReceipt = null;
    await resetScannerState(); 
    showScreen("scan");
    showToast("Račun odbačen.", "info");
  });


  // Osluškivanje klikova na filtere perioda unutar Statistike
  document.querySelectorAll(".btn-period").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Menjamo vizuelni stil dugmića (aktivno/neaktivno)
      document.querySelectorAll(".btn-period").forEach((b) => {
        b.className = "btn-period flex-1 text-xs font-medium py-2 rounded-lg text-slate-400 hover:text-slate-200 transition-all";
      });
      btn.className = "btn-period flex-1 text-xs font-medium py-2 rounded-lg bg-fuel-600 text-white transition-all";

      // Pokrećemo ponovno računanje i crtanje grafikona za izabrani period
      const selectedPeriod = btn.dataset.period;
      const receipts = window.__cachedReceiptsForStats || [];
      renderStatistics(receipts, selectedPeriod);
    });
  });
}
window.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  bindScannerUI();
  showScreen("dashboard");

  await initAuth();

  onAuthReady((user) => {
    if (user) {
      handleSignedInUI(user);
      loadDashboardData();
    } else {
      handleSignedOutUI();
    }
  });

  window.__handleScan = handleScan;
});