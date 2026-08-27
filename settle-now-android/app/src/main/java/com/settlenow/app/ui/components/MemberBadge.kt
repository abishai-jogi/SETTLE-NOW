package com.settlenow.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.settlenow.app.domain.parseHexColor
import com.settlenow.app.domain.prefersDarkText

fun initialsOf(name: String): String =
    name.trim().split(Regex("\\s+"))
        .filter { it.isNotBlank() }
        .take(2)
        .mapNotNull { it.firstOrNull()?.uppercaseChar() }
        .joinToString("")
        .ifEmpty { "?" }

@Composable
fun MemberBadge(
    name: String,
    modifier: Modifier = Modifier,
    colorHex: String = "#7a1e2a",
    badgeSize: Dp = 34.dp
) {
    Box(
        modifier = modifier
            .size(badgeSize)
            .clip(CircleShape)
            .background(parseHexColor(colorHex)),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = initialsOf(name),
            style = MaterialTheme.typography.labelMedium,
            color = if (prefersDarkText(colorHex)) MaterialTheme.colorScheme.onSurface
            else MaterialTheme.colorScheme.surface
        )
    }
}
