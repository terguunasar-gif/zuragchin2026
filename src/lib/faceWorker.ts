/// <reference lib="webworker" />
// Царай танилтыг тусдаа «worker» thread дээр ажиллуулна — хуудас (камер, товч) хэзээ ч гацахгүй.
import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

let ready: Promise<string> | null = null;

function init(): Promise<string> {
  if (!ready) ready = (async () => {
    // Worker дотор DOM байхгүй — OffscreenCanvas-аар орлуулна
    /* eslint-disable @typescript-eslint/no-explicit-any */
    class Unsupported { constructor() { throw new Error('not available in worker'); } }
    faceapi.env.setEnv({
      Canvas: OffscreenCanvas as any,
      CanvasRenderingContext2D: OffscreenCanvasRenderingContext2D as any,
      Image: Unsupported as any,
      ImageData,
      Video: Unsupported as any,
      createCanvasElement: () => new OffscreenCanvas(1, 1) as any,
      createImageElement: () => new (Unsupported as any)(),
      createVideoElement: () => new (Unsupported as any)(),
      fetch: (url: string, init?: RequestInit) => fetch(url, init),
      readFile: () => { throw new Error('readFile not available'); },
    } as any);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    try { await (faceapi.tf as any).setBackend('webgl'); } catch { /* CPU */ }
    await (faceapi.tf as any).ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    // Анхны тооцоолол (шэйдер хөрвүүлэлт)
    const t = faceapi.tf.zeros([160, 160, 3]) as faceapi.tf.Tensor3D;
    await faceapi.detectAllFaces(t, new faceapi.TinyFaceDetectorOptions({ inputSize: 160 }));
    await faceapi.detectFaceLandmarks(t);
    await faceapi.computeFaceDescriptor(t);
    t.dispose();
    return (faceapi.tf as any).getBackend();
  })();
  return ready;
}

type Req = { id: number; kind: 'warm' | 'selfie' | 'photos'; image?: ImageData };

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, kind, image } = e.data;
  try {
    const backend = await init();
    if (kind === 'warm' || !image) { self.postMessage({ id, faces: [], backend }); return; }
    const input = faceapi.tf.browser.fromPixels(image) as faceapi.tf.Tensor3D;
    try {
      let results;
      if (kind === 'selfie') {
        results = await faceapi.detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
          .withFaceLandmarks().withFaceDescriptors();
        if (results.length === 0) {
          results = await faceapi.detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
            .withFaceLandmarks().withFaceDescriptors();
        }
      } else {
        results = await faceapi.detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 60 }))
          .withFaceLandmarks().withFaceDescriptors();
      }
      const faces = results.map(r => ({
        d: Array.from(r.descriptor),
        px: { x: r.detection.box.x, y: r.detection.box.y, w: r.detection.box.width, h: r.detection.box.height },
      }));
      self.postMessage({ id, faces, backend });
    } finally {
      input.dispose();
    }
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
