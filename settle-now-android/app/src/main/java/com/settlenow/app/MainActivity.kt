package com.settlenow.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.settlenow.app.navigation.AppNavHost
import com.settlenow.app.sync.SyncWorker
import com.settlenow.app.ui.theme.SettleNowTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        SyncWorker.ensurePeriodicSync(this)
        SyncWorker.requestImmediateSync(this)

        setContent {
            SettleNowTheme {
                val container = application as SettleNowApp
                AppNavHost(
                    repository = container.container.repository,
                    syncEngine = container.container.syncEngine
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        SyncWorker.requestImmediateSync(this)
    }
}
