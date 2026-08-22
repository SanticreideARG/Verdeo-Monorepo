import { put } from '@vercel/blob';

/**
 * Avatar photos behind an adapter, same as every other external provider in this codebase
 * (geocoding, AI, WhatsApp): app.ts only knows the `AvatarStorageEngine` interface, never this
 * concrete class, so the product keeps working (avatar upload just answers 503) if Blob is
 * unreachable or unconfigured.
 */
export interface AvatarStorage {
  upload(userId: string, bytes: Uint8Array, contentType: string): Promise<{ url: string }>;
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const AVATAR_ALLOWED_CONTENT_TYPES = Object.keys(EXTENSION_BY_CONTENT_TYPE);
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export class VercelBlobAvatarStorage implements AvatarStorage {
  public constructor(
    private readonly token: string,
    private readonly storeId?: string | undefined,
  ) {}

  public async upload(
    userId: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<{ url: string }> {
    const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
    if (!extension) throw new Error(`Unsupported avatar content type: ${contentType}`);
    // Fixed pathname (no random suffix) + allowOverwrite: re-uploading replaces the same file
    // instead of accumulating orphaned blobs from every previous photo.
    const result = await put(`avatars/${userId}.${extension}`, Buffer.from(bytes), {
      access: 'public',
      allowOverwrite: true,
      contentType,
      ...(this.storeId ? { storeId: this.storeId } : {}),
      token: this.token,
    });
    return { url: result.url };
  }
}
