import './style.css';
import { type NukeMode, DEFAULT_SETTINGS } from '@/utils/types';

const countEl = document.getElementById('count')!;
const modeBtns = document.querySelectorAll<HTMLButtonElement>('.mode-btn');

function setActiveMode(mode: NukeMode) {
  modeBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

// Load current state
browser.storage.local.get(DEFAULT_SETTINGS).then((settings) => {
  const s = settings as typeof DEFAULT_SETTINGS;
  countEl.textContent = s.nukeCount.toLocaleString();
  setActiveMode(s.mode);
});

// Mode switching
modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode as NukeMode;
    browser.storage.local.set({ mode });
    setActiveMode(mode);
  });
});

// Live counter updates
browser.storage.onChanged.addListener((changes) => {
  if (changes.nukeCount) {
    countEl.textContent = changes.nukeCount.newValue.toLocaleString();
  }
  if (changes.mode) {
    setActiveMode(changes.mode.newValue as NukeMode);
  }
});
