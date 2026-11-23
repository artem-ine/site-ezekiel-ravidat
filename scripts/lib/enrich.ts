import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  CACHE_DIR,
  COVERS_CACHE_DIR,
  LOOKUP_CACHE_PATH,
  USER_AGENT,
} from "./env";
import {
  decodeHtmlEntities,
  looksLikePhysicalCollation,
  normalizeIsbn,
  slugify,
  type NormalizedIsbn,
} from "./slug";

export type MatchQuality =
  | "isbn_exact"
  | "search_exact"
  | "google_fallback"
  | "ambiguous"
  | "not_found";

export type SeriesSource =
  | "openlibrary_edition"
  | "openlibrary_work_subject"
  | "google_books"
  | "none";

export interface EnrichedCover {
  localPath: string;
  filename: string;
  mimeType: string;
  sourceUrl: string;
}

export interface EnrichedBook {
  matchQuality: MatchQuality;
  sourceNotes: string[];
  isbnMismatch?: {
    csvIsbn: string;
    foundTitle: string;
  };
  subtitle: string | null;
  description: string | null;
  publishYear: number | null;
  pageCount: number | null;
  rawSubjects: string[];
  seriesName: string | null;
  seriesPosition: number | null;
  seriesSource: SeriesSource;
  cover: EnrichedCover | null;
  resolvedAuthors?: string[];
  resolvedIsbn?: string;
}

interface CacheFile {
  version: number;
  httpJson: Record<string, { status: number; data: unknown }>;
  covers: Record<
    string,
    {
      status: number;
      localFile?: string;
      filename?: string;
      mimeType?: string;
      sourceUrl?: string;
    }
  >;
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "of",
  "a",
  "an",
  "in",
  "on",
  "to",
  "for",
  "with",
  "by",
  "from",
  "or",
  "as",
  "at",
  "la",
  "le",
  "les",
  "de",
  "du",
  "des",
  "un",
  "une",
  "et",
]);

function normalizeWords(text: string, dropSubtitle = true): string[] {
  let s = decodeHtmlEntities(text).toLowerCase();
  if (dropSubtitle) {
    s = s.split(":")[0];
  }
  s = s
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return s
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

function normalizedPhrase(text: string, dropSubtitle = true): string {
  return normalizeWords(text, dropSubtitle).join(" ");
}

export function titleSimilarity(a: string, b: string): number {
  const pa = normalizedPhrase(a, true);
  const pb = normalizedPhrase(b, true);
  if (!pa || !pb) return 0;
  if (pa === pb) return 1;
  if (pa.includes(pb) || pb.includes(pa)) {
    const shorter = Math.min(pa.length, pb.length);
    const longer = Math.max(pa.length, pb.length);
    return shorter / longer >= 0.4 ? 0.85 : 0.65;
  }
  const wa = new Set(normalizeWords(a, false));
  const wb = new Set(normalizeWords(b, false));
  if (!wa.size || !wb.size) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  const union = new Set([...wa, ...wb]).size;
  const jaccard = common / union;
  const overlapMin = common / Math.min(wa.size, wb.size);
  return Math.max(jaccard, overlapMin * 0.8);
}

export function authorsOverlap(csvAuthors: string[], candAuthors: string[]): boolean {
  if (!csvAuthors.length || !candAuthors.length) return false;
  const candText = candAuthors
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const a of csvAuthors) {
    const parts = a
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((p) => p.length >= 3);
    if (!parts.length) continue;
    const last = parts[parts.length - 1];
    if (candText.includes(last)) return true;
  }
  return false;
}

