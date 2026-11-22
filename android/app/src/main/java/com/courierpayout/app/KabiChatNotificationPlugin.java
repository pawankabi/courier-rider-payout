package com.courierpayout.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "KabiChatNotification",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class KabiChatNotificationPlugin extends Plugin {
    public static final String CHANNEL_ID = "kabitech_sms_alerts_v1";
    public static final String CHANNEL_NAME = "KabiTech Solution SMS";
    public static final String PREFS_NAME = "kabitech_sms_sync_prefs";
    public static final int SUMMARY_NOTIFICATION_ID = 418400;
    public static final int SYNC_JOB_ID = 418499;

    @Override
    public void load() {
        super.load();
        ensureNotificationChannel(getContext());
    }

    public static void ensureNotificationChannel(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;

        Uri defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Instant message alerts, sound, and unread badge for KabiTech Solution SMS");
        channel.enableLights(true);
        channel.setLightColor(Color.parseColor("#008069"));
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 220, 120, 220 });
        channel.setShowBadge(true);
        channel.setSound(defaultSound, audioAttributes);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

        manager.createNotificationChannel(channel);
    }

    public static void postSystemMessageNotification(
        Context context,
        String senderName,
        String messageText,
        String chatId,
        int totalUnread,
        boolean silent
    ) {
        if (context == null) return;
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        ensureNotificationChannel(context);

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent == null) {
            launchIntent = new Intent(context, MainActivity.class);
        }
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (chatId != null && !chatId.isEmpty()) {
            launchIntent.putExtra("kabi_open_chat_id", chatId);
        }

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(context, 4184, launchIntent, pendingFlags);

        Uri defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        String safeTitle = (senderName != null && !senderName.trim().isEmpty())
            ? senderName.trim()
            : "KabiTech Solution SMS";
        String safeBody = (messageText != null && !messageText.trim().isEmpty())
            ? messageText.trim()
            : "नया मैसेज आया है";

        int badgeNum = Math.max(1, totalUnread);
        String subText = badgeNum == 1
            ? "KabiTech Solution SMS • 1 अपठित"
            : "KabiTech Solution SMS • " + badgeNum + " अपठित";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setSubText(subText)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(safeBody))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .setNumber(badgeNum)
            .setBadgeIconType(NotificationCompat.BADGE_ICON_SMALL)
            .setColor(Color.parseColor("#008069"))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        if (silent) {
            builder.setSilent(true);
            builder.setOnlyAlertOnce(true);
        } else {
            builder.setSound(defaultSound);
            builder.setVibrate(new long[] { 0, 220, 120, 220 });
            builder.setDefaults(NotificationCompat.DEFAULT_LIGHTS);
        }

        try {
            NotificationManagerCompat.from(context).notify(SUMMARY_NOTIFICATION_ID, builder.build());
        } catch (SecurityException ignored) {
            // Permission not granted
        }
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= 33) {
            granted = ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsPermCallback");
    }

    @PermissionCallback
    private void notificationsPermCallback(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= 33) {
            granted = ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void showMessageNotification(PluginCall call) {
        String senderName = call.getString("senderName", "KabiTech Solution SMS");
        String messageText = call.getString("messageText", "नया मैसेज आया है");
        String chatId = call.getString("chatId", "");
        int totalUnread = call.getInt("totalUnread", 1);
        boolean silent = call.getBoolean("silent", false);

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putLong("lastNotifiedAt", System.currentTimeMillis()).apply();

        postSystemMessageNotification(getContext(), senderName, messageText, chatId, totalUnread, silent);

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearNotifications(PluginCall call) {
        try {
            NotificationManagerCompat.from(getContext()).cancel(SUMMARY_NOTIFICATION_ID);
        } catch (Exception ignored) {
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void configureBackgroundSync(PluginCall call) {
        String hubId = call.getString("hubId", "");
        String participantId = call.getString("participantId", "");
        String projectId = call.getString("projectId", "");
        String databaseId = call.getString("databaseId", "");
        String apiKey = call.getString("apiKey", "");

        if (hubId == null || hubId.isEmpty() || participantId == null || participantId.isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("scheduled", false);
            call.resolve(ret);
            return;
        }

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString("hubId", hubId)
            .putString("participantId", participantId)
            .putString("projectId", projectId)
            .putString("databaseId", databaseId)
            .putString("apiKey", apiKey)
            .putBoolean("enabled", true)
            .apply();

        try {
            JobScheduler scheduler = (JobScheduler) getContext().getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler != null) {
                ComponentName serviceComponent = new ComponentName(getContext(), KabiChatSyncJobService.class);
                JobInfo jobInfo = new JobInfo.Builder(SYNC_JOB_ID, serviceComponent)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(15 * 60 * 1000L)
                    .build();
                scheduler.schedule(jobInfo);
            }
        } catch (Exception ignored) {
        }

        JSObject ret = new JSObject();
        ret.put("scheduled", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearBackgroundSync(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putBoolean("enabled", false).apply();
            JobScheduler scheduler = (JobScheduler) getContext().getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler != null) {
                scheduler.cancel(SYNC_JOB_ID);
            }
            NotificationManagerCompat.from(getContext()).cancel(SUMMARY_NOTIFICATION_ID);
        } catch (Exception ignored) {
        }
        JSObject ret = new JSObject();
        ret.put("cleared", true);
        call.resolve(ret);
    }
}
