package com.foodnova.delivery.delivery.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.foodnova.delivery.kyc.domain.VerificationProgress
import com.foodnova.delivery.kyc.domain.VerificationStatus
import com.foodnova.delivery.kyc.presentation.verification.VerificationChecklist
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaStatusMark

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeliveryDashboardScreen(
    progress: VerificationProgress,
    workerName: String,
    workerType: String,
    onIdentityVerification: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Operations Hub") },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                OperationsHeader(workerName = workerName, workerType = workerType, progress = progress)
            }
            item {
                ActivationCard(progress = progress, onIdentityVerification = onIdentityVerification)
            }
            item { VerificationChecklist(progress = progress) }
            item { LockedFeatureCard("Go Online", "Go online mode unlocks after KYC approval.") }
            item { LockedFeatureCard("Delivery Offers", "Live delivery offers will appear here.") }
            item { LockedFeatureCard("Earnings", "Daily/weekly earnings summaries coming soon.") }
            item { LockedFeatureCard("Emergency Alerts", "Emergency trigger and hotline is prepared for production rollout.") }
        }
    }
}

@Composable
private fun OperationsHeader(workerName: String, workerType: String, progress: VerificationProgress) {
    val isActivated = progress.canActivateDeliveries
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(text = workerName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                StatusPill(label = workerType)
                StatusPill(label = progress.dashboardStatusLabel())
            }
            Text(
                text = if (isActivated) {
                    "Your operations profile is active."
                } else {
                    progress.dashboardStatusMessage()
                },
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

@Composable
private fun ActivationCard(progress: VerificationProgress, onIdentityVerification: () -> Unit) {
    Card {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                FoodNovaStatusMark(label = progress.activationMarkLabel(), color = progress.activationColor())
                Column {
                    Text("Verification & Activation", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(progress.dashboardStatusLabel(), style = MaterialTheme.typography.labelLarge, color = progress.activationColor())
                }
            }
            Text(progress.dashboardStatusMessage(), style = MaterialTheme.typography.bodyMedium)
            FoodNovaPrimaryButton(
                text = progress.activationButtonLabel(),
                enabled = !progress.canActivateDeliveries,
                onClick = onIdentityVerification
            )
            Text("Completed ${progress.completedSteps} of ${progress.totalSteps} checks", style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun StatusPill(label: String) {
    Box(
        modifier = Modifier
            .background(color = Color.White.copy(alpha = 0.7f), shape = RoundedCornerShape(100))
            .padding(horizontal = 10.dp, vertical = 6.dp)
    ) {
        Text(text = label, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun LockedFeatureCard(title: String, subtitle: String) {
    Card {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            FoodNovaStatusMark(label = "L", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(24.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(subtitle, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

private fun VerificationProgress.dashboardStatusLabel(): String = when {
    canActivateDeliveries -> "Approved"
    hasRejectedStep() -> "Rejected"
    hasPendingStep() -> "Pending Review"
    hasSubmittedStep() -> "Submitted"
    completedSteps > 0 -> "Submitted"
    else -> "Not Started"
}

private fun VerificationProgress.dashboardStatusMessage(): String = when (dashboardStatusLabel()) {
    "Approved" -> "You can go online once delivery operations are enabled."
    "Rejected" -> "One or more verification steps need attention before you can go online."
    "Pending Review" -> "Your verification is with FoodNova operations. Dashboard access stays open while delivery actions remain locked."
    "Submitted" -> "Some verification details are submitted. Complete the remaining checks to qualify for activation."
    else -> "Complete identity, address, emergency contact, and admin approval before receiving delivery jobs."
}

private fun VerificationProgress.activationButtonLabel(): String = when (dashboardStatusLabel()) {
    "Rejected" -> "Update KYC"
    "Pending Review" -> "View KYC Status"
    "Submitted" -> "Continue KYC"
    "Not Started" -> "Start KYC"
    else -> "Activated"
}

private fun VerificationProgress.hasPendingStep(): Boolean =
    listOf(identityStatus, addressStatus, emergencyContactStatus, adminApprovalStatus)
        .any { it == VerificationStatus.PendingReview || it == VerificationStatus.InProgress }

private fun VerificationProgress.hasSubmittedStep(): Boolean =
    listOf(identityStatus, addressStatus, emergencyContactStatus, adminApprovalStatus)
        .any { it == VerificationStatus.Submitted }

private fun VerificationProgress.hasRejectedStep(): Boolean =
    listOf(identityStatus, addressStatus, emergencyContactStatus, adminApprovalStatus)
        .any { it == VerificationStatus.Rejected }

private fun VerificationProgress.activationMarkLabel(): String = when (dashboardStatusLabel()) {
    "Approved" -> "OK"
    "Rejected" -> "!"
    "Pending Review" -> "PR"
    "Submitted" -> "S"
    else -> "L"
}

@Composable
private fun VerificationProgress.activationColor(): Color = when (dashboardStatusLabel()) {
    "Approved" -> MaterialTheme.colorScheme.primary
    "Rejected" -> MaterialTheme.colorScheme.error
    "Pending Review", "Submitted" -> MaterialTheme.colorScheme.secondary
    else -> MaterialTheme.colorScheme.onSurfaceVariant
}