export function parseSeriesString(raw: string): {
  name: string;
  position: number | null;
} | null {
  let s = decodeHtmlEntities(raw).trim();
  if (!s) return null;
  s = s.replace(/^(?:series|franchise)\s*:\s*/i, "").trim();
  if (!s || /^(?:unknown|none|n\/a|\d+)$/i.test(s)) return null;

  let position: number | null = null;
  let name = s;

  const patterns = [
    /^(.+?)\s*[,;]\s*(?:book|bk\.?|vol\.?|volume|v\.?|no\.?|part|#)?\s*(\d+(?:\.\d+)?)\s*$/i,
    /^(.+?)\s*#\s*(\d+(?:\.\d+)?)\s*$/i,
    /^(.+?)\s*\(\s*(?:book|bk\.?|vol\.?|v\.?|#)?\s*(\d+(?:\.\d+)?)\s*\)\s*$/i,
    /^(.+?)\s+(?:book|bk\.?|volume|vol\.?)\s+(\d+(?:\.\d+)?)\s*$/i,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      name = m[1].trim();
      const num = Number(m[2]);
      if (Number.isFinite(num) && num >= 0 && num < 500) {
        position = num;
      }
      break;
    }
  }

  name = name
    .replace(/\s*\(\s*(?:series|trilogy|quartet|duology|saga)\s*\)\s*$/i, "")
    .replace(/[,;:\-]+$/, "")
    .trim();

  if (!name || /^\d+$/.test(name)) return null;
  if (!name.includes(" ") && /-/.test(name)) {
    name = name.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  }
  return { name, position };
}

function extractYear(raw: unknown): number | null {
  if (typeof raw === "number" && raw >= 1000 && raw <= 2100) return Math.trunc(raw);
  if (typeof raw !== "string") return null;
  const m = raw.match(/\b(1[0-9]{3}|20[0-9]{2}|2100)\b/);
  return m ? Number(m[1]) : null;
}

function extractPageCount(edition: Record<string, unknown>, searchDoc?: Record<string, unknown>): number | null {
  const num = edition.number_of_pages;
  if (typeof num === "number" && num >= 1 && num < 20000) return Math.trunc(num);
  const pag = edition.pagination;
  if (typeof pag === "string") {
    const m = pag.match(/\b(\d{2,5})\s*(?:p\.?|pages)\b/i) ?? pag.match(/^\s*(\d{2,5})\s*p?\.?\s*$/i);
    if (m) {
      const val = Number(m[1]);
      if (val >= 1 && val < 20000) return val;
    }
  }
  const med = searchDoc?.number_of_pages_median;
  if (typeof med === "number" && med >= 1 && med < 20000) return Math.trunc(med);
  return null;
}

function extractDescription(raw: unknown): string | null {
  let val = "";
  if (typeof raw === "string") val = raw;
  else if (raw && typeof raw === "object" && "value" in raw && typeof (raw as { value: unknown }).value === "string") {
    val = (raw as { value: string }).value;
  }
  val = decodeHtmlEntities(val).trim();
  if (!val || looksLikePhysicalCollation(val)) return null;
  // Strip common Open Library trailing source links e.g. "([source][1]) ... [1]: http..."
  val = val.replace(/\n+\[\d+\]:\s*https?:\/\/\S+/g, "").trim();
  return val || null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class RatePacer {
  private lastStartAt = 0;
  private blockedUntil = 0;
  private inFlight = 0;
  private gate: Promise<void> = Promise.resolve();

  constructor(
    private readonly minIntervalMs: number,
    private readonly maxConcurrency: number,
  ) {}

  backoff(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + ms);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (true) {
      let releaseGate!: () => void;
      const prevGate = this.gate;
      this.gate = new Promise<void>((r) => {
        releaseGate = r;
      });
      await prevGate;
      try {
        while (this.inFlight >= this.maxConcurrency) {
          await sleep(40);
        }
        const now = Date.now();
        const waitMs = Math.max(
          this.blockedUntil - now,
          this.lastStartAt + this.minIntervalMs - now,
        );
        if (waitMs > 0) await sleep(waitMs);
        this.lastStartAt = Date.now();
        this.inFlight++;
      } finally {
        releaseGate();
      }
      try {
        return await fn();
      } finally {
        this.inFlight--;
      }
    }
  }
}

function spaceInitials(author: string): string {
  return author.replace(/([A-Za-z])\.(?=[A-Za-z])/g, "$1. ");
}

function isAuxiliaryAdaptationOrGuide(doc: Record<string, unknown>, inputTitle: string): boolean {
  const titleLower = (typeof doc.title === "string" ? doc.title : "").toLowerCase();
  const inLower = inputTitle.toLowerCase();
  const subjects = Array.isArray(doc.subject)
    ? doc.subject.map((s) => String(s).toLowerCase())
    : [];
  const authors = Array.isArray(doc.author_name)
    ? doc.author_name.map((a) => String(a).toLowerCase())
    : [];
  if (
    !inLower.includes("study guide") &&
    (titleLower.startsWith("study guide") ||
      titleLower.includes("supersummary") ||
      authors.includes("supersummary"))
  ) {
    return true;
  }
  if (
    !inLower.includes("graphic novel") &&
    !inLower.includes("comics") &&
    subjects.some((s) => s.includes("comics & graphic novels, adaptations"))
  ) {
    return true;
  }
  return false;
}

export class BookEnricher {
  private cache: CacheFile;
  private dirty = false;
  private gbConsecutive429 = 0;
  private gbCircuitOpen = false;
  private readonly olPacer = new RatePacer(350, 3);
  private readonly coverPacer = new RatePacer(250, 3);
  private readonly gbPacer = new RatePacer(500, 1);

  constructor(private readonly options: { noCache?: boolean } = {}) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.mkdirSync(COVERS_CACHE_DIR, { recursive: true });
    if (!options.noCache && fs.existsSync(LOOKUP_CACHE_PATH)) {
      try {
        this.cache = JSON.parse(fs.readFileSync(LOOKUP_CACHE_PATH, "utf8")) as CacheFile;
      } catch {
        this.cache = { version: 1, httpJson: {}, covers: {} };
      }
    } else {
      this.cache = { version: 1, httpJson: {}, covers: {} };
    }
  }

  saveCache(): void {
    if (!this.dirty) return;
    const tmp = `${LOOKUP_CACHE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.cache), "utf8");
    fs.renameSync(tmp, LOOKUP_CACHE_PATH);
    this.dirty = false;
  }

  get isGoogleBooksRateLimited(): boolean {
    return this.gbCircuitOpen;
  }

  private scheduleOl<T>(fn: () => Promise<T>): Promise<T> {
    return this.olPacer.run(fn);
  }

  private scheduleCover<T>(fn: () => Promise<T>): Promise<T> {
    return this.coverPacer.run(fn);
  }

  private scheduleGb<T>(fn: () => Promise<T>): Promise<T> {
    return this.gbPacer.run(fn);
  }

  private async fetchJsonCached(
    url: string,
    provider: "ol" | "gb",
  ): Promise<{ status: number; data: Record<string, unknown> | null }> {
    const cached = !this.options.noCache ? this.cache.httpJson[url] : undefined;
    if (cached) {
      return {
        status: cached.status,
        data: (cached.data as Record<string, unknown> | null) ?? null,
      };
    }

    if (provider === "gb" && this.gbCircuitOpen && !process.env.GOOGLE_BOOKS_API_KEY) {
      return { status: 429, data: null };
    }

    const runner = provider === "ol" ? this.scheduleOl.bind(this) : this.scheduleGb.bind(this);
    const result = await runner(async () => {
      let attempt = 0;
      while (attempt < 4) {
        attempt++;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const res = await fetch(url, {
            headers: {
              "User-Agent": USER_AGENT,
              Accept: "application/json",
            },
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (res.status === 429 || res.status === 503) {
            if (provider === "gb") {
              this.gbConsecutive429++;
              if (this.gbConsecutive429 >= 2 && !process.env.GOOGLE_BOOKS_API_KEY) {
                this.gbCircuitOpen = true;
                return { status: 429, data: null };
              }
            }
            const ra = Number(res.headers.get("retry-after"));
            const delayMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500 * attempt;
            if (provider === "ol") this.olPacer.backoff(Math.min(delayMs, 8000));
            await sleep(Math.min(delayMs, 8000));
            continue;
          }

          if (provider === "gb") this.gbConsecutive429 = 0;

          if (!res.ok) {
            return { status: res.status, data: null };
          }
          const data = (await res.json()) as Record<string, unknown>;
          return { status: res.status, data };
        } catch {
          clearTimeout(timer);
          if (attempt >= 3) return { status: 0, data: null };
          await sleep(1000 * attempt);
        }
      }
      return { status: 429, data: null };
    });

    // Do not cache transient 0 / 429 / 5xx failures
    if (result.status === 200 || result.status === 404) {
      this.cache.httpJson[url] = result;
      this.dirty = true;
    }
    return result;
  }

  private async downloadCoverCached(
    candidateUrls: string[],
    slugHint: string,
  ): Promise<EnrichedCover | null> {
    for (const url of candidateUrls) {
      const existing = !this.options.noCache ? this.cache.covers[url] : undefined;
      if (existing) {
        if (existing.status === 200 && existing.localFile) {
          const full = path.join(COVERS_CACHE_DIR, existing.localFile);
          if (fs.existsSync(full) && fs.statSync(full).size > 500) {
            return {
              localPath: full,
              filename: existing.filename ?? existing.localFile,
              mimeType: existing.mimeType ?? "image/jpeg",
              sourceUrl: url,
            };
          }
        }
        if (existing.status === 404) continue;
      }

      const res = await this.scheduleCover(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const r = await fetch(url, {
            headers: { "User-Agent": USER_AGENT },
            redirect: "follow",
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!r.ok) {
            return { status: r.status, buf: null as Buffer | null, mime: "" };
          }
          const ct = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
          if (!ct.startsWith("image/")) {
            return { status: 404, buf: null, mime: "" };
          }
          const ab = await r.arrayBuffer();
          const buf = Buffer.from(ab);
          if (buf.length <= 500) {
            return { status: 404, buf: null, mime: "" };
          }
          return { status: 200, buf, mime: ct };
        } catch {
          clearTimeout(timer);
          return { status: 0, buf: null, mime: "" };
        }
      });

      if (res.status === 200 && res.buf) {
        const ext =
          res.mime === "image/png"
            ? "png"
            : res.mime === "image/webp"
              ? "webp"
              : res.mime === "image/gif"
                ? "gif"
                : "jpg";
        const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 10);
        const filename = `${slugify(slugHint, 50)}-${hash}.${ext}`;
        const localPath = path.join(COVERS_CACHE_DIR, filename);
        fs.writeFileSync(localPath, res.buf);
        this.cache.covers[url] = {
          status: 200,
          localFile: filename,
          filename,
          mimeType: res.mime,
          sourceUrl: url,
        };
        this.dirty = true;
        return { localPath, filename, mimeType: res.mime, sourceUrl: url };
      }

      if (res.status === 404) {
        this.cache.covers[url] = { status: 404 };
        this.dirty = true;
      }
    }
    return null;
  }

  async enrichBook(input: {
    title: string;
    authors: string[];
    isbn: NormalizedIsbn;
    uid: string;
    hintFirstPublishYear?: number | null;
  }): Promise<EnrichedBook> {
    const notes: string[] = [];
    let matchQuality: MatchQuality = "not_found";
    let edition: Record<string, unknown> | null = null;
    let work: Record<string, unknown> | null = null;
    let searchDoc: Record<string, unknown> | null = null;
    let isbnMismatch: EnrichedBook["isbnMismatch"];

    const isbnsToTry: string[] = [];
    if (input.isbn.isbn13) isbnsToTry.push(input.isbn.isbn13);
    if (input.isbn.isbn10 && input.isbn.isbn10 !== input.isbn.isbn13) {
      isbnsToTry.push(input.isbn.isbn10);
    }

    // 1. Try Open Library /isbn/<isbn>.json
    for (const code of isbnsToTry) {
      const edRes = await this.fetchJsonCached(
        `https://openlibrary.org/isbn/${code}.json`,
        "ol",
      );
      if (edRes.status === 200 && edRes.data) {
        const edTitle = typeof edRes.data.title === "string" ? edRes.data.title : "";
        let wkData: Record<string, unknown> | null = null;
        const works = Array.isArray(edRes.data.works) ? edRes.data.works : [];
        const wkKey =
          works[0] && typeof works[0] === "object" && "key" in works[0]
            ? String((works[0] as { key: string }).key)
            : null;
        if (wkKey) {
          const wkRes = await this.fetchJsonCached(
            `https://openlibrary.org${wkKey}.json`,
            "ol",
          );
          if (wkRes.status === 200 && wkRes.data) wkData = wkRes.data;
        }
        const wkTitle = wkData && typeof wkData.title === "string" ? wkData.title : "";
        const sim = Math.max(
          titleSimilarity(input.title, edTitle),
          titleSimilarity(input.title, wkTitle),
        );
        if (sim >= 0.4) {
          edition = edRes.data;
          work = wkData;
          matchQuality = "isbn_exact";
          break;
        } else {
          isbnMismatch = {
            csvIsbn: code,
            foundTitle: edTitle || wkTitle || "(unknown)",
          };
          notes.push(
            `Open Library /isbn/${code} returned mismatched title "${isbnMismatch.foundTitle}"`,
          );
        }
      }
    }

    // 2. Fallback / supplement via Open Library /search.json
    const needSearch =
      !work ||
      !Array.isArray(work.subjects) ||
      work.subjects.length < 3 ||
      (!(edition?.covers as unknown[] | undefined)?.length &&
        !(work?.covers as unknown[] | undefined)?.length) ||
      (!edition?.number_of_pages && !edition?.pagination) ||
      (!edition?.publish_date && !work?.first_publish_date);

    if (needSearch) {
      const shortTitle = decodeHtmlEntities(input.title)
        .split(":")[0]
        .replace(/\([^)]*\)/g, "")
        .trim();
      const firstAuthor = spaceInitials(input.authors[0] ?? "");
      const params = new URLSearchParams({
        title: shortTitle,
        limit: "5",
        fields:
          "key,title,subtitle,author_name,first_publish_year,number_of_pages_median,cover_i,subject,isbn",
      });
      if (firstAuthor) params.set("author", firstAuthor);

      const sr = await this.fetchJsonCached(
        `https://openlibrary.org/search.json?${params.toString()}`,
        "ol",
      );
      const docs = Array.isArray(sr.data?.docs)
        ? (sr.data.docs as Record<string, unknown>[])
        : [];

      let best: { doc: Record<string, unknown>; score: number } | null = null;
      let secondScore = 0;

      for (const d of docs) {
        const dTitle = typeof d.title === "string" ? d.title : "";
        const dAuthors = Array.isArray(d.author_name)
          ? d.author_name.map(String)
          : [];
        const tSim = titleSimilarity(input.title, dTitle);
        const aOk = input.authors.length === 0 || authorsOverlap(input.authors, dAuthors);
        const auxPenalty = isAuxiliaryAdaptationOrGuide(d, input.title) ? -0.45 : 0;
        const score = tSim * 2 + (aOk ? 1 : 0) + auxPenalty;
        if (tSim >= 0.45 && aOk) {
          if (!best || score > best.score) {
            secondScore = best?.score ?? 0;
            best = { doc: d, score };
          } else if (score > secondScore) {
            secondScore = score;
          }
        }
      }

      if (best) {
        searchDoc = best.doc;
        if (!work) {
          const wkKey = typeof best.doc.key === "string" ? best.doc.key : null;
          if (wkKey) {
            const wkRes = await this.fetchJsonCached(
              `https://openlibrary.org${wkKey}.json`,
              "ol",
            );
            if (wkRes.status === 200 && wkRes.data) work = wkRes.data;
          }
          matchQuality =
            docs.length > 1 && best.score - secondScore < 0.05 && best.score < 2.5
              ? "ambiguous"
              : "search_exact";
        }
      } else if (!edition && !work && firstAuthor) {
        // Retry looser q= search without strict author filter in case author transliteration or original-language work title differs
        const q2 = new URLSearchParams({
          q: `${shortTitle} ${firstAuthor}`,
          limit: "3",
          fields:
            "key,title,subtitle,author_name,first_publish_year,number_of_pages_median,cover_i,subject,isbn",
        });
        const sr2 = await this.fetchJsonCached(
          `https://openlibrary.org/search.json?${q2.toString()}`,
          "ol",
        );
        const docs2 = Array.isArray(sr2.data?.docs)
          ? (sr2.data.docs as Record<string, unknown>[])
          : [];
        for (const d of docs2) {
          if (isAuxiliaryAdaptationOrGuide(d, input.title)) continue;
          const dTitle = typeof d.title === "string" ? d.title : "";
          const dAuthors = Array.isArray(d.author_name)
            ? d.author_name.map(String)
            : [];
          if (!authorsOverlap(input.authors, dAuthors)) continue;

          let titleOk = titleSimilarity(input.title, dTitle) >= 0.5;
          const wkKey = typeof d.key === "string" ? d.key : null;

          // If Open Library stores the canonical work under its original language title (e.g. 채식주의자 -> The Vegetarian),
          // verify against the work's editions.
          if (!titleOk && wkKey) {
            const edsRes = await this.fetchJsonCached(
              `https://openlibrary.org${wkKey}/editions.json?limit=25`,
              "ol",
            );
            const entries = Array.isArray(edsRes.data?.entries)
              ? (edsRes.data.entries as Array<Record<string, unknown>>)
              : [];
            titleOk = entries.some(
              (ed) =>
                typeof ed.title === "string" &&
                titleSimilarity(input.title, ed.title) >= 0.6,
            );
          }

          if (titleOk) {
            searchDoc = d;
            matchQuality = "search_exact";
            if (wkKey) {
              const wkRes = await this.fetchJsonCached(
                `https://openlibrary.org${wkKey}.json`,
                "ol",
              );
              if (wkRes.status === 200 && wkRes.data) work = wkRes.data;
            }
            break;
          }
        }
      }
    }

    // Collect metadata from Open Library
    let subtitle: string | null =
      typeof edition?.subtitle === "string" && edition.subtitle.trim()
        ? edition.subtitle.trim()
        : typeof searchDoc?.subtitle === "string" && searchDoc.subtitle.trim()
          ? searchDoc.subtitle.trim()
          : null;

    let description =
      extractDescription(work?.description) ??
      extractDescription(edition?.description);

    let publishYear =
      extractYear(work?.first_publish_date) ??
      extractYear(searchDoc?.first_publish_year) ??
      (typeof input.hintFirstPublishYear === "number" ? input.hintFirstPublishYear : null) ??
      extractYear(edition?.publish_date);

    let pageCount = extractPageCount(edition ?? {}, searchDoc ?? undefined);

    const subjectSet = new Set<string>();
    if (Array.isArray(work?.subjects)) {
      for (const s of work.subjects) if (typeof s === "string") subjectSet.add(s.trim());
    }
    if (Array.isArray(searchDoc?.subject)) {
      for (const s of searchDoc.subject) if (typeof s === "string") subjectSet.add(s.trim());
    }
    if (Array.isArray(edition?.subjects)) {
      for (const s of edition.subjects) if (typeof s === "string") subjectSet.add(s.trim());
    }

    // Series extraction from Open Library
    let seriesName: string | null = null;
    let seriesPosition: number | null = null;
    let seriesSource: SeriesSource = "none";

    if (Array.isArray(edition?.series)) {
      for (const raw of edition.series) {
        if (typeof raw !== "string") continue;
        const parsed = parseSeriesString(raw);
        if (parsed) {
          seriesName = parsed.name;
          seriesPosition = parsed.position;
          seriesSource = "openlibrary_edition";
          break;
        }
      }
    }
    if (!seriesName) {
      for (const s of subjectSet) {
        if (/^series\s*:/i.test(s)) {
          const parsed = parseSeriesString(s);
          if (parsed) {
            seriesName = parsed.name;
            seriesPosition = parsed.position;
            seriesSource = "openlibrary_work_subject";
            break;
          }
        }
      }
    }

    // Candidate cover URLs from Open Library
    const coverUrls: string[] = [];
    if (Array.isArray(edition?.covers)) {
      for (const cid of edition.covers) {
        if (typeof cid === "number" && cid > 0) {
          coverUrls.push(`https://covers.openlibrary.org/b/id/${cid}-L.jpg?default=false`);
        }
      }
    }
    if (Array.isArray(work?.covers)) {
      for (const cid of work.covers) {
        if (typeof cid === "number" && cid > 0) {
          coverUrls.push(`https://covers.openlibrary.org/b/id/${cid}-L.jpg?default=false`);
        }
      }
    }
    if (typeof searchDoc?.cover_i === "number" && searchDoc.cover_i > 0) {
      coverUrls.push(
        `https://covers.openlibrary.org/b/id/${searchDoc.cover_i}-L.jpg?default=false`,
      );
    }
    if (!isbnMismatch) {
      for (const code of isbnsToTry) {
        coverUrls.push(`https://covers.openlibrary.org/b/isbn/${code}-L.jpg?default=false`);
      }
    }

    // 3. Google Books fallback when Open Library is missing key data
    const needsGoogle =
      matchQuality === "not_found" ||
      coverUrls.length === 0 ||
      !description ||
      subjectSet.size === 0 ||
      !pageCount ||
      !publishYear;

    let resolvedAuthors: string[] | undefined;
    let resolvedIsbn: string | undefined;

    if (needsGoogle) {
      const queries: string[] = [];
      if (!isbnMismatch && isbnsToTry[0]) queries.push(`isbn:${isbnsToTry[0]}`);
      const shortTitle = decodeHtmlEntities(input.title).split(":")[0].trim();
      const firstAuthor = input.authors[0] ?? "";
      if (shortTitle) {
        queries.push(
          firstAuthor
            ? `intitle:${shortTitle} inauthor:${firstAuthor}`
            : `intitle:${shortTitle}`,
        );
      }

      for (const qStr of queries) {
        const params = new URLSearchParams({ q: qStr, maxResults: "3" });
        if (process.env.GOOGLE_BOOKS_API_KEY) {
          params.set("key", process.env.GOOGLE_BOOKS_API_KEY);
        }
        const gbRes = await this.fetchJsonCached(
          `https://www.googleapis.com/books/v1/volumes?${params.toString()}`,
          "gb",
        );
        if (gbRes.status !== 200 || !gbRes.data) {
          if (gbRes.status === 429) {
            notes.push("Google Books fallback rate-limited (HTTP 429)");
          }
          continue;
        }
        const items = Array.isArray(gbRes.data.items)
          ? (gbRes.data.items as Record<string, unknown>[])
          : [];
        for (const item of items) {
          const vi = item.volumeInfo as Record<string, unknown> | undefined;
          if (!vi) continue;
          const gbTitle = typeof vi.title === "string" ? vi.title : "";
          const gbAuthors = Array.isArray(vi.authors)
            ? vi.authors.map(String)
            : [];
          if (
            titleSimilarity(input.title, gbTitle) < 0.4 ||
            (input.authors.length > 0 &&
              gbAuthors.length > 0 &&
              !authorsOverlap(input.authors, gbAuthors))
          ) {
            continue;
          }

          if (matchQuality === "not_found") {
            matchQuality = "google_fallback";
          }
          if (!resolvedAuthors && gbAuthors.length) resolvedAuthors = gbAuthors;
          if (!subtitle && typeof vi.subtitle === "string" && vi.subtitle.trim()) {
            subtitle = vi.subtitle.trim();
          }
          if (!description && typeof vi.description === "string") {
            description = extractDescription(vi.description);
          }
          if (!publishYear) publishYear = extractYear(vi.publishedDate);
          if (
            !pageCount &&
            typeof vi.pageCount === "number" &&
            vi.pageCount > 0
          ) {
            pageCount = Math.trunc(vi.pageCount);
          }
          if (Array.isArray(vi.categories)) {
            for (const c of vi.categories) {
              if (typeof c === "string") subjectSet.add(c.trim());
            }
          }
          if (!resolvedIsbn && Array.isArray(vi.industryIdentifiers)) {
            const ids = vi.industryIdentifiers as Array<{
              type?: string;
              identifier?: string;
            }>;
            const i13 = ids.find((x) => x.type === "ISBN_13")?.identifier;
            const i10 = ids.find((x) => x.type === "ISBN_10")?.identifier;
            resolvedIsbn = i13 || i10;
          }
          const imgLinks = vi.imageLinks as Record<string, unknown> | undefined;
          if (imgLinks) {
            for (const k of [
              "extraLarge",
              "large",
              "medium",
              "thumbnail",
              "smallThumbnail",
            ]) {
              const u = imgLinks[k];
              if (typeof u === "string" && u.startsWith("http")) {
                coverUrls.push(
                  u.replace(/^http:\/\//, "https://").replace(/&edge=curl/g, ""),
                );
              }
            }
          }
          if (!seriesName && vi.seriesInfo && typeof vi.seriesInfo === "object") {
            const si = vi.seriesInfo as Record<string, unknown>;
            const vs = Array.isArray(si.volumeSeries)
              ? (si.volumeSeries as Array<Record<string, unknown>>)
              : [];
            if (vs[0]) {
              const ord =
                typeof vs[0].orderNumber === "number"
                  ? vs[0].orderNumber
                  : Number(si.bookDisplayNumber);
              if (typeof vs[0].seriesId === "string" && vs[0].seriesId) {
                notes.push(`Google Books seriesId=${vs[0].seriesId}`);
                if (Number.isFinite(ord)) seriesPosition = ord;
              }
            }
          }
          break;
        }
        if (matchQuality === "google_fallback" || coverUrls.length > 0) break;
      }
    }

    if (!resolvedAuthors && Array.isArray(searchDoc?.author_name)) {
      resolvedAuthors = searchDoc.author_name.map(String);
    }
    if (!resolvedIsbn && Array.isArray(searchDoc?.isbn) && searchDoc.isbn[0]) {
      resolvedIsbn = String(searchDoc.isbn[0]);
    }

    const dedupCoverUrls = [...new Set(coverUrls)];
    const cover = await this.downloadCoverCached(dedupCoverUrls, input.uid);

    return {
      matchQuality,
      sourceNotes: notes,
      isbnMismatch,
      subtitle,
      description,
      publishYear,
      pageCount,
      rawSubjects: [...subjectSet],
      seriesName,
      seriesPosition,
      seriesSource,
      cover,
      resolvedAuthors,
      resolvedIsbn,
    };
  }

  async lookupFreeform(query: string): Promise<{
    title: string;
    authors: string[];
    isbn: NormalizedIsbn;
    enriched: EnrichedBook;
  } | null> {
    const cleaned = query.trim();
    const maybeIsbn = normalizeIsbn(cleaned);
    if (maybeIsbn.kind === "isbn13" || maybeIsbn.kind === "isbn10") {
      const code = maybeIsbn.isbn13 ?? maybeIsbn.isbn10 ?? maybeIsbn.cleaned;
      const edRes = await this.fetchJsonCached(
        `https://openlibrary.org/isbn/${code}.json`,
        "ol",
      );
      let title = "";
      let authors: string[] = [];
      if (edRes.status === 200 && edRes.data) {
        if (typeof edRes.data.title === "string") title = edRes.data.title;
        if (Array.isArray(edRes.data.authors)) {
          for (const a of edRes.data.authors) {
            if (a && typeof a === "object" && "key" in a) {
              const aRes = await this.fetchJsonCached(
                `https://openlibrary.org${String((a as { key: string }).key)}.json`,
                "ol",
              );
              if (aRes.status === 200 && typeof aRes.data?.name === "string") {
                authors.push(aRes.data.name);
              }
            }
          }
        }
      }
      if (!title) {
        const sr = await this.fetchJsonCached(
          `https://openlibrary.org/search.json?isbn=${encodeURIComponent(code)}&limit=1&fields=key,title,author_name,isbn`,
          "ol",
        );
        const docs = Array.isArray(sr.data?.docs)
          ? (sr.data.docs as Record<string, unknown>[])
          : [];
        if (docs[0]) {
          title = typeof docs[0].title === "string" ? docs[0].title : "";
          authors = Array.isArray(docs[0].author_name)
            ? docs[0].author_name.map(String)
            : [];
        }
      }
      if (!title) {
        // Fallback: try Google Books directly by ISBN
        const params = new URLSearchParams({ q: `isbn:${code}`, maxResults: "1" });
        if (process.env.GOOGLE_BOOKS_API_KEY) {
          params.set("key", process.env.GOOGLE_BOOKS_API_KEY);
        }
        const gb = await this.fetchJsonCached(
          `https://www.googleapis.com/books/v1/volumes?${params.toString()}`,
          "gb",
        );
        const items = Array.isArray(gb.data?.items)
          ? (gb.data.items as Record<string, unknown>[])
          : [];
        const vi = items[0]?.volumeInfo as Record<string, unknown> | undefined;
        if (vi && typeof vi.title === "string") {
          title = vi.title;
          authors = Array.isArray(vi.authors) ? vi.authors.map(String) : [];
        }
      }
      if (!title) return null;
      const uid = slugify(title);
      const enriched = await this.enrichBook({
        title,
        authors,
        isbn: maybeIsbn,
        uid,
      });
      return {
        title,
        authors: authors.length ? authors : enriched.resolvedAuthors ?? [],
        isbn: maybeIsbn,
        enriched,
      };
    }

    // Freeform "title author" query
    const params = new URLSearchParams({
      q: cleaned,
      limit: "5",
      fields:
        "key,title,subtitle,author_name,first_publish_year,number_of_pages_median,cover_i,subject,isbn",
    });
    const sr = await this.fetchJsonCached(
      `https://openlibrary.org/search.json?${params.toString()}`,
      "ol",
    );
    const docs = Array.isArray(sr.data?.docs)
      ? (sr.data.docs as Record<string, unknown>[])
      : [];
    if (docs[0] && typeof docs[0].title === "string") {
      const d = docs[0];
      const title = d.title as string;
      const authors = Array.isArray(d.author_name)
        ? d.author_name.map(String)
        : [];
      const isbnStr =
        Array.isArray(d.isbn) && typeof d.isbn[0] === "string" ? d.isbn[0] : "";
      const isbn = normalizeIsbn(isbnStr);
      const uid = slugify(title);
      const enriched = await this.enrichBook({
        title,
        authors,
        isbn,
        uid,
        hintFirstPublishYear: extractYear(d.first_publish_year),
      });
      return { title, authors, isbn, enriched };
    }

    // Google Books fallback for freeform query
    const gbParams = new URLSearchParams({ q: cleaned, maxResults: "1" });
    if (process.env.GOOGLE_BOOKS_API_KEY) {
      gbParams.set("key", process.env.GOOGLE_BOOKS_API_KEY);
    }
    const gb = await this.fetchJsonCached(
      `https://www.googleapis.com/books/v1/volumes?${gbParams.toString()}`,
      "gb",
    );
    const items = Array.isArray(gb.data?.items)
      ? (gb.data.items as Record<string, unknown>[])
      : [];
    const vi = items[0]?.volumeInfo as Record<string, unknown> | undefined;
    if (vi && typeof vi.title === "string") {
      const title = vi.title;
      const authors = Array.isArray(vi.authors) ? vi.authors.map(String) : [];
      const ids = Array.isArray(vi.industryIdentifiers)
        ? (vi.industryIdentifiers as Array<{ identifier?: string }>)
        : [];
      const isbn = normalizeIsbn(ids[0]?.identifier ?? "");
      const uid = slugify(title);
      const enriched = await this.enrichBook({ title, authors, isbn, uid });
      return { title, authors, isbn, enriched };
    }

    return null;
  }
}
