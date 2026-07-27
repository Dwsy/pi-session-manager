import type {
  GlobalMapSettings,
  SemanticNoteType,
  SessionModel,
  TopologyScope,
} from "@/utils/session-branch";
import { formatNumber } from "@/utils/session-branch";
import { FilterIcon, ModelIcon, NoteIcon } from "./Icons";

interface GlobalMapToolbarProps {
  model: SessionModel;
  settings: GlobalMapSettings;
  onSettingsChange: (settings: GlobalMapSettings) => void;
  compact?: boolean;
}

const SCOPES: Array<{
  value: TopologyScope;
  label: string;
  description: string;
}> = [
  {
    value: "structure",
    label: "结构",
    description: "只显示线性分支段、真实分叉和终点",
  },
  {
    value: "user",
    label: "用户",
    description: "在线性分支轨道上只标出用户消息",
  },
  {
    value: "conversation",
    label: "对话",
    description: "标出用户消息与有文本的 assistant 消息",
  },
  {
    value: "all",
    label: "全部",
    description: "标出所有 entry；分支层级仍只由真实 fork 决定",
  },
];

const NOTE_TYPES: Array<{
  type: SemanticNoteType;
  label: string;
  description: string;
}> = [
  {
    type: "user",
    label: "用户输入",
    description: "在用户消息位置显示注记（与地图事件筛选独立）",
  },
  {
    type: "assistant_reply",
    label: "AI 末条回复",
    description: "每轮用户消息之后，锚定到该轮最后一条 assistant 回复",
  },
  { type: "rename", label: "Rename", description: "session_info 会话名称变更" },
  {
    type: "label",
    label: "Label",
    description: "标签设置与清除，锚定到 target entry",
  },
  { type: "model", label: "模型切换", description: "model_change 事件" },
  {
    type: "thinking",
    label: "思考级别",
    description: "thinking_level_change 事件",
  },
  { type: "compaction", label: "Compaction", description: "上下文压缩事件" },
  {
    type: "error",
    label: "异常",
    description: "error、aborted 与失败工具结果",
  },
];

