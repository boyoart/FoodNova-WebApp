package com.foodnova.delivery.kyc.data.remote.dto

import com.google.gson.annotations.SerializedName

data class NinVerificationResponse(
    val success: Boolean = false,
    val verified: Boolean = false,
    val status: String? = null,
    val message: String? = null,
    @SerializedName("error_code")
    val errorCode: String? = null,
    val retryable: Boolean = false,
    @SerializedName("manual_review_required")
    val manualReviewRequired: Boolean = false,
    @SerializedName("confidence_score")
    val confidenceScore: Double? = null,
    @SerializedName("auto_activated")
    val autoActivated: Boolean = false,
    val verification: VerificationStatusResponse? = null
)
