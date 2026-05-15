package com.foodnova.delivery.kyc.data.remote.dto

import com.google.gson.annotations.SerializedName

data class VerificationStatusResponse(
    @SerializedName("identity_status")
    val identityStatus: String?,
    @SerializedName("address_status")
    val addressStatus: String?,
    @SerializedName("emergency_contact_status")
    val emergencyContactStatus: String?,
    @SerializedName("admin_approval_status")
    val adminApprovalStatus: String?
)
