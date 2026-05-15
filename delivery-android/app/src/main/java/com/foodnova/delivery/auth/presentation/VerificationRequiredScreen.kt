package com.foodnova.delivery.auth.presentation

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.foodnova.delivery.kyc.domain.VerificationProgress
import com.foodnova.delivery.kyc.presentation.verification.VerificationChecklist
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaScreen

@Composable
fun VerificationRequiredScreen(
    progress: VerificationProgress,
    onAddressVerification: () -> Unit,
    onEmergencyContact: () -> Unit,
    onContinueToDashboard: () -> Unit
) {
    FoodNovaScreen(
        title = "Verification required",
        subtitle = "You can enter the dashboard now. KYC and admin approval are required before going online or accepting deliveries."
    ) {
        VerificationChecklist(progress = progress)
        Spacer(modifier = Modifier.height(18.dp))
        Text(text = "Complete verification after login to unlock delivery operations.")
        Spacer(modifier = Modifier.height(16.dp))
        FoodNovaPrimaryButton(
            text = "Verify address",
            onClick = onAddressVerification
        )
        Spacer(modifier = Modifier.height(12.dp))
        FoodNovaPrimaryButton(
            text = "Add emergency contact",
            onClick = onEmergencyContact
        )
        Spacer(modifier = Modifier.height(22.dp))
        FoodNovaPrimaryButton(
            text = "Continue to dashboard",
            onClick = onContinueToDashboard
        )
    }
}
