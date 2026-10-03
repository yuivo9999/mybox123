package com.yuivo9999.mybox123;

import android.app.Service;
import android.content.Intent;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Message;
import android.os.Messenger;

import org.json.JSONObject;

/**
 * Isolated-process protocol boundary for future CatVod Spider execution.
 *
 * Execution remains disabled until the Spider itself is hosted in this process
 * and all required file/network operations are routed through the host proxy.
 */
public final class TVBoxJarExecutionService extends Service {
    public static final String ACTION = "com.yuivo9999.mybox123.TVBOX_JAR_EXECUTE";
    private static final String PROTOCOL_VERSION = "1";
    public static final int MSG_PING = 1;
    public static final int MSG_CAPABILITIES = 2;
    public static final int MSG_EXECUTE = 3;
    public static final int MSG_NETWORK_REQUEST = 4;
    public static final int MSG_FILE_READ = 5;
    public static final int MSG_RESULT = 100;
    public static final int MSG_NETWORK_RESULT = 101;
    public static final int MSG_FILE_RESULT = 102;
    private static final int MAX_MESSAGE_CHARS = 256 * 1024;
    private static final int MAX_PROXY_BODY_CHARS = 192 * 1024;
    public static final String KEY_REQUEST_ID = "requestId";
    public static final String KEY_PAYLOAD = "payload";

    private HandlerThread handlerThread;
    private Messenger messenger;

    @Override
    public void onCreate() {
        super.onCreate();
        handlerThread = new HandlerThread("tvbox-jar-isolated-service");
        handlerThread.start();
        messenger = new Messenger(new IncomingHandler(handlerThread.getLooper()));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return messenger.getBinder();
    }

    @Override
    public void onDestroy() {
        if (handlerThread != null) handlerThread.quitSafely();
        handlerThread = null;
        messenger = null;
        super.onDestroy();
    }

    private final class IncomingHandler extends Handler {
        IncomingHandler(android.os.Looper looper) { super(looper); }

        @Override public void handleMessage(Message message) {
            if (message.what == MSG_PING || message.what == MSG_CAPABILITIES) {
                reply(message, capabilities(), MSG_RESULT);
                return;
            }
            if (message.what == MSG_EXECUTE) {
                reply(message, error("TVBOX_JAR_ISOLATED_EXECUTION_NOT_ENABLED"), MSG_RESULT);
                return;
            }
            // These messages are reserved for the isolated Spider runtime to
            // request host-side resources. The current process does not execute
            // a Spider yet, so receiving them directly is rejected.
            if (message.what == MSG_NETWORK_REQUEST) {
                reply(message, error("TVBOX_JAR_NETWORK_PROXY_REQUEST_UNEXPECTED"), MSG_NETWORK_RESULT);
                return;
            }
            if (message.what == MSG_FILE_READ) {
                reply(message, error("TVBOX_JAR_FILE_PROXY_REQUEST_UNEXPECTED"), MSG_FILE_RESULT);
                return;
            }
            if (message.what == MSG_NETWORK_RESULT || message.what == MSG_FILE_RESULT) {
                // Result messages are consumed by the requesting isolated
                // runtime in the future. They are deliberately not interpreted
                // as executable commands by this protocol boundary.
                return;
            }
            super.handleMessage(message);
        }
    }

    private void reply(Message request, String payload, int what) {
        if (request.replyTo == null) return;
        String safePayload = payload == null ? "" : payload;
        if (safePayload.length() > MAX_MESSAGE_CHARS) safePayload = error("TVBOX_JAR_PROTOCOL_PAYLOAD_TOO_LARGE");
        Message response = Message.obtain(null, what);
        android.os.Bundle data = new android.os.Bundle();
        data.putString(KEY_REQUEST_ID, request.getData().getString(KEY_REQUEST_ID, ""));
        data.putString(KEY_PAYLOAD, safePayload);
        response.setData(data);
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
                    .put("maxMessageChars", MAX_MESSAGE_CHARS)
                    .put("networkMessage", MSG_NETWORK_REQUEST)
                    .put("fileMessage", MSG_FILE_READ)
                    .put("networkResultMessage", MSG_NETWORK_RESULT)
                    .put("fileResultMessage", MSG_FILE_RESULT)
                    .put("maxProxyBodyChars", MAX_PROXY_BODY_CHARS)
                    .toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"code\":\"TVBOX_JAR_ISOLATED_CAPABILITY_ERROR\"}";
        }
    }

    private String error(String code) {
        try {
            return new JSONObject().put("ok", false).put("code", code).put("protocolVersion", PROTOCOL_VERSION).toString();
        } catch (Exception ignored) {
            return "{\"ok\":false,\"code\":\"TVBOX_JAR_ISOLATED_ERROR\"}";
        }
    }
}
