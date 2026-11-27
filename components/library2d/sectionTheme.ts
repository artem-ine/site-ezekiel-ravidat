/** Per-genre rooms for the 2D walk: palette, mood, and which scene (props, wall, floor) it gets. */

export type ThemeId =
  | "fantasy"
  | "scifi"
  | "romance"
  | "mystery"
  | "horror"
  | "literary"
  | "history"
  | "nature"
  | "ya"
  | "civic"
  | "mind";

export type SectionTheme = {
  id: ThemeId;
  sky: string;
  wall: string;
  wallDeep: string;
  floor: string;
  floorDeep: string;
  accent: string;
  light: string;
  mood: "dark" | "cool" | "warm" | "bright" | "moss";
};

const THEMES: Record<ThemeId, SectionTheme> = {
  fantasy: {
    id: "fantasy",
    sky: "#b2bacd",
    wall: "#908295",
    wallDeep: "#7a6d7f",
    floor: "#8a6a50",
    floorDeep: "#6a4a38",
    accent: "#c9a227",
    light: "rgb(200 180 255 / 0.35)",
    mood: "dark",
  },
  scifi: {
    id: "scifi",
    sky: "#b4d0e4",
    wall: "#d0dce4",
    wallDeep: "#a9bdd0",
    floor: "#a8b8c8",
    floorDeep: "#7a90a4",
    accent: "#3a7ca5",
    light: "rgb(160 220 255 / 0.55)",
    mood: "cool",
  },
  romance: {
    id: "romance",
    sky: "#eed0c2",
    wall: "#e8cebd",
    wallDeep: "#d3aca1",
    floor: "#d4a078",
    floorDeep: "#b07850",
    accent: "#a04a4a",
    light: "rgb(255 200 160 / 0.45)",
    mood: "warm",
  },
  mystery: {
    id: "mystery",
    sky: "#bcc2cb",
    wall: "#9ba4ac",
    wallDeep: "#858d95",
    floor: "#8a7460",
    floorDeep: "#6a5644",
    accent: "#6a8098",
    light: "rgb(170 190 220 / 0.35)",
    mood: "dark",
  },
  horror: {
    id: "horror",
    sky: "#b298a1",
    wall: "#a68285",
    wallDeep: "#906c6e",
    floor: "#7a5040",
    floorDeep: "#5a3828",
    accent: "#a04038",
    light: "rgb(255 140 110 / 0.28)",
    mood: "dark",
  },
  literary: {
    id: "literary",
    sky: "#dde4d3",
    wall: "#e4dac8",
    wallDeep: "#cfc2ac",
    floor: "#c9a66a",
    floorDeep: "#a88248",
    accent: "#6b4a2e",
    light: "rgb(255 230 180 / 0.4)",
    mood: "bright",
  },
  history: {
    id: "history",
    sky: "#d2c5ac",
    wall: "#daceb1",
    wallDeep: "#c1b495",
    floor: "#8a6a40",
    floorDeep: "#6a4e2e",
    accent: "#a07b35",
    light: "rgb(255 210 140 / 0.35)",
    mood: "warm",
  },
  nature: {
    id: "nature",
    sky: "#c7d9bd",
    wall: "#d2dcc2",
    wallDeep: "#a6bb95",
    floor: "#8a7a50",
    floorDeep: "#6a5a38",
    accent: "#3f5a3c",
    light: "rgb(180 220 160 / 0.4)",
    mood: "moss",
  },
  ya: {
    id: "ya",
    sky: "#cfcfd6",
    wall: "#ddd9d7",
    wallDeep: "#c4bec1",
    floor: "#8d7f74",
    floorDeep: "#6e6158",
    accent: "#5d4a6e",
    light: "rgb(220 220 240 / 0.35)",
    mood: "cool",
  },
  civic: {
    id: "civic",
    sky: "#d7dcde",
    wall: "#dcd6cb",
    wallDeep: "#c3bcae",
    floor: "#9a9a98",
    floorDeep: "#78787a",
    accent: "#c0392b",
    light: "rgb(255 240 210 / 0.3)",
    mood: "cool",
  },
  mind: {
    id: "mind",
    sky: "#e2e7e1",
    wall: "#e7e7db",
    wallDeep: "#d0d4c2",
    floor: "#c8b690",
    floorDeep: "#a69470",
    accent: "#7a9a8a",
    light: "rgb(230 245 235 / 0.5)",
    mood: "bright",
  },
};

/** Most specific first: "Science & Nature" must reach nature before "science" reaches sci-fi. */
const KEYWORD_MAP: Array<{ match: RegExp; theme: ThemeId }> = [
  { match: /young adult|children|middle grade|\bya\b|teen/i, theme: "ya" },
  { match: /nature|garden|travel|food|cook|outdoor|ecolog|animal/i, theme: "nature" },
  { match: /sci-?fi|science fiction|space|cyber|speculative|future/i, theme: "scifi" },
  { match: /fantas|epic|myth|fairy|dragon|magic/i, theme: "fantasy" },
  { match: /roman|love|erotica/i, theme: "romance" },
  { match: /horror|gothic|ghost|weird/i, theme: "horror" },
  { match: /crime|myster|thriller|detect|noir|suspense/i, theme: "mystery" },
  { match: /health|mind|grief|wellness|self-help|psycholog|spirit|philosoph/i, theme: "mind" },
  {
    match: /politic|activis|race|coloni|gender|sexual|feminis|queer|lgbt|societ|civil/i,
    theme: "civic",
  },
  { match: /histor|biograph|memoir|\bwar\b|military/i, theme: "history" },
  { match: /literar|fiction|classic|poetry|essay|drama|short stor|humou?r|satire|art|culture|critic/i, theme: "literary" },
];

export function themeForLabel(label: string): SectionTheme {
  for (const entry of KEYWORD_MAP) {
    if (entry.match.test(label)) return THEMES[entry.theme];
  }
  return THEMES.literary;
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
