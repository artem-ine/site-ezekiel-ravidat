import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { RichTextField } from "@prismicio/client";
import {
  decodeHtmlEntities,
  htmlToRichText,
  normalizeIsbn,
  slugify,
  type NormalizedIsbn,
} from "./slug";
import { REPO_ROOT } from "./env";

const OWNED_OVERRIDE_TITLES = new Set<string>(
  (
    JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "scripts/owned-overrides.json"), "utf8"),
    ) as { titles: string[] }
  ).titles,
);

export type BookFormat = "paperback" | "hardcover" | "digital" | "audio";
export type ReadStatus = "not-read" | "currently-reading" | "read" | "did-not-finish";
export type ContributorRole =
  | "narrator"
  | "translator"
  | "editor"
  | "illustrator"
  | "other";
export type Pace = "slow" | "medium" | "fast";
export type CharacterOrPlot = "Character" | "Plot" | "A mix";
export type YesNoComplicated = "Yes" | "No" | "It's complicated";

export interface ParsedContributor {
  name: string;
  role: ContributorRole;
  rawRole?: string;
}

export interface ParsedDateRange {
  date_started: string | null;
  date_finished: string | null;
}

export interface ParsedCsvBook {
  rowIndex: number; // 1-based data row index in CSV
  uid: string;
  title: string;
  authors: string[];
  contributors: ParsedContributor[];
  isbnRaw: string;
  isbn: NormalizedIsbn;
  format: BookFormat | null;
  owned: boolean;
  readStatus: ReadStatus | null;
  dateAdded: string | null;
  lastDateRead: string | null;
  yearRead: number | null;
  readCount: number | null;
  datesRead: ParsedDateRange[];
  rating: number | null;
  reviewRichText: RichTextField;
  hasReview: boolean;
  moods: string[];
  pace: Pace | null;
  characterOrPlotDriven: CharacterOrPlot | null;
  strongCharacterDevelopment: YesNoComplicated | null;
  loveableCharacters: YesNoComplicated | null;
  diverseCharacters: YesNoComplicated | null;
  flawedCharacters: YesNoComplicated | null;
  contentWarnings: string | null;
  contentWarningDescription: string | null;
}

export interface CsvParseSummary {
  totalRows: number;
  keptRows: number;
  skippedRows: number;
  keptBreakdown: Record<string, number>;
  skippedBreakdown: Record<string, number>;
  unicodeReplacementCount: number;
  nonAsciiTitlesOrAuthors: number;
  duplicateTitleCount: number;
  emptyIsbnCount: number;
  asinCount: number;
  malformedIsbnRows: Array<{ rowIndex: number; title: string; isbn: string }>;
  partialDateRows: Array<{ rowIndex: number; title: string; field: string; value: string }>;
}

const VALID_FORMATS = new Set<BookFormat>([
  "paperback",
  "hardcover",
  "digital",
  "audio",
]);

const IMPORT_STATUSES = new Set<string>([
  "read",
  "did-not-finish",
  "currently-reading",
]);

const VALID_STATUSES = new Set<ReadStatus>([
  "not-read",
  "currently-reading",
  "read",
  "did-not-finish",
]);

export function mapStoryGraphReadStatus(raw: string): ReadStatus | null {
  const s = raw.trim().toLowerCase();
  if (s === "" || s === "to-read") return "not-read";
  return VALID_STATUSES.has(s as ReadStatus) ? (s as ReadStatus) : null;
}

function parseSlashDate(raw: string): { isoDate: string | null; year: number | null } {
  const s = raw.trim();
  if (!s) return { isoDate: null, year: null };
  const full = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (full) {
    return {
      isoDate: `${full[1]}-${full[2]}-${full[3]}`,
      year: Number(full[1]),
    };
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return { isoDate: s, year: Number(iso[1]) };
  }
  const yearOnly = s.match(/^(\d{4})$/);
  if (yearOnly) {
    return { isoDate: null, year: Number(yearOnly[1]) };
  }
  return { isoDate: null, year: null };
}

