import { useMemo, type ReactNode } from "react";
import { Copy, Crosshair, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useClipboard } from "@/hooks/useClipboard";
import { entryRelationKey } from "@/components/session-branch-map/entryRelation";
import {
  formatMoney,
  formatNumber,
  formatTokens,
  nodePrimaryText,
  safeJson,
  type SessionModel,
} from "@/utils/session-branch";

import {
  assistantToolCallNames,
  formatLatency,
  observedToolSignature,
  type TraceStep,
} from "./traceModel";

type ToolTab = "summary" | "payload" | "result" | "schema" | "timing";
type MessageTab = "summary" | "preview" | "raw" | "source";
export type TraceInspectorTab = ToolTab | MessageTab;

const TOOL_TABS: ToolTab[] = ["summary", "payload", "result", "schema", "timing"];
const MESSAGE_TABS: MessageTab[] = ["summary", "preview", "raw", "source"];

interface TraceInspectorProps {
  model: SessionModel;
  step: TraceStep;
  tab: TraceInspectorTab;
  onTabChange: (tab: TraceInspectorTab) => void;
  onSelect: (uid: string) => void;
  onLocate: () => void;
  onClose: () => void;
}

export default function TraceInspector({
  model,
  step,
  tab,
  onTabChange,
  onSelect,
  onLocate,
  onClose,
}: TraceInspectorProps) {
  const { t } = useTranslation();
  const { copyText } = useClipboard();
  const tabs: TraceInspectorTab[] = step.tool ? TOOL_TABS : MESSAGE_TABS;
  const active = tabs.includes(tab) ? tab : "summary";

  return (
    <aside className="psm-trace-inspector" aria-label={t("components.trace.inspector", "Step inspector")}>
      <header className="psm-trace-inspector__header">
        <span className="psm-trace-badge" data-badge={step.badge}>
          {step.badge}
        </span>
        <span className="psm-trace-inspector__title">
          {t("components.trace.turnStep", "Turn {{turn}} · Step {{step}}", {
            turn: step.turn,
            step: step.step,
          })}
        </span>
        <button
          type="button"
          className="psm-trace-icon-button"
          onClick={onLocate}
          title={t("components.trace.locate", "Locate in session")}
          aria-label={t("components.trace.locate", "Locate in session")}
        >
          <Crosshair size={13} />
        </button>
        <button
          type="button"
          className="psm-trace-icon-button"
          onClick={onClose}
          title={t("components.trace.closeInspector", "Close inspector")}
          aria-label={t("components.trace.closeInspector", "Close inspector")}
        >
          <X size={13} />
        </button>
      </header>

      <div className="psm-trace-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={item === active}
            className={item === active ? "is-active" : ""}
            onClick={() => onTabChange(item)}
          >
            {t(`components.trace.tabs.${item}`, TAB_FALLBACK[item])}
          </button>
        ))}
      </div>

      <div className="psm-trace-inspector__body">
        {step.tool ? (
          <ToolInspector model={model} step={step} tab={active as ToolTab} onSelect={onSelect} />
        ) : (
          <MessageInspector step={step} tab={active as MessageTab} />
        )}
      </div>

      <footer className="psm-trace-inspector__footer">
        <code title={step.node.id}>{step.node.id}</code>
        <button
          type="button"
          className="psm-trace-icon-button"
          onClick={() => void copyText(step.node.id)}
          title={t("components.trace.copyId", "Copy entry ID")}
          aria-label={t("components.trace.copyId", "Copy entry ID")}
        >
          <Copy size={12} />
        </button>
      </footer>
    </aside>
  );
}

const TAB_FALLBACK: Record<TraceInspectorTab, string> = {
  summary: "Summary",
  payload: "Payload",
  result: "Result",
  schema: "Schema",
  timing: "Timing",
  preview: "Preview",
  raw: "Raw",
  source: "Source",
};

