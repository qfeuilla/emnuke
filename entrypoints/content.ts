import { type NukeMode, type NukeSettings, DEFAULT_SETTINGS } from '@/utils/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const EM_DASH = '\u2014';

    interface SiteConfig {
      hostnames: string[];
      cardSelectors: string[];
      strategy: 'innermost' | 'outermost';
    }

    // --- uBlacklist dynamic selectors ---
    // Fetches card selectors from uBlacklist's maintained configs for search engines.
    // https://github.com/ublacklist/builtin
    const UBLACKLIST_BASE =
      'https://raw.githubusercontent.com/ublacklist/builtin/refs/heads/dist/serpinfo/';
    const UBLACKLIST_ENGINES: { file: string; hostPattern: RegExp }[] = [
      { file: 'google.yml', hostPattern: /^(www\.)?google\.\w+(\.\w+)?$/ },
      { file: 'bing.yml', hostPattern: /^(www\d?|cn)\.bing\.com$/ },
      { file: 'duckduckgo.yml', hostPattern: /^(safe\.|start\.|noai\.)?duckduckgo\.com$/ },
      { file: 'brave.yml', hostPattern: /^search\.brave\.com$/ },
      { file: 'ecosia.yml', hostPattern: /^www\.ecosia\.org$/ },
      { file: 'kagi.yml', hostPattern: /^kagi\.com$/ },
      { file: 'startpage.yml', hostPattern: /^www\.startpage\.com$/ },
      { file: 'yandex.yml', hostPattern: /^yandex\.\w+(\.\w+)?$/ },
    ];
    const CACHE_KEY = 'ublacklistSelectorsCache';
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Hardcoded fallbacks per engine (from uBlacklist configs, 2026-03-06)
    const FALLBACK_SELECTORS: Record<string, string[]> = {
      'google.yml': ['.vt6azd:not(.g-blk)', '[data-news-cluster-id]', '.sHEJob', '.vCUuC', '.eejeod'],
      'bing.yml': ['.b_algo', '.news-card', '.newscard'],
      'duckduckgo.yml': [],
      'brave.yml': ['.snippet[data-type="web"]', '.snippet[data-type="news"]', '.snippet[data-type="videos"]', '.image-result'],
      'ecosia.yml': [],
      'kagi.yml': [],
      'startpage.yml': [],
      'yandex.yml': [],
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

    async function getSearchEngineSelectors(file: string): Promise<string[]> {
      const cacheKeyForFile = `${CACHE_KEY}_${file}`;
      try {
        const cached = await browser.storage.local.get(cacheKeyForFile);
        const entry = cached[cacheKeyForFile] as { selectors: string[]; ts: number } | undefined;
        if (entry && Date.now() - entry.ts < CACHE_TTL) {
          return entry.selectors;
        }
      } catch {}

      const fallback = FALLBACK_SELECTORS[file] ?? [];
      try {
        const res = await fetch(UBLACKLIST_BASE + file);
        if (!res.ok) return fallback;
        const yaml = await res.text();
        const selectors = parseSelectorsFromYaml(yaml);
        if (selectors.length === 0) return fallback;
        browser.storage.local.set({
          [cacheKeyForFile]: { selectors, ts: Date.now() },
        });
        return selectors;
      } catch {
        return fallback;
      }
    }

    // --- Static configs for non-search-engine sites ---
    //
    // HOW TO ADD A NEW SITE
    // =====================
    //
    // 1. Open the target site and find a post/card/result that contains an em dash.
    //
    // 2. Right-click it → Inspect. Walk up the DOM tree from the text to find
    //    the outermost element that represents ONE item (post, comment, card).
    //    Good signals:
    //    - data-testid attributes (stable, set by developers for testing)
    //    - Custom elements (e.g. <shreddit-post>, <article>)
    //    - Semantic attributes (data-post-id, role="listitem")
    //    Avoid: generated class names (.MjjYud, .vt6azd) as they change often.
    //
    // 3. Add an entry to STATIC_SITE_CONFIGS:
    //
    //    {
    //      hostnames: ['www.example.com', 'example.com'],
    //      cardSelectors: ['.my-card-selector'],
    //      strategy: 'innermost' | 'outermost',
    //    }
    //
    //    - hostnames: all hostname variants the site uses
    //    - cardSelectors: CSS selectors for individual content cards.
    //      List from most specific to least specific.
    //    - strategy:
    //        'innermost' → return the FIRST card match walking up from the text.
    //          Use when cards are flat (not nested). Good for search engines.
    //        'outermost' → return the LAST card match walking up from the text.
    //          Use when cards nest wrappers (e.g. Reddit: article > shreddit-post).
    //
    // 4. For SEARCH ENGINES, prefer adding to UBLACKLIST_ENGINES instead.
    //    uBlacklist maintains selectors for 10+ engines and we fetch them dynamically.
    //    Only add to STATIC_SITE_CONFIGS if the site is not a search engine.
    //
    // SPECIAL CASES
    // -------------
    // Reddit comments: shreddit-comment elements nest (depth 0 contains depth 1, etc).
    //   We handle this specially in findContentBlock(): instead of nuking the whole
    //   shreddit-comment (which would kill child replies), we target the
    //   div[slot="comment"] inside it and redact just the text body.
    //   To add similar "redact but don't remove" behavior for another site,
    //   see the isCommentBody() function.
    //
    // If no card selector matches, the generic fallback kicks in: BLOCK_SELECTORS
    // (li, p, h1-h6, etc.) and a small-div heuristic. This works for most sites
    // without any config, just less precisely.
    //
    const STATIC_SITE_CONFIGS: SiteConfig[] = [
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
    const staticConfig = STATIC_SITE_CONFIGS
      .find((cfg) => cfg.hostnames.includes(location.hostname));

    // These get populated once selectors are resolved
    let activeCardSelectors: string[] = staticConfig?.cardSelectors ?? [];
    // Search engines use innermost (target individual results, not containers)
    let cardStrategy: 'innermost' | 'outermost' = matchedEngine
      ? 'innermost'
      : (staticConfig?.strategy ?? 'innermost');

    let mode: NukeMode = DEFAULT_SETTINGS.mode;
    let nukeCount = 0;
    let nukedElements = new WeakSet<Element>();
    let stylesInjected = false;

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
          content: '☢️';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 2rem;
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

    function redactElement(el: Element) {
      el.setAttribute('data-emnuke-original', el.innerHTML);
      el.innerHTML = '☢️ [nuked: AI generated]';
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

    function hasDash(text: string): boolean {
      return text.includes(EM_DASH);
    }

    function scanTextNode(node: Text) {
      if (!node.textContent || !hasDash(node.textContent)) return;
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

      const settings = await browser.storage.local.get(
        DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      );
      const s = settings as unknown as NukeSettings;
      mode = s.mode;
      nukeCount = s.nukeCount;
      if (mode !== 'off') {
        observer = startNuking();
      }
    }
    init();

    // Listen for mode changes from popup
    browser.storage.onChanged.addListener((changes) => {
      if (changes.mode) {
        const prevMode = mode;
        mode = changes.mode.newValue as NukeMode;

        // Always clean up previous state
        nukeVisibilityObserver.disconnect();
        document.querySelectorAll('.emnuke-nuke').forEach((el) => {
          el.classList.remove('emnuke-nuke');
          (el as HTMLElement).style.maxHeight = '';
        });
        document.querySelectorAll('.emnuke-hidden').forEach((el) => {
          el.classList.remove('emnuke-hidden');
        });
        document.querySelectorAll('.emnuke-highlight').forEach((el) => {
          el.classList.remove('emnuke-highlight');
        });
        document.querySelectorAll('.emnuke-redacted').forEach((el) => {
          const original = el.getAttribute('data-emnuke-original');
          if (original !== null) {
            el.innerHTML = original;
            el.removeAttribute('data-emnuke-original');
          }
          el.classList.remove('emnuke-redacted');
        });
        nukedElements = new WeakSet();

        if (mode === 'off') {
          observer?.disconnect();
          observer = null;
        } else {
          if (!observer) {
            observer = startNuking();
          } else {
            // Re-scan with new mode
            scanSubtree(document.body);
          }
        }
      }
    });

  },
});
