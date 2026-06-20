import { supabase, isAuthReady, getCurrentUser } from "./auth.js";
import { setScanStatus, renderResultCard, showToast, showScreen } from "./ui/index.js";
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
      updateToggleUI(false); // UI: Kamera ne radi
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
    
    updateToggleUI(true); // UI: Kamera je upaljena!

  } catch (err) {
    console.error("[Camera]", err);
    setScanStatus("Kamera je blokirana. Učitavanje iz fajla radi.", "warning");
    if (video) video.style.display = "none";
    showToast("Pristup kameri odbijen. Koristi učitavanje iz fajla.", "error");
    updateToggleUI(false); // UI: Kamera ne radi
  }
}

export function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  if (video) video.srcObject = null;
  setScanStatus("Kamera je ugašena", "idle");
  
  updateToggleUI(false); // UI: Kamera je ugašena!
}

// Funkcija za prikaz uslikane ili uploadovane slike
export function showImagePreview(file) {
  const reader = new FileReader();
  const previewContainer = document.getElementById("image-preview-container");
  const imgElement = document.getElementById("image-preview");

  reader.onload = (e) => {
    if(imgElement) imgElement.src = e.target.result;
    if(video) video.style.display = "none";
    if(previewContainer) previewContainer.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

async function processImage(file) {
  try {
    // Ne prebacujemo još uvek ekran - ostavljamo korisnika da vidi "preview" slike!
    setScanStatus("Tražim QR kod na slici...", "loading");

    const qrCode = await scanQrFromBlob(file);
    
    // Kad pronađe QR kod, tek onda prebacujemo na rezultat
    showScreen("result");
    renderResultCard(null, "loading");
    
    // Gasimo kameru jer smo prešli na sledeći ekran
    await stopCamera();

    const receiptData = await parseReceipt(qrCode);
    renderResultCard(receiptData, "success");
    window.__pendingReceipt = receiptData;
  } catch (err) {
    // Ako ne uspe da obradi sliku ili nađe QR
    showScreen("result");
    renderResultCard(null, "error", err.message);
    setScanStatus("Greška pri obradi.", "error");
    showToast(err.message || "Greška pri obradi.", "error");
    await stopCamera();
  } finally {
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
  // 1. Slikanje kamerom (novo dugme)
  document.getElementById("btn-capture")?.addEventListener("click", () => {
    if (!cameraStream || !video?.videoWidth) {
      showToast("Kamera nije aktivna!", "error");
      return;
    }

    // Dodavanje "Blic" efekta na ekran
    const flash = document.createElement("div");
    flash.className = "absolute inset-0 bg-white z-50 opacity-100 transition-opacity duration-300";
    document.getElementById("screen-scan").appendChild(flash);
    setTimeout(() => flash.classList.add("opacity-0"), 50);
    setTimeout(() => flash.remove(), 350);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "snapshot.jpg", { type: "image/jpeg" });
      showImagePreview(file); // Odmah prikazujemo sliku preko kamere
      processImage(file);     // Puštamo skeniranje
    }, "image/jpeg");
  });

  // 2. Upload iz galerije (mala ikonica levo)
  document.getElementById("file-input")?.addEventListener("change", (e) => {
    if (e.target.files?.length) {
      const file = e.target.files[0];
      showImagePreview(file); // Odmah prikazujemo šta je izabrao
      processImage(file);     // Puštamo skeniranje
    }
  });

  // 3. Dugme za refreš/toggle kamere (mala ikonica desno)
  document.getElementById("btn-toggle-camera")?.addEventListener("click", async () => {
    if (cameraStream) {
      stopCamera();
      setTimeout(() => startCamera(), 300);
    }
  });

  // 3. Toggle dugme za paljenje i gasenje
  document.getElementById("btn-toggle-power")?.addEventListener("click", () => {
    // Proveravamo stanje: ako stream postoji, gasi ga. Ako ne postoji, pali ga.
    if (cameraStream) {
      stopCamera();
    } else {
      startCamera();
    }
  });
}

export async function resetScannerState() {
  await stopCamera();
  
  if (fileQrScanner) {
    try {
      if (fileQrScanner.isScanning) {
        await fileQrScanner.stop();
      }
    } catch (e) {
      console.warn("Skener je već bio ugašen:", e);
    }
  }
  
  setScanStatus("Spreman za skeniranje", "idle");
  
  const fileInput = document.getElementById("file-input");
  if (fileInput) fileInput.value = "";

  // Resetujemo UI da vrati kameru umesto uslikane slike
  const previewContainer = document.getElementById("image-preview-container");
  const imgElement = document.getElementById("image-preview");
  
  if(previewContainer) previewContainer.classList.add("hidden");
  if(imgElement) imgElement.src = "";
  if(video) video.style.display = "block";
  
}

export async function scanQrFromBlob(file) {
  const scanner = getFileQrScanner();
  try {
    const decodedText = await scanner.scanFile(file, true);
    return decodedText;
  } catch (err) {
    console.error("[QR Scanner Error]:", err);
    throw new Error("Nije pronađen QR kod. Pokušajte ponovo sa boljim osvetljenjem.");
  }
}

// Pomoćna funkcija koja menja izgled toggle dugmeta
function updateToggleUI(isOn) {
  const iconOn = document.getElementById("icon-cam-on");
  const iconOff = document.getElementById("icon-cam-off");
  if (!iconOn || !iconOff) return;

  if (isOn) {
    iconOn.classList.remove("hidden");
    iconOff.classList.add("hidden");
  } else {
    iconOn.classList.add("hidden");
    iconOff.classList.remove("hidden");
  }
}