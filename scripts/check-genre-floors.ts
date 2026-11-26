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
  buildFloorPlan,
  buildShelfItems,
  caseWidthRem,
  duplexColumns,
  fitRowCount,
  itemBooks,
  itemsWidthRem,
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

function fakeBook(
  uid: string,
  pages = 300,
  genre = "Science Fiction",
  extra: Partial<LibraryBook> = {},
): LibraryBook {
  return {
    uid,
    title: uid,
    subtitle: null,
    authors: ["Test"],
    genres: [{ name: genre, accent: null }],
    series: null,
    seriesPosition: null,
    coverUrl: `https://images.prismic.io/${uid}.jpg`,
    coverAlt: uid,
    pageCount: pages,
    publishYear: null,
    yearRead: null,
    readStatus: "read",
    description: null,
    format: null,
    ...extra,
  };
}

function series(name: string, count: number, genre = "Fantasy"): LibraryBook[] {
  return Array.from({ length: count }, (_, i) =>
    fakeBook(`${name}-${i + 1}`, 250 + i * 40, genre, {
      series: name,
      seriesPosition: i + 1,
    }),
  );
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
const fantasy = [
  ...series("Aurora", 3),
  ...series("Brambles", 4),
  ...series("Cinders", 5),
  ...series("Drift", 7),
  ...series("Ember", 2),
  ...Array.from({ length: 30 }, (_, i) => fakeBook(`solo-${i}`, 100 + ((i * 53) % 500), "Fantasy")),
];

{
  const maxInner = BAY_MAX_WIDTH_REM - BAY_CHROME_REM;
  const items = buildShelfItems(narrow, false);
  const n = fitRowCount(items, maxInner);
  assert(n >= 8, `fitRowCount packs several narrow spines (got ${n})`);
  const rows = packShelfRows(items, maxInner);
  assert(
    rows.every((row) => itemsWidthRem(row) <= maxInner + 0.001),
    "each packed row fits the bay",
  );
  assert(
    rows.every((row) => fitRowCount(row, maxInner) === row.length),
    "each packed row is a complete fit",
  );
  const uids = rows.flat().flatMap(itemBooks).map((b) => b.uid);
  assert(uids.length === narrow.length, "packShelfRows keeps every book");
  assert(new Set(uids).size === uids.length, "no duplicate books across rows");
}

{
  // Variety: gaps are not all equal, and series are gathered into piles or sets.
  const items = buildShelfItems(fantasy, true);
  const gaps = new Set(items.map((item) => item.gapRem.toFixed(2)));
  assert(gaps.size >= 4, `gaps vary across the shelf (${gaps.size} distinct)`);
  const stacks = items.filter((item) => item.kind === "stack");
  assert(stacks.length >= 2, `series become flat stacks (${stacks.length})`);
  assert(
    stacks.every((s) => s.kind === "stack" && s.pieces.length >= 2 && s.pieces.length <= 3),
    "stacks hold 2-3 books",
  );
  assert(
    stacks.every((s) => {
      if (s.kind !== "stack") return false;
      const names = new Set(s.pieces.map((p) => p.book.series));
      return names.size === 1;
    }),
    "a stack never mixes series",
  );
  assert(items.some((item) => item.kind === "face"), "some books face out");
  assert(
    items.every((item, i) => !(item.kind === "face" && items[i - 1]?.kind === "face")),
    "no two cover-out books side by side",
  );

  // Series members sit together, in reading order.
  for (const name of ["Aurora", "Brambles", "Cinders", "Drift", "Ember"]) {
    const order = items
      .flatMap(itemBooks)
      .filter((book) => book.series === name)
      .map((book) => book.seriesPosition);
    const sorted = [...order].sort((a, b) => (a ?? 0) - (b ?? 0));
    assert(
      order.every((pos, i) => pos === sorted[i]),
      `${name} is shelved in series order`,
    );
  }

  const again = buildShelfItems(fantasy, true);
  assert(
    JSON.stringify(items.map((i) => [i.kind, i.widthRem, i.gapRem])) ===
      JSON.stringify(again.map((i) => [i.kind, i.widthRem, i.gapRem])),
    "shelving is deterministic",
  );
  assert(
    buildShelfItems(fantasy, false).every((item) => item.kind !== "face"),
    "faces can be turned off",
  );
}

for (const [name, input] of [
  ["mixed", mixed],
  ["fantasy", fantasy],
  ["biography", biography],
] as const) {
  const plan = buildFloorPlan(input);
  const cols = duplexColumns(plan);
  assert(cols.length >= 1, `${name}: at least one column`);

  for (const col of cols) {
    for (const bay of [col.ground, col.upper]) {
      if (bay.empty) continue;
      assert(bay.shelfRows.length >= 1, `${bay.label} has shelf rows`);
      const flat = bay.books.map((b) => b.uid);
      assert(new Set(flat).size === flat.length, `${bay.label} no dupes in rows`);

      for (const row of bay.shelfRows) {
        assert(row.length > 0, `${bay.label} row not empty`);
        const rowW = itemsWidthRem(row);
        const caseW = caseWidthRem(bay);
        assert(
          caseW + 0.001 >= rowW + CASE_SIDE_PAD_REM * 2,
          `${bay.label}: case ${caseW.toFixed(2)} covers row ${rowW.toFixed(2)} + pads`,
        );
      }

      const content = bayContentWidthRem(bay);
      assert(
        caseWidthRem(bay) >= content + CASE_SIDE_PAD_REM * 2 - 0.001,
        `${bay.label}: case covers widest row`,
      );
      const maxBay = BAY_MAX_WIDTH_REM + (bay.paired ? LADDER_SPACE_REM : 0) + 0.01;
      assert(
        bayRailWidthRem(bay) <= maxBay,
        `${bay.label} width within max (${bayRailWidthRem(bay).toFixed(1)})`,
      );
      assert(bayRailWidthRem(bay) >= BAY_MIN_WIDTH_REM, `${bay.label} width at least min`);

      // Cover-out books only live on single-row shelves (they are 4.8rem tall).
      if (bay.shelfRows.length > 1) {
        assert(
          bay.shelfRows.flat().every((item) => item.kind !== "face"),
          `${bay.label}: no cover-out books on double-height shelves`,
        );
      }
    }
    if (!col.ground.empty && !col.upper.empty && col.ground.paired) {
      assert(col.ground.paired && col.upper.paired, "both floors marked paired for loft");
    }
  }

  const seen = plan.bays.flatMap((b) => b.books.map((book) => book.uid));
  assert(seen.length === input.length, `${name}: all books placed (got ${seen.length}/${input.length})`);
  assert(new Set(seen).size === input.length, `${name}: each book once across floors`);
}

if (process.exitCode) {
  console.error("\ncheck-genre-floors: FAILED");
  process.exit(1);
}
console.log("\ncheck-genre-floors: all passed");
