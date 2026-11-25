/** Per-section wall / light / wallpaper themes for the 2D walk. */

export type SectionTheme = {
  id: string;
  sky: string;
  wall: string;
  wallDeep: string;
  floor: string;
  floorDeep: string;
  accent: string;
  light: string;
  pattern: "stripes" | "diamonds" | "dots" | "panels" | "plain";
  mood: "dark" | "cool" | "warm" | "bright" | "moss";
};

const THEMES: SectionTheme[] = [
  {
    id: "fantasy",
    sky: "#9aa8c8",
    wall: "#6a5878",
    wallDeep: "#4a3a58",
    floor: "#8a6a50",
    floorDeep: "#6a4a38",
    accent: "#c9a227",
    light: "rgb(200 180 255 / 0.35)",
    pattern: "diamonds",
    mood: "dark",
  },
  {
    id: "scifi",
    sky: "#9ec8e8",
    wall: "#c5d8e8",
    wallDeep: "#8eaccc",
    floor: "#a8b8c8",
    floorDeep: "#7a90a4",
    accent: "#3a7ca5",
    light: "rgb(160 220 255 / 0.55)",
    pattern: "panels",
    mood: "cool",
  },
  {
    id: "romance",
    sky: "#f0c8b8",
    wall: "#e8c4b0",
    wallDeep: "#c99488",
    floor: "#d4a078",
    floorDeep: "#b07850",
    accent: "#a04a4a",
    light: "rgb(255 200 160 / 0.45)",
    pattern: "stripes",
    mood: "warm",
  },
  {
    id: "mystery",
    sky: "#a8b4c4",
    wall: "#7a8898",
    wallDeep: "#5a6878",
    floor: "#8a7460",
    floorDeep: "#6a5644",
    accent: "#6a8098",
    light: "rgb(170 190 220 / 0.35)",
    pattern: "dots",
    mood: "dark",
  },
  {
    id: "literary",
    sky: "#d8e4d0",
    wall: "#e2d6c0",
    wallDeep: "#c4b498",
    floor: "#c9a66a",
    floorDeep: "#a88248",
    accent: "#6b4a2e",
    light: "rgb(255 230 180 / 0.4)",
    pattern: "plain",
    mood: "bright",
  },
  {
    id: "history",
    sky: "#c8b898",
    wall: "#d4c4a0",
    wallDeep: "#b0a078",
    floor: "#8a6a40",
    floorDeep: "#6a4e2e",
    accent: "#a07b35",
    light: "rgb(255 210 140 / 0.35)",
    pattern: "stripes",
    mood: "warm",
  },
  {
    id: "nature",
    sky: "#b8d4b0",
    wall: "#c8d8b8",
    wallDeep: "#8aaa78",
    floor: "#8a7a50",
    floorDeep: "#6a5a38",
    accent: "#3f5a3c",
    light: "rgb(180 220 160 / 0.4)",
    pattern: "dots",
    mood: "moss",
  },
  {
    id: "horror",
    sky: "#9a7888",
    wall: "#8a5860",
    wallDeep: "#6a3840",
    floor: "#7a5040",
    floorDeep: "#5a3828",
    accent: "#a04038",
    light: "rgb(255 140 110 / 0.28)",
    pattern: "panels",
    mood: "dark",
  },
];

const KEYWORD_MAP: Array<{ match: RegExp; theme: string }> = [
  { match: /fantas|epic|myth|fairy|dragon|magic/i, theme: "fantasy" },
  { match: /sci-?fi|science|space|cyber|speculative|future/i, theme: "scifi" },
  { match: /roman|love|erotica|relationship/i, theme: "romance" },
  { match: /myster|thriller|crime|detect|noir|suspense/i, theme: "mystery" },
  { match: /horror|gothic|ghost|weird/i, theme: "horror" },
  { match: /histor|biography|memoir|war|politic/i, theme: "history" },
  { match: /nature|garden|travel|food|cook|outdoors/i, theme: "nature" },
  { match: /literary|fiction|classic|poetry|essay|drama/i, theme: "literary" },
];

function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value;
}

export function themeForLabel(label: string): SectionTheme {
  for (const entry of KEYWORD_MAP) {
    if (entry.match.test(label)) {
      return THEMES.find((t) => t.id === entry.theme) ?? THEMES[0];
    }
  }
  return THEMES[hash(label) % THEMES.length];
}

/** Decor layout variant so neighbouring sections never look identical. */
export type DecorKit =
  | "tall-hearth"
  | "low-nook"
  | "mezzanine"
  | "ladder-desk"
  | "plants-globe"
  | "balcony-clock";

const KITS: DecorKit[] = [
  "tall-hearth",
  "low-nook",
  "mezzanine",
  "ladder-desk",
  "plants-globe",
  "balcony-clock",
];

export function decorKitForIndex(index: number): DecorKit {
  return KITS[index % KITS.length];
}
