#[path = "sqlite_cache/bootstrap.rs"]
pub mod bootstrap;
#[path = "sqlite_cache/deps.rs"]
mod deps;
#[path = "sqlite_cache/details_cache.rs"]
pub mod details_cache;
#[path = "sqlite_cache/favorites.rs"]
pub mod favorites;
#[path = "sqlite_cache/legacy_fts.rs"]
pub mod legacy_fts;
#[path = "sqlite_cache/maintenance.rs"]
pub mod maintenance;
#[path = "sqlite_cache/message_index.rs"]
pub mod message_index;
#[path = "sqlite_cache/migrations.rs"]
pub mod migrations;
#[path = "sqlite_cache/schema.rs"]
pub mod schema;
#[path = "sqlite_cache/sessions.rs"]
pub mod sessions;
#[path = "sqlite_cache/subagent_meta.rs"]
pub mod subagent_meta;
#[path = "sqlite_cache/tags.rs"]
pub mod tags;
#[path = "sqlite_cache/types.rs"]
pub mod types;
#[path = "sqlite_cache/util.rs"]
mod util;

pub use bootstrap::{get_db_path, init_db, init_db_with_config, init_db_with_path};
pub use details_cache::{get_session_details_cache, upsert_session_details_cache};
pub use favorites::{
    add_favorite, get_all_favorites, is_favorite, remove_favorite, toggle_favorite,
};
pub use legacy_fts::{full_rebuild_fts, search_fts5};
pub use maintenance::{
    cleanup_missing_files, clear_all_cache, delete_session, get_cached_file_modified,
    get_session_count, needs_reindexing, optimize_database, preload_recent_sessions, vacuum,
};
pub use message_index::{
    delete_message_entries_for_session, ensure_message_fts_schema, insert_message_entries,
    search_message_fts, upsert_message_entries,
};
pub use sessions::{
    get_all_sessions, get_session, get_sessions_modified_after, get_sessions_modified_before,
    upsert_session,
};
pub use subagent_meta::{get_cached_subagent_meta, upsert_subagent_meta};
pub use tags::{
    assign_tag, create_tag, delete_tag, evaluate_auto_rules, get_all_session_tags, get_all_tags,
    move_session_tag, remove_tag_from_session, reorder_tags, update_tag, update_tag_auto_rules,
};
pub use types::{DbFavoriteItem, DbSessionTag, DbTag, SessionDetailsCache};
