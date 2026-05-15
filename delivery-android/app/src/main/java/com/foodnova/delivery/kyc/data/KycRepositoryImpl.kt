package com.foodnova.delivery.kyc.data

import android.content.Context
import android.net.Uri
import com.foodnova.delivery.core.AppResult
import com.foodnova.delivery.core.toAppResult
import com.foodnova.delivery.kyc.data.remote.dto.AddressVerificationRequest
import com.foodnova.delivery.kyc.data.remote.dto.EmergencyContactRequest
import com.foodnova.delivery.kyc.data.remote.dto.KycSubmissionRequest
import com.foodnova.delivery.kyc.data.remote.dto.VerificationStatusResponse
import com.foodnova.delivery.kyc.data.remote.dto.VerificationSubmissionResponse
import com.foodnova.delivery.network.FoodNovaDeliveryApi
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

@Singleton
class KycRepositoryImpl @Inject constructor(
    private val api: FoodNovaDeliveryApi,
    @ApplicationContext private val context: Context
) : com.foodnova.delivery.kyc.domain.KycRepository {
    override suspend fun verificationStatus(): AppResult<VerificationStatusResponse> =
        runCatching { api.getVerificationStatus() }.toAppResult()

    override suspend fun submitKyc(request: KycSubmissionRequest): AppResult<VerificationSubmissionResponse> =
        runCatching { api.submitKyc(request) }.toAppResult()

    override suspend fun submitAddressDocument(
        request: AddressVerificationRequest
    ): AppResult<VerificationSubmissionResponse> = runCatching {
        val uri = Uri.parse(request.localUri)
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: error("Unable to read selected document.")
        val mediaType = request.contentType?.toMediaTypeOrNull()
        val body = bytes.toRequestBody(mediaType)
        val part = MultipartBody.Part.createFormData("document", request.fileName, body)
        val type = request.documentType.toRequestBody("text/plain".toMediaTypeOrNull())
        api.submitAddressVerification(type, part)
    }.toAppResult()

    override suspend fun submitEmergencyContact(
        request: EmergencyContactRequest
    ): AppResult<VerificationSubmissionResponse> =
        runCatching { api.submitEmergencyContact(request) }.toAppResult()
}
