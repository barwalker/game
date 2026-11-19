/**
 * Minimal hash router. Routes: { path: 'game/:id', handler(params) -> cleanup fn | void, public?: boolean }.
 * The cleanup returned by a handler runs when the user navigates away.
 */
export function createRouter({ routes, fallback, guard, onRoute, onError }) {
  let token = 0;
  let cleanup = null;

  const segments = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  function match(segs) {
    for (const route of routes) {
      const pattern = route.path.split('/').filter(Boolean);
      if (pattern.length !== segs.length) {
        continue;
      }
      const params = {};
      const ok = pattern.every((p, i) => {
        if (!p.startsWith(':')) {
          return p === segs[i];
        }
        params[p.slice(1)] = decodeURIComponent(segs[i]);
        return true;
      });
      if (ok) {
        return { route, params };
      }
    }
    return null;
  }

  async function resolve() {
    const mine = ++token;
    if (cleanup) {
      try {
        cleanup();
      } catch (e) {
        console.error(e);
      }
      cleanup = null;
    }
    const segs = segments();
    const m = match(segs) ?? { route: fallback, params: {} };
    const redirect = guard?.(m.route);
    if (redirect && location.hash !== redirect) {
      location.hash = redirect;
      return;
    }
    onRoute?.(segs[0] ?? '', m.route);
    try {
      const result = await m.route.handler(m.params);
      if (mine !== token) {
        if (typeof result === 'function') {
          result();
        }
        return;
      }
      cleanup = typeof result === 'function' ? result : null;
    } catch (err) {
      console.error(err);
      if (mine === token) {
        onError?.(err);
      }
    }
  }

  return {
    start() {
      window.addEventListener('hashchange', resolve);
      return resolve();
    },
    refresh: resolve,
  };
}
