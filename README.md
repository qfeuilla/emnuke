# ☢️ emnuke

**Nuke em-dash content from the web.**

Em dashes are the fingerprint of AI slop. emnuke is a browser extension that finds them and blows them up with a nuclear animation.

<!-- TODO: Replace with actual demo video/gif -->
> 🎬 **Demo video coming soon**

## Install

Grab the latest zip from the [Releases page](https://github.com/qfeuilla/emnuke/releases) and load it in your browser:

- **Chrome**: `chrome://extensions` → Developer mode → Load unpacked
- **Firefox**: `about:debugging` → Load Temporary Add-on → select `manifest.json`
- **Edge**: `edge://extensions` → Developer mode → Load unpacked
- **Safari**: Requires Xcode conversion (see [docs/DEPLOY.md](docs/DEPLOY.md))
- **Opera**: `opera://extensions` → Developer mode → Load unpacked

## Modes

| Mode | What it does |
|------|-------------|
| ☢️ Nuke | Animated removal as you scroll. The fun one. |
| 🔇 Filter | Silent removal. Poof, gone. |
| 🔍 Highlight | Orange border on suspicious content. Nothing removed, just shamed. |
| 💤 Off | Extension is idle. |

## Exclude sites

Some sites needs em dashes (like, claude.ai). Click the extension icon on any page and hit **Exclude [hostname]**. Click again to un-exclude. Persists across reloads.

## What gets nuked

We don't just blindly nuke the whole page. Each site gets precise targeting so we kill the right content block.

| Site | What gets nuked |
|------|----------------|
| Google | Search results, news cards, video results |
| Reddit | Posts, search results, ads. Comments get redacted but replies survive. |
| Twitter/X | Individual tweets |
| LinkedIn | Feed posts |
| Bing, DuckDuckGo, Brave, Ecosia, Kagi, Startpage, Yandex | Search results (selectors pulled from [uBlacklist](https://github.com/ublacklist/builtin)) |
| Everything else | Paragraphs, list items, headings, whatever contains the crime |

More sites coming. [PRs welcome.](CONTRIBUTING.md)

## How it works

1. `MutationObserver` watches the DOM for new content
2. `TreeWalker` hunts for the em dash character (U+2014)
3. `findContentBlock` walks up the DOM to find the right thing to destroy
4. In nuke mode, `IntersectionObserver` waits until you scroll to it, then boom

Search engine selectors are fetched from [uBlacklist's configs](https://github.com/ublacklist/builtin) and cached for 7 days. They update themselves. You don't have to do shit.

## Development

```bash
pnpm install
pnpm dev            # Chrome with hot reload
pnpm dev:firefox    # Firefox with hot reload
pnpm build:all      # Build Chrome, Firefox, Edge, Safari, Opera
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add support for new sites.

## "But isn't this anti-AI?"

No. AI-assisted creation can be cool. What's not cool is lazy bastards who copy-paste raw ChatGPT output and call it a day. If you can't even be bothered to clean up the em dashes, your content shouldn't exist on the internet. This extension just makes that happen automatically.

## License

[MIT](LICENSE)
