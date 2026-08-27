package com.settlenow.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.settlenow.app.data.repo.SettleNowRepository
import com.settlenow.app.domain.parseHexColor
import com.settlenow.app.domain.prefersDarkText
import com.settlenow.app.sync.SyncEngine
import com.settlenow.app.sync.SyncWorker
import com.settlenow.app.ui.components.OfflineBanner
import com.settlenow.app.ui.theme.Faded
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

inline fun <reified VM : ViewModel> simpleFactory(crossinline create: () -> VM): ViewModelProvider.Factory =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = create() as T
    }

class HomeViewModel(private val repository: SettleNowRepository) : ViewModel() {

    val rooms = repository.observeMyRooms()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val pendingSync = repository.observePendingSyncCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val conflicts = repository.observeConflictCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val me = MutableStateFlow<com.settlenow.app.data.local.entity.UserEntity?>(null)

    init {
        viewModelScope.launch { me.value = repository.currentUser() }
    }

    fun createRoom(name: String, onCreated: (String) -> Unit) {
        if (name.isBlank()) return
        viewModelScope.launch {
            repository.createRoom(name)?.let(onCreated)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    repository: SettleNowRepository,
    syncEngine: SyncEngine,
    onLogout: () -> Unit,
    onOpenRoom: (String) -> Unit
) {
    val vm: HomeViewModel = viewModel(factory = simpleFactory { HomeViewModel(repository) })
    val rooms by vm.rooms.collectAsState()
    val pendingSync by vm.pendingSync.collectAsState()
    val conflicts by vm.conflicts.collectAsState()
    val me by vm.me.collectAsState()

    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    var newRoomDialog by remember { mutableStateOf(false) }
    var joinDialog by remember { mutableStateOf(false) }
    var joining by remember { mutableStateOf(false) }

    fun requestSync() {
        if (!isOnlineCheck(context)) {
            scope.launch { snackbar.showSnackbar("Offline — will sync when back online") }
            return
        }
        SyncWorker.requestImmediateSync(context)
        scope.launch { snackbar.showSnackbar("Syncing…") }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settle Now") },
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
                                SettleNowRepository.initialsOf(user.name),
                                style = MaterialTheme.typography.labelSmall,
                                color = if (prefersDarkText(user.color)) Color(0xFF262220)
                                else Color(0xFFF5F0E6)
                            )
                        }
                    }
                },
                actions = {
                    val statusLine = buildString {
                        if (conflicts > 0) append("$conflicts conflicts")
                        if (conflicts > 0 && pendingSync > 0) append(" · ")
                        if (pendingSync > 0) append("$pendingSync pending") else if (conflicts == 0) append("Up to date")
                    }
                    Text(
                        text = statusLine,
                        style = MaterialTheme.typography.labelSmall,
                        color = Faded,
                        modifier = Modifier.padding(end = 4.dp)
                    )
                    IconButton(onClick = { requestSync() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Sync now")
                    }
                    TextButton(onClick = onLogout) { Text("Sign out") }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            OfflineBanner()

            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(onClick = { newRoomDialog = true }, modifier = Modifier.weight(1f)) {
                    Text("+ New Ledger")
                }
                OutlinedButton(onClick = { joinDialog = true }, modifier = Modifier.weight(1f)) {
                    Text("Join Ledger")
                }
            }

            if (rooms.isEmpty()) {
                Column(
                    Modifier.fillMaxSize().padding(top = 96.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("No ledgers yet", style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.height(8.dp))
                    Text("Create a ledger or join one with a code.", color = Faded)
                }
            } else {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(rooms, key = { it.id }) { room ->
                        Card(
                            onClick = { onOpenRoom(room.id) },
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surface
                            )
                        ) {
                            Column(Modifier.padding(16.dp)) {
                                Text(room.name, style = MaterialTheme.typography.titleMedium)
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "${room.memberCount} members · code ${room.invite_code}",
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

    if (newRoomDialog) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { newRoomDialog = false },
            title = { Text("New Ledger") },
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
                        newRoomDialog = false
                        vm.createRoom(name) { onOpenRoom(it) }
                    }
                ) { Text("Create") }
            },
            dismissButton = {
                OutlinedButton(onClick = { newRoomDialog = false }) { Text("Cancel") }
            }
        )
    }

    if (joinDialog) {
        var code by remember { mutableStateOf("") }
        var errorText by remember { mutableStateOf<String?>(null) }
        AlertDialog(
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
                    errorText?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    Text(
                        "Joining uses the internet once; everything else works offline.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Faded
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = code.isNotBlank() && !joining,
                    onClick = {
                        joining = true
                        errorText = null
                        scope.launch {
                            when (val outcome = syncEngine.joinRoomByCode(code)) {
                                is SyncEngine.JoinOutcome.Success -> {
                                    joinDialog = false
                                    joining = false
                                    SyncWorker.requestImmediateSync(context)
                                    onOpenRoom(outcome.roomId)
                                }
                                SyncEngine.JoinOutcome.NotFound -> {
                                    joining = false
                                    errorText = "No ledger with that code."
                                }
                                SyncEngine.JoinOutcome.RoomFull -> {
                                    joining = false
                                    errorText = "That ledger already has 10 members."
                                }
                                SyncEngine.JoinOutcome.Offline -> {
                                    joining = false
                                    errorText = "Can't reach the server — check connection."
                                }
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

private fun isOnlineCheck(context: android.content.Context): Boolean {
    val manager = context.getSystemService(android.net.ConnectivityManager::class.java) ?: return false
    val network = manager.activeNetwork ?: return false
    val capabilities = manager.getNetworkCapabilities(network) ?: return false
    return capabilities.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
}
