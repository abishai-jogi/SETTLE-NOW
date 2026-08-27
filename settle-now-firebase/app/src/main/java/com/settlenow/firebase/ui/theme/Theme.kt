package com.settlenow.firebase.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightScheme = lightColorScheme(
    primary = Wine,
    onPrimary = Ivory,
    secondary = Gold,
    onSecondary = Charcoal,
    tertiary = Positive,
    background = Paper,
    onBackground = Ink,
    surface = Ivory,
    onSurface = Ink,
    surfaceVariant = Paper,
    onSurfaceVariant = Faded,
    outline = Gold
)

@Composable
fun SettleNowTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) {
            darkColorScheme(
                primary = Wine,
                onPrimary = Ivory,
                secondary = Gold,
                background = Charcoal,
                onBackground = Ivory,
                surface = Ink,
                onSurface = Ivory,
                surfaceVariant = Ink,
                onSurfaceVariant = Gold,
                outline = Gold
            )
        } else {
            LightScheme
        },
        typography = AppTypography,
        content = content
    )
}
