# 搜索功能调试指南

## 问题
搜索功能一直显示 "搜索中..." (Searching...)

## 已添加的调试日志

### 1. App.tsx 中的日志

在 `App.tsx` 中添加了以下日志点：

- **loadSessions**: 会话加载过程
  ```
  [App] loadSessions called
  [App] Invoking scan_sessions...
  [App] scan_sessions returned X sessions
  [App] Sessions state updated
  [App] loadSessions completed, setLoading(false)
  ```

- **handleSearch**: 搜索过程
  ```
  [Search] handleSearch called with query: "xxx"
  [Search] sessions count: X
  [Search] Set isSearching = true, invoking search_sessions...
  [Search] Search completed, results: [...]
  [Search] Results count: X
  [Search] Set searchResults
  [Search] Finally block, setting isSearching = false
  [Search] isSearching set to false
  ```

- **mapSearchResults**: 搜索结果映射
  ```
  [mapSearchResults] Mapping X search results
  [mapSearchResults] allSessions count: X
  [mapSearchResults] Mapped result: { id, name, cwd, originalSessionFound }
  ```

- **Render**: 组件渲染状态
  ```
  [App] Render - isSearching: true/false searchResults: X sessions: X
  ```

### 2. SearchPanel.tsx 中的日志

在 `SearchPanel.tsx` 中添加了以下日志点：

- **Query Change**: 查询输入变化
  ```
  [SearchPanel] query changed: "xxx"
  [SearchPanel] isSearching: true/false
  [SearchPanel] resultCount: X
  ```

- **Debounced Search**: 防抖搜索触发
  ```
  [SearchPanel] Debounced search triggered for query: "xxx"
  ```

### 3. ProjectList.tsx 中的日志

在 `ProjectList.tsx` 中添加了以下日志点：

- **Render**: 组件渲染
  ```
  [ProjectList] Rendered with X sessions
  [ProjectList] loading: true/false
  ```

## 如何查看日志

### 在浏览器中查看

1. 打开开发者工具 (F12 或 Cmd+Option+I)
2. 切换到 Console 标签
3. 在搜索框中输入搜索词
4. 观察控制台输出

### 预期的正常日志流程

```
[App] Render - isSearching: false searchResults: 0 sessions: 10
[SearchPanel] query changed: "rust"
[SearchPanel] isSearching: false
[SearchPanel] resultCount: 0
[SearchPanel] Debounced search triggered for query: "rust"
[Search] handleSearch called with query: "rust"
[Search] sessions count: 10
[Search] Set isSearching = true, invoking search_sessions...
[App] Render - isSearching: true searchResults: 0 sessions: 10
[Search] Search completed, results: [{...}, {...}]
[Search] Results count: 2
[Search] Set searchResults
[Search] Finally block, setting isSearching = false
[Search] isSearching set to false
[mapSearchResults] Mapping 2 search results
[mapSearchResults] allSessions count: 10
[mapSearchResults] Mapped result: { id: "xxx", name: "...", cwd: "...", originalSessionFound: true }
[mapSearchResults] Mapped result: { id: "yyy", name: "...", cwd: "...", originalSessionFound: true }
[App] Render - isSearching: false searchResults: 2 sessions: 10
[ProjectList] Rendered with 2 sessions
[ProjectList] loading: false
```

### 可能的异常情况

#### 情况 1: sessions 为空
```
[Search] handleSearch called with query: "rust"
[Search] sessions count: 0
[Search] Set isSearching = true, invoking search_sessions...
[Search] Search completed, results: []
[Search] Results count: 0
```
**原因**: 会话未正确加载

#### 情况 2: 调用失败
```
[Search] Set isSearching = true, invoking search_sessions...
[Search] Search failed: TypeError: ...
[Search] Error details: "..."
[Search] Finally block, setting isSearching = false
```
**原因**: Tauri 命令调用失败

#### 情况 3: 一直显示搜索中
```
[Search] Set isSearching = true, invoking search_sessions...
```
**原因**: Promise 未 resolve 或 reject，可能是 Tauri 后端问题

## 检查清单

- [ ] 浏览器控制台是否有错误？
- [ ] 是否看到 `[App] loadSessions` 日志？
- [ ] `sessions count` 是否大于 0？
- [ ] 是否看到 `[Search] Set isSearching = true`？
- [ ] 是否看到 `[Search] Search completed` 或 `[Search] Search failed`？
- [ ] 是否看到 `[Search] Finally block, setting isSearching = false`？
- [ ] `mapSearchResults` 中的 `originalSessionFound` 是否为 true？

## 后端检查

如果前端日志正常，但搜索结果为空或一直显示搜索中，需要检查后端：

1. 打开 Tauri 应用日志
2. 查看 `search_sessions` 命令是否被调用
3. 检查是否有 Rust 错误
4. 确认搜索逻辑是否正常执行

## 移除调试日志

问题解决后，可以移除所有 `console.log` 语句：

```bash
# 搜索所有 console.log
grep -r "console.log" src/

# 或者使用编辑器的查找替换功能
```