package com.foodnova.delivery.kyc.presentation.identity

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.foodnova.delivery.kyc.presentation.verification.VerificationViewModel
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaScreen
import com.foodnova.delivery.ui.components.FoodNovaTextField

@Composable
fun NinEntryScreen(
    viewModel: VerificationViewModel,
    onContinue: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    FoodNovaScreen(
        title = "Enter NIN",
        subtitle = "Use your 11-digit National Identification Number."
    ) {
        FoodNovaTextField(
            value = state.nin,
            onValueChange = viewModel::onNinChanged,
            label = "NIN",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
        )
        Spacer(modifier = Modifier.height(22.dp))
        FoodNovaPrimaryButton(
            text = "Continue",
            enabled = state.nin.length == 11,
            onClick = onContinue
        )
    }
}
