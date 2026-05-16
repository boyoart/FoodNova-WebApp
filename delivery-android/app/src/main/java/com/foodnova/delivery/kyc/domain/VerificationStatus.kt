package com.foodnova.delivery.kyc.domain

enum class VerificationStatus {
    NotStarted,
    InProgress,
    Submitted,
    PendingReview,
    Approved,
    Rejected
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
        get() = identityStatus == VerificationStatus.Approved &&
            addressStatus == VerificationStatus.Approved &&
            emergencyContactStatus == VerificationStatus.Approved &&
            adminApprovalStatus == VerificationStatus.Approved
}
