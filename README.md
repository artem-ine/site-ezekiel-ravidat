# site-ezekiel-ravidat

Personal library site for Ezekiel Ravidat. Next.js (App Router, TypeScript) with content in Prismic.

- Prismic repository: `e29fe22f` (https://e29fe22f.prismic.io/), Free plan, single locale (`en-us`)
- Hosting target: Vercel (`*.vercel.app`)

**Status: scaffold, content model and Prismic wiring only.** The home page only proves the Prismic connection works. There is no library UI and no imported data yet.

## Setup

Requires Node 20.9+ (developed on Node 22) and npm.

```sh
npm install
cp .env.example .env.local   # optional, see below
npm run dev                  # http://localhost:3000
```

The home page lists the custom types it finds in the Prismic repository. If it says "none yet", the models have not been pushed.

### Environment variables

The repository name lives in `prismic.config.json` (not an env var). All variables below are optional.

| Variable | Purpose |
| --- | --- |
| `PRISMIC_ACCESS_TOKEN` | Server-side token for the Content API. Required once the repository API access is set to private, including at `npm run build`. Never expose it to the browser. |
| `PRISMIC_WEBHOOK_SECRET` | If set, `POST /api/revalidate` rejects payloads whose `secret` differs. Use the same value as the webhook secret in Prismic. |
| `NEXT_PUBLIC_PRISMIC_ENVIRONMENT` | Point the client at a Prismic environment domain instead of production. |

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

Slice Machine is deprecated and is not used here. Slices are plain files created with `prismic slice create` and live in `slices/<Name>/` (`model.json` plus a React component); `slices/index.ts` is generated.

### Custom types

| Type | API ID | Notes |
| --- | --- | --- |
| Book | `book` | The catalog. Links to authors, one series and genres. Tabs: Main, Reading, StoryGraph. |
| Author | `author` | `name`, optional `sort_name`, `photo`, `bio`. |
| Series | `series` | `name`, `description`. Books point at the series; the series does not list its books. |
| Genre | `genre` | `name` (the genre), `accent` colour, `description`. Genres are sourced from Open Library or Google Books subjects, not StoryGraph. |
| Page | `page` | Free-form pages (home, about): `title`, a slice zone, SEO & Metadata tab. |
| Shelf | `shelf` | Optional curated shelf: ordered `books` group, `layout_hint`, plus a slice zone for editorial content above the book grid. |
| Site settings | `site_settings` | Single type: title, tagline, about, featured shelf, SEO. |

`book`, `shelf` and `page` are page types (each document gets its own URL); `author`, `series`, `genre` and `site_settings` are custom types. All except Site settings are repeatable and have a `uid`. `prismic.config.json` declares the routes `/books/:uid`, `/shelves/:uid` and `/:uid`. Only `/:uid` (the `page` type) is built; **the Next.js routes for books and shelves are not built yet**, so those URLs 404 for now.

### Slices

| Slice | Fields | Used in |
| --- | --- | --- |
| Hero (`hero`) | `heading`, `subheading`, `image`, `link` (with text) | `page` |
| Featured Shelf (`featured_shelf`) | `shelf` (link to `shelf`), optional `heading` | `page` |
| Text Block (`text_block`) | `text` (rich text) | `page`, `shelf` |
| Book Spotlight (`book_spotlight`) | `book` (link to `book`), optional `note` (rich text) | `page`, `shelf` |
| Currently Reading (`currently_reading`) | `heading`, `books` group of links to `book` (Prismic groups have no max, so the component shows the first 6) | `page` |
| Pull Quote (`pull_quote`) | `quote`, `attribution` | `shelf` |

The components in `slices/` are deliberately bare: semantic HTML, no styling. Linked books and shelves are loaded with `fetchLinks` (see `lib/related.ts`) and shown as plain titles, because their detail routes do not exist yet. The shelf slice zone is modelled but nothing renders it yet.

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
| Last Date Read | `last_date_read` (`year_read` is derived from it at import) |
| Dates Read, e.g. `2025/08/01-2025/08/03` | `dates_read[].date_started` / `date_finished` |
| Read Count | `read_count` |
| Moods | `moods[].mood` |
| Pace | `pace` |
| Character- or Plot-Driven?, Strong Character Development?, Loveable / Diverse / Flawed Characters? | the five fields of the same names |
| Star Rating | `rating` (0 to 5, quarter steps) |
| Review | `review` (private, see below) |
| Content Warnings, Content Warning Description | `content_warnings`, `content_warning_description` |
| Owned? | `owned` |

Notes for the import step (not done here):

- Empty cells map to an empty field. Blank `Read Status`, `Format` and `Pace` are valid.
- `uid` must be unique per type. Titles repeat, so derive it from title plus a disambiguator (for example the ISBN) when needed.
- Decode HTML entities (`&amp;`) and wrap `Review` HTML into rich text.
- The catalog is owned books plus the full read history, so import rows that are `Owned? = Yes` or have been read, and skip unowned to-read rows.
- StoryGraph `Tags` are a different thing from genres and are not imported (the column is empty in the sample export). `genres` are filled from Open Library or Google Books subjects during cover/metadata enrichment, one `genre` document per genre.

### Reviews are not public in v1

Ezekiel decided there are no public reviews in v1. The `review` field exists so the data survives, but **Prismic's Content API is public by default, so anything stored in `review` is readable by anyone who knows the repository name**. Before importing reviews, make the API private and use a token on the server:

```sh
npx prismic@latest repo set-api-access private
npx prismic@latest token create     # put the result in PRISMIC_ACCESS_TOKEN
```

The site never renders `review`.

### Deliberately left out

- Locales: English only (`en-us`).
- Visitor accounts, search index, live StoryGraph sync.
- Per-filter shelf documents. "Read in 2024", "unread owned", "by genre" and similar are computed in code from book fields; `shelf` is only for hand-curated arrangements and has no `mode` field.
- Author `links`, series `books` back-references, `purchase_year`, `edition_year`, `page_count`, publisher. Add them if the UI needs them.
- StoryGraph tags: not modelled, they are not genres.
- Visual design: slice components are unstyled placeholders.

## Routes in this scaffold

| Route | What it does |
| --- | --- |
| `/` | Renders the `page` document with UID `home` (so create a `page` with UID `home` for the home page). If none is published it shows the Prismic connection check instead. |
| `/[uid]` | Renders any `page` document by UID through the slice zone (`/about`, and also `/home`). |
| `/slice-simulator` | Slice preview for the Prismic page builder. Set it with `prismic preview set-simulator <url>/slice-simulator`. |
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
npm run dev     # development server
npm run build   # production build
npm run start   # serve the production build
npm run lint
```
