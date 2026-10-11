import { describe, it, expect } from 'vitest';
import { computeBoundingBox, computeCardTransform } from './thumbnail';

describe('computeBoundingBox', () => {
  it('handles empty strokes cleanly', () => {
    const box = computeBoundingBox([]);
    expect(box.isEmpty).toBe(true);
    expect(box.minX).toBe(0.2);
    expect(box.maxX).toBe(0.8);
  });

  it('handles tiny drawing / single tap by enforcing minimum span', () => {
    const box = computeBoundingBox([
      {
        trackId: 'track-1',
        width: 3,
        points: [{ x: 0.5, y: 0.5 }],
      },
    ]);
    expect(box.isEmpty).toBe(false);
    // Span should be at least 0.15 + 12% padding
    expect(box.maxX - box.minX).toBeGreaterThanOrEqual(0.15);
    expect(box.maxY - box.minY).toBeGreaterThanOrEqual(0.15);
    expect(box.minX).toBeLessThan(0.5);
    expect(box.maxX).toBeGreaterThan(0.5);
  });

  it('handles wide drawing correctly with padding', () => {
    const box = computeBoundingBox([
      {
        trackId: 'track-1',
        width: 3,
        points: [
          { x: 0.1, y: 0.4 },
          { x: 0.9, y: 0.5 },
        ],
      },
    ]);
    expect(box.isEmpty).toBe(false);
    expect(box.minX).toBeLessThanOrEqual(0.1);
    expect(box.maxX).toBeGreaterThanOrEqual(0.9);
    // Height was 0.1, so minSpan 0.15 kicks in before padding
    expect(box.maxY - box.minY).toBeGreaterThanOrEqual(0.15);
  });

  it('handles tall drawing correctly with padding', () => {
    const box = computeBoundingBox([
      {
        trackId: 'track-2',
        width: 3,
        points: [
          { x: 0.45, y: 0.05 },
          { x: 0.55, y: 0.95 },
        ],
      },
    ]);
    expect(box.isEmpty).toBe(false);
    expect(box.minY).toBeLessThanOrEqual(0.05);
    expect(box.maxY).toBeGreaterThanOrEqual(0.95);
  });
});

describe('computeCardTransform', () => {
  it('fits wide drawing to card width and centers vertically', () => {
    const cardWidth = 560;
    const cardHeight = 700; // 4:5 aspect ratio = 0.8
    // Wide box: aspect 2.0 > 0.8
    const box = { minX: 0.1, maxX: 0.9, minY: 0.4, maxY: 0.8, isEmpty: false };
    const transform = computeCardTransform(box, cardWidth, cardHeight);

    expect(transform.scale).toBeCloseTo(cardWidth / (box.maxX - box.minX), 1);
    // Should have positive vertical offset (centered vertically)
    expect(transform.offsetY).toBeGreaterThan(0);
    expect(transform.offsetX).toBe(0);
  });

  it('fits tall drawing to card height and centers horizontally', () => {
    const cardWidth = 560;
    const cardHeight = 700; // 0.8
    // Tall box: aspect 0.3 < 0.8
    const box = { minX: 0.4, maxX: 0.6, minY: 0.1, maxY: 0.9, isEmpty: false };
    const transform = computeCardTransform(box, cardWidth, cardHeight);

    expect(transform.scale).toBeCloseTo(cardHeight / (box.maxY - box.minY), 1);
    // Should have positive horizontal offset (centered horizontally)
    expect(transform.offsetX).toBeGreaterThan(0);
    expect(transform.offsetY).toBe(0);
  });
});
