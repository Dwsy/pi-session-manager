# Pi Live 桥接工程化正确化

<!-- pdca:gen -->
> **status:** completed  ·  **phase:** P3  ·  **pdca:** act
> **validation:** passed  ·  **open decisions:** none
> **next:** Cycle closed; hand off verified diff and Workhub PR change record without pushing.
<!-- /pdca:gen -->

## Objective

基于 `@earendil-works/pi-coding-agent` 最新发布版（当前 registry latest: 0.85.1）源码与 PSM 真实调用链，系统修正 Pi Live/bridge 的协议、状态与 RPC 正确性，并用自动化测试和构建证据闭环。

## Scope

- 校准 `extensions/pi-session-bridge` 与当前 Pi 0.75.5 ExtensionAPI / 事件语义。
- 校准 PSM Rust realtime（WS/HTTP）、`PiAgentRegistry`、`pi_live` commands 的 register/event/state/RPC 生命周期。
- 校准 `usePiLive` 对 live session、streaming、entry count、model/thinking/context/queue 状态的归并。
- 为发现的协议/状态缺陷增加最小回归测试，并同步直接相关 SSOT 文档。

## Out Of Scope

- 与 Pi Live 正确性无关的 UI 重设计、Kanban、搜索、session tree 或插件功能扩张。
- 无证据驱动的大规模架构重写、协议版本系统或兼容层重构。
- 覆盖或回滚当前 worktree 中已有的用户未提交改动。

## Acceptance

- [ ] Pi session 的 register、state、live event、disconnect 在 WS 与 HTTP realtime 两条入口保持等价语义，且有自动化证据。
- [ ] 同一 live session 的并发 RPC 使用可区分 correlation id，response 只能唤醒对应调用者，并有回归测试。
- [ ] bridge 仅使用当前 Pi 0.75.5 支持的 ExtensionAPI/事件，并正确实现 prompt/steer/follow-up/model/thinking/commands/abort。
- [ ] frontend live 状态不会因重复事件产生错误 entry count/streaming 状态，相关 hook 测试通过。
- [ ] bridge 定向测试、Pi Live Rust 测试、前端定向测试及格式/类型/构建检查全部执行并读回结果；未通过项不得标记完成。
- [ ] 直接相关的 Pi Live / bridge SSOT 文档与真实文件路径、事件/RPC 语义一致。

## SSOT / Links

- `docs/issues/插件/20260910-Pi Live 桥接工程化正确化.md`
- `docs/PI_LIVE_RPC_SOT.md`
- `docs/PI_LIVE_ARCHITECTURE.md`
- `docs/PI_SESSION_BRIDGE_SOT.md`
- `work/20260910-pi-live-bridge-correctness/state.json`
