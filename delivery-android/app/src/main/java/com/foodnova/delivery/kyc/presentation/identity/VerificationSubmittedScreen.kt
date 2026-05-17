package com.foodnova.delivery.kyc.presentation.identity

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.foodnova.delivery.kyc.domain.KycStep
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaStatusMark

@Composable
fun VerificationSubmittedScreen(
    completedStep: String,
    nextStep: KycStep,
    onDone: () -> Unit
) {
    val visible = remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible.value = true }

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    AnimatedVisibility(
                        visible = visible.value,
                        enter = fadeIn(tween(220)) + scaleIn(tween(260), initialScale = 0.82f)
                    ) {
                        FoodNovaStatusMark(label = "OK", color = MaterialTheme.colorScheme.primary)
                    }
                    Text("$completedStep submitted", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                    Text(
                        "Saved to your FoodNova partner profile. You can resume this onboarding flow from the dashboard at any time.",
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
            }

            ReviewStep("NX", "Next step", nextStep.copyText())
            ReviewStep("L", "Operations locked", "Go Online unlocks after admin approval.")

            Spacer(modifier = Modifier.weight(1f))
            FoodNovaPrimaryButton(
                text = nextStep.buttonText(),
                onClick = onDone
            )
            Spacer(modifier = Modifier.height(4.dp))
        }
    }
}

private fun KycStep.copyText(): String = when (this) {
    KycStep.Identity -> "Continue with identity verification."
    KycStep.Address -> "Upload an address document for operations review."
    KycStep.EmergencyContact -> "Add an emergency contact for worker safety."
    KycStep.AdminApproval -> "All partner documents are submitted. FoodNova operations will review your profile."
    KycStep.ActivationComplete -> "Your partner profile is active."
}

private fun KycStep.buttonText(): String = when (this) {
    KycStep.AdminApproval -> "View approval status"
    KycStep.ActivationComplete -> "Go to operations hub"
    else -> "Continue onboarding"
}

@Composable
private fun ReviewStep(mark: String, title: String, body: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f), MaterialTheme.shapes.medium)
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        FoodNovaStatusMark(label = mark, color = MaterialTheme.colorScheme.primary)
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
