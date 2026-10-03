package com.yuivo9999.mybox123;

import android.content.Context;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Stage-3 TVBox JAR runtime boundary.
 *
 * This stage deliberately implements acquisition, integrity verification and
 * ABI discovery only. It does not execute arbitrary downloaded bytecode.
 * Actual Spider invocation is enabled only after a compatible host ABI is
 * present; this prevents a random JAR from gaining the application's Android
 * privileges merely because a config references it.
 */
public final class TVBoxJarBridge {
    public static final String JS_NAME = "TVBoxJarBridge";
    private static final int CONNECT_TIMEOUT_MS = 8_000;
    private static final int READ_TIMEOUT_MS = 12_000;
    private static final int MAX_JAR_BYTES = 20 * 1024 * 1024;

    private final Context context;

    public TVBoxJarBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public String getCapabilities() {
        try {
            JSONObject result = new JSONObject();
            result.put("contractVersion", "1");
            result.put("available", true);
            result.put("stage", 3);
            result.put("supportedKinds", new org.json.JSONArray().put("jar"));
            result.put("supportedOperations", new org.json.JSONArray().put("prepare").put("inspect"));
            result.put("executionEnabled", false);
            result.put("reason", "JAR_ACQUIRE_VERIFY_INSPECT_ONLY");
            return result.toString();
        } catch (Exception e) {
            return "{\"available\":false,\"reason\":\"TVBOX_JAR_CAPABILITY_ERROR\"}";
        }
    }

    @JavascriptInterface
    public String execute(String payload) {
        try {
            JSONObject input = new JSONObject(payload == null ? "{}" : payload);
            String operation = input.optString("operation", "");
            JSONObject data = input.optJSONObject("payload");
            if ("prepare".equals(operation)) return prepare(data);
            if ("inspect".equals(operation)) return inspect(data);
            return error("TVBOX_JAR_OPERATION_UNSUPPORTED");
        } catch (SecurityException e) {
            return error(e.getMessage() == null ? "TVBOX_JAR_SECURITY_ERROR" : e.getMessage());
        } catch (Exception e) {
            return error(e.getMessage() == null ? "TVBOX_JAR_ERROR" : e.getMessage());
        }
    }

    private String prepare(JSONObject data) throws Exception {
        String url = data == null ? "" : data.optString("url", "");
        if (!url.matches("(?i)^https?://.+")) throw new SecurityException("TVBOX_JAR_URL_REQUIRED");

        String expectedMd5 = normalizeDigest(data.optString("md5", ""));
        File dir = new File(context.getCacheDir(), "tvbox/jar");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("TVBOX_JAR_CACHE_CREATE_FAILED");

        String fileName = safeFileName(data.optString("name", "spider")) + ".jar";
        File target = new File(dir, fileName);
        download(url, target);
        String actualMd5 = md5(target);
        if (!expectedMd5.isEmpty() && !expectedMd5.equals(actualMd5)) {
            // Never retain a file that failed an explicit integrity check.
            //noinspection ResultOfMethodCallIgnored
            target.delete();
            throw new SecurityException("TVBOX_JAR_MD5_MISMATCH");
        }

        JSONObject result = new JSONObject();
        result.put("ok", true);
        result.put("operation", "prepare");
        result.put("path", target.getAbsolutePath());
        result.put("size", target.length());
        result.put("md5", actualMd5);
        result.put("executionEnabled", false);
        return result.toString();
    }

    private String inspect(JSONObject data) throws Exception {
        String path = data == null ? "" : data.optString("path", "");
        if (path.isEmpty()) throw new IllegalArgumentException("TVBOX_JAR_PATH_REQUIRED");
        File file = new File(path).getCanonicalFile();
        File cache = new File(context.getCacheDir(), "tvbox/jar").getCanonicalFile();
        if (!file.getPath().startsWith(cache.getPath() + File.separator)) {
            throw new SecurityException("TVBOX_JAR_PATH_OUTSIDE_CACHE");
        }
        if (!file.isFile()) throw new IOException("TVBOX_JAR_NOT_FOUND");
        if (file.length() > MAX_JAR_BYTES) throw new SecurityException("TVBOX_JAR_TOO_LARGE");

        java.util.jar.JarFile jar = new java.util.jar.JarFile(file);
        int classCount = 0;
        boolean hasSpiderPackage = false;
        try {
            java.util.Enumeration<java.util.jar.JarEntry> entries = jar.entries();
            while (entries.hasMoreElements()) {
                java.util.jar.JarEntry entry = entries.nextElement();
                if (entry.isDirectory()) continue;
                String name = entry.getName();
                if (name.endsWith(".class")) {
                    classCount++;
                    if (name.startsWith("com/github/catvod/spider/")) hasSpiderPackage = true;
                }
            }
        } finally {
            jar.close();
        }

        JSONObject result = new JSONObject();
        result.put("ok", true);
        result.put("operation", "inspect");
        result.put("path", file.getAbsolutePath());
        result.put("size", file.length());
        result.put("md5", md5(file));
        result.put("classCount", classCount);
        result.put("hasCatVodSpiderPackage", hasSpiderPackage);
        result.put("executionEnabled", false);
        return result.toString();
    }

    private static void download(String urlString, File target) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlString).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", "MyBox-TVBox-Jar/1");
        try (InputStream input = connection.getInputStream();
             FileOutputStream output = new FileOutputStream(target)) {
            int total = 0;
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_JAR_BYTES) throw new SecurityException("TVBOX_JAR_TOO_LARGE");
                output.write(buffer, 0, read);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static String md5(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("MD5");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        byte[] bytes = digest.digest();
        StringBuilder result = new StringBuilder();
        for (byte b : bytes) result.append(String.format(Locale.US, "%02x", b));
        return result.toString();
    }

    private static String normalizeDigest(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.US);
        return normalized.matches("^[0-9a-f]{32}$") ? normalized : "";
    }

    private static String safeFileName(String value) {
        String normalized = value == null ? "spider" : value.replaceAll("[^a-zA-Z0-9._-]", "_");
        return normalized.isEmpty() ? "spider" : normalized.substring(0, Math.min(80, normalized.length()));
    }

    private String error(String code) {
        try {
            return new JSONObject().put("ok", false).put("code", code).put("contractVersion", "1").toString();
        } catch (Exception ignored) {
            return "{\"ok\":false,\"code\":\"TVBOX_JAR_ERROR\"}";
        }
    }
}
