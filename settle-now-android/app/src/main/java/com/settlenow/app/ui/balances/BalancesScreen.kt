package com.settlenow.app.ui.balances

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.settlenow.app.data.repo.AverageRow
import com.settlenow.app.data.repo.MemberInfo
import com.settlenow.app.data.repo.RoomBalances
import com.settlenow.app.data.repo.SettleNowRepository
import com.settlenow.app.domain.Money
import com.settlenow.app.domain.Transfer
import com.settlenow.app.domain.parseHexColor
import com.settlenow.app.domain.prefersDarkText
import com.settlenow.app.domain.tint
import com.settlenow.app.ui.components.GoldHairline
import com.settlenow.app.ui.home.simpleFactory
import com.settlenow.app.ui.theme.Faded
import com.settlenow.app.ui.theme.Negative
import com.settlenow.app.ui.theme.Positive
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

private val InkColor = androidx.compose.ui.graphics.Color(0xFF262220)
private val IvoryColor = androidx.compose.ui.graphics.Color(0xFFF5F0E6)

class BalancesViewModel(
    private val repository: SettleNowRepository,
    private val roomId: String
) : ViewModel() {

    val balances = repository.observeRoomBalances(roomId)
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5000),
            RoomBalances(emptyList(), emptyList(), emptyList())
        )

    fun settle(fromUserId: String, toUserId: String, amountCents: Long, context: android.content.Context) {
        viewModelScope.launch {
            repository.recordSettlement(roomId, fromUserId, toUserId, amountCents)
            com.settlenow.app.sync.SyncWorker.requestImmediateSync(context)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BalancesScreen(
    repository: SettleNowRepository,
    roomId: String,
    onBack: () -> Unit
) {
    val vm: BalancesViewModel = viewModel(
        key = roomId,
        factory = simpleFactory { BalancesViewModel(repository, roomId) }
    )
    val state by vm.balances.collectAsState()
    var pendingSettle by remember { mutableStateOf<Transfer?>(null) }
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Balances") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            // Scrollable content
            LazyColumn(
                Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Simplified settlement list
                item {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surface
                        )
                    ) {
                        Column(Modifier.fillMaxWidth().padding(16.dp)) {
                            Text(
                                "Settle with fewer payments",
                                style = MaterialTheme.typography.titleMedium
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "The simplest way to clear all debts:",
                                style = MaterialTheme.typography.bodySmall,
                                color = Faded
                            )
                            Spacer(Modifier.height(8.dp))

                            if (state.transfers.isEmpty()) {
                                Text(
                                    "Everyone is square — no payments needed.",
                                    color = Positive,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            } else {
                                state.transfers.forEachIndexed { index, transfer ->
                                    val from = state.members.firstOrNull { it.id == transfer.fromUserId }
                                    val to = state.members.firstOrNull { it.id == transfer.toUserId }
                                    Row(
                                        Modifier
                                            .fillMaxWidth()
                                            .clickable { pendingSettle = transfer }
                                            .padding(vertical = 10.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            // From avatar
                                            Box(
                                                Modifier
                                                    .size(28.dp)
                                                    .background(
                                                        parseHexColor(from?.color ?: "#3a3733"),
                                                        CircleShape
                                                    ),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Text(
                                                    from?.avatarInitials ?: "?",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = if (prefersDarkText(from?.color ?: "#3a3733"))
                                                        InkColor else IvoryColor
                                                )
                                            }
                                            Spacer(Modifier.width(8.dp))
                                            Text(
                                                "pays",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = Faded
                                            )
                                            Spacer(Modifier.width(8.dp))
                                            // To avatar
                                            Box(
                                                Modifier
                                                    .size(28.dp)
                                                    .background(
                                                        parseHexColor(to?.color ?: "#3a3733"),
                                                        CircleShape
                                                    ),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Text(
                                                    to?.avatarInitials ?: "?",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = if (prefersDarkText(to?.color ?: "#3a3733"))
                                                        InkColor else IvoryColor
                                                )
                                            }
                                        }
                                        Text(
                                            Money.formatCents(transfer.amountCents),
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                    if (index < state.transfers.lastIndex) GoldHairline()
                                }
                            }
                        }
                    }
                }

                // Raw pay-lines block
                item {
                    Text(
                        "All pay-lines",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(Modifier.height(4.dp))
                }

                items(state.balances.filter { it.netCents != 0L }, key = { it.userId }) { balance ->
                    val member = state.members.firstOrNull { it.id == balance.userId }
                    val label = member?.name?.ifBlank { "Member" } ?: "Member"
                    val display = if (member?.isMe == true) "$label (you)" else label
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            display,
                            color = member?.let { parseHexColor(it.color) }
                                ?: MaterialTheme.colorScheme.onSurface
                        )
                        when {
                            balance.netCents > 0 -> Text(
                                "gets ${Money.formatCents(balance.netCents)}",
                                color = Positive
                            )
                            balance.netCents < 0 -> Text(
                                "owes ${Money.formatCents(-balance.netCents)}",
                                color = Negative
                            )
                        }
                    }
                }

                // Extra bottom spacing so the fixed averages don't overlap
                item { Spacer(Modifier.height(8.dp)) }
            }

            // Fixed averages block at the bottom
            PinnedAveragesBlock(state.averages)
        }
    }

    pendingSettle?.let { transfer ->
        SettleUpDialog(
            transfer = transfer,
            members = state.members,
            onConfirm = {
                vm.settle(transfer.fromUserId, transfer.toUserId, transfer.amountCents, context)
                pendingSettle = null
            },
            onDismiss = { pendingSettle = null }
        )
    }
}

