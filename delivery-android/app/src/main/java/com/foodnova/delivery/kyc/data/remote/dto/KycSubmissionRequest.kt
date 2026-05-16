package com.foodnova.delivery.kyc.data.remote.dto

data class KycSubmissionRequest(
    val nin: String,
    val selfieFileName: String,
    val selfieContentType: String = "image/jpeg",
    val localSelfieUri: String
)
