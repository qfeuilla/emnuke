import './style.css';
import { type NukeMode, loadSettings, isSiteActive } from '@/utils/types';

const countEl = document.getElementById('count')!;
const modeBtns = document.querySelectorAll<HTMLButtonElement>('.mode-btn');
const excludeBtn = document.getElementById('exclude-btn') as HTMLButtonElement;
const defaultActiveToggle = document.getElementById('default-active') as HTMLInputElement;

let currentHostname: string | null = null;
let defaultActive = true;
let excludedSites: string[] = [];
let includedSites: string[] = [];

function setActiveMode(mode: NukeMode) {
  modeBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

function updateExcludeBtn() {
  if (!currentHostname) return;
  const isExcluded = excludedSites.includes(currentHostname);
  const isIncluded = includedSites.includes(currentHostname);

  // Override is "active" only when it changes behavior vs the default
  const overrideMatters = (isExcluded && defaultActive) || (isIncluded && !defaultActive);

  if (isExcluded) {
    excludeBtn.textContent = `✓ ${currentHostname} excluded`;
  } else if (isIncluded) {
    excludeBtn.textContent = `✓ ${currentHostname} included`;
  } else if (defaultActive) {
    excludeBtn.textContent = `Exclude ${currentHostname}`;
  } else {
    excludeBtn.textContent = `Include ${currentHostname}`;
  }
  excludeBtn.classList.toggle('excluded', overrideMatters);
}

loadSettings().then((s) => {
  countEl.textContent = s.nukeCount.toLocaleString();
  setActiveMode(s.mode);
  defaultActive = s.defaultActive;
  excludedSites = s.excludedSites;
  includedSites = s.includedSites;
  defaultActiveToggle.checked = s.defaultActive;
  updateExcludeBtn();
});

// Get active tab hostname via content script
browser.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
  const tabId = tabs[0]?.id;
  if (tabId == null) return;
  const hostname = await browser.tabs.sendMessage(tabId, 'getHostname');
  if (!hostname) return;
  currentHostname = hostname;
  excludeBtn.style.display = '';
  updateExcludeBtn();
});

// Default active toggle
defaultActiveToggle.addEventListener('change', () => {
  defaultActive = defaultActiveToggle.checked;
  browser.storage.local.set({ defaultActive });
  updateExcludeBtn();
});

// Mode switching
modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode as NukeMode;
    browser.storage.local.set({ mode });
    setActiveMode(mode);
  });
});

// Site include/exclude toggle
excludeBtn.addEventListener('click', () => {
  if (!currentHostname) return;
  const isExcluded = excludedSites.includes(currentHostname);
  const isIncluded = includedSites.includes(currentHostname);

  if (isExcluded) {
    // Was excluded: remove from excluded, add to included
    excludedSites = excludedSites.filter((s) => s !== currentHostname);
    includedSites = [...includedSites, currentHostname];
  } else if (isIncluded) {
    // Was included: remove from included, add to excluded
    includedSites = includedSites.filter((s) => s !== currentHostname);
    excludedSites = [...excludedSites, currentHostname];
  } else if (defaultActive) {
    // Default on, no override: exclude it
    excludedSites = [...excludedSites, currentHostname];
  } else {
    // Default off, no override: include it
    includedSites = [...includedSites, currentHostname];
  }

  browser.storage.local.set({ excludedSites, includedSites });
  updateExcludeBtn();
});

// Live updates
browser.storage.onChanged.addListener((changes) => {
  if (changes.nukeCount) {
    countEl.textContent = (changes.nukeCount.newValue as number).toLocaleString();
  }
  if (changes.mode) {
    setActiveMode(changes.mode.newValue as NukeMode);
  }
  if (changes.defaultActive) {
    defaultActive = changes.defaultActive.newValue as boolean;
    defaultActiveToggle.checked = defaultActive;
    updateExcludeBtn();
  }
  if (changes.excludedSites) {
    excludedSites = changes.excludedSites.newValue as string[];
    updateExcludeBtn();
  }
  if (changes.includedSites) {
    includedSites = changes.includedSites.newValue as string[];
    updateExcludeBtn();
  }
});
