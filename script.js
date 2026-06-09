/**
 * FuelScan – script.js
 * ─────────────────────────────────────────────────────────────
 * Sve: Firebase Auth, QR skeniranje, navigacija, API.
 * ─────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════════════════
//  0. FIREBASE IMPORT - ODMAH NA POČETKU
// ══════════════════════════════════════════════════════════════

import {
  initializeApp,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";

import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  getAuth,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCQMaUNA7HI-xVgImU-zBzXy8O5mvswyEw",
  authDomain: "fuelscan-9ea34.firebaseapp.com",
  projectId: "fuelscan-9ea34",
  storageBucket: "fuelscan-9ea34.firebasestorage.app",
  messagingSenderId: "113254330984",
  appId: "1:113254330984:web:343ad70e769022ff37c1dd",
  measurementId: "G-Q5S5GRJZDL"
};

// Inicijalizuj ODMAH
const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
console.log("[Firebase] ✅ Inicijalizovan direktno u script.js");

// ══════════════════════════════════════════════════════════════
//  1. KONFIGURACIJA
// ══════════════════════════════════════════════════════════════

const SUPABASE_URL    = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const BACKEND_API_URL = "https://YOUR_BACKEND_URL/parse-receipt";

// ══════════════════════════════════════════════════════════════
//  2. AUTH STATE INITIALIZATION
// ══════════════════════════════════════════════════════════════

let currentUser = null; // Čuvamo trenutnog korisnika globalno

// Osluškuj promene u stanju prijave
onAuthStateChanged(auth, (user) => {
  if (user) {
    handleUserSignedIn(user);
  } else {
    handleUserSignedOut();
  }
});

console.log("[Auth] State listener registrovan");

/** Poziva se kada korisnik uspešno uđe */
function handleUserSignedIn(user) {
  currentUser = user; // Čuvaj u globalnoj varijabli
  
  document.getElementById("btn-login").classList.add("hidden");
  const userInfo = document.getElementById("user-info");
  userInfo.classList.remove("hidden");
  userInfo.classList.add("flex");

  document.getElementById("user-avatar").src = user.photoURL || "";
  document.getElementById("greeting-name").textContent = user.displayName?.split(" ")[0] || "Korisnik";

  loadDashboardData();
}

/** Poziva se kada korisnik izađe */
function handleUserSignedOut() {
  currentUser = null; // Očisti globalni korisnik
  
  document.getElementById("btn-login").classList.remove("hidden");
  const userInfo = document.getElementById("user-info");
  userInfo.classList.add("hidden");
  userInfo.classList.remove("flex");

  document.getElementById("greeting-name").textContent = "Korisnik";
  clearDashboard();
}

// Auth dugmad
document.getElementById("btn-login").addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("[Auth] Greška pri prijavi:", err);
    let message = "Prijava nije uspela.";
    
    if (err.code === "auth/unauthorized-domain") {
      message = `❌ Domena nije autorizovana.\nDodajte u Firebase: ${window.location.hostname}`;
    }
    
    showToast(message, "error");
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await signOut(auth);
  showToast("Odjavljen/a");
});


// ══════════════════════════════════════════════════════════════
//  3. SUPABASE INICIJALIZACIJA
// ══════════════════════════════════════════════════════════════

/**
 * Koristimo Supabase JS SDK direktno (bez npm-a).
 * Dodajte u index.html pre script.js ako koristite CDN varijantu:
 * <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
 *
 * Ako koristite module bundler, importujte:
 * import { createClient } from '@supabase/supabase-js'
 */

// ⚠️  Ako učitavate Supabase preko CDN-a, dekommentujte sledeće:
// const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Ako koristite ES module import:
// import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Placeholder – zamijenite pravom inicijalizacijom */
const supabase = {
  _warn() { console.warn("[Supabase] Nije inicijalizovan. Unesite ključeve i importujte SDK."); },
  from() { this._warn(); return { select: () => Promise.resolve({ data: [], error: null }) }; },
};


// ══════════════════════════════════════════════════════════════
//  4. NAVIGACIJA  –  prebacivanje između ekrana
// ══════════════════════════════════════════════════════════════

