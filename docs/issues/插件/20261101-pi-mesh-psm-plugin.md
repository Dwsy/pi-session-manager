---
id: "2026-11-01-pi-mesh-psm-plugin"
title: "Pi Mesh 参考 Web 工作台的 PSM 插件化"
status: "open"
created: "2026-11-01"
updated: "2026-11-02"
category: "插件"
tags: ["workhub", "pi-mesh", "plugin-sdk", "reuse"]
---

# Issue: Pi Mesh PSM 插件化

## Goal

把 pi-mesh Web 的会话协作体验做成 PSM 插件，优先复用 PSM 会话、搜索、渲染、Review、输入和终端。只为实际缺口做最小宿主增强，保留 Mesh 真关注、元数据、恢复与已有 pane 接管语义。

已完成分析和两轮自审；工作区出现部分未提交实现，但完整目标尚未验收。本次自审只更新本 Issue 和方案，不修改业务代码。

## 方案 SSOT

[Pi Mesh 的 PSM 插件方案与代码分析 v1.3](../../architecture/pi-mesh-psm-plugin.md)

能力归属、现有 API/提案区分、两轮审查问题与证据、源码索引及放行条件统一见方案。本 Issue 只跟踪实施。

PSM_MESH_PLUGIN_DESIGN.md 已标为历史草案，旧 Pi Live 控制条款失效。最新用户决定：四项控制全用 Mesh，详见方案第 6.3/14 节；PSM 只复用界面/数据，不提供控制回退。

## 2026-11-02 用户确定的控制边界

Mesh 插件使用既有 send_message(mode=steer/followUp) 和 cancel；普通消息沿用草稿 mode，默认 followUp。Mesh 不可用则留稿/禁用，不用 Pi Live/bridge 补发。界面来自 PSM 不代表执行经 PSM RPC。此决定覆盖 v1.2 双通道建议。

## Acceptance Criteria

- [ ] PSM-only 与 Mesh-only 均能发现目标，复用原生阅读器；keep 导航、刷新/后退/移动返回保留正确资源。
- [ ] 资源 path/ID 冲突不回落，关联一对一；未索引、unknown、memory、missing 不混淆；不同后端不串数据。
- [ ] 在线消息、steer、follow-up、停止全经现有 Mesh Hub/扩展；不调用 Pi Live/bridge，也无手动/自动回退；不增平行 registry/消息机制。
- [ ] 真正的 Mesh 关注/通知和来源消息复用 Hub；Favorites 明确叫收藏；请求不双发、不自动换通道重试。
- [ ] 原 Review 修 canonical/outcome 与定位；原输入实现 IME/独立草稿/版本回执/在途锁。
- [ ] 终端项目 shell、已有 pane、恢复分开；请求 owner/后端/接受/PTY 就绪明确，observe 服务端只读。
- [ ] Mesh 恢复的并发/过期 token/启动至 register 间隙测试通过；同 pane attach 不偷换活跃 owner。
- [ ] 单事件 relay/single-flight/请求代次生效，错误/拒权/stale 不伪造离线；卸载/禁用无悬挂监听。
- [ ] 三视口、真实输入法、键盘、多窗口/远程/断连/临时会话/缺 Herdr 验收通过。
- [ ] SDK 类型/权限/availability 按 Mesh 控制真实来源验收；旧草案已声明失效，不以旧测试证明新实现可用。

## Phases

### 分析与自审

- [x] 首次核实仓库、调用链、复用矩阵，运行当时的 PSM 57 / Mesh 238 测试。
- [x] 首次复现 PSM Review 路径合并问题。
- [x] 第一轮：审查并修订重复 API、关注语义、阶段安排、身份/临时会话判断及新增现场。
- [x] 第一轮：运行当前 mergeMeshPeers 的三个身份关联反例。
- [x] 第二轮：独立审查 v1.1 的终端路由/确认、事件并发、attach 冲突和 keep 导航。
- [x] 第二轮：临时 home + fake Herdr 复现同 owner 双 launch、旧 owner 释放新 lease；无真实 pane 操作。
- [x] 保存 v1.2，记录 10 项问题和相应修订；代码问题不勾成已修复。

### M0：最小接入与身份

- [x] 盘点既有 Mesh 协议、宿主共享界面、terminal.open 与实现；Live summary 不是 Mesh 控制前置。
- [ ] 最小 Mesh peers 读取接入，原 Hub 保持唯一事实源。
- [ ] 修正资源身份与 persistence/索引状态区分，复用 PSM resolver。
- [ ] 建立真实 backend/runtime availability，Tauri remote 不混本地 IPC 数据。

### M1：原生浏览闭环

