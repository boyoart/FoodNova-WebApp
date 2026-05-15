package com.foodnova.delivery.auth.presentation

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.foodnova.delivery.core.WorkerType
import com.foodnova.delivery.auth.presentation.onboarding.OnboardingViewModel
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaScreen
import com.foodnova.delivery.ui.components.FoodNovaTextField

@Composable
fun RegistrationScreen(
    onBackToLogin: () -> Unit,
    onRegistered: () -> Unit,
    viewModel: OnboardingViewModel
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    FoodNovaScreen(
        title = "Quick signup",
        subtitle = "Finish setup for ${state.formattedPhoneNumber}."
    ) {
        FoodNovaTextField(
            value = state.fullName,
            onValueChange = viewModel::onFullNameChanged,
            label = "Full name"
        )
        FieldError(text = state.errors.fullName)
        Spacer(modifier = Modifier.height(14.dp))

        FoodNovaTextField(
            value = state.password,
            onValueChange = viewModel::onPasswordChanged,
            label = "Password",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            visualTransformation = PasswordVisualTransformation()
        )
        FieldError(text = state.errors.password)
        Spacer(modifier = Modifier.height(18.dp))

        Row {
            FilterChip(
                selected = state.workerType == WorkerType.RIDER,
                onClick = { viewModel.onWorkerTypeChanged(WorkerType.RIDER) },
                label = { Text("Rider") }
            )
            Spacer(modifier = Modifier.width(12.dp))
            FilterChip(
                selected = state.workerType == WorkerType.MESSENGER,
                onClick = { viewModel.onWorkerTypeChanged(WorkerType.MESSENGER) },
                label = { Text("Messenger") }
            )
        }
        Spacer(modifier = Modifier.height(22.dp))
        FieldError(text = state.errorMessage)
        FoodNovaPrimaryButton(
            text = if (state.isLoading) "Creating account..." else "Continue",
            onClick = { viewModel.register(onRegistered) },
            enabled = state.isQuickSignupValid && !state.isLoading
        )
        TextButton(onClick = onBackToLogin) {
            Text(text = "Back to sign in")
        }
    }
}
