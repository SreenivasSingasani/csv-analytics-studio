package com.builtbysreenuzero6.csvanalyticsstudio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CvasDocumentPlugin.class);
        super.onCreate(savedInstanceState);
    }
}