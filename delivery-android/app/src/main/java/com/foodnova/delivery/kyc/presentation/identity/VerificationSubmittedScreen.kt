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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaStatusMark

@Composable
fun VerificationSubmittedScreen(onDone: () -> Unit) {
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
                    FoodNovaStatusMark(label = "OK", color = MaterialTheme.colorScheme.primary)
                    Text("Identity submitted", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                    Text(
                        "FoodNova operations will review your NIN and selfie. You can keep using the dashboard while delivery actions remain locked.",
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
            }

            ReviewStep("PR", "Pending review", "Most identity checks are reviewed by operations before activation.")
            ReviewStep("L", "Operations locked", "Go Online, delivery offers, and earnings activation unlock only after approval.")

            Spacer(modifier = Modifier.weight(1f))
            FoodNovaPrimaryButton(
                text = "Back to operations hub",
                onClick = onDone
            )
            Spacer(modifier = Modifier.height(4.dp))
        }
    }
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
