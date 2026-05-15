package com.foodnova.delivery.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val FoodNovaLightColors = lightColorScheme(
    primary = Color(0xFF0F7B3F),
    secondary = Color(0xFFF4A62A),
    background = Color(0xFFFFFFFF),
    surface = Color(0xFFFFFFFF),
    onPrimary = Color(0xFFFFFFFF),
    onSecondary = Color(0xFF1D1D1D),
    onBackground = Color(0xFF1D1D1D),
    onSurface = Color(0xFF1D1D1D)
)

@Composable
fun FoodNovaDeliveryTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = FoodNovaLightColors,
        typography = FoodNovaTypography,
        content = content
    )
}
