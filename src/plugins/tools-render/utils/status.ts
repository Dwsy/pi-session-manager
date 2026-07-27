import type { BaseToolData } from '@/plugins/tools-render/types'

export type ToolRenderStatus = 'pending' | 'success' | 'error'

export function getToolRenderStatus(data: Pick<BaseToolData, 'result' | 'isError'>): ToolRenderStatus {
  if (data.isError) return 'error'
  if (!data.result) return 'pending'
  return 'success'
}

export function getToolExecutionClass(
  data: Pick<BaseToolData, 'result' | 'isError'>,
  disableSuccessStyle: boolean,
): string {
  const status = getToolRenderStatus(data)
  if (status === 'success' && disableSuccessStyle) return ''
  return status
}

export function getToolStatusLabel(
  status: ToolRenderStatus,
  t: (key: string, options?: any) => string,
): string {
  if (status === 'error') return t('components.toolCall.status.error', 'Failed')
  if (status === 'pending') return t('components.toolCall.status.pending', 'Waiting for result')
  return t('components.toolCall.status.success', 'Done')
}
