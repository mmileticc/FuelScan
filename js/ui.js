export const SCREENS = ["dashboard", "scan", "history", "result"];

export function showToast(message, type = "info", duration = 3000) {
  const toast = document.getElementById("toast");
  const inner = document.getElementById("toast-inner");

  const styles = {
    info: "bg-slate-800 border-slate-600 text-white",
    success: "bg-emerald-900 border-emerald-600 text-emerald-100",
    warning: "bg-amber-900 border-amber-600 text-amber-100",
    error: "bg-red-900 border-red-600 text-red-100",
  };

  inner.className = `text-sm px-4 py-3 rounded-xl shadow-xl text-center border ${styles[type] || styles.info}`;
  inner.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.add("hidden"), duration);
}

export function showScreen(name) {
  SCREENS.forEach((id) => {
    const el = document.getElementById(`screen-${id}`);
    if (el) el.classList.toggle("hidden", id !== name);
  });

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    const active = tab.dataset.target === name;
    tab.classList.toggle("text-fuel-400", active && !tab.classList.contains("bg-fuel-600"));
    tab.classList.toggle("text-slate-400", !active && !tab.classList.contains("bg-fuel-600"));
  });
}

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

  // ISPRAVKA OVDE: Prvo normalizujemo sirovi string datuma, pa ga prosleđujemo u New Date()
  const normalizedDateStr = parseLocalReceiptDate(data?.date);
  const parsedDate = new Date(normalizedDateStr);
  const date = !isNaN(parsedDate) ? parsedDate.toLocaleDateString("sr-RS") : "—";
  // const date = data?.date ? new Date(data.date).toLocaleDateString("sr-RS") : "—";
  
  // Formatiramo lokacijski string (npr: "Šumadijske Divizije 24, Beograd (Voždovac)")
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

export function renderHistoryList(receipts) {
  const list = document.getElementById("history-list");
  if (!list) return;

  if (!receipts.length) {
    list.innerHTML = '<li class="text-slate-500 text-sm text-center py-10">Istorija je prazna.</li>';
    return;
  }

  list.innerHTML = receipts.map((r) => {
    // Formatiramo punu lokaciju za svaku stavku u istoriji
    const locationText = [r.address, r.city].filter(Boolean).join(", ") || "Nepoznata lokacija";
    
    return `
    <li class="history-item bg-surface-card border border-surface-border rounded-xl px-4 py-4 space-y-2 cursor-pointer" data-id="${r.id}">
      <div class="flex items-start justify-between">
        <div>
          <p class="font-semibold leading-tight">${r.station ?? "Nepoznata stanica"}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">${locationText}</p>
        </div>
        <span class="text-xs text-fuel-300 bg-fuel-900 px-2 py-0.5 rounded-lg shrink-0">${r.fuel_type ?? "—"}</span>
      </div>
      <div class="flex items-center justify-between text-sm pt-1">
        <span class="text-slate-400 text-xs">${r.date ? new Date(r.date).toLocaleDateString("sr-RS") : "—"}</span>
        <span class="font-mono text-fuel-400 font-semibold">${r.total ? r.total.toFixed(0) + " RSD" : "—"}</span>
      </div>
      <div class="grid grid-cols-2 gap-2 pt-1.5 border-t border-surface-border text-xs text-slate-400">
        <span>Litara: <strong class="text-slate-200">${r.liters ? r.liters.toFixed(2) + " L" : "—"}</strong></span>
        <span>Cena/L: <strong class="text-slate-200">${r.price_per_l ? r.price_per_l.toFixed(2) + " RSD" : "—"}</strong></span>
      </div>
    </li>`;
  }).join("");
}

