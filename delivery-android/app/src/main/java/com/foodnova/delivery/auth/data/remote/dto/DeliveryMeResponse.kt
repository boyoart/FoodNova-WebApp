package com.foodnova.delivery.auth.data.remote.dto

import com.google.gson.annotations.SerializedName

data class DeliveryMeResponse(
    @SerializedName("worker_id")
    val workerId: String?,
    @SerializedName("full_name")
    val fullName: String?,
    @SerializedName("phone_number")
    val phoneNumber: String?,
    @SerializedName("worker_type")
    val workerType: String?,
    @SerializedName("approval_status")
    val approvalStatus: String?,
    @SerializedName("kyc_status")
    val kycStatus: String?
)
