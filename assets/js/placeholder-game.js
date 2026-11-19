/**
 * Placeholder game used by the shipped modules. It contains NO gameplay: it only exercises the hub API
 * (save/restore session, complete session -> score + stats) so persistence can be verified.
 * Replace a game's index.js with the real implementation when ready.
 */
import { hydrate } from './icons.js';

export function createPlaceholderGame({ name }) {
  return {
    mount(container, ctx) {
      let state = ctx.loadSession() ?? { counter: 0 };
      container.innerHTML = `
        <div class="placeholder">
          <h2></h2>
          <p class="muted">Gameplay is not implemented yet. The controls below only test the hub's save/restore and statistics.</p>
          <dl class="facts">
            <div><dt>Saved test counter</dt><dd data-f="counter"></dd></div>
            <div><dt>High score</dt><dd data-f="high"></dd></div>
            <div><dt>Sessions finished</dt><dd data-f="plays"></dd></div>
          </dl>
          <div class="actions">
            <button class="btn" data-a="inc" data-icon="plus">Add to counter</button>
            <button class="btn primary" data-a="finish" data-icon="check">Finish session (score = counter × 100)</button>
            <button class="btn accent" data-a="reset" data-icon="refresh">Discard session</button>
          </div>
        </div>`;
      hydrate(container);
      container.querySelector('h2').textContent = `${name} (placeholder)`;
      const set = (f, v) => {
        container.querySelector(`[data-f="${f}"]`).textContent = v;
      };
      const render = () => {
        const s = ctx.getStats();
        set('counter', state.counter);
        set('high', s.highScore ?? '—');
        set('plays', s.plays);
      };
      container.querySelector('.actions').addEventListener('click', (e) => {
        const action = e.target.closest('[data-a]')?.dataset.a;
        if (action === 'inc') {
          state = { counter: state.counter + 1 };
          ctx.saveSession(state);
        }
        if (action === 'finish') {
          ctx.completeSession(state.counter * 100);
          state = { counter: 0 };
        }
        if (action === 'reset') {
          ctx.clearSession();
          state = { counter: 0 };
        }
        render();
      });
      render();
    },
    unmount() {
      /* nothing to release; a real game removes listeners/timers here */
    },
  };
}
