package com.settlenow.firebase

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.callbackFlow
import com.settlenow.firebase.navigation.AppNavHost
import com.settlenow.firebase.ui.auth.AuthScreen
import com.settlenow.firebase.ui.theme.SettleNowTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as SettleNowApp).container

        setContent {
            SettleNowTheme {
                val authState by rememberAuthState(container.auth).collectAsState(initial = container.auth.currentUser)

                if (authState == null) {
                    AuthScreen(
                        repository = container.repository,
                        onSignedIn = { }
                    )
                } else {
                    AppNavHost(repository = container.repository)
                }
            }
        }
    }
}

private fun rememberAuthState(auth: FirebaseAuth) = callbackFlow {
    val listener = FirebaseAuth.AuthStateListener { trySend(it.currentUser) }
    auth.addAuthStateListener(listener)
    awaitClose { auth.removeAuthStateListener(listener) }
}
