"use client";

import dynamic from "next/dynamic";

// Leaflet toca `window` al importarse — no puede evaluarse en el server,
// así que el mapa de verdad (LeafletMapPicker) se carga solo en el cliente.
const LeafletMapPicker = dynamic(() => import("./LeafletMapPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-48 w-full animate-pulse rounded-lg bg-surface" />
  ),
});

export function VenueLocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
}) {
  return (
    <div className="mt-1.5">
      <p className="text-xs text-foreground/50">
        Tocá el mapa para marcar la ubicación (opcional)
      </p>
      <div className="mt-1 h-48 w-full overflow-hidden rounded-lg border border-surface-border">
        <LeafletMapPicker lat={lat} lng={lng} onChange={onChange} />
      </div>
      {lat != null && lng != null && (
        <button
          type="button"
          onClick={() => onChange(null, null)}
          className="mt-1 text-xs text-foreground/50 transition-colors duration-200 hover:text-red-600 dark:hover:text-red-400"
        >
          Quitar pin
        </button>
      )}
    </div>
  );
}
