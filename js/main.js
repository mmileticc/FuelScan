import { initAuth, signInWithGoogle, signOut, onAuthReady, getCurrentUser } from "./auth.js";
import {
  showScreen,
  showToast,
  handleSignedInUI,
  handleSignedOutUI,
  renderRecentTransactions,
  renderHistoryList,
  clearDashboard,
} from "./ui.js";
import { fetchUserReceipts, saveReceiptToSupabase } from "./api.js";
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
  } catch (err) {
    showToast(err.message || "Greška pri učitavanju podataka.", "error");
  }
}

function bindNavigation() {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.target;
      showScreen(target);

      if (target === "scan") {
        setTimeout(() => startCamera(), 50);
      } else {
        stopCamera();
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
    await resetScannerState(); // <--- DODATO
    showScreen("scan");
    showToast("Račun odbačen.", "info");
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