import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, clampZoom, fitViewport, screenToWorld, zoomAt } from './geometry';

describe('ジオメトリ', () => {
  it('ズームは 40%〜200% に制限される', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
    expect(MIN_ZOOM).toBe(0.4);
    expect(MAX_ZOOM).toBe(2);
  });

  it('カーソル位置を固定したままズームする', () => {
    const v = { x: 30, y: -10, zoom: 1 };
    const p = { x: 200, y: 150 };
    const before = screenToWorld(v, p);
    const z = zoomAt(v, p, 1.7);
    const after = screenToWorld(z, p);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('収まる大きさなら中央に、収まらないなら左上に寄せる', () => {
    const small = fitViewport({ x: 0, y: 0, width: 400, height: 200 }, { width: 800, height: 600 });
    expect(small.x + 200 * small.zoom).toBeCloseTo(400);
    const huge = fitViewport({ x: 0, y: 0, width: 5000, height: 300 }, { width: 800, height: 600 });
    expect(huge.zoom).toBe(MIN_ZOOM);
    expect(huge.x).toBe(64);
  });
});
