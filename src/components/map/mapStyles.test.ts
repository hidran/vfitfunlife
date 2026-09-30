import { describe, expect, it } from 'vitest';
import { mapStylesFor } from './mapStyles';

describe('mapStylesFor', () => {
  it('paints the dark palette in dark theme', () => {
    const styles = mapStylesFor('dark');
    expect(styles).toContainEqual({
      featureType: 'all',
      elementType: 'geometry',
      stylers: [{ color: '#1a1d29' }],
    });
    expect(styles.some((s) => s.featureType === 'poi')).toBe(false);
  });

  it("uses Google's default look in light theme", () => {
    expect(mapStylesFor('light')).toEqual([]);
  });

  it('hides POI labels in both themes when asked', () => {
    for (const theme of ['dark', 'light'] as const) {
      const styles = mapStylesFor(theme, { hidePoiLabels: true });
      expect(styles.at(-1)).toEqual({
        featureType: 'poi',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }],
      });
    }
    expect(mapStylesFor('light', { hidePoiLabels: true })).toHaveLength(1);
  });
});
