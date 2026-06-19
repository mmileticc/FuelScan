import { supabase, isAuthReady, getCurrentUser } from "./auth.js";
import { setScanStatus, renderResultCard, showToast, showScreen } from "./ui/_index.js";
import { parseReceipt } from "./api.js";

const video = document.getElementById("camera-preview");
let cameraStream = null;
let fileQrScanner = null;

function getFileQrScanner() {
  if (!fileQrScanner) {
    const el = document.getElementById("qr-reader");
    if (!el) throw new Error("Element #qr-reader nije pronađen u DOM-u");
    fileQrScanner = new Html5Qrcode("qr-reader");
  }
  return fileQrScanner;
}

export async function startCamera() {
  try {
    if (cameraStream) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanStatus("Kamera nije dostupna. Koristi učitavanje slike.", "warning");
      if (video) video.style.display = "none";
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });

    cameraStream = stream;
    video.srcObject = stream;
    video.style.display = "block";
    setScanStatus("Kamera je spremna - usmerite ka QR kodu", "success");
  } catch (err) {
    console.error("[Camera]", err);
    setScanStatus("Kamera je blokirana. Učitavanje iz fajla radi.", "warning");
    if (video) video.style.display = "none";
    showToast("Pristup kameri odbijen. Koristi učitavanje iz fajla.", "error");
  }
}

export function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  if (video) video.srcObject = null;
  setScanStatus("Kamera je ugašena", "idle");
}


async function processImage(file) {
  try {
    setScanStatus("Obrađujem sliku...", "loading");
    renderResultCard(null, "loading");
    showScreen("result");

    // Zaustavljamo kameru odmah jer prelazimo na ekran sa rezultatom
    await stopCamera();

    const qrCode = await scanQrFromBlob(file);
    setScanStatus("QR kod uspešno prepoznat! Učitavam podatke...", "success");

    const receiptData = await parseReceipt(qrCode);
    renderResultCard(receiptData, "success");
    window.__pendingReceipt = receiptData;
  } catch (err) {
    renderResultCard(null, "error", err.message);
    setScanStatus("Greška pri obradi.", "error");
    showToast("Greška pri obradi.", "error");
  } finally {
    // --- KLJUČNO: Čistimo input polje kako bi sledeći klik na "Učitaj sliku" ponovo radio ---
    const fileInput = document.getElementById("file-input");
    if (fileInput) fileInput.value = ""; 
  }
}


export async function handleScan(decodedText) {
  if (!isAuthReady()) {
    showToast("Sačekaj da se prijava učita.", "warning");
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    showToast("Morate se prijaviti.", "warning");
    showScreen("dashboard");
    return;
  }

  showScreen("result");
  renderResultCard(null, "loading");

  try {
    const receiptData = await parseReceipt(decodedText);
    renderResultCard(receiptData, "success");
    window.__pendingReceipt = receiptData;
  } catch (err) {
    renderResultCard(null, "error", err.message);
    showToast("Greška pri obradi.", "error");
  }
}

export function bindScannerUI() {
  document.getElementById("btn-start-camera")?.addEventListener("click", startCamera);
  document.getElementById("btn-stop-camera")?.addEventListener("click", stopCamera);

  document.getElementById("btn-snap")?.addEventListener("click", () => {
    if (!cameraStream || !video?.videoWidth) {
      showToast("Kamera nije aktivna!", "error");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "snapshot.jpg", { type: "image/jpeg" });
      processImage(file);
    }, "image/jpeg");
  });

  document.getElementById("btn-upload")?.addEventListener("click", () => {
    document.getElementById("file-input")?.click();
  });

  document.getElementById("file-input")?.addEventListener("change", (e) => {
    if (e.target.files?.length) processImage(e.target.files[0]);
  });

  document.getElementById("btn-manual-submit")?.addEventListener("click", () => {
    const url = document.getElementById("manual-url-input")?.value.trim();
    if (!url) return showToast("Unesite URL.", "error");
    handleScan(url);
  });
}


export async function resetScannerState() {
  // 1. Gasimo kameru i oslobađamo stream
  await stopCamera();
  
  // 2. Ako je html5Qrcode skener ostao aktivan u pozadini, gasimo ga
  if (fileQrScanner) {
    try {
      if (fileQrScanner.isScanning) {
        await fileQrScanner.stop();
      }
    } catch (e) {
      console.warn("Skener je već bio ugašen:", e);
    }
  }
  
  // 3. Vraćamo status tekst na početni
  setScanStatus("Spreman za skeniranje", "idle");
  
  // 4. Čistimo input za fajlove za svaki slučaj
  const fileInput = document.getElementById("file-input");
  if (fileInput) fileInput.value = "";
}

export async function scanQrFromBlob(file) {
  const scanner = getFileQrScanner();
  try {
    // html5Qrcode ima ugrađenu metodu scanFile koja radi direktno sa Blob/File objektima
    const decodedText = await scanner.scanFile(file, true);
    return decodedText;
  } catch (err) {
    console.error("[QR Scanner Error]:", err);
    throw new Error("Nije pronađen validan QR kod na slici. Pokušajte ponovo sa boljim osvetljenjem.");
  }
}