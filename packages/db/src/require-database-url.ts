/**
 * La URL de la base, o un error que dice cómo pasarla.
 *
 * Todos los scripts de mantenimiento la piden por variable de entorno y ninguno la lee de un
 * archivo: contra qué base corre algo que borra roles o aplica migraciones tiene que decirlo quien
 * lo corre, en el mismo renglón, y no un `.env` que puede estar apuntando a otro lado.
 *
 * Lo que sí es culpa nuestra es el mensaje. Decía "DATABASE_URL is required" y nada más, así que la
 * respuesta a "¿y cómo se la paso?" quedaba afuera del error, en una conversación o en un documento.
 * Tres veces seguidas alguien corrió un script sin la variable, leyó el error y volvió a correrlo
 * igual. Un error que no dice qué hacer con él es la mitad de un error.
 */
export function requireDatabaseUrl(script: string): string {
  const url = process.env['DATABASE_URL'];
  if (url) return url;

  throw new Error(
    [
      'Falta DATABASE_URL: hay que decir contra qué base corre esto.',
      '',
      'Contra la base de producción, desde la raíz del repositorio:',
      `  DATABASE_URL="$(grep '^DATABASE_URL_PROD=' .env | sed 's/^DATABASE_URL_PROD=//' | tr -d '"')" pnpm ${script}`,
      '',
      'Esa línea se copia tal cual: lo que está entre comillas simples es el nombre de la',
      'variable que busca dentro del .env, no un lugar para pegar la URL.',
      '',
      'Contra otra base, pasándola a mano:',
      `  DATABASE_URL="postgresql://usuario:clave@host/base" pnpm ${script}`,
    ].join('\n'),
  );
}
