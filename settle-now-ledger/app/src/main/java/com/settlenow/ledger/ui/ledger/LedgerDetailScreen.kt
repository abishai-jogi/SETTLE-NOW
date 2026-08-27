package com.settlenow.ledger.ui.ledger

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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.settlenow.ledger.data.repo.SettleNowRepository
import com.settlenow.ledger.ui.components.AmountKeypad
import com.settlenow.ledger.ui.components.ExpenseBubble
import com.settlenow.ledger.ui.components.GoldHairline
import com.settlenow.ledger.ui.components.InviteChip
import com.settlenow.ledger.ui.components.MemberBadge
import com.settlenow.ledger.ui.components.OfflineBanner
import com.settlenow.ledger.ui.home.simpleFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class LedgerDetailViewModel(
    private val repository: SettleNowRepository,
    private val ledgerId: String
) : ViewModel() {

    val ledger = repository.observeLedger(ledgerId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val expenses = repository.observeExpenses(ledgerId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val members = repository.observeLedgerMembers(ledgerId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val myColor = MutableStateFlow("#7a1e2a")
    val myId = MutableStateFlow<String?>(null)

    init {
        viewModelScope.launch {
            val me = repository.currentUser()
            myColor.value = me?.color ?: "#7a1e2a"
            myId.value = me?.id
        }
    }

    fun addLocalMember(name: String) {
        if (name.isBlank()) return
        viewModelScope.launch { repository.addLocalMember(ledgerId, name) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LedgerDetailScreen(
    repository: SettleNowRepository,
    ledgerId: String,
    onBack: () -> Unit,
    onOpenBalances: (String) -> Unit,
    onStartSplit: (String, Long) -> Unit
) {
    val vm: LedgerDetailViewModel = viewModel(
        key = ledgerId,
        factory = simpleFactory { LedgerDetailViewModel(repository, ledgerId) }
    )
    val ledger by vm.ledger.collectAsState()
    val entries by vm.expenses.collectAsState()
    val members by vm.members.collectAsState()
    val myColor by vm.myColor.collectAsState()
    val myId by vm.myId.collectAsState()

    var draft by remember { mutableStateOf("") }
    var showMembers by remember { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    // chat feed reads oldest → newest so new bubbles land at the bottom
    val feed = remember(entries) { entries.sortedBy { it.expense.createdAt } }

    LaunchedEffect(feed.size) {
        if (feed.isNotEmpty()) listState.animateScrollToItem(feed.lastIndex)
    }

    fun pressKey(key: String) {
        draft = when (key) {
            "back" -> draft.dropLast(1)
            "." -> if (draft.contains(".")) draft else if (draft.isEmpty()) "0." else draft + "."
            else -> {
                if (draft.contains(".")) {
                    if (draft.length - draft.indexOf('.') <= 2) draft + key else draft
                } else if (draft.length >= 7) draft
                else if (draft == "0") key
                else draft + key
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(ledger?.name ?: "Ledger") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { onOpenBalances(ledgerId) }) {
                        Icon(Icons.Filled.AccountBalanceWallet, contentDescription = "Balances")
                    }
                    IconButton(onClick = { showMembers = true }) {
                        Icon(Icons.Filled.Person, contentDescription = "Members")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            AmountKeypad(
                draft = draft,
                payerName = members.firstOrNull { it.id == myId }?.name ?: "",
                accentHex = myColor,
                canSend = (com.settlenow.ledger.domain.Money.parseToCents(draft) ?: 0L) > 0 && members.isNotEmpty(),
                chips = listOf(32, 60, 50, 75, 90),
                onChip = { amount ->
                    // Quick chips open Split immediately (same as Record), PhonePe-style.
                    onStartSplit(ledgerId, amount * 100L)
                    draft = ""
                },
                onKey = ::pressKey,
                onSend = {
                    val cents = com.settlenow.ledger.domain.Money.parseToCents(draft) ?: 0L
                    if (cents > 0) {
                        onStartSplit(ledgerId, cents)
                        draft = ""
                    }
                }
            )
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            OfflineBanner()

            ledger?.let { led ->
                InviteChip(code = led.inviteCode)
                GoldHairline()
            }

            if (feed.isEmpty()) {
                Column(
                    Modifier.fillMaxSize().padding(top = 48.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("No expenses yet", style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Type an amount below and tap Record.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp)
                ) {
                    items(feed, key = { it.expense.id }) { entry ->
                        val payer = members.firstOrNull { it.id == entry.expense.paidBy }
                        ExpenseBubble(
                            expense = entry.expense,
                            payerName = payer?.name?.ifBlank { "Member" } ?: "Member",
                            payerColor = payer?.color ?: "#3a3733",
                            mine = entry.expense.paidBy == myId,
                            participantCount = entry.participants.size
                        )
                    }
                }
            }
        }
    }

    if (showMembers) {
        MembersDialog(
            members = members.map { member ->
                Triple(member.id, member.name.ifBlank { "Member" }, member.color)
            },
            onDismiss = { showMembers = false },
            onAddLocal = { name -> vm.addLocalMember(name) },
            onAdded = {
                scope.launch { snackbar.showSnackbar("Member added locally — syncs when online") }
            }
        )
    }
}

@Composable
private fun MembersDialog(
    members: List<Triple<String, String, String>>,
    onDismiss: () -> Unit,
    onAddLocal: (String) -> Unit,
    onAdded: () -> Unit
) {
    var newMemberName by remember { mutableStateOf("") }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Members (${members.size})") },
        text = {
            Column {
                members.forEach { (_, name, color) ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        MemberBadge(name = name, colorHex = color, badgeSize = 28.dp)
                        Text(name)
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "Add a household member offline (invite-by-code across devices arrives with sync).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = newMemberName,
                    onValueChange = { newMemberName = it },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                TextButton(
                    enabled = newMemberName.isNotBlank(),
                    onClick = {
                        onAddLocal(newMemberName)
                        onAdded()
                        newMemberName = ""
                    }
                ) { Text("Add to ledger") }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) { Text("Done") }
        }
    )
}