@Composable
private fun PinnedAveragesBlock(averages: List<AverageRow>) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        val mine = averages.firstOrNull { it.member.isMe }
        if (mine != null) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "Your monthly average",
                        style = MaterialTheme.typography.labelSmall,
                        color = Faded
                    )
                    Text(
                        Money.formatCents(mine.monthlyCents),
                        style = MaterialTheme.typography.headlineSmall,
                        color = parseHexColor(mine.member.color)
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Weekly", style = MaterialTheme.typography.labelSmall, color = Faded)
                    Text(Money.formatCents(mine.weeklyCents), style = MaterialTheme.typography.titleMedium)
                }
            }
            GoldHairline(Modifier.padding(vertical = 6.dp))
        }

        averages.forEach { row ->
            val bg = if (row.member.isMe) tint(row.member.color, 0.08f)
            else androidx.compose.ui.graphics.Color.Transparent
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(bg)
                    .padding(start = 6.dp, top = 4.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    Modifier
                        .size(26.dp)
                        .background(parseHexColor(row.member.color), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        SettleNowRepository.initialsOf(row.member.name),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (prefersDarkText(row.member.color)) InkColor else IvoryColor
                    )
                }
                Spacer(Modifier.width(8.dp))
                Text(
                    row.member.name.ifBlank { "Member" } + if (row.member.isMe) " (you)" else "",
                    modifier = Modifier.weight(1f),
                    color = parseHexColor(row.member.color)
                )
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        "${Money.formatCents(row.monthlyCents)} / mo",
                        style = MaterialTheme.typography.bodyLarge
                    )
                    Text(
                        "${Money.formatCents(row.weeklyCents)} / wk",
                        style = MaterialTheme.typography.labelSmall,
                        color = Faded
                    )
                }
            }
        }
        Spacer(Modifier.height(2.dp))
    }
}

@Composable
private fun SettleUpDialog(
    transfer: Transfer,
    members: List<MemberInfo>,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    fun nameOf(id: String): String =
        members.firstOrNull { it.id == id }?.name?.ifBlank { "Member" } ?: "Member"

    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Settle Up") },
        text = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    Money.formatCents(transfer.amountCents),
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    com.settlenow.app.ui.components.MemberBadge(nameOf(transfer.fromUserId))
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text("From", style = MaterialTheme.typography.labelSmall, color = Faded)
                        Text(nameOf(transfer.fromUserId))
                    }
                }
                Spacer(Modifier.height(8.dp))
                GoldHairline()
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    com.settlenow.app.ui.components.MemberBadge(nameOf(transfer.toUserId))
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text("To", style = MaterialTheme.typography.labelSmall, color = Faded)
                        Text(nameOf(transfer.toUserId))
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "This records a settlement and clears the debt for everyone in the ledger.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Faded
                )
            }
        },
        confirmButton = {
            Button(onClick = onConfirm) { Text("Confirm payment") }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
