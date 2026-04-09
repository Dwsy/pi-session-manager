//! Test-only utilities for serializing process-global environment access.
//!
//! In Rust 2024, `std::env::set_var` / `std::env::remove_var` are `unsafe`
//! because concurrent reads/writes of the process environment are unsound.
//! The Rust test harness runs tests in parallel, so integration tests that set
//! provider home env vars must serialize *all* environment access within the
//! test binary.
//!
//! This module provides a single, re-entrant global lock. Many tests keep
//! provider-named lock statics (e.g. `CC_ENV`, `CODEX_ENV`) for readability;
//! those should all delegate to this same lock so that:
//! - env mutation is never concurrent with other env reads/mutations, and
//! - tests that acquire multiple provider locks do not deadlock (re-entrant).

use std::marker::PhantomData;
use std::rc::Rc;
use std::sync::LazyLock;
use std::sync::{Condvar, LockResult, Mutex};
use std::thread::ThreadId;

/// Zero-sized handle that locks the test-binary global environment lock.
#[derive(Copy, Clone, Debug)]
pub struct EnvLock;

impl EnvLock {
    pub fn lock(&'static self) -> LockResult<EnvLockGuard<'static>> {
        Ok(GLOBAL_ENV_LOCK.lock())
    }
}
pub struct EnvLockGuard<'a> {
    lock: &'a ReentrantMutex,
    // Prevent moving the guard across threads; drop must occur on the owning thread.
    _nosend: PhantomData<Rc<()>>,
}

impl Drop for EnvLockGuard<'_> {
    fn drop(&mut self) {
        self.lock.unlock();
    }
}

static GLOBAL_ENV_LOCK: LazyLock<ReentrantMutex> = LazyLock::new(ReentrantMutex::new);

struct ReentrantMutex {
    state: Mutex<State>,
    cvar: Condvar,
}

#[derive(Debug)]
struct State {
    owner: Option<ThreadId>,
    depth: usize,
}

impl ReentrantMutex {
    fn new() -> Self {
        Self {
            state: Mutex::new(State {
                owner: None,
                depth: 0,
            }),
            cvar: Condvar::new(),
        }
    }

    fn lock(&'static self) -> EnvLockGuard<'static> {
        let current = std::thread::current().id();
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());

        loop {
            match state.owner {
                None => {
                    state.owner = Some(current);
                    state.depth = 1;
                    break;
                }
                Some(owner) if owner == current => {
                    state.depth = state.depth.saturating_add(1);
                    break;
                }
                Some(_) => {
                    state = self.cvar.wait(state).unwrap_or_else(|e| e.into_inner());
                }
            }
        }

        EnvLockGuard {
            lock: self,
            _nosend: PhantomData,
        }
    }

    fn unlock(&self) {
        let current = std::thread::current().id();
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());

        debug_assert_eq!(state.owner, Some(current), "env lock owner mismatch");
        debug_assert!(state.depth > 0, "env lock depth invariant violated");

        state.depth = state.depth.saturating_sub(1);
        if state.depth == 0 {
            state.owner = None;
            self.cvar.notify_all();
        }
    }
}
