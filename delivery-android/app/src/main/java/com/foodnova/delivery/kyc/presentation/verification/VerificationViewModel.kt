package com.foodnova.delivery.kyc.presentation.verification

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.foodnova.delivery.core.AppResult
import com.foodnova.delivery.kyc.data.remote.dto.AddressVerificationRequest
import com.foodnova.delivery.kyc.data.remote.dto.EmergencyContactRequest
import com.foodnova.delivery.kyc.data.remote.dto.KycSubmissionRequest
import com.foodnova.delivery.kyc.data.remote.dto.NinVerificationRequest
import com.foodnova.delivery.kyc.data.remote.dto.VerificationStatusResponse
import com.foodnova.delivery.kyc.domain.AddressDocumentType
import com.foodnova.delivery.kyc.domain.EmergencyRelationship
import com.foodnova.delivery.kyc.domain.KycRepository
import com.foodnova.delivery.kyc.domain.VerificationProgress
import com.foodnova.delivery.kyc.domain.VerificationStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class VerificationViewModel @Inject constructor(
    private val kycRepository: KycRepository
) : ViewModel() {
    private val _state = MutableStateFlow(VerificationUiState())
    val state: StateFlow<VerificationUiState> = _state.asStateFlow()

    fun refreshVerificationStatus() {
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = kycRepository.verificationStatus()) {
                is AppResult.Success -> _state.update {
                    it.copy(
                        isLoading = false,
                        progress = VerificationProgress(
                            identityStatus = result.value.identityStatus.toVerificationStatus(),
                            addressStatus = result.value.addressStatus.toVerificationStatus(),
                            emergencyContactStatus = result.value.emergencyContactStatus.toVerificationStatus(),
                            adminApprovalStatus = result.value.adminApprovalStatus.toVerificationStatus()
                        )
                    )
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isLoading = false, errorMessage = result.message)
                }
            }
        }
    }

    fun onAddressDocumentTypeChanged(value: AddressDocumentType) {
        _state.update { it.copy(addressDocumentType = value) }
    }

    fun onAddressDocumentSelected(uri: String, name: String, contentType: String?) {
        _state.update {
            it.copy(
                addressDocumentUri = uri,
                addressDocumentName = name,
                addressDocumentContentType = contentType,
                progress = it.progress.copy(addressStatus = VerificationStatus.InProgress)
            )
        }
    }

    fun onNinChanged(value: String) {
        _state.update {
            it.copy(
                nin = value.filter(Char::isDigit).take(11),
                ninVerificationState = VerificationStatus.NotStarted,
                ninVerificationMessage = null,
                ninConfidenceScore = null
            )
        }
    }

    fun verifyNin(onVerified: () -> Unit) {
        val current = _state.value
        if (!current.isNinValid || current.isVerifyingNin) return
        _state.update {
            it.copy(
                isVerifyingNin = true,
                errorMessage = null,
                ninVerificationState = VerificationStatus.InProgress,
                ninVerificationMessage = "Checking NIN..."
            )
        }
        viewModelScope.launch {
            when (val result = kycRepository.verifyNin(NinVerificationRequest(nin = current.nin))) {
                is AppResult.Success -> {
                    val response = result.value
                    val status = response.status.toVerificationStatus()
                    val progress = response.verification?.toProgress() ?: _state.value.progress.copy(identityStatus = status)
                    _state.update {
                        it.copy(
                            isVerifyingNin = false,
                            ninVerificationState = status,
                            ninVerificationMessage = response.message,
                            ninConfidenceScore = response.confidenceScore,
                            progress = progress
                        )
                    }
                    if (status == VerificationStatus.Approved) onVerified()
                }
                is AppResult.Failure -> _state.update {
                    it.copy(
                        isVerifyingNin = false,
                        ninVerificationState = VerificationStatus.Rejected,
                        ninVerificationMessage = result.message,
                        errorMessage = result.message
                    )
                }
            }
        }
    }

    fun onSelfieCaptured(reference: String, fileName: String, contentType: String = "image/jpeg") {
        _state.update {
            it.copy(
                selfieReference = reference,
                selfieFileName = fileName,
                selfieContentType = contentType,
                errorMessage = null,
                progress = it.progress.copy(identityStatus = VerificationStatus.InProgress)
            )
        }
    }

    fun retakeSelfie() {
        _state.update {
            it.copy(
                selfieReference = "",
                selfieFileName = "",
                selfieContentType = "image/jpeg",
                errorMessage = null
            )
        }
    }

    fun submitIdentityVerification(onSubmitted: () -> Unit) {
        val current = _state.value
        if (!current.isIdentityReady) return
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            val request = KycSubmissionRequest(
                nin = current.nin,
                selfieFileName = current.selfieFileName,
                selfieContentType = current.selfieContentType,
                localSelfieUri = current.selfieReference
            )
            when (val result = kycRepository.submitKyc(request)) {
                is AppResult.Success -> {
                    _state.update {
                        it.copy(
                            isLoading = false,
                            progress = result.value.verification?.toProgress()
                                ?: it.progress.copy(identityStatus = VerificationStatus.PendingReview)
                        )
                    }
                    onSubmitted()
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isLoading = false, errorMessage = result.message)
                }
            }
        }
    }

    private fun buildAddressRequestOrNull(): AddressVerificationRequest? {
        val current = _state.value
        if (!current.isAddressReady) return null

        return AddressVerificationRequest(
            documentType = current.addressDocumentType.name,
            fileName = current.addressDocumentName,
            contentType = current.addressDocumentContentType,
            localUri = current.addressDocumentUri
        )
    }

    fun submitAddressDocument(onSubmitted: () -> Unit) {
        val request = buildAddressRequestOrNull() ?: return
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = kycRepository.submitAddressDocument(request)) {
                is AppResult.Success -> {
                    _state.update {
                        it.copy(
                            isLoading = false,
                            progress = result.value.verification?.toProgress()
                                ?: it.progress.copy(addressStatus = VerificationStatus.Submitted)
                        )
                    }
                    onSubmitted()
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isLoading = false, errorMessage = result.message)
                }
            }
        }
    }

    fun onEmergencyFullNameChanged(value: String) {
        _state.update { it.copy(emergencyFullName = value).validated() }
    }

    fun onEmergencyRelationshipChanged(value: EmergencyRelationship) {
        _state.update { it.copy(emergencyRelationship = value).validated() }
    }

    fun onEmergencyPhoneChanged(value: String) {
        _state.update { it.copy(emergencyPhone = value.filter(Char::isDigit).take(11)).validated() }
    }

    fun onEmergencyAlternatePhoneChanged(value: String) {
        _state.update { it.copy(emergencyAlternatePhone = value.filter(Char::isDigit).take(11)).validated() }
    }

    private fun buildEmergencyContactRequestOrNull(): EmergencyContactRequest? {
        val current = _state.value.validated()
        _state.value = current
        if (!current.isEmergencyContactReady) return null

        return EmergencyContactRequest(
            fullName = current.emergencyFullName.trim(),
            relationship = current.emergencyRelationship.name,
            phoneNumber = current.emergencyPhone,
            alternatePhone = current.emergencyAlternatePhone.ifBlank { null }
        )
    }

    fun submitEmergencyContact(onSubmitted: () -> Unit) {
        val request = buildEmergencyContactRequestOrNull() ?: return
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = kycRepository.submitEmergencyContact(request)) {
                is AppResult.Success -> {
                    _state.update {
                        it.copy(
                            isLoading = false,
                            progress = result.value.verification?.toProgress()
                                ?: it.progress.copy(emergencyContactStatus = VerificationStatus.Submitted)
                        )
                    }
                    onSubmitted()
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isLoading = false, errorMessage = result.message)
                }
            }
        }
    }

    private fun VerificationUiState.validated(): VerificationUiState {
        val alternateDigits = emergencyAlternatePhone.filter(Char::isDigit)
        return copy(
            errors = VerificationErrors(
                emergencyFullName = when {
                    emergencyFullName.isBlank() -> "Full name is required."
                    emergencyFullName.trim().length < 2 -> "Enter the contact's full name."
                    else -> null
                },
                emergencyPhone = when {
                    emergencyPhone.isBlank() -> "Phone number is required."
                    emergencyPhone.filter(Char::isDigit).length < 10 -> "Enter a valid phone number."
                    else -> null
                },
                emergencyAlternatePhone = when {
                    emergencyAlternatePhone.isBlank() -> null
                    alternateDigits.length < 10 -> "Enter a valid alternate phone number."
                    else -> null
                }
            )
        )
    }
}

private fun VerificationStatusResponse.toProgress(): VerificationProgress = VerificationProgress(
    identityStatus = identityStatus.toVerificationStatus(),
    addressStatus = addressStatus.toVerificationStatus(),
    emergencyContactStatus = emergencyContactStatus.toVerificationStatus(),
    adminApprovalStatus = adminApprovalStatus.toVerificationStatus()
)

private fun String?.toVerificationStatus(): VerificationStatus = when (this?.lowercase()) {
    "pending", "in_progress", "in-progress", "progress" -> VerificationStatus.InProgress
    "submitted", "submitted_for_review", "completed" -> VerificationStatus.Submitted
    "manual_review", "pending_review", "pending-review" -> VerificationStatus.PendingReview
    "verified", "approved" -> VerificationStatus.Approved
    "failed", "rejected" -> VerificationStatus.Rejected
    else -> VerificationStatus.NotStarted
}
