# site-ezekiel-ravidat

Personal library site for Ezekiel Ravidat. Next.js (App Router, TypeScript) with content in Prismic.

- Prismic repository: `e29fe22f` (https://e29fe22f.prismic.io/), Free plan, single locale (`en-us`)
- Hosting target: Vercel (`*.vercel.app`)

**Status: scaffold, content model, Prismic wiring, and StoryGraph import tooling.** The home page checks the Prismic connection; library UI pages are not built yet.

## Setup

Requires Node 20.9+ (developed on Node 22) and npm.

```sh
npm install
cp .env.example .env.local   # fill PRISMIC_ACCESS_TOKEN (and PRISMIC_WRITE_TOKEN for imports)
npm run dev                  # http://localhost:3000
```

The home page lists the custom types it finds in the Prismic repository. If it says "none yet", the models have not been pushed.

### Environment variables & Prismic API tokens

The repository name lives in `prismic.config.json` (`e29fe22f`). **The Content API access is set to `private`** so private book `review` fields cannot be read publicly without a token.

| Variable | Purpose |
| --- | --- |
| `PRISMIC_ACCESS_TOKEN` | Server-side read token for the Content API (`scope: master`). **Required** now that API access is private — add it to `.env.local` locally and to Vercel's Environment Variables for deployment. Never expose it to the browser (`NEXT_PUBLIC_*`). |
| `PRISMIC_WRITE_TOKEN` | Write token for the Asset & Migration APIs. Only needed locally when running `npm run import` or `npm run add-book`. Do not add to Vercel. |
| `PRISMIC_WEBHOOK_SECRET` | If set, `POST /api/revalidate` rejects payloads whose `secret` differs. Use the same value as the webhook secret in Prismic. |
| `NEXT_PUBLIC_PRISMIC_ENVIRONMENT` | Optional override to point the client at a Prismic environment domain instead of production. |
| `GOOGLE_BOOKS_API_KEY` | Optional API key for Google Books fallback during book metadata/cover enrichment (prevents unauthenticated HTTP 429 rate limits). |

To create or inspect tokens via the Prismic CLI (or in the Prismic dashboard under **Settings → API & Security**):

```sh
npx prismic@latest token list --task-id <tid> --user-intent "List tokens"
npx prismic@latest token create --task-id <tid> --user-intent "Create read token"          # -> PRISMIC_ACCESS_TOKEN
npx prismic@latest token create --write --task-id <tid> --user-intent "Create write token" # -> PRISMIC_WRITE_TOKEN
```

## Prismic models

Models are plain JSON in `customtypes/<id>/index.json` and are the source of truth. `prismicio-types.d.ts` is generated from them.

All commands go through the Prismic CLI. It is meant to be driven by agents, so every command needs `--task-id` and `--user-intent`. Get an id once with `npx prismic@latest task-id` and reuse it for the task.

```sh
npx prismic@latest login                      # device-code login, approve in a browser
npx prismic@latest status                     # local vs remote model differences
npx prismic@latest pull                       # remote -> local (overwrites local models)
npx prismic@latest push                       # local -> remote (commit model changes first)
npx prismic@latest gen types                  # regenerate prismicio-types.d.ts
npx prismic@latest type list                  # types known locally
```

The Prismic dashboard's "connect your project to the coding agent" onboarding step is marked done by the CLI when `prismic init`, `prismic pull` or `prismic sync` succeeds (`push` alone does not). Run `prismic pull` once after the first push if the dashboard still shows that banner.

Slice Machine is deprecated and is not used here. The models contain no slices, so the page types have no slice zone.

### Custom types

| Type | API ID | Notes |
| --- | --- | --- |
| Book | `book` | The catalog. Links to authors, one series and genres. Tabs: Main, Reading, StoryGraph. Includes `publish_year`, `page_count`, `blurb`, and private `review`. |
| Author | `author` | `name`, optional `sort_name`, `photo`, `bio`. |
| Series | `series` | `name`, `description`. Books point at the series; the series does not list its books. |
| Genre | `genre` | `name` (the genre), `accent` colour, `description`. Genres are sourced from Open Library / Google Books subjects via `scripts/genre-mapping.json`, not StoryGraph. |
| Shelf | `shelf` | Optional curated shelf: ordered `books` group, `layout_hint`. |
| Site settings | `site_settings` | Single type: title, tagline, about, featured shelf, SEO. |

`book` and `shelf` are page types (each document gets its own URL); `author`, `series`, `genre` and `site_settings` are custom types. All except Site settings are repeatable and have a `uid`. `prismic.config.json` declares the routes `/books/:uid` and `/shelves/:uid`, but **the Next.js routes for them are not built yet** (no UI in this scaffold), so those URLs 404 for now.

### How the StoryGraph export maps onto `book`

| StoryGraph column | Book field |
| --- | --- |
| Title | `title` (and `uid` slug) |
| Authors | `authors[].author` (link to `author`) |
| Contributors, e.g. `Name (Narrator)` | `contributors[].name` + `contributors[].role` |
| ISBN/UID | `isbn` (may be ISBN-13/10, ASIN or empty) |
| Format | `format`: paperback, hardcover, digital, audio |
| Read Status | `read_status`: to-read, currently-reading, read, did-not-finish, paused |
| Date Added | `date_added` |
| Last Date Read | `last_date_read` (`year_read` is populated from it, including year-only entries like `2021`) |
| Dates Read, e.g. `2025/08/01-2025/08/03` | `dates_read[].date_started` / `date_finished` |
| Read Count | `read_count` |
| Moods | `moods[].mood` |
| Pace | `pace` |
| Character- or Plot-Driven?, Strong Character Development?, Loveable / Diverse / Flawed Characters? | the five fields of the same names |
| Star Rating | `rating` (0 to 5, quarter steps) |
| Review | `review` (private, HTML converted to Prismic rich text; see below) |
| Content Warnings, Content Warning Description | `content_warnings`, `content_warning_description` |
| Owned? | `owned` |

Notes on the import mapping:

- Empty cells map to an empty field. Blank `Read Status`, `Format` and `Pace` are valid.
- `uid` is unique per type. Duplicate editions (same title/author in different formats) are deterministically disambiguated (`<title-slug>`, `<title-slug>-<isbn>`, `<title-slug>-<format>`, or `-<n>`).
- HTML entities (`&amp;`, `&#39;`, etc.) are decoded and `Review` HTML is converted into Prismic rich text blocks.
- Only rows where `Owned? = Yes` or `Read Status` is `read`, `did-not-finish`, or `currently-reading` are imported; unowned `to-read` rows are skipped.
- StoryGraph `Tags` are not imported. `genres`, `series`, `series_position`, `blurb`, `publish_year`, `page_count`, `subtitle`, and `cover` are enriched from Open Library (with optional Google Books fallback) and mapped through `scripts/genre-mapping.json`.

### Importing & adding books

Scripts create assets in Prismic's Media Library and documents as **drafts inside the Prismic Migration Release** (they never auto-publish so you can review them in Prismic before publishing).

```sh
# Dry run enrichment + genre mapping on the first 20 books (no writes)
npm run import -- --dry-run --limit 20

# Enrich the full CSV and write .cache/last-enrichment-summary.json (no writes)
npm run import -- --enrich-only

# Import all keepable rows into the Migration Release as drafts (resumable via .cache/prismic-state.json)
npm run import

# Re-sync updated fields for previously imported items
npm run import -- --update

# Add a single book later by ISBN or "Title Author"
npm run add-book -- 9780316246620 --owned --status to-read
npm run add-book -- "Ancillary Justice Ann Leckie" --dry-run
```

Useful flags for `npm run import`:
- `--csv <path>` — path to a StoryGraph CSV export (defaults to the local export path or `STORYGRAPH_CSV_PATH`)
- `--limit <N>` — process only the first `N` importable rows
- `--dry-run` / `--enrich-only` — run parsing, Open Library/Google Books lookup, cover download, and genre mapping locally without touching Prismic
- `--update` — update existing documents in the Migration Release/repo when local payload hashes change
- `--no-cache` — bypass `.cache/lookup-cache.json`

**Migration Release 1,000-document limit:** Prismic Migration Releases cap simultaneous draft documents at 1,000. Since a full library (genres + series + authors + books) can exceed 1,000 documents, `npm run import` checkpoints every uploaded asset and document to `.cache/prismic-state.json` (gitignored) and stops cleanly if the release limit is hit. Publish the first batch in Prismic, then re-run `npm run import` to push the remaining drafts without duplicating already-created assets or documents.

### Reviews are not public in v1

Ezekiel decided there are no public reviews in v1. The `review` field exists so the data survives, and **Prismic's Content API is set to `private`** (`PRISMIC_ACCESS_TOKEN` required server-side). The site never renders `review`.

### Deliberately left out

- Locales: English only (`en-us`).
- Visitor accounts, search index, live StoryGraph sync.
- Per-filter shelf documents. "Read in 2024", "unread owned", "by genre" and similar are computed in code from book fields; `shelf` is only for hand-curated arrangements and has no `mode` field.
- Author `links`, series `books` back-references, `purchase_year`, `edition_year`, publisher.
- StoryGraph tags: not modelled, they are not genres.
- Slices. There is no About page yet; `site_settings.about` holds the blurb.

## Routes in this scaffold

| Route | What it does |
| --- | --- |
| `/` | Connection check against Prismic. |
| `/api/preview`, `/api/exit-preview` | Draft preview support (`<PrismicPreview>` is in the root layout). |
| `/api/revalidate` | Webhook target to clear cached Prismic content after publish. |

After deploying, register the webhook and a preview URL (needs a user login, not a write token):

```sh
npx prismic@latest webhook create https://<your-app>.vercel.app/api/revalidate \
  --trigger documentsPublished --trigger documentsUnpublished
npx prismic@latest preview add https://<your-app>.vercel.app/api/preview --name Production
```

## Scripts

```sh
npm run dev      # development server
npm run build    # production build
npm run start    # serve the production build
npm run lint     # ESLint
npm run import   # StoryGraph CSV -> Prismic Migration Release drafts
npm run add-book # add a single book by ISBN or "title author"
```
