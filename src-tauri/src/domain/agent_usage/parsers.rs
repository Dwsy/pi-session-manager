use super::types::AgentUsageMetric;
use serde_json::Value;

#[derive(Debug, Default)]
pub struct ParsedUsage {
    pub plan_name: Option<String>,
    pub rows: Vec<AgentUsageMetric>,
}

pub fn parse_claude_rows(payload: &Value) -> ParsedUsage {
    let plan_name = first_string(payload, &[&["plan", "display_name"], &["plan", "name"], &["plan_name"], &["planName"], &["subscription", "plan"]]);
    let specs = [("five_hour", "5h"), ("seven_day", "7d"), ("seven_day_sonnet", "7d Sonnet"), ("seven_day_omelette", "7d Omelette")];
    let mut rows = Vec::new();
    for (key, label) in specs {
        let Some(window) = payload.get(key) else { continue };
        let value = first_number(window, &["utilization", "used_percent", "usedPercent"]);
        let reset_at = first_date(window, &["resets_at", "reset_at", "resetAt", "window_end"]);
        if value.is_none() && reset_at.is_none() {
            continue;
        }
        rows.push(metric(label, value, reset_at, value.map(|v| format!("{v:.1}% used"))));
    }
    ParsedUsage { plan_name, rows }
}

pub fn parse_codex_rows(payload: &Value) -> ParsedUsage {
    let raw_plan = first_string(payload, &[&["plan_type"], &["planType"], &["account", "plan"], &["plan"], &["plan_name"], &["planName"]]).unwrap_or_default();
    let plan_name = match raw_plan.to_ascii_lowercase().as_str() {
        "prolite" => Some("Pro 5x".to_string()),
        "pro" => Some("Pro 20x".to_string()),
        "" => None,
        other => Some(other.to_string()),
    };

    if let Some(rate_limit) = payload.get("rate_limit") {
        let mut rows = Vec::new();
        if let Some(row) = row_for_window(rate_limit.get("primary_window"), "5h") {
            rows.push(row);
        }
        if let Some(row) = row_for_window(rate_limit.get("secondary_window"), "7d") {
            rows.push(row);
        }
        if let Some(row) = row_for_window(payload.pointer("/code_review_rate_limit/primary_window"), "Reviews") {
            rows.push(row);
        }
        return ParsedUsage { plan_name, rows };
    }

    ParsedUsage { plan_name, rows: parse_generic_windows(payload, &[("monthly", "Monthly"), ("daily", "Daily"), ("hourly", "Hourly"), ("current_billing_period", "Billing")]) }
}

pub fn parse_amp_rows(payload: &Value) -> ParsedUsage {
    let plan_name = first_string(payload, &[&["plan"], &["plan_name"], &["planName"], &["subscription", "plan"], &["product", "name"]]);
    let text = first_string(payload, &[&["result", "displayText"], &["result", "display_text"]]).unwrap_or_default();
    if text.is_empty() {
        return ParsedUsage { plan_name, rows: Vec::new() };
    }

    let mut rows = Vec::new();
    if let Some((remaining, total)) = capture_two_numbers(&text, r"\$([0-9]+(?:\.[0-9]+)?)\s*/\s*\$([0-9]+(?:\.[0-9]+)?)\s*remaining") {
        let used = (total - remaining).max(0.0);
        rows.push(metric("Free balance", percent(used, total), None, Some(format!("{used:.2}/{total:.2}"))));
    }
    if let Some(credits) = capture_one_number(&text, r"Individual credits:\s*\$([0-9]+(?:\.[0-9]+)?)\s*remaining") {
        rows.push(metric("Credits", None, None, Some(format!("${credits:.2}"))));
    }
    ParsedUsage { plan_name, rows }
}

pub fn parse_antigravity_rows(payload: &Value) -> ParsedUsage {
    let groups = payload.pointer("/response/groups").or_else(|| payload.get("groups")).and_then(Value::as_array).cloned().unwrap_or_default();
    let buckets: Vec<Value> = groups.into_iter().flat_map(|group| group.get("buckets").and_then(Value::as_array).cloned().unwrap_or_default()).collect();

    let specs = [("gemini-5h", "Session"), ("gemini-weekly", "Weekly"), ("3p-5h", "Claude"), ("3p-weekly", "Claude Weekly")];
    let mut rows = Vec::new();
    for (bucket_id, label) in specs {
        let Some(bucket) = buckets.iter().find(|item| item.get("bucketId").and_then(Value::as_str) == Some(bucket_id)) else {
            continue;
        };
        let Some(remaining) = number_or_null(bucket.get("remainingFraction")) else { continue };
        let used = ((1.0 - remaining) * 100.0).clamp(0.0, 100.0);
        rows.push(metric(label, Some(used.round()), first_date(bucket, &["resetTime", "resetAt", "reset_at"]), Some(format!("{used:.0}/100"))));
    }
    ParsedUsage { plan_name: None, rows }
}

