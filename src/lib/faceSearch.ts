// Царайгаар хайх: браузер дотор царайны 128 тоот «хээ» (descriptor) тооцоолно.
// Зураг, selfie серверт илгээгдэхгүй — зөвхөн тоон хээ.
// Номын сан (~1.3MB) болон загварууд (~7–12MB) хэрэгтэй үед л ачаалагдана.

import { supabase } from './supabase';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

type FaceApi = typeof import('@vladmandic/face-api');
let apiPromise: Promise<FaceApi> | null = null;
const loaded = { ssd: false, tiny: false, base: false };

async function api(): Promise<FaceApi> {
  if (!apiPromise) apiPromise = import('@vladmandic/face-api');
  return apiPromise;
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
  const faceapi = await loadFaceModels('photos');
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
  const faceapi = await loadFaceModels('photos');
  const input = downscale(el, 1280);
  let results = await faceapi
    .detectAllFaces(input as HTMLCanvasElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (results.length === 0) {
    await loadFaceModels('selfie');
    results = await faceapi
      .detectAllFaces(input as HTMLCanvasElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 }))
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
  const { data, error } = await supabase.from('albums').select('face_search_enabled').eq('id', albumId).maybeSingle();
  if (error || !data) return false;
  return !!(data as { face_search_enabled?: boolean }).face_search_enabled;
}
