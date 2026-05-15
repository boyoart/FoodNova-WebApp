package com.foodnova.delivery.kyc.presentation.verification

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.foodnova.delivery.auth.presentation.FieldError
import com.foodnova.delivery.kyc.domain.AddressDocumentType
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaScreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddressVerificationScreen(
    viewModel: VerificationViewModel,
    onSubmitted: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var expanded by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        viewModel.onAddressDocumentSelected(
            uri = uri.toString(),
            name = uri.lastPathSegment ?: "address-document",
            contentType = context.contentResolver.getType(uri)
        )
    }

    FoodNovaScreen(
        title = "Address verification",
        subtitle = "Upload a utility bill, bank statement, internet bill, or water/electricity bill."
    ) {
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded }
        ) {
            OutlinedTextField(
                value = state.addressDocumentType.label,
                onValueChange = {},
                readOnly = true,
                label = { Text("Document type") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                modifier = Modifier.menuAnchor()
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                AddressDocumentType.entries.forEach { type ->
                    DropdownMenuItem(
                        text = { Text(type.label) },
                        onClick = {
                            viewModel.onAddressDocumentTypeChanged(type)
                            expanded = false
                        }
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
        FoodNovaPrimaryButton(
            text = if (state.addressDocumentName.isBlank()) "Choose image or PDF" else state.addressDocumentName,
            onClick = { picker.launch(arrayOf("image/*", "application/pdf")) }
        )
        Spacer(modifier = Modifier.height(22.dp))
        FieldError(text = state.errorMessage)
        FoodNovaPrimaryButton(
            text = if (state.isLoading) "Submitting..." else "Submit for review",
            enabled = state.isAddressReady && !state.isLoading,
            onClick = { viewModel.submitAddressDocument(onSubmitted) }
        )
    }
}
