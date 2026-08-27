package com.settlenow.firebase.ui.room

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.settlenow.firebase.data.model.Expense
import com.settlenow.firebase.data.model.LedgerEntry
import com.settlenow.firebase.data.model.LedgerFilter
import com.settlenow.firebase.data.model.LedgerRange
import com.settlenow.firebase.data.model.Room
import com.settlenow.firebase.data.repo.FirebaseRepository
import com.settlenow.firebase.domain.BalanceCalculator
import com.settlenow.firebase.domain.Money
import com.settlenow.firebase.domain.Transfer
import com.settlenow.firebase.ui.components.GoldHairline
import com.settlenow.firebase.ui.components.MemberBadge
import com.settlenow.firebase.ui.components.OfflineBanner
import com.settlenow.firebase.ui.components.SyncBadge
import com.settlenow.firebase.ui.home.simpleFactory
import com.settlenow.firebase.ui.theme.Faded
import com.settlenow.firebase.ui.theme.Negative
import com.settlenow.firebase.ui.theme.Positive
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class MemberInfo(
    val userId: String,
    val name: String,
    val isMe: Boolean
)

data class BalancesUiState(
    val members: List<MemberInfo> = emptyList(),
    val balances: List<com.settlenow.firebase.domain.Balance> = emptyList(),
    val transfers: List<Transfer> = emptyList(),
    val summaryWeekCents: Long = 0,
    val summaryMonthCents: Long = 0,
    val weeklyPerPersonCents: Long = 0,
    val monthlyPerPersonCents: Long = 0
)

class RoomDetailViewModel(
    private val repository: FirebaseRepository,
    private val roomId: String
) : ViewModel() {

    val room: StateFlow<Room?> = repository.observeRoom(roomId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val members: StateFlow<List<MemberInfo>> = repository.observeMembers(roomId)
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5000),
            emptyList(),
        )

    val expenses: StateFlow<List<Expense>> = repository.observeExpenses(roomId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val ledger = combine(repository.observeExpenses(roomId), repository.observeSettlements(roomId)) { e, s ->
        repository.buildLedger(e, s, LedgerFilter())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    val balances: StateFlow<BalancesUiState> =
        combine(members, repository.observeExpenses(roomId), repository.observeSettlements(roomId)) { m, e, s ->
            val net = BalanceCalculator.computeNetCents(e, s)
            val summary = BalanceCalculator.summarize(e, m.size)
            BalancesUiState(
                members = m,
                balances = m.mapNotNull { member -> net[member.userId]?.let { com.settlenow.firebase.domain.Balance(member.userId, it) } },
                transfers = BalanceCalculator.simplify(net),
                summaryWeekCents = summary.weekTotalCents,
                summaryMonthCents = summary.monthTotalCents,
                weeklyPerPersonCents = summary.weeklyPerPersonCents,
                monthlyPerPersonCents = summary.monthlyPerPersonCents
            )
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), BalancesUiState())

    fun settle(fromUserId: String, toUserId: String, amountCents: Long) {
        viewModelScope.launch { repository.recordSettlement(roomId, fromUserId, toUserId, amountCents) }
    }

    fun leaveRoom(onLeft: () -> Unit) {
        viewModelScope.launch {
            if (repository.leaveRoom(roomId)) onLeft()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoomDetailScreen(
    repository: FirebaseRepository,
    roomId: String,
    onBack: () -> Unit,
    onAddExpense: (String) -> Unit,
    onEditExpense: (String, String) -> Unit
) {
    val vm: RoomDetailViewModel = viewModel(
        key = roomId,
        factory = simpleFactory { RoomDetailViewModel(repository, roomId) }
    )
    val room by vm.room.collectAsState()
    val expenses by vm.expenses.collectAsState()
    val ledger by vm.ledger.collectAsState()
    val balancesState by vm.balances.collectAsState()
    val context = LocalContext.current

    var tab by remember { mutableIntStateOf(0) }
    var showMembers by remember { mutableStateOf(false) }
    var pendingSettle by remember { mutableStateOf<com.settlenow.firebase.domain.Transfer?>(null) }
    var ledgerFilter by remember { mutableStateOf(LedgerFilter()) }

    fun displayName(id: String): String =
        balancesState.members.firstOrNull { it.userId == id }?.let { member ->
            member.name.ifBlank { "Member" } + if (member.isMe) " (you)" else ""
        } ?: "Member"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(room?.name ?: "Room") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showMembers = true }) {
                        Icon(Icons.Filled.Person, contentDescription = "Members")
                    }
                }
            )
        },
        floatingActionButton = {
            if (tab == 0) {
                androidx.compose.material3.ExtendedFloatingActionButton(onClick = { onAddExpense(roomId) }) {
                    Text("+ Add Expense")
                }
            }
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            OfflineBanner()

            TabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Expenses") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Ledger") })
                Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("Balances") })
            }

            when (tab) {
                0 -> ExpenseList(
                    expenses = expenses.filter { !it.isDeleted && it.supersededBy == null },
                    nameOf = ::displayName,
                    onEdit = { onEditExpense(roomId, it) }
                )
                1 -> LedgerTab(
                    entries = ledger,
                    members = balancesState.members,
                    filter = ledgerFilter,
                    nameOf = ::displayName,
                    onFilterChange = { ledgerFilter = it }
                )
                else -> BalancesTab(balancesState, onSettle = { pendingSettle = it })
            }
        }
    }

    if (showMembers && room != null) {
        MembersDialog(
            room = room!!,
            members = balancesState.members,
            onDismiss = { showMembers = false },
            onLeave = {
                showMembers = false
                vm.leaveRoom(onLeft = onBack)
            }
        )
    }

    pendingSettle?.let { transfer ->
        SettleUpDialog(
            transfer = transfer,
            members = balancesState.members,
            onConfirm = {
                vm.settle(transfer.fromUserId, transfer.toUserId, transfer.amountCents)
                pendingSettle = null
            },
            onDismiss = { pendingSettle = null }
        )
    }
}

