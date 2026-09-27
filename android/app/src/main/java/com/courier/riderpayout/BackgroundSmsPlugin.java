package com.courier.riderpayout;

import android.Manifest;
import android.content.Context;
import android.os.Build;
import android.telephony.SmsManager;
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
            call.reject("Message is required");
            return;
        }

        if (!hasRequiredPermissions()) {
            requestPermissionForAlias("sms", call, "sendSmsPermissionCallback");
            return;
        }

        dispatchSms(call, phoneNumber, message);
    }

    @PermissionCallback
    private void sendSmsPermissionCallback(PluginCall call) {
        if (hasRequiredPermissions()) {
            String phoneNumber = call.getString("phoneNumber");
            String message = call.getString("message");
            dispatchSms(call, phoneNumber, message);
        } else {
            call.reject("SMS permissions denied by user");
        }
    }

    private void dispatchSms(PluginCall call, String phoneNumber, String message) {
        try {
            SmsManager smsManager;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Context context = getContext();
                smsManager = context.getSystemService(SmsManager.class);
            } else {
                smsManager = SmsManager.getDefault();
            }

            if (smsManager == null) {
                smsManager = SmsManager.getDefault();
            }

            // Divide message into multiple parts if length > 160 chars
            ArrayList<String> parts = smsManager.divideMessage(message);
            if (parts.size() > 1) {
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null);
            } else {
                smsManager.sendTextMessage(phoneNumber, null, message, null, null);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("partsCount", parts.size());
            ret.put("recipient", phoneNumber);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to send SMS: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void checkSmsPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("hasPermission", hasRequiredPermissions());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestSmsPermissions(PluginCall call) {
        if (hasRequiredPermissions()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        } else {
            requestPermissionForAlias("sms", call, "requestPermissionsCallback");
        }
    }

    @PermissionCallback
    private void requestPermissionsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasRequiredPermissions());
        call.resolve(ret);
    }

    private boolean hasRequiredPermissions() {
        return getPermissionState("sms") == com.getcapacitor.PermissionState.GRANTED;
    }
}
