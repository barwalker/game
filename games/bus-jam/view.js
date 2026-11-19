/* Bus Jam - view helpers: builds and updates DOM elements (pure HTML/CSS, no SVG). */
import { config, COL, GLY } from './config.js';
import { formatTime } from './score.js';

function busMarkup(bus, scale) {
  const [base, light, dark] = COL[bus.color];
  const cabinWidth = (bus.seats / 2) * 38 + 10;
  const width = cabinWidth + 98;

  let seatsHtml = '';
  for (let i = 0; i < bus.seats; i++) {
    const x = 21 + (i >> 1) * 38;
    const y = 24 + (i & 1) * 24;
    const reserved = !!(bus.reserved && i < bus.reserved);
    let occupied;
    if (!bus.reserved) {
      occupied = i < bus.shown;
    } else if (reserved) {
      occupied = i < bus.shownReserved;
    } else {
      occupied = i - bus.reserved < bus.shownNormal;
    }

    seatsHtml += `<span class="bj-seat${reserved ? ' reserved' : ''}" style="left:${x}px;top:${y}px">${
      occupied
        ? `<span class="bj-rider${reserved ? ' reserved' : ''}"><span class="bj-rider-head"></span></span>`
        : ''
    }</span>`;
  }

  const label = `${bus.color} bus, ${bus.shown}/${bus.seats} boarded`;
  return (
    `<div class="bj-bus-wrap" role="img" aria-label="${label}" data-bus-w="${width}" ` +
    `style="--bus-w:${width}px;--bus-scale:${scale};--base:${base};--light:${light};--dark:${dark}">` +
    `<div class="bj-bus">` +
    `<span class="bj-wheel" style="left:${width * 0.1}px;top:1px"></span>` +
    `<span class="bj-wheel" style="left:${width * 0.6}px;top:1px"></span>` +
    `<span class="bj-wheel" style="left:${width * 0.1}px;bottom:1px"></span>` +
    `<span class="bj-wheel" style="left:${width * 0.6}px;bottom:1px"></span>` +
    `<span class="bj-bus-body"></span>` +
    `<span class="bj-tail" style="top:24px"></span>` +
    `<span class="bj-tail" style="top:59px"></span>` +
    `<span class="bj-cabin" style="width:${cabinWidth}px"></span>${
      seatsHtml
    }<span class="bj-mirror" style="left:${cabinWidth + 17}px"></span>` +
    `<span class="bj-windshield" style="left:${cabinWidth + 26}px"></span>` +
    `<span class="bj-headlight" style="top:18px"></span>` +
    `<span class="bj-headlight" style="bottom:18px"></span>` +
    `<span class="bj-badge" style="left:${cabinWidth + 61}px">${GLY[bus.color]}</span>` +
    `</div></div>`
  );
}

export function paintPassenger(p, tileSize) {
  const [base, light, dark] = p.secret ? config.secretColours : COL[p.color];
  const style = p.el.style;
  style.setProperty('--base', base);
  style.setProperty('--light', light);
  style.setProperty('--dark', dark);
  style.width = style.height = `${tileSize * config.ui.paxScale}px`;
}

function passengerLabel(p) {
  if (p.secret) {
    return 'Secret passenger';
  }
  return `${p.color}${p.hat ? ' reserved' : ''} passenger`;
}

export function makePassenger(boardEl, p, tileSize, onTap) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `bj-passenger${p.hat ? ' hat' : ''}${p.secret ? ' secret' : ''}`;
  el.textContent = p.secret ? '?' : GLY[p.color];
  el.setAttribute('aria-label', passengerLabel(p));
  p.el = el;
  paintPassenger(p, tileSize);
  el.onclick = onTap;
  boardEl.append(el);
}

export function revealPassenger(p, tileSize) {
  if (!p.secret) {
    return;
  }
  p.secret = false;
  p.el.classList.remove('secret');
  p.el.textContent = GLY[p.color];
  p.el.setAttribute('aria-label', passengerLabel(p));
  paintPassenger(p, tileSize);
}

export function renderTunnel(tunnel) {
  tunnel.cell.innerHTML = tunnel.queue
    .map((p) => {
      const [base, light, dark] = COL[p.color];
      return (
        `<span class="bj-chip${p.hat ? ' hat' : ''}" title="${p.color}${p.hat ? ' (reserved)' : ''}" ` +
        `style="background:radial-gradient(circle at 35% 30%,${light},${base} 60%,${dark})">${GLY[p.color]}</span>`
      );
    })
    .join('');
}

export function renderBus(bus, scale = 1) {
  return busMarkup(bus, scale);
}

export function renderScore(scoreEl, score, best, isNew) {
  const number = (x) => x.toLocaleString('en-US');
  Object.assign(scoreEl.dataset, {
    total: score.total,
    base: score.base,
    bonus: score.timeBonus,
    seconds: score.seconds.toFixed(2),
    passengers: score.passengers,
  });
  scoreEl.innerHTML =
    `<div class="bj-score-row"><span>Passengers ${score.passengers} \u00D7 ${config.scoring.perPassenger}</span><b>${number(score.base)}</b></div>` +
    `<div class="bj-score-row"><span>Time ${formatTime(score.seconds)} bonus</span><b>+${number(score.timeBonus)}</b></div>` +
    `<div class="bj-score-row bj-score-total"><span>Score${isNew ? '<i class="bj-new-best">New best!</i>' : ''}</span><b>${number(score.total)}</b></div>` +
    `<div class="bj-score-best">Best ${number(best)}</div>`;
}

export function clearScore(scoreEl) {
  for (const key of Object.keys(scoreEl.dataset)) {
    delete scoreEl.dataset[key];
  }
  scoreEl.innerHTML = '';
}