// ---------------- Expenses tab ----------------

@Composable
private fun ExpenseList(expenses: List<Expense>, nameOf: (String) -> String, onEdit: (String) -> Unit) {
    if (expenses.isEmpty()) {
        Column(
            Modifier.fillMaxSize().padding(top = 96.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("No expenses yet", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text("Tap “+ Add Expense” to log the first one.", color = Faded)
        }
        return
    }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(expenses, key = { it.id }) { expense ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Row(
                    Modifier.fillMaxWidth().padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            expense.description.ifBlank { "Expense" },
                            style = MaterialTheme.typography.titleMedium
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "Paid by ${nameOf(expense.paidBy)} · ${expense.participants.size} splitting · ${formatDate(expense.createdAtMs)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Faded
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(Money.formatCents(expense.amountCents), style = MaterialTheme.typography.titleMedium)
                        SyncBadge(expense.isPending)
                    }
                    IconButton(onClick = { onEdit(expense.id) }) {
                        Icon(Icons.Filled.Edit, contentDescription = "Replace with corrected copy")
                    }
                }
            }
        }
    }
}

private fun formatDate(ms: Long?): String =
    if (ms == null) "sending…" else java.text.SimpleDateFormat("d MMM", java.util.Locale.getDefault()).format(java.util.Date(ms))

// ---------------- Ledger tab ----------------

