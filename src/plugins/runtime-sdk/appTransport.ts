import { invoke } from '@/transport'
import type { PsmTransport } from './types'

export const appPsmTransport: PsmTransport = {
  invoke,
}
