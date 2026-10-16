/**
 * El Panel de control: todo lo que se configura o se audita, agrupado por a qué pregunta contesta.
 *
 * Es **la única fuente** de las secciones: de acá salen el menú lateral de escritorio, el inicio del
 * panel con sus tarjetas y su buscador, y la hoja "Cambiar de sección" del teléfono. Antes el
 * catálogo vivía dentro del componente del menú y cada vista nueva habría necesitado su propia
 * copia; ahora una sección nueva se agrega acá, con su descripción y sus palabras clave, y aparece
 * en todos lados.
 *
 * Los grupos separan por pregunta y no por tecnología: qué y dónde vendemos, quién trabaja acá, con
 * qué nos conectamos, el sitio público, qué queda registrado, y lo que es preferencia de uno mismo.
 * Cada sección sigue siendo su propia ruta, con su propio permiso (`permission`); entrar al panel
 * pide además `settings.access` (ver `SettingsGate`).
 */
export interface SettingsSection {
  /** Una línea que dice qué se hace ahí, para el inicio y el buscador. */
  description: string;
  href: string;
  /** Otras palabras con las que alguien buscaría esto: el servicio, el término técnico, el apodo. */
  keywords: readonly string[];
  label: string;
  /** Sin permiso: la ve cualquiera que pueda entrar (p. ej. su propia apariencia). */
  permission?: string;
}

export interface SettingsGroup {
  label: string;
  sections: readonly SettingsSection[];
}

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    label: 'Operación',
    sections: [
      {
        description: 'Las ciudades en las que operás y las zonas de cada una.',
        href: '/app/ajustes/zonas',
        keywords: ['ciudad', 'operación', 'sede', 'zona', 'provincia', 'barrio', 'radio'],
        label: 'Zonas geográficas',
        permission: 'sites.read',
      },
      {
        description: 'Qué días de la semana reparte cada ciudad.',
        href: '/app/ajustes/reparto',
        keywords: ['reparto', 'entrega', 'envío', 'días', 'semana', 'calendario'],
        label: 'Días de reparto',
        permission: 'sites.read',
      },
      {
        description: 'Cómo se arma y se cobra el menú personalizado en cada ciudad.',
        href: '/app/ajustes/menu',
        keywords: ['intuitivo', 'menú', 'precio', 'platos', 'personalizado'],
        label: 'Menú personalizado',
        permission: 'production.read',
      },
      {
        description: 'Con qué se puede pagar: efectivo, transferencia y lo que agregues.',
        href: '/app/ajustes/pagos',
        keywords: ['pago', 'cobro', 'efectivo', 'transferencia', 'tarjeta', 'mercado pago'],
        label: 'Métodos de pago',
        permission: 'payments.read',
      },
    ],
  },
  {
    label: 'Equipo',
    sections: [
      {
        description: 'Quién usa el sistema, con qué rol y en qué ciudad.',
        href: '/app/usuarios',
        keywords: ['usuario', 'persona', 'rol', 'permiso', 'alta', 'contraseña', 'operador'],
        label: 'Usuarios',
        permission: 'users.read',
      },
    ],
  },
  {
    label: 'Integraciones',
    sections: [
      {
        description: 'El remitente de los correos del sistema y cómo probar el envío.',
        href: '/app/ajustes/correo',
        keywords: ['correo', 'mail', 'email', 'resend', 'remitente', 'envío'],
        label: 'Correo',
        permission: 'ai.providers.manage',
      },
      {
        description: 'Los números de WhatsApp conectados al sistema.',
        href: '/app/ajustes/mensajes',
        keywords: ['whatsapp', 'mensajes', 'número', 'cuenta', 'meta'],
        label: 'Cuentas de WhatsApp',
        permission: 'messaging.accounts.manage',
      },
      {
        description: 'Los textos de aviso que se mandan a los clientes, con sus datos.',
        href: '/app/ajustes/plantillas',
        keywords: ['plantilla', 'aviso', 'mensaje', 'texto', 'guardado'],
        label: 'Mensajes guardados',
        permission: 'messages.templates.manage',
      },
      {
        description: 'Quién puede escribirle a quién en el chat interno.',
        href: '/app/ajustes/chat',
        keywords: ['chat', 'equipo', 'conversación', 'enlace', 'quién habla'],
        label: 'Enlaces de chat',
        permission: 'chat.links.manage',
      },
      {
        description: 'Proveedores de inteligencia artificial, modelos y presupuestos.',
        href: '/app/ia',
        keywords: ['ia', 'inteligencia artificial', 'modelo', 'openai', 'prompt', 'presupuesto'],
        label: 'IA y plantillas',
        permission: 'ai.providers.manage',
      },
    ],
  },
  {
    // Lo que se ve en el sitio público. Se edita cada tanto, no todos los días: por eso no va en el
    // menú lateral.
    label: 'Sitio web',
    sections: [
      {
        description: 'Las páginas del sitio público: textos, imágenes y publicación.',
        href: '/app/contenidos',
        keywords: ['contenido', 'página', 'sitio', 'landing', 'inicio', 'publicar', 'cms'],
        label: 'Contenidos',
        permission: 'cms.read',
      },
      {
        description: 'El asistente de la página principal: qué dice y cómo se comporta.',
        href: '/app/ajustes/asistente',
        keywords: ['asistente', 'chatbot', 'landing', 'sitio', 'web', 'lechuza'],
        label: 'Asistente de la web',
        permission: 'cms.read',
      },
    ],
  },
  {
    label: 'Sistema',
    sections: [
      {
        description: 'Qué se hizo en el sistema, quién lo hizo y cuándo.',
        href: '/app/auditoria',
        keywords: ['auditoría', 'registro', 'historial', 'log', 'quién', 'cambios'],
        label: 'Auditoría',
        permission: 'audit.read',
      },
      {
        description: 'Si todo funciona: la base de datos, los errores y el correo entrante.',
        href: '/app/sistema',
        keywords: ['estado', 'salud', 'errores', 'base de datos', 'correo entrante', 'sistema'],
        label: 'Estado del sistema',
        permission: 'audit.read',
      },
      {
        description: 'Cómo se buscan y ubican los domicilios: radio, confianza y buscadores.',
        href: '/app/ajustes/direcciones',
        keywords: ['dirección', 'domicilio', 'ubicación', 'mapa', 'geocodificación', 'radio'],
        label: 'Direcciones',
        permission: 'sites.read',
      },
      {
        // El permiso no viene con ningún rol: la descarga se lleva los datos de todos los clientes.
        description: 'Descargar una copia de todos los datos y restaurarla.',
        href: '/app/respaldos',
        keywords: ['respaldo', 'backup', 'copia', 'descargar', 'restaurar', 'datos'],
        label: 'Respaldos',
        permission: 'backups.manage',
      },
    ],
  },
  {
    label: 'Personal',
    // Sin permiso: es la preferencia de uno mismo, no configuración del sistema.
    sections: [
      {
        description: 'El tema, la tipografía y el tamaño de letra de tu cuenta.',
        href: '/app/ajustes/apariencia',
        keywords: ['apariencia', 'tema', 'oscuro', 'claro', 'letra', 'fuente', 'tamaño', 'color'],
        label: 'Apariencia',
      },
    ],
  },
];

