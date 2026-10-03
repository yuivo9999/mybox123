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
 * Drpy now has a bounded native HTTP capability in addition to sandboxed load.
 * Higher-level Drpy search/detail/play orchestration and other extension kinds
 * remain explicitly unsupported until their adapters are implemented.
 */
public final class TVBoxExtensionBridge {
    public static final String JS_NAME = "TVBoxExtensionBridge";
    public static final String CONTRACT_VERSION = "1";
    private static final Set<String> OPERATIONS = new HashSet<>(Arrays.asList(
            "healthCheck", "load", "request", "search", "detail", "episodes", "playUrl"
    ));
    private static final Set<String> KINDS = new HashSet<>(Arrays.asList(
            "csp", "drpy-js", "jar", "ext", "unknown"
    ));

    @JavascriptInterface
    public String getCapabilities() {
        try {
            JSONObject result = new JSONObject();
            result.put("contractVersion", CONTRACT_VERSION);
            result.put("available", true);
            result.put("supportedKinds", new JSONArray().put("drpy-js"));
            result.put("supportedOperations", new JSONArray().put("load").put("request"));
            result.put("runtimeVersion", "drpy-sandbox-2");
            result.put("reason", "DRPY_LOAD_AND_HTTP");
            return result.toString();
        } catch (Exception e) {
            return "{\"available\":false,\"reason\":\"TVBOX_EXTENSION_CAPABILITY_ERROR\"}";
        }
    }

    @JavascriptInterface
    public String execute(String payload) {
        String operation = "";
        String kind = "";
        try {
            JSONObject input = new JSONObject(payload == null ? "{}" : payload);
            operation = input.optString("operation", "");
            JSONObject definition = input.optJSONObject("definition");
            kind = definition == null ? "" : definition.optString("kind", "unknown");

            if (!OPERATIONS.contains(operation)) return error("TVBOX_EXTENSION_OPERATION_UNSUPPORTED", operation, kind);
            if (!KINDS.contains(kind)) return error("TVBOX_EXTENSION_KIND_UNSUPPORTED", operation, kind);
            if (!"drpy-js".equals(kind) || !(operation.equals("load") || operation.equals("request"))) {
                return error("TVBOX_EXTENSION_OPERATION_UNSUPPORTED", operation, kind);
            }

            JSONObject payloadObject = input.optJSONObject("payload");
            if ("load".equals(operation)) {
                String script = payloadObject == null ? "" : payloadObject.optString("script", "");
                String ruleJson = DrpySandboxRuntime.evaluate(script, DrpyHttpRuntime::request);
                JSONObject result = new JSONObject();
                result.put("ok", true);
                result.put("operation", operation);
                result.put("kind", kind);
                result.put("contractVersion", CONTRACT_VERSION);
                result.put("rule", new JSONObject(ruleJson));
                return result.toString();
            }

            String url = payloadObject == null ? "" : payloadObject.optString("url", "");
            String method = payloadObject == null ? "GET" : payloadObject.optString("method", "GET");
            String body = payloadObject == null ? "" : payloadObject.optString("body", "");
            String contentType = payloadObject == null
                    ? "application/x-www-form-urlencoded; charset=UTF-8"
                    : payloadObject.optString("contentType", "application/x-www-form-urlencoded; charset=UTF-8");

            DrpyHttpRuntime.Response response = DrpyHttpRuntime.request(method, url, body, contentType);
            JSONObject result = new JSONObject();
            result.put("ok", true);
            result.put("operation", operation);
            result.put("kind", kind);
            result.put("contractVersion", CONTRACT_VERSION);
            result.put("status", response.status);
            result.put("contentType", response.contentType);
            result.put("body", response.body);
            return result.toString();
        } catch (SecurityException e) {
            return error(e.getMessage() == null ? "DRPY_SCRIPT_SECURITY_ERROR" : e.getMessage(), operation, kind);
        } catch (IllegalArgumentException e) {
            return error(e.getMessage() == null ? "DRPY_SCRIPT_INVALID" : e.getMessage(), operation, kind);
        } catch (Exception e) {
            return error(e.getMessage() == null ? "TVBOX_EXTENSION_EXECUTION_ERROR" : e.getMessage(), operation, kind);
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
