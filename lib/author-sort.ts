const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "phd"]);
const PARTICLES = new Set([
  "de", "del", "della", "di", "da", "du", "la", "le", "van", "von", "der", "den", "al", "el", "bin", "ibn", "st",
]);

const LAST = "\uffff";

function plain(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Library-style key for shelving by author: surname first, so "Isaac Asimov"
 * files under "asimov". Uses the stored sort name when there is one.
 */
export function authorSortKey(name: string | null | undefined, sortName?: string | null): string {
  const stored = sortName?.trim();
  if (stored) return plain(stored);

  const text = name?.trim();
  if (!text) return LAST;
  if (text.includes(",")) return plain(text);

  const words = text.split(/\s+/);
  while (words.length > 1 && SUFFIXES.has(plain(words[words.length - 1]!).replace(/\./g, ""))) {
    words.pop();
  }

  let surnameStart = words.length - 1;
  while (surnameStart > 1 && PARTICLES.has(plain(words[surnameStart - 1]!).replace(/\./g, ""))) {
    surnameStart -= 1;
  }

  const surname = words.slice(surnameStart).join(" ");
  const given = words.slice(0, surnameStart).join(" ");
  return plain(`${surname} ${given}`.trim());
}
