import { registerPlugin } from '@capacitor/core';

const FolderPicker = registerPlugin('FolderPicker', {
  web: () => import('./web').then(m => m.FolderPickerWeb),
});

export default FolderPicker;