@Composable
private fun LedgerTab(
    entries: List<LedgerEntry>,
    members: List<MemberInfo>,
    filter: LedgerFilter,
    nameOf: (String) -> String,
    onFilterChange: (LedgerFilter) -> Unit
) {
    var memberMenuOpen by remember { mutableStateOf(false) }
    var expandedId by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box {
                FilterChip(
                    selected = filter.memberId != null,
                    onClick = { memberMenuOpen = true },
                    label = {
                        Text(
                            if (filter.memberId == null) "All members"
                            else members.firstOrNull { it.userId == filter.memberId }?.name?.ifBlank { "Member" } ?: "Member"
                        )
                    }
                )
                androidx.compose.material3.DropdownMenu(
                    expanded = memberMenuOpen,
                    onDismissRequest = { memberMenuOpen = false }
                ) {
                    androidx.compose.material3.DropdownMenuItem(
                        text = { Text("All members") },
                        onClick = {
                            onFilterChange(filter.copy(memberId = null))
                            memberMenuOpen = false
                        }
                    )
                    members.forEach { member ->
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text(member.name.ifBlank { "Member" }) },
                            onClick = {
                                onFilterChange(filter.copy(memberId = member.userId))
                                memberMenuOpen = false
                            }
                        )
                    }
                }
            }
            listOf(LedgerRange.ALL to "All time", LedgerRange.WEEK to "7 days", LedgerRange.MONTH to "This month")
                .forEach { (range, label) ->
                    FilterChip(
                        selected = filter.range == range,
                        onClick = { onFilterChange(filter.copy(range = range)) },
                        label = { Text(label) }
                    )
                }
        }

        val filtered = remember(entries, filter) { applyLedgerFilter(entries, filter) }
        if (filtered.isEmpty()) {
            Column(
                Modifier.fillMaxSize().padding(top = 64.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Nothing in the ledger yet.", color = Faded)
            }
            return
        }

        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            items(filtered, key = { entry ->
                when (entry) {
                    is LedgerEntry.ExpenseEntry -> "e-${entry.expense.id}"
                    is LedgerEntry.SettlementEntry -> "s-${entry.settlement.id}"
                }
            }) { entry ->
                when (entry) {
                    is LedgerEntry.ExpenseEntry -> {
                        val expense = entry.expense
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                            Column(
                                Modifier.fillMaxWidth()
                                    .clickable { expandedId = if (expandedId == expense.id) null else expense.id }
                                    .padding(horizontal = 16.dp, vertical = 10.dp)
                            ) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(expense.description.ifBlank { "Expense" }, style = MaterialTheme.typography.bodyLarge)
                                    Text(Money.formatCents(expense.amountCents))
                                }
                                Text(
                                    "${formatDate(expense.createdAtMs)} · paid by ${nameOf(expense.paidBy)}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Faded
                                )
                                if (expandedId == expense.id) {
                                    GoldHairline(Modifier.padding(vertical = 6.dp))
                                    expense.participants.forEach { share ->
                                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text(nameOf(share.userId), style = MaterialTheme.typography.bodySmall, color = Faded)
                                            Text(Money.formatCents(share.shareCents), style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    is LedgerEntry.SettlementEntry -> {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Settlement", style = MaterialTheme.typography.bodyLarge)
                                    Text(Money.formatCents(entry.settlement.amountCents))
                                }
                                Text(
                                    "${formatDate(entry.settlement.createdAtMs)} · ${nameOf(entry.settlement.fromUserId)} paid ${nameOf(entry.settlement.toUserId)}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Faded
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun applyLedgerFilter(entries: List<LedgerEntry>, filter: LedgerFilter): List<LedgerEntry> =
    entries.filter { entry ->
        val memberOk = filter.memberId == null || when (entry) {
            is LedgerEntry.ExpenseEntry -> entry.expense.paidBy == filter.memberId ||
                entry.expense.participants.any { it.userId == filter.memberId }
            is LedgerEntry.SettlementEntry -> entry.settlement.fromUserId == filter.memberId ||
                entry.settlement.toUserId == filter.memberId
        }
        memberOk
    }

// ---------------- Balances tab ----------------

@Composable
private fun BalancesTab(state: BalancesUiState, onSettle: (com.settlenow.firebase.domain.Transfer) -> Unit) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item { Text("Simplified payments", style = MaterialTheme.typography.titleMedium) }

        if (state.transfers.isEmpty()) {
            item { Text("Everyone is square.", color = Faded, style = MaterialTheme.typography.bodyMedium) }
        } else {
            items(state.transfers, key = { "${it.fromUserId}->${it.toUserId}" }) { transfer ->
                TransferRow(transfer, state.members, onSettle)
            }
        }

        item {
            GoldHairline(Modifier.padding(vertical = 10.dp))
            Text("Net balances", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(6.dp))
        }
        items(state.balances, key = { it.userId }) { balance ->
            val display = state.members.firstOrNull { it.userId == balance.userId }?.let {
                it.name.ifBlank { "Member" } + if (it.isMe) " (you)" else ""
            } ?: "Member"
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(display)
                when {
                    balance.netCents > 0 -> Text("gets ${Money.formatCents(balance.netCents)}", color = Positive)
                    balance.netCents < 0 -> Text("owes ${Money.formatCents(-balance.netCents)}", color = Negative)
                    else -> Text("settled", color = Faded)
                }
            }
        }

        item {
            GoldHairline(Modifier.padding(vertical = 10.dp))
            Text("Summary", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            SummaryBlock(state)
        }
    }
}

@Composable
private fun SummaryBlock(state: BalancesUiState) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SummaryRow("This week's total", Money.formatCents(state.summaryWeekCents))
            SummaryRow("Weekly per person", Money.formatCents(state.weeklyPerPersonCents))
            GoldHairline()
            SummaryRow("This month's total", Money.formatCents(state.summaryMonthCents))
            SummaryRow("Monthly per person", Money.formatCents(state.monthlyPerPersonCents))
        }
    }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun TransferRow(transfer: Transfer, members: List<MemberInfo>, onSettle: (Transfer) -> Unit) {
    fun nameOf(id: String): String =
        members.firstOrNull { it.userId == id }?.let {
            it.name.ifBlank { "Member" } + if (it.isMe) " (you)" else ""
        } ?: "Member"

    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, top = 8.dp, bottom = 8.dp, end = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text(nameOf(transfer.fromUserId), style = MaterialTheme.typography.bodyLarge)
                Text(
                    "pays ${nameOf(transfer.toUserId)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = Faded
                )
            }
            Text(Money.formatCents(transfer.amountCents), style = MaterialTheme.typography.titleMedium)
            TextButton(onClick = { onSettle(transfer) }) { Text("Settle up") }
        }
    }
}

