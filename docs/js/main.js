// Hash router: #/trends, #/regional, ... Each page module exports render(container).
import { clearSubscribers } from './store.js';
import { openListsManager } from './ui.js';

const routes = {
  trends: () => import('./pages/trends.js'),
  regional: () => import('./pages/regional.js'),
  migration: () => import('./pages/migration.js'),
  compare: () => import('./pages/compare.js'),
  presidents: () => import('./pages/presidents.js'),
  rising: () => import('./pages/rising.js'),
  gender: () => import('./pages/gender.js'),
  decades: () => import('./pages/decades.js'),
  wonders: () => import('./pages/wonders.js'),
  letters: () => import('./pages/letters.js'),
  bigpicture: () => import('./pages/bigpicture.js'),
  who: () => import('./pages/who.js'),
};

// old bookmarks
const aliases = { maps: 'regional', meanings: 'compare' };

async function navigate() {
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

document.getElementById('nav-lists').onclick = openListsManager;

addEventListener('hashchange', navigate);
navigate();
