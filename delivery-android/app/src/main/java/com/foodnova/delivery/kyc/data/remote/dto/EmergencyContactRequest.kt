package com.foodnova.delivery.kyc.data.remote.dto

import com.google.gson.annotations.SerializedName

data class EmergencyContactRequest(
    @SerializedName("full_name")
    val fullName: String,
    val relationship: String,
    @SerializedName("phone_number")
    val phoneNumber: String,
    @SerializedName("alternate_phone")
    val alternatePhone: String?
)
