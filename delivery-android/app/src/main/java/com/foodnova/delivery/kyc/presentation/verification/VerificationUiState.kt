package com.foodnova.delivery.kyc.presentation.verification

import com.foodnova.delivery.kyc.domain.AddressDocumentType
import com.foodnova.delivery.kyc.domain.EmergencyRelationship
import com.foodnova.delivery.kyc.domain.VerificationProgress

data class VerificationUiState(
    val progress: VerificationProgress = VerificationProgress(),
    val addressDocumentType: AddressDocumentType = AddressDocumentType.UtilityBill,
    val addressDocumentUri: String = "",
    val addressDocumentName: String = "",
    val addressDocumentContentType: String? = null,
    val nin: String = "",
    val selfieReference: String = "",
    val selfieFileName: String = "",
    val selfieContentType: String = "image/jpeg",
    val ninVerificationState: VerificationStatus = VerificationStatus.NotStarted,
    val ninVerificationMessage: String? = null,
    val ninConfidenceScore: Double? = null,
    val isVerifyingNin: Boolean = false,
    val emergencyFullName: String = "",
    val emergencyRelationship: EmergencyRelationship = EmergencyRelationship.Parent,
    val emergencyPhone: String = "",
    val emergencyAlternatePhone: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val errors: VerificationErrors = VerificationErrors()
) {
    val isNinValid: Boolean
        get() = nin.length == 11

    val isAddressReady: Boolean
        get() = addressDocumentUri.isNotBlank() && addressDocumentName.isNotBlank()

    val isIdentityReady: Boolean
        get() = isNinValid && selfieReference.isNotBlank() && selfieFileName.isNotBlank()

    val isEmergencyContactReady: Boolean
        get() = errors == VerificationErrors() &&
            emergencyFullName.trim().length >= 2 &&
            emergencyPhone.filter(Char::isDigit).length >= 10
}

data class VerificationErrors(
    val emergencyFullName: String? = null,
    val emergencyPhone: String? = null,
    val emergencyAlternatePhone: String? = null
)
