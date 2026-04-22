use std::path::{Path, PathBuf};

use casr::discovery::{ProviderRegistry, SourceHint};
use casr::pipeline::{ConversionPipeline, ConvertOptions};

use crate::domain::session_bridge::SessionBridgeConvertResult;
use crate::domain::session_bridge::{CanonicalMessage, CanonicalSession, MessageRole, SessionBridgeSource, ToolCall, ToolResult};

fn registry() -> ProviderRegistry {
    ProviderRegistry::default_registry()
}

fn casr_slug_from_target(target: SessionBridgeSource) -> &'static str {
    match target {
        SessionBridgeSource::Pi => "pi-agent",
        SessionBridgeSource::ClaudeCode => "claude-code",
        SessionBridgeSource::Codex => "codex",
        SessionBridgeSource::OpenCode => "opencode",
        SessionBridgeSource::Gemini => "gemini",
        SessionBridgeSource::Factory => "factory",
        SessionBridgeSource::ClawdBot => "clawdbot",
    }
}

fn session_bridge_source_from_casr_slug(slug: &str) -> Result<SessionBridgeSource, String> {
    match slug {
        "pi-agent" | "pi" => Ok(SessionBridgeSource::Pi),
        "claude-code" => Ok(SessionBridgeSource::ClaudeCode),
        "codex" => Ok(SessionBridgeSource::Codex),
        "opencode" => Ok(SessionBridgeSource::OpenCode),
        "gemini" => Ok(SessionBridgeSource::Gemini),
        "factory" => Ok(SessionBridgeSource::Factory),
        "clawdbot" => Ok(SessionBridgeSource::ClawdBot),
        other => Err(format!("Unsupported CASR provider slug: {other}")),
    }
}

fn role_from_casr(role: &casr::model::MessageRole) -> MessageRole {
    match role {
        casr::model::MessageRole::User => MessageRole::User,
        casr::model::MessageRole::Assistant => MessageRole::Assistant,
        casr::model::MessageRole::Tool => MessageRole::Tool,
        casr::model::MessageRole::System => MessageRole::System,
        casr::model::MessageRole::Other(other) => MessageRole::Other(other.clone()),
    }
}

fn canonical_from_casr(session: casr::model::CanonicalSession) -> CanonicalSession {
    CanonicalSession {
        session_id: session.session_id,
        provider_slug: match session.provider_slug.as_str() {
            "pi-agent" => "pi-agent".to_string(),
            other => other.to_string(),
        },
        workspace: session.workspace,
        title: session.title,
        started_at: session.started_at,
        ended_at: session.ended_at,
        messages: session
            .messages
            .into_iter()
            .map(|message| CanonicalMessage {
                idx: message.idx,
                role: role_from_casr(&message.role),
                content: message.content,
                timestamp: message.timestamp,
                author: message.author,
                tool_calls: message.tool_calls.into_iter().map(|call| ToolCall { id: call.id, name: call.name, arguments: call.arguments }).collect(),
                tool_results: message.tool_results.into_iter().map(|result| ToolResult { call_id: result.call_id, content: result.content, is_error: result.is_error }).collect(),
                extra: message.extra,
            })
            .collect(),
        metadata: session.metadata,
        source_path: session.source_path,
        model_name: session.model_name,
    }
}

fn session_id_hint_from_path(path: &Path) -> String {
    path.file_stem().and_then(|stem| stem.to_str()).filter(|stem| !stem.trim().is_empty()).unwrap_or("session").to_string()
}

pub fn read_canonical_session_from_path(path: &Path) -> Result<(SessionBridgeSource, CanonicalSession), String> {
    let registry = registry();
    let session_id = session_id_hint_from_path(path);
    let resolved = registry.resolve_session(&session_id, Some(&SourceHint::Path(path.to_path_buf()))).map_err(|error| error.to_string())?;
    let source = session_bridge_source_from_casr_slug(resolved.provider.slug())?;
    let canonical = resolved.provider.read_session(&resolved.path).map_err(|error| error.to_string())?;
    Ok((source, canonical_from_casr(canonical)))
}

pub fn convert_session_format(path: &Path, target: SessionBridgeSource, force: bool) -> Result<SessionBridgeConvertResult, String> {
    let registry = registry();
    let pipeline = ConversionPipeline { registry };
    let result = pipeline.convert(casr_slug_from_target(target), &session_id_hint_from_path(path), ConvertOptions { dry_run: false, force, verbose: false, enrich: false, source_hint: Some(path.to_string_lossy().to_string()) }).map_err(|error| error.to_string())?;

    let source = session_bridge_source_from_casr_slug(&result.source_provider)?;
    let written = result.written;
    let (written_paths, target_session_id, resume_command) = if let Some(written) = written {
        let paths = if written.paths.is_empty() { vec![path.to_path_buf()] } else { written.paths };
        (paths, written.session_id, written.resume_command)
    } else {
        (vec![path.to_path_buf()], result.canonical_session.session_id.clone(), String::new())
    };

    Ok(SessionBridgeConvertResult {
        source_provider: source.display_name().to_string(),
        target_provider: target.display_name().to_string(),
        source_session_id: result.canonical_session.session_id.clone(),
        target_session_id,
        written_paths: written_paths.into_iter().map(|value| value.to_string_lossy().to_string()).collect(),
        resume_command,
        dry_run: false,
        warnings: result.warnings,
    })
}
