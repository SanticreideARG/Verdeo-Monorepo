export interface UserDirectoryItem {
  avatarUrl: string | null;
  createdAt: Date;
  displayName: string;
  id: string;
  // What the person is, so a directory can group by it rather than showing one flat list. Names
  // only — the permissions behind a role are the admin detail view's business, not the list's.
  roles: readonly { displayName: string; key: string }[];
  status: string;
}

// The self-profile view additionally carries the user's own email — never included in the plain
// directory listing (UserDirectoryItem), which other people's sessions can read.
export interface UserProfile extends UserDirectoryItem {
  email: string | null;
}

export interface UserDirectoryPage {
  items: readonly UserDirectoryItem[];
  nextCursor: string | null;
}

export interface UserProfileUpdateInput {
  avatarUrl?: string;
  displayName?: string;
}

export interface UserDirectoryRepository {
  findById(id: string): Promise<UserDirectoryItem | null>;
  findProfileById(id: string): Promise<UserProfile | null>;
  listAfter(afterId: string | undefined, limit: number): Promise<readonly UserDirectoryItem[]>;
  updateProfile(id: string, input: UserProfileUpdateInput): Promise<UserProfile>;
}

export class UserDirectoryService {
  public constructor(private readonly users: UserDirectoryRepository) {}

  public async findById(id: string): Promise<UserDirectoryItem | null> {
    return this.users.findById(id);
  }

  public async findProfileById(id: string): Promise<UserProfile | null> {
    return this.users.findProfileById(id);
  }

  public async updateProfile(id: string, input: UserProfileUpdateInput): Promise<UserProfile> {
    return this.users.updateProfile(id, input);
  }

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
