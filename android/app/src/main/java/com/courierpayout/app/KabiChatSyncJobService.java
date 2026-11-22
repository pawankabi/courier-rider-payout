package com.courierpayout.app;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class KabiChatSyncJobService extends JobService {

    @Override
    public boolean onStartJob(final JobParameters params) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    checkUnreadMessagesAndNotify();
                } catch (Exception ignored) {
                } finally {
                    jobFinished(params, false);
                }
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    private void checkUnreadMessagesAndNotify() {
        SharedPreferences prefs = getSharedPreferences(KabiChatNotificationPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) return;

        String hubId = prefs.getString("hubId", "");
        String participantId = prefs.getString("participantId", "");
        String projectId = prefs.getString("projectId", "");
        String databaseId = prefs.getString("databaseId", "");
        String apiKey = prefs.getString("apiKey", "");
        long lastNotifiedAt = prefs.getLong("lastNotifiedAt", 0L);

        if (hubId.isEmpty() || participantId.isEmpty() || projectId.isEmpty() || databaseId.isEmpty()) {
            return;
        }

        HttpURLConnection conn = null;
        try {
            String urlStr = "https://firestore.googleapis.com/v1/projects/"
                + Uri.encode(projectId)
                + "/databases/"
                + Uri.encode(databaseId)
                + "/documents/hubs/"
                + Uri.encode(hubId)
                + "/kabi_chats?pageSize=60"
                + (apiKey.isEmpty() ? "" : "&key=" + Uri.encode(apiKey));

            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            int code = conn.getResponseCode();
            if (code != 200) return;

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
            )) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
            }

            JSONObject root = new JSONObject(sb.toString());
            JSONArray docs = root.optJSONArray("documents");
            if (docs == null || docs.length() == 0) return;

            int totalUnread = 0;
            long newestAt = lastNotifiedAt;
            String newestSender = "KabiTech Solution SMS";
            String newestText = "नया मैसेज आया है";
            String newestChatId = "";

            for (int i = 0; i < docs.length(); i++) {
                JSONObject docObj = docs.optJSONObject(i);
                if (docObj == null) continue;
                JSONObject fields = docObj.optJSONObject("fields");
                if (fields == null) continue;

                // Read unreadCounts[participantId]
                JSONObject unreadCountsWrapper = fields.optJSONObject("unreadCounts");
                if (unreadCountsWrapper == null) continue;
                JSONObject unreadMap = unreadCountsWrapper.optJSONObject("mapValue");
                if (unreadMap == null) continue;
                JSONObject unreadFields = unreadMap.optJSONObject("fields");
                if (unreadFields == null) continue;
                JSONObject myCountObj = unreadFields.optJSONObject(participantId);
                if (myCountObj == null) continue;

                int myCount = 0;
                if (myCountObj.has("integerValue")) {
                    try {
                        myCount = Integer.parseInt(myCountObj.optString("integerValue", "0"));
                    } catch (Exception ignored) {}
                } else if (myCountObj.has("doubleValue")) {
                    myCount = (int) myCountObj.optDouble("doubleValue", 0);
                }

                if (myCount <= 0) continue;
                totalUnread += myCount;

                long msgAt = 0L;
                JSONObject lastMsgAtObj = fields.optJSONObject("lastMessageAt");
                if (lastMsgAtObj != null) {
                    if (lastMsgAtObj.has("integerValue")) {
                        try {
                            msgAt = Long.parseLong(lastMsgAtObj.optString("integerValue", "0"));
                        } catch (Exception ignored) {}
                    } else if (lastMsgAtObj.has("doubleValue")) {
                        msgAt = (long) lastMsgAtObj.optDouble("doubleValue", 0);
                    }
                }

                if (msgAt > newestAt) {
                    newestAt = msgAt;
                    JSONObject senderObj = fields.optJSONObject("lastMessageSenderName");
                    JSONObject textObj = fields.optJSONObject("lastMessageText");
                    JSONObject idObj = fields.optJSONObject("id");
                    if (senderObj != null && senderObj.has("stringValue")) {
                        newestSender = senderObj.optString("stringValue", newestSender);
                    }
                    if (textObj != null && textObj.has("stringValue")) {
                        newestText = textObj.optString("stringValue", newestText);
                    }
                    if (idObj != null && idObj.has("stringValue")) {
                        newestChatId = idObj.optString("stringValue", "");
                    }
                }
            }

            if (totalUnread > 0 && newestAt > lastNotifiedAt) {
                prefs.edit().putLong("lastNotifiedAt", newestAt).apply();
                KabiChatNotificationPlugin.postSystemMessageNotification(
                    getApplicationContext(),
                    newestSender,
                    newestText,
                    newestChatId,
                    totalUnread,
                    false
                );
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }
}