const SCREENS = ["dashboard", "scan", "history", "result"];

/** Pokazuje traženi ekran, sakriva ostale */
function showScreen(name) {
  SCREENS.forEach((id) => {
    const el = document.getElementById(`screen-${id}`);
    if (!el) return;
    el.classList.toggle("hidden", id !== name);
  });

  // Vizuelno isticanje aktivnog taba u navigaciji
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    const isActive = tab.dataset.target === name;
    tab.classList.toggle("text-fuel-400", isActive && !tab.classList.contains("bg-fuel-600"));
    tab.classList.toggle("text-slate-400", !isActive && !tab.classList.contains("bg-fuel-600"));
  });
}

// Klikovi na navigation tabove
document.querySelectorAll(".nav-tab").forEach((tab) => {
  tab.addEventListener("click", () => showScreen(tab.dataset.target));
});

// Dugme "Nazad" sa result ekrana
document.getElementById("btn-back-from-result").addEventListener("click", () => showScreen("scan"));

// Podrazumevani ekran pri pokretanju
showScreen("dashboard");

// Startup info u console
window.addEventListener("load", () => {
  console.log("%c⛽ FUELSCAN", "font-size: 20px; color: #0ea5e9; font-weight: bold;");
  console.log(`%cDomena: ${window.location.hostname}`, "color: #0ea5e9; font-weight: bold;");
  console.log(`%cProtokol: ${window.location.protocol}`, "color: #0ea5e9; font-weight: bold;");
  
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.info("%c✅ LOKALNI RAZVOJ", "color: #10b981; font-weight: bold; font-size: 14px;");
    console.info("Firebase domena je već autorizovana za localhost");
  } else if (window.location.hostname.includes("github.io")) {
    console.info("%c✅ GITHUB PAGES", "color: #10b981; font-weight: bold; font-size: 14px;");
    console.info("Provjeri da li je domena u Firebase Authorized domains");
  }
  
  console.log("%cKlikni 'Prijavi se' da počneš", "color: #fbbf24; font-weight: bold;");
  
  // Inicijalizuj kameru
  initCamera();
});


// ══════════════════════════════════════════════════════════════
//  5. QR SKENER  –  html5-qrcode
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
//  QR SKENER - JEDNOSTAVNA VERZIJA SA VIDEO ELEMENTOM
// ══════════════════════════════════════════════════════════════

const html5QrCode = new Html5Qrcode("qr-reader");
const video = document.getElementById("camera-preview");
const scanResultEl = document.getElementById("scan-result");

/** Ažurira status tekst i boju */
function setScanStatus(message, type = "idle") {
  const el = document.getElementById("scan-status-text");
  if (!el) return;
  
  el.textContent = message;

  const colors = {
    idle:    "text-slate-400",
    loading: "text-fuel-400 animate-pulse",
    success: "text-emerald-400",
    warning: "text-amber-400",
    error:   "text-red-400",
  };

  // Ukloni sve moguće boje
  el.className = "";
  el.className = colors[type] || colors.idle;
}

/** Inicijalizuj live kameru */
function initCamera() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        video.srcObject = stream;
        setScanStatus("Kamera je spremna - usmerite ka QR kodu", "idle");
      })
      .catch(err => {
        console.error("[Camera]", err);
        setScanStatus("⚠️ Kamera je blokirana. Učitavanje iz fajla radi.", "warning");
        video.style.display = "none";
        showToast("Pristup kameri odbijen. Koristi učitavanje iz fajla.", "error");
      });
  } else {
    setScanStatus("⚠️ HTTP detektovan. Učitavanje iz fajla radi!", "warning");
    video.style.display = "none";
  }
}

/** Zajednička funkcija za analizu slika */
async function processImage(file) {
  setScanStatus("Analiziram sliku...", "loading");
  
  try {
    const decodedText = await html5QrCode.scanFile(file, true);
    console.log("[Image Scan] QR pronađen:", decodedText);
    
    setScanStatus("✓ QR kod detektovan!", "success");
    await handleScan(decodedText);
  } catch (err) {
    console.error("[Image Scan]", err);
    setScanStatus("❌ QR kod nije pronađen. Pokušaj ponovo.", "error");
    showToast("QR kod nije pronađen u slici", "error");
  }
}

