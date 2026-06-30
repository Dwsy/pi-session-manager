import React, { memo } from "react";
import OpenAI from "@lobehub/icons/es/OpenAI";
import Claude from "@lobehub/icons/es/Claude";
import DeepSeek from "@lobehub/icons/es/DeepSeek";
import Gemini from "@lobehub/icons/es/Gemini";
import Meta from "@lobehub/icons/es/Meta";
import Mistral from "@lobehub/icons/es/Mistral";
import Qwen from "@lobehub/icons/es/Qwen";
import Grok from "@lobehub/icons/es/Grok";
import Anthropic from "@lobehub/icons/es/Anthropic";
import Google from "@lobehub/icons/es/Google";
import ByteDance from "@lobehub/icons/es/ByteDance";
import Cohere from "@lobehub/icons/es/Cohere";
import Zhipu from "@lobehub/icons/es/Zhipu";
import Moonshot from "@lobehub/icons/es/Moonshot";
import Baidu from "@lobehub/icons/es/Baidu";
import Tencent from "@lobehub/icons/es/Tencent";
import Perplexity from "@lobehub/icons/es/Perplexity";
import HuggingFace from "@lobehub/icons/es/HuggingFace";
import Ollama from "@lobehub/icons/es/Ollama";

interface ModelIconProps {
  model: string;
  size?: number;
  className?: string;
}

export const ModelIcon = memo(function ModelIcon({
  model,
  size = 12,
  className,
}: ModelIconProps) {
  const lower = model.toLowerCase();

  let IconComponent: React.ComponentType<{ size?: number | string; className?: string }> | null = null;

  if (lower.includes("claude") || lower.includes("sonnet") || lower.includes("haiku") || lower.includes("opus")) {
    IconComponent = Claude as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("anthropic")) {
    IconComponent = Anthropic as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("gpt") || lower.includes("openai") || lower.includes("o1") || lower.includes("o3") || lower.includes("codex") || lower.includes("chatgpt")) {
    IconComponent = OpenAI as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("deepseek")) {
    IconComponent = DeepSeek as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("gemini")) {
    IconComponent = Gemini as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("google") || lower.includes("gemma")) {
    IconComponent = Google as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("grok") || lower.includes("xai")) {
    IconComponent = Grok as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("qwen") || lower.includes("qwq") || lower.includes("alibaba")) {
    IconComponent = Qwen as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("mistral") || lower.includes("codestral") || lower.includes("mixtral")) {
    IconComponent = Mistral as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("llama") || lower.includes("meta")) {
    IconComponent = Meta as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("kimi") || lower.includes("moonshot")) {
    IconComponent = Moonshot as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("doubao") || lower.includes("bytedance")) {
    IconComponent = ByteDance as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("glm") || lower.includes("zhipu") || lower.includes("chatglm")) {
    IconComponent = Zhipu as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("hunyuan") || lower.includes("tencent")) {
    IconComponent = Tencent as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("baidu") || lower.includes("wenxin") || lower.includes("ernie")) {
    IconComponent = Baidu as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("cohere") || lower.includes("command")) {
    IconComponent = Cohere as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("perplexity") || lower.includes("sonar")) {
    IconComponent = Perplexity as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("hf") || lower.includes("huggingface")) {
    IconComponent = HuggingFace as React.ComponentType<{ size?: number | string; className?: string }>;
  } else if (lower.includes("ollama")) {
    IconComponent = Ollama as React.ComponentType<{ size?: number | string; className?: string }>;
  }

  if (!IconComponent) {
    return null;
  }

  return <IconComponent size={size} className={className} />;
});
