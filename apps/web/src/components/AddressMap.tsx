/**
 * A small read-only map preview for a confirmed or candidate address, shown beside the written
 * address so an operator can see *where* a set of coordinates actually lands before confirming it —
 * comparing two candidates by their lat/lng digits alone is not something a person can do reliably.
 *
 * Uses OpenStreetMap's embed, which needs no API key and no script tag: it is a plain iframe, so it
 * carries no third-party JS into the dashboard. When a Google Maps key is configured later this is
 * the one component to swap — the callers only pass coordinates.
 */

interface AddressMapProps {
  latitude: number;
  longitude: number;
  /** Written address, used for the iframe's accessible title. */
  label: string;
  zoomSpanDegrees?: number;
}

export function AddressMap({
  label,
  latitude,
  longitude,
  zoomSpanDegrees = 0.006,
}: AddressMapProps) {
  // OSM's embed frames a bounding box rather than taking a zoom level, so the span *is* the zoom:
  // a smaller box shows a tighter view. ~0.006° is roughly a few city blocks.
  const half = zoomSpanDegrees / 2;
  const bbox = [longitude - half, latitude - half, longitude + half, latitude + half].join(',');
  const source = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude},${longitude}`;

  return (
    <div className="address-map">
      <iframe loading="lazy" referrerPolicy="no-referrer" src={source} title={`Mapa de ${label}`} />
      <a
        href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`}
        rel="noreferrer"
        target="_blank"
      >
        Ver más grande
      </a>
    </div>
  );
}
