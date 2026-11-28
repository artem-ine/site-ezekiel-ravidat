/**
 * Scripted checks for the loft reading stats (no browser).
 * Run: npx tsx scripts/check-reading-stats.ts
 */
import type { LibraryBook } from "../lib/books";
import { readingStats, statsTitleKey } from "../components/library2d/readingStats";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function book(uid: string, title: string, over: Partial<LibraryBook> = {}): LibraryBook {
  return {
    uid,
    title,
    subtitle: null,
    authors: [],
    authorSort: "",
    genres: [],
    series: null,
    seriesPosition: null,
    coverUrl: null,
    coverAlt: "",
    pageCount: null,
    publishYear: null,
    yearRead: 2024,
    readStatus: "read",
    description: null,
    descriptionRichText: null,
    format: "paperback",
    ...over,
  };
}

function formatCount(stats: ReturnType<typeof readingStats>, label: string): number {
  return stats?.formats.find((row) => row.label === label)?.count ?? 0;
}

function yearCount(stats: ReturnType<typeof readingStats>, label: string): number {
  return stats?.years.rows.find((row) => row.label === label)?.count ?? 0;
}

assert(statsTitleKey("Yellowface - audio") === statsTitleKey("Yellowface"), "audio suffix ignored");
assert(statsTitleKey("Yellowface - double") === statsTitleKey("Yellowface"), "double suffix ignored");
assert(
  statsTitleKey("H Is for Hawk - audio") === statsTitleKey("H is for Hawk"),
  "titles match regardless of case",
);
assert(statsTitleKey("Kitchen") !== statsTitleKey("Kitchen Confidential"), "different titles stay apart");

const paperbackAndAudio = readingStats([
  book("a", "Yellowface", { format: "paperback" }),
  book("a-audio", "Yellowface - audio", { format: "audio" }),
]);
assert(paperbackAndAudio?.total === 1, "paperback + audio in one year counts once");
assert(yearCount(paperbackAndAudio, "2024") === 1, "year bucket counts the book once");
assert(formatCount(paperbackAndAudio, "Paperback") === 1, "visible copy represents the book");
assert(formatCount(paperbackAndAudio, "Audio") === 0, "audio copy is not counted when a visible copy exists");

const audioFirst = readingStats([
  book("b-audio", "Beloved - audio", { format: "audio" }),
  book("b", "Beloved", { format: "hardcover" }),
]);
assert(formatCount(audioFirst, "Hardback") === 1 && formatCount(audioFirst, "Audio") === 0, "order does not matter");

const audioOnly = readingStats([
  book("c-audio", "Out There Screaming - audio", { format: "audio" }),
  book("c-double", "Out There Screaming - double", { format: "audio" }),
]);
assert(audioOnly?.total === 1 && formatCount(audioOnly, "Audio") === 1, "audio-only copies count once as audio");

const otherYears = readingStats([
  book("d", "Kitchen", { yearRead: 2023 }),
  book("d2", "Kitchen", { yearRead: 2026, format: "audio" }),
]);
assert(otherYears?.total === 2, "same title in different years counts once per year");
assert(yearCount(otherYears, "2023") === 1 && yearCount(otherYears, "2026") === 1, "each year keeps its read");
assert(formatCount(otherYears, "Audio") === 1 && formatCount(otherYears, "Paperback") === 1, "formats follow each year's copy");

const undated = readingStats([
  book("e", "Caliban's War", { yearRead: null }),
  book("e-audio", "Caliban's War - audio", { yearRead: null, format: "audio" }),
  book("f", "Leviathan Wakes", { yearRead: 2021, format: "hardcover" }),
  book("f-audio", "Leviathan Wakes - audio", { yearRead: null, format: "audio" }),
]);
assert(undated?.total === 2, "undated and 2021 reads of one title collapse together");
assert(yearCount(undated, "2021") === 2, "undated reads sit in the 2021 bucket");
assert(formatCount(undated, "Hardback") === 1 && formatCount(undated, "Audio") === 0, "2021 copy that is visible wins");

const ignored = readingStats([
  book("g", "Dune", { readStatus: "not-read" }),
  book("h", "Emma", { readStatus: "currently-reading" }),
]);
assert(ignored === null, "only books marked read count");

const consistent = readingStats([
  book("i", "One", { yearRead: 2022 }),
  book("i2", "One - audio", { yearRead: 2022, format: "audio" }),
  book("j", "Two", { yearRead: 2023, format: null }),
  book("k", "Three - audio", { yearRead: 2023, format: "audio" }),
]);
const yearSum = consistent?.years.rows.reduce((sum, row) => sum + row.count, 0);
const formatSum = consistent?.formats.reduce((sum, row) => sum + row.count, 0);
assert(consistent?.total === 3 && yearSum === 3 && formatSum === 3, "total, years and formats agree");

if (failures > 0) {
  console.error(`${failures} reading stats check(s) failed`);
  process.exit(1);
}
console.log("Reading stats checks passed");
