import { SIZE } from './core.js';

export const COLOUR_NAMES = ['empty', 'red', 'green', 'blue', 'yellow', 'pink', 'cyan', 'brown'];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The 9x9 board: 81 buttons (roving tabindex, arrow keys move the focus, Enter/Space act like a click). */
export function createBoardView(root, { onCell }) {
  const cells = [];
  let selected = null,
    focus = { x: 1, y: 1 },
    destroyed = false;
  const timers = new Set();

  const idx = (x, y) => (y - 1) * SIZE + (x - 1);
  const label = (x, y, c) => `Column ${x}, row ${y}: ${c ? `${COLOUR_NAMES[c]} ball` : 'empty'}`;

  root.replaceChildren();
  for (let y = 1; y <= SIZE; y++) {
    for (let x = 1; x <= SIZE; x++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.dataset.x = x;
      b.dataset.y = y;
      b.dataset.c = 0;
      b.tabIndex = -1;
      b.setAttribute('aria-label', label(x, y, 0));
      b.innerHTML = '<span class="ball"></span>';
      cells.push(b);
      root.append(b);
    }
  }
  const cell = (x, y) => cells[idx(x, y)];
  const setFocus = (x, y) => {
    cell(focus.x, focus.y).tabIndex = -1;
    focus = { x, y };
    cell(x, y).tabIndex = 0;
  };
  setFocus(1, 1);

  root.addEventListener('click', (e) => {
    const c = e.target.closest('.cell');
    if (!c || destroyed) {
      return;
    }
    setFocus(Number(c.dataset.x), Number(c.dataset.y));
    onCell(Number(c.dataset.x), Number(c.dataset.y));
  });
  root.addEventListener('focusin', (e) => {
    // keep the arrow-key position in sync with wherever focus really is
    const c = e.target.closest?.('.cell');
    if (c && !destroyed) {
      setFocus(Number(c.dataset.x), Number(c.dataset.y));
    }
  });
  root.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      e.key
    ];
    if (!d) {
      return;
    }
    e.preventDefault();
    const x = Math.min(SIZE, Math.max(1, focus.x + d[0])),
      y = Math.min(SIZE, Math.max(1, focus.y + d[1]));
    setFocus(x, y);
    cell(x, y).focus();
  });

  const setBall = (x, y, c) => {
    const el = cell(x, y);
    el.dataset.c = c;
    el.setAttribute('aria-label', label(x, y, c));
    el.firstElementChild.className = 'ball';
  };

  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  return {
    cell,
    /** Draws the whole board from the game state. */
    render(g) {
      for (let y = 1; y <= SIZE; y++) {
        for (let x = 1; x <= SIZE; x++) {
          setBall(x, y, g.board[x][y]);
        }
      }
      selected = null;
    },
    select(x, y) {
      this.clearSelection();
      selected = { x, y };
      cell(x, y).firstElementChild.classList.add('sel');
      cell(x, y).setAttribute('aria-pressed', 'true');
    },
    clearSelection() {
      if (selected) {
        cell(selected.x, selected.y).firstElementChild.classList.remove('sel');
        cell(selected.x, selected.y).removeAttribute('aria-pressed');
      }
      selected = null;
    },
    shake(x, y) {
      const el = cell(x, y);
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      later(() => el.classList.remove('shake'), 300);
    },
    /** Slides a ball along the path (cosmetic; the game state has already changed). */
    async slide(path, colour, stepMs) {
      for (let i = 1; i < path.length && !destroyed; i++) {
        setBall(path[i - 1].x, path[i - 1].y, 0);
        setBall(path[i].x, path[i].y, colour);
        await wait(stepMs);
      }
    },
    pop(list, g) {
      for (const p of list) {
        if (g.board[p.x][p.y]) {
          cell(p.x, p.y).firstElementChild.classList.add('pop');
        }
      }
    },
    /** Briefly shows the balls that were removed, fading out. */
    poof(list, g) {
      for (const p of list) {
        if (g.board[p.x][p.y]) {
          continue;
        } // a new ball already landed on that cell
        setBall(p.x, p.y, p.c);
        cell(p.x, p.y).firstElementChild.classList.add('poof');
        later(() => {
          if (!g.board[p.x][p.y]) {
            setBall(p.x, p.y, 0);
          }
        }, 320);
      }
    },
    focusCell(x, y) {
      setFocus(x, y);
    },
    destroy() {
      destroyed = true;
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}
