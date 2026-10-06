// Камерын өмнө хэдэн хүн байгааг утас/kiosk дээр нь тоолно (MediaPipe, үнэгүй).
// Загвар ачаалагдахгүй бол null буцаана — тэр үед AI бүх хүнийг өөрөө оруулна.

import type { FaceDetector } from '@mediapipe/tasks-vision';

const VERSION = '1.0.1';
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let detectorPromise: Promise<FaceDetector | null> | null = null;

export function loadFaceDetector(): Promise<FaceDetector | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
        return await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.6,
        });
      } catch (err) {
        console.warn('Face detector unavailable:', err);
        return null;
      }
    })();
  }
  return detectorPromise;
}

/** Хангалттай том (жижиг арын хүн биш) нүүрнүүдийг тоолно. */
export async function countFaces(source: HTMLCanvasElement | HTMLVideoElement): Promise<number | null> {
  const detector = await loadFaceDetector();
  if (!detector) return null;
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  if (!width) return null;
  try {
    const result = detector.detect(source);
    // Цаана өнгөрч буй хүмүүсийг тоолохгүйн тулд зургийн өргөний 6%-аас том нүүрийг л авна
    const minSize = width * 0.06;
    return result.detections.filter(d => (d.boundingBox?.width ?? 0) >= minSize).length;
  } catch (err) {
    console.warn('Face detection failed:', err);
    return null;
  }
}
