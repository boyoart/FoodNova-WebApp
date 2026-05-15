package com.foodnova.delivery.auth.presentation

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.foodnova.delivery.auth.presentation.onboarding.OnboardingViewModel
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaScreen
import com.foodnova.delivery.ui.components.FoodNovaTextField

@Composable
fun PhoneEntryScreen(
    viewModel: OnboardingViewModel,
    onExistingUser: () -> Unit,
    onNewUser: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    FoodNovaScreen(
        title = "FoodNova Delivery",
        subtitle = "Enter your phone number to continue."
    ) {
        Row {
            FoodNovaTextField(
                value = state.countryCode,
                onValueChange = viewModel::onCountryCodeChanged,
                label = "Code",
                modifier = Modifier.weight(0.35f),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone)
            )
            Spacer(modifier = Modifier.width(12.dp))
            FoodNovaTextField(
                value = state.phoneNumber,
                onValueChange = viewModel::onPhoneNumberChanged,
                label = "Phone number",
                modifier = Modifier.weight(0.65f),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone)
            )
        }
        FieldError(text = state.errors.phoneNumber)
        FieldError(text = state.errorMessage)
        Spacer(modifier = Modifier.height(22.dp))
        FoodNovaPrimaryButton(
            text = if (state.isLoading) "Checking..." else "Continue",
            enabled = state.isPhoneValid && !state.isLoading,
            onClick = { viewModel.lookupPhone(onExistingUser, onNewUser) }
        )
    }
}
