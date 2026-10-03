package com.yuivo9999.mybox123;

import org.mozilla.javascript.BaseFunction;
import org.mozilla.javascript.ClassShutter;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.ContextFactory;
import org.mozilla.javascript.NativeObject;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;
import org.json.JSONObject;

import java.io.IOException;

/**
 * Minimal sandbox for evaluating a Drpy JavaScript definition.
 *
 * Network access is exposed only through a small host function. Java classes,
 * reflection, filesystem and Android objects remain hidden by ClassShutter.
 */
public final class DrpySandboxRuntime {
    private static final int MAX_INSTRUCTIONS = 200_000;
    private static final long MAX_SCRIPT_CHARS = 1_000_000L;

    private DrpySandboxRuntime() {}

    public static String evaluateDefinition(String source) {
        return evaluate(source, null);
    }

    public static String evaluate(String source, HttpRequestHandler requestHandler) {
        if (source == null || source.trim().isEmpty()) throw new IllegalArgumentException("DRPY_SCRIPT_REQUIRED");
        if (source.length() > MAX_SCRIPT_CHARS) throw new IllegalArgumentException("DRPY_SCRIPT_TOO_LARGE");

        ContextFactory factory = new ContextFactory() {
            @Override protected Context makeContext() {
                Context cx = super.makeContext();
                cx.setInstructionObserverThreshold(10_000);
                cx.setMaximumInterpreterStackDepth(1000);
                return cx;
            }

            @Override protected void observeInstructionCount(Context cx, int instructionCount) {
                Integer count = (Integer) cx.getThreadLocal("tvboxDrpyInstructionCount");
                int total = (count == null ? 0 : count) + instructionCount;
                if (total > MAX_INSTRUCTIONS) throw new SecurityException("DRPY_SCRIPT_INSTRUCTION_LIMIT");
                cx.putThreadLocal("tvboxDrpyInstructionCount", total);
            }
        };

        Context cx = factory.enterContext();
        try {
            cx.setLanguageVersion(Context.VERSION_ES6);
            cx.setOptimizationLevel(-1);
            cx.setClassShutter(fullClassName -> false);

            Scriptable scope = cx.initSafeStandardObjects();
            if (requestHandler != null) {
                BaseFunction request = new HttpRequestFunction(requestHandler);
                ScriptableObject.putProperty(scope, "request", request);
                ScriptableObject.putProperty(scope, "req", request);
                ScriptableObject.putProperty(scope, "fetch", request);
            }
            ScriptableObject.putProperty(scope, "console", Context.javaToJS(new SafeConsole(), scope));
            installDomFunctions(cx, scope);

            Object result = cx.evaluateString(scope, source, "tvbox-drpy-extension", 1, null);
            Object rule = ScriptableObject.getProperty(scope, "rule");
            if (rule == Scriptable.NOT_FOUND) rule = result;
            if (rule == Scriptable.NOT_FOUND || rule == null) return "";

            ScriptableObject.putProperty(scope, "__tvboxRule", rule);
            Object json = cx.evaluateString(scope, "JSON.stringify(__tvboxRule)", "tvbox-drpy-json", 1, null);
            return json == null ? "" : Context.toString(json);
        } finally {
            Context.exit();
        }
    }