- [ ] psm-mesh 复用 app/sidebar、SessionViewer、搜索和配置。
- [ ] 修正 keep 导航选中保留，验收路由/刷新/后退/移动端返回。
- [ ] PSM 历史与 Mesh peers 可浏览；PSM-only 目标的 Mesh 控制禁用；不可用/空快照分开。
- [ ] 列表/活动取 Hub SSE，经单宿主 Mesh adapter 转发；不依赖 usePiLive relay，刷新合并、旧响应失效。

### M2：协作与变更

- [ ] 共享输入 controller 固定 Mesh send/cancel binding，保留 IME/草稿保护；无默认 Pi Live handler 逃逸。
- [ ] 原 Review 修 canonical/outcome，提供可复用 surface 与稳定定位。
- [ ] 真关注/来源发送/活动/GitInfo 复用 Hub；收藏不命名成关注。
- [ ] 未装 bridge、Pi Live 关闭时四动作正常；双注册/仅 Live/断 Mesh 时 pi_agent_* 控制调用计数为 0。

### M3：终端与恢复

- [ ] terminal.open 绑定当前 frontend owner，服务端验证，接受/PTY 失败分开。
- [ ] xterm/Herdr ANSI 字节、鼠标/滚轮、隐藏切回与生命周期探针通过。
- [ ] 现有 attach 表补 owner/冲突处理，旧 detach 不影响新连接。
- [ ] **恢复放行前置：修正现有 Hub lease operation token/fencing 与确认释放，反例测试通过。**
- [ ] 统一 host resume 按资源归属路由，工具栏/通用 callback 不绕 Mesh gate。

### M4：联合验收

- [ ] 完成方案第 10 节的故障/权限/兼容/真实 UI 与 pane 验收。
- [ ] 对齐另一个设计草案、SDK 文档和能力审计。
- [ ] 根据真实代码变更创建 PR 记录；提交/发布按用户明确指令执行。

## Errors Encountered

| 日期 | 问题 | 处理 |
| --- | --- | --- |
| 2026-11-01 | Mesh git log 实为上层仓库版本 | 保留归属说明与关键文件 SHA |
| 2026-11-01 | SDK 审计表与代码差异，后续又出现未提交新 API | 原方案标明历史/现场/提案，复用已有 namespace |
| 2026-11-01 | 两份方案对关注、Herdr 与完整目标的定义冲突 | 原方案保留完整目标，新增对齐门槛，未覆盖另一工作稿 |
| 2026-11-01 | 复用 CAS 的可靠性前提不成立 | 记为恢复放行 P0；只修订方案，代码修复待执行 |

## Worktree Protection

既有 SDK、dispatch、Registry、App、permissions、psm-mesh、tools/tray 业务修改全部保护。2026-11-01 自审只改方案/Issue；2026-11-02 同步修改旧草案的失效声明，三份文档之外不写业务代码，不重置/提交/冒领已有变更。

## Status Log

- 2026-11-01：首次分析完成，实施保持 open；无提交/发布/push/真实 pane 操作。
- 2026-11-01：两轮自审完成，方案 v1.2。第一轮 5 项、第二轮 5 项；恢复正确性为动作开放前置，完整插件未验收。

- 2026-11-02：用户明确四动作统一 Mesh，更新 v1.3 与历史草案失效声明；业务代码尚未切换，待按第 14 节验收。

### 2026-11-02 执行者增量实施记录（未提交，尚未验收完成）

已直接在现有 dirty 工作区增量实施：

- 新增后端本机 Hub 窄 HTTP adapter `src-tauri/src/dispatch/mesh.rs`，复用 `GET /api/peers`、`POST message/cancel/follow/unfollow`；端口来自后端主机 `~/.pi/pi-mesh/config.json`，命令只接受完整 UUID 和明确 Mesh 权限，不通过 bridge / Pi Live 控制。
- 扩展现有 runtime SDK 的 `mesh:read` / `mesh:control`、`ctx.psm.mesh`，与 dispatch 权限表对齐；未引入新 Hub/消息队列/registry。
- 在原 `extensions/psm-mesh` 中以 Mesh peers 代替 Live Agent 作为协作状态源；资源关联拒绝冲突路径与重复 UUID，`unknown` 不冒称 `memory`；PSM Favorites 改回“收藏”，真实 follow/unfollow 由 Hub 负责。
- 在共享 `PiLiveChatInput` 引入显式 Mesh binding，发送/停止 fail-closed；加入 per-session 草稿、版本回执保护、IME Enter 防护；Mesh 视图禁止原生 viewer 默认 Pi Live 输入器及原生恢复 callback。进入 `mainContent=keep` 视图保留当前会话选择。
- 已添加 Mesh 绑定的交互回归用例（Enter、Alt+Enter、slash-like、停止、断联、IME、迟到回执）。保持恢复按钮禁用；未启动任何真实 Hub/Herdr，也未对真实会话发送消息或停止。

