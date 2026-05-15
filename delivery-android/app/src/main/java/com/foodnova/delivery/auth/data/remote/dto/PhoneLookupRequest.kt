package com.foodnova.delivery.auth.data.remote.dto

import com.google.gson.annotations.SerializedName

data class PhoneLookupRequest(
    @SerializedName("phone_number")
    val phoneNumber: String
)
