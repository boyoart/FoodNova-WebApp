package com.foodnova.delivery.auth.data.remote.dto

import com.google.gson.annotations.SerializedName

data class DeliveryWorkerOnboardingRequest(
    @SerializedName("full_name")
    val fullName: String,
    @SerializedName("country_code")
    val countryCode: String,
    @SerializedName("phone_number")
    val phoneNumber: String,
    val password: String,
    @SerializedName("worker_type")
    val workerType: String
)
