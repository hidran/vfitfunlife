# SEO: brand keyword and public pages

The app is a hybrid Next.js static export behind Firebase Auth. That combination is why
`vfitfunlife` did not appear in Google at all: every route below the `(main)` group is wrapped by
`src/app/(main)/layout.tsx`, which redirects a signed-out visitor to `/auth/login`. A crawler
therefore only ever saw a login wall, and the sitemap pointed at pages it could not index.

## Keyword map

One primary keyword per URL. Titles and H1s are built around these; do not add a second page for
the same intent (two pages competing for one query cannibalise each other).

| URL | Primary keyword | Secondary |
|---|---|---|
| `/` | Vfitfunlife | marketplace fitness Italia, palestre, personal trainer, spa, eventi |
| `/palestre-torino/` | palestre Torino | centri fitness Torino, corsi fitness Torino, lezioni di gruppo Torino |
| `/personal-trainer-torino/` | personal trainer Torino | trainer a domicilio Torino, personal trainer online, prezzo personal trainer |
| `/spa-benessere-torino/` | spa Torino | massaggi Torino, centro estetico Torino, trattamenti viso Torino |
| `/eventi-torino/` | eventi Torino | feste private Torino, esperienze VR Torino, cosa fare a Torino |
| `/diventa-trainer/` | diventa personal trainer Torino | lavoro personal trainer Torino, trainer fondatore |

Rules that the code enforces, so keep them true when editing:

- The brand is written **Vfitfunlife** (one word) in the title template, the manifest, the
  Organization JSON-LD and the footer. Older material says "V Fitness" / "VFitFunLife"; both split
  the brand entity Google is trying to learn. The root title template is
  `%s | Vfitfunlife`, so page titles must not repeat the brand.
- The root layout sets **no** `alternates.canonical`. It used to, and because metadata is
  inherited, every page declared itself a duplicate of `/`. Pages that need a canonical declare it
  themselves (`src/app/privacy/layout.tsx`, `src/app/terms/layout.tsx`,
  `src/components/seo/TorinoLandingPage.tsx`).
- Page titles stay under 65 characters including the `| Vfitfunlife` suffix; meta descriptions
  stay between 110 and 175 characters. `src/lib/seo/torinoLandings.test.ts` checks the landing
  pages.
- `/auth/*` is `noindex, nofollow` (`src/app/auth/layout.tsx`): funnel screens, not content.
- The sitemap lists **only** signed-out pages. Listing gated URLs produces "Page with redirect"
  in Search Console and wastes crawl budget. Directory URLs carry a trailing slash — Firebase
  Hosting 301s `/privacy` to `/privacy/`, so the sitemap uses the 200 form.
- Each landing page is server-rendered with its copy in the exported HTML, plus
  `WebPage`, `BreadcrumbList` and `FAQPage` JSON-LD.

## Adding a city or category page

1. Add an entry to `TORINO_LANDINGS` in `src/lib/seo/torinoLandings.ts` with its own copy, FAQ
   and CTA into the app.
2. Create `src/app/<slug>/page.tsx` — three lines, see `src/app/palestre-torino/page.tsx`.
3. Add the URL to `public/sitemap.xml`.
4. Link it from the homepage footer nav, which renders `TORINO_LANDINGS` automatically, and from
   `related` on its siblings.

Do not generate these pages from a keyword template: pages differing only in the city name are
treated as doorway pages and devalued.

## Search Console (do this once, then it is automatic)

1. Google Search Console → **Add property** → *URL prefix* → `https://vfit-funlife.web.app/`.
2. **Verification → HTML tag** → copy the `content` value.
3. Put it in the build environment:
   ```env
   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<content value>
   ```
   The root layout emits the meta tag only when this is set (`.env.example` documents it).
4. `npm run deploy:hosting`, then run the verification in Search Console.
5. **Sitemaps → Add a new sitemap** → `sitemap.xml`. Status should become *Success* with the
   discovered URL count.
6. **URL Inspection** on `/`, `/palestre-torino/`, `/personal-trainer-torino/`,
   `/spa-benessere-torino/`, `/eventi-torino/`, then **Request indexing** on each. First
   indexing of a new site typically takes a few days, longer for a `web.app` subdomain.

## The domain problem (outside the codebase)

`www.vfitfunlife.com` currently answers from Aruba with a placeholder page (`ok`), and
`app.vfitfunlife.com` does not resolve. The product lives on `vfit-funlife.web.app`, which:

- has no brand history, so the exact-match brand query is carried only by the new page;
- cannot be improved by DNS work on the .com.

The high-value move is to point the custom domain at Firebase Hosting (`app.vfitfunlife.com` or
`www.vfitfunlife.com`), set it as the canonical host in `metadataBase`, `SITE_URL` in
`src/lib/seo/torinoLandings.ts`, `robots.txt` and `sitemap.xml`, and keep the `.web.app` URL as a
301 to it. Search Console should then be reset on the new hostname.

## Beyond code

Ranking for the brand and the category terms also needs signals this repository cannot produce:

- Consistent name, address and phone in Google Business Profile and Italian directories.
- Real backlinks: partner gyms, the trainers' own sites, local press, associations.
- Reviews collected after real bookings (the app already asks for them).
- Provider profiles are the long tail: each public provider URL with unique content is a page
  Google can rank for "personal trainer <quartiere>". They are currently behind the auth gate.
