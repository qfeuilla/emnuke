import './style.css';
import { type NukeMode, DEFAULT_SETTINGS } from '@/utils/types';

const countEl = document.getElementById('count')!;
const modeBtns = document.querySelectorAll<HTMLButtonElement>('.mode-btn');
const excludeBtn = document.getElementById('exclude-btn') as HTMLButtonElement;

let currentHostname: string | null = null;
let excludedSites: string[] = [];

function setActiveMode(mode: NukeMode) {
  modeBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

function updateExcludeBtn() {
  if (!currentHostname) return;
  const isExcluded = excludedSites.includes(currentHostname);
  excludeBtn.textContent = isExcluded
    ? `✓ ${currentHostname} excluded`
    : `Exclude ${currentHostname}`;
  excludeBtn.classList.toggle('excluded', isExcluded);
}

// Load current state
browser.storage.local.get(DEFAULT_SETTINGS).then((settings) => {
  const s = settings as typeof DEFAULT_SETTINGS;
  countEl.textContent = s.nukeCount.toLocaleString();
  setActiveMode(s.mode);
  excludedSites = s.excludedSites;
  updateExcludeBtn();
});

// Get active tab hostname
browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
  const url = tabs[0]?.url;
  if (!url) return;
  try {
    currentHostname = new URL(url).hostname;
    excludeBtn.style.display = '';
    updateExcludeBtn();
  } catch {}
});

// Mode switching
modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode as NukeMode;
    browser.storage.local.set({ mode });
    setActiveMode(mode);
  });
});

// Exclude toggle
excludeBtn.addEventListener('click', () => {
  if (!currentHostname) return;
  const isExcluded = excludedSites.includes(currentHostname);
  if (isExcluded) {
    excludedSites = excludedSites.filter((s) => s !== currentHostname);
  } else {
    excludedSites = [...excludedSites, currentHostname];
  }
  browser.storage.local.set({ excludedSites });
  updateExcludeBtn();
});

// Live updates
browser.storage.onChanged.addListener((changes) => {
  if (changes.nukeCount) {
    countEl.textContent = changes.nukeCount.newValue.toLocaleString();
  }
  if (changes.mode) {
    setActiveMode(changes.mode.newValue as NukeMode);
  }
  if (changes.excludedSites) {
    excludedSites = changes.excludedSites.newValue as string[];
    updateExcludeBtn();
  }
});
