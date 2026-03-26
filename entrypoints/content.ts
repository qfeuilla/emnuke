import { type NukeMode, type NukeSettings, loadSettings, isSiteActive } from '@/utils/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const EM_DASH = '\u2014';

    interface SiteConfig {
      hostnames: string[];
      cardSelectors: string[];
      strategy: 'innermost' | 'outermost';
      /** Return true to skip nuking this text node */
      skipTextNode?: (node: Text) => boolean;
    }

    // --- uBlacklist dynamic selectors ---
    // Fetches card selectors from uBlacklist's maintained configs for search engines.
    // https://github.com/ublacklist/builtin
    const UBLACKLIST_BASE =
      'https://raw.githubusercontent.com/ublacklist/builtin/refs/heads/dist/serpinfo/';
    const UBLACKLIST_ENGINES: {
      file: string;
      hostPattern: RegExp;
      skipTextNode?: (node: Text) => boolean;
    }[] = [
      {
        file: 'google.yml',
        hostPattern: /^(www\.)?google\.\w+(\.\w+)?$/,
        // Google uses "May 13, 2018 — " as date separators in snippets
        skipTextNode: (node) => node.textContent?.trim() === EM_DASH,
      },
      { file: 'bing.yml', hostPattern: /^(www\d?|cn)\.bing\.com$/ },
      { file: 'duckduckgo.yml', hostPattern: /^(safe\.|start\.|noai\.)?duckduckgo\.com$/ },
      { file: 'brave.yml', hostPattern: /^search\.brave\.com$/ },
      { file: 'ecosia.yml', hostPattern: /^www\.ecosia\.org$/ },
      { file: 'kagi.yml', hostPattern: /^kagi\.com$/ },
      { file: 'startpage.yml', hostPattern: /^www\.startpage\.com$/ },
      { file: 'yandex.yml', hostPattern: /^yandex\.\w+(\.\w+)?$/ },
    ];
    const CACHE_PREFIX = 'ublacklistSelectorsCache';
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Extra container selectors per engine (stable data attributes that
    // uBlacklist doesn't use because they target URLs, not containers).
    // These get merged with the dynamic selectors.
    const EXTRA_SELECTORS: Record<string, string[]> = {
      'google.yml': [
        '[data-docid]',  // Image result cards
      ],
    };

    function parseSelectorsFromYaml(yaml: string): string[] {
      const selectors: string[] = [];
      for (const match of yaml.matchAll(/^\s+root:\s+(.+)$/gm)) {
        let val = match[1].trim();
        // Skip array-style roots (mobile-specific traversal directives)
        if (val.startsWith('[') || val.startsWith('-')) continue;
        // Strip quotes
        val = val.replace(/^["']|["']$/g, '');
        if (val) selectors.push(val);
      }
      return [...new Set(selectors)];
    }

    function mergeSelectors(...arrays: string[][]): string[] {
      return [...new Set(arrays.flat())];
    }

    async function getSearchEngineSelectors(file: string): Promise<string[]> {
      const extras = EXTRA_SELECTORS[file] ?? [];
      const cacheKey = `${CACHE_PREFIX}_${file}`;

      const cached = await browser.storage.local.get(cacheKey);
      const entry = cached[cacheKey] as { selectors: string[]; ts: number } | undefined;
      if (entry && Date.now() - entry.ts < CACHE_TTL) {
        return mergeSelectors(entry.selectors, extras);
      }

      const res = await fetch(UBLACKLIST_BASE + file);
      if (!res.ok) {
        console.error(`[emnuke] failed to fetch ${file}: ${res.status}`);
        return extras;
      }
      const yaml = await res.text();
      const selectors = parseSelectorsFromYaml(yaml);
      if (selectors.length === 0) {
        console.warn(`[emnuke] no selectors parsed from ${file}`);
        return extras;
      }
      browser.storage.local.set({ [cacheKey]: { selectors, ts: Date.now() } });
      return mergeSelectors(selectors, extras);
    }

    // See CONTRIBUTING.md for how to add new sites
    const SITE_CONFIGS: SiteConfig[] = [
      {
        hostnames: ['www.reddit.com', 'reddit.com', 'old.reddit.com'],
        cardSelectors: [
          '[data-testid="search-post-with-content-preview"]',
          'article[data-post-id]',
          'shreddit-post',
          '[data-testid="post-container"]',
          'shreddit-ad-post',
          'shreddit-dynamic-ad-link',
        ],
        strategy: 'outermost',
      },
      {
        hostnames: ['www.linkedin.com', 'linkedin.com'],
        cardSelectors: [
          '[data-finite-scroll-hotkey-context="NOTIFICATIONS"] > * > *',
          '.scaffold-finite-scroll__content > div',
        ],
        strategy: 'innermost',
      },
      {
        hostnames: ['twitter.com', 'x.com'],
        cardSelectors: [
          '[data-testid="cellInnerDiv"]',
          'article[data-testid="tweet"]',
        ],
        strategy: 'outermost',
      },
    ];

    const BLOCK_SELECTORS = [
      'li',
      'blockquote',
      'figcaption',
      'p',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'tr',
      'dd', 'dt',
    ];

    const PROTECTED_TAGS = new Set([
      'HTML', 'BODY', 'HEAD', 'NAV', 'HEADER', 'FOOTER',
      'MAIN', 'ASIDE', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT',
      'SCRIPT', 'STYLE', 'LINK', 'META', 'IFRAME',
    ]);

    // Match current hostname against uBlacklist engines
    const matchedEngine = UBLACKLIST_ENGINES
      .find((e) => e.hostPattern.test(location.hostname));
    const staticConfig = SITE_CONFIGS
      .find((cfg) => cfg.hostnames.includes(location.hostname));

    // These get populated once selectors are resolved
    let activeCardSelectors: string[] = staticConfig?.cardSelectors ?? [];
    // Search engines use innermost (target individual results, not containers)
    const cardStrategy: 'innermost' | 'outermost' = matchedEngine
      ? 'innermost'
      : (staticConfig?.strategy ?? 'innermost');

    let mode: NukeMode = 'nuke';
    let nukeCount = 0;
    let nukedElements = new WeakSet<Element>();
    const originalNodes = new Map<Element, Node[]>();
    let stylesInjected = false;
    let siteExcluded = false;

    function injectStyles() {
      if (stylesInjected) return;
      stylesInjected = true;

      const style = document.createElement('style');
      style.textContent = `
        @keyframes emnuke-explode {
          0% {
            opacity: 1;
            transform: scale(1) rotate(0deg);
            filter: brightness(1) saturate(1);
          }
          15% {
            transform: scale(1.05) rotate(0.5deg);
            filter: brightness(2) saturate(3);
          }
          30% {
            transform: scale(1.08) rotate(-0.5deg);
            filter: brightness(4) saturate(5) hue-rotate(30deg);
            box-shadow: 0 0 30px 10px rgba(255, 120, 0, 0.6);
          }
          50% {
            opacity: 0.8;
            transform: scale(0.9) rotate(1deg);
            filter: brightness(3) saturate(2) hue-rotate(60deg);
            box-shadow: 0 0 60px 20px rgba(255, 60, 0, 0.4);
          }
          70% {
            opacity: 0.4;
            transform: scale(0.7) rotate(-2deg);
            filter: brightness(1) saturate(0) blur(2px);
          }
          100% {
            opacity: 0;
            transform: scale(0) rotate(5deg);
            filter: blur(8px);
            max-height: 0;
            margin: 0;
            padding: 0;
          }
        }

        .emnuke-nuke {
          animation: emnuke-explode 1.2s ease-out forwards;
          overflow: hidden !important;
          pointer-events: none !important;
          position: relative;
        }

        .emnuke-nuke::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 48px;
          height: 48px;
          background: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgMjAwIDIwMCI+CjwhLS0gU1ZHIGNyZWF0ZWQgd2l0aCBBcnJvdywgYnkgUXVpdmVyQUkgKGh0dHBzOi8vcXVpdmVyLmFpKSAtLT4KICA8cGF0aCBkPSJtMTk0LjkgMTAwLjNjMCA1MS42Ny00My45MyA5NC41LTk1LjI5IDk0LjUtNTEuOSAwLTk0LjY1LTQyLjc0LTk0LjY1LTk0LjUgMC01Mi4yIDQyLjc3LTk1LjI2IDk0LjY1LTk1LjI2IDUxLjM2IDAgOTUuMjkgNDIuODMgOTUuMjkgOTUuMjZ6IiBmaWxsPSIjRjhEQTMwIi8+CiAgPHBhdGggZD0ibTk5LjUzIDUuMDF2MTg5LjdjNTEuNiAwIDk1LjM4LTQyLjg0IDk1LjM4LTk0LjUgMC01Mi40My00My43OC05NS4yNC05NS4zOC05NS4yNHoiIGZpbGw9IiNGNEMzMDAiLz4KICA8cGF0aCBkPSJtMTg0LjMgOTEuNzdjLTIuMDQtMjEuMTMtMTIuMzQtNDEuNy0yOS42NS01Ni44NGwtNC45MS0yLjg3Yy00LjU2LTMuNC05Ljg0LTEuNjMtMTIuMDcgMi4ybC0yMi42NCAzOS4yIDAuMDQgMC4xMWM5LjQgNS43NCAxNS41MSAxNC42MSAxNS42MyAyNi4xM2g0NS4wN2M0LjcxIDAgOC45Mi0zLjU4IDguNTMtNy45M3oiIGZpbGw9IiMwMDAiIHN0cm9rZT0iI0Y4REEzMCIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIiBzdHJva2Utd2lkdGg9Ii41Ii8+CiAgPHBhdGggZD0ibTEzOC4xIDE2NS43LTIyLjYyLTM4LjkyYy01LjYyIDMuNjctMTAuNjMgNC4zNy0xNi4wNCA0LjItNi4yLTAuMi05Ljg1LTEuNDYtMTQuODUtNC4yNGwtMjMuMDUgMzguNDhjLTIuNzIgNC44NC0xLjI3IDkuOTEgNC45NiAxMi4yMSA5Ljg0IDQuMjIgMjAuNzggNi41NiAzMi45NCA2LjU2IDEyLjA3IDAgMjMuODgtMi45NyAzNS4xMi03Ljc3IDUuMTktMi4xMSA1LjU1LTcuMjEgMy41NC0xMC41MnoiIGZpbGw9IiMwMDAiIHN0cm9rZT0iI0Y4REEzMCIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIiBzdHJva2Utd2lkdGg9Ii41Ii8+CiAgPHBhdGggZD0ibTE1LjA1IDkxLjc3YzItMjAuNDkgMTEuMTItNDAuMDkgMjguMjctNTQuOTZsNS41Ny00LjUyYzQuOTgtMy42NSAxMC40NC0yLjg5IDEzLjE0IDEuOTdsMjIuNjMgMzguODgtMC4wOSAwLjM3Yy05LjQxIDUuNzQtMTUuMiAxNC42Ny0xNS4zMSAyNi4xOWgtNDUuMzdjLTQuNyAwLTkuMjEtMy41OC04Ljg0LTcuOTN6IiBmaWxsPSIjMDAwIiBzdHJva2U9IiNGOERBMzAiIHN0cm9rZS1taXRlcmxpbWl0PSIxMCIgc3Ryb2tlLXdpZHRoPSIuNSIvPgogIDxwYXRoIGQ9Im05OS41OCA3Ni45MWMtMTIuNyAwLTIyLjc0IDEwLjczLTIyLjc0IDIzLjExIDAgMTIuMzcgMTAuMjggMjIuNDcgMjIuNTcgMjIuNDcgMTIuMyAwIDIzLjIxLTEwLjY2IDIzLjIxLTIyLjY4IDAtMTIuMDMtMTAuNDQtMjIuOS0yMy4wNC0yMi45em0xNS4wOCAyNi43aC0yOS43NnYtNy43aDI5Ljc2djcuN3oiIGZpbGw9IiMwMDAiIHN0cm9rZT0iI0Y4REEzMCIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIiBzdHJva2Utd2lkdGg9Ii41Ii8+Cjwvc3ZnPg==') no-repeat center / contain;
          z-index: 999999;
          animation: emnuke-icon-pop 0.8s ease-out forwards;
          pointer-events: none;
        }

        @keyframes emnuke-icon-pop {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0); }
          40% { opacity: 1; transform: translate(-50%, -50%) scale(1.5); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2.5); }
        }

        .emnuke-filter {
          transition: opacity 0.15s ease-out, max-height 0.15s ease-out;
          opacity: 0 !important;
          max-height: 0 !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
          pointer-events: none !important;
        }

        .emnuke-hidden {
          display: none !important;
        }

        .emnuke-highlight {
          box-shadow: inset 0 0 0 2px #ff6b35 !important;
          background: rgba(255, 107, 53, 0.08) !important;
          border-left: 4px solid #ff6b35 !important;
        }

        .emnuke-redacted {
          color: #888 !important;
          font-style: italic;
          font-size: 0.85em;
          padding: 8px 12px !important;
          user-select: none;
        }
      `;
      document.head.appendChild(style);
    }

    function findContentBlock(node: Node): Element | null {
      let el = node.parentElement;
      let fallback: Element | null = null;
      let card: Element | null = null;

      while (el) {
        if (PROTECTED_TAGS.has(el.tagName)) break;

        // Reddit comment: nuke just the body, not the whole tree
        if (el.matches('shreddit-comment')) {
          const body = el.querySelector(':scope > div[slot="comment"]');
          return body ?? el;
        }

        // Check card selectors
        for (const selector of activeCardSelectors) {
          if (el.matches(selector)) {
            card = el;
            if (cardStrategy === 'innermost') return card;
            break;
          }
        }

        // Remember first generic match as fallback
        if (!fallback && !card) {
          for (const selector of BLOCK_SELECTORS) {
            if (el.matches(selector)) {
              fallback = el;
              break;
            }
          }

          // Fallback: a reasonably sized div
          if (!fallback && el.tagName === 'DIV') {
            const childCount = el.children.length;
            const textLen = (el.textContent || '').length;
            if (childCount <= 10 && textLen < 2000) {
              fallback = el;
            }
          }
        }

        el = el.parentElement;
      }

      let result = card ?? fallback;

      // Unwrap thin wrappers only for fallback matches (not card selectors,
      // which are already precise).
      while (
        !card &&
        result?.parentElement &&
        !PROTECTED_TAGS.has(result.parentElement.tagName) &&
        result.parentElement.tagName === 'DIV' &&
        result.parentElement.children.length === 1
      ) {
        result = result.parentElement;
      }

      return result;
    }

    function cleanupAllNuked() {
      nukeVisibilityObserver.disconnect();
      document.querySelectorAll('.emnuke-nuke, .emnuke-hidden, .emnuke-highlight, .emnuke-filter').forEach((el) => {
        el.classList.remove('emnuke-nuke', 'emnuke-hidden', 'emnuke-highlight', 'emnuke-filter');
        (el as HTMLElement).style.maxHeight = '';
      });
      document.querySelectorAll('.emnuke-redacted').forEach((el) => {
        const backup = originalNodes.get(el);
        if (backup) {
          el.textContent = '';
          for (const child of backup) el.appendChild(child.cloneNode(true));
          originalNodes.delete(el);
        }
        el.classList.remove('emnuke-redacted');
      });
      nukedElements = new WeakSet();
    }

    function redactElement(el: Element) {
      originalNodes.set(el, Array.from(el.childNodes).map((n) => n.cloneNode(true)));
      const icon = document.createElement('img');
      icon.src = browser.runtime.getURL('/icon/icon.svg');
      icon.style.cssText = 'width:16px;height:16px;vertical-align:middle;margin-right:4px;';
      el.textContent = '';
      el.append(icon, '[nuked: AI generated]');
      el.classList.add('emnuke-redacted');
    }

    function isCommentBody(el: Element): boolean {
      return el.matches('div[slot="comment"]')
        && el.closest('shreddit-comment') !== null;
    }

    // IntersectionObserver for nuke mode: wait until element is visible to animate
    function triggerNukeAnimation(el: Element) {
      const commentBody = isCommentBody(el);
      const rect = el.getBoundingClientRect();
      (el as HTMLElement).style.maxHeight = rect.height + 'px';
      el.getBoundingClientRect(); // force reflow
      el.classList.add('emnuke-nuke');
      setTimeout(() => {
        el.classList.remove('emnuke-nuke');
        if (commentBody) {
          redactElement(el);
        } else {
          el.classList.add('emnuke-hidden');
        }
        (el as HTMLElement).style.maxHeight = '';
      }, 1300);
    }

    // Wait until element is 40% visible, then pause briefly so the user
    // registers the content before the animation fires.
    const nukeVisibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          nukeVisibilityObserver.unobserve(entry.target);
          const el = entry.target;
          // Small delay so the user sees the content before it nukes
          setTimeout(() => triggerNukeAnimation(el), 300);
        }
      },
      { threshold: 0.4 },
    );

    function nukeElement(el: Element) {
      if (nukedElements.has(el)) return;
      nukedElements.add(el);
      injectStyles();

      if (mode === 'highlight') {
        el.classList.add('emnuke-highlight');
        nukeCount++;
        browser.storage.local.set({ nukeCount });
        return;
      }

      const commentBody = isCommentBody(el);

      if (mode === 'nuke') {
        // Defer animation until element scrolls into view
        nukeVisibilityObserver.observe(el);
      } else {
        // Filter mode: silent removal, no need to wait for visibility
        if (commentBody) {
          redactElement(el);
        } else {
          const rect = el.getBoundingClientRect();
          (el as HTMLElement).style.maxHeight = rect.height + 'px';
          el.getBoundingClientRect();
          el.classList.add('emnuke-filter');
          setTimeout(() => {
            el.classList.remove('emnuke-filter');
            el.classList.add('emnuke-hidden');
            (el as HTMLElement).style.maxHeight = '';
          }, 200);
        }
      }

      nukeCount++;
      browser.storage.local.set({ nukeCount });
    }

    const activeSkipTextNode = matchedEngine?.skipTextNode ?? staticConfig?.skipTextNode;

    function scanTextNode(node: Text) {
      if (!node.textContent?.includes(EM_DASH)) return;
      if (activeSkipTextNode?.(node)) return;
      const block = findContentBlock(node);
      if (block) nukeElement(block);
    }

    function scanSubtree(root: Node) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text);
      }
      for (const node of textNodes) {
        scanTextNode(node);
      }
    }

    function startNuking() {
      scanSubtree(document.body);

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              scanTextNode(node as Text);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              scanSubtree(node);
            }
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      return observer;
    }

    // Load settings and start
    let observer: MutationObserver | null = null;

    async function init() {
      if (matchedEngine) {
        activeCardSelectors = await getSearchEngineSelectors(matchedEngine.file);
      }

      const s = await loadSettings();
      mode = s.mode;
      nukeCount = s.nukeCount;
      siteExcluded = !isSiteActive(s, location.hostname);
      if (mode !== 'off' && !siteExcluded) {
        observer = startNuking();
      }
    }
    init();

    // Listen for mode/exclusion changes from popup
    browser.storage.onChanged.addListener(async (changes) => {
      if (changes.mode) {
        mode = changes.mode.newValue as NukeMode;
      }

      if (changes.excludedSites || changes.includedSites || changes.defaultActive) {
        const s = await loadSettings();
        const wasExcluded = siteExcluded;
        siteExcluded = !isSiteActive(s, location.hostname);

        if (siteExcluded && !wasExcluded) {
          cleanupAllNuked();
          observer?.disconnect();
          observer = null;
          return;
        }
        if (!siteExcluded && wasExcluded) {
          if (mode !== 'off') {
            observer = startNuking();
          }
          return;
        }
      }

      if (changes.mode) {
        if (siteExcluded) return;

        cleanupAllNuked();

        if (mode === 'off') {
          observer?.disconnect();
          observer = null;
        } else {
          if (!observer) {
            observer = startNuking();
          } else {
            scanSubtree(document.body);
          }
        }
      }
    });

    browser.runtime.onMessage.addListener((msg) => {
      if (msg === 'getHostname') return Promise.resolve(location.hostname);
    });

  },
});
