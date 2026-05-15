package com.foodnova.delivery.kyc.presentation.identity

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaScreen

@Composable
fun VerificationSubmittedScreen(onDone: () -> Unit) {
    FoodNovaScreen(
        title = "Submitted for review",
        subtitle = "FoodNova admin will review your identity verification."
    ) {
        Text("Your dashboard remains available, but online status and delivery acceptance stay locked until approval.")
        Spacer(modifier = Modifier.height(22.dp))
        FoodNovaPrimaryButton(
            text = "Back to dashboard",
            onClick = onDone
        )
    }
}
