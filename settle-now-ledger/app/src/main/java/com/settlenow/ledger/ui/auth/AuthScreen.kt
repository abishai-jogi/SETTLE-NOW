package com.settlenow.ledger.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.settlenow.ledger.data.local.entity.UserEntity
import com.settlenow.ledger.data.repo.SettleNowRepository
import com.settlenow.ledger.domain.parseHexColor
import com.settlenow.ledger.domain.prefersDarkText
import com.settlenow.ledger.ui.components.GoldHairline
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class AuthViewModel(private val repository: SettleNowRepository) : ViewModel() {

    enum class Mode { LOGIN, SIGNUP }

    data class UiState(
        val mode: Mode = Mode.LOGIN,
        val error: String? = null,
        val welcome: UserEntity? = null
    )

    val state = MutableStateFlow(UiState())

    fun switchMode(mode: Mode) {
        state.value = state.value.copy(mode = mode, error = null)
    }

    fun submit(name: String, password: String, onSignedIn: (String) -> Unit) {
        val clean = name.trim()
        viewModelScope.launch {
            when (state.value.mode) {
                Mode.LOGIN -> {
                    if (clean.isEmpty() || password.isEmpty()) {
                        state.value = state.value.copy(error = "Please fill in both fields.")
                        return@launch
                    }
                    val user = repository.login(clean, password)
                    if (user == null) {
                        state.value = state.value.copy(error = "Name or password is incorrect.")
                    } else {
                        onSignedIn(user.id)
                    }
                }

                Mode.SIGNUP -> {
                    when (val result = repository.signup(clean, password)) {
                        is SettleNowRepository.SignupResult.Success ->
                            state.value = state.value.copy(welcome = result.user, error = null)
                        SettleNowRepository.SignupResult.NameTaken ->
                            state.value = state.value.copy(error = "That name is already taken.")
                        SettleNowRepository.SignupResult.WeakPassword ->
                            state.value = state.value.copy(error = "Password must be at least 4 characters.")
                    }
                }
            }
        }
    }
}

inline fun <reified VM : ViewModel> simpleFactoryAuth(crossinline create: () -> VM): androidx.lifecycle.ViewModelProvider.Factory =
    object : androidx.lifecycle.ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = create() as T
    }

@Composable
fun AuthScreen(
    repository: SettleNowRepository,
    onSignedIn: (String) -> Unit
) {
    val vm: AuthViewModel = viewModel(factory = simpleFactoryAuth { AuthViewModel(repository) })
    val state by vm.state.collectAsState()

    var name by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    fun submit() {
        val nameValue = name
        vm.submit(nameValue, password) { id ->
            onSignedIn(id)
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Settle Now", style = MaterialTheme.typography.headlineSmall)
        GoldHairline(Modifier.padding(vertical = 12.dp))
        Text(
            "A quiet ledger for whoever shares the house.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        val welcome = state.welcome
        if (welcome != null) {
            Column(
                Modifier.fillMaxWidth().padding(top = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    "Welcome aboard",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.secondary
                )
                Text(welcome.name, style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.padding(vertical = 8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(36.dp)
                            .background(parseHexColor(welcome.color), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            welcome.avatarInitials,
                            color = if (prefersDarkText(welcome.color)) MaterialTheme.colorScheme.onSurface
                            else MaterialTheme.colorScheme.surface
                        )
                    }
                    Spacer(Modifier.padding(horizontal = 6.dp))
                    Text("Your colour", style = MaterialTheme.typography.bodyMedium)
                }
                Button(
                    onClick = { onSignedIn(welcome.id) },
                    modifier = Modifier.fillMaxWidth().padding(top = 20.dp)
                ) { Text("Continue to Home") }
            }
        } else {
            Row(
                Modifier.padding(top = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                listOf(
                    AuthViewModel.Mode.LOGIN to "Sign in",
                    AuthViewModel.Mode.SIGNUP to "Create account"
                ).forEach { (mode, label) ->
                    OutlinedButton(onClick = { vm.switchMode(mode) }) {
                        Text(
                            label,
                            color = if (state.mode == mode) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
            )

            state.error?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 10.dp)
                )
            }

            Button(
                onClick = { submit() },
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp)
            ) {
                Text(if (state.mode == AuthViewModel.Mode.LOGIN) "Sign in" else "Create account")
            }

            Text(
                "Passwords are salted and hashed locally — never stored in plain text.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 14.dp)
            )
        }
    }
}
