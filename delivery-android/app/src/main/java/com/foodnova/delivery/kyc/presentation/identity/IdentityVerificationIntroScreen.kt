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
fun IdentityVerificationIntroScreen(onContinue: () -> Unit) {
    FoodNovaScreen(
        title = "Identity verification",
        subtitle = "Verify your NIN and take a quick selfie. This keeps FoodNova deliveries safe."
    ) {
        Text("You can still browse the dashboard while review is pending, but going online stays locked until approval.")
        Spacer(modifier = Modifier.height(22.dp))
        FoodNovaPrimaryButton(
            text = "Start verification",
            onClick = onContinue
        )
    }
}
