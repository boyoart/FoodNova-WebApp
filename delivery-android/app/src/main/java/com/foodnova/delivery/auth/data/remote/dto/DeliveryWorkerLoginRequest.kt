package com.foodnova.delivery.auth.data.remote.dto

import com.google.gson.annotations.SerializedName

data class DeliveryWorkerLoginRequest(
    @SerializedName("phone_number")
    val phoneNumber: String,
    val password: String
)
