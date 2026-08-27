package com.settlenow.app.ui.expense

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
import com.settlenow.app.data.local.entity.SplitTypes
import com.settlenow.app.data.repo.MemberInfo
import com.settlenow.app.data.repo.SettleNowRepository
import com.settlenow.app.domain.Money
import com.settlenow.app.domain.SplitCalculator
import com.settlenow.app.domain.SplitCalculator.ValidationResult
import com.settlenow.app.ui.components.AmountKeypad
import com.settlenow.app.ui.components.GoldHairline
import com.settlenow.app.ui.components.OfflineBanner
import com.settlenow.app.ui.home.simpleFactory
import com.settlenow.app.ui.theme.Faded
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class AddExpenseViewModel(private val repository: SettleNowRepository) : ViewModel() {

    val members = MutableStateFlow<List<MemberInfo>>(emptyList())
    val myId = MutableStateFlow<String?>(null)
    val myColor = MutableStateFlow("#7a1e2a")

    fun loadMembers(roomId: String) {
        viewModelScope.launch {
            val me = repository.currentUser()
            myId.value = me?.id
            myColor.value = me?.color ?: "#7a1e2a"
            members.value = repository.roomMembersOnce(roomId).map { m ->
                MemberInfo(m.id, m.name, m.avatarInitials, m.color, m.id == me?.id)
            }
        }
    }

    fun save(
        roomId: String,
        payerId: String,
        description: String,
        amountCents: Long,
        splitType: String,
        shares: List<Pair<String, Long>>,
        onDone: () -> Unit
    ) {
        if (amountCents <= 0 || shares.isEmpty()) return
        viewModelScope.launch {
            repository.addExpense(roomId, payerId, description, amountCents, splitType, shares)
            onDone()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddExpenseScreen(
    repository: SettleNowRepository,
    roomId: String,
    onBack: () -> Unit
) {
    val vm: AddExpenseViewModel =
        viewModel(factory = simpleFactory { AddExpenseViewModel(repository) })

    LaunchedEffect(roomId) { vm.loadMembers(roomId) }

    val members by vm.members.collectAsState()
    val myId by vm.myId.collectAsState()
    val myColor by vm.myColor.collectAsState()

    var draft by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var payerId by remember(myId) { mutableStateOf(myId ?: "") }
    var selectedParticipants by remember(members) {
        mutableStateOf(members.map { it.id }.toSet())
    }
    var splitType by remember { mutableStateOf(SplitTypes.EQUAL) }
    val customAmounts = remember { mutableStateMapOf<String, String>() }
    val percentages = remember { mutableStateMapOf<String, String>() }
    var showPayerPicker by remember { mutableStateOf(false) }

    val amountCents = Money.parseToCents(draft) ?: 0L

    val activeSelection = selectedParticipants.filter { id -> members.any { it.id == id } }
    val sharesResult: ValidationResult? = when {
        amountCents <= 0 || activeSelection.isEmpty() || payerId.isBlank() -> null
        splitType == SplitTypes.EQUAL ->
            SplitCalculator.equalShares(amountCents, activeSelection)
        splitType == SplitTypes.CUSTOM ->
            SplitCalculator.customShares(amountCents, customAmounts.filterKeys { it in activeSelection })
        else ->
            SplitCalculator.percentageShares(amountCents, percentages.filterKeys { it in activeSelection })
    }
    val validShares = (sharesResult as? ValidationResult.Valid)?.shares

    fun pressKey(key: String) {
        draft = when (key) {
            "back" -> draft.dropLast(1)
            "." -> if (draft.contains(".")) draft else if (draft.isEmpty()) "0." else draft + "."
            else -> {
                val digit = key.takeWhile { it.isDigit() }
                if (digit.isEmpty()) draft
                else if (draft.contains(".")) {
                    if (draft.length - draft.indexOf('.') <= 2) draft + digit else draft
                } else if (draft.length >= 7) draft
                else if (draft == "0") digit
                else draft + digit
            }
        }
    }

    fun onQuickAmount(amount: Long) {
        draft = amount.toString()
    }

    fun send() {
        val shares = validShares ?: return
        vm.save(
            roomId = roomId,
            payerId = payerId,
            description = description,
            amountCents = amountCents,
            splitType = splitType,
            shares = shares,
            onDone = onBack
        )
        draft = ""
    }

    val canSend = validShares != null

    fun nameOf(id: String): String =
        members.firstOrNull { it.id == id }?.name?.ifBlank { "Member" } ?: "Member"

    Scaffold(
        bottomBar = {
            AmountKeypad(
                draft = draft,
                payerName = members.firstOrNull { it.id == payerId }?.name ?: "",
                accentHex = myColor,
                canSend = canSend,
                onKey = ::pressKey,
                onQuickAmount = ::onQuickAmount,
                onSend = ::send
            )
        },
        topBar = {
            TopAppBar(
                title = { Text("Add Expense") },
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
            verticalArrangement = Arrangement.spacedBy(16.dp)
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

            Column {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Split between", style = MaterialTheme.typography.labelMedium, color = Faded)
                    Text(
                        "${activeSelection.size} of ${members.size}",
                        style = MaterialTheme.typography.labelMedium,
                        color = Faded
                    )
                }
                Spacer(Modifier.height(4.dp))
                members.forEach { member ->
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = member.id in selectedParticipants,
                            onCheckedChange = { checked ->
                                selectedParticipants =
                                    if (checked) selectedParticipants + member.id
                                    else selectedParticipants - member.id
                            }
                        )
                        Text(member.name.ifBlank { "Member" }, modifier = Modifier.weight(1f))

                        if (member.id in selectedParticipants && splitType == SplitTypes.CUSTOM) {
                            OutlinedTextField(
                                value = customAmounts[member.id].orEmpty(),
                                onValueChange = { text ->
                                    customAmounts[member.id] = text.filter { it.isDigit() || it == '.' }
                                },
                                label = { Text("\u20B9") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.width(120.dp)
                            )
                        }

                        if (member.id in selectedParticipants && splitType == SplitTypes.PERCENTAGE) {
                            OutlinedTextField(
                                value = percentages[member.id].orEmpty(),
                                onValueChange = { text ->
                                    percentages[member.id] = text.filter { it.isDigit() }.take(3)
                                },
                                label = { Text("%") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.width(96.dp)
                            )
                        }
                    }
                }
            }

            GoldHairline()

            Column {
                Text("Split type", style = MaterialTheme.typography.labelMedium, color = Faded)
                listOf(
                    SplitTypes.EQUAL to "Equal",
                    SplitTypes.CUSTOM to "Custom amounts",
                    SplitTypes.PERCENTAGE to "Percentage"
                ).forEach { (value, label) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                            selected = splitType == value,
                            onClick = { splitType = value }
                        )
                        Text(label)
                    }
                }
            }

            when (val result = sharesResult) {
                is ValidationResult.Invalid ->
                    Text(result.reason, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                is ValidationResult.Valid -> {
                    if (splitType == SplitTypes.EQUAL) {
                        val perHead = result.shares.sumOf { it.second } / result.shares.size
                        Text(
                            "Each of ${result.shares.size} pays about ${Money.formatCents(perHead)}",
                            color = Faded,
                            style = MaterialTheme.typography.bodySmall
                        )
                    } else {
                        Text(
                            "Splits exactly to ${Money.formatCents(amountCents)}",
                            color = MaterialTheme.colorScheme.tertiary,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
                null -> Unit
            }
        }
    }

    if (showPayerPicker) {
        AlertDialog(
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

@Composable
private fun AlertDialog(
    onDismissRequest: () -> Unit,
    title: @Composable () -> Unit,
    text: @Composable () -> Unit,
    confirmButton: @Composable () -> Unit
) {
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismissRequest,
        title = title,
        text = text,
        confirmButton = confirmButton
    )
}
