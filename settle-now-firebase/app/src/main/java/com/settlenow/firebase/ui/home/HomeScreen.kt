package com.settlenow.firebase.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.settlenow.firebase.data.model.Room
import com.settlenow.firebase.data.repo.FirebaseRepository
import com.settlenow.firebase.data.repo.JoinOutcome
import com.settlenow.firebase.ui.components.OfflineBanner
import com.settlenow.firebase.ui.theme.Faded
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModel(private val repository: FirebaseRepository) : ViewModel() {

    val rooms = repository.observeMyRooms()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val needsNamePrompt = MutableStateFlow(false)

    init {
        viewModelScope.launch {
            val user = repository.ensureUserDoc()
            needsNamePrompt.value = user != null && user.name.isBlank()
        }
    }

    fun createRoom(name: String, onCreated: (String) -> Unit) {
        if (name.isBlank()) return
        viewModelScope.launch {
            repository.createRoom(name)?.let(onCreated)
        }
    }

    fun saveName(name: String) {
        viewModelScope.launch {
            repository.saveUserName(name)
            needsNamePrompt.value = false
        }
    }
}

inline fun <reified VM : ViewModel> simpleFactory(crossinline create: () -> VM): androidx.lifecycle.ViewModelProvider.Factory =
    object : androidx.lifecycle.ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = create() as T
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    repository: FirebaseRepository,
    onOpenRoom: (String) -> Unit
) {
    val vm: HomeViewModel = viewModel(factory = simpleFactory { HomeViewModel(repository) })
    val rooms by vm.rooms.collectAsState()
    val showNamePrompt by vm.needsNamePrompt.collectAsState()

    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var newRoomDialog by remember { mutableStateOf(false) }
    var joinDialog by remember { mutableStateOf(false) }
    var joining by remember { mutableStateOf(false) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Settle Now") }) },
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
                    Text("+ New Room")
                }
                OutlinedButton(onClick = { joinDialog = true }, modifier = Modifier.weight(1f)) {
                    Text("Join Room")
                }
            }

            if (rooms.isEmpty()) {
                Column(
                    Modifier.fillMaxSize().padding(top = 96.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("No rooms yet", style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.height(8.dp))
                    Text("Create a room or join one with a code.", color = Faded)
                }
            } else {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(rooms, key = { it.id }) { room ->
                        RoomCard(room, onClick = { onOpenRoom(room.id) })
                    }
                }
            }
        }
    }

    if (newRoomDialog) {
        var name by remember { mutableStateOf("") }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { newRoomDialog = false },
            title = { Text("New Room") },
            text = {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Room name") },
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
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { if (!joining) joinDialog = false },
            title = { Text("Join Room") },
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
                        "Joining needs internet once — after that the room works offline.",
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
                        scope.launch {
                            when (val outcome = repository.joinRoomByCode(code)) {
                                is JoinOutcome.Success -> {
                                    joinDialog = false
                                    joining = false
                                    onOpenRoom(outcome.roomId)
                                }
                                JoinOutcome.NotFound -> {
                                    joining = false
                                    errorText = "No room with that code."
                                }
                                JoinOutcome.RoomFull -> {
                                    joining = false
                                    errorText = "That room already has 10 members."
                                }
                                is JoinOutcome.Error -> {
                                    joining = false
                                    errorText = outcome.message
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

    if (showNamePrompt) {
        var name by remember { mutableStateOf("") }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { },
            title = { Text("What should we call you?") },
            text = {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Your name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(enabled = name.isNotBlank(), onClick = { vm.saveName(name) }) {
                    Text("Save")
                }
            }
        )
    }
}

@Composable
private fun RoomCard(room: Room, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(room.name, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(4.dp))
            Text(
                "code ${room.inviteCode}",
                style = MaterialTheme.typography.bodySmall,
                color = Faded
            )
        }
    }
}
