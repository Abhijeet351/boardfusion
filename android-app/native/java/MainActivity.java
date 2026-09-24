package com.boardfusion.app;

import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // If the live game can't be reached (offline, DNS, dropped connection),
        // show the bundled launcher instead of Android's raw error page.
        // The launcher waits for the connection and reopens the game.
        bridge.setWebViewClient(
            new BridgeWebViewClient(bridge) {
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    super.onReceivedError(view, request, error);
                    if (request.isForMainFrame() && !isLauncher(request.getUrl().toString())) {
                        view.loadUrl(bridge.getLocalUrl() + "/index.html?reason=offline");
                    }
                }
            }
        );

        // Back goes back a page inside the game (e.g. Marble Loop -> Dice Race).
        // On the first page it sends the app to the background instead of
        // closing it, so a running game isn't lost by an accidental back press.
        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    WebView webView = bridge.getWebView();
                    if (webView != null && webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        moveTaskToBack(true);
                    }
                }
            }
        );
    }

    private boolean isLauncher(String url) {
        return url != null && url.startsWith(bridge.getLocalUrl());
    }
}