// OKINI KADAR - fotografiši iz video elementa
document.getElementById("btn-snap").addEventListener("click", () => {
  if (!video.srcObject) {
    showToast("Kamera nije aktivna!", "error");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  
  canvas.toBlob(blob => {
    const file = new File([blob], "snapshot.jpg", { type: "image/jpeg" });
    processImage(file);
  }, "image/jpeg");
});

// UČITAJ SLIKU - otvori file browser
document.getElementById("btn-upload").addEventListener("click", () => {
  document.getElementById("file-input").click();
});

// File input change
document.getElementById("file-input").addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    processImage(e.target.files[0]);
  }
});

// Manuelni unos
document.getElementById("btn-manual-submit").addEventListener("click", () => {
  const url = document.getElementById("manual-url-input").value.trim();
  if (!url) { showToast("Unesite URL.", "error"); return; }
  handleScan(url);
});


// ══════════════════════════════════════════════════════════════
//  6. HANDLE SCAN  –  slanje URL-a ka Python backendu
// ══════════════════════════════════════════════════════════════

/**
 * Glavna funkcija koja prima dekodirani URL sa QR koda,
 * šalje ga na backend i prikazuje rezultat korisniku.
 *
 * @param {string} decodedText - URL ili tekst skinut sa QR koda
 */
