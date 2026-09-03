import { useId, useRef, useState, type ChangeEvent } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';

/**
 * An image field that uploads into itself.
 *
 * The editor used to have one uploader for the whole page: you picked a file, got a URL in a
 * read-only box, and then copied it by hand into whichever section needed it. Every image meant a
 * round trip through the clipboard, and pasting into the wrong field was easy and silent.
 *
 * Here the upload sets the value of the field that asked for it, and shows what was chosen.
 */
export function CmsImageField({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (url: string) => void;
  value: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fieldId = useId();

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared straight away so picking the same file twice still fires a change event.
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    setError('');
    try {
      const response = await apiRequest('/api/v1/cms/media', {
        body: file,
        headers: { 'content-type': file.type },
        method: 'POST',
      });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      const asset = (await response.json()) as { url: string };
      onChange(asset.url);
    } catch {
      setError('No pudimos subir la imagen.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="cms-image-field">
      <label className="cms-image-field-label" htmlFor={fieldId}>
        {label}
      </label>
      <div className="cms-image-field-row">
        {value ? (
          <img alt="" className="cms-image-field-thumb" src={value} />
        ) : (
          <span className="cms-image-field-thumb cms-image-field-thumb-empty" aria-hidden="true">
            —
          </span>
        )}
        <div className="cms-image-field-controls">
          <input
            disabled={disabled}
            id={fieldId}
            onChange={(event) => onChange(event.target.value)}
            placeholder="URL de la imagen, o subí una"
            value={value}
          />
          <div className="cms-image-field-actions">
            <input
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              disabled={disabled || uploading}
              onChange={(event) => void upload(event)}
              ref={inputRef}
              type="file"
            />
            <button
              className="button button-secondary"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              {uploading ? 'Subiendo…' : 'Subir imagen'}
            </button>
            {value ? (
              <button
                className="button button-secondary"
                disabled={disabled}
                onClick={() => onChange('')}
                type="button"
              >
                Quitar
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {error ? <p className="cms-image-field-error">{error}</p> : null}
    </div>
  );
}
