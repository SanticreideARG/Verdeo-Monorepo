import { chatInitial } from '../lib/chat.js';

/**
 * La cara de un compañero en el chat.
 *
 * La lista de contactos tenía el punto de presencia y el nombre, nada más: seis renglones de texto
 * casi idénticos que hay que leer uno por uno. Con la foto —o la inicial de quien no cargó ninguna—
 * se reconoce a quién se le está por escribir sin leer.
 *
 * La presencia no se va: pasa a ser un punto sobre la burbuja, que es donde se la busca.
 */
export function ChatAvatar({
  avatarUrl,
  displayName,
  presence,
}: {
  avatarUrl?: string | null;
  displayName: string;
  presence?: string | undefined;
}) {
  return (
    <span className="chat-avatar">
      {avatarUrl ? <img alt="" src={avatarUrl} /> : <b>{chatInitial(displayName)}</b>}
      {presence ? <i className={`chat-avatar-dot is-${presence}`} /> : null}
    </span>
  );
}