async function handleScan(decodedText) {
  console.log("[Scan] Obrađujem:", decodedText);

  // Proveri da li je korisnik prijavljen
  if (!currentUser) {
    showToast("Morate se prijaviti da biste sačuvali podatke.", "warning");
    showScreen("dashboard");
    return;
  }

  // Pređi na result ekran i pokaži loading stanje
  showScreen("result");
  renderResultCard(null, "loading");

  try {
    // Pribavljanje Firebase ID tokena za autentifikaciju prema backendu
    const idToken = await currentUser.getIdToken();

    const response = await fetch(BACKEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify({ url: decodedText }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    /**
     * ⚠️  Ovde prilagodite strukturu odgovora sa vašeg Python backend-a.
     * Primer očekivanog JSON-a:
     * {
     *   station:    "NIS Petrol – Bulevar",
     *   fuel_type:  "Euro Premium BMB 95",
     *   liters:     42.5,
     *   price_per_l: 185.0,
     *   total:      7862.50,
     *   date:       "2024-06-01T14:23:00",
     *   raw_url:    "https://..."
     * }
     */
    const receiptData = await response.json();

    renderResultCard(receiptData, "success");

    // Sačuvaj lokalno radi prikaza pre potvrde
    window.__pendingReceipt = receiptData;

  } catch (err) {
    console.error("[handleScan] Greška:", err);
    renderResultCard(null, "error", err.message);
    showToast("Greška pri obradi. Pokušajte ponovo.", "error");
  }
}

/**
 * Renderuje karticu s podacima računa na result ekranu.
 *
 * @param {object|null} data    - podaci sa backend-a
 * @param {"loading"|"success"|"error"} state
 * @param {string} [errorMsg]   - poruka greške
 */
function renderResultCard(data, state, errorMsg = "") {
  const card = document.getElementById("result-card");

  if (state === "loading") {
    card.innerHTML = `
      <div class="flex items-center gap-3 text-fuel-400 animate-pulse">
        <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <span>Preuzimam podatke sa servera...</span>
      </div>`;
    return;
  }

  if (state === "error") {
    card.innerHTML = `
      <p class="text-red-400 font-semibold">Greška pri obradi</p>
      <p class="text-slate-400 text-sm mt-1">${errorMsg || "Nepoznata greška."}</p>`;
    return;
  }

  // ⚠️  Prilagodite nazivima polja sa vašeg backend-a
  const date = data.date ? new Date(data.date).toLocaleDateString("sr-RS") : "—";
  card.innerHTML = `
    <div class="flex items-start justify-between">
      <div>
        <p class="font-semibold text-base">${data.station ?? "Nepoznata stanica"}</p>
        <p class="text-sm text-slate-400">${date}</p>
      </div>
      <span class="bg-fuel-900 text-fuel-300 text-xs font-medium px-2 py-1 rounded-lg">${data.fuel_type ?? "—"}</span>
    </div>
    <div class="border-t border-surface-border pt-3 grid grid-cols-3 gap-3 text-center">
      <div>
        <p class="text-xs text-slate-400 mb-1">Litara</p>
        <p class="text-xl font-bold font-mono">${data.liters ?? "—"}</p>
      </div>
      <div>
        <p class="text-xs text-slate-400 mb-1">Cena/L</p>
        <p class="text-xl font-bold font-mono">${data.price_per_l ? data.price_per_l.toFixed(2) : "—"}</p>
      </div>
      <div>
        <p class="text-xs text-slate-400 mb-1">Ukupno</p>
        <p class="text-xl font-bold font-mono text-fuel-400">${data.total ? data.total.toFixed(2) : "—"}</p>
      </div>
    </div>`;
}


// ══════════════════════════════════════════════════════════════
//  7. RESULT EKRAN – čuvanje / odbacivanje
// ══════════════════════════════════════════════════════════════

document.getElementById("btn-save-result").addEventListener("click", async () => {
  const receipt = window.__pendingReceipt;
  if (!receipt) { showToast("Nema podataka za čuvanje.", "error"); return; }

  try {
    await saveReceiptToSupabase(receipt);
    showToast("✓ Račun je sačuvan!");
    window.__pendingReceipt = null;
    showScreen("dashboard");
    loadDashboardData();
  } catch (err) {
    console.error("[Save] Greška:", err);
    showToast("Greška pri čuvanju.", "error");
  }
});

document.getElementById("btn-discard-result").addEventListener("click", () => {
  window.__pendingReceipt = null;
  showScreen("scan");
  showToast("Račun odbačen.");
});


// ══════════════════════════════════════════════════════════════
//  8. SUPABASE – čuvanje i učitavanje
// ══════════════════════════════════════════════════════════════

/**
 * Čuva podatke o računu u Supabase tabelu 'fuel_receipts'.
 *
 * ⚠️  Kreirajte tabelu u Supabase-u sa sledećom strukturom:
 *   CREATE TABLE fuel_receipts (
 *     id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     user_id     text NOT NULL,
 *     station     text,
 *     fuel_type   text,
 *     liters      numeric,
 *     price_per_l numeric,
 *     total       numeric,
 *     date        timestamptz,
 *     raw_url     text,
 *     created_at  timestamptz DEFAULT now()
 *   );
 *   ALTER TABLE fuel_receipts ENABLE ROW LEVEL SECURITY;
 *
 * @param {object} receipt - podaci za čuvanje
 */
async function saveReceiptToSupabase(receipt) {
  const userId = currentUser?.uid;
  if (!userId) throw new Error("Korisnik nije prijavljen.");

  const { error } = await supabase.from("fuel_receipts").insert([{
    user_id:     userId,
    station:     receipt.station,
    fuel_type:   receipt.fuel_type,
    liters:      receipt.liters,
    price_per_l: receipt.price_per_l,
    total:       receipt.total,
    date:        receipt.date,
    raw_url:     receipt.raw_url,
  }]);

  if (error) throw new Error(error.message);
}

/**
 * Učitava sve račune za prijavljenog korisnika.
 *
 * @returns {Promise<Array>} lista računa
 */
async function fetchUserReceipts() {
  const userId = currentUser?.uid;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("fuel_receipts")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false });

  if (error) {
    console.error("[Supabase] Greška pri učitavanju:", error);
    return [];
  }
  return data || [];
}


// ══════════════════════════════════════════════════════════════
//  9. DASHBOARD  –  statistike i poslednje transakcije
// ══════════════════════════════════════════════════════════════

