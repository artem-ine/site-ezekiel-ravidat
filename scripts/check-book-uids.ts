/**
 * Scripted checks for book uids and re-import matching (no network, no Prismic).
 * Run: npx tsx scripts/check-book-uids.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findExistingBook, type PublishedBook } from "./lib/book-match";
import { parseStorygraphCsv } from "./lib/csv";
import { bookTitleSlug, bookUid, slugify } from "./lib/slug";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

// Slugs: title only, accents and apostrophes dropped.
assert(bookTitleSlug("Sharp Objects") === "sharp-objects", "plain title slug");
assert(bookTitleSlug("Juniper & Thorn") === "juniper-thorn", "ampersand dropped");
assert(bookTitleSlug("Emily Wilde's Map of the Otherlands") === "emily-wildes-map-of-the-otherlands", "apostrophe dropped");
assert(bookTitleSlug("Histoire de la révolution française") === "histoire-de-la-revolution-francaise", "accents folded");

// Long titles are cut at a word boundary and stay within 88 characters.
const longTitle =
  "The Elegant Universe: Superstrings, Hidden Dimensions, and the Quest for the Ultimate Theory";
const longSlug = bookTitleSlug(longTitle);
assert(
  longSlug === "the-elegant-universe-superstrings-hidden-dimensions-and-the-quest-for-the-ultimate",
  `long title cut at a word boundary (${longSlug})`,
);
assert(longSlug.length <= 88, "long title slug is 88 characters or fewer");
const exact = `${"a".repeat(43)}-${"b".repeat(44)}`;
assert(exact.length === 88 && bookTitleSlug(exact) === exact, "88-character slug is kept whole");
assert(slugify("x".repeat(120), 88) === "x".repeat(88), "unbroken word falls back to a hard cut");

// Audio copies add "-audio" and still fit in 88 characters.
assert(bookUid("Sharp Objects", "audio") === "sharp-objects-audio", "audio uid adds -audio");
assert(bookUid("Sharp Objects", "paperback") === "sharp-objects", "non-audio uid is the slug alone");
const longAudio = bookUid(
  "Who Do You Serve, Who Do You Protect?: Police Violence and Resistance in the United States",
  "audio",
);
assert(longAudio.endsWith("-audio") && longAudio.length <= 88, `long audio uid fits (${longAudio.length})`);

// CSV import: uid is the title slug only, duplicates are flagged instead of suffixed.
const header = [
  "Title", "Authors", "Contributors", "ISBN/UID", "Format", "Read Status", "Date Added",
  "Last Date Read", "Dates Read", "Read Count", "Star Rating", "Review", "Tags", "Moods", "Pace",
  "Character- or Plot-Driven?", "Strong Character Development?", "Loveable Characters?",
  "Diverse Characters?", "Flawed Characters?", "Content Warnings", "Content Warning Description", "Owned?",
];
function row(fields: Record<string, string>): string {
  return header.map((h) => JSON.stringify(fields[h] ?? "")).join(",");
}
const csv = [
  header.map((h) => JSON.stringify(h)).join(","),
  row({ Title: "Gone Girl", Authors: "Gillian Flynn", "ISBN/UID": "9780385347778", Format: "paperback", "Read Status": "read", "Owned?": "Yes" }),
  row({ Title: "Gone Girl", Authors: "Gillian Flynn", "ISBN/UID": "9780753827666", Format: "paperback", "Read Status": "to-read", "Owned?": "Yes" }),
  row({ Title: "Gone Girl", Authors: "Gillian Flynn", "ISBN/UID": "9781427221803", Format: "audio", "Read Status": "read", "Owned?": "Yes" }),
  row({ Title: "Bluets", Authors: "Maggie Nelson", "ISBN/UID": "9781933517407", Format: "paperback", "Read Status": "read", "Owned?": "Yes" }),
].join("\n");
const tmp = path.join(os.tmpdir(), `check-book-uids-${process.pid}.csv`);
fs.writeFileSync(tmp, csv);
const { books } = parseStorygraphCsv(tmp);
fs.rmSync(tmp);
const byIsbn = new Map(books.map((b) => [b.isbn.cleaned, b]));
assert(byIsbn.get("9780385347778")?.uid === "gone-girl", "preferred copy takes the clean uid");
assert(byIsbn.get("9780385347778")?.secondaryCopy === undefined, "preferred copy is not secondary");
assert(byIsbn.get("9781427221803")?.uid === "gone-girl-audio", "audio row gets title slug plus -audio");
assert(byIsbn.get("9780753827666")?.secondaryCopy === true, "second print copy is flagged as secondary");
assert(byIsbn.get("9780753827666")?.uid !== "gone-girl", "secondary copy never reuses the clean uid");
assert(byIsbn.get("9781933517407")?.uid === "bluets", "single copy gets the clean uid");
assert(new Set(books.map((b) => b.uid)).size === books.length, "csv uids are unique");

// Re-import matching: finds the existing document, never proposes a duplicate.
const published: PublishedBook[] = [
  { id: "a", uid: "gone-girl", titleSlug: "gone-girl", isbn: "9780385347778", format: "paperback" },
  { id: "b", uid: "gone-girl-9780753827666", titleSlug: "gone-girl", isbn: "9780753827666", format: "paperback" },
  { id: "c", uid: "gone-girl-audio", titleSlug: "gone-girl", isbn: "9781427221803", format: "audio" },
  { id: "d", uid: "bluets", titleSlug: "bluets", isbn: "9781933517407", format: "paperback" },
];
function match(title: string, uid: string, isbnRaw: string, format: string | null) {
  return findExistingBook({ title, uid, isbnRaw, format }, published);
}
const primary = match("Gone Girl", "gone-girl", "9780385347778", "paperback");
assert(primary.kind === "match" && primary.book.id === "a", "primary copy matches its document by ISBN");
const legacy = match("Gone Girl", "gone-girl-9780753827666", "9780753827666", "paperback");
assert(legacy.kind === "match" && legacy.book.uid === "gone-girl-9780753827666", "older ISBN-suffixed document is found and keeps its uid");
const audio = match("Gone Girl", "gone-girl-audio", "", "audio");
assert(audio.kind === "match" && audio.book.id === "c", "audio row without ISBN matches the audio document");
const isbn10 = match("Bluets", "bluets", "1933517409", "paperback");
assert(isbn10.kind === "match" && isbn10.book.id === "d", "ISBN-10 matches the stored ISBN-13");
const otherEdition = match("Bluets", "bluets", "9781933517643", "paperback");
assert(otherEdition.kind === "none", "a different ISBN is another edition, not a match");
const noIsbn = match("Gone Girl", "gone-girl", "", "paperback");
assert(noIsbn.kind === "match" && noIsbn.book.id === "a", "row without ISBN matches the document holding its uid");
const otherFormat = match("Gone Girl", "gone-girl-x", "", "hardcover");
assert(otherFormat.kind === "none", "no document of that title and format: nothing to match");
const fresh = match("Brand New Book", "brand-new-book", "9780000000002", "paperback");
assert(fresh.kind === "none", "unknown title has no match, so a new document is created");

if (process.exitCode) {
  console.error("\ncheck-book-uids: FAILED");
  process.exit(1);
}
console.log("\ncheck-book-uids: all passed");
