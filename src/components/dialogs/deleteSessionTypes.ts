export interface DeleteSessionAnchorPoint {
  x: number
  y: number
}

export interface DeleteSessionRequestOptions {
  anchorPoint?: DeleteSessionAnchorPoint | null
  /** 如果为 true，则直接执行删除而不显示 Popover 确认弹窗（用于右键菜单 inline 确认模式） */
  skipPopover?: boolean
}
