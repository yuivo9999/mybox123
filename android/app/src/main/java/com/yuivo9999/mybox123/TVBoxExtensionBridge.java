package com.yuivo9999.mybox123;

import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Controlled native boundary for TVBox extension sources.
 *
 * This class intentionally does NOT execute CSP/Drpy/JAR/ext code yet.
 * It exposes a versioned capability/operation contract so the React layer
 * can distinguish "definition imported" from "native runtime executable".
 */
public final class TVBoxExtensionBridge {
    public static final String JS_NAME = "TVBoxExtensionBridge";
    public static final String CONTRACT_VERSION = "1";
    private static final Set<String> OPERATIONS = new HashSet<>(Arrays.asList(
            "healthCheck", "load", "search", "detail", "episodes", "playUrl"
    ));
    private static final Set<String> KINDS = new HashSet<>(Arrays.asList(
            "csp", "drpy-js", "jar", "ext", "unknown"
    ));

    @JavascriptInterface
    public String getCapabilities() {
        try {
            JSONObject result = new JSONObject();
            result.put("contractVersion", CONTRACT_VERSION);
            result.put("available", false);
            result.put("runtimeVersion", JSONObject.NULL);
            result.put("supportedKinds", new JSONArray());
            result.put("supportedOperations", new JSONArray());
            result.put("reason", "TVBOX_EXTENSION_RUNTIME_NOT_IMPLEMENTED");
            return result.toString();
        } catch (Exception e) {
            return "{\"available\":false,\"reason\":\"TVBOX_EXTENSION_CAPABILITY_ERROR\"}";
        }
    }

    @JavascriptInterface
    public String execute(String payload) {
        try {
            JSONObject input = new JSONObject(payload == null ? "{}" : payload);
            String operation = input.optString("operation", "");
            JSONObject definition = input.optJSONObject("definition");
            String kind = definition == null ? "" : definition.optString("kind", "unknown");

            if (!OPERATIONS.contains(operation)) {
                return error("TVBOX_EXTENSION_OPERATION_UNSUPPORTED", operation, kind);
            }
            if (!KINDS.contains(kind)) {
                return error("TVBOX_EXTENSION_KIND_UNSUPPORTED", operation, kind);
            }

            return error("TVBOX_EXTENSION_RUNTIME_UNAVAILABLE", operation, kind);
        } catch (Exception e) {
            return error("TVBOX_EXTENSION_INVALID_REQUEST", "", "");
        }
    }

    private String error(String code, String operation, String kind) {
        try {
            JSONObject result = new JSONObject();
            result.put("ok", false);
            result.put("code", code);
            result.put("operation", operation);
            result.put("kind", kind);
            result.put("contractVersion", CONTRACT_VERSION);
            return result.toString();
        } catch (Exception ignored) {
            return "{\"ok\":false,\"code\":\"TVBOX_EXTENSION_BRIDGE_ERROR\"}";
        }
    }
}
