package com.settlenow.ledger

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.settlenow.ledger.navigation.AppNavHost
import com.settlenow.ledger.ui.theme.SettleNowTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            SettleNowTheme {
                val app = application as SettleNowApp
                // Phase 1: local-only. SyncEngine / WorkManager wire up in Phase 2.
                AppNavHost(repository = app.container.repository)
            }
        }
    }
}
