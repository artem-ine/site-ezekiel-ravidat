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
import { authorSortKey } from "../lib/author-sort";
import { groupIntoWings, sortByAuthor } from "../components/library2d/wings";

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
    authorSort: "test",
    genres: [{ name: genre, accent: null, parent: "Fiction" }],
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


{
  // Author keys and ordering.
  assert(authorSortKey("Isaac Asimov") === "asimov isaac", "author key puts surname first");
  assert(authorSortKey("Ursula K. Le Guin").startsWith("le guin"), "particles stay with the surname");
  assert(authorSortKey("Martin Luther King Jr.").startsWith("king"), "suffixes are ignored");
  assert(authorSortKey("Angela Davis") > authorSortKey("Isaac Asimov"), "Davis files after Asimov");
  assert(authorSortKey("") === "\uffff", "no author files last");

  const named = (uid: string, author: string, extra: Partial<LibraryBook> = {}) =>
    fakeBook(uid, 300, "Fantasy", { authors: [author], authorSort: authorSortKey(author), ...extra });
  const sorted = sortByAuthor([
    named("z1", "Zadie Smith"),
    named("a1", "Isaac Asimov"),
    named("b2", "Octavia Butler", { series: "Earthseed", seriesPosition: 2 }),
    named("b1", "Octavia Butler", { series: "Earthseed", seriesPosition: 1 }),
  ]);
  assert(
    sorted.map((b) => b.uid).join(",") === "a1,b1,b2,z1",
    "sorted by author surname, then series order",
  );
}

{
  // Wings: parent genres divide the library, subgenres sit inside.
  const inGenre = (uid: string, genre: string, parent: string | null, author = "Test") =>
    fakeBook(uid, 300, genre, {
      authors: [author],
      authorSort: authorSortKey(author),
      genres: [{ name: genre, accent: null, parent }],
    });

  const mixedLibrary: LibraryBook[] = [
    ...Array.from({ length: 70 }, (_, i) => inGenre(`f-${i}`, "Fantasy", "Fiction", `Author ${String.fromCharCode(90 - (i % 26))}${i}`)),
    ...Array.from({ length: 6 }, (_, i) => inGenre(`h-${i}`, "Horror", "Fiction")),
    ...Array.from({ length: 5 }, (_, i) => inGenre(`r-${i}`, "Romance", "Fiction")),
    ...Array.from({ length: 4 }, (_, i) => inGenre(`p-${i}`, "Politics", "Nonfiction")),
    ...Array.from({ length: 4 }, (_, i) => inGenre(`m-${i}`, "Memoir", "Nonfiction")),
    ...Array.from({ length: 3 }, (_, i) => inGenre(`c-${i}`, "Crime", "Nonfiction")),
    ...Array.from({ length: 5 }, (_, i) => inGenre(`l-${i}`, "History", null)),
  ];

  const wings = groupIntoWings(mixedLibrary);
  assert(
    wings.map((w) => w.label).join("|") === "Fiction|Nonfiction|Unsorted",
    "wings run Fiction, Nonfiction, then Unsorted last",
  );
  const fantasy = wings[0]!.shelves.find((s) => s.label === "Fantasy")!;
  const keys = fantasy.books.map((b) => b.authorSort);
  assert(
    keys.every((key, i) => i === 0 || keys[i - 1]!.localeCompare(key) <= 0),
    "a subgenre shelf runs A to Z by author",
  );

  const plan = buildFloorPlan(mixedLibrary);
  const cols = duplexColumns(plan);
  assert(plan.wings.length === 3, "plan lists three wings");
  assert(cols.filter((c) => c.wingStart).length === 3, "one wing gate per wing");
  assert(
    plan.wings.every((w) => cols[w.startSlot]?.wingStart && cols[w.startSlot]?.parent === w.label),
    "each wing starts at its first column",
  );
  assert(
    cols.every((c, i) => i === 0 || c.parent === cols[i - 1]!.parent || c.wingStart),
    "a wing never mixes into the next without a gate",
  );

  const nonfiction = cols.filter((c) => c.parent === "Nonfiction");
  assert(
    nonfiction.length === 2 &&
      !nonfiction[0]!.upper.empty &&
      nonfiction[0]!.ground.label !== nonfiction[0]!.upper.label,
    "small subgenres share a column, one per floor",
  );
  const placed = plan.bays.flatMap((b) => b.books.map((book) => book.uid));
  assert(
    placed.length === mixedLibrary.length && new Set(placed).size === mixedLibrary.length,
    "every book is shelved exactly once across wings",
  );

  // Reading order within a split subgenre runs ground then loft, top row first.
  const fantasyBays = plan.bays.filter((b) => b.label.startsWith("Fantasy"));
  const reading = fantasyBays.flatMap((b) => [...b.shelfRows].reverse().flat().flatMap(itemBooks));
  const readKeys = reading.map((b) => b.authorSort);
  assert(
    readKeys.every((key, i) => i === 0 || readKeys[i - 1]!.localeCompare(key) <= 0),
    "reading order stays A to Z across rows and floors",
  );
}

if (process.exitCode) {
  console.error("\ncheck-genre-floors: FAILED");
  process.exit(1);
}
console.log("\ncheck-genre-floors: all passed");
