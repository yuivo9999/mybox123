package com.yuivo9999.mybox123;

import org.mozilla.javascript.BaseFunction;
import org.mozilla.javascript.ClassShutter;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.ContextFactory;
import org.mozilla.javascript.NativeObject;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

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
