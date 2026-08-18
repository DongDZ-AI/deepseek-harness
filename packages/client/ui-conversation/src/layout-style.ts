/**
 * Conversation layout style preference: 默认 (untouched product layout) vs
 * 更多内容 (denser transcript: wider 1120px column + 14px/24px type).
 *
 * Persisted in localStorage — the same browser-storage pattern as the
 * trajectory duration preference — so the choice survives page reloads and
 * process restarts without a Host settings namespace registration.
 */

/** localStorage key holding the persisted layout style. */
export const LAYOUT_STYLE_STORAGE_KEY = 'dsh.ui-conversation.layoutStyle'

/** The two switchable layout styles. */
export const LAYOUT_STYLES = ['default', 'more'] as const

/** One switchable layout style: product default, or the denser column. */
export type LayoutStyle = typeof LAYOUT_STYLES[number]

/** Default is the untouched product layout (748px column, 16px type). */
export const DEFAULT_LAYOUT_STYLE: LayoutStyle = 'default'

/** Narrow an unknown stored value to a valid style. */
export function isLayoutStyle(value: unknown): value is LayoutStyle {
  return value === 'default' || value === 'more'
}

/** Read the persisted style, falling back to the product default. */
export function readStoredLayoutStyle(): LayoutStyle {
  if (typeof localStorage === 'undefined') return DEFAULT_LAYOUT_STYLE
  try {
    const raw = localStorage.getItem(LAYOUT_STYLE_STORAGE_KEY)
    return isLayoutStyle(raw) ? raw : DEFAULT_LAYOUT_STYLE
  } catch {
    return DEFAULT_LAYOUT_STYLE
  }
}

/**
 * The "更多内容" stylesheet: one CSS override sheet injected into the page
 * while the dense style is active. Selectors ride stable data attributes:
 * the conversation width axis (ConversationRoot), the assistant flow rows,
 * the user bubble, and the composer card. The markdown token scale is
 * overridden on `body` so every markdown surface follows the smaller type.
 */
export const LAYOUT_STYLE_CSS = `
/* Conversation layout style "更多内容": 1120px column + 14px/24px type. */
[data-slot='conversation'] [data-phase] {
  --dsh-chat-content-width: 1120px;
}
[data-chat-flow] [data-chat-flow-kind='assistant-step'] {
  font-size: 14px;
  line-height: 24px;
}
[data-chat-flow] [data-time-hover-root] > div > div:last-child {
  font-size: 14px;
  line-height: 22px;
}
/* Composer text matches the content area (textarea/mirror/backdrop inherit
   from the card, so all three layers stay in metric sync). */
[data-composer-seat] [data-composer-card] {
  font-size: 14px;
  line-height: 24px;
}
body {
  --dsw-font-markdown-h1: 700 20px/30px var(--dsw-font-family);
  --dsw-font-markdown-h1-font-size: 20px;
  --dsw-font-markdown-h1-line-height: 30px;
  --dsw-font-markdown-h2: 700 18px/28px var(--dsw-font-family);
  --dsw-font-markdown-h2-font-size: 18px;
  --dsw-font-markdown-h2-line-height: 28px;
  --dsw-font-markdown-h3: 700 16px/26px var(--dsw-font-family);
  --dsw-font-markdown-h3-font-size: 16px;
  --dsw-font-markdown-h3-line-height: 26px;
  --dsw-font-markdown-h4: 600 14px/24px var(--dsw-font-family);
  --dsw-font-markdown-h4-font-size: 14px;
  --dsw-font-markdown-h4-line-height: 24px;
  --dsw-font-markdown-base: 14px/24px var(--dsw-font-family);
  --dsw-font-markdown-base-font-size: 14px;
  --dsw-font-markdown-base-line-height: 24px;
  --dsw-font-markdown-base-strong: 600 14px/24px var(--dsw-font-family);
  --dsw-font-markdown-base-strong-font-size: 14px;
  --dsw-font-markdown-base-strong-line-height: 24px;
  --dsw-font-markdown-base-italic: italic 14px/24px var(--dsw-font-family);
  --dsw-font-markdown-base-italic-font-size: 14px;
  --dsw-font-markdown-base-italic-line-height: 24px;
  --dsw-font-markdown-base-strong-italic: italic 600 14px/24px var(--dsw-font-family);
  --dsw-font-markdown-base-strong-italic-font-size: 14px;
  --dsw-font-markdown-base-strong-italic-line-height: 24px;
  --dsw-font-markdown-table: 14px/24px var(--dsw-font-family);
  --dsw-font-markdown-table-font-size: 14px;
  --dsw-font-markdown-table-line-height: 24px;
  --dsw-font-markdown-table-head: 500 14px/24px var(--dsw-font-family);
  --dsw-font-markdown-table-head-font-size: 14px;
  --dsw-font-markdown-table-head-line-height: 24px;
}
`
