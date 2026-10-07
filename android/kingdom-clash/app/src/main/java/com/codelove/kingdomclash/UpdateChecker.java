package com.codelove.kingdomclash;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * The app is installed from the website, not a store, so it looks for a newer version itself: once
 * per launch it reads /downloads/kingdom-clash.json (written by scripts/build-android.mjs next to the
 * APK) and, when that versionCode is higher than its own, offers the update. "Update" downloads the
 * APK with Android's download manager (progress in the notification bar) and opens the installer;
 * the APK is signed with the same key, so it installs over this one and the village is kept.
 * "Later" waits a day before asking about that version again.
 */
final class UpdateChecker {
    /**
     * Where the site is published: Firebase App Hosting and the custom domain. Both are asked and the
     * highest version wins, so one that is down or out of date doesn't matter.
     */
    private static final String[] ORIGINS = {"https://three-d-models--d-models-bfb95.asia-southeast1.hosted.app", "https://models.codelove.in"};
    private static final String INFO = "/downloads/kingdom-clash.json";
    private static final String APK = "/downloads/kingdom-clash.apk";
    private static final String APK_TYPE = "application/vnd.android.package-archive";
    private static final long SNOOZE_MS = 24L * 60 * 60 * 1000;

    private static final class Release {
        final int code;
        final String name;
        final long bytes;
        final String url;

        Release(int code, String name, long bytes, String url) {
            this.code = code;
            this.name = name;
            this.bytes = bytes;
            this.url = url;
        }
    }

    private final Activity activity;
    private BroadcastReceiver receiver;
    private long downloadId = -1;

    UpdateChecker(Activity activity) {
        this.activity = activity;
    }

    /** Checks in the background; offers the update on the UI thread when there is one. */
    void check() {
        new Thread(() -> {
            Release best = null;
            for (String origin : ORIGINS) {
                Release r = fetch(origin);
                if (r != null && (best == null || r.code > best.code)) best = r;
            }
            if (best == null || best.code <= BuildConfig.VERSION_CODE) return;
            SharedPreferences prefs = activity.getSharedPreferences("updates", Context.MODE_PRIVATE);
            if (prefs.getInt("later_code", 0) == best.code && System.currentTimeMillis() < prefs.getLong("later_until", 0)) return;
            final Release release = best;
            activity.runOnUiThread(() -> offer(release));
        }, "update-check").start();
    }

    private static Release fetch(String origin) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(origin + INFO + "?t=" + System.currentTimeMillis()).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setUseCaches(false);
            c.setRequestProperty("Cache-Control", "no-cache");
            if (c.getResponseCode() != HttpURLConnection.HTTP_OK) return null;
            StringBuilder body = new StringBuilder();
            try (BufferedReader in = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                for (String line; (line = in.readLine()) != null; ) body.append(line);
            }
            JSONObject json = new JSONObject(body.toString());
            String apk = json.optString("url", APK);
            return new Release(json.getInt("versionCode"), json.optString("version", "?"), json.optLong("bytes", 0), apk.startsWith("http") ? apk : origin + apk);
        } catch (Exception e) {
            // Offline or the site is unreachable: try again next launch.
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private void offer(Release r) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        String size = r.bytes > 0 ? String.format(Locale.ROOT, " · %.1f MB", r.bytes / 1048576.0) : "";
        new AlertDialog.Builder(activity)
                .setTitle(R.string.update_title)
                .setMessage(activity.getString(R.string.update_message, r.name, BuildConfig.VERSION_NAME, size))
                .setPositiveButton(R.string.update_now, (d, w) -> download(r))
                .setNegativeButton(R.string.update_later, (d, w) -> later(r))
                .setOnCancelListener(d -> later(r))
                .show();
    }

    private void later(Release r) {
        activity.getSharedPreferences("updates", Context.MODE_PRIVATE)
                .edit()
                .putInt("later_code", r.code)
                .putLong("later_until", System.currentTimeMillis() + SNOOZE_MS)
                .apply();
    }

    private void download(Release r) {
        try {
            DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(r.url))
                    .setTitle(activity.getString(R.string.app_name) + " " + r.name)
                    .setDescription(activity.getString(R.string.update_downloading))
                    .setMimeType(APK_TYPE)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, "kingdom-clash-" + r.name + ".apk");
            listen(dm);
            downloadId = dm.enqueue(req);
            Toast.makeText(activity, R.string.update_downloading, Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            // No download manager (rare): let the browser download it.
            openInBrowser(r.url);
        }
    }

    private void listen(DownloadManager dm) {
        if (receiver != null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id == downloadId) install(dm, id);
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        // The download manager is another app: its broadcast has to be allowed in (Android 13+).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) activity.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        else activity.registerReceiver(receiver, filter);
    }

    private void install(DownloadManager dm, long id) {
        boolean ok = false;
        try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
            if (c != null && c.moveToFirst()) ok = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL;
        } catch (Exception ignored) {
            // Treated as a failed download below.
        }
        Uri apk = ok ? dm.getUriForDownloadedFile(id) : null;
        if (apk == null) {
            Toast.makeText(activity, R.string.update_failed, Toast.LENGTH_LONG).show();
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(apk, APK_TYPE)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(activity, R.string.update_failed, Toast.LENGTH_LONG).show();
        }
    }

    private void openInBrowser(String url) {
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(activity, R.string.update_failed, Toast.LENGTH_LONG).show();
        }
    }

    void dispose() {
        if (receiver == null) return;
        try {
            activity.unregisterReceiver(receiver);
        } catch (IllegalArgumentException ignored) {
            // Already gone.
        }
        receiver = null;
    }
}
