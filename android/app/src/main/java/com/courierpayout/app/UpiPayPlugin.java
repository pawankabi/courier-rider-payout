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

            try {
                getContext().startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("launched", true);
                call.resolve(ret);
                return;
            } catch (Exception directEx) {
                // If targeted package fails, fallback directly to system UPI chooser
                Intent genericIntent = new Intent(Intent.ACTION_VIEW, parsedUri);
                genericIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                Intent chooser = Intent.createChooser(genericIntent, "Pay via UPI");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                getContext().startActivity(chooser);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("launched", true);
                ret.put("fallback", true);
                call.resolve(ret);
                return;
            }

        } catch (Exception e) {
            call.reject("Failed to launch UPI app: " + e.getMessage());
        }
    }
}
