#[derive(Debug, Clone, Copy)]
pub struct CommandRegistryEntry {
    pub command: &'static str,
    pub handler_fn: &'static str,
    pub route_kind: &'static str,
}

pub const COMMAND_REGISTRY: &[CommandRegistryEntry] = &[
    CommandRegistryEntry {
        command: "get_session_entries",
        handler_fn: "get_session_entries",
        route_kind: "path",
    },
    CommandRegistryEntry {
        command: "search_sessions_fts",
        handler_fn: "search_sessions_fts",
        route_kind: "query_limit",
    },
    CommandRegistryEntry {
        command: "get_session_stats_light",
        handler_fn: "get_session_stats_light",
        route_kind: "stats_inputs",
    },
];
