package com.settlenow.ledger.ui.balances

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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.settlenow.ledger.data.repo.AverageRow
import com.settlenow.ledger.data.repo.LedgerBalances
import com.settlenow.ledger.data.repo.MemberInfo
import com.settlenow.ledger.data.repo.SettleNowRepository
import com.settlenow.ledger.domain.Money
import com.settlenow.ledger.domain.Transfer
import com.settlenow.ledger.domain.parseHexColor
import com.settlenow.ledger.domain.prefersDarkText
import com.settlenow.ledger.domain.tint
import com.settlenow.ledger.ui.components.GoldHairline
import com.settlenow.ledger.ui.components.MemberBadge
import com.settlenow.ledger.ui.components.OfflineBanner
import com.settlenow.ledger.ui.home.simpleFactory
import com.settlenow.ledger.ui.theme.Faded
import com.settlenow.ledger.ui.theme.Negative
import com.settlenow.ledger.ui.theme.Positive
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class BalancesViewModel(
    private val repository: SettleNowRepository,
    private val ledgerId: String
) : ViewModel() {

    val state = repository.observeLedgerBalances(ledgerId)
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5000),
            LedgerBalances(emptyList(), emptyList(), emptyList(), emptyList())
        )

    fun settle(transfer: Transfer, onDone: () -> Unit) {
        viewModelScope.launch {
            repository.recordSettlement(
                ledgerId = ledgerId,
                fromUserId = transfer.fromUserId,
                toUserId = transfer.toUserId,
                amountCents = transfer.amountCents
            )
            onDone()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BalancesScreen(
    repository: SettleNowRepository,
    ledgerId: String,
    onBack: () -> Unit
) {
    val vm: BalancesViewModel = viewModel(
        key = ledgerId,
        factory = simpleFactory { BalancesViewModel(repository, ledgerId) }
    )
    val state by vm.state.collectAsState()
    var pendingSettle by remember { mutableStateOf<Transfer?>(null) }

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
            OfflineBanner()

            LazyColumn(
                Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item {
                    Text("Simplified settlements", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Fewest payments to get everyone square.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Faded
                    )
                }

                if (state.transfers.isEmpty()) {
                    item {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                            Text(
                                "Everyone is square.",
                                modifier = Modifier.padding(16.dp),
                                color = Faded
                            )
                        }
                    }
                } else {
                    items(state.transfers, key = { "${it.fromUserId}-${it.toUserId}-${it.amountCents}" }) { transfer ->
                        SimplifiedRow(state, transfer)
                    }
                }

                item {
                    Spacer(Modifier.height(4.dp))
                    Text("Pay lines", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Tap a line to settle that pair.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Faded
                    )
                }

                if (state.transfers.isEmpty()) {
                    item {
                        Text("No outstanding debts.", color = Faded, style = MaterialTheme.typography.bodyMedium)
                    }
                } else {
                    items(
                        state.transfers,
                        key = { "pay-${it.fromUserId}-${it.toUserId}-${it.amountCents}" }
                    ) { transfer ->
                        PayLineRow(state, transfer, onTap = { pendingSettle = transfer })
                    }
                }

                item {
                    Spacer(Modifier.height(4.dp))
                    Text("Net balances", style = MaterialTheme.typography.titleMedium)
                }
                items(state.balances, key = { it.userId }) { balance ->
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
                            else -> Text("settled", color = Faded)
                        }
                    }
                }
            }

            PinnedAveragesBlock(state.averages)
        }
    }

    pendingSettle?.let { transfer ->
        SettleUpDialog(
            transfer = transfer,
            members = state.members,
            onConfirm = {
                vm.settle(transfer) { pendingSettle = null }
            },
            onDismiss = { pendingSettle = null }
        )
    }
}

@Composable
private fun SimplifiedRow(state: LedgerBalances, transfer: Transfer) {
    val from = state.members.firstOrNull { it.id == transfer.fromUserId }
    val to = state.members.firstOrNull { it.id == transfer.toUserId }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Row(
            Modifier.fillMaxWidth().padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "${from?.name ?: "Member"} → ${to?.name ?: "Member"}",
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodyLarge
            )
            Text(Money.formatCents(transfer.amountCents), style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable
private fun PayLineRow(state: LedgerBalances, transfer: Transfer, onTap: () -> Unit) {
    val from = state.members.firstOrNull { it.id == transfer.fromUserId }
    val to = state.members.firstOrNull { it.id == transfer.toUserId }
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onTap)
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                buildString {
                    append(from?.name?.ifBlank { "Member" } ?: "Member")
                    if (from?.isMe == true) append(" (you)")
                    append(" owes ")
                    append(to?.name?.ifBlank { "Member" } ?: "Member")
                    if (to?.isMe == true) append(" (you)")
                },
                color = parseHexColor(from?.color ?: "#1E88E5"),
                style = MaterialTheme.typography.bodyLarge
            )
            Text("tap to settle up", style = MaterialTheme.typography.labelSmall, color = Faded)
        }
        Text(Money.formatCents(transfer.amountCents), style = MaterialTheme.typography.titleMedium)
    }
    GoldHairline()
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
                    Text("Your monthly average", style = MaterialTheme.typography.labelSmall, color = Faded)
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
            val bg = if (row.member.isMe) tint(row.member.color, 0.12f)
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
                        color = if (prefersDarkText(row.member.color)) {
                            androidx.compose.ui.graphics.Color(0xFF262220)
                        } else {
                            androidx.compose.ui.graphics.Color(0xFFF5F0E6)
                        }
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
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Text(
                    Money.formatCents(transfer.amountCents),
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MemberBadge(name = nameOf(transfer.fromUserId), colorHex = members.firstOrNull { it.id == transfer.fromUserId }?.color ?: "#1E88E5")
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
                    MemberBadge(name = nameOf(transfer.toUserId), colorHex = members.firstOrNull { it.id == transfer.toUserId }?.color ?: "#43A047")
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text("To", style = MaterialTheme.typography.labelSmall, color = Faded)
                        Text(nameOf(transfer.toUserId))
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "Records a settlement and clears this debt in the ledger.",
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
