package com.courier.riderpayout;

import android.Manifest;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.telephony.SmsManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

@CapacitorPlugin(
    name = "BackgroundSms",
    permissions = {
        @Permission(
            alias = "sms",
            strings = { Manifest.permission.SEND_SMS, Manifest.permission.READ_PHONE_STATE }
        )
    }
)
public class BackgroundSmsPlugin extends Plugin {

    @PluginMethod
    public void checkSmsPermissions(PluginCall call) {
        boolean hasPermission = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED;

        JSObject ret = new JSObject();
        ret.put("hasPermission", hasPermission);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestSmsPermissions(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        } else {
            requestPermissionForAlias("sms", call, "smsPermissionCallback");
        }
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED;

        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void sendSms(PluginCall call) {
        String phoneNumber = call.getString("phoneNumber");
        String message = call.getString("message");

        if (phoneNumber == null || phoneNumber.trim().isEmpty()) {
            call.reject("Phone number is required");
            return;
        }

        if (message == null || message.trim().isEmpty()) {
            call.reject("Message content is required");
            return;
        }

        Context context = getContext();
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("SMS permission not granted. Please allow SMS permission in Android Settings.");
            return;
        }

        try {
            SmsManager smsManager;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                smsManager = context.getSystemService(SmsManager.class);
            } else {
                smsManager = SmsManager.getDefault();
            }

            ArrayList<String> parts = smsManager.divideMessage(message);
            if (parts.size() > 1) {
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null);
            } else {
                smsManager.sendTextMessage(phoneNumber, null, message, null, null);
            }

            // Save to system Sent SMS folder so it appears in the default SMS app outbox (Khatabook style)
            try {
                ContentValues values = new ContentValues();
                values.put("address", phoneNumber);
                values.put("body", message);
                values.put("date", System.currentTimeMillis());
                values.put("read", 1);
                values.put("type", 2); // 2 = MESSAGE_TYPE_SENT
                context.getContentResolver().insert(Uri.parse("content://sms/sent"), values);
            } catch (Exception dbErr) {
                // If writing directly to content://sms/sent is restricted by OS,
                // the SMS has still been dispatched via telephony stack.
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "सिम से SMS सफलतापूर्वक भेजा गया।");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("SMS dispatch failed: " + e.getMessage());
        }
    }
}
