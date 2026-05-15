package com.foodnova.delivery.auth.data.remote.dto

import com.google.gson.annotations.SerializedName

data class PhoneLookupResponse(
    @SerializedName("exists")
    val exists: Boolean,
    @SerializedName("phone_number")
    val phoneNumber: String? = null,
    @SerializedName("requires_verification")
    val requiresVerification: Boolean = true,
    @SerializedName("approval_status")
    val approvalStatus: String? = null
)