**已确认的检查结果（后续复测更新）：**`pnpm typecheck:extensions`、`pnpm exec tsc -p tsconfig.json --noEmit` 和 `pnpm --dir packages/runtime-sdk build` 通过；定向 Vitest **6 个文件 / 53 项通过**（其中含 SDK 两项全控制入口/断联、Mesh 映射双注册/路径冲突/memory、共享输入器与实际 MeshWorkspace React 组件、Review 路径与组件）；`cargo test --lib dispatch::mesh` 通过 **1 项**（更新 SSE 后重新编译）。组件/SDK spy 的所有 Pi Live 控制调用为 **0**；但都是隔离模拟，**不是**真实 Hub 消息回执、真机端到端或桌面 UI 验收。

**部分完成但仍须现场验收：**已实现单 backend 进程的 Mesh Hub SSE relay（只转发变化/失联 invalidation，丢失时禁控制）+ 5 秒快照同步；复用原有 `get_session_by_path` 索引 resolver 并验证 Pi 路径与 UUID；Review 已做 cwd canonical 归一及两组反例，仍缺成功/失败/待定 outcome 关联。真实 backend owner/machine scope 及双注册、Mesh 失联的生产链路端到端回执仍未验收。**未完成：**owner-aware terminal 和 PTY-ready/pane attach，已隐藏 Mesh 插件终端入口并取消其 `terminal:open` 权限，原 PSM 终端仍可用；CAS operation token/fencing 和已知两反例未修复，**所有 Mesh 恢复入口继续禁用**；Tauri 桌面真实 1440/900/390/IME/多窗口验收未完成。无法将任何单测或 HTML/网页预览等同产品验收。

**工作区保护：**保留此前已有的 `extensions/pi-session-bridge/src/tools.ts`、`tools.test.ts` 或 `src-tauri/src/tray.rs` 修改原样；没有 commit、tag、发布、push 或用户 Hub 重启；未对真实用户会话发测试消息/取消。Issue 继续 open，M0–M4 仍需逐项实际验收。

**真实视图尝试与阻塞：**在独立端口 `127.0.0.1:5179` 起了本地 Vite 前端供观察，未替换用户正在运行的 PSM。Browser Harness 因 macOS Chrome `DevToolsActivePort` 文件访问遭拒，隔离 headless Chrome 也在 55s 超时，无可靠桌面截图/交互可验证。**Vite 临时进程已停止，原 Mesh Hub `127.0.0.1:5210` 仍为用户原有进程。**任何 1440/900/390 UI 或窗口/pane 验收仍未通过，不得据此关 Issue。

### 2026-11-02 继续实施：Mesh Hub CAS + Herdr attach 与 PSM 终端本地 owner（未提交）

**Mesh 原仓库增量**（仍在 `~/.pi/agent/extensions/pi-mesh`，未重启实际 Hub）：

- `src/protocol.ts`、`src/hub/registry.ts`、`src/hub/server.ts`、`src/hub/http.ts`、`src/resume.ts`：`claim_resume` 返回唯一随机 operation token；同一 `webui` owner 也不得二次领取。过期 TTL 不等于启动结果确认，租约持久化到既有 registry JSON 并原子写入，Hub 进程重启后仍保留。已开始启动的 `record_resume` 仅凭 owner/token 记录 lineage，不提前释放租约；目标 Pi register 才消耗。旧 owner/token 的 record/release 不得释放新租约；注册早于 record 的回执由 token 匹配；明确尚未触发 startAgent 的失败允许 `release_resume`，未知启动结果 fail closed。
- 原有 `src/hub/terminal.ts` 中增量维护 `mode:target → {owner,attachId,child,ws}`：活跃 attach 冲突返回 `terminal.error` + WebSocket 4409，不杀旧连接；旧 close/exit 不移除新连接，不新建 PTY。
- 使用 scratch HOME + fake Herdr 的 `bun test test/registry.test.ts test/resume.test.ts test/resume-cas.test.ts test/terminal.test.ts`：**52/52 通过**。**原子持久化补丁后**完整 `bun test`：**244/244 通过**（16 files / 2233 assertions）；`node --check src/hub/public/app.js` 与 `git diff --check` 均通过；52 项 CAS/Terminal 定向也通过。源码文档 `docs/architecture.md` 已同步。**运行中的用户 Hub 仍未重启，因此真实 Hub 不含这些新代码。**

