package com.courier.riderpayout;

import android.Manifest;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.telephony.SmsManager;
import android.telephony.SubscriptionManager;
import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;

@CapacitorPlugin(
    name = "BackgroundSms",
    permissions = {
        @Permission(
            alias = "sms",
            strings = {
                Manifest.permission.SEND_SMS,
                Manifest.permission.READ_PHONE_STATE
            }
        )
    }
)
public class BackgroundSmsPlugin extends Plugin {

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

        final String cleanNumber = phoneNumber.replaceAll("[^0-9+]", "");

        if (!hasRequiredPermissions()) {
            call.reject("SMS or PHONE_STATE permissions are missing");
            return;
        }

        try {
            Context context = getContext();
            SmsManager smsManager = null;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                smsManager = context.getSystemService(SmsManager.class);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                int defaultSubId = SubscriptionManager.getDefaultSmsSubscriptionId();
                if (defaultSubId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
                    smsManager = SmsManager.getSmsManagerForSubscriptionId(defaultSubId);
                }
            }

            if (smsManager == null) {
                smsManager = SmsManager.getDefault();
            }

            ArrayList<String> parts = smsManager.divideMessage(message);
            if (parts.size() > 1) {
                smsManager.sendMultipartTextMessage(cleanNumber, null, parts, null, null);
            } else {
                smsManager.sendTextMessage(cleanNumber, null, message, null, null);
            }

            // इनबॉक्स / सेंट फ़ोल्डर में सेव करना ताकि आपको दिखे
            try {
                ContentValues values = new ContentValues();
                values.put("address", cleanNumber);
                values.put("body", message);
                values.put("date", System.currentTimeMillis());
                values.put("read", 1);
                values.put("type", 2);
                context.getContentResolver().insert(Uri.parse("content://sms/sent"), values);
            } catch (Exception ignored) {}

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "SMS dispatched successfully");
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("SMS dispatch failed: " + e.getMessage());
        }
    }

    @Override
    public boolean hasRequiredPermissions() {
        Context context = getContext();
        return ActivityCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED &&
               ActivityCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED;
    }
}
