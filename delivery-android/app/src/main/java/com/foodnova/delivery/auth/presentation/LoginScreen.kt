package com.foodnova.delivery.auth.presentation

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.foodnova.delivery.auth.presentation.onboarding.OnboardingViewModel
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaScreen
import com.foodnova.delivery.ui.components.FoodNovaTextField

@Composable
fun LoginScreen(
    viewModel: OnboardingViewModel,
    onCreateAccount: () -> Unit,
    onAuthenticated: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    FoodNovaScreen(
        title = "Welcome back",
        subtitle = "Sign in with ${state.formattedPhoneNumber}."
    ) {
        FoodNovaTextField(
            value = state.password,
            onValueChange = viewModel::onPasswordChanged,
            label = "Password",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            visualTransformation = PasswordVisualTransformation()
        )
        FieldError(text = state.errors.password)
        FieldError(text = state.errorMessage)
        Spacer(modifier = Modifier.height(22.dp))
        FoodNovaPrimaryButton(
            text = if (state.isLoading) "Signing in..." else "Sign in",
            enabled = state.isLoginValid && !state.isLoading,
            onClick = { viewModel.login(onAuthenticated) }
        )
        TextButton(onClick = onCreateAccount) {
            Text(text = "Create delivery account")
        }
    }
}
