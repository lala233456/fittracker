package com.fittracker.app;

import com.getcapacitor.BridgeActivity;
import com.fittracker.app.folderpicker.FolderPickerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(FolderPickerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
