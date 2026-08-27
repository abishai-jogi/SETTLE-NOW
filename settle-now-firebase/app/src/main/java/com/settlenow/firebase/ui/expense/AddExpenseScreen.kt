package com.settlenow.firebase.ui.expense

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
import com.settlenow.firebase.data.model.Member
import com.settlenow.firebase.data.repo.FirebaseRepository
import com.settlenow.firebase.domain.Money
import com.settlenow.firebase.domain.SplitCalculator
import com.settlenow.firebase.domain.SplitTypes
import com.settlenow.firebase.domain.SplitCalculator.ValidationResult
import com.settlenow.firebase.ui.components.GoldHairline
import com.settlenow.firebase.ui.components.OfflineBanner
import com.settlenow.firebase.ui.home.simpleFactory
import com.settlenow.firebase.ui.theme.Faded
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class AddExpenseViewModel(private val repository: FirebaseRepository) : ViewModel() {

    val members = MutableStateFlow<List<Member>>(emptyList())
    val myId = MutableStateFlow<String?>(null)

    fun loadMembers(roomId: String) {
        viewModelScope.launch {
            val user = repository.ensureUserDoc()
            myId.value = user?.id
            members.value = repository.roomMembersOnce(roomId)
        }
    }

    fun save(
        roomId: String,
        payerId: String,
        description: String,
        amountCents: Long,
        splitType: String,
        shares: List<Pair<String, Long>>,
        supersedes: String?,
        onDone: () -> Unit
    ) {
        if (amountCents <= 0 || shares.isEmpty() || payerId.isBlank()) return
        viewModelScope.launch {
            repository.addExpense(roomId, payerId, description, amountCents, splitType, shares, supersedes)
            onDone()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddExpenseScreen(
    repository: FirebaseRepository,
    roomId: String,
    supersedes: String?,
    onBack: () -> Unit
) {
    val vm: AddExpenseViewModel = viewModel(factory = simpleFactory { AddExpenseViewModel(repository) })

    LaunchedEffect(roomId) { vm.loadMembers(roomId) }

    val members by vm.members.collectAsState()
    val myId by vm.myId.collectAsState()

    var loadedOriginal by remember { mutableStateOf(false) }
    var amountText by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var payerId by remember(myId) { mutableStateOf(myId ?: "") }
    var selectedParticipants by remember(members) {
        mutableStateOf(members.map { it.id }.toSet())
    }
    var splitType by remember { mutableStateOf(SplitTypes.EQUAL) }
    val customAmounts = remember { mutableStateMapOf<String, String>() }
    val percentages = remember { mutableStateMapOf<String, String>() }
    var showPayerPicker by remember { mutableStateOf(false) }

    // Prefill when replacing an existing expense (immutable edit flow).
    LaunchedEffect(supersedes, members) {
        val originalId = supersedes ?: return@LaunchedEffect
        if (members.isEmpty()) return@LaunchedEffect
        val original = repository.getExpenseOnce(roomId, originalId) ?: run {
            loadedOriginal = true
            return@LaunchedEffect
        }
        amountText = Money.formatCents(original.amountCents).replace(Regex("[₹,]"), "")
        description = original.description
        payerId = original.paidBy
        selectedParticipants = original.participants.map { it.userId }.toSet()
        splitType = original.splitType
        customAmounts.clear()
        percentages.clear()
        original.participants.forEach { share ->
            customAmounts[share.userId] = String.format(java.util.Locale.US, "%.2f", share.shareCents / 100.0)
            val percent = if (original.amountCents > 0) {
                Math.round(share.shareCents * 100.0 / original.amountCents).toInt().coerceIn(0, 100)
            } else 0
            percentages[share.userId] = percent.toString()
        }
        loadedOriginal = true
    }

    val amountCents = Money.parseToCents(amountText) ?: 0L

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
    val canSave = validShares != null

    fun nameOf(id: String): String =
        members.firstOrNull { it.id == id }?.name?.ifBlank { "Member" } ?: "Member"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (supersedes != null) "Correct Expense" else "Add Expense") },
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

            if (supersedes != null) {
                Text(
                    "This creates a corrected entry and marks the old one superseded — history is preserved.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Faded
                )
            }

            OutlinedTextField(
                value = amountText,
                onValueChange = { amountText = it },
                label = { Text("Amount") },
                prefix = { Text("\u20B9") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth()
            )

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
                        RadioButton(selected = splitType == value, onClick = { splitType = value })
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

            Button(
                enabled = canSave,
                onClick = {
                    vm.save(
                        roomId = roomId,
                        payerId = payerId,
                        description = description,
                        amountCents = amountCents,
                        splitType = splitType,
                        shares = validShares.orEmpty(),
                        supersedes = supersedes,
                        onDone = onBack
                    )
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (supersedes != null) "Save Correction" else "Save Expense")
            }
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
