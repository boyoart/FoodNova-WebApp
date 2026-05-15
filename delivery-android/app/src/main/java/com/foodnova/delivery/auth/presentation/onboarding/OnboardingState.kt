package com.foodnova.delivery.auth.presentation.onboarding

import com.foodnova.delivery.core.WorkerType

data class OnboardingState(
    val countryCode: String = "+234",
    val phoneNumber: String = "",
    val fullName: String = "",
    val password: String = "",
    val workerType: WorkerType = WorkerType.RIDER,
    val lookupResult: PhoneLookupResult? = null,
    val verificationState: VerificationRequiredState = VerificationRequiredState.NotStarted,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val errors: OnboardingErrors = OnboardingErrors()
) {
    val formattedPhoneNumber: String
        get() = NigerianPhoneFormatter.format(countryCode, phoneNumber)

    val isPhoneValid: Boolean
        get() = NigerianPhoneFormatter.isValid(countryCode, phoneNumber) && errors.phoneNumber == null

    val isLoginValid: Boolean
        get() = isPhoneValid && password.length >= 8 && errors.password == null

    val isQuickSignupValid: Boolean
        get() = isPhoneValid &&
            fullName.trim().length >= 2 &&
            password.length >= 8 &&
            errors.fullName == null &&
            errors.password == null
}

data class OnboardingErrors(
    val fullName: String? = null,
    val phoneNumber: String? = null,
    val password: String? = null
)

enum class PhoneLookupResult {
    ExistingUser,
    NewUser
}

enum class VerificationRequiredState {
    NotStarted,
    Required,
    Submitted,
    Approved
}
