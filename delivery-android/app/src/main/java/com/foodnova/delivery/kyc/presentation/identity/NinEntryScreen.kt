package com.foodnova.delivery.kyc.presentation.identity

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.foodnova.delivery.auth.presentation.FieldError
import com.foodnova.delivery.kyc.domain.VerificationStatus
import com.foodnova.delivery.kyc.presentation.verification.VerificationViewModel
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaStatusMark
import com.foodnova.delivery.ui.components.FoodNovaTextField

@Composable
fun NinEntryScreen(
    viewModel: VerificationViewModel,
    onContinue: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            LinearProgressIndicator(progress = { 0.45f }, modifier = Modifier.fillMaxWidth())
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "National ID check",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Enter the 11-digit NIN linked to your legal identity. FoodNova uses this only for worker activation review.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        FoodNovaStatusMark(label = "ID", color = MaterialTheme.colorScheme.primary)
                        Text("Secure worker verification", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    }
                    FoodNovaTextField(
                        value = state.nin,
                        onValueChange = viewModel::onNinChanged,
                        label = "11-digit NIN",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                    Text(
                        text = "${state.nin.length}/11 digits",
                        style = MaterialTheme.typography.labelLarge,
                        color = if (state.isNinValid) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (state.isNinValid || state.ninVerificationState != VerificationStatus.NotStarted) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            if (state.ninVerificationState == VerificationStatus.Rejected) {
                                MaterialTheme.colorScheme.errorContainer
                            } else {
                                MaterialTheme.colorScheme.primaryContainer
                            },
                            MaterialTheme.shapes.medium
                        )
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    AnimatedVisibility(
                        visible = state.ninVerificationState == VerificationStatus.Approved,
                        enter = fadeIn(tween(180)) + scaleIn(tween(240), initialScale = 0.82f)
                    ) {
                        FoodNovaStatusMark(label = "OK", color = MaterialTheme.colorScheme.primary)
                    }
                    if (state.isVerifyingNin) {
                        CircularProgressIndicator(modifier = Modifier, color = MaterialTheme.colorScheme.primary)
                    } else if (state.ninVerificationState != VerificationStatus.Approved) {
                        FoodNovaStatusMark(
                            label = when (state.ninVerificationState) {
                                VerificationStatus.Rejected -> "!"
                                VerificationStatus.PendingReview -> "MR"
                                else -> "ID"
                            },
                            color = if (state.ninVerificationState == VerificationStatus.Rejected) {
                                MaterialTheme.colorScheme.error
                            } else {
                                MaterialTheme.colorScheme.primary
                            }
                        )
                    }
                    Column {
                        Text(
                            text = state.ninVerificationState.ninStatusTitle(),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = state.ninVerificationMessage ?: "NIN format looks ready for instant verification.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        state.ninConfidenceScore?.let {
                            Text("Confidence ${(it * 100).toInt()}%", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }

            FieldError(text = state.errorMessage)
            Spacer(modifier = Modifier.weight(1f))
            FoodNovaPrimaryButton(
                text = when {
                    state.isVerifyingNin -> "Verifying NIN..."
                    state.ninVerificationState == VerificationStatus.Rejected -> "Retry NIN verification"
                    state.ninVerificationState == VerificationStatus.PendingReview -> "Manual review required"
                    else -> "Verify NIN instantly"
                },
                enabled = state.isNinValid && !state.isVerifyingNin && state.ninVerificationState != VerificationStatus.PendingReview,
                onClick = { viewModel.verifyNin(onContinue) }
            )
            Spacer(modifier = Modifier.height(4.dp))
        }
    }
}

private fun VerificationStatus.ninStatusTitle(): String = when (this) {
    VerificationStatus.InProgress -> "Checking NIN"
    VerificationStatus.Approved -> "NIN verified"
    VerificationStatus.PendingReview -> "Manual review required"
    VerificationStatus.Rejected -> "Verification failed"
    else -> "Ready for instant check"
}
