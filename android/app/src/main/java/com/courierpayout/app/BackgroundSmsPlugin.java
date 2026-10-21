package com.courierpayout.app;

import android.Manifest;
import android.content.pm.PackageManager;
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
        ),
        @Permission(
            alias = "contacts",
            strings = { Manifest.permission.READ_CONTACTS }
        ),
        @Permission(
            alias = "all",
            strings = {
                Manifest.permission.SEND_SMS,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.READ_CONTACTS
            }
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
            requestPermissionForAlias("sms", call, "smsPermsCallback");
        }
    }

    @PermissionCallback
    private void smsPermsCallback(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void checkContactsPermission(PluginCall call) {
        boolean hasPermission = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED;
        JSObject ret = new JSObject();
        ret.put("hasPermission", hasPermission);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestContactsPermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        } else {
            requestPermissionForAlias("contacts", call, "contactsPermsCallback");
        }
    }

    @PermissionCallback
    private void contactsPermsCallback(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void checkAllPermissions(PluginCall call) {
        boolean sms = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
        boolean phone = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED;
        boolean contacts = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED;

        JSObject ret = new JSObject();
        ret.put("smsGranted", sms);
        ret.put("phoneGranted", phone);
        ret.put("contactsGranted", contacts);
        ret.put("allGranted", sms && contacts);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestAllPermissions(PluginCall call) {
        boolean sms = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
        boolean contacts = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED;

        if (sms && contacts) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            ret.put("smsGranted", true);
            ret.put("contactsGranted", true);
            call.resolve(ret);
        } else {
            requestPermissionForAlias("all", call, "allPermsCallback");
        }
    }

    @PermissionCallback
    private void allPermsCallback(PluginCall call) {
        boolean sms = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
        boolean contacts = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED;

        JSObject ret = new JSObject();
        ret.put("granted", sms && contacts);
        ret.put("smsGranted", sms);
        ret.put("contactsGranted", contacts);
        call.resolve(ret);
    }

    private void dispatchSmsWithManager(SmsManager smsManager, String targetNumber, String message) {
        ArrayList<String> parts = smsManager.divideMessage(message);
        if (parts != null && parts.size() > 1) {
            smsManager.sendMultipartTextMessage(targetNumber, null, parts, null, null);
        } else {
            smsManager.sendTextMessage(targetNumber, null, message, null, null);
        }
    }

    @PluginMethod
    public void sendSms(PluginCall call) {
        String phoneNumber = call.getString("phoneNumber");
        String message = call.getString("message");

        if (phoneNumber == null || phoneNumber.trim().isEmpty() || message == null || message.trim().isEmpty()) {
            call.reject("Phone number and message are required");
            return;
        }

        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("SEND_SMS permission not granted");
            return;
        }

        // Clean phone number: keep digits and optional leading plus
        String cleanNumber = phoneNumber.trim().replaceAll("[^0-9+]", "");
        if (cleanNumber.isEmpty()) {
            call.reject("Invalid phone number format");
            return;
        }

        try {
            SmsManager smsManager = null;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                try {
                    smsManager = getContext().getSystemService(SmsManager.class);
                } catch (Exception ignored) {}
            }
            if (smsManager == null) {
                smsManager = SmsManager.getDefault();
            }
            if (smsManager == null) {
                call.reject("SmsManager is not available on this device");
                return;
            }

            try {
                dispatchSmsWithManager(smsManager, cleanNumber, message);
            } catch (Exception primaryEx) {
                // Carrier fallback: if +91 failed, try 10 digits without +91, or vice versa
                if (cleanNumber.startsWith("+91") && cleanNumber.length() == 13) {
                    String localTenDigits = cleanNumber.substring(3);
                    dispatchSmsWithManager(smsManager, localTenDigits, message);
                } else if (cleanNumber.length() == 10) {
                    dispatchSmsWithManager(smsManager, "+91" + cleanNumber, message);
                } else {
                    throw primaryEx;
                }
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "SMS sent successfully via SIM");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to send SMS: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            android.content.Intent intent = new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            android.net.Uri uri = android.net.Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to open app settings: " + e.getMessage());
        }
    }
}
