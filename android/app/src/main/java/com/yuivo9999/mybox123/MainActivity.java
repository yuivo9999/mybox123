package com.yuivo9999.mybox123;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private NativePlaybackBridge playbackBridge;
    private TVBoxExtensionBridge tvBoxExtensionBridge;
    private TVBoxJarBridge tvBoxJarBridge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        playbackBridge = new NativePlaybackBridge(this, webView);
        webView.addJavascriptInterface(playbackBridge, NativePlaybackBridge.JS_NAME);

        tvBoxExtensionBridge = new TVBoxExtensionBridge();
        webView.addJavascriptInterface(tvBoxExtensionBridge, TVBoxExtensionBridge.JS_NAME);

        tvBoxJarBridge = new TVBoxJarBridge(this);
        webView.addJavascriptInterface(tvBoxJarBridge, TVBoxJarBridge.JS_NAME);
    }

    @Override
    public void onDestroy() {
        if (playbackBridge != null) {
            playbackBridge.release();
            playbackBridge = null;
        }
        tvBoxExtensionBridge = null;
        if (tvBoxJarBridge != null) {
            tvBoxJarBridge.release();
            tvBoxJarBridge = null;
        }
        super.onDestroy();
    }
}
