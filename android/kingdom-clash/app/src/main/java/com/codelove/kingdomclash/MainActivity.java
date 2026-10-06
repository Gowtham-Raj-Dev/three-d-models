package com.codelove.kingdomclash;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.DisplayCutout;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * Kingdom Clash for Android: one full-screen, landscape-only WebView that plays the game from files
 * packed inside the APK (assets/www, copied there by scripts/build-android.mjs), so it works offline.
 *
 * The page is served from https://appassets.androidplatform.net/ (a host reserved for app assets),
 * so it gets a normal secure origin: localStorage keeps the village between launches and WebGL,
 * WebAudio and fetch() behave exactly as in the browser.
 *
 * Page bridge (src/components/games/shared/native-app.ts): the user agent ends with
 * "KingdomClashApp/<version>", the back button calls window.__nativeBack(), and going to / coming
 * back from the background fires a "nativeapp" event with detail "pause" / "resume".
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/games/kingdom-clash/play/";
    /** Behind the page while it loads: the loading screen's dark blue. */
    private static final int BACKGROUND = Color.rgb(11, 29, 74);
    /** Oldest Chromium the static export targets (Next.js browserslist: Chrome 111). */
    private static final int MIN_WEBVIEW = 111;

    private WebView web;
    private AssetServer assets;
    private long lastBack;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BACKGROUND);
        // Keep the game out of the camera notch: pad by the cutout, the bars stay hidden.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l = 0, t = 0, r = 0, b = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                DisplayCutout cutout = insets.getDisplayCutout();
                if (cutout != null) {
                    l = cutout.getSafeInsetLeft();
                    t = cutout.getSafeInsetTop();
                    r = cutout.getSafeInsetRight();
                    b = cutout.getSafeInsetBottom();
                }
            }
            v.setPadding(l, t, r, b);
            return insets;
        });
        setContentView(root);

        assets = new AssetServer(getAssets());
        web = createWebView();
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        hideSystemBars();
        web.loadUrl(START_URL);
        checkWebViewVersion();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private WebView createWebView() {
        WebView view = new WebView(this);
        view.setBackgroundColor(BACKGROUND);
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        view.setVerticalScrollBarEnabled(false);
        view.setHorizontalScrollBarEnabled(false);
        // Long presses deploy troops; never start a text selection or a context menu.
        view.setLongClickable(false);
        view.setOnLongClickListener(v -> true);
        view.setHapticFeedbackEnabled(false);

        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        // The HUD is laid out in CSS pixels; a large system font size would break it.
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " KingdomClashApp/" + BuildConfig.VERSION_NAME);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                Uri url = request.getUrl();
                return HOST.equals(url.getHost()) ? assets.serve(url.getPath()) : null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost())) return false;
                // Anything outside the game (a credit link) opens in the browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (ActivityNotFoundException ignored) {
                    // No browser: stay in the game.
                }
                return true;
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                // The page's process died (usually low memory): start again instead of crashing.
                ViewGroup parent = (ViewGroup) web.getParent();
                parent.removeView(web);
                web.destroy();
                web = createWebView();
                parent.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                web.loadUrl(START_URL);
                return true;
            }
        });
        return view;
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    /** Old WebViews can't run the game: say how to fix it instead of showing a blank screen. */
    private void checkWebViewVersion() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        PackageInfo info = WebView.getCurrentWebViewPackage();
        if (info == null || info.versionName == null) return;
        int major;
        try {
            major = Integer.parseInt(info.versionName.split("\\.")[0]);
        } catch (NumberFormatException e) {
            return;
        }
        if (major >= MIN_WEBVIEW) return;
        final String pkg = info.packageName;
        new AlertDialog.Builder(this)
                .setTitle(R.string.webview_title)
                .setMessage(getString(R.string.webview_message, major))
                .setPositiveButton(R.string.webview_update, (d, w) -> {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
                    } catch (ActivityNotFoundException e) {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)));
                    }
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private void notifyPage(String state) {
        if (web != null) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('nativeapp',{detail:'" + state + "'}))", null);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onPause() {
        notifyPage("pause");
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
        web.onResume();
        notifyPage("resume");
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Back closes the game's panels or pauses a battle first; at the village it takes two presses to exit. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(function(){try{return !!(window.__nativeBack&&window.__nativeBack())}catch(e){return false}})()", handled -> {
            if ("true".equals(handled)) return;
            long now = SystemClock.uptimeMillis();
            if (now - lastBack < 2000) {
                finish();
            } else {
                lastBack = now;
                Toast.makeText(this, R.string.press_back_again, Toast.LENGTH_SHORT).show();
            }
        });
    }
}