    /**
     * Execute a deliberately small operation surface against a previously
     * defined Drpy rule. The script is evaluated in the same sandbox as load;
     * no Java classes or Android objects are exposed. Only explicitly defined
     * rule functions are callable. String-based Drpy selectors such as 一级/二级
     * are not interpreted here and must remain unsupported until a DOM adapter
     * is added.
     */
    public static String executeOperation(
            String source,
            String operation,
            String payloadJson,
            HttpRequestHandler requestHandler
    ) {
        if (source == null || source.trim().isEmpty()) throw new IllegalArgumentException("DRPY_SCRIPT_REQUIRED");
        if (source.length() > MAX_SCRIPT_CHARS) throw new IllegalArgumentException("DRPY_SCRIPT_TOO_LARGE");

        ContextFactory factory = new ContextFactory() {
            @Override protected Context makeContext() {
                Context cx = super.makeContext();
                cx.setInstructionObserverThreshold(10_000);
                cx.setMaximumInterpreterStackDepth(1000);
                return cx;
            }

            @Override protected void observeInstructionCount(Context cx, int instructionCount) {
                Integer count = (Integer) cx.getThreadLocal("tvboxDrpyInstructionCount");
                int total = (count == null ? 0 : count) + instructionCount;
                if (total > MAX_INSTRUCTIONS) throw new SecurityException("DRPY_SCRIPT_INSTRUCTION_LIMIT");
                cx.putThreadLocal("tvboxDrpyInstructionCount", total);
            }
        };

        Context cx = factory.enterContext();
        try {
            cx.setLanguageVersion(Context.VERSION_ES6);
            cx.setOptimizationLevel(-1);
            cx.setClassShutter(fullClassName -> false);

            Scriptable scope = cx.initSafeStandardObjects();
            if (requestHandler != null) {
                BaseFunction request = new HttpRequestFunction(requestHandler);
                ScriptableObject.putProperty(scope, "request", request);
                ScriptableObject.putProperty(scope, "req", request);
                ScriptableObject.putProperty(scope, "fetch", request);
            }
            ScriptableObject.putProperty(scope, "console", Context.javaToJS(new SafeConsole(), scope));
            installDomFunctions(cx, scope);

            String safePayload = payloadJson == null || payloadJson.trim().isEmpty() ? "{}" : payloadJson;
            Object parsedPayload = cx.evaluateString(
                    scope,
                    "JSON.parse(" + JSONObject.quote(safePayload) + ")",
                    "tvbox-drpy-payload",
                    1,
                    null
            );
            ScriptableObject.putProperty(scope, "input", parsedPayload);
            ScriptableObject.putProperty(scope, "params", parsedPayload);

            cx.evaluateString(scope, source, "tvbox-drpy-extension", 1, null);
            Object rule = ScriptableObject.getProperty(scope, "rule");
            if (!(rule instanceof Scriptable)) throw new IllegalArgumentException("DRPY_RULE_REQUIRED");

            String functionName = operationFunctionName(operation);
            Object fn = ScriptableObject.getProperty((Scriptable) rule, functionName);
            if (!(fn instanceof BaseFunction)) {
                fn = ScriptableObject.getProperty(scope, functionName);
            }
            if (!(fn instanceof BaseFunction)) {
                throw new UnsupportedOperationException("DRPY_OPERATION_FUNCTION_UNSUPPORTED:" + operation);
            }

            Object result = ((BaseFunction) fn).call(
                    cx,
                    scope,
                    (Scriptable) rule,
                    new Object[]{parsedPayload}
            );
            if (result == null || result == Scriptable.NOT_FOUND) return "null";

            ScriptableObject.putProperty(scope, "__tvboxOperationResult", result);
            Object json = cx.evaluateString(
                    scope,
                    "JSON.stringify(__tvboxOperationResult)",
                    "tvbox-drpy-operation-json",
                    1,
                    null
            );
            return json == null ? "null" : Context.toString(json);
        } finally {
            Context.exit();
        }
    }

    private static String operationFunctionName(String operation) {
        if ("search".equals(operation)) return "search";
        if ("detail".equals(operation)) return "detail";
        if ("episodes".equals(operation)) return "episodes";
        if ("playUrl".equals(operation)) return "playUrl";
        throw new IllegalArgumentException("DRPY_OPERATION_UNSUPPORTED:" + operation);
    }

