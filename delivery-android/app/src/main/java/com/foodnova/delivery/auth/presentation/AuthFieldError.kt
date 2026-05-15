package com.foodnova.delivery.auth.presentation

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
fun FieldError(text: String?) {
    if (text == null) return

    Text(
        text = text,
        modifier = Modifier,
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodySmall
    )
}
