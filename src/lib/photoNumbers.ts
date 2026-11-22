/**
 * Зургийн дугаар (№) — «Томоор үзүүлэх дэлгэц» (AlbumKioskPage)-тэй ЯГ ижил дүрмээр.
 *  - Зургууд оруулсан дарааллаар (created_at өсөхөөр) — дуудагч тэр дарааллаар өгнө.
 *  - Дугаар нь ЦОМОГ ДОТРОО давтагдахгүй: хэдэн ч хавтас үүсгэсэн, аль ч таб (хавтас, AI бүүт, …)
 *    дээр нэг зураг үргэлж нэг ижил дугаартай (бүх зургийн дунд 1-ээс).
 *    Өмнө нь хавтас бүрт 1-ээс эхэлдэг байсан тул өөр хавтасны зурагтай давхцдаг байв.
 *  - tab параметрийг хуучин дуудлагуудтай нийцүүлэх үүднээс үлдээсэн (дугаарт нөлөөлөхгүй).
 */
export interface NumberedPhoto { id: string; folder_id?: string | null; source?: string | null }

export function photoNumberMap(photos: NumberedPhoto[], _tab?: string): Map<string, number> { // eslint-disable-line @typescript-eslint/no-unused-vars
  const m = new Map<string, number>();
  photos.forEach((p, i) => m.set(p.id, i + 1));
  return m;
}

/** «146», «№146», « 146 » → 146; буруу бол null */
export function parsePhotoNumber(v: string): number | null {
  const n = Number(String(v).replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
