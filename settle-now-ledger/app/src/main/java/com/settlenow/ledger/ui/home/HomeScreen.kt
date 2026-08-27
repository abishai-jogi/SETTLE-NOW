package com.settlenow.ledger.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.settlenow.ledger.data.repo.SettleNowRepository
import com.settlenow.ledger.domain.parseHexColor
import com.settlenow.ledger.domain.prefersDarkText
import com.settlenow.ledger.ui.components.OfflineBanner
import com.settlenow.ledger.ui.theme.Faded
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class HomeViewModel(private val repository: SettleNowRepository) : ViewModel() {

    val ledgers = repository.observeMyLedgers()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val me = MutableStateFlow<com.settlenow.ledger.data.local.entity.UserEntity?>(null)

    init {
        viewModelScope.launch { me.value = repository.currentUser() }
    }

    fun createLedger(name: String, onCreated: (String) -> Unit) {
        if (name.isBlank()) return
        viewModelScope.launch {
            repository.createLedger(name)?.let(onCreated)
        }
    }

    fun join(code: String, onResult: (JoinResult) -> Unit) {
        viewModelScope.launch {
            onResult(
                when (val outcome = repository.joinLedgerByCode(code)) {
                    is SettleNowRepository.JoinOutcome.Success ->
                        JoinResult.Success(outcome.ledgerId)
                    SettleNowRepository.JoinOutcome.NotFound -> JoinResult.NotFound
                    SettleNowRepository.JoinOutcome.RoomFull -> JoinResult.Full
                    is SettleNowRepository.JoinOutcome.Error -> JoinResult.Error
                }
            )
        }
    }
}

sealed interface JoinResult {
    data class Success(val ledgerId: String) : JoinResult
    data object NotFound : JoinResult
    data object Full : JoinResult
    data object Error : JoinResult
}

inline fun <reified VM : ViewModel> simpleFactory(crossinline create: () -> VM): ViewModelProvider.Factory =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = create() as T
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    repository: SettleNowRepository,
    onLogout: () -> Unit,
    onOpenLedger: (String) -> Unit
) {
    val vm: HomeViewModel = viewModel(factory = simpleFactory { HomeViewModel(repository) })
    val ledgers by vm.ledgers.collectAsState()
    val me by vm.me.collectAsState()

    var createDialog by remember { mutableStateOf(false) }
    var joinDialog by remember { mutableStateOf(false) }
    var joining by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settle Now") },
                actions = {
                    Text(
                        text = "Phase 1 · local",
                        style = MaterialTheme.typography.labelSmall,
                        color = Faded,
                        modifier = Modifier.padding(end = 4.dp)
                    )
                    TextButton(onClick = onLogout) { Text("Sign out") }
                },
                navigationIcon = {
                    me?.let { user ->
                        Box(
                            modifier = Modifier
                                .padding(start = 12.dp)
                                .size(30.dp)
                                .background(parseHexColor(user.color), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = SettleNowRepository.initialsOf(user.name),
                                style = MaterialTheme.typography.labelSmall,
                                color = if (prefersDarkText(user.color))
                                    androidx.compose.ui.graphics.Color(0xFF262220)
                                else androidx.compose.ui.graphics.Color(0xFFF5F0E6)
                            )
                        }
                    }
                }
            )
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            OfflineBanner()

            Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Button(onClick = { createDialog = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("+ Create Ledger")
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { joinDialog = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("Join Ledger")
                }
            }

            if (ledgers.isEmpty()) {
                Column(
                    Modifier.fillMaxSize().padding(top = 64.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("No ledgers yet", style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.height(8.dp))
                    Text("Create one or join with a code.", color = Faded)
                }
            } else {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    item {
                        Text(
                            "Your ledgers",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(bottom = 2.dp)
                        )
                    }
                    items(ledgers, key = { it.id }) { ledger ->
                        Card(
                            onClick = { onOpenLedger(ledger.id) },
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                        ) {
                            Column(Modifier.padding(16.dp)) {
                                Text(ledger.name, style = MaterialTheme.typography.titleMedium)
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "${ledger.memberCount} members · code ${ledger.invite_code}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Faded
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (createDialog) {
        var name by remember { mutableStateOf("") }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { createDialog = false },
            title = { Text("Create Ledger") },
            text = {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Ledger name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(
                    enabled = name.isNotBlank(),
                    onClick = {
                        createDialog = false
                        vm.createLedger(name) { onOpenLedger(it) }
                    }
                ) { Text("Create") }
            },
            dismissButton = {
                OutlinedButton(onClick = { createDialog = false }) { Text("Cancel") }
            }
        )
    }

    if (joinDialog) {
        var code by remember { mutableStateOf("") }
        var errorText by remember { mutableStateOf<String?>(null) }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { if (!joining) joinDialog = false },
            title = { Text("Join Ledger") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = code,
                        onValueChange = { code = it.uppercase() },
                        label = { Text("Invite code") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        "Phase 1: join works for ledgers already on this device. Cross-device join arrives in Phase 2.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Faded
                    )
                    errorText?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = {
                Button(
                    enabled = code.isNotBlank() && !joining,
                    onClick = {
                        joining = true
                        vm.join(code) { result ->
                            joining = false
                            when (result) {
                                is JoinResult.Success -> {
                                    joinDialog = false
                                    onOpenLedger(result.ledgerId)
                                }
                                JoinResult.NotFound ->
                                    errorText = "No ledger with that code on this device."
                                JoinResult.Full ->
                                    errorText = "That ledger already has 10 members."
                                JoinResult.Error ->
                                    errorText = "Couldn't join — try again."
                            }
                        }
                    }
                ) { Text(if (joining) "Joining…" else "Join") }
            },
            dismissButton = {
                OutlinedButton(onClick = { if (!joining) joinDialog = false }) { Text("Cancel") }
            }
        )
    }
}
