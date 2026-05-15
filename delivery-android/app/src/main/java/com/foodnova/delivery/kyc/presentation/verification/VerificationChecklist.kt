package com.foodnova.delivery.kyc.presentation.verification

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AssistChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.foodnova.delivery.kyc.domain.VerificationProgress
import com.foodnova.delivery.kyc.domain.VerificationStatus

@Composable
fun VerificationChecklist(progress: VerificationProgress, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(
            text = "Verification progress",
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(modifier = Modifier.height(10.dp))
        LinearProgressIndicator(
            progress = { progress.completedSteps / progress.totalSteps.toFloat() }
        )
        Spacer(modifier = Modifier.height(14.dp))
        VerificationChip("Identity/KYC", progress.identityStatus)
        VerificationChip("Address document", progress.addressStatus)
        VerificationChip("Emergency contact", progress.emergencyContactStatus)
        VerificationChip("Admin approval", progress.adminApprovalStatus)
    }
}

@Composable
private fun VerificationChip(label: String, status: VerificationStatus) {
    AssistChip(
        onClick = {},
        label = { Text("$label: ${status.label()}") }
    )
}

private fun VerificationStatus.label(): String = when (this) {
    VerificationStatus.NotStarted -> "Not started"
    VerificationStatus.InProgress -> "In progress"
    VerificationStatus.PendingReview -> "Pending review"
    VerificationStatus.Approved -> "Approved"
    VerificationStatus.Rejected -> "Rejected"
}
