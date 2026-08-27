package com.settlenow.app.ui.room

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
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
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.settlenow.app.data.local.dao.ExpenseWithParticipants
import com.settlenow.app.data.local.entity.RoomEntity
import com.settlenow.app.data.repo.MemberInfo
import com.settlenow.app.data.repo.SettleNowRepository
import com.settlenow.app.domain.Money
import com.settlenow.app.domain.parseHexColor
import com.settlenow.app.domain.prefersDarkText
import com.settlenow.app.ui.components.InviteChip
import com.settlenow.app.ui.components.OfflineBanner
import com.settlenow.app.ui.home.simpleFactory
import com.settlenow.app.ui.theme.Faded
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class RoomDetailViewModel(
    private val repository: SettleNowRepository,
    val roomId: String
) : ViewModel() {

    val room = repository.observeRoom(roomId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val expenses = repository.observeExpenses(roomId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val members = repository.observeRoomMembers(roomId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val myId = MutableStateFlow<String?>(null)

    init {
        viewModelScope.launch { myId.value = repository.currentUser()?.id }
    }

    fun addLocalMember(name: String) {
        if (name.isBlank()) return
        viewModelScope.launch { repository.addLocalMember(roomId, name) }
    }
}

private val InkColor = androidx.compose.ui.graphics.Color(0xFF262220)
private val IvoryColor = androidx.compose.ui.graphics.Color(0xFFF5F0E6)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoomDetailScreen(
    repository: SettleNowRepository,
    roomId: String,
    onBack: () -> Unit,
    onAddExpense: (String) -> Unit,
    onOpenBalances: (String) -> Unit
) {
    val vm: RoomDetailViewModel = viewModel(
        key = roomId,
        factory = simpleFactory { RoomDetailViewModel(repository, roomId) }
    )
    val room by vm.room.collectAsState()
    val expenses by vm.expenses.collectAsState()
    val members by vm.members.collectAsState()
    val myId by vm.myId.collectAsState()
    val context = LocalContext.current
    var showMembers by remember { mutableStateOf(false) }

    val memberInfos = remember(members, myId) {
        members.map { m ->
            MemberInfo(m.id, m.name, m.avatarInitials, m.color, m.id == myId)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(room?.name ?: "Ledger") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { onOpenBalances(roomId) }) {
                        Icon(
                            Icons.Filled.Person,
                            contentDescription = "Balances",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    IconButton(onClick = {
                        com.settlenow.app.sync.SyncWorker.requestImmediateSync(context)
                    }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Sync now")
                    }
                    IconButton(onClick = { showMembers = true }) {
                        Icon(Icons.Filled.Person, contentDescription = "Members")
                    }
                }
            )
        },
        floatingActionButton = {
            androidx.compose.material3.ExtendedFloatingActionButton(onClick = { onAddExpense(roomId) }) {
                Text("+ Add Expense")
            }
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            OfflineBanner()

            // Invite code chip pinned below the app bar
            room?.let { r ->
                InviteChip(
                    code = r.inviteCode,
                    onCopied = { /* could show a toast */ }
                )
            }

            // Chat-style expense feed
            ChatExpenseFeed(
                expenses = expenses.filter { !it.expense.isDeleted },
                members = memberInfos,
                myId = myId,
                modifier = Modifier.weight(1f)
            )
        }
    }

    if (showMembers && room != null) {
        MembersDialog(
            room = room!!,
            members = memberInfos,
            onDismiss = { showMembers = false },
            onAddMember = { name -> vm.addLocalMember(name) }
        )
    }
}



@Composable
private fun ChatExpenseFeed(
    expenses: List<ExpenseWithParticipants>,
    members: List<MemberInfo>,
    myId: String?,
    modifier: Modifier = Modifier
) {
    if (expenses.isEmpty()) {
        Column(
            modifier.fillMaxSize().padding(top = 96.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("No expenses yet", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text("Tap \"+ Add Expense\" to log your first one.", color = Faded)
        }
        return
    }

    // Reverse so newest is at top (like a chat feed with latest first)
    val sorted = remember(expenses) { expenses.sortedByDescending { it.expense.createdAt } }

    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(sorted, key = { it.expense.id }) { entry ->
            val e = entry.expense
            val isMe = e.paidBy == myId
            val payerInfo = members.firstOrNull { it.id == e.paidBy }
            val payerColor = payerInfo?.color ?: "#3a3733"
            val payerName = payerInfo?.name?.ifBlank { "Member" } ?: "Member"
            val payerInitials = payerInfo?.avatarInitials ?: SettleNowRepository.initialsOf(payerName)

            ChatBubble(
                isMe = isMe,
                payerColor = payerColor,
                payerName = payerName,
                payerInitials = payerInitials,
                amount = e.amountCents,
                description = e.description,
                timestamp = e.createdAt,
                participantCount = entry.participants.size,
                isSynced = e.isSynced
            )
        }
    }
}

@Composable
private fun ChatBubble(
    isMe: Boolean,
    payerColor: String,
    payerName: String,
    payerInitials: String,
    amount: Long,
    description: String,
    timestamp: Long,
    participantCount: Int,
    isSynced: Boolean
) {
    val bubbleColor = parseHexColor(payerColor)
    val textColor = if (prefersDarkText(payerColor)) InkColor else IvoryColor
    val dateFormat = remember { java.text.SimpleDateFormat("d MMM, h:mm a", java.util.Locale.getDefault()) }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isMe) Arrangement.End else Arrangement.Start
    ) {
        if (!isMe) {
            // Avatar for other users
            Box(
                Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(bubbleColor),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    payerInitials,
                    style = MaterialTheme.typography.labelSmall,
                    color = textColor
                )
            }
            Spacer(Modifier.width(8.dp))
        }

        Column(
            modifier = Modifier.widthIn(max = 280.dp),
            horizontalAlignment = if (isMe) Alignment.End else Alignment.Start
        ) {
            if (!isMe) {
                Text(
                    payerName,
                    style = MaterialTheme.typography.labelSmall,
                    color = parseHexColor(payerColor),
                    modifier = Modifier.padding(start = 4.dp, bottom = 2.dp)
                )
            }

            Surface(
                shape = RoundedCornerShape(
                    topStart = 16.dp,
                    topEnd = 16.dp,
                    bottomStart = if (isMe) 16.dp else 4.dp,
                    bottomEnd = if (isMe) 4.dp else 16.dp
                ),
                color = bubbleColor
            ) {
                Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                    Text(
                        Money.formatCents(amount),
                        style = MaterialTheme.typography.titleMedium,
                        color = textColor
                    )
                    if (description.isNotBlank()) {
                        Text(
                            description,
                            style = MaterialTheme.typography.bodyMedium,
                            color = textColor.copy(alpha = 0.85f)
                        )
                    }
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            dateFormat.format(java.util.Date(timestamp)),
                            style = MaterialTheme.typography.labelSmall,
                            color = textColor.copy(alpha = 0.6f)
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                if (isSynced) "✓" else "⏳",
                                style = MaterialTheme.typography.labelSmall,
                                color = textColor.copy(alpha = 0.6f)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                "$participantCount splitting",
                                style = MaterialTheme.typography.labelSmall,
                                color = textColor.copy(alpha = 0.6f)
                            )
                        }
                    }
                }
            }
        }

        if (isMe) {
            Spacer(Modifier.width(8.dp))
            // Avatar for current user
            Box(
                Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(bubbleColor),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    payerInitials,
                    style = MaterialTheme.typography.labelSmall,
                    color = textColor
                )
            }
        }
    }
}

