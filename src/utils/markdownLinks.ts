import { invoke, isTauri } from '@/transport'
import type { MarkdownLinkTarget } from './markdownLinkPolicy'
export {
  classifyMarkdownLink,
  getMarkdownLinkConfirmationMessage,
  normalizeFileHref,
} from './markdownLinkPolicy'
export type { MarkdownLinkTarget } from './markdownLinkPolicy'

export async function openMarkdownLinkTarget(target: MarkdownLinkTarget): Promise<void> {
  if (target.kind === 'external-url') {
    if (isTauri()) {
      await invoke('open_url_in_system', { url: target.href })
      return
    }
    window.open(target.href, '_blank', 'noopener,noreferrer')
    return
  }

  if (target.kind === 'local-file') {
    if (!isTauri()) {
      throw new Error('Local files can only be opened from the desktop app')
    }
    await invoke('open_path_with_default_app', { path: target.path })
    return
  }

  throw new Error(target.kind === 'unsupported' ? target.reason : 'Anchor links are handled in the page')
}
