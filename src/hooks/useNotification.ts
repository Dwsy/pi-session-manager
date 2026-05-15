import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface NotificationOptions {
  title: string;
  body: string;
  sessionPath?: string;
}

export function useNotification() {
  const sendNotification = useCallback(async (options: NotificationOptions) => {
    try {
      await invoke('send_notification', {
        title: options.title,
        body: options.body,
        sessionPath: options.sessionPath || null,
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }, []);

  return { sendNotification };
}
