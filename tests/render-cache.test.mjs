import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgentSprite, getAtlasStats, getTerrainSprite, recoverTerrainSprites } from '../src/render/sprites.js';

// Node has no browser canvas. This small fake tracks the opacity of sprite
// bitmaps and lets us emulate a browser discarding one under memory pressure.
class FakeOffscreenCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.alpha = 0;
    this.discarded = false;
    const canvas = this;
    this.context = {
      canvas,
      fillRect() { canvas.alpha = 255; },
      clearRect() { canvas.alpha = 0; },
      drawImage() { canvas.alpha = 255; },
      translate() {},
      scale() {},
      getImageData() { return { data: new Uint8ClampedArray([0, 0, 0, canvas.discarded ? 0 : canvas.alpha]) }; },
    };
  }
  getContext(type) {
    assert.equal(type, '2d');
    return this.context;
  }
}

test('crowded worlds cannot evict environment sprites with person animations', () => {
  const previous = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = FakeOffscreenCanvas;
  try {
    const season = 'winter';
    const terrain = getTerrainSprite('grass', 1, season);
    const before = getAtlasStats();

    // Deliberately generate more unique animated characters than the prior
    // 4,800-sprite shared cache could retain safely over a long simulation.
    for (let index = 0; index < 1700; index++) {
      const agent = {
        id: index + 1, age: 25, level: (index % 20) + 1,
        role: ['farmer', 'scholar', 'trader', 'warrior'][index % 4],
        sex: index % 2 ? 'female' : 'male',
        direction: index % 4, vx: index % 3 ? 0.1 : 0,
        vy: 0, action: { type: index % 3 ? 'walk' : 'farm' },
        appearance: {
          skin: index % 8, hair: index % 10, outfit: index % 12,
          accent: index % 8, hairStyle: index % 10, variant: index % 16,
          beard: index % 4, hat: index % 5,
        },
      };
      getAgentSprite(agent, index / 5);
    }
    const stats = getAtlasStats();
    assert.ok(stats.people <= 1024, 'bounded character atlas');
    assert.ok(stats.sprites <= stats.max, 'bounded total bitmap count');
    assert.strictEqual(getTerrainSprite('grass', 1, season), terrain, 'terrain cannot be pushed out by character churn');
    assert.ok(stats.sprites >= before.sprites);
  } finally {
    if (previous === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previous;
  }
});

test('detects and repairs transparent cached terrain bitmaps', () => {
  const previous = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = FakeOffscreenCanvas;
  try {
    const initial = getTerrainSprite('mountain', 11, 'autumn');
    assert.equal(recoverTerrainSprites('autumn'), false, 'valid terrain stays cached');
    initial.canvas.discarded = true;
    assert.equal(recoverTerrainSprites('autumn'), true, 'discarded terrain triggers recovery');
    const replacement = getTerrainSprite('mountain', 11, 'autumn');
    assert.notStrictEqual(replacement, initial);
    assert.equal(replacement.canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3], 255);
    assert.equal(recoverTerrainSprites('autumn'), false);
  } finally {
    if (previous === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previous;
  }
});
