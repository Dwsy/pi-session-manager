import { useEffect, useMemo, useState } from "react";
import type { PsmSessionJsonlEntry } from "@pi-session-manager/plugin-sdk";

import {
  AtlasDialog,
  GlobalMap,
  readBranchMapSettings,
  writeBranchMapSettings,
} from "@/components/session-branch-map";
import {
  buildSessionBranchModel,
  resolveBranchNavigation,
  type GlobalMapSettings,
} from "@/utils/session-branch";

interface SessionGraphViewProps {
  entries: PsmSessionJsonlEntry[];
  labelsByTargetId?: Record<string, string>;
  activeEntryId?: string | null;
  onNavigate?: (leafId: string, targetId: string) => void;
}

export default function SessionGraphView({
  entries,
  labelsByTargetId = {},
  activeEntryId,
  onNavigate,
}: SessionGraphViewProps) {
  const model = useMemo(
    () =>
      entries.length > 0
        ? buildSessionBranchModel(entries, {
            labelsByTargetId,
            sessionName: "Branch Map",
          })
        : null,
    [entries, labelsByTargetId],
  );
  const activeLeafUid = model
    ? ((activeEntryId ? model.firstById.get(activeEntryId)?.uid : undefined) ??
      model.defaultLeaf.uid)
    : "";
  const [selectedUid, setSelectedUid] = useState(activeLeafUid);
  const [settings, setSettings] = useState<GlobalMapSettings>(
    readBranchMapSettings,
  );
  const [atlasOpen, setAtlasOpen] = useState(false);

  useEffect(() => {
    if (!model) return;
    setSelectedUid((current) =>
      model.uidMap.has(current) ? current : activeLeafUid,
    );
  }, [activeLeafUid, model]);

  useEffect(() => {
    writeBranchMapSettings(settings);
  }, [settings]);

  const activateNode = (uid: string) => {
    const node = model?.uidMap.get(uid);
    if (!node) return;
    const navigation = resolveBranchNavigation(model, node);
    setSelectedUid(navigation.leafUid);
    onNavigate?.(navigation.leafId, navigation.targetId);
  };

  if (!model) {
    return (
      <div className="branch-map-empty" role="status">
        No session entries available for Branch Map.
      </div>
    );
  }

  return (
    <div className="branch-map-view">
      <GlobalMap
        model={model}
        activeLeafUid={activeLeafUid}
        selectedUid={selectedUid}
        settings={settings}
        collapsed={false}
        onCollapsedChange={() => {}}
        onSettingsChange={setSettings}
        onSelectNode={setSelectedUid}
        onActivateNode={activateNode}
        onOpenAtlas={() => setAtlasOpen(true)}
      />
      <AtlasDialog
        open={atlasOpen}
        model={model}
        activeLeafUid={activeLeafUid}
        selectedUid={selectedUid}
        settings={settings}
        onSettingsChange={setSettings}
        onSelectNode={setSelectedUid}
        onActivateNode={activateNode}
        onClose={() => setAtlasOpen(false)}
      />
    </div>
  );
}

export const resolveBranchMapNavigation = resolveBranchNavigation;
