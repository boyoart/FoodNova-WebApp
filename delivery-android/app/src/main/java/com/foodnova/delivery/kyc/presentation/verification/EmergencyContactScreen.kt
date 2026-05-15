package com.foodnova.delivery.kyc.presentation.verification

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.foodnova.delivery.auth.presentation.FieldError
import com.foodnova.delivery.kyc.domain.EmergencyRelationship
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaScreen
import com.foodnova.delivery.ui.components.FoodNovaTextField

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmergencyContactScreen(
    viewModel: VerificationViewModel,
    onSubmitted: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var expanded by remember { mutableStateOf(false) }

    FoodNovaScreen(
        title = "Emergency contact",
        subtitle = "Add someone FoodNova can contact if urgent support is needed."
    ) {
        FoodNovaTextField(
            value = state.emergencyFullName,
            onValueChange = viewModel::onEmergencyFullNameChanged,
            label = "Full name"
        )
        FieldError(text = state.errors.emergencyFullName)
        Spacer(modifier = Modifier.height(14.dp))
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded }
        ) {
            OutlinedTextField(
                value = state.emergencyRelationship.label,
                onValueChange = {},
                readOnly = true,
                label = { Text("Relationship") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                modifier = Modifier.menuAnchor()
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                EmergencyRelationship.entries.forEach { relationship ->
                    DropdownMenuItem(
                        text = { Text(relationship.label) },
                        onClick = {
                            viewModel.onEmergencyRelationshipChanged(relationship)
                            expanded = false
                        }
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(14.dp))
        FoodNovaTextField(
            value = state.emergencyPhone,
            onValueChange = viewModel::onEmergencyPhoneChanged,
            label = "Phone number",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone)
        )
        FieldError(text = state.errors.emergencyPhone)
        Spacer(modifier = Modifier.height(14.dp))
        FoodNovaTextField(
            value = state.emergencyAlternatePhone,
            onValueChange = viewModel::onEmergencyAlternatePhoneChanged,
            label = "Alternate phone (optional)",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone)
        )
        FieldError(text = state.errors.emergencyAlternatePhone)
        Spacer(modifier = Modifier.height(22.dp))
        FieldError(text = state.errorMessage)
        FoodNovaPrimaryButton(
            text = if (state.isLoading) "Saving..." else "Save contact",
            enabled = state.isEmergencyContactReady && !state.isLoading,
            onClick = { viewModel.submitEmergencyContact(onSubmitted) }
        )
    }
}
