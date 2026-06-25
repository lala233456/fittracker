import { WebPlugin } from '@capacitor/core';

export interface FolderPickerPlugin {
  pickFolder(): Promise<{ uri: string; name: string }>;
  readFile(options: { uri: string; fileName: string }): Promise<{ content: string }>;
  writeFile(options: { uri: string; fileName: string; content: string }): Promise<void>;
  hasPersistedUri(): Promise<{ hasUri: boolean; uri: string; name: string }>;
}

export class FolderPickerWeb extends WebPlugin implements FolderPickerPlugin {
  async pickFolder(): Promise<{ uri: string; name: string }> {
    // Web fallback - not supported, throw error
    throw new Error('Folder picker not supported on web platform');
  }

  async readFile(): Promise<{ content: string }> {
    throw new Error('Not supported on web platform');
  }

  async writeFile(): Promise<void> {
    throw new Error('Not supported on web platform');
  }

  async hasPersistedUri(): Promise<{ hasUri: boolean; uri: string; name: string }> {
    return { hasUri: false, uri: '', name: '' };
  }
}
