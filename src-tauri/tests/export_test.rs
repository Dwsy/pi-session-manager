#[cfg(test)]
mod tests {
    use std::fs;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_export_html() {
        // 创建一个临时会话文件
        let temp_session = NamedTempFile::with_suffix(".jsonl").unwrap();
        let session_content = r#"{"type":"session","name":"Test Session","timestamp":"2024-01-01T00:00:00Z"}
{"type":"message","message":{"role":"user","content":[{"type":"text","text":"Hello"}]},"timestamp":"2024-01-01T00:00:01Z"}
{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"}]},"timestamp":"2024-01-01T00:00:02Z"}"#;
        fs::write(temp_session.path(), session_content).unwrap();

        let temp_output = NamedTempFile::with_suffix(".html").unwrap();

        // 测试导出
        let result = pi_session_manager::export::export_session(
            temp_session.path().to_str().unwrap(),
            "html",
            temp_output.path().to_str().unwrap()
        ).await;

        assert!(result.is_ok(), "Export should succeed: {:?}", result);

        // 验证输出文件存在且不为空
        let output_content = fs::read_to_string(temp_output.path()).unwrap();
        assert!(!output_content.is_empty(), "Output should not be empty");
        assert!(output_content.contains("<!DOCTYPE html>"), "Should be valid HTML");
        // PI 的 export 命令生成的 HTML 可能不直接包含会话名称，但应该包含会话数据
        assert!(output_content.contains("session-data") || output_content.contains("SESSION_DATA"), "Should contain session data");

        println!("✅ HTML export test passed!");
    }

    #[tokio::test]
    async fn test_export_json() {
        let temp_session = NamedTempFile::with_suffix(".jsonl").unwrap();
        let session_content = r#"{"type":"session","name":"Test Session","timestamp":"2024-01-01T00:00:00Z"}
{"type":"message","message":{"role":"user","content":[{"type":"text","text":"Hello"}]},"timestamp":"2024-01-01T00:00:01Z"}"#;
        fs::write(temp_session.path(), session_content).unwrap();

        let temp_output = NamedTempFile::with_suffix(".json").unwrap();

        let result = pi_session_manager::export::export_session(
            temp_session.path().to_str().unwrap(),
            "json",
            temp_output.path().to_str().unwrap()
        ).await;

        assert!(result.is_ok(), "Export should succeed: {:?}", result);

        let output_content = fs::read_to_string(temp_output.path()).unwrap();
        assert!(!output_content.is_empty(), "Output should not be empty");
        assert!(output_content.contains("["), "Should be JSON array");

        println!("✅ JSON export test passed!");
    }

    #[tokio::test]
    async fn test_export_markdown() {
        let temp_session = NamedTempFile::with_suffix(".jsonl").unwrap();
        let session_content = r#"{"type":"session","name":"Test Session","timestamp":"2024-01-01T00:00:00Z"}
{"type":"message","message":{"role":"user","content":[{"type":"text","text":"Hello"}]},"timestamp":"2024-01-01T00:00:01Z"}"#;
        fs::write(temp_session.path(), session_content).unwrap();

        let temp_output = NamedTempFile::with_suffix(".md").unwrap();

        let result = pi_session_manager::export::export_session(
            temp_session.path().to_str().unwrap(),
            "md",
            temp_output.path().to_str().unwrap()
        ).await;

        assert!(result.is_ok(), "Export should succeed: {:?}", result);

        let output_content = fs::read_to_string(temp_output.path()).unwrap();
        assert!(!output_content.is_empty(), "Output should not be empty");
        assert!(output_content.contains("# Test Session"), "Should contain session header");

        println!("✅ Markdown export test passed!");
    }
}