package com.settlenow.ledger.ui.split

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.settlenow.ledger.data.local.entity.SplitTypes
import com.settlenow.ledger.data.repo.MemberInfo
import com.settlenow.ledger.data.repo.SettleNowRepository
import com.settlenow.ledger.domain.Money
import com.settlenow.ledger.domain.SplitCalculator
import com.settlenow.ledger.domain.SplitCalculator.ValidationResult
import com.settlenow.ledger.ui.components.GoldHairline
import com.settlenow.ledger.ui.components.MemberBadge
import com.settlenow.ledger.ui.components.OfflineBanner
import com.settlenow.ledger.ui.home.simpleFactory
import com.settlenow.ledger.ui.theme.Faded
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

/**
 * Phase 1 Split screen — Equal only (with per-person share edits that
 * rebalance so the total always holds). Custom / Percentage arrive in Phase 4.
 */
class SplitViewModel(private val repository: SettleNowRepository) : ViewModel() {

    val members = MutableStateFlow<List<MemberInfo>>(emptyList())
    val myId = MutableStateFlow<String?>(null)

    fun loadMembers(ledgerId: String) {
        viewModelScope.launch {
            val me = repository.currentUser()
            myId.value = me?.id
            members.value = repository.ledgerMembersOnce(ledgerId).map { m ->
                MemberInfo(m.id, m.name, m.avatarInitials, m.color, m.id == me?.id)
            }
        }
    }

    fun save(
        ledgerId: String,
        payerId: String,
        description: String,
        amountCents: Long,
        shares: List<Pair<String, Long>>,
        onDone: () -> Unit
    ) {
        if (amountCents <= 0 || shares.isEmpty() || payerId.isBlank()) return
        viewModelScope.launch {
            repository.addExpense(
                ledgerId = ledgerId,
                paidBy = payerId,
                description = description,
                amountCents = amountCents,
                splitType = SplitTypes.EQUAL,
                shares = shares
            )
            onDone()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SplitScreen(
    repository: SettleNowRepository,
    ledgerId: String,
    amountCents: Long,
    onBack: () -> Unit
) {
    val vm: SplitViewModel = viewModel(factory = simpleFactory { SplitViewModel(repository) })

    LaunchedEffect(ledgerId) { vm.loadMembers(ledgerId) }

    val members by vm.members.collectAsState()
    val myId by vm.myId.collectAsState()

    var description by remember { mutableStateOf("") }
    var payerId by remember(myId) { mutableStateOf(myId ?: "") }
    var selected by remember(members) { mutableStateOf(members.map { it.id }.toSet()) }
    val equalSharesText = remember { mutableStateMapOf<String, String>() }
    var showPayerPicker by remember { mutableStateOf(false) }

    LaunchedEffect(selected.sorted(), amountCents, members.map { it.id }) {
        if (selected.isNotEmpty() && amountCents > 0) {
            val active = selected.filter { id -> members.any { it.id == id } }
            SplitCalculator.equalSharesCents(amountCents, active).forEach { (id, cents) ->
                if (equalSharesText[id] == null) {
                    equalSharesText[id] = formatCentsInput(cents)
                }
            }
            equalSharesText.keys.filter { it !in selected }.toList().forEach { equalSharesText.remove(it) }
        }
    }

    fun nameOf(id: String): String =
        members.firstOrNull { it.id == id }?.name?.ifBlank { "Member" } ?: "Member"

    val activeSelection = selected.filter { id -> members.any { it.id == id } }
    val sharesResult = when {
        amountCents <= 0 || activeSelection.isEmpty() || payerId.isBlank() -> null
        else -> validateEqual(amountCents, activeSelection, equalSharesText)
    }
    val validShares = (sharesResult as? ValidationResult.Valid)?.shares

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Split ${Money.formatCents(amountCents)}") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            OfflineBanner()

            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Description") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Column {
                Text("Paid by", style = MaterialTheme.typography.labelMedium, color = Faded)
                Spacer(Modifier.height(4.dp))
                OutlinedButton(onClick = { showPayerPicker = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(if (payerId.isBlank()) "Choose payer" else nameOf(payerId))
                }
            }

            GoldHairline()

            Text("Split between", style = MaterialTheme.typography.labelMedium, color = Faded)
            members.forEach { member ->
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = member.id in selected,
                        onCheckedChange = { checked ->
                            selected = if (checked) selected + member.id else selected - member.id
                            if (!checked) equalSharesText.remove(member.id)
                        }
                    )
                    MemberBadge(
                        name = member.name.ifBlank { "Member" },
                        colorHex = member.color,
                        badgeSize = 28.dp
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(member.name.ifBlank { "Member" }, modifier = Modifier.weight(1f))
                }
            }

            GoldHairline()

            Text("Split type", style = MaterialTheme.typography.labelMedium, color = Faded)
            Row(verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected = true, onClick = {})
                Text("Equal")
            }
            Text(
                "Custom amounts and Percentage arrive in Phase 4.",
                style = MaterialTheme.typography.bodySmall,
                color = Faded
            )

            if (sharesResult is ValidationResult.Invalid) {
                Text(
                    sharesResult.reason,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            } else {
                Text(
                    "Adjust any share — the rest rebalance so it always totals ${Money.formatCents(amountCents)}.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Faded
                )
            }

            members.filter { it.id in selected }.forEach { member ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    MemberBadge(
                        name = member.name.ifBlank { "Member" },
                        colorHex = member.color,
                        badgeSize = 26.dp
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(member.name.ifBlank { "Member" }, modifier = Modifier.weight(1f))
                    OutlinedTextField(
                        value = equalSharesText[member.id].orEmpty(),
                        onValueChange = { text ->
                            val cleaned = text.filter { it.isDigit() || it == '.' }.take(9)
                            equalSharesText[member.id] = cleaned
                            redistributeEqual(
                                amountCents,
                                member.id,
                                cleaned,
                                selected.toList(),
                                equalSharesText
                            )
                        },
                        label = { Text("\u20B9") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.width(130.dp)
                    )
                }
            }

            Button(
                enabled = validShares != null,
                onClick = {
                    vm.save(
                        ledgerId = ledgerId,
                        payerId = payerId,
                        description = description,
                        amountCents = amountCents,
                        shares = validShares.orEmpty(),
                        onDone = onBack
                    )
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Confirm & post") }
        }
    }

    if (showPayerPicker) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showPayerPicker = false },
            title = { Text("Who paid?") },
            text = {
                Column {
                    members.forEach { member ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(
                                selected = payerId == member.id,
                                onClick = {
                                    payerId = member.id
                                    showPayerPicker = false
                                }
                            )
                            Text(member.name.ifBlank { "Member" })
                        }
                    }
                }
            },
            confirmButton = {
                OutlinedButton(onClick = { showPayerPicker = false }) { Text("Close") }
            }
        )
    }
}

