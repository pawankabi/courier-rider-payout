package com.courier.riderpayout;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundSmsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
