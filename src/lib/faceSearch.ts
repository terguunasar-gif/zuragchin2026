// Царайгаар хайх: браузер дотор царайны 128 тоот «хээ» (descriptor) тооцоолно.
// Зураг, selfie серверт илгээгдэхгүй — зөвхөн тоон хээ.
// Номын сан (~1.3MB) болон загварууд (~7–12MB) хэрэгтэй үед л ачаалагдана.

import { supabase, publicDb } from './supabase';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

type FaceApi = typeof import('@vladmandic/face-api');
let apiPromise: Promise<FaceApi> | null = null;
const loaded = { ssd: false, tiny: false, base: false };

let backend = '';

/** Номын сан ачаалж, видео картын (WebGL) хурдасгуурыг асаана.
 *  WebGL ажиллахгүй бол CPU горимд маш удаан тул доорх функцууд жижиг загвар/хэмжээ ашиглана. */
async function api(): Promise<FaceApi> {
  if (!apiPromise) apiPromise = (async () => {
    const faceapi = await import('@vladmandic/face-api');
    try { await (faceapi.tf as any).setBackend('webgl'); } catch { /* CPU руу шилжинэ */ }
    await (faceapi.tf as any).ready();
    backend = (faceapi.tf as any).getBackend();
    console.info('[faceSearch] backend:', backend);
    return faceapi;
  })();
  return apiPromise;
}

/** Хөтчид дэлгэцээ шинэчлэх боломж олгоно (хуудас «гацах»-аас сэргийлнэ) */
const breathe = () => new Promise<void>(r => setTimeout(r, 30));

// ── Worker (тусдаа thread) — хуудас гацахаас бүрэн сэргийлнэ ──
type WorkerFace = { d: number[]; px: { x: number; y: number; w: number; h: number } };
let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, { res: (f: WorkerFace[]) => void; rej: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./faceWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; faces?: WorkerFace[]; error?: string; backend?: string }>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.backend && !backend) { backend = e.data.backend; console.info('[faceSearch] worker backend:', backend); }
        if (e.data.error) p.rej(new Error(e.data.error)); else p.res(e.data.faces ?? []);
      };
      worker.onerror = () => {
        workerBroken = true;
        pending.forEach(p => p.rej(new Error('worker failed')));
        pending.clear();
      };
    } catch {
      workerBroken = true;
      return null;
    }
  }
  return worker;
}

function toImageData(el: Drawable, max: number): ImageData {
  const { w, h } = sizeOf(el);
  const scale = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d')!;
  ctx.drawImage(el, 0, 0, c.width, c.height);
  return ctx.getImageData(0, 0, c.width, c.height);
}

function inWorker(kind: 'warm' | 'selfie' | 'photos', image?: ImageData): Promise<WorkerFace[]> | null {
  const w = getWorker();
  if (!w) return null;
  return new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    if (image) w.postMessage({ id, kind, image }, [image.data.buffer]);
    else w.postMessage({ id, kind });
  });
}

let warmed: Promise<void> | null = null;
/** Анхны тооцоололд WebGL шэйдерүүд хөрвүүлэгддэг (хэдэн секунд). Камер нээгдэх үед урьдчилан хийнэ. */
export function warmUpFaceModels(): Promise<void> {
  const viaWorker = inWorker('warm');
  if (viaWorker) return viaWorker.then(() => {}, () => {});
  if (!warmed) warmed = (async () => {
    const faceapi = await loadFaceModels('selfie');
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    c.getContext('2d')!.fillRect(0, 0, 160, 160);
    // Сүлжээ бүрийг тусад нь ажиллуулж, хооронд нь хөтчид амсхийх боломж өгнө
    await breathe();
    await faceapi.detectSingleFace(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 160 }));
    await breathe();
    await faceapi.detectFaceLandmarks(c);
    await breathe();
    await faceapi.computeFaceDescriptor(c);
  })().catch(() => {});
  return warmed;
}

/** 'photos' — бүлэг зурагт жижиг царай олох (SSD); 'selfie' — нэг том царай (хурдан, жижиг загвар) */
export async function loadFaceModels(kind: 'photos' | 'selfie'): Promise<FaceApi> {
  const faceapi = await api();
  const tasks: Promise<void>[] = [];
  if (!loaded.base) {
    tasks.push(faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL));
    tasks.push(faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL));
  }
  if (kind === 'photos' && !loaded.ssd) tasks.push(faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL));
  if (kind === 'selfie' && !loaded.tiny) tasks.push(faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL));
  await Promise.all(tasks);
  loaded.base = true;
  if (kind === 'photos') loaded.ssd = true; else loaded.tiny = true;
  return faceapi;
}

export interface FoundFace {
  d: number[];
  b: { x: number; y: number; w: number; h: number };
}

type Drawable = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

function sizeOf(el: Drawable) {
  if (el instanceof HTMLVideoElement) return { w: el.videoWidth, h: el.videoHeight };
  if (el instanceof HTMLImageElement) return { w: el.naturalWidth, h: el.naturalHeight };
  return { w: el.width, h: el.height };
}

/** Том зургийг хурдан боловсруулахын тулд жижигрүүлнэ */
function downscale(el: Drawable, max = 1600): HTMLCanvasElement | Drawable {
  const { w, h } = sizeOf(el);
  const scale = Math.min(1, max / Math.max(w, h));
  if (scale >= 1) return el;
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext('2d')!.drawImage(el, 0, 0, c.width, c.height);
  return c;
}

