import crypto from "node:crypto";
import fs from "node:fs";
import type {
  BookDocumentData,
  GenreDocumentData,
  SeriesDocumentData,
} from "../../prismicio-types";
import { CACHE_DIR, STATE_CACHE_PATH, getReadClient, getWriteClient } from "./env";
import type { ParsedCsvBook } from "./csv";
import type { EnrichedBook, EnrichedCover } from "./enrich";
import type { GenreDefinition } from "./genres";
import { plainTextToRichText, slugify } from "./slug";

interface StoredAsset {
  id: string;
  url: string;
  filename: string;
  width?: number;
  height?: number;
  alt?: string | null;
  credits?: string | null;
}

interface StoredDoc {
  id: string;
  type: "author" | "genre" | "series" | "book";
  uid: string;
  hash: string;
}

interface StateFile {
  version: number;
  assetsByFilename: Record<string, StoredAsset>;
  documents: Record<string, StoredDoc>; // key: `${type}:${uid}`
}

export interface PreparedBookRecord {
  csv: ParsedCsvBook;
  enriched: EnrichedBook;
  genres: GenreDefinition[];
  unmappedSubjects: string[];
  ignoredSubjects: string[];
  source?: "storygraph" | "manual";
}

export interface PrismicImportStats {
  assetsReused: number;
  assetsUploaded: number;
  assetsFailed: number;
  created: Record<"genre" | "series" | "author" | "book", number>;
  updated: Record<"genre" | "series" | "author" | "book", number>;
  skippedUnchanged: Record<"genre" | "series" | "author" | "book", number>;
  failed: Array<{ type: string; uid: string; title: string; error: string }>;
  releaseLimitReached: boolean;
  releaseLimitMessage?: string;
}

function stableHash(obj: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class PrismicApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
  }
}

class PrismicWriteApi {
  private lastWriteAt = new Map<string, number>();

  constructor(
    readonly repositoryName: string,
    readonly writeToken: string,
  ) {}

  private async throttle(bucket: "asset" | "migration", minIntervalMs = 1100): Promise<void> {
    const prev = this.lastWriteAt.get(bucket) ?? 0;
    const wait = minIntervalMs - (Date.now() - prev);
    if (wait > 0) await sleep(wait);
    this.lastWriteAt.set(bucket, Date.now());
  }

  private async callApi<T>(
    bucket: "asset" | "migration",
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      attempt++;
      await this.throttle(bucket);
      let res: Response;
      try {
        res = await fetch(url, {
          ...init,
          headers: {
            repository: this.repositoryName,
            Authorization: `Bearer ${this.writeToken}`,
            ...(init.headers ?? {}),
          },
        });
      } catch (err) {
        if (attempt >= 4) throw err;
        const wait = 2000 * attempt;
        console.warn(`  [retry ${attempt}/3] ${label}: network error (${wait}ms)`);
        await sleep(wait);
        continue;
      }

      this.lastWriteAt.set(bucket, Date.now());

      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        json = { message: text };
      }

      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        if (attempt >= 5) {
          throw new PrismicApiError(
            String(json.message ?? json.error ?? `HTTP ${res.status}`),
            res.status,
            json,
          );
        }
        const ra = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * attempt;
        console.warn(`  [retry ${attempt}/4] ${label}: HTTP ${res.status} (waiting ${wait}ms)`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const msg =
          typeof json.message === "string"
            ? json.message
            : typeof json.error === "string"
              ? json.error
              : text || `HTTP ${res.status}`;
        throw new PrismicApiError(msg, res.status, json);
      }

