import assert from 'node:assert/strict';
import {
  compareVersions,
  isNewerVersion,
  isUpdaterSupported,
  parseVersion,
  resolveChannel,
} from '../electron/update-helpers.mjs';

function test(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
    throw error;
  }
}

test('parses stable and pre-release versions', () => {
  assert.deepEqual(parseVersion('v1.2.3'), { numbers: [1, 2, 3], prerelease: '' });
  assert.deepEqual(parseVersion('2.0.0-beta.4'), {
    numbers: [2, 0, 0],
    prerelease: 'beta.4',
  });
});

test('compares release versions', () => {
  assert.ok(isNewerVersion('1.2.4', '1.2.3'));
  assert.ok(isNewerVersion('v1.3.0', '1.2.9'));
  assert.ok(isNewerVersion('2.0.0', '1.99.99'));
  assert.equal(isNewerVersion('1.2.3', '1.2.3'), false);
  assert.equal(isNewerVersion('1.2.2', '1.2.3'), false);
});

test('orders pre-releases according to semver', () => {
  assert.ok(isNewerVersion('1.3.0-beta.2', '1.3.0-beta.1'));
  assert.ok(isNewerVersion('1.3.0', '1.3.0-beta.2'));
  assert.equal(isNewerVersion('1.3.0-beta.2', '1.3.0'), false);
  assert.ok(isNewerVersion('1.3.0-beta.10', '1.3.0-beta.9'));
  assert.equal(compareVersions('1.3.0-alpha', '1.3.0-beta') < 0, true);
});

test('resolves the effective update channel', () => {
  assert.equal(
    resolveChannel({ requested: 'beta', packageChannel: 'production', isPackaged: true }),
    'beta',
  );
  assert.equal(
    resolveChannel({ requested: null, packageChannel: 'development', isPackaged: true }),
    'development',
  );
  assert.equal(
    resolveChannel({ requested: null, packageChannel: null, isPackaged: true, version: '1.0.0-beta.1' }),
    'beta',
  );
  assert.equal(
    resolveChannel({ requested: null, packageChannel: null, isPackaged: true, version: '1.0.0' }),
    'production',
  );
  assert.equal(
    resolveChannel({ requested: null, packageChannel: null, isPackaged: false, version: '1.0.0' }),
    'development',
  );
});

test('only installed beta and production builds use the updater', () => {
  const base = { isPackaged: true, platform: 'win32', env: {} };
  assert.equal(isUpdaterSupported({ ...base, channel: 'production' }), true);
  assert.equal(isUpdaterSupported({ ...base, channel: 'beta' }), true);
  assert.equal(isUpdaterSupported({ ...base, channel: 'development' }), false);
  assert.equal(isUpdaterSupported({ ...base, channel: 'production', isPackaged: false }), false);
  assert.equal(
    isUpdaterSupported({ ...base, channel: 'production', env: { PORTABLE_EXECUTABLE_DIR: 'C:/tmp' } }),
    false,
  );
  assert.equal(
    isUpdaterSupported({
      channel: 'production',
      isPackaged: true,
      platform: 'linux',
      env: { APPIMAGE: '/tmp/Pokeke.AppImage' },
    }),
    true,
  );
  assert.equal(
    isUpdaterSupported({ channel: 'production', isPackaged: true, platform: 'linux', env: {} }),
    false,
  );
});
