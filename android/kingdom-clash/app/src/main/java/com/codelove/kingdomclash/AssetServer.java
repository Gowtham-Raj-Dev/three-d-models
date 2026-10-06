package com.codelove.kingdomclash;

import android.content.res.AssetManager;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Serves the static export packed in assets/www for https://appassets.androidplatform.net/<path>,
 * the way the web host does: "/dir/" → "/dir/index.html", correct MIME types, 404 for anything else.
 */
final class AssetServer {
    private static final String ROOT = "www";
    private static final Map<String, String> TYPES = new HashMap<>();

    static {
        TYPES.put("html", "text/html");
        TYPES.put("js", "text/javascript");
        TYPES.put("mjs", "text/javascript");
        TYPES.put("css", "text/css");
        TYPES.put("json", "application/json");
        TYPES.put("txt", "text/plain");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("png", "image/png");
        TYPES.put("webp", "image/webp");
        TYPES.put("jpg", "image/jpeg");
        TYPES.put("ico", "image/x-icon");
        TYPES.put("woff2", "font/woff2");
        TYPES.put("woff", "font/woff");
        TYPES.put("glb", "model/gltf-binary");
        TYPES.put("wasm", "application/wasm");
        TYPES.put("mp3", "audio/mpeg");
        TYPES.put("ogg", "audio/ogg");
        TYPES.put("m4a", "audio/mp4");
        TYPES.put("webmanifest", "application/manifest+json");
    }

    private final AssetManager assets;

    AssetServer(AssetManager assets) {
        this.assets = assets;
    }

    WebResourceResponse serve(String path) {
        if (path == null || path.isEmpty()) path = "/";
        if (path.contains("..")) return notFound();
        if (path.endsWith("/")) path += "index.html";
        InputStream in = open(path);
        if (in == null && !path.endsWith("index.html") && path.lastIndexOf('.') < path.lastIndexOf('/')) {
            // A directory without its trailing slash.
            path += "/index.html";
            in = open(path);
        }
        if (in == null) return notFound();
        String type = type(path);
        String charset = type.startsWith("text/") || type.endsWith("json") || type.endsWith("+xml") ? "utf-8" : null;
        WebResourceResponse res = new WebResourceResponse(type, charset, in);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        res.setResponseHeaders(headers);
        return res;
    }

    private InputStream open(String path) {
        try {
            return assets.open(ROOT + path, AssetManager.ACCESS_STREAMING);
        } catch (IOException e) {
            return null;
        }
    }

    private static String type(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot < 0 ? "" : path.substring(dot + 1).toLowerCase(Locale.ROOT);
        String type = TYPES.get(ext);
        return type != null ? type : "application/octet-stream";
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }
}