function parseDatesRead(raw: string): {
  ranges: ParsedDateRange[];
  latestYear: number | null;
  partialValues: string[];
} {
  const trimmed = raw.trim();
  if (!trimmed) return { ranges: [], latestYear: null, partialValues: [] };
  const parts = trimmed
    .split(/\s*,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const ranges: ParsedDateRange[] = [];
  const partialValues: string[] = [];
  let latestYear: number | null = null;

  for (const part of parts) {
    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-", 2);
      const start = parseSlashDate(startRaw);
      const end = parseSlashDate(endRaw);
      if (end.year && (!latestYear || end.year > latestYear)) {
        latestYear = end.year;
      } else if (start.year && (!latestYear || start.year > latestYear)) {
        latestYear = start.year;
      }
      if (start.isoDate || end.isoDate) {
        ranges.push({
          date_started: start.isoDate,
          date_finished: end.isoDate,
        });
      } else {
        partialValues.push(part);
      }
    } else {
      const single = parseSlashDate(part);
      if (single.year && (!latestYear || single.year > latestYear)) {
        latestYear = single.year;
      }
      if (single.isoDate) {
        ranges.push({
          date_started: null,
          date_finished: single.isoDate,
        });
      } else {
        partialValues.push(part);
      }
    }
  }
  return { ranges, latestYear, partialValues };
}

function parseContributors(raw: string): ParsedContributor[] {
  const s = decodeHtmlEntities(raw).trim();
  if (!s) return [];
  const out: ParsedContributor[] = [];
  for (const part of s.split(/\s*,\s*/)) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (m) {
      const name = m[1].trim();
      const rawRole = m[2].trim();
      const lower = rawRole.toLowerCase();
      let role: ContributorRole = "other";
      if (lower === "narrator") role = "narrator";
      else if (lower === "translator") role = "translator";
      else if (lower === "editor") role = "editor";
      else if (lower === "illustrator") role = "illustrator";
      out.push({ name, role, rawRole });
    } else {
      out.push({ name: p, role: "other" });
    }
  }
  return out;
}

function asSelect<T extends string>(val: string, allowed: ReadonlyArray<T>): T | null {
  const s = val.trim();
  return (allowed as ReadonlyArray<string>).includes(s) ? (s as T) : null;
}

