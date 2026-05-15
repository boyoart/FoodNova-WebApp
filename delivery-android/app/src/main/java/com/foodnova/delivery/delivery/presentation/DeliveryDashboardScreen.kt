package com.foodnova.delivery.delivery.presentation

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.foodnova.delivery.kyc.domain.VerificationProgress
import com.foodnova.delivery.kyc.presentation.verification.VerificationChecklist
import com.foodnova.delivery.ui.components.FoodNovaScreen

@Composable
fun DeliveryDashboardScreen(progress: VerificationProgress) {
    FoodNovaScreen(
        title = "Delivery dashboard",
        subtitle = "Dashboard access is available while verification is pending."
    ) {
        VerificationChecklist(progress = progress)
        Spacer(modifier = Modifier.height(18.dp))
        AssistChip(
            onClick = {},
            label = {
                Text(
                    if (progress.canActivateDeliveries) {
                        "Delivery activation unlocked"
                    } else {
                        "Verification required before going online"
                    }
                )
            }
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(text = "Online status and delivery offers will remain locked until KYC and admin approval are complete.")
    }
}
