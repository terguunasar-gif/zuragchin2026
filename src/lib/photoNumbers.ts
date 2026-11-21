/**
 * Зургийн дугаар (№) — «Томоор үзүүлэх дэлгэц» (AlbumKioskPage)-тэй ЯГ ижил дүрмээр.
 * Дэлгэц дээр «Орой» хавтсанд №146 гэж харсан зургийг утсан дээр мөн «Орой» хавтсанд №146-аар олно.
 *  - Зургууд оруулсан дарааллаар (created_at өсөхөөр) — дуудагч тэр дарааллаар өгнө.
 *  - «Бүгд» (all): бүх зургийн дунд 1-ээс.
 *  - Хавтас: тухайн хавтсын зургуудын дунд 1-ээс.
 *  - «AI бүүт» (ai): AI бүүтийн зургуудын дунд 1-ээс.
 *  - Бусад таб (Миний зургууд, Бусад, …): «Бүгд»-ийн дугаар.
 */
export interface NumberedPhoto { id: string; folder_id?: string | null; source?: string | null }

export function photoNumberMap(photos: NumberedPhoto[], tab: string): Map<string, number> {
  const isFolderTab = tab !== 'all' && tab !== 'ai' && photos.some(p => p.folder_id === tab);
  const list = tab === 'ai'
    ? photos.filter(p => p.source === 'ai_booth')
    : isFolderTab ? photos.filter(p => p.folder_id === tab) : photos;
  const m = new Map<string, number>();
  list.forEach((p, i) => m.set(p.id, i + 1));
  return m;
}

/** «146», «№146», « 146 » → 146; буруу бол null */
export function parsePhotoNumber(v: string): number | null {
  const n = Number(String(v).replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
