/**
 * Layout style controller: the live preference store plus its localStorage
 * persistence. Mirrors ComposerSubmissionPolicy's shape (live SnapshotStore
 * adopted from durable storage) without a Host settings namespace.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  LAYOUT_STYLE_STORAGE_KEY, readStoredLayoutStyle, type LayoutStyle,
} from '../layout-style.ts'

/** Owns the live layout-style preference and its durable write. */
export class LayoutStyleController {
  /** Reactive preference source for the Settings row and header action. */
  readonly style: SnapshotStore<LayoutStyle> = createSnapshotStore(readStoredLayoutStyle())

  /** Change the style; the live value publishes before the durable write. */
  setStyle(style: LayoutStyle): void {
    if (this.style.getSnapshot() === style) return
    this.style.set(style)
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(LAYOUT_STYLE_STORAGE_KEY, style)
    } catch {
      // Storage unavailable (private mode etc.): the live value still applies.
    }
  }
}
