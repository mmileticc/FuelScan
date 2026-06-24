export function renderHistoryList(receipts) {
  const list = document.getElementById("history-list");
  if (!list) return;

  if (!receipts.length) {
    list.innerHTML = '<li class="text-slate-500 text-sm text-center py-10">Istorija je prazna.</li>';
    return;
  }

  list.innerHTML = receipts.map((r) => {
    const locationText = [r.address, r.city].filter(Boolean).join(", ") || "Nepoznata lokacija";
    
    return `
    <li class="history-item relative bg-surface-card border border-surface-border rounded-xl px-4 py-4 space-y-2 cursor-pointer" data-id="${r.id}">
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
    
    let startX = 0;
    let startY = 0;
    const MOVE_THRESHOLD = 10;

    item.style.webkitUserSelect = 'none';
    item.style.userSelect = 'none';
    item.style.touchAction = 'pan-y'; 

    const startTimer = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return; 
      
      isPressing = true;
      menuOpened = false;
      
      startX = e.clientX;
      startY = e.clientY;

      timer = setTimeout(() => {
        if (isPressing) {
          menuOpened = true;
          if (navigator.vibrate) navigator.vibrate(50);
          
          showDeleteMenu(item, () => {
            onDeleteCallback(item.dataset.id);
          });
          isPressing = false;
        }
      }, 600);
    };

    const cancelTimer = () => {
      isPressing = false;
      clearTimeout(timer);
    };

    const handlePointerMove = (e) => {
      if (!isPressing) return;
      
      const diffX = Math.abs(e.clientX - startX);
      const diffY = Math.abs(e.clientY - startY);
      
      if (diffX > MOVE_THRESHOLD || diffY > MOVE_THRESHOLD) {
        cancelTimer();
      }
    };

    item.addEventListener('pointerdown', startTimer);
    item.addEventListener('pointerup', cancelTimer);
    item.addEventListener('pointerleave', cancelTimer);
    item.addEventListener('pointercancel', cancelTimer);
    item.addEventListener('pointermove', handlePointerMove); 

    item.addEventListener('dragstart', (e) => e.preventDefault());

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

export function showDeleteMenu(itemElement, onConfirm) {
 document.getElementById("floating-delete-menu")?.remove();

  const menu = document.createElement('div');
  menu.id = "floating-delete-menu";
  
menu.className = "absolute z-[100] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-600 text-white px-6 py-3 rounded-xl shadow-lg cursor-pointer font-bold text-sm whitespace-nowrap";  menu.innerHTML = `Obriši`;

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

  itemElement.appendChild(menu);
  
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('pointerdown', closeMenu);
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
    document.addEventListener('pointerdown', closeMenu);
  }, 50);
}