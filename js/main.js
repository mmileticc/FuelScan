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
  renderStatistics,
  getMonthlyComparison
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

    // 1. Ažuriraj "Poslednje punjenje"
    const last = receipts[0];
    // Ažuriraj poslednje punjenje
    document.getElementById("stat-last-date").textContent = last.date 
        ? new Date(last.date).toLocaleDateString("sr-RS") 
        : "---";
    document.getElementById("stat-last-total").textContent = last.total 
        ? `${Number(last.total).toFixed(0)} RSD` 
        : "---";
    

    // 2. Mesečni proračun
    const comparison = getMonthlyComparison(receipts);

    // --- OVO JE KLJUČNO: Ovde upisuješ vrednosti ---
    document.getElementById("stat-month-spent").textContent = `${comparison.totals.thisSpent.toFixed(0)} RSD`;
    document.getElementById("stat-month-liters").textContent = `${comparison.totals.thisLiters.toFixed(1)} L`;

    // 3. Ažuriraj tekstove ispod (Diff)
    const spentEl = document.getElementById("stat-spent-diff");
    spentEl.textContent = comparison.spent.text;
    spentEl.className = `text-[10px] font-mono mt-1 ${comparison.spent.isIncrease ? 'text-red-500' : 'text-green-500'}`;

    const litersEl = document.getElementById("stat-liters-diff");
    litersEl.textContent = comparison.liters.text;
    litersEl.className = `text-[10px] font-mono mt-1 ${comparison.liters.isIncrease ? 'text-red-500' : 'text-green-500'}`;

    renderRecentTransactions(receipts.slice(0, 3));
    renderHistoryList(receipts);

    // OVO JE NOVI DEO:
    setupDeleteHandler(async (id) => {
        try {
            await deleteReceipt(id);
            showToast("Zapis obrisan.", "success");
            await loadDashboardData(); // Osveži listu
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

      if (!getCurrentUser()) {
        showToast("Morate se prijaviti da biste pristupili ovoj sekciji.", "warning");
        showScreen("welcome");
        return;
      }

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


  // OVO JE NOVO: Povezivanje dugmeta sa Welcome ekrana
  document.getElementById("btn-login-welcome")?.addEventListener("click", async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      showToast(err.message || "Greška pri prijavi.", "error");
    }
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

  await initAuth();

  onAuthReady((user) => {
    if (user) {
      handleSignedInUI(user);
      showScreen("dashboard"); // Ako je ulogovan, baci ga na dashboard
      loadDashboardData();
    } else {
      handleSignedOutUI();
      showScreen("welcome"); // OVO JE KLJUČNO: Ako nije ulogovan, baci ga na Welcome sa uputstvom!
    }
  });

  window.__handleScan = handleScan;
});