import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR, DEFAULT_CSV_PATH, loadEnv } from "./lib/env";
import { parseStorygraphCsv } from "./lib/csv";
import { BookEnricher } from "./lib/enrich";
import { GenreMapper } from "./lib/genres";
import {
  pushBooksToPrismic,
  type PreparedBookRecord,
  type PrismicImportStats,
} from "./lib/prismic-import";

interface CliArgs {
  csvPath: string;
  dryRun: boolean;
  enrichOnly: boolean;
  update: boolean;
  noCache: boolean;
  limit?: number;
  summaryOut?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    csvPath: DEFAULT_CSV_PATH,
    dryRun: false,
    enrichOnly: false,
    update: false,
    noCache: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--enrich-only") args.enrichOnly = true;
    else if (a === "--update") args.update = true;
    else if (a === "--no-cache") args.noCache = true;
    else if (a === "--csv" && argv[i + 1]) args.csvPath = argv[++i];
    else if (a === "--limit" && argv[i + 1]) args.limit = Number(argv[++i]);
    else if (a === "--summary-out" && argv[i + 1]) args.summaryOut = argv[++i];
  }
  return args;
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  console.log(`Parsing StoryGraph CSV: ${args.csvPath}`);
  const { books: allBooks, summary: csvSummary } = parseStorygraphCsv(args.csvPath);
  const targetBooks =
    args.limit && args.limit > 0 ? allBooks.slice(0, args.limit) : allBooks;

  console.log(
    `CSV parsed: total=${csvSummary.totalRows}, importable=${csvSummary.keptRows}, skipped=${csvSummary.skippedRows}, processing=${targetBooks.length}`,
  );
  if (csvSummary.unicodeReplacementCount > 0) {
    console.warn(`WARNING: detected ${csvSummary.unicodeReplacementCount} U+FFFD replacement chars in CSV!`);
  }

  const enricher = new BookEnricher({ noCache: args.noCache });
  const genreMapper = new GenreMapper();

  let doneCount = 0;
  const prepared: PreparedBookRecord[] = await runPool(
    targetBooks,
    4,
    async (csvBook) => {
      const enriched = await enricher.enrichBook({
        title: csvBook.title,
        authors: csvBook.authors,
        isbn: csvBook.isbn,
        uid: csvBook.uid,
      });
      const mapped = genreMapper.mapSubjects(enriched.rawSubjects);
      doneCount++;
      if (doneCount % 25 === 0 || doneCount === targetBooks.length) {
        enricher.saveCache();
        console.log(`  enriched ${doneCount}/${targetBooks.length}`);
      }
      return {
        csv: csvBook,
        enriched,
        genres: mapped.genres,
        unmappedSubjects: mapped.unmappedSubjects,
        ignoredSubjects: mapped.ignoredSubjects,
      };
    },
  );
  enricher.saveCache();

  // Aggregate quality metrics
  const matchCounts: Record<string, number> = {};
  const seriesSourceCounts: Record<string, number> = {};
  const genreCounts = new Map<string, { name: string; count: number }>();
  const unmappedSubjectCounts = new Map<string, number>();
  const ignoredSubjectCounts = new Map<string, number>();

  const missingCover: Array<{ uid: string; title: string; authors: string[]; isbn: string }> = [];
  const missingGenre: Array<{ uid: string; title: string; rawSubjects: string[] }> = [];
  const missingDescription: string[] = [];
  const missingPageCount: string[] = [];
  const missingPublishYear: string[] = [];
  const withSeries: Array<{ uid: string; title: string; series: string; position: number | null; source: string }> = [];
  const isbnMismatches: Array<{ uid: string; title: string; csvIsbn: string; foundTitle: string }> = [];
  const ambiguousOrFailed: Array<{ uid: string; title: string; authors: string[]; isbn: string; matchQuality: string; notes: string[] }> = [];

  for (const r of prepared) {
    matchCounts[r.enriched.matchQuality] = (matchCounts[r.enriched.matchQuality] ?? 0) + 1;
    seriesSourceCounts[r.enriched.seriesSource] =
      (seriesSourceCounts[r.enriched.seriesSource] ?? 0) + 1;

    for (const g of r.genres) {
      const prev = genreCounts.get(g.uid);
      genreCounts.set(g.uid, { name: g.name, count: (prev?.count ?? 0) + 1 });
    }
    for (const s of r.unmappedSubjects) {
      unmappedSubjectCounts.set(s, (unmappedSubjectCounts.get(s) ?? 0) + 1);
    }
    for (const s of r.ignoredSubjects) {
      ignoredSubjectCounts.set(s, (ignoredSubjectCounts.get(s) ?? 0) + 1);
    }

    if (!r.enriched.cover) {
      missingCover.push({
        uid: r.csv.uid,
        title: r.csv.title,
        authors: r.csv.authors,
        isbn: r.csv.isbnRaw,
      });
    }
    if (r.genres.length === 0) {
      missingGenre.push({
        uid: r.csv.uid,
        title: r.csv.title,
        rawSubjects: r.enriched.rawSubjects,
      });
    }
    if (!r.enriched.description) missingDescription.push(r.csv.uid);
    if (!r.enriched.pageCount) missingPageCount.push(r.csv.uid);
    if (!r.enriched.publishYear) missingPublishYear.push(r.csv.uid);
    if (r.enriched.seriesName) {
      withSeries.push({
        uid: r.csv.uid,
        title: r.csv.title,
        series: r.enriched.seriesName,
        position: r.enriched.seriesPosition,
        source: r.enriched.seriesSource,
      });
    }
    if (r.enriched.isbnMismatch) {
      isbnMismatches.push({
        uid: r.csv.uid,
        title: r.csv.title,
        ...r.enriched.isbnMismatch,
      });
    }
    if (r.enriched.matchQuality === "ambiguous" || r.enriched.matchQuality === "not_found") {
      ambiguousOrFailed.push({
        uid: r.csv.uid,
        title: r.csv.title,
        authors: r.csv.authors,
        isbn: r.csv.isbnRaw,
        matchQuality: r.enriched.matchQuality,
        notes: r.enriched.sourceNotes,
      });
    }
  }

  let prismicStats: PrismicImportStats | null = null;
  if (!args.dryRun && !args.enrichOnly) {
    prismicStats = await pushBooksToPrismic(prepared, {
      update: args.update,
      limit: args.limit,
    });
  }

  const sortedGenres = [...genreCounts.entries()]
    .map(([uid, v]) => ({ uid, name: v.name, bookCount: v.count }))
    .sort((a, b) => b.bookCount - a.bookCount);

  const sortedUnmapped = [...unmappedSubjectCounts.entries()]
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count);

  const sortedIgnored = [...ignoredSubjectCounts.entries()]
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count);

  const summaryPayload = {
    mode: args.dryRun ? "dry-run" : args.enrichOnly ? "enrich-only" : "import",
    processedCount: prepared.length,
    csvSummary,
    googleBooksRateLimited: enricher.isGoogleBooksRateLimited,
    matchCounts,
    seriesSourceCounts,
    seriesCount: new Set(withSeries.map((s) => s.series)).size,
    booksWithSeriesCount: withSeries.length,
    booksWithSeriesPositionCount: withSeries.filter((s) => s.position !== null).length,
    booksWithoutSeriesCount: prepared.length - withSeries.length,
    missingCoverCount: missingCover.length,
    missingGenreCount: missingGenre.length,
    missingDescriptionCount: missingDescription.length,
    missingPageCountCount: missingPageCount.length,
    missingPublishYearCount: missingPublishYear.length,
    genresProduced: sortedGenres,
    unmappedSubjectsCount: sortedUnmapped.length,
    topUnmappedSubjects: sortedUnmapped.slice(0, 120),
    topIgnoredSubjects: sortedIgnored.slice(0, 40),
    isbnMismatches,
    ambiguousOrFailed,
    missingCover,
    missingGenre,
    withSeriesSample: withSeries.slice(0, 40),
    prismicStats,
    sampleBooks: prepared.slice(0, 5).map((r) => ({
      uid: r.csv.uid,
      title: r.csv.title,
      authors: r.csv.authors,
      owned: r.csv.owned,
      readStatus: r.csv.readStatus,
      yearRead: r.csv.yearRead,
      publishYear: r.enriched.publishYear,
      pageCount: r.enriched.pageCount,
      genres: r.genres.map((g) => g.name),
      series: r.enriched.seriesName
        ? `${r.enriched.seriesName}${r.enriched.seriesPosition != null ? ` #${r.enriched.seriesPosition}` : ""}`
        : null,
      hasCover: Boolean(r.enriched.cover),
      hasDescription: Boolean(r.enriched.description),
      hasReview: r.csv.hasReview,
      matchQuality: r.enriched.matchQuality,
    })),
  };

  const outPath =
    args.summaryOut ??
    path.join(
      CACHE_DIR,
      args.dryRun
        ? "last-dry-run.json"
        : args.enrichOnly
          ? "last-enrichment-summary.json"
          : "last-import-summary.json",
    );
  fs.writeFileSync(outPath, JSON.stringify(summaryPayload, null, 2), "utf8");

  console.log("\n=== SUMMARY ===");
  console.log(
    `Mode: ${summaryPayload.mode} | Processed: ${prepared.length} | CSV Total=${csvSummary.totalRows}, Kept=${csvSummary.keptRows}, Skipped=${csvSummary.skippedRows}`,
  );
  console.log("Match quality:", matchCounts);
  console.log(
    `Covers: ${prepared.length - missingCover.length}/${prepared.length} | Genres: ${prepared.length - missingGenre.length}/${prepared.length} | Series: ${withSeries.length}/${prepared.length} (with position: ${summaryPayload.booksWithSeriesPositionCount})`,
  );
  console.log(
    `Descriptions: ${prepared.length - missingDescription.length}/${prepared.length} | Page counts: ${prepared.length - missingPageCount.length}/${prepared.length} | Publish years: ${prepared.length - missingPublishYear.length}/${prepared.length}`,
  );
  console.log("Genres produced:", sortedGenres.map((g) => `${g.name} (${g.bookCount})`).join(", "));
  console.log(`Unmapped subjects: ${sortedUnmapped.length} unique (top 10):`, sortedUnmapped.slice(0, 10));
  if (isbnMismatches.length) {
    console.log("ISBN mismatches caught:", isbnMismatches);
  }
  if (ambiguousOrFailed.length) {
    console.log(`Ambiguous/failed matches: ${ambiguousOrFailed.length}`);
  }
  if (prismicStats) {
    console.log("Prismic result:", JSON.stringify(prismicStats, null, 2));
  }
  console.log(`Full summary saved to: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
