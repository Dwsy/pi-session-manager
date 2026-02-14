use flate2::read::{GzDecoder, GzEncoder};
use flate2::Compression;
use std::io::Read;

pub fn gzip_compress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = GzEncoder::new(data, Compression::default());
    let mut compressed = Vec::new();
    encoder
        .read_to_end(&mut compressed)
        .map_err(|e| format!("Gzip compression failed: {e}"))?;
    Ok(compressed)
}

pub fn gzip_decompress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = GzDecoder::new(data);
    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| format!("Gzip decompression failed: {e}"))?;
    Ok(decompressed)
}

pub fn gzip_compress_to_base64(data: &[u8]) -> Result<String, String> {
    let compressed = gzip_compress(data)?;
    Ok(base64_encode(&compressed))
}

pub fn gzip_decompress_from_base64(encoded: &str) -> Result<Vec<u8>, String> {
    let compressed = base64_decode(encoded)?;
    gzip_decompress(&compressed)
}

fn base64_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data)
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .map_err(|e| format!("Base64 decode failed: {e}"))
}
