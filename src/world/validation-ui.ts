import { COLOURS } from '../constants';
import type { ValidationResult } from './validation';

export function formatValidationErrors(result: ValidationResult): string {
  return result.errors.map((line) => `  • ${line}`).join('\n');
}

export interface ValidationErrorPanelOptions {
  title: string;
  result: ValidationResult;
  /** Called when the user closes the panel (overlay backdrop or Close). */
  onDismiss: () => void;
  /** Optional extra buttons rendered after Close (e.g. “Back to Main Menu”). */
  extraButtons?: Array<{ label: string; onClick: () => void }>;
}

/**
 * Renders a fixed overlay panel (dark theme, red accent) for validation failures.
 * Uses monospace scroll for error lines. Returns an unmount function.
 */
export function mountValidationErrorPanel(options: ValidationErrorPanelOptions): () => void {
  const { title, result, onDismiss, extraButtons = [] } = options;
  const root = document.createElement('div');
  root.setAttribute('data-validation-error-panel', 'true');
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:10000',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:rgba(0,0,0,0.72)',
    'font-family:Courier New,monospace'
  ].join(';');

  const panel = document.createElement('div');
  panel.style.cssText = [
    'max-width:min(640px,92vw)',
    'max-height:min(80vh,560px)',
    'display:flex',
    'flex-direction:column',
    'padding:20px 22px',
    `background:${COLOURS.SPACE_BLACK}`,
    'border:1px solid #5a2020',
    'border-left:4px solid ' + COLOURS.DANGER,
    'box-shadow:0 8px 32px rgba(0,0,0,0.55)',
    'color:' + COLOURS.UI_PRIMARY
  ].join(';');

  const titleEl = document.createElement('h2');
  titleEl.textContent = title;
  titleEl.style.cssText = `margin:0 0 10px;font-size:18px;font-weight:bold;color:${COLOURS.DANGER}`;
  panel.appendChild(titleEl);

  const countEl = document.createElement('p');
  countEl.textContent = `${result.errors.length} validation error(s) found`;
  countEl.style.cssText = `margin:0 0 12px;font-size:13px;color:${COLOURS.UI_SECONDARY}`;
  panel.appendChild(countEl);

  const pre = document.createElement('pre');
  pre.textContent = formatValidationErrors(result);
  pre.style.cssText = [
    'flex:1',
    'min-height:120px',
    'overflow:auto',
    'margin:0 0 16px',
    'padding:12px',
    'font-size:12px',
    'line-height:1.45',
    'white-space:pre-wrap',
    'word-break:break-word',
    'background:rgba(12,12,24,0.95)',
    'border:1px solid ' + COLOURS.UI_SECONDARY,
    'color:' + COLOURS.UI_PRIMARY
  ].join(';');
  panel.appendChild(pre);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = `padding:8px 16px;cursor:pointer;font-family:inherit;background:#1a1a28;color:${COLOURS.UI_PRIMARY};border:1px solid ${COLOURS.UI_SECONDARY}`;
  closeBtn.addEventListener('click', () => {
    unmount();
    onDismiss();
  });
  row.appendChild(closeBtn);

  for (const { label, onClick } of extraButtons) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = `padding:8px 16px;cursor:pointer;font-family:inherit;background:#1a2030;color:${COLOURS.UI_ACCENT};border:1px solid ${COLOURS.UI_ACCENT}`;
    b.addEventListener('click', () => {
      unmount();
      onClick();
    });
    row.appendChild(b);
  }

  panel.appendChild(row);
  root.appendChild(panel);

  const onBackdrop = (ev: MouseEvent): void => {
    if (ev.target === root) {
      unmount();
      onDismiss();
    }
  };
  root.addEventListener('mousedown', onBackdrop);

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.code === 'Escape') {
      ev.preventDefault();
      unmount();
      onDismiss();
    }
  };
  window.addEventListener('keydown', onKey);

  function unmount(): void {
    root.removeEventListener('mousedown', onBackdrop);
    window.removeEventListener('keydown', onKey);
    root.remove();
  }

  document.body.appendChild(root);
  return unmount;
}
