import { apiRequest } from './api.js';

/** Todas las cuentas, pidiendo una página tras otra: cortar en cien dejaría cuentas sin ver. */
export async function fetchAllUsers<User>(): Promise<User[] | null> {
  const users: User[] = [];
  let cursor: string | null = null;
  do {
    const query: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const response = await apiRequest(`/api/v1/users?limit=100${query}`);
    if (!response.ok) return null;
    const page = (await response.json()) as { items: User[]; nextCursor?: string | null };
    users.push(...page.items);
    cursor = page.nextCursor ?? null;
  } while (cursor);
  return users;
}
