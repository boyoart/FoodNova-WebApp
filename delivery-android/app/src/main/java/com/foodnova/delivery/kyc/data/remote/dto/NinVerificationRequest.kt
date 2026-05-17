package com.foodnova.delivery.kyc.data.remote.dto

data class NinVerificationRequest(
    val nin: String,
    val consent: Boolean = true
)
