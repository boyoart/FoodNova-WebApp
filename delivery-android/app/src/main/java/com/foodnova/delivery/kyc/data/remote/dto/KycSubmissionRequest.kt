package com.foodnova.delivery.kyc.data.remote.dto

import com.google.gson.annotations.SerializedName

data class KycSubmissionRequest(
    val nin: String?,
    @SerializedName("selfie_uri")
    val selfieUri: String?
)