// ---------------- dialogs ----------------

@Composable
private fun SettleUpDialog(
    transfer: Transfer,
    members: List<MemberInfo>,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    fun nameOf(id: String): String =
        members.firstOrNull { it.userId == id }?.name?.ifBlank { "Member" } ?: "Member"

    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Settle Up") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Text(Money.formatCents(transfer.amountCents), style = MaterialTheme.typography.headlineSmall)
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MemberBadge(nameOf(transfer.fromUserId))
                    Spacer(Modifier.padding(horizontal = 5.dp))
                    Column {
                        Text("From", style = MaterialTheme.typography.labelSmall, color = Faded)
                        Text(nameOf(transfer.fromUserId))
                    }
                }
                GoldHairline(Modifier.padding(vertical = 8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MemberBadge(nameOf(transfer.toUserId))
                    Spacer(Modifier.padding(horizontal = 5.dp))
                    Column {
                        Text("To", style = MaterialTheme.typography.labelSmall, color = Faded)
                        Text(nameOf(transfer.toUserId))
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "This records a settlement and clears the debt for everyone in the room.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Faded
                )
            }
        },
        confirmButton = { Button(onClick = onConfirm) { Text("Confirm payment") } },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun MembersDialog(
    room: Room,
    members: List<MemberInfo>,
    onDismiss: () -> Unit,
    onLeave: () -> Unit
) {
    val clipboard = LocalClipboardManager.current
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Members (${members.size})") },
        text = {
            Column {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(Modifier.fillMaxWidth().padding(12.dp)) {
                        Text("Invite code", style = MaterialTheme.typography.labelSmall, color = Faded)
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(room.inviteCode, style = MaterialTheme.typography.headlineSmall)
                            TextButton(onClick = { clipboard.setText(AnnotatedString(room.inviteCode)) }) {
                                Text("Copy")
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                members.forEach { member ->
                    Text(member.name.ifBlank { "Member" }, modifier = Modifier.padding(vertical = 4.dp))
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "Rooms hold up to 10 members. Joining needs internet once.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Faded
                )
            }
        },
        confirmButton = { Button(onClick = onDismiss) { Text("Done") } },
        dismissButton = { TextButton(onClick = onLeave) { Text("Leave room") } }
    )
}