pub fn parse_copilot_rows(payload: &Value) -> ParsedUsage {
    let plan_name = first_string(payload, &[&["copilot_plan"], &["plan"], &["plan_name"], &["planName"], &["product", "name"], &["subscription", "plan"]]);
    let quota_reset_at = first_date(payload, &["quota_reset_date"]);
    let limited_reset_at = first_date(payload, &["limited_user_reset_date"]);
    let reset_at = quota_reset_at.clone().or(limited_reset_at.clone());
    let mut rows = Vec::new();

    if let Some(snapshots) = payload.get("quota_snapshots").and_then(Value::as_object) {
        for (key, item) in snapshots {
            let limit = first_number(item, &["entitlement", "quota", "limit"]);
            let remaining = first_number(item, &["remaining"]);
            let percent_remaining = first_number(item, &["percent_remaining"]);
            let value = if let Some(remaining_pct) = percent_remaining {
                Some((100.0 - remaining_pct).clamp(0.0, 100.0))
            } else if let (Some(limit), Some(remaining)) = (limit, remaining) {
                percent(limit - remaining, limit)
            } else {
                None
            };
            let detail = match (limit, remaining) {
                (Some(limit), Some(remaining)) => Some(format!("{:.0}/{:.0}", limit - remaining, limit)),
                _ => None,
            };
            rows.push(metric(&display_label(key), value, reset_at.clone(), detail));
        }
    }

    if let (Some(lq), Some(mq), Some(reset)) = (payload.get("limited_user_quotas"), payload.get("monthly_quotas"), limited_reset_at) {
        if let (Some(chat_remaining), Some(chat_total)) = (first_number(lq, &["chat"]), first_number(mq, &["chat"])) {
            if chat_total > 0.0 {
                let used = (chat_total - chat_remaining).max(0.0);
                rows.push(metric("Chat", percent(used, chat_total), Some(reset.clone()), Some(format!("{used:.0}/{chat_total:.0}"))));
            }
        }
        if let (Some(comp_remaining), Some(comp_total)) = (first_number(lq, &["completions"]), first_number(mq, &["completions"])) {
            if comp_total > 0.0 {
                let used = (comp_total - comp_remaining).max(0.0);
                rows.push(metric("Completions", percent(used, comp_total), Some(reset), Some(format!("{used:.0}/{comp_total:.0}"))));
            }
        }
    }

    rows.retain(|row| row.used_percent.is_some() || row.reset_at.is_some() || row.detail.is_some());
    ParsedUsage { plan_name, rows }
}

pub fn parse_devin_rows(payload: &Value) -> ParsedUsage {
    let user_status = payload.get("userStatus").cloned().unwrap_or(Value::Null);
    let plan_status = user_status.get("planStatus").cloned().unwrap_or(Value::Null);
    let plan_info = plan_status.get("planInfo").cloned().unwrap_or(Value::Null);
    let plan_name = first_string(&plan_info, &[&["planName"]]).or_else(|| Some("Unknown".to_string()));
    let hide_daily = plan_info.get("hideDailyQuota").and_then(Value::as_bool).unwrap_or(false);
    let mut rows = Vec::new();

    if let Some(daily_remaining) = number_or_null(plan_status.get("dailyQuotaRemainingPercent")) {
        if !hide_daily {
            let used = (100.0 - daily_remaining).clamp(0.0, 100.0);
            rows.push(metric("Daily quota", Some(used), unix_seconds_date(plan_status.get("dailyQuotaResetAtUnix")), Some(format!("{used:.0}/100"))));
        }
    }

    if let Some(weekly_remaining) = number_or_null(plan_status.get("weeklyQuotaRemainingPercent")) {
        let used = (100.0 - weekly_remaining).clamp(0.0, 100.0);
        rows.push(metric("Weekly quota", Some(used), unix_seconds_date(plan_status.get("weeklyQuotaResetAtUnix")), Some(format!("{used:.0}/100"))));
    } else if hide_daily {
        if let Some(daily_remaining) = number_or_null(plan_status.get("dailyQuotaRemainingPercent")) {
            let used = (100.0 - daily_remaining).clamp(0.0, 100.0);
            rows.push(metric("Weekly quota", Some(used), unix_seconds_date(plan_status.get("weeklyQuotaResetAtUnix")), Some(format!("{used:.0}/100"))));
        }
    }

    if let Some(overage) = number_or_null(plan_status.get("overageBalanceMicros")) {
        rows.push(metric("Extra usage balance", None, None, Some(format!("${:.2}", overage.max(0.0) / 1_000_000.0))));
    }

    ParsedUsage { plan_name, rows }
}

