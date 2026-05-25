'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface Gym {
  id: string;
  name: string;
  city: string;
  rating: number;
  reviewCount: number;
  lat?: number;
  lng?: number;
  isPartner?: boolean;
}

interface GoogleMapProps {
  gyms: Gym[];
  userLocation?: { lat: number; lng: number };
  onGymSelect?: (gymId: string) => void;
  className?: string;
}

// Generate consistent mock coordinates for gyms around Milan
const getGymCoordinates = (gymId: string, index: number) => {
  // Base coordinates for Milan city center
  const baseLat = 45.4642;
  const baseLng = 9.1900;
  
  // Generate offset based on gym id to keep it consistent
  const latOffset = (Math.sin(index * 1.5) * 0.02) + (Math.random() * 0.005);
  const lngOffset = (Math.cos(index * 1.2) * 0.02) + (Math.random() * 0.005);
  
  return {
    lat: baseLat + latOffset,
    lng: baseLng + lngOffset,
  };
};

export function GoogleMap({ gyms, userLocation, onGymSelect, className }: GoogleMapProps) {
  const { t } = useI18n();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const hasPlaceholderKey = !apiKey || /your_|example|xxx/i.test(apiKey);
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(apiKey) && !hasPlaceholderKey);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const error = runtimeError ?? (hasPlaceholderKey ? t('map.google.error.apiKeyInvalid') : null);

  // Initialize map
  useEffect(() => {
    if (!apiKey || hasPlaceholderKey) {
      return;
    }

    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places'],
    });

    loader.load().then(() => {
      if (!mapRef.current) return;

      // Default to Milan if no user location
      const center = userLocation || { lat: 45.4642, lng: 9.1900 };

      const mapOptions: google.maps.MapOptions = {
        center,
        zoom: 13,
        mapTypeId: 'roadmap',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        styles: [
          {
            featureType: 'all',
            elementType: 'geometry',
            stylers: [{ color: '#1a1d29' }],
          },
          {
            featureType: 'all',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#8a8d99' }],
          },
          {
            featureType: 'all',
            elementType: 'labels.text.stroke',
            stylers: [{ color: '#1a1d29' }],
          },
          {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#2a2d3a' }],
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#151825' }],
          },
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }],
          },
        ],
      };

      googleMapRef.current = new google.maps.Map(mapRef.current, mapOptions);
      setRuntimeError(null);
      setIsLoading(false);
    }).catch((err: unknown) => {
      const message =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: string }).message ?? '')
          : '';
      const lowerMessage = message.toLowerCase();
      const isDomainOrBillingError =
        /referer|origin|notallowedmaperror|billing|forbidden|api key|denied|unauthorized/i.test(
          lowerMessage
        );

      console.error('Google Maps loading error:', err);
      setRuntimeError(
        isDomainOrBillingError
          ? t('map.google.error.requestRejected')
          : t('map.google.error.loadFailed')
      );
      setIsLoading(false);
    });

    return () => {
      // Cleanup markers
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
    };
  }, [apiKey, hasPlaceholderKey, t, userLocation]);

  // Add/update markers when gyms change
  useEffect(() => {
    if (!googleMapRef.current || gyms.length === 0) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Add gym markers
    const bounds = new google.maps.LatLngBounds();

    gyms.forEach((gym, index) => {
      // Use gym coordinates or generate mock ones
      const coords = gym.lat && gym.lng 
        ? { lat: gym.lat, lng: gym.lng }
        : getGymCoordinates(gym.id, index);

      const position = new google.maps.LatLng(coords.lat, coords.lng);
      bounds.extend(position);

      // Create marker element
      const markerDiv = document.createElement('div');
      markerDiv.innerHTML = `
        <div style="
          background: ${gym.isPartner ? '#00C9FF' : '#7B61FF'};
          border: 2px solid white;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: transform 0.2s;
        ">${gym.rating.toFixed(1)}</div>
      `;

      const marker = new google.maps.Marker({
        position,
        map: googleMapRef.current,
        title: gym.name,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="16" fill="${gym.isPartner ? '#00C9FF' : '#7B61FF'}" stroke="white" stroke-width="2"/>
              <text x="18" y="22" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${gym.rating.toFixed(1)}</text>
            </svg>
          `)}`,
          scaledSize: new google.maps.Size(36, 36),
          anchor: new google.maps.Point(18, 18),
        },
      });

      // Add click handler
      marker.addListener('click', () => {
        onGymSelect?.(gym.id);
      });

      // Add info window
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="
            padding: 12px;
            min-width: 200px;
            font-family: system-ui, -apple-system, sans-serif;
            background: #1a1d29;
            color: white;
            border-radius: 8px;
          ">
            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">${gym.name}</h3>
            <p style="margin: 0 0 4px 0; font-size: 14px; color: #8a8d99;">${gym.city}</p>
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
              <span style="color: #fbbf24;">★</span>
              <span style="font-weight: 600;">${gym.rating}</span>
              <span style="color: #8a8d99;">(${t('map.google.reviews', { count: gym.reviewCount })})</span>
            </div>
            ${gym.isPartner ? `<span style="display: inline-block; margin-top: 8px; padding: 4px 8px; background: rgba(0, 201, 255, 0.2); color: #00C9FF; border-radius: 4px; font-size: 12px; font-weight: 500;">${t('map.google.partner')}</span>` : ''}
          </div>
        `,
      });

      marker.addListener('click', () => {
        infoWindow.open(googleMapRef.current, marker);
      });

      markersRef.current.push(marker);
    });

    // Fit map to show all markers if we have gyms
    if (gyms.length > 0) {
      googleMapRef.current.fitBounds(bounds, 50);
    }
  }, [gyms, onGymSelect, t]);

  if (error) {
    return (
      <div className={cn("flex items-center justify-center bg-background-dark rounded-2xl border border-white/10", className)}>
        <div className="text-center p-6">
          <p className="text-red-400 text-sm mb-2">{error}</p>
          <p className="text-text-tertiary text-xs">{t('map.google.error.checkConfig')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative rounded-2xl overflow-hidden border border-white/10", className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background-dark z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-white/20 border-t-section-primary rounded-full animate-spin" />
            <p className="text-text-tertiary text-sm">{t('map.google.loading')}</p>
          </div>
        </div>
      )}
      <div 
        ref={mapRef} 
        className="w-full h-full min-h-[400px]"
        style={{ background: '#1a1d29' }}
      />
    </div>
  );
}