/** Зурган дахь бүх царай (бүлэг зураг). Хэт жижиг, бүдэг царайг алгасна. */
export async function facesInPhoto(el: Drawable): Promise<FoundFace[]> {
  const img = toImageData(el, 1600);
  try {
    const r = inWorker('photos', img);
    if (r) {
      const faces = await r;
      const W = img.width, H = img.height;
      return faces
        .filter(f => f.px.w >= 36 && f.px.h >= 36)
        .map(f => ({
          d: f.d.map(v => Math.round(v * 1e5) / 1e5),
          b: { x: +(f.px.x / W).toFixed(4), y: +(f.px.y / H).toFixed(4), w: +(f.px.w / W).toFixed(4), h: +(f.px.h / H).toFixed(4) },
        }));
    }
  } catch (e) { console.warn('[faceSearch] worker failed, using main thread', e); }
  return facesInPhotoMain(el);
}

async function facesInPhotoMain(el: Drawable): Promise<FoundFace[]> {
  const faceapi = await loadFaceModels('photos');
  await breathe();
  const input = downscale(el);
  const { w, h } = sizeOf(input as Drawable);
  const results = await faceapi
    .detectAllFaces(input as HTMLCanvasElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 60 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  return results
    .filter(r => r.detection.box.width >= 36 && r.detection.box.height >= 36)
    .map(r => ({
      d: Array.from(r.descriptor).map(v => Math.round(v * 1e5) / 1e5),
      b: {
        x: +(r.detection.box.x / w).toFixed(4), y: +(r.detection.box.y / h).toFixed(4),
        w: +(r.detection.box.width / w).toFixed(4), h: +(r.detection.box.height / h).toFixed(4),
      },
    }));
}

/** Selfie-ээс хамгийн том нэг царайны хээ. Олдохгүй бол null.
 *  Цомгийн зурагтай ижил (SSD) илрүүлэгч ашиглавал хээ илүү тохирдог; олдохгүй бол жижиг загвараар дахин оролдоно. */
export async function selfieDescriptor(el: Drawable): Promise<number[] | null> {
  try {
    const r = inWorker('selfie', toImageData(el, 640));
    if (r) {
      const faces = await r;
      if (faces.length === 0) return null;
      return faces.reduce((a, b) => (b.px.w * b.px.h > a.px.w * a.px.h ? b : a)).d;
    }
  } catch (e) { console.warn('[faceSearch] worker failed, using main thread', e); }
  return selfieDescriptorMain(el);
}

async function selfieDescriptorMain(el: Drawable): Promise<number[] | null> {
  // Selfie-д царай том тул 640px хангалттай — тооцоолол олон дахин хурдан
  const input = downscale(el, 640) as HTMLCanvasElement;
  await breathe();
  const faceapi = await loadFaceModels('selfie');
  await warmUpFaceModels();
  await breathe();
  // 1) Хурдан жижиг загвар
  let results = await faceapi
    .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  // 2) Олдохгүй бол илүү нарийн хэмжээ, сул босгоор дахин (SSD загвар хуудсыг гацаадаг тул selfie-д ашиглахгүй)
  if (results.length === 0) {
    await breathe();
    results = await faceapi
      .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
  }
  if (results.length === 0) return null;
  const best = results.reduce((a, b) => (b.detection.box.area > a.detection.box.area ? b : a));
  return Array.from(best.descriptor);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Зураг ачаалж чадсангүй'));
    img.src = src;
  });
}

export async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try { return await loadImage(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

/** Зургийн царайг тооцоолж серверт хадгална. Хадгалсан царайны тоог буцаана. */
export async function scanAndSavePhoto(photoId: string, el: Drawable): Promise<number> {
  const faces = await facesInPhoto(el);
  const { data, error } = await supabase.rpc('save_photo_faces', { p_photo_id: photoId, p_faces: faces });
  if (error) throw new Error(error.message);
  return Number(data ?? faces.length);
}

/** Боломжтой бол усан тэмдэггүй эх зургаас (илүү нарийвчлалтай), эс бөгөөс preview-ээс уншуулна */
export async function scanStoredPhoto(photo: { id: string; preview_url: string; original_url?: string | null }): Promise<number> {
  if (photo.original_url) {
    try {
      const path = photo.original_url.replace(/^photos-original\//, '');
      const { data } = await supabase.storage.from('photos-original').createSignedUrl(path, 300);
      if (data?.signedUrl) return await scanAndSavePhoto(photo.id, await loadImage(data.signedUrl));
    } catch { /* эх зураг унших эрхгүй бол preview ашиглана */ }
  }
  return scanAndSavePhoto(photo.id, await loadImage(photo.preview_url));
}

/** Тохирлын босго: бага = илүү хатуу. 0.58 нь бодит selfie ↔ арга хэмжээний зураг харьцуулалтад тохиромжтой. */
export const FACE_MATCH_THRESHOLD = 0.58;

/** Цомогт царайгаар хайх асаалттай эсэх (SQL ажиллаагүй үед false) */
export async function albumFaceSearchEnabled(albumId: string): Promise<boolean> {
  const { data, error } = await publicDb.from('albums').select('face_search_enabled').eq('id', albumId).maybeSingle();
  if (error || !data) return false;
  return !!(data as { face_search_enabled?: boolean }).face_search_enabled;
}
