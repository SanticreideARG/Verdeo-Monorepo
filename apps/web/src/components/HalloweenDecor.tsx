/**
 * Los adornos del tema de Halloween (HALLOWEEN_THEME_PLAN.md): la telaraña arriba a la derecha y
 * la de las arañitas abajo a la izquierda. Fijos sobre el área de trabajo, sin capturar el mouse y
 * semitransparentes, para no tapar ni bloquear nada. Las imágenes se cargan sólo con el tema puesto.
 */
export function HalloweenDecor() {
  return (
    <div aria-hidden="true" className="halloween-decor">
      <img
        alt=""
        className="halloween-corner halloween-corner-top"
        src="/seasonal/halloween/halloween-web-corner.png"
      />
      <img
        alt=""
        className="halloween-corner halloween-corner-bottom"
        src="/seasonal/halloween/halloween-spiders-corner.webp"
      />
    </div>
  );
}
