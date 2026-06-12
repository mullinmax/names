// Hash router: #/trends, #/maps, ... Each page module exports render(container).
import { clearSubscribers } from './store.js';

const routes = {
  trends: () => import('./pages/trends.js'),
  maps: () => import('./pages/maps.js'),
  meanings: () => import('./pages/meanings.js'),
  rising: () => import('./pages/rising.js'),
  gender: () => import('./pages/gender.js'),
  decades: () => import('./pages/decades.js'),
  wonders: () => import('./pages/wonders.js'),
  bigpicture: () => import('./pages/bigpicture.js'),
};

async function navigate() {
  const route = (location.hash.replace(/^#\//, '') || 'trends').split('?')[0];
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

addEventListener('hashchange', navigate);
navigate();
