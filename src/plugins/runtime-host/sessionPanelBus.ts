/**
 * Request bus for opening a session panel by contribution id.
 *
 * Panel open state is owned by the host session viewer shell, while the code
 * that wants a panel open (selection actions, plugin commands) runs outside
 * that component tree. This bus bridges the two without exposing host state.
 */

type OpenPanelListener = (panelId: string) => void

const listeners = new Set<OpenPanelListener>()

export function requestOpenSessionPanel(panelId: string): void {
  for (const listener of [...listeners]) listener(panelId)
}

export function subscribeOpenSessionPanel(listener: OpenPanelListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
