package com.fittracker.app.folderpicker;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.webkit.MimeTypeMap;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;

@CapacitorPlugin(name = "FolderPicker")
public class FolderPickerPlugin extends Plugin {

    private static final int PICK_FOLDER_REQUEST = 10001;
    private static final String PREFS_NAME = "FitTrackerFolderPrefs";
    private static final String PREF_KEY_URI = "persisted_folder_uri";
    private static final String PREF_KEY_NAME = "persisted_folder_name";

    private PluginCall savedCall;

    @PluginMethod
    public void pickFolder(PluginCall call) {
        savedCall = call;

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION |
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
                        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
                        Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);

        startActivityForResult(call, intent, PICK_FOLDER_REQUEST);
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        String uriStr = call.getString("uri");
        String fileName = call.getString("fileName", "fittracker-data.json");

        if (uriStr == null || uriStr.isEmpty()) {
            call.reject("Folder URI is required");
            return;
        }

        try {
            Uri folderUri = Uri.parse(uriStr);
            ContentResolver resolver = getContext().getContentResolver();

            // Find the file inside the folder
            Uri fileUri = findFileUri(resolver, folderUri, fileName);

            if (fileUri == null) {
                JSObject ret = new JSObject();
                ret.put("content", "");
                call.resolve(ret);
                return;
            }

            // Read file content
            InputStream inputStream = resolver.openInputStream(fileUri);
            BufferedReader reader = new BufferedReader(new java.io.InputStreamReader(inputStream, "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();
            inputStream.close();

            JSObject ret = new JSObject();
            ret.put("content", sb.toString());
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("Failed to read file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String uriStr = call.getString("uri");
        String fileName = call.getString("fileName", "fittracker-data.json");
        String content = call.getString("content", "");

        if (uriStr == null || uriStr.isEmpty()) {
            call.reject("Folder URI is required");
            return;
        }

        try {
            Uri folderUri = Uri.parse(uriStr);
            ContentResolver resolver = getContext().getContentResolver();

            // Create or replace the file
            Uri fileUri = findFileUri(resolver, folderUri, fileName);

            if (fileUri == null) {
                // Create new file
                fileUri = DocumentsContract.createDocument(
                    resolver,
                    folderUri,
                    "application/json",
                    fileName
                );
            }

            if (fileUri == null) {
                call.reject("Failed to create file");
                return;
            }

            // Write content
            OutputStream outputStream = resolver.openOutputStream(fileUri, "wt");
            OutputStreamWriter writer = new OutputStreamWriter(outputStream, "UTF-8");
            writer.write(content);
            writer.flush();
            writer.close();
            outputStream.close();

            call.resolve();

        } catch (Exception e) {
            call.reject("Failed to write file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void hasPersistedUri(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(PREF_KEY_URI, "");
        String name = prefs.getString(PREF_KEY_NAME, "");

        JSObject ret = new JSObject();
        ret.put("hasUri", !uri.isEmpty());
        ret.put("uri", uri);
        ret.put("name", name);
        call.resolve(ret);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);

        if (requestCode == PICK_FOLDER_REQUEST && savedCall != null) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                Uri treeUri = data.getData();

                // Take persistable permission
                getContentResolver().takePersistableUriPermission(
                    treeUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );

                // Get folder name
                String folderName = getFolderName(treeUri);

                // Save to SharedPreferences for persistence
                SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                prefs.edit()
                    .putString(PREF_KEY_URI, treeUri.toString())
                    .putString(PREF_KEY_NAME, folderName)
                    .apply();

                JSObject ret = new JSObject();
                ret.put("uri", treeUri.toString());
                ret.put("name", folderName);
                savedCall.resolve(ret);

            } else {
                savedCall.reject("User cancelled folder selection");
            }
            savedCall = null;
        }
    }

    private String getFolderName(Uri uri) {
        // Try to extract a human-readable name from the URI
        // For content URIs like content://com.android.externalstorage.documents/tree/primary%3AFitTracker
        String docId = DocumentsContract.getTreeDocumentId(uri);
        // The docId might be like "primary:FitTracker" or a raw path
        String[] parts = docId.split(":");
        if (parts.length > 1) {
            return parts[parts.length - 1];
        }
        return docId;
    }

    /**
     * Find a file URI inside a folder using DocumentsContract
     */
    private Uri findFileUri(ContentResolver resolver, Uri folderUri, String fileName) {
        try {
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(folderUri,
                DocumentsContract.getTreeDocumentId(folderUri));

            String[] projection = new String[]{
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE
            };

            java.util.Cursor cursor = resolver.query(childrenUri, projection, null, null, null);
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String displayName = cursor.getString(
                        cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME));
                    if (displayName != null && displayName.equals(fileName)) {
                        String documentId = cursor.getString(
                            cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID));
                        cursor.close();
                        return DocumentsContract.buildDocumentUriUsingTree(folderUri, documentId);
                    }
                }
                cursor.close();
            }
        } catch (Exception e) {
            // Fallback: try to build URI directly
        }

        // Try building URI directly from folder + filename
        try {
            String treeDocId = DocumentsContract.getTreeDocumentId(folderUri);
            String fileDocId = treeDocId + "/" + fileName;
            return DocumentsContract.buildDocumentUriUsingTree(folderUri, fileDocId);
        } catch (Exception e) {
            return null;
        }
    }
}