pub fn parse_kimi_rows(payload: &Value) -> ParsedUsage {
    let membership = first_string(payload, &[&["user", "membership", "level"]]);
    let plan_name = membership
        .map(|level| {
            level
                .trim_start_matches("LEVEL_")
                .replace('_', " ")
                .split_whitespace()
                .map(|part| {
                    let mut chars = part.chars();
                    match chars.next() {
                        Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str().to_ascii_lowercase()),
                        None => String::new(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        })
        .or_else(|| first_string(payload, &[&["plan"], &["plan_name"], &["planName"], &["data", "plan"], &["product"], &["product_name"]]));

    let data = payload.get("data").cloned().unwrap_or_else(|| payload.clone());
    let mut candidates = Vec::new();
    if let Some(limits) = data.get("limits").and_then(Value::as_array) {
        for item in limits {
            let detail = item.get("detail").unwrap_or(item);
            if let Some(quota) = parse_quota(detail) {
                candidates.push((quota, parse_window_secs(item.get("window"))));
            }
        }
    }

    candidates.sort_by(|a, b| a.1.unwrap_or(f64::INFINITY).partial_cmp(&b.1.unwrap_or(f64::INFINITY)).unwrap_or(std::cmp::Ordering::Equal));
    let session = candidates.first().cloned();
    let weekly = parse_quota(data.get("usage").unwrap_or(&Value::Null)).or_else(|| candidates.get(1).map(|(quota, _)| quota.clone()));

    let mut rows = Vec::new();
    if let Some((ref quota, period)) = session {
        rows.push(quota_row("Session", quota, period));
    }
    if let Some(quota) = weekly {
        if session.as_ref().map(|(q, _)| q) != Some(&quota) {
            rows.push(quota_row("Weekly", &quota, None));
        }
    }
    ParsedUsage { plan_name, rows }
}

pub fn parse_factory_rows(payload: &Value) -> ParsedUsage {
    let plan_name = first_string(payload, &[&["plan_name"], &["planName"], &["usage", "plan_name"], &["usage", "planName"]]);
    let Some(usage) = payload.get("usage") else {
        return ParsedUsage { plan_name, rows: Vec::new() };
    };
    let end_at = first_date(usage, &["endDate", "end_date"]);
    let mut rows = Vec::new();
    if let Some(row) = factory_bucket_row("Standard", usage.get("standard"), end_at.clone()) {
        rows.push(row);
    }
    if let Some(row) = factory_bucket_row("Premium", usage.get("premium"), end_at) {
        rows.push(row);
    }
    ParsedUsage { plan_name, rows }
}

pub fn parse_openrouter_credits_rows(payload: &Value) -> Vec<AgentUsageMetric> {
    let data = payload.get("data").cloned().unwrap_or_else(|| payload.clone());
    let Some(total_usage) = number_or_null(data.get("total_usage")) else {
        return Vec::new();
    };
    let used = total_usage.max(0.0);
    let total_credits = number_or_null(data.get("total_credits")).unwrap_or(0.0).max(0.0);
    let mut rows = Vec::new();
    if total_credits > 0.0 {
        rows.push(metric("Credits", percent(used, total_credits), None, Some(format!("{used:.2}/{total_credits:.2}"))));
    }
    rows.push(metric("Balance", None, None, Some(format!("${:.2}", (total_credits - used).max(0.0)))));
    rows
}

pub fn parse_openrouter_key_rows(payload: &Value) -> ParsedUsage {
    let data = payload.get("data").cloned().unwrap_or_else(|| payload.clone());
    let mut rows = Vec::new();
    append_currency_value(&mut rows, "Today", data.get("usage_daily"));
    append_currency_value(&mut rows, "This Week", data.get("usage_weekly"));
    append_currency_value(&mut rows, "This Month", data.get("usage_monthly"));
    if let Some(limit) = number_or_null(data.get("limit")) {
        if limit > 0.0 {
            let used = number_or_null(data.get("usage")).unwrap_or(0.0).max(0.0);
            rows.push(metric("Key Limit", percent(used, limit), None, Some(format!("{used:.2}/{limit:.2}"))));
        }
    }
    let plan_name = data.get("is_free_tier").and_then(Value::as_bool).map(|free| if free { "Free tier".to_string() } else { "Pay as you go".to_string() });
    ParsedUsage { plan_name, rows }
}

pub fn parse_minimax_rows(payload: &Value) -> ParsedUsage {
    let plan_name = first_string(payload, &[&["data", "plan_name"], &["data", "planName"], &["data", "result", "plan_name"], &["data", "result", "planName"]]);
    let candidates = [payload, payload.get("data").unwrap_or(&Value::Null), payload.pointer("/data/result").unwrap_or(&Value::Null), payload.get("result").unwrap_or(&Value::Null)];
    for candidate in candidates {
        let remains = candidate.get("model_remains").or_else(|| candidate.get("modelRemains")).and_then(Value::as_array);
        let Some(remains) = remains else { continue };
        if remains.is_empty() {
            continue;
        }
        let selected = remains.iter().find(|item| first_number(item, &["current_interval_total_count", "currentIntervalTotalCount", "total", "limit"]).unwrap_or(0.0) > 0.0).unwrap_or(&remains[0]);
        if let Some((used, total)) = parse_limit(selected, &["current_interval_total_count", "currentIntervalTotalCount", "total", "limit"], &["current_interval_remaining_count", "currentIntervalRemainingCount", "remaining", "remains"]) {
            let reset_at = first_date(selected, &["end_time", "endTime", "reset_at", "resetAt"]);
            return ParsedUsage { plan_name, rows: vec![metric("Session", percent(used, total), reset_at, Some(format!("{used:.0}/{total:.0}")))] };
        }
    }
    ParsedUsage { plan_name, rows: parse_generic_windows(payload, &[("monthly", "Monthly"), ("daily", "Daily"), ("requests", "Requests")]) }
}

pub fn parse_zai_rows(payload: &Value, plan_name: Option<String>) -> ParsedUsage {
    let limits = payload.pointer("/data/limits").or_else(|| payload.get("limits")).or_else(|| payload.get("data")).and_then(Value::as_array).cloned().unwrap_or_default();
    let token_limits: Vec<&Value> = limits.iter().filter(|item| upper_string(item, &["limitType", "type", "name"]) == "TOKENS_LIMIT").collect();
    let session = token_limits.iter().find(|item| item.get("unit").and_then(Value::as_i64) == Some(3) || window_text(item).contains('5')).or_else(|| token_limits.first()).copied();
    let weekly = token_limits.iter().find(|item| item.get("unit").and_then(Value::as_i64) == Some(6) || window_text(item).contains('7') || window_text(item).contains("WEEK")).copied();
    let mcp = limits.iter().find(|item| upper_string(item, &["limitType", "type", "name"]) == "TIME_LIMIT");

    let mut rows = Vec::new();
    if let Some(session) = session {
        if let Some(row) = zai_quota_row("Session", session) {
            rows.push(row);
        }
    }
    if let Some(weekly) = weekly {
        if Some(weekly) != session {
            if let Some(row) = zai_quota_row("Weekly", weekly) {
                rows.push(row);
            }
        }
    }
    if let Some(mcp) = mcp {
        if let Some(row) = zai_quota_row("MCP", mcp) {
            rows.push(row);
        }
    }
    ParsedUsage { plan_name, rows }
}

pub fn parse_zai_plan_name(payload: &Value) -> Option<String> {
    payload.get("data").and_then(Value::as_array).into_iter().flatten().find_map(|item| first_string(item, &[&["productName"], &["product_name"], &["name"]]))
}

pub fn parse_grok_rows(payload: &Value) -> ParsedUsage {
    let Some(config) = payload.get("config") else {
        return ParsedUsage::default();
    };
    if let Some(period) = config.get("currentPeriod") {
        let period_type = first_string(period, &[&["type"]]).unwrap_or_default();
        let period_start = first_date(period, &["start"]);
        let period_end = first_date(period, &["end"]);
        if period_type.is_empty() || period_start.is_none() || period_end.is_none() {
            return ParsedUsage::default();
        }
        let mut rows = Vec::new();
        if period_type == "USAGE_PERIOD_TYPE_WEEKLY" {
            let remaining_percent = number_or_null(config.get("creditUsagePercent")).unwrap_or(100.0).clamp(0.0, 100.0);
            let used_percent = 100.0 - remaining_percent;
            rows.push(metric("Weekly limit", Some(used_percent.clamp(0.0, 100.0)), period_end, Some(format!("{used_percent:.1}% used"))));
        }
        let on_demand_cap = number_or_null(config.pointer("/onDemandCap/val")).unwrap_or(0.0);
        rows.push(metric("Pay as you go", None, None, Some(if on_demand_cap > 0.0 { format!("{on_demand_cap:.0} cap") } else { "Disabled".to_string() })));
        return ParsedUsage { plan_name: None, rows };
    }

    let used = number_or_null(config.pointer("/used/val"));
    let limit = number_or_null(config.pointer("/monthlyLimit/val"));
    match (used, limit) {
        (Some(used), Some(limit)) if limit > 0.0 => ParsedUsage { plan_name: None, rows: vec![metric("Credits", percent(used, limit), first_date(config, &["billingPeriodEnd"]), Some(format!("{used:.0} / {limit:.0} units")))] },
        _ => ParsedUsage::default(),
    }
}

pub fn parse_cursor_rows(payload: &Value) -> ParsedUsage {
    let plan_name = first_string(payload, &[&["planInfo", "planName"]]);
    let Some(plan_usage) = payload.get("planUsage") else {
        return ParsedUsage { plan_name, rows: Vec::new() };
    };
    let Some(limit) = number_or_null(plan_usage.get("limit")) else {
        return ParsedUsage { plan_name, rows: Vec::new() };
    };
    if limit <= 0.0 {
        return ParsedUsage { plan_name, rows: Vec::new() };
    }
    let total_spend = number_or_null(plan_usage.get("totalSpend")).unwrap_or(0.0);
    let pct = first_number(plan_usage, &["totalPercentUsed"]).unwrap_or_else(|| ((total_spend / limit) * 100.0).clamp(0.0, 100.0));
    ParsedUsage { plan_name, rows: vec![metric("Monthly", Some(pct), first_date(payload, &["billingCycleEnd"]), Some(format!("${:.2} / ${:.2}", total_spend / 100.0, limit / 100.0)))] }
}

pub fn parse_opencode_go_rows(rows: &[(i64, f64)], now_ms: i64) -> Vec<AgentUsageMetric> {
    const SESSION_LIMIT: f64 = 12.0;
    const WEEKLY_LIMIT: f64 = 30.0;
    const MONTHLY_LIMIT: f64 = 60.0;
    const FIVE_HOURS_MS: i64 = 5 * 60 * 60 * 1000;
    const WEEK_MS: i64 = 7 * 24 * 60 * 60 * 1000;

    let session_cost = sum_range(rows, now_ms - FIVE_HOURS_MS, now_ms);
    let weekly_start = start_of_utc_week(now_ms);
    let weekly_cost = sum_range(rows, weekly_start, weekly_start + WEEK_MS);
    let anchor_ms = rows.iter().map(|(created, _)| *created).min();
    let (monthly_start, monthly_end) = start_of_anchor_month(now_ms, anchor_ms);
    let monthly_cost = sum_range(rows, monthly_start, monthly_end);
    let session_reset = next_rolling_reset(rows, now_ms, FIVE_HOURS_MS);

    vec![
        metric("Session", percent(session_cost, SESSION_LIMIT), Some(chrono::DateTime::from_timestamp_millis(session_reset).map(|dt| dt.to_rfc3339()).unwrap_or_default()), Some(format!("{session_cost:.2} / {SESSION_LIMIT} credits"))),
        metric("Weekly", percent(weekly_cost, WEEKLY_LIMIT), Some(chrono::DateTime::from_timestamp_millis(weekly_start + WEEK_MS).map(|dt| dt.to_rfc3339()).unwrap_or_default()), Some(format!("{weekly_cost:.2} / {WEEKLY_LIMIT} credits"))),
        metric("Monthly", percent(monthly_cost, MONTHLY_LIMIT), Some(chrono::DateTime::from_timestamp_millis(monthly_end).map(|dt| dt.to_rfc3339()).unwrap_or_default()), Some(format!("{monthly_cost:.2} / {MONTHLY_LIMIT} credits"))),
    ]
}

fn metric(label: &str, used_percent: Option<f64>, reset_at: Option<String>, detail: Option<String>) -> AgentUsageMetric {
    AgentUsageMetric { label: label.to_string(), used_percent, reset_at: reset_at.filter(|value| !value.is_empty()), detail, remaining: None, limit: None, unit: None }
}

fn row_for_window(window: Option<&Value>, fallback_label: &str) -> Option<AgentUsageMetric> {
    let window = window?;
    let value = first_number(window, &["used_percent"]);
    let reset_at = first_date(window, &["reset_at"]);
    if value.is_none() && reset_at.is_none() {
        return None;
    }
    let label = match first_number(window, &["limit_window_seconds"]) {
        Some(18000.0) => "5h",
        Some(604800.0) if fallback_label != "Reviews" => "7d",
        _ => fallback_label,
    };
    Some(metric(label, value, reset_at, value.map(|v| format!("{v:.1}% used"))))
}

fn parse_generic_windows(payload: &Value, keys: &[(&str, &str)]) -> Vec<AgentUsageMetric> {
    let mut rows = Vec::new();
    for (key, label) in keys {
        if let Some(window) = payload.get(*key) {
            if let Some(row) = row_for_window(Some(window), label) {
                rows.push(row);
            }
        }
    }
    rows
}

fn factory_bucket_row(label: &str, bucket: Option<&Value>, reset_at: Option<String>) -> Option<AgentUsageMetric> {
    let bucket = bucket?;
    let limit = first_number(bucket, &["totalAllowance", "total_allowance"])?;
    if limit <= 0.0 {
        return None;
    }
    let used = first_number(bucket, &["orgTotalTokensUsed", "org_total_tokens_used", "tokensUsed", "tokens_used", "used"]).unwrap_or(0.0);
    Some(metric(label, percent(used, limit), reset_at, Some(format!("{used:.0} / {limit:.0} tokens"))))
}

fn parse_limit(item: &Value, total_keys: &[&str], remaining_keys: &[&str]) -> Option<(f64, f64)> {
    let total = first_number(item, total_keys)?;
    let remaining = first_number(item, remaining_keys);
    let used = first_number(item, &["used_count", "current_interval_used_count", "currentIntervalUsedCount", "used"]).or_else(|| remaining.map(|value| total - value));
    let used = used?;
    if total <= 0.0 {
        return None;
    }
    Some((used, total))
}

#[derive(Debug, Clone, PartialEq)]
struct Quota {
    used: f64,
    limit: f64,
    reset_at: Option<String>,
}

fn parse_quota(item: &Value) -> Option<Quota> {
    let limit = first_number(item, &["limit", "max", "total"])?;
    if limit <= 0.0 {
        return None;
    }
    let direct_used = first_number(item, &["used", "current"]);
    let remaining = first_number(item, &["remaining", "remains", "left"]);
    let used = direct_used.or_else(|| remaining.map(|value| (limit - value).max(0.0)))?;
    Some(Quota { used: used.min(limit), limit, reset_at: first_date(item, &["resetTime", "reset_at", "resetAt", "reset_time"]) })
}

fn quota_row(label: &str, quota: &Quota, _period_secs: Option<f64>) -> AgentUsageMetric {
    let value = percent(quota.used, quota.limit);
    metric(label, value, quota.reset_at.clone(), value.map(|v| format!("{v:.1}% used")))
}

fn parse_window_secs(window: Option<&Value>) -> Option<f64> {
    let window = window?;
    let duration = first_number(window, &["duration"])?;
    let unit = upper_string(window, &["timeUnit", "time_unit"]);
    if unit.contains("MINUTE") {
        Some(duration * 60.0)
    } else if unit.contains("HOUR") {
        Some(duration * 3600.0)
    } else if unit.contains("DAY") {
        Some(duration * 86400.0)
    } else if unit.contains("SECOND") {
        Some(duration)
    } else {
        None
    }
}

fn zai_quota_row(label: &str, item: &Value) -> Option<AgentUsageMetric> {
    let (used, total) = parse_limit(item, &["limit", "total", "max"], &["remaining", "remains", "left"])?;
    Some(metric(label, percent(used, total), first_date(item, &["resetTime", "reset_at", "resetAt", "endTime", "end_time"]), Some(format!("{used:.0}/{total:.0}"))))
}

fn append_currency_value(rows: &mut Vec<AgentUsageMetric>, label: &str, value: Option<&Value>) {
    if let Some(amount) = number_or_null(value) {
        rows.push(metric(label, None, None, Some(format!("${amount:.2}"))));
    }
}

fn percent(used: f64, total: f64) -> Option<f64> {
    if total <= 0.0 {
        None
    } else {
        Some(((used / total) * 100.0).clamp(0.0, 100.0))
    }
}

fn first_string(value: &Value, paths: &[&[&str]]) -> Option<String> {
    for path in paths {
        let mut current = value;
        let mut ok = true;
        for key in *path {
            match current.get(*key) {
                Some(next) => current = next,
                None => {
                    ok = false;
                    break;
                }
            }
        }
        if !ok {
            continue;
        }
        if let Some(text) = current.as_str().map(str::trim).filter(|text| !text.is_empty()) {
            return Some(text.to_string());
        }
        if current.is_string() {
            continue;
        }
        if let Some(text) = current.as_i64().map(|n| n.to_string()) {
            return Some(text);
        }
    }
    None
}

fn first_number(value: &Value, keys: &[&str]) -> Option<f64> {
    for key in keys {
        if let Some(number) = number_or_null(value.get(*key)) {
            return Some(number);
        }
    }
    None
}

fn number_or_null(value: Option<&Value>) -> Option<f64> {
    let value = value?;
    if let Some(number) = value.as_f64() {
        return Some(number);
    }
    if let Some(number) = value.as_i64() {
        return Some(number as f64);
    }
    if let Some(text) = value.as_str() {
        return text.trim().parse::<f64>().ok();
    }
    None
}

fn first_date(value: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(raw) = value.get(*key) {
            if let Some(text) = raw.as_str().map(str::trim).filter(|text| !text.is_empty()) {
                if chrono::DateTime::parse_from_rfc3339(text).is_ok() {
                    return Some(text.to_string());
                }
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(text, "%Y-%m-%dT%H:%M:%S%.fZ") {
                    return Some(chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(dt, chrono::Utc).to_rfc3339());
                }
                if let Ok(dt) = chrono::NaiveDate::parse_from_str(text, "%Y-%m-%d") {
                    return Some(chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(dt.and_hms_opt(0, 0, 0)?, chrono::Utc).to_rfc3339());
                }
            }
            if let Some(secs) = raw.as_i64() {
                if let Some(dt) = chrono::DateTime::from_timestamp(secs, 0) {
                    return Some(dt.to_rfc3339());
                }
            }
            if let Some(secs) = raw.as_f64() {
                if let Some(dt) = chrono::DateTime::from_timestamp(secs as i64, 0) {
                    return Some(dt.to_rfc3339());
                }
            }
        }
    }
    None
}

fn unix_seconds_date(value: Option<&Value>) -> Option<String> {
    let secs = number_or_null(value)? as i64;
    chrono::DateTime::from_timestamp(secs, 0).map(|dt| dt.to_rfc3339())
}

fn upper_string(value: &Value, keys: &[&str]) -> String {
    first_number_or_string(value, keys).to_ascii_uppercase()
}

fn first_number_or_string(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(text) = value.get(*key).and_then(Value::as_str) {
            return text.to_string();
        }
        if let Some(number) = number_or_null(value.get(*key)) {
            return number.to_string();
        }
    }
    String::new()
}

fn window_text(value: &Value) -> String {
    first_number_or_string(value, &["window", "name", "label", "unit"]).to_ascii_uppercase()
}

fn display_label(value: &str) -> String {
    value
        .replace('_', " ")
        .split_whitespace()
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn capture_one_number(text: &str, pattern: &str) -> Option<f64> {
    let re = regex_lite::Regex::new(pattern).ok()?;
    let caps = re.captures(text)?;
    caps.get(1)?.as_str().parse().ok()
}

fn capture_two_numbers(text: &str, pattern: &str) -> Option<(f64, f64)> {
    let re = regex_lite::Regex::new(pattern).ok()?;
    let caps = re.captures(text)?;
    let a = caps.get(1)?.as_str().parse().ok()?;
    let b = caps.get(2)?.as_str().parse().ok()?;
    Some((a, b))
}

fn sum_range(rows: &[(i64, f64)], start_ms: i64, end_ms: i64) -> f64 {
    let mut total = 0.0;
    for (created, cost) in rows {
        if *created >= start_ms && *created < end_ms {
            total += *cost;
        }
    }
    (total * 10000.0).round() / 10000.0
}

fn start_of_utc_week(now_ms: i64) -> i64 {
    let date = chrono::DateTime::from_timestamp_millis(now_ms).unwrap_or_else(chrono::Utc::now);
    let weekday = date.weekday().num_days_from_monday() as i64;
    let start = date.date_naive() - chrono::Duration::days(weekday);
    start.and_hms_opt(0, 0, 0).map(|dt| dt.and_utc().timestamp_millis()).unwrap_or(now_ms)
}

fn days_in_utc_month(year: i32, month: u32) -> u32 {
    let next_month = if month == 12 { 1 } else { month + 1 };
    let next_year = if month == 12 { year + 1 } else { year };
    let start = chrono::NaiveDate::from_ymd_opt(year, month, 1).unwrap();
    let end = chrono::NaiveDate::from_ymd_opt(next_year, next_month, 1).unwrap();
    (end - start).num_days() as u32
}

fn start_of_anchor_month(now_ms: i64, anchor_ms: Option<i64>) -> (i64, i64) {
    let now = chrono::DateTime::from_timestamp_millis(now_ms).unwrap_or_else(chrono::Utc::now);
    let Some(anchor_ms) = anchor_ms else {
        let start = chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1).and_then(|d| d.and_hms_opt(0, 0, 0)).map(|dt| dt.and_utc().timestamp_millis()).unwrap_or(now_ms);
        let end = if now.month() == 12 { chrono::NaiveDate::from_ymd_opt(now.year() + 1, 1, 1) } else { chrono::NaiveDate::from_ymd_opt(now.year(), now.month() + 1, 1) }.and_then(|d| d.and_hms_opt(0, 0, 0)).map(|dt| dt.and_utc().timestamp_millis()).unwrap_or(now_ms);
        return (start, end);
    };
    let anchor_day = chrono::DateTime::from_timestamp_millis(anchor_ms).map(|dt| dt.day()).unwrap_or(1);
    let mut year = now.year();
    let mut month = now.month();
    let mut day = anchor_day.min(days_in_utc_month(year, month));
    let mut start = chrono::NaiveDate::from_ymd_opt(year, month, day).and_then(|d| d.and_hms_opt(0, 0, 0)).map(|dt| dt.and_utc().timestamp_millis()).unwrap_or(now_ms);
    if start > now_ms {
        if month == 1 {
            month = 12;
            year -= 1;
        } else {
            month -= 1;
        }
        day = anchor_day.min(days_in_utc_month(year, month));
        start = chrono::NaiveDate::from_ymd_opt(year, month, day).and_then(|d| d.and_hms_opt(0, 0, 0)).map(|dt| dt.and_utc().timestamp_millis()).unwrap_or(now_ms);
    }
    let (end_year, end_month) = if month == 12 { (year + 1, 1) } else { (year, month + 1) };
    let end = chrono::NaiveDate::from_ymd_opt(end_year, end_month, anchor_day.min(days_in_utc_month(end_year, end_month))).and_then(|d| d.and_hms_opt(0, 0, 0)).map(|dt| dt.and_utc().timestamp_millis()).unwrap_or(now_ms);
    (start, end)
}

fn next_rolling_reset(rows: &[(i64, f64)], now_ms: i64, window_ms: i64) -> i64 {
    let mut latest = now_ms;
    for (created, _) in rows {
        if *created <= now_ms {
            latest = latest.max(*created);
        }
    }
    latest + window_ms
}

// Minimal regex helpers without adding a heavy dependency if regex_lite is unavailable.
// Prefer a tiny hand-rolled approach for the two Amp patterns if needed.
mod regex_lite {
    pub struct Regex {
        pattern: String,
    }

    impl Regex {
        pub fn new(pattern: &str) -> Result<Self, ()> {
            Ok(Self { pattern: pattern.to_string() })
        }

        pub fn captures<'a>(&self, text: &'a str) -> Option<Captures<'a>> {
            // Only used for two Amp patterns with a single or double capture group of numbers.
            if self.pattern.contains("Individual credits") {
                let marker = "Individual credits:";
                let idx = text.find(marker)?;
                let rest = &text[idx + marker.len()..];
                let dollar = rest.find('$')?;
                let after = &rest[dollar + 1..];
                let number = take_number(after)?;
                return Some(Captures { groups: vec![number], _marker: std::marker::PhantomData });
            }

            // $a / $b remaining
            let mut chars = text.char_indices().peekable();
            while let Some((_, ch)) = chars.next() {
                if ch != '$' {
                    continue;
                }
                let start = chars.peek().map(|(i, _)| *i)?;
                let first = take_number(&text[start..])?;
                let after_first = start + first.len();
                let rest = &text[after_first..];
                let slash = rest.find('/')?;
                let after_slash = &rest[slash + 1..];
                let dollar2 = after_slash.find('$')?;
                let second_src = &after_slash[dollar2 + 1..];
                let second = take_number(second_src)?;
                let after_second = &second_src[second.len()..];
                if after_second.to_ascii_lowercase().contains("remaining") {
                    return Some(Captures { groups: vec![first, second], _marker: std::marker::PhantomData });
                }
            }
            None
        }
    }

    pub struct Captures<'a> {
        groups: Vec<&'a str>,
        _marker: std::marker::PhantomData<&'a ()>,
    }

    impl<'a> Captures<'a> {
        pub fn get(&self, index: usize) -> Option<Match<'a>> {
            self.groups.get(index - 1).map(|text| Match { text })
        }
    }

    pub struct Match<'a> {
        text: &'a str,
    }

    impl<'a> Match<'a> {
        pub fn as_str(&self) -> &'a str {
            self.text
        }
    }

    fn take_number(text: &str) -> Option<&str> {
        let bytes = text.as_bytes();
        let mut i = 0;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i == 0 {
            return None;
        }
        if i < bytes.len() && bytes[i] == b'.' {
            let start = i + 1;
            let mut j = start;
            while j < bytes.len() && bytes[j].is_ascii_digit() {
                j += 1;
            }
            if j > start {
                i = j;
            }
        }
        Some(&text[..i])
    }
}

use chrono::{Datelike, Timelike};
