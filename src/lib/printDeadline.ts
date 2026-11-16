/** NULL = хязгааргүй (хуучин цомог). Өнгөрсөн огноо = угаалгах хаагдана. Татах хэвээр. */
export function printOrdersOpen(deadline: string | null | undefined, now = Date.now()): boolean {
  if (deadline == null || deadline === '') return true;
  const t = new Date(deadline).getTime();
  if (!Number.isFinite(t)) return true;
  return now <= t;
}

/** Тухайн өдрийн 23:59:59 хүртэл захиалга авна. */
export function endOfDay(from: Date, extraDays = 0): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + extraDays);
  d.setHours(23, 59, 59, 0);
  return d;
}

/** Шинэ цомог: арга хэмжээнээс 7 хоногийн дараа. Огноо байхгүй бол өнөөдрөөс. */
export function defaultPrintDeadlineIso(eventDate: string | null | undefined, now = new Date()): string {
  let base = now;
  if (eventDate) {
    const e = new Date(`${eventDate.slice(0, 10)}T12:00:00`);
    if (Number.isFinite(e.getTime())) base = e;
  }
  return endOfDay(base, 7).toISOString();
}

export function deadlineDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function dateInputToDeadlineIso(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T23:59:59`);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

export function formatPrintDay(iso: string, locale = 'mn-MN'): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}
