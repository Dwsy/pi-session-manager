import { useTranslation } from "react-i18next";
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
  key: string;
  fallbackLabel: string;
  fallbackDescription: string;
}> = [
  {
    value: "structure",
    key: "structure",
    fallbackLabel: "Structure",
    fallbackDescription: "Show only linear segments, real forks, and endings",
  },
  {
    value: "user",
    key: "user",
    fallbackLabel: "User",
    fallbackDescription: "Mark only user messages on linear branch rails",
  },
  {
    value: "conversation",
    key: "conversation",
    fallbackLabel: "Conversation",
    fallbackDescription: "Mark user messages and assistant replies with text",
  },
  {
    value: "all",
    key: "all",
    fallbackLabel: "All",
    fallbackDescription:
      "Mark every entry while keeping hierarchy limited to real forks",
  },
];

const NOTE_TYPES: Array<{
  type: SemanticNoteType;
  key: string;
  fallbackLabel: string;
  fallbackDescription: string;
}> = [
  {
    type: "user",
    key: "user",
    fallbackLabel: "User input",
    fallbackDescription:
      "Show notes at user messages independently from map event filtering",
  },
  {
    type: "assistant_reply",
    key: "assistantReply",
    fallbackLabel: "Final AI reply",
    fallbackDescription:
      "Anchor each turn to its last assistant reply after the user message",
  },
  {
    type: "rename",
    key: "rename",
    fallbackLabel: "Rename",
    fallbackDescription: "Session name changes from session_info entries",
  },
  {
    type: "label",
    key: "label",
    fallbackLabel: "Label",
    fallbackDescription: "Label changes anchored to their target entry",
  },
  {
    type: "model",
    key: "model",
    fallbackLabel: "Model change",
    fallbackDescription: "model_change events",
  },
  {
    type: "thinking",
    key: "thinking",
    fallbackLabel: "Thinking level",
    fallbackDescription: "thinking_level_change events",
  },
  {
    type: "compaction",
    key: "compaction",
    fallbackLabel: "Compaction",
    fallbackDescription: "Context compaction events",
  },
  {
    type: "error",
    key: "error",
    fallbackLabel: "Error",
    fallbackDescription: "Errors, aborted turns, and failed tool results",
  },
];

export function GlobalMapToolbar({
  model,
  settings,
  onSettingsChange,
  compact = false,
}: GlobalMapToolbarProps): React.ReactElement {
  const { t } = useTranslation();
  const noteCounts = new Map<SemanticNoteType, number>();
  for (const note of model.notes) {
    noteCounts.set(note.type, (noteCounts.get(note.type) ?? 0) + 1);
  }
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
        aria-label={t(
          "components.branchMap.toolbar.eventFilter",
          "Global Map event filter",
        )}
      >
        {SCOPES.map((scope) => (
          <button
            key={scope.value}
            type="button"
            className={settings.scope === scope.value ? "is-active" : ""}
            aria-pressed={settings.scope === scope.value}
            title={t(
              `components.branchMap.scopes.${scope.key}.description`,
              scope.fallbackDescription,
            )}
            onClick={() =>
              onSettingsChange({ ...settings, scope: scope.value })
            }
          >
            {t(
              `components.branchMap.scopes.${scope.key}.label`,
              scope.fallbackLabel,
            )}
          </button>
        ))}
      </div>

      <details className="filter-menu notes-menu">
        <summary
          title={t(
            "components.branchMap.notes.summaryTitle",
            "Choose semantic notes overlaid on linear branch rails",
          )}
        >
          <NoteIcon />
          <span>{t("components.branchMap.notes.summary", "Notes")}</span>
          <b>{enabledNoteCount}</b>
        </summary>
        <div className="filter-popover">
          <div className="filter-popover-head">
            <div>
              <strong>{t("components.branchMap.notes.title", "Semantic notes")}</strong>
              <span>
                {t(
                  "components.branchMap.notes.description",
                  "Event overlays never become branch hierarchy.",
                )}
              </span>
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
                  <strong>
                    {t(
                      `components.branchMap.noteTypes.${item.key}.label`,
                      item.fallbackLabel,
                    )}
                  </strong>
                  <small>
                    {t(
                      `components.branchMap.noteTypes.${item.key}.description`,
                      item.fallbackDescription,
                    )}
                  </small>
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
              <strong>
                {t("components.branchMap.notes.smartLayout", "Smart layout")}
              </strong>
              <small>
                {t(
                  "components.branchMap.notes.smartLayoutDescription",
                  "Balance whitespace and spacing, collapse adjacent model or thinking events, and merge repeated user input as ×N.",
                )}
              </small>
            </span>
          </label>
          <div className="filter-popover-subhead">
            {t("components.branchMap.notes.mapLabels", "Map labels")}
          </div>
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
              <strong>
                {t(
                  "components.branchMap.notes.segmentLabels",
                  "Segment codes",
                )}
              </strong>
              <small>
                {t(
                  "components.branchMap.notes.segmentLabelsDescription",
                  "Show linear segment codes such as B0 and B0.1.",
                )}
              </small>
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
              <strong>
                {t("components.branchMap.notes.forkLabels", "Fork codes")}
              </strong>
              <small>
                {t(
                  "components.branchMap.notes.forkLabelsDescription",
                  "Show real fork codes such as F1 and F2.",
                )}
              </small>
            </span>
          </label>
        </div>
      </details>

      <details className="filter-menu model-menu">
        <summary
          title={t(
            "components.branchMap.models.summaryTitle",
            "Filter event markers by effective model",
          )}
        >
          <ModelIcon />
          <span>{t("components.branchMap.models.summary", "Models")}</span>
          <b>
            {settings.selectedModels.length ||
              t("components.branchMap.models.allShort", "All")}
          </b>
        </summary>
        <div className="filter-popover is-models">
          <div className="filter-popover-head">
            <div>
              <strong>
                {t("components.branchMap.models.title", "Effective model")}
              </strong>
              <span>
                {t(
                  "components.branchMap.models.description",
                  "Only event markers are filtered; all branch rails and forks remain.",
                )}
              </span>
            </div>
            <button
              type="button"
              className="text-action"
              onClick={() =>
                onSettingsChange({ ...settings, selectedModels: [] })
              }
            >
              {t("components.branchMap.models.all", "All")}
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
                      {t("components.branchMap.models.assistantEntries", {
                        assistants: formatNumber(stat.assistants),
                        entries: formatNumber(stat.entries),
                        defaultValue:
                          "{{assistants}} assistant · {{entries}} entries",
                      })}
                    </small>
                  </span>
                </label>
              ))
            ) : (
              <div className="filter-empty">
                {t(
                  "components.branchMap.models.empty",
                  "No model metadata in this session",
                )}
              </div>
            )}
          </div>
        </div>
      </details>

      <button
        type="button"
        className="map-axis-button"
        title={t(
          "components.branchMap.axis.title",
          "Switch vertical axis between path sequence and actual time",
        )}
        onClick={() =>
          onSettingsChange({
            ...settings,
            axis: settings.axis === "sequence" ? "time" : "sequence",
          })
        }
      >
        <FilterIcon />
        {settings.axis === "sequence"
          ? t("components.branchMap.axis.sequence", "Sequence")
          : t("components.branchMap.axis.time", "Time")}
      </button>
    </div>
  );
}
