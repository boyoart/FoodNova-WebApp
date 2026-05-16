package com.foodnova.delivery.kyc.presentation.verification

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.foodnova.delivery.kyc.domain.VerificationProgress
import com.foodnova.delivery.kyc.domain.VerificationStatus
import com.foodnova.delivery.ui.components.FoodNovaStatusMark

@Composable
fun VerificationChecklist(progress: VerificationProgress, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Activation progress", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("${progress.completedSteps} of ${progress.totalSteps} checks submitted or approved", style = MaterialTheme.typography.bodySmall)
                }
                Text(progress.primaryStatusLabel(), style = MaterialTheme.typography.labelLarge, color = progress.primaryStatusColor())
            }
            LinearProgressIndicator(
                progress = { progress.completedSteps / progress.totalSteps.toFloat() },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(2.dp))
            VerificationChip("Identity/KYC", progress.identityStatus)
            VerificationChip("Address document", progress.addressStatus)
            VerificationChip("Emergency contact", progress.emergencyContactStatus)
            VerificationChip("Admin approval", progress.adminApprovalStatus)
        }
    }
}

@Composable
private fun VerificationChip(label: String, status: VerificationStatus) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        FoodNovaStatusMark(label = status.markLabel(), color = status.color())
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(status.helperText(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(status.label(), style = MaterialTheme.typography.labelLarge, color = status.color())
    }
}

private fun VerificationStatus.label(): String = when (this) {
    VerificationStatus.NotStarted -> "Not started"
    VerificationStatus.InProgress -> "In progress"
    VerificationStatus.Submitted -> "Submitted"
    VerificationStatus.PendingReview -> "Pending review"
    VerificationStatus.Approved -> "Approved"
    VerificationStatus.Rejected -> "Rejected"
}

private fun VerificationStatus.helperText(): String = when (this) {
    VerificationStatus.NotStarted -> "Required before activation."
    VerificationStatus.InProgress -> "Started, not submitted yet."
    VerificationStatus.Submitted -> "Submitted and ready for review."
    VerificationStatus.PendingReview -> "Submitted to FoodNova operations."
    VerificationStatus.Approved -> "Approved for this step."
    VerificationStatus.Rejected -> "Needs update before approval."
}

private fun VerificationStatus.markLabel(): String = when (this) {
    VerificationStatus.NotStarted -> "NS"
    VerificationStatus.InProgress -> "IP"
    VerificationStatus.Submitted -> "S"
    VerificationStatus.PendingReview -> "PR"
    VerificationStatus.Approved -> "OK"
    VerificationStatus.Rejected -> "!"
}

@Composable
private fun VerificationStatus.color(): Color = when (this) {
    VerificationStatus.NotStarted -> MaterialTheme.colorScheme.onSurfaceVariant
    VerificationStatus.InProgress -> MaterialTheme.colorScheme.tertiary
    VerificationStatus.Submitted -> MaterialTheme.colorScheme.secondary
    VerificationStatus.PendingReview -> MaterialTheme.colorScheme.secondary
    VerificationStatus.Approved -> MaterialTheme.colorScheme.primary
    VerificationStatus.Rejected -> MaterialTheme.colorScheme.error
}

private fun VerificationProgress.primaryStatusLabel(): String = when {
    canActivateDeliveries -> "Approved"
    listOf(identityStatus, addressStatus, emergencyContactStatus, adminApprovalStatus).any { it == VerificationStatus.Rejected } -> "Rejected"
    listOf(identityStatus, addressStatus, emergencyContactStatus, adminApprovalStatus).any { it == VerificationStatus.PendingReview } -> "Pending Review"
    listOf(identityStatus, addressStatus, emergencyContactStatus, adminApprovalStatus).any { it == VerificationStatus.Submitted } -> "Submitted"
    completedSteps > 0 -> "Submitted"
    else -> "Not Started"
}

@Composable
private fun VerificationProgress.primaryStatusColor(): Color = when (primaryStatusLabel()) {
    "Approved" -> MaterialTheme.colorScheme.primary
    "Rejected" -> MaterialTheme.colorScheme.error
    "Pending Review", "Submitted" -> MaterialTheme.colorScheme.secondary
    else -> MaterialTheme.colorScheme.onSurfaceVariant
}
