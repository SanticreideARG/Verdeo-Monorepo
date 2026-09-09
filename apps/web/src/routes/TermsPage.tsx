import { LegalPage, type LegalSection } from '../components/LegalPage.js';

/** Mismos datos de identificación que la política de privacidad; ver el comentario de allá. */
const RESPONSABLE = {
  correo: 'hola@verdeo.com.ar',
  cuit: '[CUIT a completar]',
  domicilio: '[Domicilio legal a completar]',
  nombre: 'Verdeo SCA',
  sitio: 'verdeo.com.ar',
};

const VIGENTE_DESDE = '2026-09-09';

const SECTIONS: readonly LegalSection[] = [
  {
    body: [
      `Estos términos regulan el uso del sitio ${RESPONSABLE.sitio} y de los servicios que ofrece ${RESPONSABLE.nombre} (CUIT ${RESPONSABLE.cuit}, con domicilio en ${RESPONSABLE.domicilio}): el pedido de viandas semanales, su seguimiento, la cuenta del cliente y el panel interno que usa el equipo de Verdeo.`,
      'Usar el sitio o hacer un pedido implica aceptar estos términos y la política de privacidad. Si no estás de acuerdo con alguno de sus puntos, no uses el servicio.',
      'El servicio está dirigido a personas mayores de 18 años con capacidad para contratar.',
    ],
    id: 'objeto',
    title: 'Qué regulan estos términos',
  },
  {
    body: [
      'Verdeo prepara y entrega comida lista para la semana. La oferta se organiza por semanas: cada semana tiene un menú publicado, con variedades y tamaños, y una fecha de entrega.',
      'El menú de una semana, sus variedades, sus precios y las zonas donde se entrega pueden cambiar de una semana a la otra. Lo que rige para tu pedido es lo que estaba publicado en el momento en que lo confirmaste.',
      'La disponibilidad es limitada. Un pedido tomado no queda confirmado hasta que Verdeo lo confirma; si no se puede preparar, se avisa y no se cobra.',
    ],
    id: 'servicio',
    title: 'El servicio',
  },
  {
    body: [
      'El pedido se toma por el formulario del sitio o por los canales de contacto habituales de Verdeo. Al tomarlo se registran tu nombre, tu contacto, el domicilio de entrega, lo que pediste y el medio de pago acordado.',
      'Cada semana tiene un cierre: pasada esa hora, el pedido ya no entra en la producción de esa semana. El cierre se informa en el sitio y al tomar el pedido.',
      'Es tu responsabilidad que los datos de entrega estén correctos y actualizados. Una dirección incompleta o equivocada puede impedir la entrega.',
    ],
    id: 'pedidos',
    title: 'Cómo se toma un pedido',
  },
  {
    body: [
      'Los precios están expresados en pesos argentinos e incluyen los impuestos aplicables al consumidor final, salvo que se indique lo contrario.',
      'El precio depende del tamaño de la vianda y puede variar según la zona de entrega. El precio que se aplica es el vigente al momento de confirmar el pedido.',
      'Los medios de pago aceptados son los que se ofrecen al tomar el pedido. Verdeo no almacena datos de tarjetas de crédito o débito en sus sistemas.',
      'El comprobante correspondiente se emite conforme a la normativa fiscal vigente.',
    ],
    id: 'precios',
    title: 'Precios y pago',
  },
  {
    body: [
      'La entrega se realiza en el domicilio indicado, dentro de las zonas de cobertura publicadas, en la fecha de entrega de la semana correspondiente.',
      'Las franjas horarias son estimadas: dependen del recorrido del día y pueden moverse. Si hay una demora relevante, se avisa por el canal de contacto que dejaste.',
      'Si no hay nadie para recibir el pedido, se intenta contactarte. Si aun así no se puede entregar, el pedido queda a tu disposición para retirar o se coordina una nueva entrega, según el caso. Tratándose de alimentos frescos, la reprogramación puede no ser posible.',
      'El riesgo sobre el producto se transfiere con la entrega en el domicilio indicado o a la persona que lo reciba en ese domicilio.',
    ],
    id: 'entrega',
    title: 'Entrega',
  },
  {
    body: [
      'Podés modificar o cancelar tu pedido sin costo hasta el cierre de la semana correspondiente, escribiendo por el mismo canal por el que lo hiciste. Pasado ese momento el pedido ya entró en producción: la comida está comprada y preparada para vos, y la cancelación puede no ser posible.',
      'De acuerdo con el artículo 1110 del Código Civil y Comercial y el artículo 34 de la Ley 24.240, en las contrataciones a distancia el consumidor tiene derecho a revocar la aceptación dentro de los diez días corridos. Ese derecho no se aplica, conforme el artículo 1116 del mismo Código, a los productos que por su naturaleza pueden deteriorarse o caducar con rapidez, que es el caso de la comida fresca ya elaborada. Sí se aplica antes de que el pedido entre en producción, y para cualquier servicio que no consista en alimentos perecederos.',
      'Si un pedido llega incompleto, en mal estado o distinto de lo pedido, avisanos dentro de las 24 horas de recibido y lo resolvemos: reposición o devolución del importe correspondiente, según lo que prefieras y sea posible.',
    ],
    id: 'cancelacion',
    title: 'Cambios, cancelaciones y devoluciones',
  },
  {
    body: [
      'La comida se elabora en una cocina donde se manipulan, entre otros, gluten, lácteos, huevo, frutos secos, pescado y soja. Aunque se toman recaudos, no puede garantizarse la ausencia total de trazas de ningún alérgeno.',
      'Si tenés una alergia o una condición de salud que exija evitar un ingrediente, informalo antes de pedir y consultá si podemos cubrir tu caso. Las indicaciones alimentarias que cargues se usan para preparar tu vianda, pero no reemplazan una consulta médica ni convierten a Verdeo en un servicio de alimentación clínica.',
      'La información nutricional que se publique es orientativa y puede variar entre semanas según los ingredientes disponibles.',
      'Los productos deben conservarse refrigerados y consumirse dentro del plazo indicado en la etiqueta.',
    ],
    id: 'alimentos',
    title: 'Alimentos, alérgenos y conservación',
  },
  {
    body: [
      'El panel interno de Verdeo es de uso exclusivo del personal autorizado. El acceso se otorga por usuario nominado, con roles y permisos asignados, y puede iniciarse con contraseña o con una cuenta de Google previamente vinculada.',
      'Quien tiene acceso se compromete a no compartir sus credenciales, a usar el sistema sólo para las tareas propias de su función y a no extraer datos de clientes fuera de lo necesario para operar. Toda acción sobre pedidos, clientes y configuraciones queda registrada en un log de auditoría.',
      'Verdeo puede suspender o revocar un acceso en cualquier momento, en particular al terminar el vínculo con la persona.',
    ],
    id: 'panel',
    title: 'Acceso del equipo al panel interno',
  },
  {
    body: [
      'El sitio se ofrece tal como está. Se procura que esté disponible y funcione correctamente, pero puede haber interrupciones por mantenimiento, fallas de proveedores o causas ajenas a Verdeo.',
      'Verdeo responde por el cumplimiento del servicio contratado en los términos de la Ley 24.240 de Defensa del Consumidor. No responde por daños derivados del uso indebido del producto, del incumplimiento de las condiciones de conservación indicadas, ni de información inexacta suministrada al hacer el pedido.',
      'Ninguna cláusula de estos términos limita los derechos que la legislación de defensa del consumidor reconoce como irrenunciables.',
    ],
    id: 'responsabilidad',
    title: 'Disponibilidad y responsabilidad',
  },
  {
    body: [
      'La marca Verdeo, el sitio, sus textos, imágenes, recetas publicadas y el software que lo hace funcionar son propiedad de Verdeo o se usan con autorización. No pueden reproducirse ni usarse comercialmente sin permiso escrito.',
      'Podés usar el sitio para pedir y consultar tus pedidos. No podés usarlo para extraer datos de forma automatizada, para interferir con su funcionamiento ni para intentar acceder a información de otras personas.',
    ],
    id: 'propiedad',
    title: 'Propiedad intelectual y uso permitido',
  },
  {
    body: [
      'El tratamiento de datos personales se rige por la política de privacidad, que forma parte de estos términos.',
    ],
    id: 'privacidad',
    title: 'Datos personales',
  },
  {
    body: [
      'Estos términos pueden actualizarse. La fecha de vigencia indica desde cuándo rige la versión que estás leyendo, y a un pedido ya confirmado se le aplican los términos vigentes al momento de confirmarlo.',
      'Estos términos se rigen por las leyes de la República Argentina. Para cualquier controversia resultan competentes los tribunales ordinarios que correspondan conforme a la normativa de defensa del consumidor, sin perjuicio del derecho del consumidor a demandar ante los tribunales de su domicilio.',
      'Antes de llegar a eso, escribinos: la mayoría de los problemas se resuelven contestando un mensaje. ' +
        RESPONSABLE.correo +
        '.',
    ],
    id: 'ley',
    title: 'Cambios, ley aplicable y contacto',
  },
];

/**
 * "/terminos": las condiciones del servicio.
 *
 * Acompañan a la política de privacidad: la pantalla de consentimiento de OAuth de Google pide un
 * enlace a los términos además del de privacidad, y una tienda de comida los necesita igual, con o
 * sin OAuth — qué se vende, cuándo se puede cancelar, qué pasa si nadie atiende la puerta.
 *
 * Están escritos sobre cómo funciona Verdeo de verdad —semanas con cierre, precio por tamaño y
 * zona, entrega en la fecha de cierre de la semana— y no sobre una tienda genérica. La sección de
 * alérgenos existe porque es comida: es la que más importa y la que más se olvida.
 */
export function TermsPage() {
  return (
    <LegalPage
      intro={[
        'Estas son las condiciones bajo las que Verdeo vende y entrega la comida, y bajo las que se usa este sitio. Están escritas para leerse una vez y entenderse.',
      ]}
      sections={SECTIONS}
      subtitle="Verdeo SCA"
      title="Términos y condiciones"
      updatedAt={VIGENTE_DESDE}
    />
  );
}
