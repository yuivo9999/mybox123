package com.yuivo9999.mybox123;

import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.IBinder;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;

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
    public static final int MSG_PING = 1;
    public static final int MSG_CAPABILITIES = 2;
    public static final int MSG_EXECUTE = 3;
    public static final int MSG_RESULT = 100;
    public static final String KEY_REQUEST_ID = "requestId";
    public static final String KEY_PAYLOAD = "payload";

    private final Messenger messenger = new Messenger(new IncomingHandler(Looper.getMainLooper()));

    @Override
    public IBinder onBind(Intent intent) {
        return messenger.getBinder();
    }

    private final class IncomingHandler extends Handler {
        IncomingHandler(Looper looper) { super(looper); }

        @Override public void handleMessage(Message message) {
            String result = capabilities();
            if (message.what == MSG_PING || message.what == MSG_CAPABILITIES) {
                reply(message, result);
                return;
            }
            if (message.what == MSG_EXECUTE) {
                reply(message, error("TVBOX_JAR_ISOLATED_EXECUTION_REQUIRES_PROXY"));
                return;
            }
            super.handleMessage(message);
        }
    }

    private void reply(Message request, String payload) {
        if (request.replyTo == null) return;
        Message response = Message.obtain(null, MSG_RESULT);
        response.setData(new android.os.Bundle());
        response.getData().putString(KEY_REQUEST_ID, request.getData().getString(KEY_REQUEST_ID, ""));
        response.getData().putString(KEY_PAYLOAD, payload);
        try { request.replyTo.send(response); } catch (Exception ignored) { }
    }

    private String capabilities() {
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

    private String error(String code) {
        try { return new JSONObject().put("ok", false).put("code", code).put("protocolVersion", PROTOCOL_VERSION).toString(); }
        catch (Exception ignored) { return "{\"ok\":false,\"code\":\"TVBOX_JAR_ISOLATED_ERROR\"}"; }
    }
}
