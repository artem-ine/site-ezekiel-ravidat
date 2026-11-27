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
import { findExistingBook } from "./lib/book-match";
import { bookUid } from "./lib/slug";

interface AddBookArgs {
  query: string;
  owned: boolean;
  readStatus: ReadStatus | null;
  format: BookFormat | null;
  dryRun: boolean;
  noCache: boolean;
}

const READ_STATUSES: ReadStatus[] = ["not-read", "currently-reading", "read", "did-not-finish"];

function parseArgs(argv: string[]): AddBookArgs {
  const queryParts: string[] = [];
  const owned = true;
  let readStatus: ReadStatus | null = "not-read";
  let format: BookFormat | null = null;
  let dryRun = false;
  let noCache = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--not-owned") {
      console.error("Only owned books belong on the website, so this book was not added.");
      process.exit(1);
    } else if (a === "--dry-run") dryRun = true;
    else if (a === "--no-cache") noCache = true;
    else if (a === "--status" && argv[i + 1]) {
      const value = argv[++i] as ReadStatus;
      if (!READ_STATUSES.includes(value)) {
        console.error(`Unknown --status "${value}". Use one of: ${READ_STATUSES.join(", ")}.`);
        process.exit(1);
      }
      readStatus = value;
    } else if (a === "--format" && argv[i + 1]) format = argv[++i] as BookFormat;
    else if (!a.startsWith("-")) queryParts.push(a);
  }

  const query = queryParts.join(" ").trim();
  if (!query) {
    console.error(
      `Usage: npm run add-book -- <isbn or "title author"> [--status ${READ_STATUSES.join("|")}] [--format paperback|hardcover|digital|audio] [--dry-run]`,
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
  const uid = bookUid(match.title, args.format);
  if (!args.dryRun) {
    const writeClient = getWriteClient();
    const preloaded = await preloadRemoteAssetsAndDocs(
      writeClient.repositoryName,
      writeClient.writeToken,
      store,
    );
    const existing = findExistingBook(
      {
        title: match.title,
        uid,
        isbnRaw: match.isbn.raw || match.enriched.resolvedIsbn || "",
        format: args.format,
      },
      preloaded.publishedBooks,
    );
    if (existing.kind !== "none" || preloaded.publishedUids.book.has(uid)) {
      const where =
        existing.kind === "match" ? existing.book.uid : existing.kind === "ambiguous" ? existing.candidates.map((c) => c.uid).join(", ") : uid;
      console.error(
        `"${match.title}" is already in the library (uid: ${where}). Edit that document in Prismic instead of adding a second copy.`,
      );
      process.exit(1);
    }
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
