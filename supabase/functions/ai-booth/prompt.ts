// AI бүүтийн prompt угсрагч.
// Темплет нь зөвхөн орчин/хувцас/гэрлийг (scene_prompt) тайлбарлана.
// Нүүр хадгалах дүрэм, хүний тооны байрлал, логоны хоосон зайг энд нэмнэ.

export const MAX_PEOPLE = 4;

const DEFAULT_COMPOSITION: Record<number, string> = {
  0: "Include every person who appears in Image 1, arranged naturally and close together.",
  1: "A single person, centered in the frame, facing the camera.",
  2: "Exactly 2 people standing side by side, shoulders close together, both facing the camera.",
  3: "Exactly 3 people in a natural group: one in the center slightly forward and one on each side, all facing the camera.",
  4: "Exactly 4 people in a natural, tight group: two slightly in front and two slightly behind between them, all faces clearly visible and facing the camera.",
};

const AREA_NAMES: Record<string, string> = {
  "top-left": "top-left corner",
  "top-center": "top edge (center)",
  "top-right": "top-right corner",
  "middle-left": "left edge",
  "middle-right": "right edge",
  "center": "center",
  "middle-center": "center",
  "bottom-left": "bottom-left corner",
  "bottom-center": "bottom edge (center)",
  "bottom-right": "bottom-right corner",
};

export interface PromptInput {
  scenePrompt: string;
  peopleCount: number | null | undefined;
  compositionOverrides?: Record<string, string> | null;
  hasStyleRef: boolean;
  logoPosition?: string | null; // logo байгаа үед л
  textPosition?: string | null; // бичиг байгаа үед л
  allowText?: boolean; // темплет өөрөө зураг доторх бичиг шаарддаг эсэх
}

const QUALITY_LINE =
  "Overall quality: high-end commercial holiday photography — cinematic lighting, rich color grading, ultra-detailed textures, shallow depth of field, faces sharp and well lit. If the scene asks for a cartoon, animated or vintage style, follow the scene's style instead.";

// Image 1 нь ихэвчлэн цээжнээс дээш зураг тул биеийг AI шинээр зурна.
// Толгой том, бие бүдүүн гарахаас сэргийлж хэмжээ харьцааг тодорхой заана.
const BODY_LINE =
  "BODY & PROPORTIONS: Image 1 usually shows only the head and shoulders, so only the FACE and HAIR must match Image 1 — the body, pose and clothing are newly created. " +
  "Give every person a natural, elegant, well-proportioned adult figure: realistic head-to-body ratio (the head is about one-eighth of the standing height, never oversized), long neck and straight posture, a slim-to-average build with garments tailored to fit and flatter. " +
  "Scale each head correctly to its body and to the scene; do not paste a large head onto a small or wide body.";

function noTextLine(allowText?: boolean): string {
  return allowText
    ? "Apart from the text explicitly requested in the scene (spell it exactly as given), do not draw any other text, letters, numbers, logos, signatures, camera captions (such as \"Shot on ...\") or watermarks."
    : "Do not draw any text, letters, numbers, logos, signatures, camera captions (such as \"Shot on ...\") or watermarks anywhere in the image.";
}

export function clampPeople(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return 0;
  return Math.min(Math.floor(n), MAX_PEOPLE);
}

export function compositionFor(
  peopleCount: number | null | undefined,
  overrides?: Record<string, string> | null,
): string {
  const n = clampPeople(peopleCount);
  const custom = overrides?.[String(n)];
  if (typeof custom === "string" && custom.trim()) return custom.trim();
  return DEFAULT_COMPOSITION[n];
}

