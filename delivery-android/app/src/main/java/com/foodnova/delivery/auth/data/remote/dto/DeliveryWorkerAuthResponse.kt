package com.foodnova.delivery.auth.data.remote.dto

import com.google.gson.annotations.SerializedName

data class DeliveryWorkerAuthResponse(
    @SerializedName("worker_id")
    val workerId: String?,
    @SerializedName("access_token")
    val accessToken: String?,
    @SerializedName("requires_verification")
    val requiresVerification: Boolean = true,
    @SerializedName("approval_status")
    val approvalStatus: String? = null,
    val message: String?
)