    private static void installDomFunctions(Context cx, Scriptable scope) {
        BaseFunction pdfh = new DomFunction("pdfh");
        BaseFunction pdfa = new DomFunction("pdfa");
        BaseFunction pd = new DomFunction("pd");
        ScriptableObject.putProperty(scope, "pdfh", pdfh);
        ScriptableObject.putProperty(scope, "pdfa", pdfa);
        ScriptableObject.putProperty(scope, "pd", pd);
        Scriptable jq = cx.newObject(scope);
        jq.put("pdfh", jq, pdfh);
        jq.put("pdfa", jq, pdfa);
        jq.put("pd", jq, pd);
        ScriptableObject.putProperty(scope, "jq", jq);
        ScriptableObject.putProperty(scope, "jsp", jq);
    }

    private static final class DomFunction extends BaseFunction {
        private final String operation;
        DomFunction(String operation) { this.operation = operation; }

        @Override public Object call(Context cx, Scriptable scope, Scriptable thisObj, Object[] args) {
            String html = "";
            String parse = args.length > 1 ? Context.toString(args[1]) : "";
            String uri = args.length > 2 ? Context.toString(args[2]) : "";
            String baseUrl = uri;
            if (args.length > 0 && args[0] instanceof Scriptable) {
                Scriptable value = (Scriptable) args[0];
                Object htmlValue = ScriptableObject.getProperty(value, "html");
                Object baseValue = ScriptableObject.getProperty(value, "baseUrl");
                if (htmlValue != Scriptable.NOT_FOUND) html = Context.toString(htmlValue);
                if (baseValue != Scriptable.NOT_FOUND) baseUrl = Context.toString(baseValue);
            } else if (args.length > 0) {
                html = Context.toString(args[0]);
            }

            try {
                if ("pdfh".equals(operation)) {
                    return DrpyDomRuntime.pdfh(html, parse, baseUrl);
                }
                if ("pd".equals(operation)) {
                    return DrpyDomRuntime.pd(html, parse, uri, baseUrl);
                }
                String json = DrpyDomRuntime.pdfa(html, parse, baseUrl);
                return cx.evaluateString(scope,
                        "JSON.parse(" + JSONObject.quote(json) + ")",
                        "drpy-dom-pdfa-result", 1, null);
            } catch (Exception e) {
                throw new IllegalArgumentException(e.getMessage() == null ? "DRPY_DOM_ERROR" : e.getMessage());
            }
        }
    }

    public interface HttpRequestHandler {
        DrpyHttpRuntime.Response request(String method, String url, String body, String contentType) throws IOException;
    }

    private static final class HttpRequestFunction extends BaseFunction {
        private final HttpRequestHandler handler;

        HttpRequestFunction(HttpRequestHandler handler) { this.handler = handler; }

        @Override public Object call(Context cx, Scriptable scope, Scriptable thisObj, Object[] args) {
            String url = args.length > 0 ? Context.toString(args[0]) : "";
            String method = "GET";
            String body = "";
            String contentType = "application/x-www-form-urlencoded; charset=UTF-8";

            if (args.length > 1 && args[1] instanceof Scriptable) {
                Scriptable options = (Scriptable) args[1];
                Object value = ScriptableObject.getProperty(options, "method");
                if (value != Scriptable.NOT_FOUND && value != null) method = Context.toString(value);
                value = ScriptableObject.getProperty(options, "body");
                if (value != Scriptable.NOT_FOUND && value != null) body = Context.toString(value);
                value = ScriptableObject.getProperty(options, "contentType");
                if (value != Scriptable.NOT_FOUND && value != null) contentType = Context.toString(value);
            }

            try {
                DrpyHttpRuntime.Response response = handler.request(method, url, body, contentType);
                NativeObject result = new NativeObject();
                result.put("status", result, response.status);
                result.put("statusCode", result, response.status);
                result.put("contentType", result, response.contentType);
                result.put("body", result, response.body);
                result.put("text", result, response.body);
                return result;
            } catch (Exception e) {
                throw new RuntimeException(e.getMessage() == null ? "DRPY_HTTP_ERROR" : e.getMessage());
            }
        }
    }

    private static final class SafeConsole {
        public void log(Object ignored) {}
        public void warn(Object ignored) {}
        public void error(Object ignored) {}
    }
}
