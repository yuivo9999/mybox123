package com.yuivo9999.mybox123;

import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.IBinder;

import org.json.JSONObject;

/**
 * Isolated-process protocol boundary for future CatVod Spider execution.
 *
 * No host-private paths, Binder callbacks, or network capabilities are exposed
 * to untrusted JAR code here. Execution remains disabled until explicit host
 * file/network proxying is implemented.
 */
public final class TVBoxJarExecutionService extends Service {
    public static final String ACTION = "com.yuivo9999.mybox123.TVBOX_JAR_EXECUTE";
    private static final String PROTOCOL_VERSION = "1";
    private final LocalBinder binder = new LocalBinder();

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    public final class LocalBinder extends Binder {
        public String getProtocolVersion() {
            return PROTOCOL_VERSION;
        }

        public String describeCapabilities() {
            try {
                return new JSONObject()
                        .put("ok", true)
                        .put("protocolVersion", PROTOCOL_VERSION)
                        .put("executionEnabled", false)
                        .put("executionMode", "isolated-process-protocol-only")
                        .put("networkProxyRequired", true)
                        .put("hostFileProxyRequired", true)
                        .toString();
            } catch (Exception e) {
                return "{\"ok\":false,\"code\":\"TVBOX_JAR_ISOLATED_CAPABILITY_ERROR\"}";
            }
        }
    }
}