function ToolInspector({
  model,
  step,
  tab,
  onSelect,
}: {
  model: SessionModel;
  step: TraceStep;
  tab: ToolTab;
  onSelect: (uid: string) => void;
}) {
  const { t } = useTranslation();
  const tool = step.tool;
  const signature = useMemo(
    () => (tool ? observedToolSignature(model, tool.name) : null),
    [model, tool],
  );
  if (!tool || !signature) return null;

  const summary = tab === "summary";
  const sections: ReactNode[] = [];

  if (summary || tab === "payload") {
    sections.push(
      <Section key="payload" title={t("components.trace.tabs.payload", "Payload")} open>
        <pre className="psm-trace-code">{safeJson(tool.args)}</pre>
      </Section>,
    );
  }
  if (summary || tab === "result") {
    sections.push(
      <Section
        key="result"
        title={t("components.trace.tabs.result", "Result")}
        open
        meta={`${formatNumber(tool.result.length)} ch`}
      >
        <pre className={`psm-trace-code ${tool.isError ? "is-error" : ""}`}>
          {tool.result || t("components.trace.emptyResult", "(empty result)")}
        </pre>
      </Section>,
    );
  }
  if (summary || tab === "schema") {
    sections.push(
      <Section
        key="schema"
        title={t("components.trace.tabs.schema", "Schema")}
        open={!summary}
        meta={t("components.trace.observed", "observed")}
      >
        <div className="psm-trace-signature">
          <code>{signature.name}</code>
          <p>
            {t(
              "components.trace.signatureHint",
              "{{calls}} calls in this session, {{failures}} failed. Pi sessions do not store declared schemas, so this is the shape actually sent.",
              { calls: signature.calls, failures: signature.failures },
            )}
          </p>
          <ul>
            {signature.parameters.map((parameter) => (
              <li key={parameter.key}>
                <code>{parameter.key}</code>
                <span>{parameter.types.join(" | ")}</span>
                <span>{Math.round(parameter.presence * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>,
    );
  }
  if (summary || tab === "timing") {
    sections.push(
      <Section key="timing" title={t("components.trace.tabs.timing", "Timing")} open={!summary}>
        <dl className="psm-trace-facts">
          <dt>{t("components.trace.started", "Started")}</dt>
          <dd>{formatPreciseTime(step.startMs)}</dd>
          <dt>{t("components.trace.duration", "Duration")}</dt>
          <dd>{formatLatency(step.durationMs)}</dd>
          <dt>{t("components.trace.timingSource", "Source")}</dt>
          <dd>{t("components.trace.timingSourceValue", "Session timestamps")}</dd>
        </dl>
      </Section>,
    );
  }

  return (
    <>
      {summary ? (
        <dl className="psm-trace-facts">
          <dt>{t("components.trace.hierarchy", "Hierarchy")}</dt>
          <dd>
            {tool.callerUid ? (
              <button type="button" onClick={() => onSelect(tool.callerUid as string)}>
                {t("components.trace.callerLink", "Assistant message ›")}
              </button>
            ) : (
              "—"
            )}
          </dd>
          <dt>{t("components.trace.status", "Status")}</dt>
          <dd className={tool.isError ? "is-error" : "is-success"}>
            {tool.isError
              ? t("components.trace.failed", "Failed")
              : t("components.trace.completed", "Completed")}
          </dd>
          <dt>{t("components.trace.duration", "Duration")}</dt>
          <dd>{formatLatency(step.durationMs)}</dd>
        </dl>
      ) : null}
      {sections}
    </>
  );
}

function MessageInspector({ step, tab }: { step: TraceStep; tab: MessageTab }) {
  const { t } = useTranslation();
  const node = step.node;
  const body = nodePrimaryText(node);
  const message = node.entry.message;
  const model = node.actualModel ?? node.effectiveModel;
  const toolCalls = assistantToolCallNames(node);
  const status = message?.stopReason || (node.kind === "error" ? "error" : "");

  if (tab === "raw") {
    return <pre className="psm-trace-code">{safeJson(node.entry)}</pre>;
  }

  if (tab === "source") {
    return (
      <dl className="psm-trace-facts">
        <dt>{t("components.trace.entryType", "Entry type")}</dt>
        <dd>{node.entry.type}</dd>
        <dt>{t("components.trace.relation", "Relation")}</dt>
        <dd>{t(entryRelationKey(node))}</dd>
        <dt>{t("components.trace.segment", "Segment")}</dt>
        <dd>{node.segment?.code || "B?"}</dd>
        <dt>{t("components.trace.sequence", "Sequence")}</dt>
        <dd>#{formatNumber(node.sequence)}</dd>
        <dt>{t("components.trace.line", "Line")}</dt>
        <dd>{formatNumber(node.lineNo)}</dd>
        <dt>{t("components.trace.size", "Size")}</dt>
        <dd>{formatNumber(node.charLength)} ch</dd>
        <dt>{t("components.trace.parent", "Parent")}</dt>
        <dd title={node.parent?.id}>{node.parent?.id || "—"}</dd>
      </dl>
    );
  }

  const preview = (
    <Section key="preview" title={t("components.trace.tabs.preview", "Preview")} open>
      <pre className="psm-trace-code">
        {body || t("components.trace.emptyResult", "(empty result)")}
      </pre>
    </Section>
  );

  if (tab === "preview") return preview;

  return (
    <>
      <dl className="psm-trace-facts">
        <dt>{t("components.trace.source", "Source")}</dt>
        <dd>{model ? model.label : node.entry.type}</dd>
        <dt>{t("components.trace.status", "Status")}</dt>
        <dd className={step.isError ? "is-error" : "is-success"}>
          {step.isError
            ? status || t("components.trace.failed", "Failed")
            : t("components.trace.completed", "Completed")}
        </dd>
        <dt>{t("components.trace.duration", "Duration")}</dt>
        <dd>{formatLatency(step.durationMs)}</dd>
        {node.delta.totalTokens ? (
          <>
            <dt>{t("components.trace.tokens", "Tokens")}</dt>
            <dd>
              {formatTokens(node.delta.input)} in · {formatTokens(node.delta.output)} out ·{" "}
              {formatMoney(node.delta.cost)}
            </dd>
          </>
        ) : null}
        {toolCalls.length ? (
          <>
            <dt>{t("components.trace.toolCalls", "Tool calls")}</dt>
            <dd title={toolCalls.join(", ")}>{toolCalls.join(", ")}</dd>
          </>
        ) : null}
      </dl>
      {preview}
    </>
  );
}

function Section({
  title,
  meta,
  open,
  children,
}: {
  title: string;
  meta?: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="psm-trace-section" open={open}>
      <summary>
        {title}
        {meta ? <small>{meta}</small> : null}
      </summary>
      {children}
    </details>
  );
}

function formatPreciseTime(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const date = new Date(value);
  const pad = (input: number, size = 2) => String(input).padStart(size, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    `${pad(date.getMilliseconds(), 3)}`
  );
}
