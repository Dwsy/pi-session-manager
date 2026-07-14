use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde_json::Value;
use std::time::Duration;

#[derive(Debug)]
pub enum HttpError {
    Auth,
    Other(String),
}

impl std::fmt::Display for HttpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Auth => write!(f, "authentication failed"),
            Self::Other(message) => write!(f, "{message}"),
        }
    }
}

pub struct HttpRequest {
    pub url: String,
    pub method: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Value>,
}

pub async fn http_json(request: HttpRequest) -> Result<Value, HttpError> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::limited(5)).build().map_err(|error| HttpError::Other(format!("Failed to build HTTP client: {error}")))?;

    let method = request.method.to_ascii_uppercase();
    let mut builder = match method.as_str() {
        "GET" => client.get(&request.url),
        "POST" => client.post(&request.url),
        other => return Err(HttpError::Other(format!("Unsupported HTTP method: {other}"))),
    };

    let mut headers = HeaderMap::new();
    for (key, value) in request.headers {
        let name = HeaderName::from_bytes(key.as_bytes()).map_err(|error| HttpError::Other(format!("Invalid header name `{key}`: {error}")))?;
        let header_value = HeaderValue::from_str(&value).map_err(|error| HttpError::Other(format!("Invalid header value for `{key}`: {error}")))?;
        headers.insert(name, header_value);
    }
    builder = builder.headers(headers);

    if let Some(body) = request.body {
        builder = builder.json(&body);
    }

    let response = builder.send().await.map_err(|error| HttpError::Other(format!("Request failed: {error}")))?;

    let status = response.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err(HttpError::Auth);
    }
    if !status.is_success() {
        return Err(HttpError::Other(format!("Request failed (HTTP {status})")));
    }

    response.json::<Value>().await.map_err(|error| HttpError::Other(format!("Invalid JSON response: {error}")))
}
