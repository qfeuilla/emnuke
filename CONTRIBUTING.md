# Contributing to emnuke

You want to help nuke em dashes from the web? Hell yeah

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

Found a site where em dashes survive? Unacceptable. Here's how to fix it:

See the inline docs in `entrypoints/content.ts` above `STATIC_SITE_CONFIGS`. The short version:

1. Open the site, find a post/card containing an em dash
2. Inspect the DOM, walk up to the element that represents one item
3. Prefer `data-testid`, custom elements, or semantic attributes over generated class names (those break every other week)
4. Add an entry to `STATIC_SITE_CONFIGS` with `hostnames`, `cardSelectors`, and `strategy`. For search engines, you can also add extra selectors in `EXTRA_SELECTORS` to complement what uBlacklist provides. See the code for details.

## Pull requests

- One site, one fix, one feature per PR. Keep it tight.
- Run `pnpm compile` before pushing (CI will yell at you anyway).
- Test on at least one browser.

## Reporting issues

If content isn't getting nuked (or the wrong thing is getting nuked), include:
- The URL
- The HTML of the element that should be targeted (right-click > Inspect > Copy outer HTML)
- Your browser and the emnuke mode you're using