/** Todas las secciones, en el orden del catálogo. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = SETTINGS_GROUPS.flatMap(
  (group) => group.sections,
);

/** La entrada del panel: en el teléfono, el inicio con todas las secciones. */
export const SETTINGS_HOME = '/app/ajustes';

/** Si una ruta es una sección del panel (o su inicio): el menú lateral resalta "Panel de control". */
export function isSettingsPath(pathname: string): boolean {
  return (
    pathname === SETTINGS_HOME || SETTINGS_SECTIONS.some((section) => section.href === pathname)
  );
}

/** Lo que cada persona puede ver: sin permiso para una sección, la sección no aparece. */
export function visibleSettingsGroups(
  permissions: readonly string[],
  canEnter: boolean,
): SettingsGroup[] {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    sections: group.sections.filter(
      (section) => !section.permission || (canEnter && permissions.includes(section.permission)),
    ),
  })).filter((group) => group.sections.length > 0);
}

/** Minúsculas y sin tildes: "correo" tiene que encontrar "Correo" y "automatización" a "automatizacion". */
function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Las secciones que coinciden con lo que se escribió.
 *
 * Cada palabra escrita tiene que aparecer en el nombre, en la descripción o en las palabras clave de
 * la sección (todas, no alguna): "correo resend" encuentra Correo, "correo ballena" no encuentra
 * nada. Sin nada escrito, trae todo.
 */
export function searchSettings(groups: readonly SettingsGroup[], query: string): SettingsGroup[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...groups];
  return groups
    .map((group) => ({
      ...group,
      sections: group.sections.filter((section) => {
        const haystack = plain(
          [section.label, section.description, group.label, ...section.keywords].join(' '),
        );
        return words.every((word) => haystack.includes(word));
      }),
    }))
    .filter((group) => group.sections.length > 0);
}
