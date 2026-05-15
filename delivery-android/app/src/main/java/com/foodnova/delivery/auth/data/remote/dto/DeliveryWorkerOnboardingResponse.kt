package com.foodnova.delivery.auth.data.remote.dto

import com.google.gson.annotations.SerializedName

data class DeliveryWorkerOnboardingResponse(
    @SerializedName("worker_id")
    val workerId: String?,
    val status: String?,
    val message: String?
)