export function parseStorygraphCsv(csvPath: string): {
  books: ParsedCsvBook[];
  summary: CsvParseSummary;
} {
  const raw = fs.readFileSync(csvPath, "utf8");
  const unicodeReplacementCount = (raw.match(/\uFFFD/g) ?? []).length;

  const records = parse(raw, {
    columns: true,
    bom: true,
    relax_column_count: false,
  }) as Record<string, string>[];

  const keptBreakdown: Record<string, number> = {};
  const skippedBreakdown: Record<string, number> = {};
  const malformedIsbnRows: CsvParseSummary["malformedIsbnRows"] = [];
  const partialDateRows: CsvParseSummary["partialDateRows"] = [];
  let nonAsciiTitlesOrAuthors = 0;
  let emptyIsbnCount = 0;
  let asinCount = 0;

  const preliminary: Array<Omit<ParsedCsvBook, "uid"> & { baseSlug: string }> = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowIndex = i + 1;
    const ownedInCsv = (row["Owned?"] ?? "").trim() === "Yes";
    const ownedByOverride = !ownedInCsv && OWNED_OVERRIDE_TITLES.has((row["Title"] ?? "").trim());
    const owned = ownedInCsv || ownedByOverride;
    const statusRaw = (row["Read Status"] ?? "").trim();
    const ownedLabel = ownedByOverride ? "Override" : owned ? "Yes" : "No";
    const key = `Owned=${ownedLabel}, Status=${statusRaw || "(empty)"}`;

    const shouldImport = owned || IMPORT_STATUSES.has(statusRaw);
    if (!shouldImport) {
      skippedBreakdown[key] = (skippedBreakdown[key] ?? 0) + 1;
      continue;
    }
    if (owned) {
      keptBreakdown[key] = (keptBreakdown[key] ?? 0) + 1;
    } else {
      skippedBreakdown[key] = (skippedBreakdown[key] ?? 0) + 1;
    }

    const title = decodeHtmlEntities(row["Title"] ?? "").trim();
    const authors = decodeHtmlEntities(row["Authors"] ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    if (/[^\x00-\x7F]/.test(title + authors.join(""))) {
      nonAsciiTitlesOrAuthors++;
    }

    const isbnRaw = (row["ISBN/UID"] ?? "").trim();
    const isbn = normalizeIsbn(isbnRaw);
    if (isbn.kind === "empty") emptyIsbnCount++;
    else if (isbn.kind === "asin") asinCount++;
    else if (isbn.kind === "invalid") {
      malformedIsbnRows.push({ rowIndex, title, isbn: isbnRaw });
    }

    const format = asSelect(row["Format"] ?? "", [...VALID_FORMATS]);
    const readStatus = mapStoryGraphReadStatus(statusRaw);

    const dateAddedParsed = parseSlashDate(row["Date Added"] ?? "");
    const lastDateParsed = parseSlashDate(row["Last Date Read"] ?? "");
    if ((row["Last Date Read"] ?? "").trim() && !lastDateParsed.isoDate) {
      partialDateRows.push({
        rowIndex,
        title,
        field: "Last Date Read",
        value: (row["Last Date Read"] ?? "").trim(),
      });
    }

    const datesReadParsed = parseDatesRead(row["Dates Read"] ?? "");
    for (const pv of datesReadParsed.partialValues) {
      partialDateRows.push({
        rowIndex,
        title,
        field: "Dates Read",
        value: pv,
      });
    }

    let yearRead = lastDateParsed.year ?? datesReadParsed.latestYear;
    if (yearRead !== null && (yearRead < 1900 || yearRead > 2100)) {
      yearRead = null;
    }

    const rcStr = (row["Read Count"] ?? "").trim();
    const readCount =
      rcStr !== "" && /^\d+$/.test(rcStr) ? Number.parseInt(rcStr, 10) : null;

    const ratingStr = (row["Star Rating"] ?? "").trim();
    const rating =
      ratingStr !== "" && !Number.isNaN(Number(ratingStr))
        ? Number(ratingStr)
        : null;

    const reviewRaw = (row["Review"] ?? "").trim();
    const reviewRichText = htmlToRichText(reviewRaw);

    const moods = (row["Moods"] ?? "")
      .split(",")
      .map((m) => decodeHtmlEntities(m).trim())
      .filter(Boolean);

    preliminary.push({
      rowIndex,
      baseSlug: slugify(title, 68),
      title,
      authors,
      contributors: parseContributors(row["Contributors"] ?? ""),
      isbnRaw,
      isbn,
      format,
      owned,
      readStatus,
      dateAdded: dateAddedParsed.isoDate,
      lastDateRead: lastDateParsed.isoDate,
      yearRead,
      readCount,
      datesRead: datesReadParsed.ranges,
      rating,
      reviewRichText,
      hasReview: reviewRichText.length > 0,
      moods,
      pace: asSelect(row["Pace"] ?? "", ["slow", "medium", "fast"]),
      characterOrPlotDriven: asSelect(row["Character- or Plot-Driven?"] ?? "", [
        "Character",
        "Plot",
        "A mix",
      ]),
      strongCharacterDevelopment: asSelect(
        row["Strong Character Development?"] ?? "",
        ["Yes", "No", "It's complicated"],
      ),
      loveableCharacters: asSelect(row["Loveable Characters?"] ?? "", [
        "Yes",
        "No",
        "It's complicated",
      ]),
      diverseCharacters: asSelect(row["Diverse Characters?"] ?? "", [
        "Yes",
        "No",
        "It's complicated",
      ]),
      flawedCharacters: asSelect(row["Flawed Characters?"] ?? "", [
        "Yes",
        "No",
        "It's complicated",
      ]),
      contentWarnings:
        decodeHtmlEntities(row["Content Warnings"] ?? "").trim() || null,
      contentWarningDescription:
        decodeHtmlEntities(row["Content Warning Description"] ?? "").trim() ||
        null,
    });
  }

  // UIDs are assigned across every importable row, owned or not, so an owned
  // copy keeps the uid it already has in Prismic when an unowned duplicate exists.
  const slugCounts = new Map<string, number>();
  for (const item of preliminary) {
    slugCounts.set(item.baseSlug, (slugCounts.get(item.baseSlug) ?? 0) + 1);
  }
  const duplicateTitleCount = [...slugCounts.values()].filter((c) => c > 1).length;

  const usedUids = new Set<string>();
  const books: ParsedCsvBook[] = preliminary.map((item) => {
    let candidate = item.baseSlug;
    if ((slugCounts.get(item.baseSlug) ?? 0) > 1) {
      if (item.isbn.cleaned) {
        candidate = `${item.baseSlug}-${item.isbn.cleaned.toLowerCase()}`;
      } else if (item.format) {
        candidate = `${item.baseSlug}-${item.format}`;
      }
    }
    if (usedUids.has(candidate)) {
      let n = 2;
      while (usedUids.has(`${candidate}-${n}`)) n++;
      candidate = `${candidate}-${n}`;
    }
    usedUids.add(candidate);
    const result = { ...item, uid: candidate } as ParsedCsvBook & { baseSlug?: string };
    delete result.baseSlug;
    return result;
  });

  const ownedBooks = books.filter((b) => b.owned);
  return {
    books: ownedBooks,
    summary: {
      totalRows: records.length,
      keptRows: ownedBooks.length,
      skippedRows: records.length - ownedBooks.length,
      keptBreakdown,
      skippedBreakdown,
      unicodeReplacementCount,
      nonAsciiTitlesOrAuthors,
      duplicateTitleCount,
      emptyIsbnCount,
      asinCount,
      malformedIsbnRows,
      partialDateRows,
    },
  };
}
