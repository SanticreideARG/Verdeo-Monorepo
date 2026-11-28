import { useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { offerableTags, type AppliedTag, type Tag } from '../lib/tags.js';
import { showToast } from '../lib/toast.js';

/** Una pill de tag, con su color (2026-11-28). */
export function TagPill({
  onRemove,
  tag,
}: {
  onRemove?: (() => void) | undefined;
  tag: AppliedTag;
}) {
  return (
    <span
      className="tag-pill"
      data-color={tag.color}
      title={tag.fromCustomer ? `${tag.name} (del cliente)` : tag.name}
    >
      {tag.name}
      {tag.fromCustomer ? <small> · cliente</small> : null}
      {onRemove ? (
        <button aria-label={`Sacar ${tag.name}`} onClick={onRemove} type="button">
          ×
        </button>
      ) : null}
    </span>
  );
}

/** Las pills en fila, sin editar: listas y planillas en pantalla. */
export function TagPills({ tags }: { tags: readonly AppliedTag[] | undefined }) {
  if (!tags || tags.length === 0) return null;
  return (
    <span className="tag-pills">
      {tags.map((tag) => (
        <TagPill key={tag.id} tag={tag} />
      ))}
    </span>
  );
}

/**
 * Las pills de un cliente o de un pedido, con "+ Tag" y la × de cada una. En un pedido, las que
 * vienen del cliente se ven pero se sacan desde el cliente.
 */
export function TagEditor({
  allTags,
  canEdit,
  onChange,
  siteId = null,
  tags,
  target,
}: {
  allTags: readonly Tag[];
  canEdit: boolean;
  onChange: (tags: AppliedTag[]) => void;
  siteId?: string | null;
  tags: readonly AppliedTag[];
  target: { customerId: string } | { orderId: string };
}) {
  const [saving, setSaving] = useState(false);
  const isOrder = 'orderId' in target;
  const own = tags.filter((tag) => !tag.fromCustomer).map((tag) => tag.id);
  const present = new Set(tags.map((tag) => tag.id));
  const choices = offerableTags(allTags, isOrder ? 'order' : 'customer', siteId).filter(
    (tag) => !present.has(tag.id),
  );

  async function save(tagIds: string[]) {
    setSaving(true);
    const response = await apiRequest(
      isOrder
        ? `/api/v1/orders/${target.orderId}/tags`
        : `/api/v1/customers/${target.customerId}/tags`,
      { body: JSON.stringify({ tagIds }), method: 'PUT' },
    );
    setSaving(false);
    if (!response.ok) {
      showToast(await errorMessage(response), 'error');
      return;
    }
    onChange(((await response.json()) as { tags: AppliedTag[] }).tags);
  }

  if (!canEdit && tags.length === 0) return null;
  return (
    <span className="tag-pills tag-editor">
      {tags.map((tag) => (
        <TagPill
          key={tag.id}
          onRemove={
            canEdit && !tag.fromCustomer && !saving
              ? () => void save(own.filter((id) => id !== tag.id))
              : undefined
          }
          tag={tag}
        />
      ))}
      {canEdit && choices.length > 0 ? (
        <select
          aria-label="Agregar un tag"
          className="tag-add"
          disabled={saving}
          onChange={(event) => {
            if (event.target.value) void save([...own, event.target.value]);
          }}
          value=""
        >
          <option value="">+ Tag</option>
          {choices.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      ) : null}
    </span>
  );
}
