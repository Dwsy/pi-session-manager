use crate::domain::casr_min::providers::ProviderKind;
use crate::domain::session_bridge::types::{CanonicalSession, MessageRole, SessionBridgeSource};

pub fn preview_canonical_for_target(canonical: &CanonicalSession, target: SessionBridgeSource) -> Result<String, String> {
    let kind: ProviderKind = target.into();
    kind.write_preview(canonical, &canonical.session_id)
}

pub fn preview_canonical_for_viewer(canonical: &CanonicalSession) -> Result<String, String> {
    let mut canonical = canonical.clone();
    canonical.messages.retain(|message| matches!(message.role, MessageRole::User | MessageRole::Assistant | MessageRole::Tool));
    for (index, message) in canonical.messages.iter_mut().enumerate() {
        message.idx = index;
    }
    preview_canonical_for_target(&canonical, SessionBridgeSource::Pi)
}
