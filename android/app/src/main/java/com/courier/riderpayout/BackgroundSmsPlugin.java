package com.courier.riderpayout;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundSms")
public class BackgroundSmsPlugin extends Plugin {

    @PluginMethod
    public void sendSms(PluginCall call) {
        String phoneNumber = call.getString("phoneNumber");
        String message = call.getString("message");

        if (phoneNumber == null || phoneNumber.isEmpty()) {
            call.reject("Phone number is required");
            return;
        }

        try {
            Context context = getContext();
            Uri uri = Uri.parse("smsto:" + Uri.encode(phoneNumber));
            Intent intent = new Intent(Intent.ACTION_SENDTO, uri);
            if (message != null && !message.isEmpty()) {
                intent.putExtra("sms_body", message);
                intent.putExtra(Intent.EXTRA_TEXT, message);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "Standard SMS intent opened safely");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to open SMS intent: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkSmsPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("hasPermission", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestSmsPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", true);
        call.resolve(ret);
    }
}
