import { useState, useCallback, useEffect, useMemo } from "react";
import type { Tag, SessionTag } from "@/types";
import {
  assignRuntimeTag,
  createRuntimeTag,
  deleteRuntimeTag,
  evaluateRuntimeAutoRules,
  loadRuntimeTags,
  moveRuntimeSessionTag,
  removeRuntimeTagFromSession,
  reorderRuntimeTags,
  updateRuntimeTag,
  updateRuntimeTagAutoRules,
} from "@/runtime-data/tagsSource";

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [sessionTags, setSessionTags] = useState<SessionTag[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTags = useCallback(async () => {
    try {
      const state = await loadRuntimeTags();
      setTags(state.tags);
      setSessionTags(state.sessionTags);
    } catch (err) {
      console.error("Failed to load tags:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  const createTag = useCallback(
    async (name: string, color: string, icon?: string, parentId?: string) => {
      const tag = await createRuntimeTag(name, color, icon, parentId);
      setTags((prev) => [...prev, tag]);
      return tag;
    },
    [],
  );

  const updateTag = useCallback(
    async (
      id: string,
      updates: Partial<Pick<Tag, "name" | "color" | "icon">>,
    ) => {
      await updateRuntimeTag(id, updates);
      setTags((prev) =>
        prev.map((tag) => (tag.id === id ? { ...tag, ...updates } : tag)),
      );
    },
    [],
  );

  const deleteTag = useCallback(async (id: string) => {
    await deleteRuntimeTag(id);
    setTags((prev) => prev.filter((tag) => tag.id !== id));
    setSessionTags((prev) => prev.filter((tag) => tag.tagId !== id));
  }, []);

  const assignTag = useCallback(async (sessionId: string, tagId: string) => {
    await assignRuntimeTag(sessionId, tagId);
    setSessionTags((prev) => [
      ...prev.filter(
        (tag) => !(tag.sessionId === sessionId && tag.tagId === tagId),
      ),
      {
        sessionId,
        tagId,
        position: 0,
        assignedAt: new Date().toISOString(),
      },
    ]);
  }, []);

  const removeTagFromSession = useCallback(
    async (sessionId: string, tagId: string) => {
      await removeRuntimeTagFromSession(sessionId, tagId);
      setSessionTags((prev) =>
        prev.filter(
          (tag) => !(tag.sessionId === sessionId && tag.tagId === tagId),
        ),
      );
    },
    [],
  );

  const moveSession = useCallback(
    async (
      sessionId: string,
      fromTagId: string | null,
      toTagId: string,
      position: number,
    ) => {
      setSessionTags((prev) => {
        const next = fromTagId
          ? prev.filter(
              (tag) =>
                !(tag.sessionId === sessionId && tag.tagId === fromTagId),
            )
          : [...prev];
        return [
          ...next.filter(
            (tag) => !(tag.sessionId === sessionId && tag.tagId === toTagId),
          ),
          {
            sessionId,
            tagId: toTagId,
            position,
            assignedAt: new Date().toISOString(),
          },
        ];
      });

      try {
        await moveRuntimeSessionTag(sessionId, fromTagId, toTagId, position);
      } catch {
        await loadTags();
      }
    },
    [loadTags],
  );

  const reorderTags = useCallback(async (tagIds: string[]) => {
    setTags((prev) => {
      const map = new Map(prev.map((tag) => [tag.id, tag]));
      return tagIds
        .filter((id) => map.has(id))
        .map((id, index) => ({ ...map.get(id)!, sortOrder: index }));
    });
    await reorderRuntimeTags(tagIds);
  }, []);

  const tagsBySessionId = useMemo(() => {
    const sessionIdsByTagId = new Map<string, Set<string>>();
    for (const assignment of sessionTags) {
      let sessionIds = sessionIdsByTagId.get(assignment.tagId);
      if (!sessionIds) {
        sessionIds = new Set<string>();
        sessionIdsByTagId.set(assignment.tagId, sessionIds);
      }
      sessionIds.add(assignment.sessionId);
    }

    const indexed = new Map<string, Tag[]>();
    for (const tag of tags) {
      const sessionIds = sessionIdsByTagId.get(tag.id);
      if (!sessionIds) continue;
      for (const sessionId of sessionIds) {
        const sessionTagsForId = indexed.get(sessionId);
        if (sessionTagsForId) {
          sessionTagsForId.push(tag);
        } else {
          indexed.set(sessionId, [tag]);
        }
      }
    }
    return indexed;
  }, [tags, sessionTags]);

  const getTagsForSession = useCallback(
    (sessionId: string): Tag[] => tagsBySessionId.get(sessionId) ?? [],
    [tagsBySessionId],
  );

  const getSessionsForTag = useCallback(
    (tagId: string): SessionTag[] =>
      sessionTags
        .filter((tag) => tag.tagId === tagId)
        .sort((left, right) => left.position - right.position),
    [sessionTags],
  );

  const updateTagAutoRules = useCallback(
    async (id: string, rules: string | null) => {
      await updateRuntimeTagAutoRules(id, rules);
      setTags((prev) =>
        prev.map((tag) =>
          tag.id === id ? { ...tag, autoRules: rules ?? undefined } : tag,
        ),
      );
    },
    [],
  );

  const evaluateAutoRules = useCallback(
    async (sessionId: string, text: string) => {
      const matched = await evaluateRuntimeAutoRules(sessionId, text);
      if (matched.length > 0) await loadTags();
      return matched;
    },
    [loadTags],
  );

  const getDescendantIds = useCallback(
    (tagId: string): string[] => {
      const result: string[] = [];
      const children = tags.filter((tag) => tag.parentId === tagId);
      for (const child of children) {
        result.push(child.id);
        result.push(...getDescendantIds(child.id));
      }
      return result;
    },
    [tags],
  );

  const getRootTags = useCallback(
    (): Tag[] =>
      tags
        .filter((tag) => !tag.parentId)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [tags],
  );

  const getChildTags = useCallback(
    (parentId: string): Tag[] =>
      tags
        .filter((tag) => tag.parentId === parentId)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [tags],
  );

  return {
    tags,
    sessionTags,
    loading,
    loadTags,
    createTag,
    updateTag,
    deleteTag,
    assignTag,
    removeTagFromSession,
    moveSession,
    reorderTags,
    getTagsForSession,
    getSessionsForTag,
    updateTagAutoRules,
    evaluateAutoRules,
    getDescendantIds,
    getRootTags,
    getChildTags,
  };
}
