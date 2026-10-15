import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { PostgresFeedService } from './repositories/postgres-feed-service.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const DUENO = 'b0000000-0000-4000-8000-000000000001';
const ANA = 'b0000000-0000-4000-8000-000000000002';
const BETO = 'b0000000-0000-4000-8000-000000000003';
const CLIENTA = 'b0000000-0000-4000-8000-000000000004';
const CABA = 'a0000000-0000-4000-8000-000000000001';
const BARILOCHE = 'a0000000-0000-4000-8000-000000000002';

/** El dueño modera; Ana y Beto son del equipo (feed.post por su rol); la clienta no. */
const seed = `
  insert into users (id, display_name) values
    ('${DUENO}', 'Dueño'), ('${ANA}', 'Ana'), ('${BETO}', 'Beto'), ('${CLIENTA}', 'Clienta');
  insert into operating_sites (id, slug, display_name, order_prefix) values
    ('${CABA}', 'caba', 'CABA', 'CABA'), ('${BARILOCHE}', 'bariloche', 'Bariloche', 'BRC');
  insert into permissions (key, group_name, description) values ('feed.post', 'general', 'Publicar');
  insert into roles (id, key, name) values
    ('c0000000-0000-4000-8000-000000000001', 'operador', 'Operador');
  insert into role_permissions (role_id, permission_id)
    select 'c0000000-0000-4000-8000-000000000001', id from permissions where key = 'feed.post';
  insert into user_roles (user_id, role_id) values
    ('${DUENO}', 'c0000000-0000-4000-8000-000000000001'),
    ('${ANA}', 'c0000000-0000-4000-8000-000000000001'),
    ('${BETO}', 'c0000000-0000-4000-8000-000000000001');
`;

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function service() {
  const client = new PGlite();
  await client.waitReady;
  close = () => client.close();
  for (const file of readdirSync(migrationsFolder)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    for (const statement of readFileSync(join(migrationsFolder, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !/^(--[^\n]*\n?)*$/.test(part))) {
      await client.exec(statement);
    }
  }
  await client.exec(seed);
  return new PostgresFeedService(drizzle(client, { schema }) as unknown as Database);
}

const as = (userId: string, canModerate = false) => ({
  actorUserId: userId,
  canModerate,
  correlationId: 'corr',
  requestId: 'req',
  source: 'test',
});

const inAWeek = () => new Date(Date.now() + 7 * 86_400_000);

describe('PostgresFeedService', () => {
  it('cualquiera del equipo publica; las fijadas van primero', async () => {
    const feed = await service();
    const fijada = await feed.createPost(
      {
        body: 'Desde el lunes el corte es el jueves a las 20.',
        pinnedUntil: inAWeek(),
        tag: 'cambio',
      },
      as(DUENO, true),
    );
    await feed.createPost({ body: 'Llegó el pedido de verduras.', tag: 'aviso' }, as(ANA));

    const posts = await feed.listPosts({ viewerUserId: BETO });
    expect(posts.map((post) => post.id)[0]).toBe(fijada.id);
    expect(posts[0]).toMatchObject({ authorDisplayName: 'Dueño', needsAcknowledgement: true });
    expect(posts[1]).toMatchObject({ authorDisplayName: 'Ana', needsAcknowledgement: false });
  });

  it('fijar y publicar novedades del sistema es de quien modera', async () => {
    const feed = await service();
    await expect(
      feed.createPost({ body: 'x', pinnedUntil: inAWeek(), tag: 'aviso' }, as(ANA)),
    ).rejects.toThrow('Sólo quien administra');
    await expect(feed.createPost({ body: 'x', tag: 'novedad' }, as(ANA))).rejects.toThrow(
      'novedades',
    );
    const post = await feed.createPost({ body: 'Hola', tag: 'aviso' }, as(ANA));
    await expect(feed.setPinned(post.id, inAWeek(), as(ANA))).rejects.toThrow('Sólo quien');
    await feed.setPinned(post.id, inAWeek(), as(DUENO, true));
  });

  it('cada uno cambia lo suyo; quien modera, cualquiera; borrar no deja verla', async () => {
    const feed = await service();
    const post = await feed.createPost({ body: 'Hola', tag: 'aviso' }, as(ANA));

    await expect(feed.updatePost(post.id, { body: 'Chau' }, as(BETO))).rejects.toThrow(
      'tus publicaciones',
    );
    await feed.updatePost(post.id, { body: 'Hola, equipo' }, as(ANA));
    const [edited] = await feed.listPosts({ viewerUserId: ANA });
    expect(edited?.body).toBe('Hola, equipo');
    expect(edited?.editedAt).not.toBeNull();

    await feed.deletePost(post.id, as(DUENO, true));
    expect(await feed.listPosts({ viewerUserId: ANA })).toEqual([]);
  });

  it('"lo leí": quién lo vio, quién confirmó y quién falta', async () => {
    const feed = await service();
    const post = await feed.createPost({ body: 'Cambia el corte', tag: 'cambio' }, as(DUENO, true));

    expect(await feed.unreadCount(ANA)).toBe(1);
    await feed.markRead(post.id, ANA, false);
    expect(await feed.unreadCount(ANA)).toBe(0);
    await feed.markRead(post.id, ANA, true);
    // Volver a abrirla no borra la confirmación.
    await feed.markRead(post.id, ANA, false);

    const [seen] = await feed.listPosts({ viewerUserId: ANA });
    expect(seen?.myAcknowledgedAt).not.toBeNull();
    // El autor la cuenta como leída y confirmada.
    expect(seen).toMatchObject({ acknowledgedCount: 2, readCount: 2 });

    const readers = await feed.readers(post.id);
    expect(readers.reads.map((read) => read.displayName).sort()).toEqual(['Ana', 'Dueño']);
    // Falta Beto; la clienta no es del equipo.
    expect(readers.pending).toEqual([{ displayName: 'Beto', userId: BETO }]);
  });

  it('con una ciudad en el alcance, las de esa ciudad y las de todas', async () => {
    const feed = await service();
    await feed.createPost({ body: 'Para todos', tag: 'aviso' }, as(ANA));
    await feed.createPost({ body: 'Sólo CABA', operatingSiteId: CABA, tag: 'aviso' }, as(ANA));
    await feed.createPost(
      { body: 'Sólo Bariloche', operatingSiteId: BARILOCHE, tag: 'aviso' },
      as(ANA),
    );

    const caba = await feed.listPosts({ operatingSiteId: CABA, viewerUserId: BETO });
    expect(caba.map((post) => post.body).sort()).toEqual(['Para todos', 'Sólo CABA']);
    expect(await feed.listPosts({ viewerUserId: BETO })).toHaveLength(3);
  });
  it('respuestas y un 👍 por persona', async () => {
    const feed = await service();
    const post = await feed.createPost({ body: 'Llegó la verdura', tag: 'aviso' }, as(ANA));

    const reply = await feed.addReply(post.id, 'Gracias', as(BETO));
    await feed.addReply(post.id, 'Genial', as(DUENO, true));
    await expect(feed.deleteReply(reply.id, as(ANA))).rejects.toThrow('tus respuestas');
    await feed.deleteReply(reply.id, as(BETO));
    expect((await feed.listReplies(post.id)).map((item) => item.body)).toEqual(['Genial']);

    await feed.setReaction(post.id, BETO, true);
    await feed.setReaction(post.id, BETO, true);
    await feed.setReaction(post.id, ANA, true);
    await feed.setReaction(post.id, ANA, false);
    const [seen] = await feed.listPosts({ viewerUserId: BETO });
    expect(seen).toMatchObject({ reactedByMe: true, reactionCount: 1, replyCount: 1 });
  });

  it('esconder una tarjeta es de cada uno y vence', async () => {
    const feed = await service();
    await feed.setCardHidden(ANA, 'duplicados:3', new Date(Date.now() + 86_400_000));
    await feed.setCardHidden(ANA, 'correos:1', new Date(Date.now() - 1000));

    expect(await feed.hiddenCards(ANA)).toEqual(['duplicados:3']);
    expect(await feed.hiddenCards(BETO)).toEqual([]);

    await feed.setCardHidden(ANA, 'duplicados:3', null);
    expect(await feed.hiddenCards(ANA)).toEqual([]);
  });
});
