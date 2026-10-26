import { useEffect, useState } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { UB_CENTER } from '../../lib/studios';

const ESRI_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTR = 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

const pinIcon = L.divIcon({
  className: 'studio-pin',
  html: '<span class="studio-pin-inner"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 26],
});

const dotIcon = L.divIcon({
  className: 'studio-dot',
  html: '<span class="studio-dot-inner"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export interface StudioMapMarker {
  id: string;
  lat: number;
  lng: number;
}

interface SearchMapProps {
  /** Search origin or studio pin. Null shows Ulaanbaatar until the user clicks. */
  center: { lat: number; lng: number } | null;
  radiusMeters?: number;
  markers?: StudioMapMarker[];
  onPick?: (lat: number, lng: number) => void;
  onMarkerClick?: (id: string) => void;
  /** Bump after geolocation so the map recenters even if the point is already in view. */
  flyNonce?: number;
  className?: string;
}

function ClickCatcher({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPick?.(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function ViewSync({
  center,
  radiusMeters,
  flyNonce,
}: {
  center: { lat: number; lng: number } | null;
  radiusMeters?: number;
  flyNonce: number;
}) {
  const map = useMap();
  const lat = center?.lat ?? null;
  const lng = center?.lng ?? null;

  useEffect(() => {
    if (lat == null || lng == null) return;
    const point = L.latLng(lat, lng);
    if (radiusMeters && radiusMeters > 0) {
      map.fitBounds(point.toBounds(radiusMeters * 2.15), { padding: [24, 24], maxZoom: 17 });
      return;
    }
    try {
      if (!map.getBounds().pad(-0.05).contains(point)) {
        map.setView(point, Math.max(map.getZoom(), 15));
      }
    } catch {
      map.setView(point, 15);
    }
  }, [lat, lng, radiusMeters, map]);

  useEffect(() => {
    if (!flyNonce || lat == null || lng == null) return;
    const point = L.latLng(lat, lng);
    if (radiusMeters && radiusMeters > 0) {
      map.fitBounds(point.toBounds(radiusMeters * 2.15), { padding: [24, 24], maxZoom: 17 });
    } else {
      map.setView(point, 15);
    }
  }, [flyNonce, lat, lng, radiusMeters, map]);

  return null;
}

/**
 * Satellite map with a click-to-drop pin and an optional radius circle.
 * Styled for Zuragchin; interaction matches the EDUclub location search
 * (Esri imagery, pin, circle). Leaflet only mounts in the browser.
 */
export default function SearchMap({
  center,
  radiusMeters,
  markers = [],
  onPick,
  onMarkerClick,
  flyNonce = 0,
  className = 'h-72',
}: SearchMapProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    return () => setReady(false);
  }, []);

  if (!ready) {
    return <div className={`${className} bg-stone-900 animate-pulse rounded-xl`} />;
  }

  const initial = center ?? UB_CENTER;

  return (
    <div className={`studio-map isolate overflow-hidden rounded-xl border border-white/10 ${className}`}>
      <MapContainer
        center={[initial.lat, initial.lng]}
        zoom={13}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer attribution={ESRI_ATTR} url={ESRI_TILES} />
        <ClickCatcher onPick={onPick} />
        <ViewSync center={center} radiusMeters={radiusMeters} flyNonce={flyNonce} />
        {center && radiusMeters != null && radiusMeters > 0 && (
          <Circle
            center={[center.lat, center.lng]}
            radius={radiusMeters}
            interactive={false}
            pathOptions={{ color: '#f59e0b', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.18 }}
          />
        )}
        {center && <Marker position={[center.lat, center.lng]} icon={pinIcon} interactive={false} />}
        {markers.map(marker => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={dotIcon}
            eventHandlers={onMarkerClick ? { click: () => onMarkerClick(marker.id) } : undefined}
          />
        ))}
      </MapContainer>
    </div>
  );
}