export function buildPrompt(input: PromptInput): string {
  const n = clampPeople(input.peopleCount);
  const who = n === 0
    ? "the people"
    : n === 1
    ? "exactly 1 person"
    : `exactly ${n} people`;

  const lines: string[] = [];

  lines.push(
    `Image 1 is a real photo of ${who}, taken at an event photo booth.` +
      (input.hasStyleRef
        ? " Image 2 is a scene and style reference only — never copy any person or face from Image 2."
        : ""),
  );
  lines.push(
    `Create a new high-quality portrait image of ${n === 0 ? "the same people" : `the same ${n === 1 ? "person" : `${n} people`}`} from Image 1 in this scene: ${input.scenePrompt.trim()}`,
  );
  lines.push(`Composition: ${compositionFor(n, input.compositionOverrides)}`);
  lines.push(
    "Framing: follow the framing described in the scene; if none is given, use a 3/4-length portrait. Every face from Image 1 must stay clearly visible, sharp and well lit.",
  );
  lines.push(
    "IDENTITY IS THE MOST IMPORTANT RULE: keep every person's face identical to Image 1 — same facial structure, eyes, eyebrows, nose, mouth shape, skin tone, real adult age, hairline, hairstyle, facial hair and glasses if worn. " +
      "Keep their natural expression unless the scene or composition asks for a specific expression or emotion. " +
      "Do not change anyone's ethnicity or age. Do not swap faces between people. Do not add, remove, merge or duplicate the people from Image 1; add extra characters only if the scene explicitly describes them, and they must not resemble anyone from Image 1.",
  );
  lines.push(BODY_LINE);
  lines.push(QUALITY_LINE);

  const areas = [input.logoPosition, input.textPosition]
    .filter((p): p is string => !!p && !!AREA_NAMES[p])
    .map((p) => AREA_NAMES[p]);
  const uniqueAreas = [...new Set(areas)];
  if (uniqueAreas.length > 0) {
    lines.push(
      `Keep the ${uniqueAreas.join(" and the ")} of the image as calm, uncluttered background with no faces or important details — a logo and text will be added there later.`,
    );
  }
  lines.push(noTextLine(input.allowText));

  return lines.join("\n");
}

/** 3–4 хүнтэй зурагт нүүр жижиг болох тул илүү өндөр нягтралтай гаргана. */
// Тансаг, нарийн зурагт (цасан бөмбөлөг доторх жижиг нүүр гэх мэт) үргэлж 2K ашиглана.
export function imageSizeFor(_peopleCount: number | null | undefined): "1K" | "2K" {
  return "2K";
}

const PREVIEW_PEOPLE: Record<number, string> = {
  1: "one fictional adult Mongolian woman in her late 20s",
  2: "two fictional adult Mongolians, a man and a woman in their 30s",
  3: "three fictional adult Mongolian friends (two women and one man) in their 20s–30s",
  4: "four fictional adult Mongolian colleagues (two women and two men) of mixed ages",
};

/**
 * Темплетийн жишээ зураг (preview) үүсгэх prompt. Жинхэнэ хүний зураг ашиглахгүй —
 * зохиомол хүмүүсээр темплетийн хэв маягийг харуулна.
 */
export function buildPreviewPrompt(input: {
  scenePrompt: string;
  peopleCount: number;
  compositionOverrides?: Record<string, string> | null;
  allowText?: boolean;
}): string {
  const n = Math.min(Math.max(Math.floor(input.peopleCount) || 2, 1), MAX_PEOPLE);
  return [
    `Create a high-quality example image featuring ${PREVIEW_PEOPLE[n]} (these are "the people" of the scene), in this scene: ${input.scenePrompt.trim()}`,
    `Composition: ${compositionFor(n, input.compositionOverrides)}`,
    "Framing: follow the framing described in the scene; if none is given, use a 3/4-length portrait. Faces must be clearly visible, sharp, natural and well lit.",
    "The people must be entirely fictional and must not resemble any real or famous person. Any extra character described in the scene is also fictional.",
    "Give everyone natural, elegant, well-proportioned adult figures with a realistic head-to-body ratio.",
    QUALITY_LINE,
    noTextLine(input.allowText),
  ].join("\n");
}
