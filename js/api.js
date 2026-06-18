import { supabase, getAccessToken } from "./auth.js";
import { BACKEND_API_URL } from "./config.js";

export async function parseReceipt(url) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Nema aktivne sesije.");

  const response = await fetch(BACKEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ url }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || payload.message || `HTTP ${response.status}`);
  }
  return payload;
}

export async function saveReceiptToSupabase(receipt) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("Korisnik nije prijavljen.");

  const row = {
    user_id: userId,
    station: receipt.station ?? null,
    fuel_type: receipt.fuel_type ?? null,
    liters: receipt.liters ?? null,
    price_per_l: receipt.price_per_l ?? null,
    total: receipt.total ?? null,
    date: parseLocalReceiptDate(receipt.date) ?? null,
    raw_url: receipt.raw_url ?? null,
    address: receipt.address ?? null,
    city: receipt.city ?? null,
    municipality: receipt.municipality ?? null,
  };

  const { error } = await supabase.from("fuel_receipts").insert([row]);
  if (error) throw error;
}

export async function fetchUserReceipts() {
  const { data, error } = await supabase
    .from("fuel_receipts")
    .select("*")
    .order("date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function deleteReceipt(id) {
  const { error } = await supabase
    .from("fuel_receipts")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}

// POMOĆNA FUNKCIJA: Pretvara "18.6.2026. 11:14:31" u "2026-06-18T11:14:31"
function parseLocalReceiptDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  if (dateStr.includes('-')) return dateStr; // Ako je već ISO format, preskoči

  try {
    const cleanStr = dateStr.trim();
    const parts = cleanStr.split(/\s+/); // Razdvaja datum od vremena
    const datePart = parts[0];
    const timePart = parts[1] || "00:00:00";

    // Razbijamo komponente datuma i filtriramo prazne karaktere (od završne tačke)
    const dateComponents = datePart.split('.').filter(Boolean);
    if (dateComponents.length < 3) return dateStr;

    const day = dateComponents[0].padStart(2, '0');
    const month = dateComponents[1].padStart(2, '0');
    const year = dateComponents[2];

    return `${year}-${month}-${day}T${timePart}`;
  } catch (e) {
    console.error("Greška pri normalizaciji datuma:", e);
    return dateStr;
  }
}