      return json as T;
    }
  }

  async createAsset(
    file: File,
    alt: string,
  ): Promise<{
    id: string;
    url: string;
    filename: string;
    width?: number;
    height?: number;
    alt?: string | null;
    credits?: string | null;
  }> {
    const form = new FormData();
    form.append("file", file);
    if (alt) form.append("alt", alt);
    return this.callApi(
      "asset",
      "https://asset-api.prismic.io/assets",
      {
        method: "POST",
        body: form,
      },
      `upload asset ${file.name}`,
    );
  }

  async createDocument(body: {
    title: string;
    type: string;
    uid?: string;
    lang: string;
    data: Record<string, unknown>;
  }): Promise<{ id: string }> {
    return this.callApi<{ id: string }>(
      "migration",
      "https://migration.prismic.io/documents",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      `create ${body.type}/${body.uid ?? body.title}`,
    );
  }

  async updateDocument(
    id: string,
    body: {
      title?: string;
      uid?: string;
      data: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.callApi<unknown>(
      "migration",
      `https://migration.prismic.io/documents/${id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      `update ${id}`,
    );
  }
}

export class PrismicStateStore {
  private state: StateFile;
  private dirty = false;

  constructor() {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (fs.existsSync(STATE_CACHE_PATH)) {
      try {
        this.state = JSON.parse(fs.readFileSync(STATE_CACHE_PATH, "utf8")) as StateFile;
      } catch {
        this.state = { version: 1, assetsByFilename: {}, documents: {} };
      }
    } else {
      this.state = { version: 1, assetsByFilename: {}, documents: {} };
    }
  }

  save(): void {
    if (!this.dirty) return;
    const tmp = `${STATE_CACHE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(tmp, STATE_CACHE_PATH);
    this.dirty = false;
  }

  getAsset(filename: string): StoredAsset | undefined {
    return this.state.assetsByFilename[filename];
  }

  setAsset(filename: string, asset: StoredAsset): void {
    this.state.assetsByFilename[filename] = asset;
    this.dirty = true;
  }

  getDoc(type: StoredDoc["type"], uid: string): StoredDoc | undefined {
    return this.state.documents[`${type}:${uid}`];
  }

  setDoc(doc: StoredDoc): void {
    this.state.documents[`${doc.type}:${doc.uid}`] = doc;
    this.dirty = true;
  }

  hasUid(type: StoredDoc["type"], uid: string): boolean {
    return Boolean(this.state.documents[`${type}:${uid}`]);
  }
}

function isReleaseLimitError(err: unknown): boolean {
  const parts: string[] = [];
  if (err instanceof Error) parts.push(err.message);
  if (err instanceof PrismicApiError && err.payload) {
    parts.push(JSON.stringify(err.payload));
  }
  const msg = parts.join(" ");
  return /(?:release|migration).*limit|1000|1,000|maximum number of documents|too many documents/i.test(
    msg,
  );
}

export async function preloadRemoteAssetsAndDocs(
  repositoryName: string,
  writeToken: string,
  store: PrismicStateStore,
): Promise<{
  publishedUids: Record<"genre" | "series" | "author" | "book", Map<string, string>>;
}> {
  const publishedUids: Record<"genre" | "series" | "author" | "book", Map<string, string>> = {
    genre: new Map(),
    series: new Map(),
    author: new Map(),
    book: new Map(),
  };

  try {
    const readClient = getReadClient();
    for (const type of ["genre", "series", "author", "book"] as const) {
      const docs = await readClient.getAllByType(type, { pageSize: 100 });
      for (const d of docs) {
        if (d.uid) publishedUids[type].set(d.uid, d.id);
      }
    }
  } catch {
    // Repository may have no published docs yet or no read token
  }

  try {
    let cursor: string | undefined;
    while (true) {
      const url = new URL("https://asset-api.prismic.io/assets");
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url, {
        headers: {
          repository: repositoryName,
          Authorization: `Bearer ${writeToken}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) break;
      const body = (await res.json()) as {
        items?: Array<{
          id: string;
          url: string;
          filename: string;
          width?: number;
          height?: number;
          alt?: string | null;
          credits?: string | null;
        }>;
        cursor?: string;
      };
      const items = body.items ?? [];
      for (const item of items) {
        if (item.filename && item.id) {
          store.setAsset(item.filename, {
            id: item.id,
            url: item.url,
            filename: item.filename,
            width: item.width,
            height: item.height,
            alt: item.alt ?? null,
            credits: item.credits ?? null,
          });
        }
      }
      if (!body.cursor || items.length === 0) break;
      cursor = body.cursor;
    }
    store.save();
  } catch {
    // Non-fatal
  }

  return { publishedUids };
}

export async function ensureCoverUploaded(
  api: PrismicWriteApi,
  store: PrismicStateStore,
  cover: EnrichedCover,
  title: string,
): Promise<{ asset: StoredAsset; reused: boolean }> {
  const existing = store.getAsset(cover.filename);
  if (existing && existing.url && existing.width && existing.height) {
    return { asset: existing, reused: true };
  }

  const bytes = fs.readFileSync(cover.localPath);
  const file = new File([bytes], cover.filename, { type: cover.mimeType });
  const alt = `Cover of ${title}`.slice(0, 480);

  const asset = await api.createAsset(file, alt);
  const stored: StoredAsset = {
    id: asset.id,
    url: asset.url,
    filename: cover.filename,
    width: asset.width,
    height: asset.height,
    alt: asset.alt ?? alt,
    credits: asset.credits ?? null,
  };
  store.setAsset(cover.filename, stored);
  store.save();
  return { asset: stored, reused: false };
}

async function upsertDoc<TType extends "genre" | "series" | "author" | "book">(
  api: PrismicWriteApi,
  store: PrismicStateStore,
  publishedMap: Map<string, string>,
  params: {
    type: TType;
    uid: string;
    title: string;
    data: Record<string, unknown>;
    updateIfChanged?: boolean;
  },
): Promise<{ id: string; action: "created" | "updated" | "skipped" }> {
  const payload = {
    title: params.title,
    type: params.type,
    uid: params.uid,
    lang: "en-us",
    data: params.data,
  };
  const hash = stableHash(payload);

  const cached = store.getDoc(params.type, params.uid);
  const existingId = cached?.id ?? publishedMap.get(params.uid);

  if (existingId) {
    if (cached && cached.hash === hash) {
      return { id: existingId, action: "skipped" };
    }
    if (!params.updateIfChanged && cached) {
      return { id: existingId, action: "skipped" };
    }
    await api.updateDocument(existingId, {
      title: params.title,
      uid: params.uid,
      data: params.data,
    });
    store.setDoc({ id: existingId, type: params.type, uid: params.uid, hash });
    store.save();
    return { id: existingId, action: "updated" };
  }

  const created = await api.createDocument(payload);
  store.setDoc({ id: created.id, type: params.type, uid: params.uid, hash });
  store.save();
  return { id: created.id, action: "created" };
}

export async function pushBooksToPrismic(
  records: PreparedBookRecord[],
  options: { update?: boolean; limit?: number } = {},
): Promise<PrismicImportStats> {
  const writeClient = getWriteClient();
  const api = new PrismicWriteApi(writeClient.repositoryName, writeClient.writeToken);
  const store = new PrismicStateStore();
  const { publishedUids } = await preloadRemoteAssetsAndDocs(
    writeClient.repositoryName,
    writeClient.writeToken,
    store,
  );

  const stats: PrismicImportStats = {
    assetsReused: 0,
    assetsUploaded: 0,
    assetsFailed: 0,
    created: { genre: 0, series: 0, author: 0, book: 0 },
    updated: { genre: 0, series: 0, author: 0, book: 0 },
    skippedUnchanged: { genre: 0, series: 0, author: 0, book: 0 },
    failed: [],
    releaseLimitReached: false,
  };

  const targetRecords =
    options.limit && options.limit > 0 ? records.slice(0, options.limit) : records;

  const genreMap = new Map<string, GenreDefinition>();
  const seriesMap = new Map<string, string>();
  const authorMap = new Map<string, string>();

  for (const r of targetRecords) {
    for (const g of r.genres) genreMap.set(g.uid, g);
    if (r.enriched.seriesName) {
      const sUid = slugify(r.enriched.seriesName);
      if (!seriesMap.has(sUid)) seriesMap.set(sUid, r.enriched.seriesName);
    }
    const authors =
      r.csv.authors.length > 0 ? r.csv.authors : r.enriched.resolvedAuthors ?? [];
    for (const a of authors) {
      const aUid = slugify(a);
      if (!authorMap.has(aUid)) authorMap.set(aUid, a);
    }
  }

  // 1. Upload covers first
  const uniqueCovers = new Map<string, { cover: EnrichedCover; sampleTitle: string }>();
  for (const r of targetRecords) {
    if (r.enriched.cover) {
      uniqueCovers.set(r.enriched.cover.filename, {
        cover: r.enriched.cover,
        sampleTitle: r.csv.title,
      });
    }
  }

  console.log(`Uploading/checking ${uniqueCovers.size} unique cover images...`);
  let covIdx = 0;
  const coverAssetByFilename = new Map<string, StoredAsset>();
  for (const [filename, { cover, sampleTitle }] of uniqueCovers) {
    covIdx++;
    try {
      const { asset, reused } = await ensureCoverUploaded(
        api,
        store,
        cover,
        sampleTitle,
      );
      coverAssetByFilename.set(filename, asset);
      if (reused) stats.assetsReused++;
      else stats.assetsUploaded++;
      if (covIdx % 25 === 0 || covIdx === uniqueCovers.size) {
        console.log(
          `  covers ${covIdx}/${uniqueCovers.size} (uploaded=${stats.assetsUploaded}, reused=${stats.assetsReused})`,
        );
      }
    } catch (err) {
      stats.assetsFailed++;
      console.warn(
        `  [cover failed] ${filename}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const coverAssetByBookUid = new Map<string, StoredAsset>();
  for (const r of targetRecords) {
    if (r.enriched.cover) {
      const asset = coverAssetByFilename.get(r.enriched.cover.filename);
      if (asset) coverAssetByBookUid.set(r.csv.uid, asset);
    }
  }

  // 2. Genres
  const genreIds = new Map<string, string>();
  console.log(`Syncing ${genreMap.size} genres...`);
  // `parent` is edited by hand in Prismic (Fiction / Nonfiction top levels); an update must not wipe it.
  const existingGenreParents = new Map<string, string>();
  try {
    const existingGenres = await getReadClient().getAllByType("genre", { pageSize: 100 });
    for (const d of existingGenres) {
      const parent = d.data.parent;
      if (d.uid && "id" in parent && parent.id) existingGenreParents.set(d.uid, parent.id);
    }
  } catch {
    // No read token or no published genres yet: nothing to preserve
  }
  for (const [uid, g] of genreMap) {
    const parentId = existingGenreParents.get(uid);
    const data: GenreDocumentData = {
      name: g.name,
      accent: g.accent as GenreDocumentData["accent"],
      description: g.description,
      // The Migration API only needs link_type and id; the rest of the typed link is read-side.
      parent: (parentId
        ? { link_type: "Document", id: parentId }
        : { link_type: "Document" }) as GenreDocumentData["parent"],
    };
    try {
      const res = await upsertDoc(api, store, publishedUids.genre, {
        type: "genre",
        uid,
        title: g.name,
        data: data as unknown as Record<string, unknown>,
        updateIfChanged: options.update,
      });
      genreIds.set(uid, res.id);
      if (res.action === "created") stats.created.genre++;
      else if (res.action === "updated") stats.updated.genre++;
      else stats.skippedUnchanged.genre++;
    } catch (err) {
      if (isReleaseLimitError(err)) {
        stats.releaseLimitReached = true;
        stats.releaseLimitMessage = err instanceof Error ? err.message : String(err);
        return stats;
      }
      stats.failed.push({
        type: "genre",
        uid,
        title: g.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. Series
  const seriesIds = new Map<string, string>();
  console.log(`Syncing ${seriesMap.size} series...`);
  for (const [uid, name] of seriesMap) {
    const data: SeriesDocumentData = {
      name,
      description: [],
    };
    try {
      const res = await upsertDoc(api, store, publishedUids.series, {
        type: "series",
        uid,
        title: name,
        data: data as unknown as Record<string, unknown>,
        updateIfChanged: options.update,
      });
      seriesIds.set(uid, res.id);
      if (res.action === "created") stats.created.series++;
      else if (res.action === "updated") stats.updated.series++;
      else stats.skippedUnchanged.series++;
    } catch (err) {
      if (isReleaseLimitError(err)) {
        stats.releaseLimitReached = true;
        stats.releaseLimitMessage = err instanceof Error ? err.message : String(err);
        return stats;
      }
      stats.failed.push({
        type: "series",
        uid,
        title: name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 4. Authors
  const authorIds = new Map<string, string>();
  console.log(`Syncing ${authorMap.size} authors...`);
  let authIdx = 0;
  for (const [uid, name] of authorMap) {
    authIdx++;
    const data: Record<string, unknown> = {
      name,
      sort_name: null,
      bio: [],
    };
    try {
      const res = await upsertDoc(api, store, publishedUids.author, {
        type: "author",
        uid,
        title: name,
        data,
        updateIfChanged: options.update,
      });
      authorIds.set(uid, res.id);
      if (res.action === "created") stats.created.author++;
      else if (res.action === "updated") stats.updated.author++;
      else stats.skippedUnchanged.author++;
      if (authIdx % 50 === 0 || authIdx === authorMap.size) {
        console.log(`  authors ${authIdx}/${authorMap.size}`);
      }
    } catch (err) {
      if (isReleaseLimitError(err)) {
        stats.releaseLimitReached = true;
        stats.releaseLimitMessage = err instanceof Error ? err.message : String(err);
        return stats;
      }
      stats.failed.push({
        type: "author",
        uid,
        title: name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 5. Books
  console.log(`Syncing ${targetRecords.length} books...`);
  let bookIdx = 0;
  for (const r of targetRecords) {
    bookIdx++;
    const authors =
      r.csv.authors.length > 0 ? r.csv.authors : r.enriched.resolvedAuthors ?? [];
    const authorLinks = authors
      .map((a) => authorIds.get(slugify(a)))
      .filter((id): id is string => Boolean(id))
      .map((id) => ({
        author: { link_type: "Document" as const, id },
      }));

    const genreLinks = r.genres
      .map((g) => genreIds.get(g.uid))
      .filter((id): id is string => Boolean(id))
      .map((id) => ({
        genre: { link_type: "Document" as const, id },
      }));

    const sUid = r.enriched.seriesName ? slugify(r.enriched.seriesName) : null;
    const sId = sUid ? seriesIds.get(sUid) : undefined;
    const coverAsset = coverAssetByBookUid.get(r.csv.uid);

    const isbnValue = r.csv.isbnRaw || r.enriched.resolvedIsbn || null;

    const bookData: Record<string, unknown> = {
      title: r.csv.title,
      subtitle: r.enriched.subtitle,
      authors: authorLinks,
      contributors: r.csv.contributors.map((c) => ({
        name: c.name,
        role: c.role,
      })),
      series: sId ? { link_type: "Document", id: sId } : undefined,
      series_position: sId ? r.enriched.seriesPosition : null,
      genres: genreLinks,
      cover: coverAsset
        ? {
            id: coverAsset.id,
            url: coverAsset.url,
            dimensions:
              coverAsset.width && coverAsset.height
                ? { width: coverAsset.width, height: coverAsset.height }
                : undefined,
            edit: { x: 0, y: 0, zoom: 1, background: "transparent" },
            alt: `Cover of ${r.csv.title}`.slice(0, 480),
            copyright: coverAsset.credits ?? null,
          }
        : undefined,
      isbn: isbnValue,
      publish_year: r.enriched.publishYear,
      page_count: r.enriched.pageCount,
      format: r.csv.format,
      owned: r.csv.owned,
      blurb: r.enriched.description
        ? plainTextToRichText(r.enriched.description)
        : [],
      read_status: r.csv.readStatus,
      date_added: r.csv.dateAdded,
      last_date_read: r.csv.lastDateRead,
      year_read: r.csv.yearRead,
      read_count: r.csv.readCount,
      dates_read: r.csv.datesRead,
      rating: r.csv.rating,
      review: r.csv.reviewRichText,
      moods: r.csv.moods.map((m) => ({ mood: m })),
      pace: r.csv.pace,
      character_or_plot_driven: r.csv.characterOrPlotDriven,
      strong_character_development: r.csv.strongCharacterDevelopment,
      loveable_characters: r.csv.loveableCharacters,
      diverse_characters: r.csv.diverseCharacters,
      flawed_characters: r.csv.flawedCharacters,
      content_warnings: r.csv.contentWarnings,
      content_warning_description: r.csv.contentWarningDescription,
      source: r.source ?? "storygraph",
    };

    for (const k of Object.keys(bookData)) {
      if (bookData[k] === undefined) delete bookData[k];
    }

    try {
      const res = await upsertDoc(api, store, publishedUids.book, {
        type: "book",
        uid: r.csv.uid,
        title: r.csv.title,
        data: bookData as unknown as BookDocumentData as unknown as Record<string, unknown>,
        updateIfChanged: options.update,
      });
      if (res.action === "created") stats.created.book++;
      else if (res.action === "updated") stats.updated.book++;
      else stats.skippedUnchanged.book++;

      if (bookIdx % 25 === 0 || bookIdx === targetRecords.length) {
        console.log(
          `  books ${bookIdx}/${targetRecords.length} (created=${stats.created.book}, skipped=${stats.skippedUnchanged.book})`,
        );
      }
    } catch (err) {
      if (isReleaseLimitError(err)) {
        stats.releaseLimitReached = true;
        stats.releaseLimitMessage = err instanceof Error ? err.message : String(err);
        console.warn(`\n[STOP] Migration Release limit reached at book ${bookIdx}: ${stats.releaseLimitMessage}`);
        return stats;
      }
      stats.failed.push({
        type: "book",
        uid: r.csv.uid,
        title: r.csv.title,
        error: err instanceof Error ? err.message : String(err),
      });
      console.warn(
        `  [book failed] ${r.csv.uid}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return stats;
}
