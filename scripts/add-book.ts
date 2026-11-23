import { getWriteClient, loadEnv } from "./lib/env";
import { BookEnricher } from "./lib/enrich";
import { GenreMapper } from "./lib/genres";
import {
  PrismicStateStore,
  preloadRemoteAssetsAndDocs,
  pushBooksToPrismic,
  type PreparedBookRecord,
} from "./lib/prismic-import";
import type { BookFormat, ReadStatus } from "./lib/csv";
import { slugify } from "./lib/slug";

interface AddBookArgs {
  query: string;
  owned: boolean;
  readStatus: ReadStatus | null;
  format: BookFormat | null;
  dryRun: boolean;
  noCache: boolean;
}

function parseArgs(argv: string[]): AddBookArgs {
  const queryParts: string[] = [];
  let owned = false;
  let readStatus: ReadStatus | null = null;
  let format: BookFormat | null = null;
  let dryRun = false;
  let noCache = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--owned") owned = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--no-cache") noCache = true;
    else if (a === "--status" && argv[i + 1]) readStatus = argv[++i] as ReadStatus;
    else if (a === "--format" && argv[i + 1]) format = argv[++i] as BookFormat;
    else if (!a.startsWith("-")) queryParts.push(a);
  }

  const query = queryParts.join(" ").trim();
  if (!query) {
    console.error(
      'Usage: npm run add-book -- <isbn or "title author"> [--owned] [--status read|to-read|currently-reading|did-not-finish|paused] [--format paperback|hardcover|digital|audio] [--dry-run]',
    );
    process.exit(1);
  }
  return { query, owned, readStatus, format, dryRun, noCache };
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  const enricher = new BookEnricher({ noCache: args.noCache });
  const genreMapper = new GenreMapper();

  console.log(`Looking up: ${args.query}`);
  const match = await enricher.lookupFreeform(args.query);
  enricher.saveCache();

  if (!match) {
    console.error(`No matching book found for "${args.query}" on Open Library or Google Books.`);
    process.exit(1);
  }

  const mapped = genreMapper.mapSubjects(match.enriched.rawSubjects);
  const store = new PrismicStateStore();
  let publishedBookUids = new Map<string, string>();
  if (!args.dryRun) {
    const writeClient = getWriteClient();
    const preloaded = await preloadRemoteAssetsAndDocs(
      writeClient.repositoryName,
      writeClient.writeToken,
      store,
    );
    publishedBookUids = preloaded.publishedUids.book;
  }

  // Pick a non-colliding URL-safe UID
  const baseUid = slugify(match.title);
  let uid = baseUid;
  const isbnCode = (match.isbn.cleaned || match.enriched.resolvedIsbn || "").toLowerCase();
  if ((store.hasUid("book", uid) || publishedBookUids.has(uid)) && isbnCode) {
    uid = `${baseUid}-${isbnCode}`;
  }
  let suffix = 2;
  while (store.hasUid("book", uid) || publishedBookUids.has(uid)) {
    uid = `${baseUid}-${suffix++}`;
  }

  const record: PreparedBookRecord = {
    csv: {
      rowIndex: 0,
      uid,
      title: match.title,
      authors: match.authors,
      contributors: [],
      isbnRaw: match.isbn.raw || match.enriched.resolvedIsbn || "",
      isbn: match.isbn,
      format: args.format,
      owned: args.owned,
      readStatus: args.readStatus,
      dateAdded: new Date().toISOString().slice(0, 10),
      lastDateRead: null,
      yearRead: null,
      readCount: null,
      datesRead: [],
      rating: null,
      reviewRichText: [],
      hasReview: false,
      moods: [],
      pace: null,
      characterOrPlotDriven: null,
      strongCharacterDevelopment: null,
      loveableCharacters: null,
      diverseCharacters: null,
      flawedCharacters: null,
      contentWarnings: null,
      contentWarningDescription: null,
    },
    enriched: match.enriched,
    genres: mapped.genres,
    unmappedSubjects: mapped.unmappedSubjects,
    ignoredSubjects: mapped.ignoredSubjects,
    source: "manual",
  };

  console.log("Matched book:", {
    uid: record.csv.uid,
    title: record.csv.title,
    authors: record.csv.authors,
    isbn: record.csv.isbnRaw,
    publishYear: record.enriched.publishYear,
    pageCount: record.enriched.pageCount,
    series: record.enriched.seriesName
      ? `${record.enriched.seriesName}${record.enriched.seriesPosition != null ? ` #${record.enriched.seriesPosition}` : ""}`
      : null,
    genres: record.genres.map((g) => g.name),
    hasCover: Boolean(record.enriched.cover),
    hasDescription: Boolean(record.enriched.description),
    matchQuality: record.enriched.matchQuality,
  });

  if (args.dryRun) {
    console.log("Dry run: skipped writing to Prismic.");
    return;
  }

  const stats = await pushBooksToPrismic([record], { update: false });
  console.log("Created in Prismic Migration Release as draft (not published):", stats);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
