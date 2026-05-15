package com.foodnova.delivery.delivery.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Pending
import com.foodnova.delivery.kyc.domain.VerificationStatus
import com.foodnova.delivery.kyc.domain.VerificationProgress
import com.foodnova.delivery.kyc.presentation.verification.VerificationChecklist
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeliveryDashboardScreen(
    progress: VerificationProgress,
    workerName: String = "FoodNova Partner",
    workerType: String = "Rider",
    onIdentityVerification: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("FoodNova Delivery")
                        Text(workerName, style = MaterialTheme.typography.bodyMedium)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatusChip(label = workerType, status = VerificationStatus.Approved)
                StatusChip(
                    label = if (progress.canActivateDeliveries) "Active" else "Locked",
                    status = if (progress.canActivateDeliveries) VerificationStatus.Approved else VerificationStatus.PendingReview
                )
            }
            Card(elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)) {
                Column(Modifier.padding(18.dp)) {
                    val percent = (progress.completedSteps * 100) / progress.totalSteps
                    Text("Verification", style = MaterialTheme.typography.titleLarge)
                    Spacer(modifier = Modifier.height(10.dp))
                    LinearProgressIndicator(
                        progress = { percent / 100f },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("$percent% complete", style = MaterialTheme.typography.bodyMedium)
                    Spacer(modifier = Modifier.height(14.dp))
                    FoodNovaPrimaryButton(
                        text = "Complete Identity Verification",
                        enabled = progress.identityStatus != VerificationStatus.PendingReview && progress.identityStatus != VerificationStatus.Approved,
                        onClick = onIdentityVerification
                    )
                }
            }
            VerificationChecklist(progress = progress)
            FeaturePreviewCard("Go online", "Locked until verification and admin approval are complete.")
            FeaturePreviewCard("Delivery offers", "New requests will appear here after activation.")
            FeaturePreviewCard("Emergency alerts", "Emergency support unlocks after contact setup.")
        }
    }
}

@Composable
private fun StatusChip(label: String, status: VerificationStatus) {
    val color = when (status) {
        VerificationStatus.Approved -> Color(0xFFE8F5E9)
        VerificationStatus.PendingReview, VerificationStatus.InProgress -> Color(0xFFFFF8E1)
        VerificationStatus.Rejected -> Color(0xFFFFEBEE)
        VerificationStatus.NotStarted -> Color(0xFFF3F4F6)
    }
    val icon = when (status) {
        VerificationStatus.Approved -> Icons.Default.CheckCircle
        VerificationStatus.PendingReview, VerificationStatus.InProgress -> Icons.Default.Pending
        else -> Icons.Default.Lock
    }
    Surface(color = color, shape = MaterialTheme.shapes.large) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(icon, contentDescription = null)
            Text(label, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun FeaturePreviewCard(title: String, subtitle: String) {
    Card(elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(Icons.Default.Lock, contentDescription = null)
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(subtitle, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
