/**
 * Scripted checks for genre → duplex shelf packing (no browser).
 * Run: npx tsx scripts/check-genre-floors.ts
 */
import {
  BAY_MAX_WIDTH_REM,
  BAY_MIN_WIDTH_REM,
  bayRailWidthRem,
  buildFloorPlan,
  duplexColumns,
  fitRowCount,
  packShelfRows,
} from "../components/library2d/floorLayout";
import type { LibraryBook } from "../lib/books";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

function fakeBook(uid: string, pages = 300): LibraryBook {
  return {
    uid,
    title: uid,
    subtitle: null,
    authors: ["Test"],
    genres: [{ name: "Science Fiction", accent: null }],
    series: null,
    seriesPosition: null,
    coverUrl: null,
    coverAlt: uid,
    pageCount: pages,
    publishYear: null,
    yearRead: null,
    readStatus: "read",
    description: null,
    format: null,
  };
}

// Narrow books so many fit; wide books force more rows.
const narrow = Array.from({ length: 40 }, (_, i) => fakeBook(`n-${i}`, 120));
const mixed = [
  ...Array.from({ length: 12 }, (_, i) => fakeBook(`m-${i}`, 280)),
  ...Array.from({ length: 12 }, (_, i) => fakeBook(`w-${i}`, 700)),
];

{
  const maxInner = BAY_MAX_WIDTH_REM - 3.5;
  const n = fitRowCount(narrow, maxInner);
  assert(n >= 8, `fitRowCount packs several narrow spines (got ${n})`);
  const rows = packShelfRows(narrow, maxInner);
  assert(rows.every((row) => fitRowCount(row, maxInner) === row.length), "each packed row fits");
  assert(
    rows.reduce((s, r) => s + r.length, 0) === narrow.length,
    "packShelfRows keeps every book",
  );
  const uids = rows.flat().map((b) => b.uid);
  assert(new Set(uids).size === uids.length, "no duplicate books across rows");
}

{
  // Build a plan from a single fat genre via groupIntoShelves path:
  // inject many SF-tagged books — groupBooks uses genre names from the book.
  const plan = buildFloorPlan(mixed);
  const cols = duplexColumns(plan);
  assert(cols.length >= 1, "at least one column");

  for (const col of cols) {
    for (const bay of [col.ground, col.upper]) {
      if (bay.empty) continue;
      assert(bay.shelfRows.length >= 1, `${bay.label} has shelf rows`);
      for (const row of bay.shelfRows) {
        assert(row.length > 0, `${bay.label} row not empty`);
      }
      const flat = bay.shelfRows.flat().map((b) => b.uid);
      assert(new Set(flat).size === flat.length, `${bay.label} no dupes in rows`);
      assert(
        bayRailWidthRem(bay) <= BAY_MAX_WIDTH_REM + 0.01,
        `${bay.label} width within max (${bayRailWidthRem(bay)})`,
      );
      assert(
        bayRailWidthRem(bay) >= BAY_MIN_WIDTH_REM,
        `${bay.label} width at least min`,
      );
    }
    // Same genre spanning floors when overflow exists
    if (!col.ground.empty && !col.upper.empty && col.ground.paired) {
      assert(
        col.upper.label.includes(col.ground.label.split(" · ")[0]!) ||
          col.upper.paired,
        "upper loft pairs with ground genre",
      );
    }
  }
}

{
  // All books from input appear exactly once across the plan.
  const plan = buildFloorPlan(mixed);
  const seen = plan.bays.flatMap((b) => b.books.map((book) => book.uid));
  assert(seen.length === mixed.length, `all books placed (got ${seen.length}/${mixed.length})`);
  assert(new Set(seen).size === mixed.length, "each book once across floors");
}

if (process.exitCode) {
  console.error("\ncheck-genre-floors: FAILED");
  process.exit(1);
}
console.log("\ncheck-genre-floors: all passed");
