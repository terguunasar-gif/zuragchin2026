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
    "Framing: chest-up portrait (head, shoulders and upper chest), faces large, sharp and well lit, everyone looking at the camera.",
  );
  lines.push(
    "IDENTITY IS THE MOST IMPORTANT RULE: keep every person's face identical to Image 1 — same facial structure, eyes, eyebrows, nose, mouth, teeth, skin tone, age, hairline, hairstyle, facial hair, glasses if worn, and natural expression. " +
      "Do not beautify, slim, de-age or change anyone's ethnicity. Do not swap faces between people. Do not add, remove, merge or duplicate people.",
  );

  const areas = [input.logoPosition, input.textPosition]
    .filter((p): p is string => !!p && !!AREA_NAMES[p])
    .map((p) => AREA_NAMES[p]);
  const uniqueAreas = [...new Set(areas)];
  if (uniqueAreas.length > 0) {
    lines.push(
      `Keep the ${uniqueAreas.join(" and the ")} of the image as calm, uncluttered background with no faces or important details — a logo and text will be added there later.`,
    );
  }
  lines.push(
    "Do not draw any text, letters, numbers, logos, signatures or watermarks anywhere in the image.",
  );

  return lines.join("\n");
}

/** 3–4 хүнтэй зурагт нүүр жижиг болох тул илүү өндөр нягтралтай гаргана. */
export function imageSizeFor(peopleCount: number | null | undefined): "1K" | "2K" {
  return clampPeople(peopleCount) >= 3 || clampPeople(peopleCount) === 0 ? "2K" : "1K";
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
}): string {
  const n = Math.min(Math.max(Math.floor(input.peopleCount) || 2, 1), MAX_PEOPLE);
  return [
    `Create a high-quality example portrait image showing ${PREVIEW_PEOPLE[n]}, in this scene: ${input.scenePrompt.trim()}`,
    `Composition: ${compositionFor(n, input.compositionOverrides)}`,
    "Framing: chest-up portrait (head, shoulders and upper chest), faces large, sharp, natural and well lit, everyone looking at the camera with a friendly expression.",
    "The people must be entirely fictional and must not resemble any real or famous person.",
    "Do not draw any text, letters, numbers, logos, signatures or watermarks anywhere in the image.",
  ].join("\n");
}
