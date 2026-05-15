package com.foodnova.delivery.kyc.presentation.identity

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.foodnova.delivery.auth.presentation.FieldError
import com.foodnova.delivery.kyc.presentation.verification.VerificationViewModel
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaScreen

@Composable
fun SelfieCaptureScreen(
    viewModel: VerificationViewModel,
    onSubmitted: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        if (bitmap != null) {
            viewModel.onSelfieCaptured("selfie-preview-captured")
        }
    }

    FoodNovaScreen(
        title = "Selfie check",
        subtitle = "Take a clear selfie for identity review."
    ) {
        Text(
            text = if (state.selfieReference.isBlank()) {
                "No selfie captured yet."
            } else {
                "Selfie captured and ready to submit."
            }
        )
        Spacer(modifier = Modifier.height(18.dp))
        FoodNovaPrimaryButton(
            text = "Capture selfie",
            onClick = { camera.launch(null) }
        )
        Spacer(modifier = Modifier.height(12.dp))
        FieldError(text = state.errorMessage)
        FoodNovaPrimaryButton(
            text = if (state.isLoading) "Submitting..." else "Submit verification",
            enabled = state.isIdentityReady && !state.isLoading,
            onClick = { viewModel.submitIdentityVerification(onSubmitted) }
        )
    }
}
