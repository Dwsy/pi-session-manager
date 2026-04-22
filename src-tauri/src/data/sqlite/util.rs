use super::deps::*;

pub(super) fn parse_timestamp(s: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(s).map(|dt| dt.with_timezone(&Utc)).unwrap_or_else(|_| Utc::now())
}
