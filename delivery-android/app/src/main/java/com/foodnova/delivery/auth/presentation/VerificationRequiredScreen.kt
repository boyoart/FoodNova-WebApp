package com.foodnova.delivery.auth.presentation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.foodnova.delivery.kyc.domain.KycStep
import com.foodnova.delivery.kyc.domain.VerificationProgress
import com.foodnova.delivery.kyc.domain.VerificationStatus
import com.foodnova.delivery.kyc.domain.isLockedComplete
import com.foodnova.delivery.kyc.presentation.verification.VerificationChecklist
import com.foodnova.delivery.kyc.presentation.verification.title
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaStatusMark

@Composable
fun VerificationRequiredScreen(
    progress: VerificationProgress,
    isLoading: Boolean,
    onContinueKyc: () -> Unit,
    onEditIdentity: () -> Unit,
    onEditAddress: () -> Unit,
    onEditEmergencyContact: () -> Unit,
    onContinueToDashboard: () -> Unit
) {
    val visible = remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible.value = true }

    Scaffold { padding ->
        LazyColumn(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Rider activation", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                    Text(
                        "Track the checks required before Go Online, orders, and wallet access unlock.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            item {
                AnimatedVisibility(
                    visible = visible.value,
                    enter = fadeIn(tween(220)) + slideInVertically(tween(260), initialOffsetY = { it / 8 })
                ) {
                    VerificationChecklist(progress = progress)
                }
            }

            item {
                ActivationTimeline(
                    progress = progress,
                    onEditIdentity = onEditIdentity,
                    onEditAddress = onEditAddress,
                    onEditEmergencyContact = onEditEmergencyContact
                )
            }

            item {
                FoodNovaPrimaryButton(
                    text = when {
                        isLoading -> "Refreshing..."
                        progress.canActivateDeliveries -> "Activation complete"
                        progress.nextStep == KycStep.AdminApproval -> "View approval status"
                        else -> "Continue KYC: ${progress.nextStep.title()}"
                    },
                    enabled = !isLoading && !progress.canActivateDeliveries,
                    onClick = onContinueKyc
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(
                    onClick = onContinueToDashboard,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Continue to dashboard")
                }
            }
        }
    }
}

@Composable
private fun ActivationTimeline(
    progress: VerificationProgress,
    onEditIdentity: () -> Unit,
    onEditAddress: () -> Unit,
    onEditEmergencyContact: () -> Unit
) {
    val completed = listOf(
        progress.identityStatus,
        progress.addressStatus,
        progress.emergencyContactStatus,
        progress.adminApprovalStatus
    ).count { it.isLockedComplete }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Onboarding timeline", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text("$completed/4", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            }
            LinearProgressIndicator(progress = { completed / 4f }, modifier = Modifier.fillMaxWidth())
            KycStepRow(KycStep.Identity, progress.identityStatus, progress.nextStep == KycStep.Identity, onEditIdentity)
            HorizontalDivider()
            KycStepRow(KycStep.Address, progress.addressStatus, progress.nextStep == KycStep.Address, onEditAddress)
            HorizontalDivider()
            KycStepRow(KycStep.EmergencyContact, progress.emergencyContactStatus, progress.nextStep == KycStep.EmergencyContact, onEditEmergencyContact)
            HorizontalDivider()
            KycStepRow(KycStep.AdminApproval, progress.adminApprovalStatus, progress.nextStep == KycStep.AdminApproval, onEdit = null)
        }
    }
}

@Composable
private fun KycStepRow(
    step: KycStep,
    status: VerificationStatus,
    active: Boolean,
    onEdit: (() -> Unit)?
) {
    val complete = status.isLockedComplete
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        FoodNovaStatusMark(
            label = if (complete) "OK" else if (active) "NX" else "--",
            color = if (complete) MaterialTheme.colorScheme.primary else if (active) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant
        )
        Column(Modifier.weight(1f)) {
            Text(step.title(), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(status.stepCopy(active), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (complete && onEdit != null) {
            TextButton(onClick = onEdit) { Text("Edit") }
        }
    }
}

private fun VerificationStatus.stepCopy(active: Boolean): String = when {
    this == VerificationStatus.Approved -> "Approved"
    isLockedComplete -> "Submitted. Locked unless edited."
    active -> "Next required step"
    else -> "Locked until earlier steps are complete"
}
