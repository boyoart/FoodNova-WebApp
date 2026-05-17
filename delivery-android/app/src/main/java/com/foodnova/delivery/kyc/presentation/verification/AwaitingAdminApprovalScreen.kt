package com.foodnova.delivery.kyc.presentation.verification

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaStatusMark

@Composable
fun AwaitingAdminApprovalScreen(
    viewModel: VerificationViewModel,
    onDashboard: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val visible = remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        visible.value = true
        viewModel.refreshVerificationStatus()
    }

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            AnimatedVisibility(
                visible = visible.value,
                enter = fadeIn(tween(220)) + slideInVertically(tween(260), initialOffsetY = { it / 6 })
            ) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        FoodNovaStatusMark(
                            label = if (state.progress.canActivateDeliveries) "OK" else "PR",
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            if (state.progress.canActivateDeliveries) "Activation complete" else "Smart verification in progress",
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            if (state.progress.canActivateDeliveries) {
                                "Your partner account is verified. Go Online is now unlocked on the operations dashboard."
                            } else {
                                "Clean NIN checks activate automatically after address and emergency contact are complete. Flagged profiles remain available for admin override."
                            },
                            style = MaterialTheme.typography.bodyLarge
                        )
                    }
                }
            }

            VerificationChecklist(progress = state.progress)
            Text(
                text = if (state.isLoading) "Refreshing partner status..." else "Dashboard access remains available while operations reviews your profile.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.weight(1f))
            FoodNovaPrimaryButton(
                text = if (state.progress.canActivateDeliveries) "Go to operations hub" else "Back to dashboard",
                onClick = onDashboard
            )
            Spacer(modifier = Modifier.height(4.dp))
        }
    }
}
