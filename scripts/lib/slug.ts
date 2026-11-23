import type { RichTextField } from "@prismicio/client";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

const CHAR_REPLACEMENTS: Record<string, string> = {
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
  ø: "o",
  Ø: "o",
  ß: "ss",
  ł: "l",
  Ł: "l",
  đ: "d",
  Đ: "d",
  þ: "th",
  Þ: "th",
};

export function slugify(input: string, maxLength = 88): string {
  const decoded = decodeHtmlEntities(input).trim();
  const replaced = decoded.replace(
    /[æÆœŒøØßłŁđĐþÞ]/g,
    (ch) => CHAR_REPLACEMENTS[ch] ?? ch,
  );
  const normalized = replaced
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) return "item";
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).replace(/-+$/g, "") || "item";
}

export interface NormalizedIsbn {
  raw: string;
  cleaned: string;
  kind: "isbn13" | "isbn10" | "asin" | "invalid" | "empty";
  isbn13?: string;
  isbn10?: string;
}

function isValidIsbn10(code: string): boolean {
  if (!/^\d{9}[\dX]$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const val = code[i] === "X" ? 10 : Number(code[i]);
    sum += val * (10 - i);
  }
  return sum % 11 === 0;
}

function isValidIsbn13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(code[12]);
}

export function isbn10To13(isbn10: string): string | undefined {
  if (!isValidIsbn10(isbn10)) return undefined;
  const stem = "978" + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(stem[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return stem + String(check);
}

export function isbn13To10(isbn13: string): string | undefined {
  if (!isValidIsbn13(isbn13) || !isbn13.startsWith("978")) return undefined;
  const stem = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(stem[i]) * (10 - i);
  }
  const rem = 11 - (sum % 11);
  const check = rem === 10 ? "X" : rem === 11 ? "0" : String(rem);
  return stem + check;
}

export function normalizeIsbn(raw: string): NormalizedIsbn {
  const trimmed = raw.trim();
  if (!trimmed) return { raw, cleaned: "", kind: "empty" };
  const cleaned = trimmed.replace(/[\s-]+/g, "").toUpperCase();
  if (/^\d{13}$/.test(cleaned) && (cleaned.startsWith("978") || cleaned.startsWith("979"))) {
    // Some catalogs contain ISBN-13s with bad check digits; accept 978/979 13-digit even if check digit is off,
    // while computing isbn10 only when valid.
    return {
      raw,
      cleaned,
      kind: "isbn13",
      isbn13: cleaned,
      isbn10: isbn13To10(cleaned),
    };
  }
  if (/^\d{9}[\dX]$/.test(cleaned)) {
    return {
      raw,
      cleaned,
      kind: "isbn10",
      isbn10: cleaned,
      isbn13: isbn10To13(cleaned),
    };
  }
  if (/^B0[A-Z0-9]{8}$/.test(cleaned)) {
    return { raw, cleaned, kind: "asin" };
  }
  return { raw, cleaned, kind: "invalid" };
}

type Span = {
  start: number;
  end: number;
  type: "strong" | "em" | "hyperlink";
  data?: { link_type: "Web"; url: string };
};

interface BlockAcc {
  type: "paragraph" | "list-item" | "o-list-item";
  text: string;
  spans: Span[];
}

export function htmlToRichText(html: string): RichTextField {
  const trimmed = html.trim();
  if (!trimmed) return [];

  // Normalize newlines in raw HTML source to spaces unless inside pre, since HTML collapses whitespace.
  const source = trimmed.replace(/\r\n?/g, "\n");
  const blocks: BlockAcc[] = [];
  let current: BlockAcc | null = null;
  let listMode: "ul" | "ol" | null = null;
  const openSpans: Array<{
    tag: string;
    type: "strong" | "em" | "hyperlink";
    start: number;
    url?: string;
  }> = [];

  const ensureBlock = (
    type: "paragraph" | "list-item" | "o-list-item" = "paragraph",
  ) => {
    if (!current) {
      current = { type, text: "", spans: [] };
    }
    return current;
  };

  const flushBlock = () => {
    if (!current) return;
    // Close any unclosed spans at current text end
    for (let i = openSpans.length - 1; i >= 0; i--) {
      const s = openSpans[i];
      if (current.text.length > s.start) {
        current.spans.push(
          s.type === "hyperlink" && s.url
            ? {
                start: s.start,
                end: current.text.length,
                type: "hyperlink",
                data: { link_type: "Web", url: s.url },
              }
            : { start: s.start, end: current.text.length, type: s.type === "hyperlink" ? "em" : s.type },
        );
      }
      s.start = 0; // reset for next block if span crossed block boundary
    }
    // Trim leading/trailing whitespace while adjusting span offsets
    const leading = current.text.length - current.text.trimStart().length;
    const trimmedText = current.text.trim();
    if (trimmedText) {
      const len = trimmedText.length;
      const adjustedSpans = current.spans
        .map((sp) => ({
          ...sp,
          start: Math.max(0, sp.start - leading),
          end: Math.min(len, sp.end - leading),
        }))
        .filter((sp) => sp.end > sp.start);
      blocks.push({
        type: current.type,
        text: trimmedText,
        spans: adjustedSpans,
      });
    }
    current = null;
  };

  const appendText = (rawText: string) => {
    const decoded = decodeHtmlEntities(rawText).replace(/\s+/g, " ");
    if (!decoded) return;
    const blk = ensureBlock(
      listMode === "ol" ? "o-list-item" : listMode === "ul" ? "list-item" : "paragraph",
    );
    if (!blk.text && decoded === " ") return;
    if (blk.text.endsWith(" ") && decoded.startsWith(" ")) {
      blk.text += decoded.slice(1);
    } else {
      blk.text += decoded;
    }
  };

  const tokenRe = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(source)) !== null) {
    if (m[4] !== undefined) {
      appendText(m[4]);
      continue;
    }
    const isClose = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3] || "";

    if (tag === "br") {
      flushBlock();
      continue;
    }

    if (tag === "div" || tag === "p" || tag === "blockquote" || /^h[1-6]$/.test(tag)) {
      flushBlock();
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      flushBlock();
      listMode = isClose ? null : tag;
      continue;
    }

    if (tag === "li") {
      flushBlock();
      if (!isClose) {
        ensureBlock(listMode === "ol" ? "o-list-item" : "list-item");
      }
      continue;
    }

    if (tag === "strong" || tag === "b" || tag === "em" || tag === "i" || tag === "a") {
      const spanType: "strong" | "em" | "hyperlink" =
        tag === "strong" || tag === "b"
          ? "strong"
          : tag === "em" || tag === "i"
            ? "em"
            : "hyperlink";
      if (!isClose) {
        const blk = ensureBlock(
          listMode === "ol" ? "o-list-item" : listMode === "ul" ? "list-item" : "paragraph",
        );
        let url: string | undefined;
        if (spanType === "hyperlink") {
          const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
          if (hrefMatch?.[1] && /^https?:\/\//i.test(hrefMatch[1])) {
            url = decodeHtmlEntities(hrefMatch[1]);
          }
        }
        openSpans.push({ tag, type: spanType, start: blk.text.length, url });
      } else {
        for (let i = openSpans.length - 1; i >= 0; i--) {
          if (openSpans[i].tag === tag) {
            const [s] = openSpans.splice(i, 1);
            const active = current as BlockAcc | null;
            if (active && active.text.length > s.start) {
              if (s.type === "hyperlink") {
                if (s.url) {
                  active.spans.push({
                    start: s.start,
                    end: active.text.length,
                    type: "hyperlink",
                    data: { link_type: "Web", url: s.url },
                  });
                }
              } else {
                active.spans.push({
                  start: s.start,
                  end: active.text.length,
                  type: s.type,
                });
              }
            }
            break;
          }
        }
      }
    }
  }

  flushBlock();

  return blocks.map((b) => ({
    type: b.type,
    text: b.text,
    spans: b.spans,
  })) as unknown as RichTextField;
}

export function looksLikePhysicalCollation(text: string): boolean {
  const s = text.trim();
  if (!s) return true;
  // e.g. "355 pages ; 20 cm", "xviii, 294 p. ; 24 cm.", "1 v."
  return /^(?:[ivxlcdm]+,\s*)?\d+\s*(?:pages|p\.?|leaves)\b.*(?:\d+\s*cm)?\.?$/i.test(
    s,
  );
}

export function plainTextToRichText(text: string): RichTextField {
  const cleaned = decodeHtmlEntities(text).replace(/\r\n?/g, "\n").trim();
  if (!cleaned || looksLikePhysicalCollation(cleaned)) return [];
  // Strip common Open Library markdown/source footer noise like "([source][1])"
  const paragraphs = cleaned
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return paragraphs.map((p) => ({
    type: "paragraph",
    text: p,
    spans: [],
  })) as unknown as RichTextField;
}
