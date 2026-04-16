import { useState, useEffect } from 'react';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/transport';
import SettingsCard from '@/components/settings/SettingsCard';
import {
  Package,
  FolderInput,
  History,
  FileCheck,
  AlertTriangle,
  X,
} from 'lucide-react';

interface BundleFileInfo {
  name: string;
  size: number;
  exists_locally: boolean;
  local_size?: number;
}

interface BundlePreview {
  file_count: number;
  total_size: number;
  files: BundleFileInfo[];
  created_at?: string;
}

interface ImportResult {
  imported_files: string[];
  backup_id?: string;
  backup_path?: string;
  warnings: string[];
  timestamp: string;
}

interface ImportHistoryEntry {
  id: string;
  timestamp: string;
  fileCount: number;
  files: string[];
  backupPath?: string;
}

interface FeedbackState {
  tone: 'success' | 'error' | 'info';
  message: string;
}

interface ConfirmDialogState {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'warning' | 'danger' | 'info';
  onConfirm: () => void | Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function ConfigBundleManager() {
  const { t } = useTranslation();

  const [preview, setPreview] = useState<BundlePreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([]);
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  // Load import history from localStorage on mount
  useEffect(() => {
    try {
      const history = localStorage.getItem('config-import-history');
      if (history) {
        setImportHistory(JSON.parse(history));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save import history when it changes
  useEffect(() => {
    if (importHistory.length > 0) {
      try {
        localStorage.setItem(
          'config-import-history',
          JSON.stringify(importHistory.slice(0, 20)) // Keep last 20
        );
      } catch {
        // Ignore storage errors
      }
    }
  }, [importHistory]);

  // Auto-dismiss feedback
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const pushFeedback = (tone: FeedbackState['tone'], message: string) => {
    setFeedback({ tone, message });
  };

  const openConfirm = (opts: Omit<ConfirmDialogState, 'onConfirm'> & { onConfirm: () => void | Promise<void> }) => {
    setConfirmDialog(opts);
  };

  // Export all configs to ZIP
  const handleExport = async () => {
    setBusy('export-config');
    try {
      const path = await saveDialog({
        title: t('settings.importExport.exportSection.title', 'Export Configuration'),
        defaultPath: `pi-config-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      });

      if (!path) return; // User cancelled

      await invoke<string>('export_config_bundle', { targetPath: path });
      pushFeedback('success', t('settings.importExport.exportSection.success', { path }));
    } catch (err) {
      pushFeedback('error', t('settings.importExport.exportSection.failed', { reason: String(err) }));
    } finally {
      setBusy(null);
    }
  };

  // Select file for import
  const handleSelectFile = async () => {
    const path = await openDialog({
      title: t('settings.importExport.importSection.title', 'Import Configuration'),
      multiple: false,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    });

    if (!path) return;

    setBusy('preview-import');
    try {
      const previewData = await invoke<BundlePreview>('preview_config_bundle', {
        bundlePath: path,
      });
      setSelectedPath(path);
      setPreview(previewData);
      setShowPreview(true);
    } catch (err) {
      pushFeedback('error', t('settings.importExport.importSection.failed', { reason: String(err) }));
    } finally {
      setBusy(null);
    }
  };

  // Confirm import
  const handleConfirmImport = async () => {
    if (!selectedPath) return;

    setShowPreview(false);
    setBusy('import-config');

    try {
      const result = await invoke<ImportResult>('import_config_bundle', {
        bundlePath: selectedPath,
        createBackup: true,
      });

      setLastImportResult(result);

      // Add to history
      const historyEntry: ImportHistoryEntry = {
        id: result.backup_id || Date.now().toString(),
        timestamp: result.timestamp,
        fileCount: result.imported_files.length,
        files: result.imported_files,
        backupPath: result.backup_path,
      };
      setImportHistory(prev => [historyEntry, ...prev].slice(0, 20));

      let message = t('settings.importExport.importSection.success', { count: result.imported_files.length });
      if (result.warnings.length > 0) {
        message += ` (${t('settings.importExport.importSection.warnings', { count: result.warnings.length })})`;
      }
      pushFeedback('success', message);

      if (result.warnings.length > 0) {
        console.warn('Import warnings:', result.warnings);
      }
    } catch (err) {
      pushFeedback('error', t('settings.importExport.importSection.failed', { reason: String(err) }));
    } finally {
      setBusy(null);
    }
  };

  // Restore from import backup
  const handleRestoreBackup = async (entry?: ImportHistoryEntry) => {
    const target = entry || importHistory[0];
    if (!target) {
      pushFeedback('error', t('settings.importExport.history.noBackup', 'No backup available'));
      return;
    }

    openConfirm({
      title: t('settings.importExport.history.restore', 'Restore'),
      description: t('settings.importExport.history.restoreConfirm', { timestamp: target.timestamp }),
      confirmLabel: t('settings.importExport.history.restore', 'Restore'),
      tone: 'warning' as const,
      onConfirm: async () => {
        setBusy('restore-backup');
        try {
          await invoke('restore_import_backup');
          pushFeedback('success', t('settings.importExport.history.restored', 'Configuration restored'));
        } catch (err) {
          pushFeedback('error', t('settings.importExport.history.restoreFailed', { reason: String(err) }));
        } finally {
          setBusy(null);
        }
        setConfirmDialog(null);
      },
    });
  };

  // Clear import history
  const handleClearHistory = () => {
    openConfirm({
      title: t('settings.importExport.history.clearHistory', 'Clear History'),
      description: t('settings.importExport.history.clearConfirm', 'This will clear all import history. Continue?'),
      confirmLabel: t('settings.importExport.history.clearHistory', 'Clear History'),
      tone: 'info' as const,
      onConfirm: () => {
        setImportHistory([]);
        localStorage.removeItem('config-import-history');
        pushFeedback('success', t('settings.importExport.history.cleared', 'History cleared'));
        setConfirmDialog(null);
      },
    });
  };

  const isBusy = busy !== null;

  return (
    <div className="space-y-6 relative">
      {/* Feedback Toast */}
      {feedback && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          feedback.tone === 'success' ? 'bg-success text-success-foreground' :
          feedback.tone === 'error' ? 'bg-destructive text-destructive-foreground' :
          'bg-info text-info-foreground'
        }`}>
          {feedback.message}
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                confirmDialog.tone === 'danger' ? 'text-destructive' :
                confirmDialog.tone === 'warning' ? 'text-amber-400' :
                'text-info'
              }`} />
              <div>
                <h3 className="text-base font-semibold text-foreground">{confirmDialog.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{confirmDialog.description}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface rounded-lg border border-border motion-color motion-press focus-ring"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={() => {
                  void Promise.resolve(confirmDialog.onConfirm());
                }}
                className={`px-4 py-2 text-sm text-white rounded-lg motion-color motion-press focus-ring ${
                  confirmDialog.tone === 'danger' ? 'bg-destructive hover:bg-destructive/90' :
                  confirmDialog.tone === 'warning' ? 'bg-amber-500 hover:bg-amber-600' :
                  'bg-info hover:bg-info/90'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Section */}
      <SettingsCard
        title={t('settings.importExport.exportSection.title', 'Export Configuration')}
        description={t('settings.importExport.exportSection.description', 'Package all configuration files into a ZIP archive')}
        icon={<Package className="h-4 w-4" />}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('settings.importExport.exportSection.includes', 'Includes: config.json, tags, favorites, marks and auth tokens')}
          </p>
          <button
            onClick={handleExport}
            disabled={isBusy}
            className="px-4 py-2 bg-info hover:bg-info/90 text-white text-sm font-medium rounded-lg motion-color motion-press focus-ring shadow-sm disabled:opacity-50"
          >
            {t('settings.importExport.exportSection.button', 'Export Configuration')}
          </button>
        </div>
      </SettingsCard>

      {/* Import Section */}
      <SettingsCard
        title={t('settings.importExport.importSection.title', 'Import Configuration')}
        description={t('settings.importExport.importSection.description', 'Import configuration from a ZIP archive (auto-backup current config)')}
        icon={<FolderInput className="h-4 w-4" />}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('settings.importExport.importSection.autoBackup', 'Current configuration will be automatically backed up before import')}
          </p>
          <button
            onClick={handleSelectFile}
            disabled={isBusy}
            className="px-4 py-2 bg-info hover:bg-info/90 text-white text-sm font-medium rounded-lg motion-color motion-press focus-ring shadow-sm disabled:opacity-50"
          >
            {t('settings.importExport.importSection.button', 'Select File')}
          </button>
        </div>
      </SettingsCard>

      {/* Import History */}
      <SettingsCard
        title={t('settings.importExport.history.title', 'Import History')}
        description={t('settings.importExport.history.description', 'Recent import operations')}
        icon={<History className="h-4 w-4" />}
      >
        {importHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('settings.importExport.history.noHistory', 'No import history yet')}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('settings.importExport.history.records', { count: importHistory.length })}</span>
              <button
                onClick={handleClearHistory}
                className="text-sm text-destructive hover:text-destructive/80 hover:bg-destructive/10 px-2 py-1 rounded-lg motion-color motion-press focus-ring"
              >
                {t('settings.importExport.history.clearHistory', 'Clear History')}
              </button>
            </div>
            <ul className="space-y-2">
              {importHistory.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between p-3 bg-surface/50 border border-border rounded-lg hover:border-border-hover/50 motion-surface motion-color"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{entry.timestamp}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {entry.fileCount} files: {entry.files.join(', ')}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestoreBackup(entry)}
                    disabled={isBusy}
                    className="px-3 py-1.5 text-sm text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg motion-color motion-press focus-ring disabled:opacity-50 flex-shrink-0"
                  >
                    {t('settings.importExport.history.restore', 'Restore')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SettingsCard>

      {/* Last Import Result */}
      {lastImportResult && (
        <SettingsCard
          title={t('settings.importExport.lastResult.title', 'Last Import Result')}
          description={lastImportResult.timestamp}
          icon={<FileCheck className="h-4 w-4" />}
        >
          <div className="space-y-2 text-sm text-foreground">
            <div>{t('settings.importExport.lastResult.files', 'Imported files')}: {lastImportResult.imported_files.join(', ')}</div>
            {lastImportResult.backup_path && (
              <div className="text-sm text-muted-foreground">
                {t('settings.importExport.lastResult.backup', 'Backup location')}: {lastImportResult.backup_path}
              </div>
            )}
            {lastImportResult.warnings.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-amber-400 hover:text-amber-300 motion-color">
                  {t('settings.importExport.lastResult.warnings', { count: lastImportResult.warnings.length })}
                </summary>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {lastImportResult.warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </SettingsCard>
      )}

      {/* Preview Dialog */}
      {showPreview && preview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-background/50">
              <h3 className="text-base font-semibold text-foreground tracking-tight">
                {t('settings.importExport.preview.title', 'Bundle Preview')}
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-surface rounded-lg motion-color motion-press focus-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {t('settings.importExport.preview.files', { count: preview.file_count, size: formatBytes(preview.total_size) })}
                  {preview.created_at && ` · ${t('settings.importExport.preview.created', { time: preview.created_at })}`}
                </div>

                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-surface/60">
                      <tr className="border-b border-border">
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('settings.importExport.preview.file', 'File')}</th>
                        <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('settings.importExport.preview.size', 'Size')}</th>
                        <th className="text-center py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('settings.importExport.preview.status', 'Status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.files.map((file) => (
                        <tr key={file.name} className="border-b border-border last:border-b-0 hover:bg-surface/30 motion-surface">
                          <td className="py-2.5 px-4 font-mono text-foreground">{file.name}</td>
                          <td className="py-2.5 px-4 text-right text-muted-foreground">{formatBytes(file.size)}</td>
                          <td className="py-2.5 px-4 text-center">
                            {file.exists_locally ? (
                              <span className="text-amber-400 text-xs font-medium">{t('settings.importExport.preview.willOverwrite', 'Will overwrite')}</span>
                            ) : (
                              <span className="text-success text-xs font-medium">{t('settings.importExport.preview.new', 'New')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowPreview(false)}
                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface rounded-lg border border-border motion-color motion-press focus-ring"
                  >
                    {t('settings.importExport.preview.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    className="px-4 py-2 text-sm text-white bg-info hover:bg-info/90 rounded-lg motion-color motion-press focus-ring shadow-sm"
                  >
                    {t('settings.importExport.preview.import', 'Import & Backup')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
