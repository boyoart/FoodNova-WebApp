package com.foodnova.delivery.kyc.domain

enum class VerificationStatus {
    NotStarted,
    InProgress,
    Submitted,
    PendingReview,
    Approved,
    Rejected
}

enum class KycStep {
    Identity,
    Address,
    EmergencyContact,
    AdminApproval,
    ActivationComplete
}

data class VerificationProgress(
    val identityStatus: VerificationStatus = VerificationStatus.NotStarted,
    val addressStatus: VerificationStatus = VerificationStatus.NotStarted,
    val emergencyContactStatus: VerificationStatus = VerificationStatus.NotStarted,
    val adminApprovalStatus: VerificationStatus = VerificationStatus.NotStarted
) {
    val completedSteps: Int
        get() = listOf(identityStatus, addressStatus, emergencyContactStatus, adminApprovalStatus)
            .count {
                it == VerificationStatus.Submitted ||
                    it == VerificationStatus.PendingReview ||
                    it == VerificationStatus.Approved
            }

    val totalSteps: Int = 4

    val canActivateDeliveries: Boolean
        get() = adminApprovalStatus == VerificationStatus.Approved

    val nextStep: KycStep
        get() = when {
            !identityStatus.isSubmittedOrApproved -> KycStep.Identity
            !addressStatus.isSubmittedOrApproved -> KycStep.Address
            !emergencyContactStatus.isSubmittedOrApproved -> KycStep.EmergencyContact
            adminApprovalStatus != VerificationStatus.Approved -> KycStep.AdminApproval
            else -> KycStep.ActivationComplete
        }
}

val VerificationStatus.isSubmittedOrApproved: Boolean
    get() = this == VerificationStatus.Submitted ||
        this == VerificationStatus.PendingReview ||
        this == VerificationStatus.Approved

val VerificationStatus.isLockedComplete: Boolean
    get() = isSubmittedOrApproved
