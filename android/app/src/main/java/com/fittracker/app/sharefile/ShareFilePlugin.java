package com.fittracker.app.sharefile;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.MimeTypeMap;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;

@CapacitorPlugin(name = "ShareFile")
public class ShareFilePlugin extends Plugin {

    @PluginMethod
    public void shareFile(PluginCall call) {
        String content = call.getString("content", "");
        String fileName = call.getString("fileName", "fittracker-backup.json");
        String mimeType = call.getString("mimeType", "application/json");
        String title = call.getString("title", "FitTracker 数据备份");
        String text = call.getString("text", "健身训练数据备份文件");

        if (content.isEmpty()) {
            call.reject("Content is empty");
            return;
        }

        try {
            // Write content to a cache file
            File cacheDir = getContext().getCacheDir();
            File shareFile = new File(cacheDir, fileName);

            // Delete existing file if present
            if (shareFile.exists()) {
                shareFile.delete();
            }

            // Write JSON content
            OutputStreamWriter writer = new OutputStreamWriter(
                new FileOutputStream(shareFile), "UTF-8");
            writer.write(content);
            writer.flush();
            writer.close();

            // Create share Intent
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            shareIntent.putExtra(Intent.EXTRA_TEXT, text);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            // Use FileProvider to get a content URI (required for Android 7+)
            // Capacitor provides FileProvider automatically
            Uri fileUri = androidx.core.content.FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                shareFile
            );

            shareIntent.putExtra(Intent.EXTRA_STREAM, fileUri);

            // Create chooser Intent so user can pick where to share
            Intent chooserIntent = Intent.createChooser(shareIntent, title);
            chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            getContext().startActivity(chooserIntent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("filePath", shareFile.getAbsolutePath());
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("Failed to share file: " + e.getMessage());
        }
    }
}
