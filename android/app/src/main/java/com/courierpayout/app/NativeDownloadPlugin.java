package com.courierpayout.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(
    name = "NativeDownload",
    permissions = {
        @Permission(
            alias = "storage",
            strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }
        )
    }
)
public class NativeDownloadPlugin extends Plugin {

    private String sanitizeFilename(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return "Document_" + System.currentTimeMillis() + ".pdf";
        }
        String cleaned = raw.trim().replaceAll("[<>:\"/\\\\|?*\\x00-\\x1F]", "_");
        return cleaned.isEmpty() ? ("Document_" + System.currentTimeMillis() + ".pdf") : cleaned;
    }

    private byte[] decodeBase64Payload(String raw) {
        if (raw == null) return new byte[0];
        String payload = raw.trim();
        int commaIdx = payload.indexOf(',');
        if (payload.startsWith("data:") && commaIdx >= 0) {
            payload = payload.substring(commaIdx + 1);
        }
        return Base64.decode(payload, Base64.DEFAULT);
    }

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String rawFilename = call.getString("filename");
        String base64Data = call.getString("base64Data");
        String mimeType = call.getString("mimeType", "application/pdf");

        if (base64Data == null || base64Data.trim().isEmpty()) {
            call.reject("File data is required");
            return;
        }

        String safeFilename = sanitizeFilename(rawFilename);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveWithMediaStoreDownloads(call, safeFilename, base64Data, mimeType);
        } else {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
                saveToLegacyPublicDownloads(call, safeFilename, base64Data, mimeType);
            } else {
                requestPermissionForAlias("storage", call, "storagePermsCallback");
            }
        }
    }

    @PermissionCallback
    private void storagePermsCallback(PluginCall call) {
        String safeFilename = sanitizeFilename(call.getString("filename"));
        String base64Data = call.getString("base64Data");
        String mimeType = call.getString("mimeType", "application/pdf");

        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
            saveToLegacyPublicDownloads(call, safeFilename, base64Data, mimeType);
        } else {
            // Fallback to app external Downloads folder so download still completes cleanly
            saveToAppExternalDownloads(call, safeFilename, base64Data, mimeType);
        }
    }

    private void saveWithMediaStoreDownloads(PluginCall call, String safeFilename, String base64Data, String mimeType) {
        try {
            byte[] fileBytes = decodeBase64Payload(base64Data);
            ContentResolver resolver = getContext().getContentResolver();

            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, safeFilename);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            Uri itemUri = resolver.insert(collection, values);

            if (itemUri == null) {
                call.reject("Could not create file in Downloads folder");
                return;
            }

            try (OutputStream out = resolver.openOutputStream(itemUri)) {
                if (out == null) {
                    resolver.delete(itemUri, null, null);
                    call.reject("Failed to open output stream in Downloads");
                    return;
                }
                out.write(fileBytes);
                out.flush();
            }

            ContentValues finishValues = new ContentValues();
            finishValues.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(itemUri, finishValues, null, null);

            String actualName = resolveDisplayName(resolver, itemUri, safeFilename);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("contentUri", itemUri.toString());
            ret.put("filename", actualName);
            ret.put("mimeType", mimeType);
            ret.put("savedInDownloads", true);
            ret.put("locationLabel", "Downloads/" + actualName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to save to Downloads: " + e.getMessage());
        }
    }

    private String resolveDisplayName(ContentResolver resolver, Uri uri, String fallbackName) {
        try (Cursor cursor = resolver.query(uri, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String name = cursor.getString(idx);
                    if (name != null && !name.trim().isEmpty()) {
                        return name;
                    }
                }
            }
        } catch (Exception ignored) {}
        return fallbackName;
    }

    private File getUniqueTargetFile(File dir, String filename) {
        File target = new File(dir, filename);
        if (!target.exists()) return target;

        int dotIdx = filename.lastIndexOf('.');
        String base = dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
        String ext = dotIdx > 0 ? filename.substring(dotIdx) : "";
        for (int i = 1; i <= 99; i++) {
            File candidate = new File(dir, base + " (" + i + ")" + ext);
            if (!candidate.exists()) return candidate;
        }
        return new File(dir, base + "_" + System.currentTimeMillis() + ext);
    }

    @SuppressWarnings("deprecation")
    private void saveToLegacyPublicDownloads(PluginCall call, String safeFilename, String base64Data, String mimeType) {
        try {
            byte[] fileBytes = decodeBase64Payload(base64Data);
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (downloadsDir != null && !downloadsDir.exists()) {
                downloadsDir.mkdirs();
            }
            if (downloadsDir == null || !downloadsDir.exists()) {
                saveToAppExternalDownloads(call, safeFilename, base64Data, mimeType);
                return;
            }

            File outFile = getUniqueTargetFile(downloadsDir, safeFilename);
            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                fos.write(fileBytes);
                fos.flush();
            }

            MediaScannerConnection.scanFile(
                getContext(),
                new String[]{ outFile.getAbsolutePath() },
                new String[]{ mimeType },
                null
            );

            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                outFile
            );

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("contentUri", contentUri.toString());
            ret.put("filename", outFile.getName());
            ret.put("mimeType", mimeType);
            ret.put("savedInDownloads", true);
            ret.put("locationLabel", "Downloads/" + outFile.getName());
            call.resolve(ret);
        } catch (Exception e) {
            saveToAppExternalDownloads(call, safeFilename, base64Data, mimeType);
        }
    }

    private void saveToAppExternalDownloads(PluginCall call, String safeFilename, String base64Data, String mimeType) {
        try {
            byte[] fileBytes = decodeBase64Payload(base64Data);
            File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) {
                dir = getContext().getCacheDir();
            }
            if (!dir.exists()) {
                dir.mkdirs();
            }

            File outFile = getUniqueTargetFile(dir, safeFilename);
            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                fos.write(fileBytes);
                fos.flush();
            }

            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                outFile
            );

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("contentUri", contentUri.toString());
            ret.put("filename", outFile.getName());
            ret.put("mimeType", mimeType);
            ret.put("savedInDownloads", false);
            ret.put("locationLabel", outFile.getName());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to save file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        String contentUriStr = call.getString("contentUri");
        String mimeType = call.getString("mimeType", "application/pdf");

        if (contentUriStr == null || contentUriStr.trim().isEmpty()) {
            call.reject("File URI is required");
            return;
        }

        try {
            Uri uri = Uri.parse(contentUriStr);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            try {
                getContext().startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("opened", true);
                call.resolve(ret);
            } catch (ActivityNotFoundException noAppEx) {
                JSObject ret = new JSObject();
                ret.put("opened", false);
                ret.put("noViewer", true);
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject("Failed to open file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String contentUriStr = call.getString("contentUri");
        String mimeType = call.getString("mimeType", "application/pdf");
        String title = call.getString("title", "PDF रिपोर्ट शेयर करें");
        String text = call.getString("text", "");

        if (contentUriStr == null || contentUriStr.trim().isEmpty()) {
            call.reject("File URI is required");
            return;
        }

        try {
            Uri uri = Uri.parse(contentUriStr);
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType);
            shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
            if (text != null && !text.isEmpty()) {
                shareIntent.putExtra(Intent.EXTRA_TEXT, text);
            }
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(shareIntent, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject ret = new JSObject();
            ret.put("shared", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to share file: " + e.getMessage());
        }
    }
}
