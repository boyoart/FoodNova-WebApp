package com.foodnova.delivery.kyc.domain

import com.foodnova.delivery.core.AppResult
import com.foodnova.delivery.kyc.data.remote.dto.AddressVerificationRequest
import com.foodnova.delivery.kyc.data.remote.dto.EmergencyContactRequest
import com.foodnova.delivery.kyc.data.remote.dto.KycSubmissionRequest
import com.foodnova.delivery.kyc.data.remote.dto.NinVerificationRequest
import com.foodnova.delivery.kyc.data.remote.dto.NinVerificationResponse
import com.foodnova.delivery.kyc.data.remote.dto.VerificationStatusResponse
import com.foodnova.delivery.kyc.data.remote.dto.VerificationSubmissionResponse

interface KycRepository {
    suspend fun verificationStatus(): AppResult<VerificationStatusResponse>
    suspend fun verifyNin(request: NinVerificationRequest): AppResult<NinVerificationResponse>
    suspend fun submitKyc(request: KycSubmissionRequest): AppResult<VerificationSubmissionResponse>
    suspend fun submitAddressDocument(request: AddressVerificationRequest): AppResult<VerificationSubmissionResponse>
    suspend fun submitEmergencyContact(request: EmergencyContactRequest): AppResult<VerificationSubmissionResponse>
}
