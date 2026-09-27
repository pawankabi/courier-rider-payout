package com.courier.riderpayout;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.telephony.SmsManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;
import java.util.List;

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
        Integer simSlot = call.getInt("simSlot", 0);

        if (phoneNumber == null || phoneNumber.isEmpty()) {
            call.reject("Phone number is required");
            return;
        }

        if (message == null || message.isEmpty()) {
            call.reject("Message content is required");
            return;
        }

        if (!hasRequiredPermissions()) {
            call.reject("SMS or PHONE_STATE permissions are missing");
            return;
        }

        try {
            SmsManager smsManager = getSmsManagerForSlot(simSlot);
            ArrayList<String> parts = smsManager.divideMessage(message);

            if (parts.size() > 1) {
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null);
            } else {
                smsManager.sendTextMessage(phoneNumber, null, message, null, null);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "SMS dispatched successfully");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("SMS dispatch failed: " + e.getMessage());
        }
    }

    private SmsManager getSmsManagerForSlot(int targetSlot) {
        Context context = getContext();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            SubscriptionManager subscriptionManager = (SubscriptionManager) context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            if (subscriptionManager != null && ActivityCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
                List<SubscriptionInfo> subList = subscriptionManager.getActiveSubscriptionInfoList();
                if (subList != null && !subList.isEmpty()) {
                    for (SubscriptionInfo info : subList) {
                        if (info.getSimSlotIndex() == targetSlot) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                return context.getSystemService(SmsManager.class).createForSubscriptionId(info.getSubscriptionId());
                            } else {
                                return SmsManager.getSmsManagerForSubscriptionId(info.getSubscriptionId());
                            }
                        }
                    }
                }
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return context.getSystemService(SmsManager.class);
        } else {
            return SmsManager.getDefault();
        }
    }

    @Override
    public boolean hasRequiredPermissions() {
        Context context = getContext();
        return ActivityCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED &&
               ActivityCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED;
    }
}
