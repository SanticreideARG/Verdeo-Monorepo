/**
 * El enlace para abrir un domicilio en Google Maps (en el teléfono abre la app).
 *
 * Primero las coordenadas del domicilio: son las que encontró el ubicador (o se confirmaron a
 * mano) y caen en la puerta. Después el enlace que compartió el cliente: a veces es una búsqueda
 * por texto y no un punto. Y si no hay ninguno de los dos, una búsqueda por la dirección escrita.
 */
export function googleMapsLink(place: {
  address: string;
  latitude: number | null;
  locationUrl: string | null;
  longitude: number | null;
}): string {
  if (place.latitude !== null && place.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${String(place.latitude)},${String(place.longitude)}`;
  }
  if (place.locationUrl) return place.locationUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`;
}
