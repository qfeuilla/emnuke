# Contributing to emnuke

Thanks for wanting to help nuke em dashes from the web.

## Setup

```bash
pnpm install
pnpm dev          # Chrome dev mode with hot reload
pnpm dev:firefox  # Firefox dev mode
```

## Building

```bash
pnpm build            # Chrome
pnpm build:firefox    # Firefox
pnpm build:edge       # Edge
pnpm build:all        # All platforms
```

Built extensions land in `.output/`. Load them via your browser's "Load unpacked" / "Load Temporary Add-on" option.

## Adding support for a new site

See the inline docs in `entrypoints/content.ts` above `STATIC_SITE_CONFIGS`. The short version:

1. Open the site, find a post/card containing an em dash
2. Inspect the DOM, walk up to the element that represents one item
3. Prefer `data-testid`, custom elements, or semantic attributes over generated class names
4. Add an entry to `STATIC_SITE_CONFIGS` with `hostnames`, `cardSelectors`, and `strategy`
5. For search engines, check if uBlacklist already covers it (we fetch their selectors dynamically)

## Pull requests

- Keep changes focused. One site, one fix, one feature per PR.
- Run `pnpm compile` before pushing (CI will catch it anyway).
- Test on at least one browser.

## Reporting issues

If content isn't being nuked (or the wrong thing is being nuked), include:
- The URL
- The HTML of the element that should be targeted (right-click > Inspect > Copy outer HTML)
- Your browser and the emnuke mode you're using
