package com.builtbysreenuzero6.csvanalyticsstudio;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

@CapacitorPlugin(name = "CvasDocument")
public class CvasDocumentPlugin extends Plugin {

    @PluginMethod
    public void saveDocument(PluginCall call) {
        String fileName = call.getString("fileName");
        String dataBase64 = call.getString("dataBase64");

        if (fileName == null || fileName.trim().isEmpty()
                || dataBase64 == null || dataBase64.trim().isEmpty()) {
            call.reject("A filename and backup data are required.");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/octet-stream");
        intent.putExtra(
            Intent.EXTRA_TITLE,
            fileName.toLowerCase().endsWith(".cvas")
                ? fileName
                : fileName + ".cvas"
        );

        startActivityForResult(call, intent, "documentCreated");
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("Backup save was cancelled.");
            return;
        }

        Uri uri = result.getData() != null
                ? result.getData().getData()
                : null;

        if (uri == null) {
            call.reject("Android did not return a destination.");
            return;
        }

        try {
            String base64 = call.getString("dataBase64");
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);

            OutputStream output = getContext()
                    .getContentResolver()
                    .openOutputStream(uri, "wt");

            if (output == null) {
                throw new IllegalStateException(
                    "Could not open the selected destination."
                );
            }

            try (OutputStream stream = output) {
                stream.write(bytes);
                stream.flush();
            }

            JSObject response = new JSObject();
            response.put("saved", true);
            response.put("uri", uri.toString());
            call.resolve(response);

        } catch (Exception error) {
            call.reject(
                "Could not save the .cvas backup: " + error.getMessage(),
                error
            );
        }
    }
}