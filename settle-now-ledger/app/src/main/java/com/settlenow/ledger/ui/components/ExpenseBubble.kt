package com.settlenow.ledger.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.settlenow.ledger.data.local.entity.ExpenseEntity
import com.settlenow.ledger.domain.Money
import com.settlenow.ledger.domain.parseHexColor
import com.settlenow.ledger.domain.prefersDarkText

/**
 * Chat-style expense bubble. Background is the payer's assigned solid color;
 * text contrast flips automatically. Mine align right, everyone else left.
 */
@Composable
fun ExpenseBubble(
    expense: ExpenseEntity,
    payerName: String,
    payerColor: String,
    mine: Boolean,
    participantCount: Int,
    modifier: Modifier = Modifier
) {
    val fg = if (prefersDarkText(payerColor)) Color(0xFF262220) else Color(0xFFF5F0E6)
    val bubbleShape = RoundedCornerShape(
        topStart = 16.dp,
        topEnd = 16.dp,
        bottomStart = if (mine) 16.dp else 4.dp,
        bottomEnd = if (mine) 4.dp else 16.dp
    )

    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start
    ) {
        Column(
            horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
            modifier = Modifier.padding(horizontal = 6.dp)
        ) {
            if (!mine) {
                Text(
                    text = "$payerName · $participantCount splitting",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp, bottom = 2.dp)
                )
            }
            Box(
                Modifier.background(color = parseHexColor(payerColor), shape = bubbleShape)
            ) {
                Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = expense.description.ifBlank { "Expense" },
                            style = MaterialTheme.typography.labelMedium,
                            color = fg.copy(alpha = 0.85f),
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        Text(
                            text = formatTime(expense.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = fg.copy(alpha = 0.65f),
                            modifier = Modifier.padding(start = 8.dp)
                        )
                    }
                    Text(
                        text = Money.formatCents(expense.amountCents),
                        style = MaterialTheme.typography.headlineSmall,
                        color = fg
                    )
                    if (expense.isSynced.not()) {
                        Text(
                            text = "Pending sync",
                            style = MaterialTheme.typography.labelSmall,
                            color = fg.copy(alpha = 0.7f)
                        )
                    }
                }
            }
        }
    }
}

private fun formatTime(ms: Long): String =
    java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date(ms))
