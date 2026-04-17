pub mod bootstrap;
mod deps;
pub mod details_cache;
pub mod favorites;
pub mod legacy_fts;
pub mod maintenance;
pub mod message_index;
pub mod migrations;
pub mod scan_state;
pub mod schema;
pub mod sessions;
pub mod subagent_meta;
pub mod tags;
pub mod types;
mod util;

pub use bootstrap::{
    get_db_path, get_primary_db_path, init_db, init_db_with_config, init_db_with_path,
};
pub use details_cache::{get_session_details_cache, upsert_session_details_cache};
pub use favorites::{
    add_favorite, get_all_favorites, is_favorite, remove_favorite, toggle_favorite,
};
pub use legacy_fts::{full_rebuild_fts, search_fts5};
pub use maintenance::{
    cleanup_missing_files, clear_all_cache, delete_session, delete_sessions_by_source_slugs,
    get_cached_file_modified, get_session_count, needs_reindexing, optimize_database,
    preload_recent_sessions, vacuum,
};
pub use message_index::{
    append_message_entries, delete_message_entries_for_session, ensure_message_fts_schema,
    insert_message_entries, search_message_fts, upsert_message_entries,
};
pub use scan_state::{
    delete_scan_state, get_all_scan_state, get_scan_state, update_scan_state_offset_and_trust,
    upsert_scan_state, upsert_scan_state_for_session,
};
pub use sessions::{
    get_all_cached_file_modified, get_all_sessions, get_all_sessions_for_list, get_session,
    get_sessions_modified_after, get_sessions_modified_before, upsert_session,
};
pub use subagent_meta::{get_cached_subagent_meta, upsert_subagent_meta};
pub use tags::{
    assign_tag, create_tag, delete_tag, get_all_session_tags, get_all_tags, move_session_tag,
    remove_tag_from_session, reorder_tags, update_tag,
};
pub use types::{DbFavoriteItem, DbSessionTag, DbTag, SessionDetailsCache};
