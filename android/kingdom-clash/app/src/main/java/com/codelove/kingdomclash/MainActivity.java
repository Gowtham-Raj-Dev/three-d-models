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
import android.view.Display;
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

import java.util.Locale;

/**
 * Kingdom Clash for Android: one full-screen, landscape-only WebView that plays the game from files
 * packed inside the APK (assets/www, copied there by scripts/build-android.mjs), so it works offline.
 *
 * The page is served from https://appassets.androidplatform.net/ (a host reserved for app assets),
 * so it gets a normal secure origin: localStorage keeps the village between launches and WebGL,
 * WebAudio and fetch() behave exactly as in the browser.
 *
 * Page bridge (src/components/games/shared/native-app.ts): the user agent ends with
 * "KingdomClashApp/<version>", the back button calls window.__nativeBack(), going to / coming
 * back from the background fires a "nativeapp" event with detail "pause" / "resume", and the
 * camera cutout's safe area arrives as the CSS variables --app-safe-left/top/right/bottom.
 *
 * The game draws edge to edge, under the camera cutout too (no empty strip beside it); only its
 * buttons keep out of the cutout, using those variables.
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
    private UpdateChecker updates;
    private long lastBack;
    /** The cutout's safe-area insets in CSS pixels: left, top, right, bottom. */
    private final float[] safeArea = new float[4];

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
        // The game fills the whole screen; the page keeps its buttons out of the camera cutout.
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
            float density = getResources().getDisplayMetrics().density;
            safeArea[0] = l / density;
            safeArea[1] = t / density;
            safeArea[2] = r / density;
            safeArea[3] = b / density;
            sendSafeArea();
            return insets;
        });
        setContentView(root);

        assets = new AssetServer(getAssets());
        web = createWebView();
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        hideSystemBars();
        preferSixtyHz();
        web.loadUrl(START_URL);
        checkWebViewVersion();
        // A newer version on the website? Asked a few seconds in, once the game is up.
        updates = new UpdateChecker(this);
        root.postDelayed(() -> {
            if (!isFinishing()) updates.check();
        }, 4000);
    }

    /**
     * Runs a 90 / 120 Hz screen at 60 Hz while the game is open: a steady 60 fps looks smoother
     * than a frame rate jumping between 60 and 120, and the phone stays cooler (no throttling later).
     */
    private void preferSixtyHz() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        Display display = getWindowManager().getDefaultDisplay();
        Display.Mode current = display.getMode();
        Display.Mode best = null;
        for (Display.Mode m : display.getSupportedModes()) {
            if (m.getPhysicalWidth() != current.getPhysicalWidth() || m.getPhysicalHeight() != current.getPhysicalHeight()) continue;
            if (m.getRefreshRate() < 59f) continue;
            if (best == null || m.getRefreshRate() < best.getRefreshRate()) best = m;
        }
        if (best == null || best.getModeId() == current.getModeId()) return;
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.preferredDisplayModeId = best.getModeId();
        getWindow().setAttributes(lp);
    }

    /**
     * Hands the cutout's safe area to the page (again after every page load) as a style element of
     * its own — not a style attribute on <html>, which React would see as a hydration mismatch.
     */
    private void sendSafeArea() {
        if (web == null) return;
        String css = String.format(Locale.ROOT, ":root{--app-safe-left:%.1fpx;--app-safe-top:%.1fpx;--app-safe-right:%.1fpx;--app-safe-bottom:%.1fpx}",
                safeArea[0], safeArea[1], safeArea[2], safeArea[3]);
        String js = "(function(){var s=document.getElementById('app-safe-area');if(!s){s=document.createElement('style');s.id='app-safe-area';"
                + "(document.head||document.documentElement).appendChild(s)}s.textContent='" + css + "'})()";
        web.evaluateJavascript(js, null);
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
        // The game is the whole app: keep its page process at foreground priority so Android
        // doesn't kill it (and reload the game) under memory pressure while it's on screen.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) view.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);

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
            public void onPageFinished(WebView v, String url) {
                sendSafeArea();
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
        if (updates != null) updates.dispose();
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
