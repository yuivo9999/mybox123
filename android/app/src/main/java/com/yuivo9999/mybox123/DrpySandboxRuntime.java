package com.yuivo9999.mybox123;

import org.mozilla.javascript.ClassShutter;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.ContextFactory;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Minimal sandbox for evaluating a Drpy JavaScript definition.
 *
 * This is deliberately not a complete Drpy implementation yet. It provides
 * the execution boundary only. Network, filesystem, Java reflection and
 * Android objects are not exposed to the script.
 */
public final class DrpySandboxRuntime {
    private static final int MAX_INSTRUCTIONS = 200_000;
    private static final long MAX_SCRIPT_CHARS = 1_000_000L;

    private DrpySandboxRuntime() {}

    public static String evaluateDefinition(String source) {
        if (source == null || source.trim().isEmpty()) {
            throw new IllegalArgumentException("DRPY_SCRIPT_REQUIRED");
        }
        if (source.length() > MAX_SCRIPT_CHARS) {
            throw new IllegalArgumentException("DRPY_SCRIPT_TOO_LARGE");
        }

        ContextFactory factory = new ContextFactory() {
            @Override
            protected Context makeContext() {
                Context cx = super.makeContext();
                cx.setInstructionObserverThreshold(10_000);
                cx.setMaximumInterpreterStackDepth(1000);
                return cx;
            }

            @Override
            protected void observeInstructionCount(Context cx, int instructionCount) {
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
            cx.setClassShutter(new ClassShutter() {
                @Override
                public boolean visibleToScripts(String fullClassName) {
                    return false;
                }
            });

            Scriptable scope = cx.initSafeStandardObjects();
            ScriptableObject.putProperty(scope, "console", Context.javaToJS(new SafeConsole(), scope));

            Object result = cx.evaluateString(
                    scope,
                    source,
                    "tvbox-drpy-extension",
                    1,
                    null
            );

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

    private static final class SafeConsole {
        public void log(Object ignored) {}
        public void warn(Object ignored) {}
        public void error(Object ignored) {}
    }
}
