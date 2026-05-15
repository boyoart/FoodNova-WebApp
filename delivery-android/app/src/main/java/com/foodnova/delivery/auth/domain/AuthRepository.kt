package com.foodnova.delivery.auth.domain

import com.foodnova.delivery.auth.data.remote.dto.DeliveryWorkerAuthResponse
import com.foodnova.delivery.auth.data.remote.dto.DeliveryWorkerLoginRequest
import com.foodnova.delivery.auth.data.remote.dto.DeliveryWorkerOnboardingRequest
import com.foodnova.delivery.auth.data.remote.dto.DeliveryMeResponse
import com.foodnova.delivery.auth.data.remote.dto.PhoneLookupRequest
import com.foodnova.delivery.auth.data.remote.dto.PhoneLookupResponse
import com.foodnova.delivery.core.AppResult

interface AuthRepository {
    suspend fun restoreSession(): AppResult<WorkerSession?>
    suspend fun lookupPhone(request: PhoneLookupRequest): AppResult<PhoneLookupResponse>
    suspend fun login(request: DeliveryWorkerLoginRequest): AppResult<DeliveryWorkerAuthResponse>
    suspend fun quickSignup(request: DeliveryWorkerOnboardingRequest): AppResult<DeliveryWorkerAuthResponse>
    suspend fun me(): AppResult<DeliveryMeResponse>
}

data class WorkerSession(
    val workerId: String,
    val accessToken: String
)
