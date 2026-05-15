package com.foodnova.delivery.kyc.data.remote.dto

import com.google.gson.annotations.SerializedName

data class AddressVerificationRequest(
    @SerializedName("document_type")
    val documentType: String,
    @SerializedName("file_name")
    val fileName: String,
    @SerializedName("content_type")
    val contentType: String?,
    @SerializedName("local_uri")
    val localUri: String
)