**PSM 增量**：
- `plugin_terminal_open` 后端仅负责 `cwd`/权限等合法性校验并回传 validated request；不再向所有窗口广播 Tauri 事件。前端 `appTransport.ts` 注册本 renderer owner，只有原调用窗口的 ownerKey 保持一致才会接受打开原有 PSM scope；迟到回执、owner 缺失或能力关闭明确拒绝，成功返回只表示宿主接受，不声称 PTY ready。`src/App.tsx` 使用注册/注销该 handler。4 项新 owner/ack 回归 + 6 项 Mesh composer/workspace 交互 **10/10 通过**，TS 扩展/应用检查通过。
- `src-tauri/src/dispatch/mesh.rs` 新增 snapshot 重复完整 UUID 防护及对应 Rust 单测（**2/2 通过**：非法/歧义 UUID 与重复/离线 peer 快照均拒绝）。
- Mesh 插件的终端/恢复按钮**继续关闭**：尚无 PSM owner-aware Herdr pane UI/PTY-ready/真实 pane 生命周期证明；CAS 实现仍缺真实恢复目标状态核对、跨界面统一 resume 路由及生产实测，不得开放。
- 使用 Orca Computer Use 权限验证在独立端口进入实际 Vite/Psm 浏览器界面，看到真实 Dashboard 和 More apps 的 Mesh 菜单项；Mesh 菜单实际切换未验证（AXPress 无确认、坐标点击被 focus 限制）。因此**不是 PSM Mesh 插件真实 UI 验收**。测试 Chrome 标签已关闭，临时 Vite 已停止；用户应用/Hub 未重启。
- 保持 PSM 原有 `tools.ts`、`tools.test.ts`、`tray.rs` 与 Mesh 上层无关 dirty 修改不变。仍不 commit/tag/push/发布、不发送真实控制命令。本 Issue **保持 open**，等待 M1–M4 剩余真实 UI、终端、恢复与多窗口验收。

### 2026-11-02 本轮继续：Mesh 刷新时序与 Review outcome（未提交）

- `extensions/psm-mesh/MeshWorkspace.tsx`：单个快照请求使用 generation/dirty merge；断连使旧调用失效，重连可以绕过已废弃的 pending Promise 立即重新取 Hub；期间突发 SSE 只补一次快照；卸载时取消结果应用。PSM favorites 不再随每次 5s Hub 轮询重复读取。断连保留最后快照但禁控，旧响应不复活控制。草稿 storage key 改为 `machineId + full sessionId`，避免不同机器 UUID 共用。
- 针对可能数千条离线历史，沿用 Mesh sidebar 组件加每页 40 行的按需展开；全量筛选与搜索仍在完整 peers 集合进行，不建新索引。为避免耗时 JS DOM 组件压力测试，拆出 `pageMeshPeers` 纯 helper，分别验证首屏、展开及边界；UI 本身仍待真实性能/交互验收。
- `extensions/psm-code-review/tool-review/model.ts`、`viewModel.ts`、`ReviewFileTree.tsx`、`ToolCallReviewModal.tsx`：按照是否存在工具 result，将 `pending/failed/succeeded` 写入 FileOperation outcome；pending 的 diff/参数仍可供审查，但它和失败调用的“预期变更”不再充作已确认 Git-like 树状态或增删/变更汇总；明确显示 pending badge。对真实 `extractFileOperations` 和树的 canonical+outcome 反例补测。
- 更新 `docs/PSM_PLUGIN_SDK.md` 和 `docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md` 的 Mesh namespace / opt-in `mesh:control` / 完整 UUID 与真实 Hub 控制归属；`terminal.open` 只接受本 Tauri frontend owner，返回不能冒称 PTY 已启动。
- 已核验 MeshWorkspace+meshHelpers **15/15**、Review viewModel+ToolCallReviewModal **37/37** 通过；本轮 `pnpm typecheck:extensions` 与 `pnpm exec tsc -p tsconfig.json --noEmit` **均通过（exit 0）**。并行运行出现的低超时已在单独运行中纠正；其中大数据 DOM 压力测试在繁忙环境超时，改为纯函数正确性测试，不将该项宣称为真实 UI 性能通过。
- **风险边界不变**：没有重启 5210 Mesh Hub（仍是原用户进程）；没有发送或取消真实消息；没有执行真实 resume/terminal attach；恢复与 Mesh 专属终端入口仍禁用。未执行 commit/tag/push/发布。其他进程增加的 project identity 等 dirty 变更与本任务无关，不作覆盖。本 Issue 继续 open。


