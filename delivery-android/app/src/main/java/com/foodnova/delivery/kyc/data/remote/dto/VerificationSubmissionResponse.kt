package com.foodnova.delivery.kyc.data.remote.dto

import com.google.gson.annotations.SerializedName

data class VerificationSubmissionResponse(
    val status: String?,
    @SerializedName("pending_review")
    val pendingReview: Boolean = true,
    val message: String?,
    val verification: VerificationStatusResponse? = null,
    @SerializedName("auto_activated")
    val autoActivated: Boolean = false
)
