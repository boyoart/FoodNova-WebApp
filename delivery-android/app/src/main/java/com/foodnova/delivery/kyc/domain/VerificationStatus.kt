package com.foodnova.delivery.kyc.domain

enum class VerificationStatus {
    NotStarted,
    InProgress,
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
            .count { it == VerificationStatus.Approved || it == VerificationStatus.PendingReview }

    val totalSteps: Int = 4

    val canActivateDeliveries: Boolean
        get() = identityStatus == VerificationStatus.Approved &&
            addressStatus == VerificationStatus.Approved &&
            emergencyContactStatus == VerificationStatus.Approved &&
            adminApprovalStatus == VerificationStatus.Approved
}
