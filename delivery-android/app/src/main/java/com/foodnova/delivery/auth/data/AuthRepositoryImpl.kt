package com.foodnova.delivery.auth.data

import com.foodnova.delivery.auth.data.remote.dto.DeliveryMeResponse
import com.foodnova.delivery.auth.data.remote.dto.DeliveryWorkerAuthResponse
import com.foodnova.delivery.auth.data.remote.dto.DeliveryWorkerLoginRequest
import com.foodnova.delivery.auth.data.remote.dto.DeliveryWorkerOnboardingRequest
import com.foodnova.delivery.auth.data.remote.dto.PhoneLookupRequest
import com.foodnova.delivery.auth.data.remote.dto.PhoneLookupResponse
import com.foodnova.delivery.auth.domain.AuthRepository
import com.foodnova.delivery.auth.domain.WorkerSession
import com.foodnova.delivery.core.AppResult
import com.foodnova.delivery.core.session.SessionManager
import com.foodnova.delivery.core.toAppResult
import com.foodnova.delivery.network.FoodNovaDeliveryApi
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val api: FoodNovaDeliveryApi,
    private val sessionManager: SessionManager
) : AuthRepository {
    override suspend fun restoreSession(): AppResult<WorkerSession?> = runCatching {
        val session = sessionManager.sessionValue()
        session.accessToken?.let { WorkerSession(workerId = session.workerId.orEmpty(), accessToken = it) }
    }.toAppResult()

    override suspend fun lookupPhone(request: PhoneLookupRequest): AppResult<PhoneLookupResponse> =
        runCatching { api.lookupDeliveryWorkerPhone(request) }.toAppResult()

    override suspend fun login(request: DeliveryWorkerLoginRequest): AppResult<DeliveryWorkerAuthResponse> =
        runCatching {
            api.loginDeliveryWorker(request).also { response ->
                response.accessToken?.let { sessionManager.saveSession(it, response.workerId) }
            }
        }.toAppResult()

    override suspend fun quickSignup(request: DeliveryWorkerOnboardingRequest): AppResult<DeliveryWorkerAuthResponse> =
        runCatching {
            api.registerDeliveryWorker(request).also { response ->
                response.accessToken?.let { sessionManager.saveSession(it, response.workerId) }
            }
        }.toAppResult()

    override suspend fun me(): AppResult<DeliveryMeResponse> =
        runCatching { api.getMe() }.toAppResult()
}