async function loadDashboardData() {
  const receipts = await fetchUserReceipts();

  if (!receipts.length) {
    clearDashboard();
    renderHistoryList([]);
    return;
  }

  // Izračunavanje statistika
  const totalLiters = receipts.reduce((s, r) => s + (r.liters || 0), 0);
  const totalSpent  = receipts.reduce((s, r) => s + (r.total  || 0), 0);
  const avgPrice    = totalLiters > 0 ? totalSpent / totalLiters : 0;
  const lastReceipt = receipts[0];

  document.getElementById("stat-liters").textContent     = `${totalLiters.toFixed(1)} L`;
  document.getElementById("stat-total").textContent      = `${totalSpent.toFixed(0)} RSD`;
  document.getElementById("stat-avg-price").textContent  = `${avgPrice.toFixed(2)}`;
  document.getElementById("stat-last").textContent       =
    lastReceipt.date ? new Date(lastReceipt.date).toLocaleDateString("sr-RS") : "—";

  // Poslednjih 3 za dashboard preview
  renderRecentTransactions(receipts.slice(0, 3));
  renderHistoryList(receipts);
}

function clearDashboard() {
  ["stat-liters", "stat-total", "stat-avg-price"].forEach(id => {
    document.getElementById(id).textContent = "—";
  });
  document.getElementById("stat-last").textContent = "—";
  document.getElementById("recent-transactions").innerHTML =
    '<li class="text-slate-500 text-sm text-center py-6">Nema podataka. Skenirajte prvi račun.</li>';
}

/** Renderuje kratki pregled poslednjih transakcija na dashboardu */
function renderRecentTransactions(receipts) {
  const list = document.getElementById("recent-transactions");
  if (!receipts.length) {
    list.innerHTML = '<li class="text-slate-500 text-sm text-center py-6">Nema podataka.</li>';
    return;
  }

  list.innerHTML = receipts.map(r => `
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

/** Renderuje kompletnu listu na History ekranu */
function renderHistoryList(receipts) {
  const list = document.getElementById("history-list");
  if (!receipts.length) {
    list.innerHTML = '<li class="text-slate-500 text-sm text-center py-10">Istorija je prazna.</li>';
    return;
  }

  list.innerHTML = receipts.map(r => `
    <li class="bg-surface-card border border-surface-border rounded-xl px-4 py-4 space-y-2">
      <div class="flex items-center justify-between">
        <p class="font-semibold">${r.station ?? "Nepoznata stanica"}</p>
        <span class="text-xs text-fuel-300 bg-fuel-900 px-2 py-0.5 rounded-lg">${r.fuel_type ?? "—"}</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-slate-400">${r.date ? new Date(r.date).toLocaleDateString("sr-RS") : "—"}</span>
        <span class="font-mono text-fuel-400 font-semibold">${r.total ? r.total.toFixed(0) + " RSD" : "—"}</span>
      </div>
      <div class="grid grid-cols-2 gap-2 pt-1 border-t border-surface-border text-xs text-slate-400">
        <span>Litara: <strong class="text-slate-200">${r.liters ? r.liters.toFixed(2) + " L" : "—"}</strong></span>
        <span>Cena/L: <strong class="text-slate-200">${r.price_per_l ? r.price_per_l.toFixed(2) + " RSD" : "—"}</strong></span>
      </div>
    </li>`).join("");
}


// ══════════════════════════════════════════════════════════════
//  10. TOAST NOTIFIKACIJA  –  kratke povratne poruke
// ══════════════════════════════════════════════════════════════

let toastTimer = null;

/**
 * Prikazuje globalnu toast poruku.
 * @param {string} message  - tekst poruke
 * @param {"info"|"success"|"warning"|"error"} [type]
 * @param {number} [duration] - trajanje u ms (default 3000)
 */
function showToast(message, type = "info", duration = 3000) {
  const toast = document.getElementById("toast");
  const inner = document.getElementById("toast-inner");

  const styles = {
    info:    "bg-slate-800 border-slate-600 text-white",
    success: "bg-emerald-900 border-emerald-600 text-emerald-100",
    warning: "bg-amber-900  border-amber-600  text-amber-100",
    error:   "bg-red-900    border-red-600    text-red-100",
  };

  inner.className = `text-sm px-4 py-3 rounded-xl shadow-xl text-center border ${styles[type] || styles.info}`;
  inner.textContent = message;

  toast.classList.remove("hidden");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), duration);
}


// ══════════════════════════════════════════════════════════════
//  EXPORT (za eventualni budući modul sistem)
// ══════════════════════════════════════════════════════════════
export { handleScan, showScreen, showToast };