export function GlobalMapToolbar({
  model,
  settings,
  onSettingsChange,
  compact = false,
}: GlobalMapToolbarProps): React.ReactElement {
  const noteCounts = new Map<SemanticNoteType, number>();
  for (const note of model.notes)
    noteCounts.set(note.type, (noteCounts.get(note.type) ?? 0) + 1);
  const enabledNoteCount = NOTE_TYPES.filter(
    (item) => settings.enabledNotes[item.type],
  ).length;

  function toggleNote(type: SemanticNoteType): void {
    onSettingsChange({
      ...settings,
      enabledNotes: {
        ...settings.enabledNotes,
        [type]: !settings.enabledNotes[type],
      },
    });
  }

  function toggleModel(key: string): void {
    const selected = new Set(settings.selectedModels);
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    onSettingsChange({ ...settings, selectedModels: [...selected] });
  }

  return (
    <div className={`global-map-toolbar ${compact ? "is-compact" : ""}`}>
      <div
        className="map-scope-switch"
        role="group"
        aria-label="Global Map 事件筛选"
      >
        {SCOPES.map((scope) => (
          <button
            key={scope.value}
            type="button"
            className={settings.scope === scope.value ? "is-active" : ""}
            aria-pressed={settings.scope === scope.value}
            title={scope.description}
            onClick={() =>
              onSettingsChange({ ...settings, scope: scope.value })
            }
          >
            {scope.label}
          </button>
        ))}
      </div>

      <details className="filter-menu notes-menu">
        <summary title="选择覆盖在线性分支轨道上的语义注记">
          <NoteIcon />
          <span>注记</span>
          <b>{enabledNoteCount}</b>
        </summary>
        <div className="filter-popover">
          <div className="filter-popover-head">
            <div>
              <strong>语义注记</strong>
              <span>作为事件覆盖层，不会被误画成分支层级。</span>
            </div>
          </div>
          <div className="filter-option-list">
            {NOTE_TYPES.map((item) => (
              <label
                key={item.type}
                className={`filter-option note-${item.type}`}
              >
                <input
                  type="checkbox"
                  checked={settings.enabledNotes[item.type]}
                  onChange={() => toggleNote(item.type)}
                />
                <i />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <b>{formatNumber(noteCounts.get(item.type) ?? 0)}</b>
              </label>
            ))}
          </div>
          <label className="filter-option is-secondary">
            <input
              type="checkbox"
              checked={settings.smartMapLayout}
              onChange={() =>
                onSettingsChange({
                  ...settings,
                  smartMapLayout: !settings.smartMapLayout,
                })
              }
            />
            <i />
            <span>
              <strong>智能布局</strong>
              <small>
                全景留白与间距；相邻 model/thinking
                只保留最后一条；相同用户输入合并为 ×N。
              </small>
            </span>
          </label>
          <div className="filter-popover-subhead">地图标识</div>
          <label className="filter-option is-secondary">
            <input
              type="checkbox"
              checked={settings.showSegmentLabels}
              onChange={() =>
                onSettingsChange({
                  ...settings,
                  showSegmentLabels: !settings.showSegmentLabels,
                })
              }
            />
            <i />
            <span>
              <strong>分支段编号</strong>
              <small>显示 B0、B0.1 等线性段标签。</small>
            </span>
          </label>
          <label className="filter-option is-secondary">
            <input
              type="checkbox"
              checked={settings.showForkLabels}
              onChange={() =>
                onSettingsChange({
                  ...settings,
                  showForkLabels: !settings.showForkLabels,
                })
              }
            />
            <i />
            <span>
              <strong>分叉编号</strong>
              <small>显示 F1、F2 等真实 fork 标签。</small>
            </span>
          </label>
        </div>
      </details>

      <details className="filter-menu model-menu">
        <summary title="按有效模型筛选事件标记">
          <ModelIcon />
          <span>模型</span>
          <b>{settings.selectedModels.length || "全"}</b>
        </summary>
        <div className="filter-popover is-models">
          <div className="filter-popover-head">
            <div>
              <strong>有效模型</strong>
              <span>只筛选事件；所有线性分支轨道和 fork 始终保留。</span>
            </div>
            <button
              type="button"
              className="text-action"
              onClick={() =>
                onSettingsChange({ ...settings, selectedModels: [] })
              }
            >
              全部
            </button>
          </div>
          <div className="filter-option-list model-option-list">
            {model.models.length ? (
              model.models.map((stat) => (
                <label
                  key={stat.model.key}
                  className="filter-option model-option"
                >
                  <input
                    type="checkbox"
                    checked={
                      !settings.selectedModels.length ||
                      settings.selectedModels.includes(stat.model.key)
                    }
                    onChange={() => {
                      if (!settings.selectedModels.length) {
                        const rest = model.models
                          .map((item) => item.model.key)
                          .filter((key) => key !== stat.model.key);
                        onSettingsChange({ ...settings, selectedModels: rest });
                      } else {
                        toggleModel(stat.model.key);
                      }
                    }}
                  />
                  <i />
                  <span>
                    <strong>{stat.model.label}</strong>
                    <small>
                      {formatNumber(stat.assistants)} assistant ·{" "}
                      {formatNumber(stat.entries)} entries
                    </small>
                  </span>
                </label>
              ))
            ) : (
              <div className="filter-empty">会话中没有模型元数据</div>
            )}
          </div>
        </div>
      </details>

      <button
        type="button"
        className="map-axis-button"
        title="切换纵轴：路径序列 / 实际时间"
        onClick={() =>
          onSettingsChange({
            ...settings,
            axis: settings.axis === "sequence" ? "time" : "sequence",
          })
        }
      >
        <FilterIcon />
        {settings.axis === "sequence" ? "序列" : "时间"}
      </button>
    </div>
  );
}
