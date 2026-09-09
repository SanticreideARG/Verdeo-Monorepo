import { LegalPage, type LegalSection } from '../components/LegalPage.js';

/**
 * Datos de contacto e identificación del responsable.
 *
 * Están acá arriba y no repartidos por el texto porque cambian juntos y casi nunca: si mañana
 * cambia el correo de contacto, se cambia una vez y no en siete párrafos.
 *
 * OJO: `CUIT` y `DOMICILIO` tienen que ser los reales antes de publicar. La Ley 25.326 exige
 * identificar al responsable de la base de datos, y Google pide que la política identifique a quien
 * opera la aplicación; un dato inventado ahí es peor que no tener la página.
 */
const RESPONSABLE = {
  correo: 'privacidad@verdeo.com.ar',
  cuit: '[CUIT a completar]',
  domicilio: '[Domicilio legal a completar]',
  nombre: 'Verdeo SCA',
  sitio: 'verdeo.com.ar',
};

/**
 * Fecha de vigencia.
 *
 * Se sube a mano al cambiar el texto, y con intención: es la fecha desde la que rige esta versión,
 * no la del último retoque de formato. El historial de git dice qué decía cada día.
 */
const VIGENTE_DESDE = '2026-09-09';

const SECTIONS: readonly LegalSection[] = [
  {
    body: [
      `${RESPONSABLE.nombre} (CUIT ${RESPONSABLE.cuit}, con domicilio en ${RESPONSABLE.domicilio}) es responsable del tratamiento de los datos personales que se describen en esta política, en los términos de la Ley 25.326 de Protección de los Datos Personales de la República Argentina.`,
      `Esta política se aplica al sitio ${RESPONSABLE.sitio}, al formulario público de pedidos, al seguimiento de pedidos, a la cuenta del cliente, a las encuestas y al panel interno que usa el equipo de Verdeo para operar. No se aplica a sitios de terceros a los que se pueda llegar desde acá.`,
      'Consultas sobre esta política, o sobre los datos de una persona en particular, se responden en ' +
        RESPONSABLE.correo +
        '.',
    ],
    id: 'responsable',
    title: 'Quién trata los datos y a qué se aplica esto',
  },
  {
    body: [
      'Se recogen distintos datos según quién sea la persona y para qué use el servicio.',
      'Si pedís comida:',
      [
        'Nombre y apellido, para identificar el pedido y la vianda.',
        'Teléfono, WhatsApp y correo electrónico, para coordinar el pedido y la entrega.',
        'Domicilio de entrega, la zona a la que corresponde y, si la compartís o si se geocodifica, su ubicación aproximada en el mapa; también las indicaciones de acceso que escribas.',
        'El detalle de lo que pediste, la fecha de entrega, el medio de pago esperado y el estado del pedido a lo largo de la semana.',
        'Las preferencias o restricciones alimentarias que nos informes, cuando decidas informarlas.',
        'Las respuestas que envíes a una encuesta, si respondés alguna.',
      ],
      'Las restricciones alimentarias pueden revelar información sobre tu salud. Son opcionales: se cargan sólo si vos las informás, se usan únicamente para preparar tu vianda y para evitar un ingrediente, y se tratan con el mismo cuidado que el resto de tus datos. Si preferís no dejarlas registradas, decilo y se eliminan.',
      'Si formás parte del equipo de Verdeo y entrás al panel interno:',
      [
        'Tu nombre, tu correo electrónico institucional y los roles y permisos que tengas asignados.',
        'La ciudad o zona en la que operás.',
        'Un registro de auditoría de las acciones que hacés sobre pedidos, clientes, menús y configuraciones: qué se hizo, cuándo y desde qué sesión. Es lo que permite reconstruir qué pasó con un pedido.',
        'Si iniciás sesión con Google, lo que se detalla en el punto siguiente.',
      ],
      'En todos los casos, y por el sólo hecho de usar el sitio:',
      [
        'Registros técnicos del servidor: dirección IP, momento de la solicitud, ruta pedida y un identificador de la solicitud, que sirven para diagnosticar errores y detectar abuso.',
        'Una cookie de sesión, y preferencias de lectura guardadas en tu propio navegador. Se detallan más abajo.',
      ],
    ],
    id: 'datos',
    title: 'Qué datos se recogen',
  },
  {
    body: [
      'El panel interno de Verdeo permite iniciar sesión con una cuenta de Google. Es una opción para el personal de Verdeo: no hay registro público con Google, y una cuenta de Google no da acceso por sí sola. Sólo puede entrar quien ya tiene un usuario interno activo, creado previamente por un administrador.',
      'Cuando iniciás sesión con Google, Verdeo recibe de tu cuenta de Google, a través de Supabase Auth:',
      [
        'Tu dirección de correo electrónico y si está verificada.',
        'Tu nombre y tu foto de perfil, si los tenés públicos en esa cuenta.',
        'El identificador único que Google asigna a tu cuenta.',
      ],
      'Verdeo solicita únicamente los permisos básicos de identificación (openid, correo electrónico y perfil). No pide ni recibe acceso a tu Gmail, a tus contactos, a tu Drive, a tu calendario ni a ningún otro dato de tu cuenta de Google.',
      'Esa información se usa con un solo fin: verificar tu identidad y vincularla al usuario interno que ya existe en Verdeo, para poder abrir una sesión. Se guarda el identificador de Google y el correo asociado, para reconocerte la próxima vez.',
      'Los datos obtenidos de Google no se usan para publicidad, no se venden, no se ceden a terceros con fines comerciales, no se usan para elaborar perfiles ni para entrenar modelos de inteligencia artificial. Sólo se comparten con los proveedores que operan la infraestructura del servicio, listados más abajo, y con quien la ley obligue.',
      'Podés desvincular tu cuenta de Google en cualquier momento pidiéndolo a ' +
        RESPONSABLE.correo +
        ', y revocar el acceso desde la configuración de tu cuenta de Google en myaccount.google.com/permissions. Desvincularla no elimina tu usuario interno de Verdeo: eso se pide por separado.',
    ],
    id: 'google',
    title: 'Datos obtenidos de Google al iniciar sesión',
  },
  {
    body: [
      'Los datos se usan para:',
      [
        'Tomar, preparar, facturar y entregar los pedidos, y coordinar la entrega con vos.',
        'Organizar la producción semanal de la cocina y armar las hojas de reparto.',
        'Responder consultas y resolver problemas con un pedido.',
        'Enviar mensajes operativos sobre tu pedido —confirmación, salida del reparto, llegada— por WhatsApp o correo electrónico.',
        'Autenticar al personal, controlar qué puede hacer cada quien y auditar lo que se hace en el sistema.',
        'Producir estadísticas agregadas de venta y demanda, que no identifican personas.',
        'Cumplir obligaciones legales, contables e impositivas.',
      ],
      'No se toman decisiones automatizadas que produzcan efectos jurídicos sobre las personas, ni se elaboran perfiles con fines publicitarios.',
      'No se envían comunicaciones comerciales a quien no las haya pedido. Si en algún momento se ofreciera una lista de novedades, será con consentimiento expreso y con un modo simple de darse de baja en cada mensaje.',
    ],
    id: 'finalidad',
    title: 'Para qué se usan',
  },
  {
    body: [
      'Verdeo no vende datos personales ni los cede a terceros para que los usen por su cuenta.',
      'Para poder funcionar, el servicio se apoya en proveedores que tratan datos por cuenta y orden de Verdeo, con instrucciones y sólo para lo que se detalla:',
      [
        'Vercel Inc. — alojamiento del sitio y de la API, y almacenamiento de las imágenes que se suben al panel.',
        'Neon Inc. — base de datos donde se guarda la información operativa.',
        'Supabase Inc. — verificación de la identidad al iniciar sesión con Google.',
        'Google LLC — autenticación con cuenta de Google, y geocodificación de domicilios para ubicarlos en el mapa de reparto.',
        'Resend Inc. — envío de correos electrónicos transaccionales.',
        'Meta Platforms Inc. — envío y recepción de mensajes de WhatsApp, cuando el pedido se coordina por ese canal.',
      ],
      'Algunos de esos proveedores están radicados fuera de la Argentina, de modo que los datos pueden almacenarse o procesarse en el exterior. Esa transferencia internacional resulta necesaria para la ejecución del contrato y para la prestación del servicio que solicitás, en los términos del artículo 12 de la Ley 25.326.',
      'Además, los datos pueden compartirse con autoridades públicas cuando una norma o una orden judicial lo exija.',
      'Si en el futuro se incorporan proveedores de inteligencia artificial para asistir la carga de pedidos, se hará con acuerdos que prohíban el uso de los datos para entrenar modelos, y esta política se actualizará antes de activarlos.',
    ],
    id: 'terceros',
    title: 'Con quién se comparten',
  },
  {
    body: [
      'Los datos se conservan mientras exista la relación —tu cuenta, tus pedidos, tu vínculo laboral con Verdeo— y después, mientras haya una razón para conservarlos: obligaciones contables e impositivas, plazos de prescripción, o el deber de poder demostrar qué se hizo y por qué.',
      'Como referencia:',
      [
        'Pedidos, comprobantes y datos de facturación: diez años, por las obligaciones contables e impositivas aplicables.',
        'Datos de contacto y domicilios de clientes: mientras la cuenta esté activa, y hasta que se pida su eliminación.',
        'Registros de auditoría y sesiones del personal: mientras sean necesarios para la trazabilidad de las operaciones.',
        'Registros técnicos del servidor: períodos cortos, los que necesita el diagnóstico de errores.',
      ],
      'Un cliente que pide ser eliminado y no tiene pedidos asociados se borra por completo. Si tiene pedidos, su ficha se archiva en lugar de borrarse, porque eliminarla destruiría el historial de venta que la ley obliga a conservar; en ese caso deja de usarse para contactarte.',
    ],
    id: 'conservacion',
    title: 'Cuánto tiempo se guardan',
  },
  {
    body: [
      'Como titular de los datos podés ejercer los derechos de acceso, rectificación, actualización y supresión, escribiendo a ' +
        RESPONSABLE.correo +
        '. También podés oponerte a determinados tratamientos y pedir que se limite el uso de tus datos.',
      'El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley 25.326.',
      'La Agencia de Acceso a la Información Pública, en su carácter de órgano de control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.',
      'Para poder responder, se pedirá una verificación razonable de identidad: nadie más que vos puede pedir tus datos.',
    ],
    id: 'derechos',
    title: 'Tus derechos sobre tus datos',
  },
  {
    body: [
      'El sitio usa una cookie propia para mantener la sesión iniciada. Es estrictamente necesaria: sin ella no se puede usar el panel ni la cuenta del cliente. No es una cookie publicitaria, no se comparte con terceros y no sirve para seguirte por otros sitios.',
      'Además, el navegador guarda localmente algunas preferencias de lectura —qué columnas se ven en una tabla, si se ocultan los apellidos, la ciudad seleccionada, un borrador de formulario a medio completar—. Esa información no sale de tu dispositivo y podés borrarla vaciando los datos del sitio en tu navegador.',
      'No se utilizan cookies de publicidad ni de seguimiento de terceros.',
    ],
    id: 'cookies',
    title: 'Cookies y almacenamiento en tu navegador',
  },
  {
    body: [
      'Se aplican medidas técnicas y organizativas razonables para proteger los datos: tráfico cifrado, contraseñas almacenadas con funciones de hash, sesiones con cookies inaccesibles desde JavaScript, control de acceso por roles y permisos, registro de auditoría de las operaciones sensibles y minimización de los datos que se muestran a cada persona según su función.',
      'Ninguna medida es infalible. Si ocurriera un incidente de seguridad que afecte tus datos personales, se te informará y se dará intervención a la autoridad de control cuando corresponda.',
    ],
    id: 'seguridad',
    title: 'Seguridad',
  },
  {
    body: [
      'El servicio está dirigido a personas mayores de 18 años. No se recogen deliberadamente datos de menores de edad. Si detectamos que se cargaron datos de un menor sin autorización de quien ejerce su responsabilidad parental, se eliminan.',
    ],
    id: 'menores',
    title: 'Menores de edad',
  },
  {
    body: [
      'Esta política puede actualizarse cuando cambien el servicio, los proveedores o la normativa aplicable. La fecha de vigencia que figura al principio indica desde cuándo rige la versión que estás leyendo.',
      'Si el cambio es sustancial —una finalidad nueva, un proveedor nuevo que reciba datos personales—, se avisará por los canales habituales antes de aplicarlo.',
      `Consultas, reclamos y ejercicio de derechos: ${RESPONSABLE.correo}.`,
    ],
    id: 'cambios',
    title: 'Cambios y contacto',
  },
];

/**
 * "/privacidad": la política de privacidad pública.
 *
 * Existe por dos razones a la vez. La primera es legal: la Ley 25.326 obliga a informar qué datos se
 * tratan, para qué y quién es responsable. La segunda es operativa: Google exige una política
 * accesible sin sesión, en el mismo dominio de la aplicación, para verificar la pantalla de
 * consentimiento de OAuth, y revisa que describa qué se hace con los datos que entrega Google.
 *
 * El punto sobre Google está redactado para responder exactamente eso: qué se recibe, para qué se
 * usa, con quién se comparte, cuánto se guarda y cómo se revoca. Es la sección que el revisor va a
 * buscar.
 */
export function PrivacyPolicyPage() {
  return (
    <LegalPage
      intro={[
        'Esta política explica qué datos personales trata Verdeo, con qué finalidad, con quién se comparten y qué podés hacer al respecto. Está escrita para que se entienda, no para cubrirnos: si algo no queda claro, escribinos y lo aclaramos.',
      ]}
      sections={SECTIONS}
      subtitle="Verdeo SCA"
      title="Política de privacidad"
      updatedAt={VIGENTE_DESDE}
    />
  );
}
