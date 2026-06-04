use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemFont {
    pub family: String,
    pub postscript_name: Option<String>,
}

/// List all installed font families on the system.
#[cfg(feature = "gui")]
#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<SystemFont>, String> {
    use font_kit::source::SystemSource;

    let source = SystemSource::new();
    let all_fonts = source.all_fonts().map_err(|e| format!("Failed to enumerate fonts: {e}"))?;

    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::with_capacity(all_fonts.len());

    for handle in all_fonts {
        if let Ok(font) = handle.load() {
            let family = font.family_name();
            if seen.insert(family.clone()) {
                result.push(SystemFont { family, postscript_name: font.postscript_name() });
            }
        }
    }

    result.sort_by_key(|a| a.family.to_lowercase());
    Ok(result)
}

/// List font families filtered by monospace property.
#[cfg(feature = "gui")]
#[tauri::command]
pub async fn list_monospace_fonts() -> Result<Vec<SystemFont>, String> {
    use font_kit::source::SystemSource;

    let source = SystemSource::new();
    let all_fonts = source.all_fonts().map_err(|e| format!("Failed to enumerate fonts: {e}"))?;

    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();

    for handle in all_fonts {
        if let Ok(font) = handle.load() {
            let family = font.family_name();
            if seen.contains(&family) {
                continue;
            }
            seen.insert(family.clone());

            if !font.is_monospace() {
                continue;
            }

            result.push(SystemFont { family, postscript_name: font.postscript_name() });
        }
    }

    result.sort_by_key(|a| a.family.to_lowercase());
    Ok(result)
}