export function setupDeleteHandler(onDeleteCallback) {
  const items = document.querySelectorAll('.history-item');

  items.forEach(item => {
    let timer;
    let isPressing = false;
    let menuOpened = false;
    
    // Pamtimo početne koordinate dodira/klika
    let startX = 0;
    let startY = 0;
    const MOVE_THRESHOLD = 10; // Ako se prst pomeri više od 10px, smatramo to skrolovanjem

    // Podešavanja za stabilnost na desktopu i mobilnom
    item.style.webkitUserSelect = 'none';
    item.style.userSelect = 'none';
    
    // KLJUČNA ISPRAVKA: 'pan-y' dozvoljava normalno skrolovanje liste na gore i dole!
    item.style.touchAction = 'pan-y'; 

    const startTimer = (e) => {
      // Reaguj samo na levi klik miša ili dodir prsta
      if (e.pointerType === 'mouse' && e.button !== 0) return; 
      
      isPressing = true;
      menuOpened = false;
      
      // Beležimo gde je tačno korisnik spustio prst/miš
      startX = e.clientX;
      startY = e.clientY;

      timer = setTimeout(() => {
        if (isPressing) {
          menuOpened = true;
          if (navigator.vibrate) navigator.vibrate(50);
          
          showDeleteMenu(e.clientX, e.clientY, () => {
            onDeleteCallback(item.dataset.id);
          });
          isPressing = false;
        }
      }, 600); // 600ms držiš da se otvori
    };

    const cancelTimer = () => {
      isPressing = false;
      clearTimeout(timer);
    };

    // Nova funkcija koja prati pomeranje prsta/miša
    const handlePointerMove = (e) => {
      if (!isPressing) return;
      
      // Računamo koliko se kursor/prst udaljio od početne tačke
      const diffX = Math.abs(e.clientX - startX);
      const diffY = Math.abs(e.clientY - startY);
      
      // Ako se pomerio više od 10px na bilo koju stranu, znači da korisnik SKROLUJE listu
      // U tom slučaju odmah gasimo tajmer za brisanje i puštamo skrol da radi normalno
      if (diffX > MOVE_THRESHOLD || diffY > MOVE_THRESHOLD) {
        cancelTimer();
      }
    };

    item.addEventListener('pointerdown', startTimer);
    item.addEventListener('pointerup', cancelTimer);
    item.addEventListener('pointerleave', cancelTimer);
    item.addEventListener('pointercancel', cancelTimer);
    
    // Slušamo pomeranje prsta da bismo detektovali skrolovanje
    item.addEventListener('pointermove', handlePointerMove); 

    // Sprečava desktop drag-ghosting
    item.addEventListener('dragstart', (e) => e.preventDefault());

    // Sprečavamo lažni klik ako se meni otvorio
    item.addEventListener('click', (e) => {
      if (menuOpened) {
        e.preventDefault();
        e.stopPropagation();
        menuOpened = false;
      }
    });

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  });

  const btnCancel = document.getElementById('btn-cancel-delete');
  if (btnCancel) {
    btnCancel.onclick = () => {
      document.getElementById('delete-modal').classList.add('hidden');
    };
  }
}

export function showDeleteMenu(x, y, onConfirm) {
  // Ukloni stari ako već postoji
  document.getElementById("floating-delete-menu")?.remove();

  const menu = document.createElement('div');
  menu.id = "floating-delete-menu";
  
  // Menjamo u absolute jer se pozicioniramo UNUTAR makete telefona (body)
  menu.className = "absolute z-[100] bg-red-600 text-white px-5 py-2.5 rounded-xl shadow-2xl cursor-pointer font-bold text-sm flex items-center gap-2";
  
  // Računamo poziciju klika relativno u odnosu na ivice ekrana telefona (body)
  const bodyRect = document.body.getBoundingClientRect();
  const localX = x - bodyRect.left;
  const localY = y - bodyRect.top;

  // Pazimo da meni ne pobegne van desne ili donje ivice ekrana telefona (širina je 420px)
  const safeX = Math.min(localX, bodyRect.width - 140);
  const safeY = Math.min(localY, bodyRect.height - 60);
  
  menu.style.left = `${safeX}px`;
  menu.style.top = `${safeY}px`;
  menu.innerHTML = `Obriši`;

  menu.onclick = (e) => {
    e.stopPropagation(); 
    document.getElementById('delete-modal').classList.remove('hidden');
    
    document.getElementById('btn-confirm-delete').onclick = () => {
      onConfirm();
      document.getElementById('delete-modal').classList.add('hidden');
      menu.remove();
    };
    menu.remove();
  };

  document.body.appendChild(menu);
  
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('pointerdown', closeMenu);
    }
  };
  
  // Mali delay da browser završi sa trenutnim klikom pre nego što počnemo da slušamo zatvaranje
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
    document.addEventListener('pointerdown', closeMenu);
  }, 50);
}

export function handleSignedInUI(user) {
  document.getElementById("btn-login")?.classList.add("hidden");
  const userInfo = document.getElementById("user-info");
  userInfo?.classList.remove("hidden");
  userInfo?.classList.add("flex");

  const avatar = document.getElementById("user-avatar");
  if (avatar) avatar.src = user.user_metadata?.avatar_url || "./assets/default-avatar.png";

  const greeting = document.getElementById("greeting-name");
  if (greeting) greeting.textContent = user.user_metadata?.full_name?.split(" ")[0] || "Korisnik";
}

export function handleSignedOutUI() {
  document.getElementById("btn-login")?.classList.remove("hidden");
  const userInfo = document.getElementById("user-info");
  userInfo?.classList.add("hidden");
  userInfo?.classList.remove("flex");

  const greeting = document.getElementById("greeting-name");
  if (greeting) greeting.textContent = "Korisnik";

  clearDashboard();
}

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


// POMOĆNA FUNKCIJA (Ista kao u api.js, osigurava ispravan prikaz u preview-u)
function parseLocalReceiptDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  if (dateStr.includes('-')) return dateStr;

  try {
    const cleanStr = dateStr.trim();
    const parts = cleanStr.split(/\s+/);
    const datePart = parts[0];
    const timePart = parts[1] || "00:00:00";

    const dateComponents = datePart.split('.').filter(Boolean);
    if (dateComponents.length < 3) return dateStr;

    const day = dateComponents[0].padStart(2, '0');
    const month = dateComponents[1].padStart(2, '0');
    const year = dateComponents[2];

    return `${year}-${month}-${day}T${timePart}`;
  } catch (e) {
    return dateStr;
  }
}