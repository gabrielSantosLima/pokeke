const CHIP_COLORS = ['white', 'red', 'green', 'black', 'purple', 'gold'];
const CURSOR_FADE_PX = 90;
const CURSOR_TIMEOUT_MS = 6000;
const CHIP_LIFE_SECONDS = 8;
const CHIP_FADE_SECONDS = 0.8;
const MAX_CHIPS = 40;
const CURSOR_COLORS = ['#f4dda2', '#57f2ff', '#ff6ee2', '#b6ff5c', '#ffb15c', '#b58cff'];

export const DEFAULT_CURSOR_COLOR = '#e8e6df';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function hashId(id) {
  let hash = 2166136261;
  for (const character of String(id || 'player')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function cursorColorFor(id) {
  return CURSOR_COLORS[hashId(id) % CURSOR_COLORS.length];
}

export function createChipPayload(x, y, rng = Math.random) {
  const direction = rng() * Math.PI * 2;
  const speed = 0.08 + rng() * 0.18;
  return {
    x: clamp(Number(x) || 0.5, 0.02, 0.98),
    y: clamp(Number(y) || 0.5, 0.02, 0.98),
    size: 0.018 + rng() * 0.024,
    color: CHIP_COLORS[Math.floor(rng() * CHIP_COLORS.length)],
    vx: Math.cos(direction) * speed,
    vy: Math.sin(direction) * speed,
    angle: rng() * Math.PI * 2,
    spin: (rng() - 0.5) * 7,
  };
}

export class TableEffects {
  constructor({ table, cursorLayer, chipLayer, localCursorLayer }) {
    this.table = table;
    this.cursorLayer = cursorLayer;
    this.chipLayer = chipLayer || document.body;
    this.localCursorLayer = localCursorLayer;
    this.cursors = new Map();
    this.chips = [];
    this.raf = null;
    this.lastTime = 0;
    this.cursorsEnabled = true;
    this.localCursor = null;
    this.localColor = DEFAULT_CURSOR_COLOR;
    this.tick = this.tick.bind(this);
  }

  ensureLocalCursor() {
    if (!this.localCursorLayer) return null;
    if (this.localCursor) return this.localCursor;
    const el = document.createElement('div');
    el.className = 'local-cursor';
    el.style.setProperty('--cursor-color', this.localColor);
    el.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.2 3.4 L20 11.4 Q21 11.9 20.1 12.6 L13.5 15.1 L10.7 20.8 Q10.2 21.9 9.3 20.9 L3.2 4.8 Q2.7 3.5 4.2 3.4 Z" />
      </svg>
    `;
    this.localCursorLayer.appendChild(el);
    this.localCursor = el;
    return el;
  }

  updateLocalPointer(x, y) {
    const el = this.ensureLocalCursor();
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    el.style.opacity = '1';
    el.style.visibility = 'visible';
  }

  setLocalCursorColor(color) {
    this.localColor = color || DEFAULT_CURSOR_COLOR;
    if (this.localCursor) this.localCursor.style.setProperty('--cursor-color', this.localColor);
  }

  hideLocalCursor() {
    if (!this.localCursor) return;
    this.localCursor.style.opacity = '0';
    this.localCursor.style.visibility = 'hidden';
  }

  isUiPoint(px, py) {
    const target = document.elementFromPoint(px, py);
    if (!target) return false;
    return Boolean(
      target.closest(
        '#table, .table-shell, .sidebar, .action-bar, .topbar, .modal, .overlay, .toast',
      ),
    );
  }

  setCursorsEnabled(enabled) {
    this.cursorsEnabled = Boolean(enabled);
    if (!this.cursorsEnabled) this.clearCursors();
  }

  updateCursor({ id, name, x, y }) {
    if (!this.cursorsEnabled || !this.cursorLayer || !id) return;
    const nx = clamp(Number(x) || 0, 0, 1);
    const ny = clamp(Number(y) || 0, 0, 1);
    let cursor = this.cursors.get(id);
    if (!cursor) {
      const el = document.createElement('div');
      el.className = 'remote-cursor';
      el.style.setProperty('--cursor-color', cursorColorFor(id));
      el.innerHTML = `
        <svg class="remote-cursor__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.2 3.4 L20 11.4 Q21 11.9 20.1 12.6 L13.5 15.1 L10.7 20.8 Q10.2 21.9 9.3 20.9 L3.2 4.8 Q2.7 3.5 4.2 3.4 Z" />
        </svg>
        <span class="remote-cursor__name"></span>
      `;
      el.querySelector('.remote-cursor__name').textContent = name || 'Jogador';
      this.cursorLayer.appendChild(el);
      cursor = { el, x: nx, y: ny, targetX: nx, targetY: ny, lastSeen: performance.now(), uiBlocked: false };
      this.cursors.set(id, cursor);
    } else {
      cursor.el.querySelector('.remote-cursor__name').textContent = name || 'Jogador';
    }
    cursor.targetX = nx;
    cursor.targetY = ny;
    cursor.uiBlocked = this.isUiPoint(nx * window.innerWidth, ny * window.innerHeight);
    cursor.lastSeen = performance.now();
    this.ensureLoop();
  }

  removeCursor(id) {
    const cursor = this.cursors.get(id);
    if (!cursor) return;
    cursor.el.remove();
    this.cursors.delete(id);
  }

  clearCursors() {
    for (const cursor of this.cursors.values()) cursor.el.remove();
    this.cursors.clear();
  }

  spawnChip(payload) {
    if (!this.table) return;
    if (this.chips.length >= MAX_CHIPS) {
      const oldest = this.chips.shift();
      oldest.el.remove();
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (!width || !height) return;
    const data = {
      ...createChipPayload(0.5, 0.5),
      ...payload,
    };
    const color = CHIP_COLORS.includes(data.color) ? data.color : 'red';
    const radius = Math.max(7, clamp(Number(data.size) || 0.03, 0.015, 0.055) * width * 0.5);
    const el = document.createElement('div');
    el.className = `chip table-chip chip--${color}`;
    el.style.width = `${radius * 2}px`;
    el.style.height = `${radius * 2}px`;
    el.style.setProperty('--i', '0');
    this.chipLayer.appendChild(el);
    this.chips.push({
      el,
      x: clamp(Number(data.x) || 0.5, 0.02, 0.98) * width,
      y: clamp(Number(data.y) || 0.5, 0.02, 0.98) * height,
      vx: (Number(data.vx) || 0) * width,
      vy: (Number(data.vy) || 0) * width,
      radius,
      mass: radius * radius,
      angle: Number(data.angle) || 0,
      spin: Number(data.spin) || 0,
      age: 0,
    });
    this.ensureLoop();
  }

  clearChips() {
    for (const chip of this.chips) chip.el.remove();
    this.chips = [];
  }

  ensureLoop() {
    if (this.raf) return;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  tick(now) {
    this.raf = null;
    const dt = clamp((now - this.lastTime) / 1000 || 0.016, 0.001, 0.05);
    this.lastTime = now;
    const rect = this.table
      ? this.table.getBoundingClientRect()
      : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    this.updateCursors(dt, rect, now);
    this.updateChips(dt);
    if (this.cursors.size || this.chips.length) this.ensureLoop();
  }

  updateCursors(dt, rect, now) {
    const smoothing = 1 - Math.exp(-16 * dt);
    for (const [id, cursor] of this.cursors) {
      if (now - cursor.lastSeen > CURSOR_TIMEOUT_MS) {
        cursor.el.remove();
        this.cursors.delete(id);
        continue;
      }
      cursor.x += (cursor.targetX - cursor.x) * smoothing;
      cursor.y += (cursor.targetY - cursor.y) * smoothing;
      const px = cursor.x * window.innerWidth;
      const py = cursor.y * window.innerHeight;
      const opacity = cursor.uiBlocked ? 0 : this.cursorOpacity(px, py, rect);
      cursor.el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      cursor.el.style.opacity = opacity.toFixed(3);
      cursor.el.style.visibility = opacity > 0.01 ? 'visible' : 'hidden';
    }
  }

  cursorOpacity(px, py, rect) {
    if (!rect.width || !rect.height) return 1;
    if (px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom) return 0;
    const dx = Math.max(rect.left - px, 0, px - rect.right);
    const dy = Math.max(rect.top - py, 0, py - rect.bottom);
    const distance = Math.hypot(dx, dy);
    const t = clamp(distance / CURSOR_FADE_PX, 0, 1);
    return t * t * (3 - 2 * t);
  }

  updateChips(dt) {
    if (!this.chips.length) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const friction = Math.exp(-0.9 * dt);
    const spinFriction = Math.exp(-0.7 * dt);
    const chips = this.chips;

    for (let index = chips.length - 1; index >= 0; index -= 1) {
      const chip = chips[index];
      chip.age += dt;
      if (chip.age > CHIP_LIFE_SECONDS + CHIP_FADE_SECONDS) {
        chip.el.remove();
        chips.splice(index, 1);
        continue;
      }
      chip.vx *= friction;
      chip.vy *= friction;
      chip.x += chip.vx * dt;
      chip.y += chip.vy * dt;
      chip.angle += chip.spin * dt;
      chip.spin *= spinFriction;

      const minX = chip.radius + 2;
      const maxX = Math.max(minX, width - chip.radius - 2);
      const minY = chip.radius + 2;
      const maxY = Math.max(minY, height - chip.radius - 2);
      if (chip.x < minX) {
        chip.x = minX;
        chip.vx = Math.abs(chip.vx) * 0.55;
      } else if (chip.x > maxX) {
        chip.x = maxX;
        chip.vx = -Math.abs(chip.vx) * 0.55;
      }
      if (chip.y < minY) {
        chip.y = minY;
        chip.vy = Math.abs(chip.vy) * 0.55;
      } else if (chip.y > maxY) {
        chip.y = maxY;
        chip.vy = -Math.abs(chip.vy) * 0.55;
      }
    }

    for (let i = 0; i < chips.length; i += 1) {
      for (let j = i + 1; j < chips.length; j += 1) {
        const a = chips[i];
        const b = chips[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        const minimum = a.radius + b.radius;
        if (distance >= minimum) continue;
        if (distance < 0.001) {
          dx = 0.01;
          dy = 0.01;
          distance = 0.014;
        }
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minimum - distance;
        const totalMass = a.mass + b.mass;
        a.x -= nx * overlap * (b.mass / totalMass);
        a.y -= ny * overlap * (b.mass / totalMass);
        b.x += nx * overlap * (a.mass / totalMass);
        b.y += ny * overlap * (a.mass / totalMass);
        const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (relative >= 0) continue;
        const impulse = (-(1 + 0.55) * relative) / (1 / a.mass + 1 / b.mass);
        a.vx -= (impulse * nx) / a.mass;
        a.vy -= (impulse * ny) / a.mass;
        b.vx += (impulse * nx) / b.mass;
        b.vy += (impulse * ny) / b.mass;
      }
    }

    for (const chip of chips) {
      const fade =
        chip.age > CHIP_LIFE_SECONDS
          ? Math.max(0, 1 - (chip.age - CHIP_LIFE_SECONDS) / CHIP_FADE_SECONDS)
          : 1;
      chip.el.style.transform = `translate3d(${chip.x - chip.radius}px, ${chip.y - chip.radius}px, 0) rotate(${chip.angle}rad)`;
      chip.el.style.opacity = fade.toFixed(3);
    }
  }
}
