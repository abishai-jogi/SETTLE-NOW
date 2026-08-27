package com.settlenow.ledger.data.prefs

import android.content.Context

class AppPrefs(context: Context) {

    private val prefs = context.getSharedPreferences("settlenow", Context.MODE_PRIVATE)

    var userId: String?
        get() = prefs.getString(KEY_USER_ID, null)
        set(value) = prefs.edit().putString(KEY_USER_ID, value).apply()

    var userName: String?
        get() = prefs.getString(KEY_USER_NAME, null)
        set(value) = prefs.edit().putString(KEY_USER_NAME, value).apply()

    private companion object {
        const val KEY_USER_ID = "my_user_id"
        const val KEY_USER_NAME = "my_user_name"
    }
}
