package com.fittracker.app;

import com.getcapacitor.BridgeActivity;
import com.fittracker.app.folderpicker.FolderPickerPlugin;
import com.fittracker.app.sharefile.ShareFilePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(FolderPickerPlugin.class);
        registerPlugin(ShareFilePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
