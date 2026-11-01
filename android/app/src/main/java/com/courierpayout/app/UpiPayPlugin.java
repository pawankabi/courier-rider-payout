package com.courierpayout.app;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "UpiPay")
public class UpiPayPlugin extends Plugin {

    @PluginMethod
    public void launchUpi(PluginCall call) {
        String uriStr = call.getString("uri");
        String targetPackage = call.getString("targetPackage");

        if (uriStr == null || uriStr.trim().isEmpty()) {
            call.reject("URI cannot be empty");
            return;
        }

        try {
            Uri parsedUri = Uri.parse(uriStr.trim());
            Intent intent = new Intent(Intent.ACTION_VIEW, parsedUri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (targetPackage != null && !targetPackage.trim().isEmpty()) {
                intent.setPackage(targetPackage.trim());
            }

            // Check if there is an app that can handle this intent
            if (intent.resolveActivity(getContext().getPackageManager()) != null) {
                getContext().startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("launched", true);
                call.resolve(ret);
                return;
            }

            // If a specific package was requested but not found, try generic UPI chooser
            if (targetPackage != null && !targetPackage.trim().isEmpty()) {
                Intent genericIntent = new Intent(Intent.ACTION_VIEW, parsedUri);
                genericIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (genericIntent.resolveActivity(getContext().getPackageManager()) != null) {
                    getContext().startActivity(genericIntent);
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("launched", true);
                    ret.put("fallback", true);
                    call.resolve(ret);
                    return;
                }
            }

            // If neither worked, report not found
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", "No compatible UPI app found on this device.");
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("Failed to launch UPI app: " + e.getMessage());
        }
    }
}