@Composable
private fun MembersDialog(
    room: RoomEntity,
    members: List<MemberInfo>,
    onDismiss: () -> Unit,
    onAddMember: (String) -> Unit
) {
    var newMemberName by remember { mutableStateOf("") }
    val clipboard = LocalClipboardManager.current

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Members (${members.size})") },
        text = {
            Column {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(Modifier.padding(12.dp).fillMaxWidth()) {
                        Text("Invite code", style = MaterialTheme.typography.labelSmall, color = Faded)
                        Row(
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(room.inviteCode, style = MaterialTheme.typography.headlineSmall)
                            TextButton(onClick = {
                                clipboard.setText(AnnotatedString(room.inviteCode))
                            }) { Text("Copy") }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                members.forEach { member ->
                    Row(
                        Modifier.padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(parseHexColor(member.color)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                member.avatarInitials,
                                style = MaterialTheme.typography.labelSmall,
                                color = if (prefersDarkText(member.color)) InkColor else IvoryColor
                            )
                        }
                        Spacer(Modifier.width(8.dp))
                        Text(member.name.ifBlank { "Member" })
                        if (member.isMe) {
                            Spacer(Modifier.width(4.dp))
                            Text("(you)", style = MaterialTheme.typography.labelSmall, color = Faded)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "Add member offline",
                    style = MaterialTheme.typography.labelSmall,
                    color = Faded
                )
                OutlinedTextField(
                    value = newMemberName,
                    onValueChange = { newMemberName = it },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                TextButton(enabled = newMemberName.isNotBlank(), onClick = {
                    onAddMember(newMemberName)
                    newMemberName = ""
                }) { Text("Add to ledger") }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) { Text("Done") }
        }
    )
}

@Composable
private fun AlertDialog(
    onDismissRequest: () -> Unit,
    title: @Composable () -> Unit,
    text: @Composable () -> Unit,
    confirmButton: @Composable () -> Unit,
    dismissButton: (@Composable () -> Unit)? = null
) {
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismissRequest,
        title = title,
        text = text,
        confirmButton = confirmButton,
        dismissButton = dismissButton
    )
}
