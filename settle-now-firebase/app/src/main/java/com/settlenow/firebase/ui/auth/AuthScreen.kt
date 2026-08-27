package com.settlenow.firebase.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.activity.ComponentActivity
import androidx.lifecycle.viewmodel.compose.viewModel
import com.settlenow.firebase.data.repo.FirebaseRepository
import com.settlenow.firebase.ui.components.OfflineBanner

@Composable
fun AuthScreen(
    repository: FirebaseRepository,
    onSignedIn: () -> Unit
) {
    val vm: AuthViewModel = viewModel()
    val state by vm.state.collectAsState()

    // Signed-in users land here only for a frame; the auth-state listener in
    // MainActivity swaps to the app shell.
    androidx.compose.runtime.LaunchedEffect(Unit) {
        if (com.google.firebase.auth.FirebaseAuth.getInstance().currentUser != null) {
            onSignedIn()
        }
    }

    val context = LocalContext.current

    Column(
        Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        OfflineBanner(Modifier.align(Alignment.CenterHorizontally).fillMaxWidth())

        Text("Settle Now", style = MaterialTheme.typography.headlineSmall)
        com.settlenow.firebase.ui.components.GoldHairline(Modifier.padding(vertical = 12.dp))
        Text(
            "Sign in with your phone number to join or start a room.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        when (state.stage) {
            AuthStage.PHONE -> {
                var phone by remember { mutableStateOf(state.phone) }
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it; vm.setPhone(it) },
                    label = { Text("Phone number (+countrycode)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 24.dp)
                )
                Button(
                    enabled = !state.loading,
                    onClick = {
                        vm.setPhone(phone)
                        (context as? ComponentActivity)?.let { vm.startVerification(it) }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp)
                ) {
                    Text(if (state.loading) "Sending…" else "Send code")
                }
            }

            AuthStage.OTP -> {
                var code by remember { mutableStateOf("") }
                Text(
                    "Enter the 6-digit code sent to ${state.phone}",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 24.dp)
                )
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.filter { c -> c.isDigit() }.take(6) },
                    label = { Text("OTP") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                )
                Button(
                    enabled = !state.loading,
                    onClick = { vm.submitOtp(code) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp)
                ) { Text("Verify & sign in") }

                OutlinedButton(
                    enabled = !state.loading,
                    onClick = { (context as? ComponentActivity)?.let { vm.resend(it) } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                ) { Text("Resend code") }
            }
        }

        state.error?.let {
            Text(
                it,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 12.dp)
            )
        }
    }
}
