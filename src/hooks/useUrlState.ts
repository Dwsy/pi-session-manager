import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * URL 状态管理 Hook
 * 在浏览器模式下，将应用状态同步到 URL 参数，支持：
 * - 通过 URL 分享特定项目或会话视图
 * - 刷新页面后保持状态
 * - 浏览器前进/后退按钮支持
 */

interface UrlState {
  project: string | null
  session: string | null
}

interface UseUrlStateReturn {
  projectFromUrl: string | null
  sessionFromUrl: string | null
  updateUrlState: (state: Partial<UrlState>, replace?: boolean) => void
  clearUrlState: () => void
}

/**
 * 解析 URL 查询参数
 */
function parseUrlParams(): UrlState {
  if (typeof window === 'undefined') {
    return { project: null, session: null }
  }

  const params = new URLSearchParams(window.location.search)
  return {
    project: params.get('project'),
    session: params.get('session'),
  }
}

/**
 * 构建新的 URL
 */
function buildUrl(state: UrlState): string {
  const params = new URLSearchParams()

  if (state.project) {
    params.set('project', state.project)
  }
  if (state.session) {
    params.set('session', state.session)
  }

  const queryString = params.toString()
  const baseUrl = window.location.pathname

  return queryString ? `${baseUrl}?${queryString}` : baseUrl
}

export function useUrlState(enabled: boolean = true): UseUrlStateReturn {
  // 始终启用 URL 状态管理（在桌面和浏览器模式下都有效）
  const isEnabled = enabled

  // 同步初始化状态，避免 useEffect 延迟
  const [state, setState] = useState<UrlState>(() => {
    if (!isEnabled || typeof window === 'undefined') {
      return { project: null, session: null }
    }
    return parseUrlParams()
  })
  
  const isUpdatingRef = useRef(false)

  // 初始化：从 URL 读取状态
  useEffect(() => {
    if (!isEnabled) return

    const urlState = parseUrlParams()
    setState(urlState)
  }, [isEnabled])

  // 监听浏览器前进/后退事件
  useEffect(() => {
    if (!isEnabled) return

    const handlePopState = () => {
      isUpdatingRef.current = true
      const urlState = parseUrlParams()
      setState(urlState)
      // 重置标志，允许后续的 URL 更新
      setTimeout(() => {
        isUpdatingRef.current = false
      }, 0)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isEnabled])

  /**
   * 更新 URL 状态
   * @param newState - 要更新的状态
   * @param replace - 是否替换当前历史记录（默认 false，即添加新记录）
   */
  const updateUrlState = useCallback(
    (newState: Partial<UrlState>, replace: boolean = false) => {
      if (!isEnabled || isUpdatingRef.current) return

      setState((prev) => {
        const nextState = { ...prev, ...newState }

        // 移除 null 值
        if (newState.project === null) nextState.project = null
        if (newState.session === null) nextState.session = null

        const newUrl = buildUrl(nextState)

        if (replace) {
          window.history.replaceState({}, '', newUrl)
        } else {
          window.history.pushState({}, '', newUrl)
        }

        return nextState
      })
    },
    [isEnabled]
  )

  /**
   * 清除所有 URL 状态
   */
  const clearUrlState = useCallback(() => {
    if (!isEnabled || isUpdatingRef.current) return

    const newUrl = window.location.pathname
    window.history.pushState({}, '', newUrl)
    setState({ project: null, session: null })
  }, [isEnabled])

  return {
    projectFromUrl: state.project,
    sessionFromUrl: state.session,
    updateUrlState,
    clearUrlState,
  }
}
