// Pomocné funkce pro práci s "místním" datem (YYYY-MM-DD) BEZ použití
// Date#toISOString(), které vždy převádí na UTC. V českém časovém pásmu
// (UTC+1/+2) to u toISOString() občas vracelo včerejší/zítřejší datum —
// typicky se to projevilo jako nefunkční tlačítko "Další den" (posun o
// den dopředu se po převodu do UTC často "vrátil" na stejné datum) nebo
// špatné "dnešní" datum těsně po půlnoci. Všechny tyhle funkce počítají
// čistě s místním časem prohlížeče.

export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayLocalStr(): string {
  return toLocalDateStr(new Date());
}

export function addDaysLocalStr(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toLocalDateStr(d);
}

// Pondělí týdne, ve kterém leží dané datum (česká konvence Po–Ne).
export function startOfWeekLocalStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 = Ne, 1 = Po, ... 6 = So
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toLocalDateStr(d);
}
