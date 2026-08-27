package com.settlenow.app

import android.app.Application
import com.settlenow.app.data.local.SettleNowDatabase
import com.settlenow.app.data.prefs.AppPrefs
import com.settlenow.app.data.remote.SyncApi
import com.settlenow.app.data.repo.SettleNowRepository
import com.settlenow.app.sync.SyncEngine

/** Base URL for local development: emulator reaches host machine via 10.0.2.2. */
const val SYNC_BASE_URL = "http://10.0.2.2:4000/"

class SettleNowApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

class AppContainer(context: android.content.Context) {
    val database: SettleNowDatabase = SettleNowDatabase.build(context)
    val prefs: AppPrefs = AppPrefs(context)
    val repository: SettleNowRepository = SettleNowRepository(database, prefs)
    val syncEngine: SyncEngine = SyncEngine(database, prefs, SyncApi(SYNC_BASE_URL))
}
