'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, LngLatBoundsLike, Map as MapboxMap } from 'mapbox-gl';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GymMarker {
  id: string;
  name: string;
  city: string;
  rating: number;
  reviews: number;
  distanceKm: number;
  lat?: number;
  lng?: number;
  partner?: boolean;
}

interface MapboxGymsMapProps {
  gyms: GymMarker[];
  userLocation?: { lat: number; lng: number };
  onGymSelect?: (gymId: string) => void;
  className?: string;
}

type MapboxModule = typeof import('mapbox-gl');

const DEFAULT_CENTER: [number, number] = [9.19, 45.4642];
const EMPTY_FEATURE_COLLECTION: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: [],
};

function toFeatureCollection(gyms: GymMarker[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: gyms
      .filter((gym) => typeof gym.lat === 'number' && typeof gym.lng === 'number')
      .map((gym) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [gym.lng as number, gym.lat as number],
        },
        properties: {
          id: gym.id,
          name: gym.name,
          city: gym.city,
          rating: gym.rating,
          reviews: gym.reviews,
          distanceKm: gym.distanceKm,
          partner: Boolean(gym.partner),
        },
      })),
  };
}

export function MapboxGymsMap({
  gyms,
  userLocation,
  onGymSelect,
  className,
}: MapboxGymsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapboxModuleRef = useRef<MapboxModule | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const gymGeojson = useMemo(() => toFeatureCollection(gyms), [gyms]);

  useEffect(() => {
    if (!mapboxToken) {
      setError('Mapbox token non configurato (NEXT_PUBLIC_MAPBOX_TOKEN).');
      setLoading(false);
      return;
    }

    let isCancelled = false;

    const setupMap = async () => {
      try {
        const mapboxModule = await import('mapbox-gl');
        const mapboxgl = mapboxModule.default;
        mapboxModuleRef.current = mapboxModule;
        mapboxgl.accessToken = mapboxToken;

        if (!mapContainerRef.current || isCancelled) return;

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: DEFAULT_CENTER,
          zoom: 11.5,
          attributionControl: false,
        });

        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right');

        map.on('load', () => {
          if (isCancelled) return;

          map.addSource('gyms', {
            type: 'geojson',
            data: EMPTY_FEATURE_COLLECTION,
            cluster: true,
            clusterRadius: 45,
            clusterMaxZoom: 14,
          });

          map.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'gyms',
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': [
                'step',
                ['get', 'point_count'],
                '#38bdf8',
                10,
                '#22d3ee',
                30,
                '#14b8a6',
              ],
              'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 30],
              'circle-opacity': 0.9,
            },
          });

          map.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'gyms',
            filter: ['has', 'point_count'],
            layout: {
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 12,
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            },
            paint: {
              'text-color': '#04131f',
            },
          });

          map.addLayer({
            id: 'unclustered-gym',
            type: 'circle',
            source: 'gyms',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-color': [
                'case',
                ['==', ['get', 'partner'], true],
                '#10b981',
                '#8b5cf6',
              ],
              'circle-radius': 11,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            },
          });

          map.on('click', 'clusters', (event) => {
            const features = map.queryRenderedFeatures(event.point, {
              layers: ['clusters'],
            });
            const firstFeature = features[0];
            if (!firstFeature) return;

            const source = map.getSource('gyms') as GeoJSONSource | undefined;
            const clusterId = firstFeature.properties?.cluster_id;
            if (!source || clusterId === undefined) return;

            source.getClusterExpansionZoom(clusterId, (zoomError, zoom) => {
              if (zoomError || zoom == null) return;
              const coordinates = (firstFeature.geometry as Point).coordinates as [number, number];
              map.easeTo({
                center: coordinates,
                zoom,
                duration: 500,
              });
            });
          });

          map.on('click', 'unclustered-gym', (event) => {
            const feature = event.features?.[0];
            if (!feature) return;

            const gymId = feature.properties?.id as string | undefined;
            if (gymId && onGymSelect) {
              onGymSelect(gymId);
            }
          });

          map.on('mouseenter', 'clusters', () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', 'clusters', () => {
            map.getCanvas().style.cursor = '';
          });
          map.on('mouseenter', 'unclustered-gym', () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', 'unclustered-gym', () => {
            map.getCanvas().style.cursor = '';
          });

          setLoading(false);
        });

        map.on('error', () => {
          if (isCancelled) return;
          setError('Errore durante il caricamento della mappa.');
          setLoading(false);
        });
      } catch {
        if (isCancelled) return;
        setError('Impossibile inizializzare Mapbox.');
        setLoading(false);
      }
    };

    void setupMap();

    return () => {
      isCancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapboxToken, onGymSelect]);

  useEffect(() => {
    if (loading) return;

    const map = mapRef.current;
    const mapboxModule = mapboxModuleRef.current;
    if (!map || !mapboxModule) return;

    const source = map.getSource('gyms') as GeoJSONSource | undefined;
    if (source) {
      source.setData(gymGeojson);
    }

    const coordinates = gymGeojson.features.map((feature) => feature.geometry.coordinates);
    if (userLocation) {
      coordinates.push([userLocation.lng, userLocation.lat]);
    }

    if (coordinates.length === 0) {
      map.easeTo({ center: DEFAULT_CENTER, zoom: 11.5, duration: 500 });
      return;
    }

    if (coordinates.length === 1) {
      map.easeTo({
        center: coordinates[0] as [number, number],
        zoom: 13,
        duration: 500,
      });
      return;
    }

    const LngLatBounds = mapboxModule.default.LngLatBounds;
    const bounds = new LngLatBounds(
      coordinates[0] as [number, number],
      coordinates[0] as [number, number]
    );
    coordinates.forEach((coord) => {
      bounds.extend(coord as [number, number]);
    });

    map.fitBounds(bounds as LngLatBoundsLike, {
      padding: 42,
      maxZoom: 14,
      duration: 700,
    });
  }, [gymGeojson, loading, userLocation]);

  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a]', className)}>
      <div ref={mapContainerRef} className="h-full w-full" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background-dark/70 backdrop-blur-sm">
          <p className="text-sm font-medium text-text-secondary">Caricamento mappa...</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-4 top-4 rounded-xl border border-warning/40 bg-warning/15 p-3">
          <p className="flex items-start gap-2 text-sm text-warning">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        </div>
      )}
    </div>
  );
}