private fun validateEqual(
    totalCents: Long,
    ids: List<String>,
    texts: Map<String, String>
): ValidationResult {
    if (ids.isEmpty()) return ValidationResult.Invalid("Pick at least one person")
    var sum = 0L
    for (id in ids) {
        val cents = Money.parseToCents(texts[id].orEmpty())
            ?: return ValidationResult.Invalid("Enter a share for everyone splitting")
        sum += cents
    }
    return if (sum == totalCents) {
        ValidationResult.Valid(ids.map { it to (Money.parseToCents(texts[it].orEmpty()) ?: 0L) })
    } else {
        ValidationResult.Invalid("Shares must total exactly ${Money.formatCents(totalCents)}")
    }
}

/** Editing one person's share rebalances everyone else equally so the total holds. */
private fun redistributeEqual(
    totalCents: Long,
    editedId: String,
    editedText: String,
    allIds: List<String>,
    target: MutableMap<String, String>
) {
    val edited = Money.parseToCents(editedText) ?: return
    if (edited > totalCents) return
    val others = allIds.filter { it != editedId }
    if (others.isEmpty()) return
    val remaining = totalCents - edited
    SplitCalculator.equalSharesCents(remaining, others).forEach { (id, cents) ->
        target[id] = formatCentsInput(cents)
    }
}

private fun formatCentsInput(cents: Long): String =
    String.format(java.util.Locale.US, "%.2f", cents / 100.0)
