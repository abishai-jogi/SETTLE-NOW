package com.settlenow.ledger.ui.components

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.settlenow.ledger.domain.Money
import com.settlenow.ledger.domain.parseHexColor
import com.settlenow.ledger.domain.prefersDarkText

private val KEYS = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back")

/**
 * Docked numeric keypad for bill entry. The send button is filled with the
 * current user's assigned color so the entry's ownership is obvious.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun AmountKeypad(
    draft: String,
    payerName: String,
    accentHex: String,
    canSend: Boolean,
    onKey: (String) -> Unit,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
    chips: List<Int> = emptyList(),
    onChip: (Int) -> Unit = {}
) {
    val accent = parseHexColor(accentHex)
    val onAccent = if (prefersDarkText(accentHex)) {
        androidx.compose.ui.graphics.Color(0xFF262220)
    } else {
        androidx.compose.ui.graphics.Color(0xFFF5F0E6)
    }

    Column(modifier.fillMaxWidth()) {
        if (chips.isNotEmpty()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                chips.forEach { amount ->
                    Surface(
                        onClick = { onChip(amount) },
                        shape = androidx.compose.foundation.shape.CircleShape,
                        color = MaterialTheme.colorScheme.surface,
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                        ),
                        modifier = Modifier.weight(1f).height(34.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                            Text(
                                "\u20B9$amount",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }
            }
        }

        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .background(
                    MaterialTheme.colorScheme.surface,
                    MaterialTheme.shapes.small
                )
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "${payerName.ifBlank { "You" }} pays",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = Money.draftMoney(draft).ifEmpty { "\u20B9 0" },
                style = MaterialTheme.typography.headlineSmall
            )
        }

        Spacer(Modifier.height(6.dp))

        Column(Modifier.padding(horizontal = 12.dp)) {
            KEYS.chunked(3).forEach { rowKeys ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 2.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    rowKeys.forEach { key ->
                        Surface(
                            onClick = { onKey(key) },
                            shape = MaterialTheme.shapes.medium,
                            color = MaterialTheme.colorScheme.inverseSurface,
                            modifier = Modifier.weight(1f).height(56.dp)
                        ) {
                            Box(
                                Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                if (key == "back") {
                                    Text("DEL", color = MaterialTheme.colorScheme.inverseOnSurface)
                                } else {
                                    Text(
                                        key,
                                        style = MaterialTheme.typography.titleLarge,
                                        color = MaterialTheme.colorScheme.inverseOnSurface
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(6.dp))

            Surface(
                onClick = { if (canSend) onSend() },
                enabled = canSend,
                shape = MaterialTheme.shapes.medium,
                color = accent,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                    Text(
                        text = if (canSend) "Record ${Money.draftMoney(draft)}" else "Record payment",
                        style = MaterialTheme.typography.titleMedium,
                        color = onAccent.copy(alpha = if (canSend) 1f else 0.5f)
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}
