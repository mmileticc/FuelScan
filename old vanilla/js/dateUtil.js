// POMOĆNA FUNKCIJA: Pretvara "18.6.2026. 11:14:31" u "2026-06-18T11:14:31"
export function parseLocalReceiptDate(dateStr) {
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