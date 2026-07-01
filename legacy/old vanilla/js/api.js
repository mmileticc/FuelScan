import { supabase, getAccessToken } from "./auth.js";
import { BACKEND_API_URL } from "./config.js";
import { parseLocalReceiptDate } from "./dateUtil.js";

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

