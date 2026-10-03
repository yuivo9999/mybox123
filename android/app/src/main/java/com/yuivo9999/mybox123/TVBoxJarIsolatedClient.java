package com.yuivo9999.mybox123;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;
import android.os.RemoteException;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Host-side protocol client for the isolated CatVod boundary. Execution stays disabled until proxy handlers are implemented. */
public final class TVBoxJarIsolatedClient implements AutoCloseable {
    private static final long DEFAULT_TIMEOUT_MS = 8_000L;
    private final Context context;
    private final Messenger incoming = new Messenger(new Handler(Looper.getMainLooper()) {
        @Override public void handleMessage(Message message) {
            synchronized (responses) { responses.put(message.getData().getString(TVBoxJarExecutionService.KEY_REQUEST_ID, ""), message.getData().getString(TVBoxJarExecutionService.KEY_PAYLOAD, "")); responses.notifyAll(); }
        }
    });
    private final java.util.Map<String, String> responses = new java.util.HashMap<>();
    private Messenger remote;
    private boolean bound;

    public TVBoxJarIsolatedClient(Context context) { this.context = context.getApplicationContext(); }

    public synchronized void connect() throws InterruptedException {
        if (bound && remote != null) return;
        CountDownLatch latch = new CountDownLatch(1);
        Intent intent = new Intent(context, TVBoxJarExecutionService.class);
        context.bindService(intent, new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, android.os.IBinder service) { synchronized (TVBoxJarIsolatedClient.this) { remote = new Messenger(service); bound = true; } latch.countDown(); }
            @Override public void onServiceDisconnected(ComponentName name) { synchronized (TVBoxJarIsolatedClient.this) { remote = null; bound = false; } }
        }, Context.BIND_AUTO_CREATE);
        if (!latch.await(DEFAULT_TIMEOUT_MS, TimeUnit.MILLISECONDS)) throw new IllegalStateException("TVBOX_JAR_ISOLATED_CONNECT_TIMEOUT");
    }

    public String capabilities() throws Exception { return request(TVBoxJarExecutionService.MSG_CAPABILITIES, "{}"); }

    public synchronized String request(int what, String payload) throws Exception {
        if (!bound || remote == null) throw new IllegalStateException("TVBOX_JAR_ISOLATED_NOT_CONNECTED");
        String requestId = UUID.randomUUID().toString();
        Message message = Message.obtain(null, what);
        Bundle data = new Bundle();
        data.putString(TVBoxJarExecutionService.KEY_REQUEST_ID, requestId);
        data.putString(TVBoxJarExecutionService.KEY_PAYLOAD, payload == null ? "" : payload);
        message.setData(data); message.replyTo = incoming;
        remote.send(message);
        long deadline = System.currentTimeMillis() + DEFAULT_TIMEOUT_MS;
        synchronized (responses) {
            while (!responses.containsKey(requestId)) {
                long remaining = deadline - System.currentTimeMillis();
                if (remaining <= 0) throw new IllegalStateException("TVBOX_JAR_ISOLATED_REQUEST_TIMEOUT");
                responses.wait(remaining);
            }
            return responses.remove(requestId);
        }
    }

    @Override public synchronized void close() {
        if (!bound) return;
        try { context.unbindService(new NoopConnection()); } catch (Exception ignored) { }
        remote = null; bound = false;
    }

    private static final class NoopConnection implements ServiceConnection {
        public void onServiceConnected(ComponentName name, android.os.IBinder service) {}
        public void onServiceDisconnected(ComponentName name) {}
    }
}