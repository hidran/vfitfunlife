import type { Theme } from '@/contexts/ThemeContext';

/**
 * Inline map styles for the app's two themes. The maps are created without a `mapId`
 * (a cloud-styled map ignores inline `styles`), so a theme switch is a
 * `map.setOptions({ styles: mapStylesFor(theme) })`, no reload needed.
 */
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#1a1d29' }] },
  { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ color: '#8a8d99' }] },
  { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ color: '#1a1d29' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2d3a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#151825' }] },
];

const POI_LABELS_OFF: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

/**
 * Styles for the resolved theme. Light is Google's default look; `hidePoiLabels` keeps
 * shops/landmarks from competing with our own markers (the search map) in both themes.
 */
export function mapStylesFor(
  theme: Theme,
  { hidePoiLabels = false }: { hidePoiLabels?: boolean } = {},
): google.maps.MapTypeStyle[] {
  const base = theme === 'dark' ? DARK_MAP_STYLES : [];
  return hidePoiLabels ? [...base, ...POI_LABELS_OFF] : base;
}
