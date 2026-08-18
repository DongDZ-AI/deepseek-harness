/** General Settings row for the conversation layout style (默认 / 更多内容). */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationKey } from '../locales.ts'
import type { LayoutStyle } from '../../layout-style.ts'
import css from './LayoutStyleRow.module.css'

/** Registration-side preference face. */
export interface LayoutStyleRowInjected {
  hooks: {
    /** Persisted layout style bound as useLayoutStyle. */
    layoutStyle: SnapshotStore<LayoutStyle>
  }
  /** Change the conversation layout style. */
  setLayoutStyle: (style: LayoutStyle) => void
}

/** Full Settings-row props. */
export type LayoutStyleRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'conversation'>
  & InjectFace<LayoutStyleRowInjected>

const OPTIONS: readonly { id: LayoutStyle; label: ConversationKey }[] = [
  { id: 'default', label: 'settings.layoutStyle.default' },
  { id: 'more', label: 'settings.layoutStyle.more' },
]

/** Render the layout style selector. */
export function LayoutStyleRow({ useLayoutStyle, setLayoutStyle, t }: LayoutStyleRowProps) {
  const style = useLayoutStyle(value => value)
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('settings.layoutStyle.title')}</div>
        <div className={css.desc}>{t('settings.layoutStyle.desc')}</div>
      </div>
      <div className={css.seg} role="group" aria-label={t('settings.layoutStyle.title')}>
        {OPTIONS.map(option => (
          <button
            key={option.id}
            type="button"
            className={style === option.id ? `${css.opt} ${css.optActive}` : css.opt}
            onClick={() => { setLayoutStyle(option.id) }}
          >
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}
