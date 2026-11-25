/**
 * Scripted checks for genre → duplex shelf packing (no browser).
 * Run: npx tsx scripts/check-genre-floors.ts
 */
import {
  BAY_CHROME_REM,
  BAY_MAX_WIDTH_REM,
  BAY_MIN_WIDTH_REM,
  CASE_SIDE_PAD_REM,
  LADDER_SPACE_REM,
  bayContentWidthRem,
  bayRailWidthRem,
  booksWidthRem,
  buildFloorPlan,
  caseWidthRem,
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

function fakeBook(uid: string, pages = 300, genre = "Science Fiction"): LibraryBook {
  return {
    uid,
    title: uid,
    subtitle: null,
    authors: ["Test"],
    genres: [{ name: genre, accent: null }],
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
const biography = Array.from({ length: 18 }, (_, i) =>
  fakeBook(`bio-${i}`, 320, "Biography"),
);

{
  const maxInner = BAY_MAX_WIDTH_REM - BAY_CHROME_REM;
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
  const plan = buildFloorPlan(mixed);
  const cols = duplexColumns(plan);
  assert(cols.length >= 1, "at least one column");

  for (const col of cols) {
    for (const bay of [col.ground, col.upper]) {
      if (bay.empty) continue;
      assert(bay.shelfRows.length >= 1, `${bay.label} has shelf rows`);
      for (const row of bay.shelfRows) {
        assert(row.length > 0, `${bay.label} row not empty`);
        const rowW = booksWidthRem(row);
        const caseW = caseWidthRem(bay);
        assert(
          caseW + 0.001 >= rowW + CASE_SIDE_PAD_REM * 2,
          `${bay.label}: case ${caseW.toFixed(2)} covers row ${rowW.toFixed(2)} + pads`,
        );
        assert(
          caseW + 0.001 >= rowW,
          `${bay.label}: case width >= row content (${caseW.toFixed(2)} >= ${rowW.toFixed(2)})`,
        );
      }
      const content = bayContentWidthRem(bay);
      const caseW = caseWidthRem(bay);
      assert(
        caseW >= content + CASE_SIDE_PAD_REM * 2 - 0.001,
        `${bay.label}: case covers widest row (${caseW.toFixed(2)} vs content ${content.toFixed(2)})`,
      );
      const flat = bay.shelfRows.flat().map((b) => b.uid);
      assert(new Set(flat).size === flat.length, `${bay.label} no dupes in rows`);
      const maxBay = BAY_MAX_WIDTH_REM + (bay.paired ? LADDER_SPACE_REM : 0) + 0.01;
      assert(
        bayRailWidthRem(bay) <= maxBay,
        `${bay.label} width within max (${bayRailWidthRem(bay)})`,
      );
      assert(
        bayRailWidthRem(bay) >= BAY_MIN_WIDTH_REM,
        `${bay.label} width at least min`,
      );
    }
    if (!col.ground.empty && !col.upper.empty && col.ground.paired) {
      assert(
        col.upper.label.includes(col.ground.label.split(" · ")[0]!) ||
          col.upper.paired,
        "upper loft pairs with ground genre",
      );
      assert(col.ground.paired && col.upper.paired, "both floors marked paired for loft");
    }
  }
}

{
  // Biography-sized genre: case always >= every row.
  const plan = buildFloorPlan(biography);
  for (const bay of plan.bays) {
    if (bay.empty) continue;
    const caseW = caseWidthRem(bay);
    for (const row of bay.shelfRows) {
      assert(
        caseW >= booksWidthRem(row) - 0.001,
        `Biography bay case covers row (${caseW} >= ${booksWidthRem(row)})`,
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
