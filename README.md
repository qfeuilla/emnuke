# ☢️ emnuke

**Nuke em-dash content from the web.**

Em dashes have become the telltale sign of AI-generated text. emnuke is a browser extension that detects content containing em dashes and removes it from your view, with a satisfying nuclear animation.

<!-- TODO: Replace with actual demo video/gif -->
> 🎬 **Demo video coming soon**

## Install

Download the latest zip from the [Releases page](https://github.com/qfeuilla/emnuke/releases) and load it in your browser:

- **Chrome/Edge**: `chrome://extensions` → Developer mode → Load unpacked
- **Firefox**: `about:debugging` → Load Temporary Add-on → select `manifest.json`

## Modes

| Mode | What it does |
|------|-------------|
| ☢️ Nuke | Animated removal as you scroll. The fun one. |
| 🔇 Filter | Silent removal. Content just disappears. |
| 🔍 Highlight | Orange border on matching content. Nothing removed. |
| 💤 Off | Extension is idle. |

## Supported sites

Site-specific selectors ensure the right content block gets nuked (not too much, not too little).

| Site | What gets nuked |
|------|----------------|
| Google | Individual search results, news cards, video results |
| Reddit | Posts, search results, ads. Comments get redacted (replies preserved). |
| Twitter/X | Individual tweets |
| LinkedIn | Feed posts |
| Bing, DuckDuckGo, Brave, Ecosia, Kagi, Startpage, Yandex | Search results (selectors fetched from [uBlacklist](https://github.com/ublacklist/builtin)) |
| Everything else | Generic fallback targeting paragraphs, list items, headings, etc. |

## How it works

1. A `MutationObserver` watches the DOM for new content
2. A `TreeWalker` scans text nodes for the em dash character (U+2014)
3. `findContentBlock` walks up the DOM to find the right container to nuke
4. In nuke mode, an `IntersectionObserver` waits until you scroll the content into view, then triggers the animation

Search engine selectors are dynamically fetched from [uBlacklist's maintained configs](https://github.com/ublacklist/builtin) and cached for 7 days, so they stay up to date without extension updates.

## Development

```bash
pnpm install
pnpm dev            # Chrome with hot reload
pnpm dev:firefox    # Firefox with hot reload
pnpm build:all      # Build Chrome, Firefox, Edge
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add support for new sites.

## License

[MIT](LICENSE)
