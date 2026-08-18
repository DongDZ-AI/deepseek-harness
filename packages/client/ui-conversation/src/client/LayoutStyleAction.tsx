/** Session-header action: shows the current layout style and toggles it. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { LayoutStyle } from '../layout-style.ts'
import css from './LayoutStyleAction.module.css'

/** Registration-side face (the same preference the Settings row edits). */
export interface LayoutStyleActionInjected {
  hooks: { layoutStyle: SnapshotStore<LayoutStyle> }
  setLayoutStyle: (style: LayoutStyle) => void
}

/** Full header-action props. */
export type LayoutStyleActionProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'conversation'>
  & InjectFace<LayoutStyleActionInjected>

/** One-button toggle between 默认 and 更多内容. */
export function LayoutStyleAction({ useLayoutStyle, setLayoutStyle, t }: LayoutStyleActionProps) {
  const style = useLayoutStyle(value => value)
  const next = style === 'more' ? 'default' : 'more'
  return (
    <button
      type="button"
      className={css.toggle}
      title={t('settings.layoutStyle.toggle')}
      onClick={() => { setLayoutStyle(next) }}
    >
      {t(style === 'more' ? 'settings.layoutStyle.more' : 'settings.layoutStyle.default')}
    </button>
  )
}
