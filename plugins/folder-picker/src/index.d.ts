declare module '@capacitor/core' {
  interface PluginRegistry {
    FolderPicker: FolderPickerPlugin;
  }
}

export interface FolderPickerPlugin {
  pickFolder(): Promise<{ uri: string; name: string }>;
  readFile(options: { uri: string; fileName: string }): Promise<{ content: string }>;
  writeFile(options: { uri: string; fileName: string; content: string }): Promise<void>;
  hasPersistedUri(): Promise<{ hasUri: boolean; uri: string; name: string }>;
}
