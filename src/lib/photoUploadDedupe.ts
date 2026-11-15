/**
 * Цомогт зураг дахин оруулах үед ижил файлыг алгасна.
 * Тааруулалт: эх файлын нэр, том/жижиг үсэг хамаарахгүй.
 * Хэмжээ (byte) хадгалсан мөрөнд л нэмж шалгана — photo_uploads одоогоор хэмжээ хадгалдаггүй.
 */

export function filenameKey(name: string): string {
  return name.toLowerCase();
}

/** Нэг нэр дээр хадгалсан хэмжээнүүд. null = хэмжээ мэдэгдэхгүй, нэрээр нь таарна. */
export type ExistingIndex = Map<string, Array<number | null>>;

export function indexExisting(
  rows: { filename?: string | null; file_size?: number | null }[],
): ExistingIndex {
  const index: ExistingIndex = new Map();
  for (const row of rows) {
    const key = filenameKey(row.filename ?? '');
    if (!key) continue;
    const sizes = index.get(key) ?? [];
    sizes.push(typeof row.file_size === 'number' ? row.file_size : null);
    index.set(key, sizes);
  }
  return index;
}

export function albumHasFile(name: string, size: number, existing: ExistingIndex): boolean {
  const key = filenameKey(name);
  if (!key) return false;
  const sizes = existing.get(key);
  if (!sizes || sizes.length === 0) return false;
  if (sizes.some(s => s == null)) return true;
  return sizes.includes(size);
}

export function rememberFilename(index: ExistingIndex, name: string, size: number): void {
  const key = filenameKey(name);
  if (!key) return;
  const sizes = index.get(key) ?? [];
  sizes.push(size);
  index.set(key, sizes);
}

export interface UploadCandidate<T> {
  item: T;
  name: string;
  size: number;
  done?: boolean;
}

export interface UploadPlan<T> {
  upload: T[];
  skippedAlbum: T[];
  skippedSelection: T[];
}

/**
 * Цомогт байгаа нэрийг (нуусан зураг орсон) болон нэг сонголт доторх давхардлыг хасна.
 * Хоосон нэрийг цомгийн давхардлаар тооцохгүй.
 */
export function planUploads<T>(files: UploadCandidate<T>[], existing: ExistingIndex): UploadPlan<T> {
  const seen = new Set<string>();
  const upload: T[] = [];
  const skippedAlbum: T[] = [];
  const skippedSelection: T[] = [];
  for (const file of files) {
    if (file.done) continue;
    const key = filenameKey(file.name);
    if (key && albumHasFile(file.name, file.size, existing)) {
      skippedAlbum.push(file.item);
      continue;
    }
    if (key && seen.has(key)) {
      skippedSelection.push(file.item);
      continue;
    }
    if (key) seen.add(key);
    upload.push(file.item);
  }
  return { upload, skippedAlbum, skippedSelection };
}

/** Байршуулалт эхлэхэд харуулах өгүүлбэр. Цомогт байгаа давхардлыг л «аль хэдийн орсон» гэж тоолно. */
export function uploadSkipSummary(skippedAlbum: number, uploading: number, skippedSelection = 0): string | null {
  const parts: string[] = [];
  if (skippedAlbum > 0) {
    parts.push(`${skippedAlbum} зураг аль хэдийн орсон тул алгаслаа, ${uploading} зураг оруулж байна`);
  }
  if (skippedSelection > 0) {
    parts.push(`Нэг зургийг давхар сонгосон ${skippedSelection} файлыг алгаслаа.`);
  }
  return parts.length ? parts.join(' ') : null;
}
