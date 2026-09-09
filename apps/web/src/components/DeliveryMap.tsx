/**
 * El domicilio de entrega en un mapa, dentro de la ficha.
 *
 * Encontrar la puerta es la acción que sigue a abrir un pedido, y hasta ahora eso significaba
 * copiar la dirección y salir a otra pestaña. El mapa se ve acá y el enlace sigue estando para
 * quien quiere abrirlo en grande o tirarlo al teléfono.
 *
 * OpenStreetMap y no un proveedor con clave: es un `iframe` público, sin cuenta, sin cuota y sin
 * script de terceros corriendo dentro del panel. Alcanza de sobra para "¿esto dónde queda?".
 *
 * Sin coordenadas no se dibuja nada. Un mapa centrado en el país no ubica a nadie, y peor:
 * aparenta que la dirección está resuelta cuando lo que falta es geocodificarla.
 */
export function DeliveryMap({
  address,
  latitude,
  locationUrl,
  longitude,
}: {
  address: string;
  latitude: number | null;
  locationUrl: string | null;
  longitude: number | null;
}) {
  if (latitude === null || longitude === null) {
    return (
      <div className="delivery-map delivery-map-empty">
        <p>Este domicilio todavía no está geocodificado, así que no hay mapa que mostrar.</p>
        {locationUrl ? (
          <a
            className="button button-secondary"
            href={locationUrl}
            rel="noreferrer"
            target="_blank"
          >
            Abrir la ubicación compartida
          </a>
        ) : null}
      </div>
    );
  }

  /*
   * El recuadro que se ve. OpenStreetMap embebe por caja y no por nivel de zoom, así que el zoom
   * se elige por el tamaño de la caja: ±0,004° son unas cuatro cuadras a la redonda, que es lo que
   * hace falta para reconocer la esquina sin perder de vista el barrio.
   */
  const span = 0.004;
  const bbox = [longitude - span, latitude - span, longitude + span, latitude + span]
    .map((value) => value.toFixed(6))
    .join('%2C');
  const marker = `${latitude.toFixed(6)}%2C${longitude.toFixed(6)}`;

  return (
    <div className="delivery-map">
      <iframe
        className="delivery-map-frame"
        loading="lazy"
        // El domicilio, no "mapa": quien usa lector de pantalla necesita saber de qué mapa se trata.
        title={`Mapa de ${address}`}
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`}
      />
      <div className="delivery-map-links">
        <a
          href={`https://www.openstreetmap.org/?mlat=${String(latitude)}&mlon=${String(longitude)}#map=17/${String(latitude)}/${String(longitude)}`}
          rel="noreferrer"
          target="_blank"
        >
          Ver en OpenStreetMap
        </a>
        {locationUrl ? (
          <a href={locationUrl} rel="noreferrer" target="_blank">
            Ubicación compartida
          </a>
        ) : null}
      </div>
    </div>
  );
}
