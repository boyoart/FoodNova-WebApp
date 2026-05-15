package com.foodnova.delivery.auth.presentation.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.foodnova.delivery.auth.data.remote.dto.DeliveryWorkerLoginRequest
import com.foodnova.delivery.auth.data.remote.dto.DeliveryWorkerOnboardingRequest
import com.foodnova.delivery.auth.data.remote.dto.PhoneLookupRequest
import com.foodnova.delivery.auth.domain.AuthRepository
import com.foodnova.delivery.core.AppResult
import com.foodnova.delivery.core.WorkerType
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {
    private val _state = MutableStateFlow(OnboardingState())
    val state: StateFlow<OnboardingState> = _state.asStateFlow()

    fun onFullNameChanged(value: String) {
        _state.update { it.copy(fullName = value).validated() }
    }

    fun onCountryCodeChanged(value: String) {
        _state.update { it.copy(countryCode = value).validated() }
    }

    fun onPhoneNumberChanged(value: String) {
        _state.update {
            it.copy(
                phoneNumber = NigerianPhoneFormatter.normalizeNationalNumber(value),
                lookupResult = null
            ).validated()
        }
    }

    fun onPasswordChanged(value: String) {
        _state.update { it.copy(password = value).validated() }
    }

    fun onWorkerTypeChanged(value: WorkerType) {
        _state.update { it.copy(workerType = value).validated() }
    }

    fun buildPhoneLookupRequestOrNull(): PhoneLookupRequest? {
        val current = _state.value.validated()
        _state.value = current
        if (!current.isPhoneValid) return null

        return PhoneLookupRequest(phoneNumber = current.formattedPhoneNumber)
    }

    fun onPhoneLookupCompleted(result: PhoneLookupResult) {
        _state.update { it.copy(lookupResult = result) }
    }

    fun lookupPhone(onExistingUser: () -> Unit, onNewUser: () -> Unit) {
        val request = buildPhoneLookupRequestOrNull() ?: return
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = authRepository.lookupPhone(request)) {
                is AppResult.Success -> {
                    val lookup = if (result.value.exists) PhoneLookupResult.ExistingUser else PhoneLookupResult.NewUser
                    _state.update { it.copy(isLoading = false, lookupResult = lookup) }
                    if (lookup == PhoneLookupResult.ExistingUser) onExistingUser() else onNewUser()
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isLoading = false, errorMessage = result.message)
                }
            }
        }
    }

    fun buildRequestOrNull(): DeliveryWorkerOnboardingRequest? {
        val current = _state.value.validated()
        _state.value = current
        if (!current.isQuickSignupValid) return null

        return DeliveryWorkerOnboardingRequest(
            fullName = current.fullName.trim(),
            countryCode = current.countryCode,
            phoneNumber = current.formattedPhoneNumber,
            password = current.password,
            workerType = current.workerType.name.lowercase()
        )
    }

    fun buildLoginRequestOrNull(): DeliveryWorkerLoginRequest? {
        val current = _state.value.validated()
        _state.value = current
        if (!current.isLoginValid) return null

        return DeliveryWorkerLoginRequest(
            phoneNumber = current.formattedPhoneNumber,
            password = current.password
        )
    }

    fun login(onAuthenticated: () -> Unit) {
        val request = buildLoginRequestOrNull() ?: return
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = authRepository.login(request)) {
                is AppResult.Success -> {
                    _state.update {
                        it.copy(
                            isLoading = false,
                            verificationState = if (result.value.requiresVerification) {
                                VerificationRequiredState.Required
                            } else {
                                VerificationRequiredState.Approved
                            }
                        )
                    }
                    onAuthenticated()
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isLoading = false, errorMessage = result.message)
                }
            }
        }
    }

    fun register(onAuthenticated: () -> Unit) {
        val request = buildRequestOrNull() ?: return
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = authRepository.quickSignup(request)) {
                is AppResult.Success -> {
                    _state.update {
                        it.copy(
                            isLoading = false,
                            verificationState = if (result.value.requiresVerification) {
                                VerificationRequiredState.Required
                            } else {
                                VerificationRequiredState.Approved
                            }
                        )
                    }
                    onAuthenticated()
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isLoading = false, errorMessage = result.message)
                }
            }
        }
    }

    fun markVerificationRequired() {
        _state.update { it.copy(verificationState = VerificationRequiredState.Required) }
    }

    private fun OnboardingState.validated(): OnboardingState {
        val trimmedName = fullName.trim()
        val nextErrors = OnboardingErrors(
            fullName = when {
                trimmedName.isBlank() -> "Full name is required."
                trimmedName.length < 2 -> "Enter your full name."
                else -> null
            },
            phoneNumber = when {
                phoneNumber.isBlank() -> "Phone number is required."
                !NigerianPhoneFormatter.isValid(countryCode, phoneNumber) -> "Enter a valid Nigerian phone number."
                else -> null
            },
            password = when {
                password.isBlank() -> "Password is required."
                password.length < 8 -> "Password must be at least 8 characters."
                else -> null
            }
        )
        return copy(errors = nextErrors)
    }
}
