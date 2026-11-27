export const VALID_CHANNELS = ['development', 'beta', 'production'];

export function resolveChannel({ requested, packageChannel, isPackaged, version }) {
  if (VALID_CHANNELS.includes(requested)) return requested;
  if (!isPackaged) return 'development';
  if (VALID_CHANNELS.includes(packageChannel)) return packageChannel;
  return String(version || '').includes('-') ? 'beta' : 'production';
}

export function parseVersion(value) {
  const raw = String(value || '').trim().replace(/^v/i, '').split('+')[0];
  const [core, ...rest] = raw.split('-');
  const numbers = core.split('.').map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  return { numbers, prerelease: rest.join('-') };
}

function comparePrerelease(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const left = a.split('.');
  const right = b.split('.');
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const x = left[index];
    const y = right[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNumber = /^\d+$/.test(x);
    const yNumber = /^\d+$/.test(y);
    if (xNumber && yNumber) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    } else if (xNumber !== yNumber) {
      return xNumber ? -1 : 1;
    } else if (x !== y) {
      return x > y ? 1 : -1;
    }
  }
  return 0;
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.numbers.length, right.numbers.length);
  for (let index = 0; index < length; index += 1) {
    const x = left.numbers[index] || 0;
    const y = right.numbers[index] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

export function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

export function isUpdaterSupported({ channel, isPackaged, platform, env = {} }) {
  if (channel === 'development' || !isPackaged) return false;
  if (platform === 'win32') return !env.PORTABLE_EXECUTABLE_DIR;
  if (platform === 'linux') return Boolean(env.APPIMAGE);
  return false;
}
