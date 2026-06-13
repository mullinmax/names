// Hash router: #/trends, #/regional, ... Each page module exports render(container).
import { clearSubscribers } from './store.js';
import { openListsManager } from './ui.js';

// Propagate the cache-busting version on js/main.js?v=… (stamped at deploy
// time) to the dynamically imported pages, so a fresh router never pairs
// with stale page modules.
const V = new URL(import.meta.url).searchParams.get('v');
const load = name => import(`./pages/${name}.js${V ? `?v=${V}` : ''}`);

const routes = {
  trends: () => load('trends'),
  regional: () => load('regional'),
  migration: () => load('migration'),
  compare: () => load('compare'),
  presidents: () => load('presidents'),
  rising: () => load('rising'),
  stability: () => load('stability'),
  gender: () => load('gender'),
  decades: () => load('decades'),
  wonders: () => load('wonders'),
  letters: () => load('letters'),
  bigpicture: () => load('bigpicture'),
  who: () => load('who'),
};

// old bookmarks
const aliases = { maps: 'regional', meanings: 'compare' };

async function navigate() {
  setMenu(false);
  let route = (location.hash.replace(/^#\//, '') || 'trends').split('?')[0];
  route = aliases[route] || route;
  const loader = routes[route] || routes.trends;
  document.querySelectorAll('#nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.route === (routes[route] ? route : 'trends')));

  clearSubscribers(); // pages re-subscribe on render
  const page = document.getElementById('page');
  page.innerHTML = '';
  page.style.animation = 'none';
  void page.offsetWidth; // restart the fade-in animation
  page.style.animation = '';

  try {
    const mod = await loader();
    await mod.render(page);
  } catch (err) {
    console.error(err);
    page.innerHTML = `<div class="card"><h2>Something went wrong</h2>
      <p>${String(err.message || err)}</p></div>`;
  }
}

document.getElementById('nav-lists').onclick = () => openListsManager();

// Mobile: the nav becomes a slide-in side menu behind a hamburger button.
const navToggle = document.getElementById('nav-toggle');
function setMenu(open) {
  document.body.classList.toggle('nav-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
}
navToggle.onclick = () => setMenu(!document.body.classList.contains('nav-open'));
document.getElementById('nav-backdrop').onclick = () => setMenu(false);
// Close the menu on any nav choice — including re-clicking the current tab,
// which doesn't fire hashchange.
document.getElementById('nav').addEventListener('click', e => {
  if (e.target.closest('a, button')) setMenu(false);
});

addEventListener('hashchange', navigate);
navigate();
