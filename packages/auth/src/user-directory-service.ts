export interface UserDirectoryItem {
  createdAt: Date;
  displayName: string;
  id: string;
  status: string;
}

export interface UserDirectoryPage {
  items: readonly UserDirectoryItem[];
  nextCursor: string | null;
}

export interface UserDirectoryRepository {
  listAfter(afterId: string | undefined, limit: number): Promise<readonly UserDirectoryItem[]>;
}

export class UserDirectoryService {
  public constructor(private readonly users: UserDirectoryRepository) {}

  public async list(afterId: string | undefined, limit: number): Promise<UserDirectoryPage> {
    const rows = await this.users.listAfter(afterId, limit + 1);
    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;

    return {
      items,
      nextCursor: hasNextPage ? (items.at(-1)?.id ?? null) : null,
    };
  }
}
