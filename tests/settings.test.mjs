import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, presetSettings, presets, ranges, sanitizeSettings } from '../lib/sprite-settings.ts';

test('all presets produce complete settings inside the supported GPU ranges', () => {
  for (const preset of presets) {
    const settings = presetSettings(preset.id);
    assert.deepEqual(Object.keys(settings).sort(), Object.keys(defaults).sort());
    for (const [key, [min, max]] of Object.entries(ranges)) {
      assert.ok(settings[key] >= min && settings[key] <= max, `${preset.id}.${key}`);
    }
  }
});
test('non-finite values cannot reach GPU uniforms', () => {
  const settings = sanitizeSettings({ bloom: NaN, speed: Infinity, pixelSize: -Infinity });
  assert.deepEqual(settings, defaults);
});
test('parameter bounds and discrete counts are enforced', () => {
  const settings = sanitizeSettings({ pixelSize: 999, bloom: -1, particles: 11.6, colorLevels: 3.3 });
  assert.equal(settings.pixelSize, 16); assert.equal(settings.bloom, 0);
  assert.equal(settings.particles, 12); assert.equal(settings.colorLevels, 3);
});
test('malformed colors, booleans and payloads cannot corrupt configuration', () => {
  assert.deepEqual(sanitizeSettings(null), defaults);
  assert.deepEqual(sanitizeSettings('invalid'), defaults);
  assert.deepEqual(sanitizeSettings({ hue: 'url(secret)', playing: 'yes', smooth: 1 }), defaults);
  assert.equal(sanitizeSettings({ hue: '#ABCDEF', playing: false }).hue, '#ABCDEF');
  assert.equal(sanitizeSettings({ playing: false }).playing, false);
});
test('presets and reset settings do not share mutable state', () => {
  const first = presetSettings('forest'); first.bloom = 99;
  assert.notEqual(presetSettings('forest').bloom, 99);
  assert.deepEqual(presetSettings('missing'), defaults);
});
