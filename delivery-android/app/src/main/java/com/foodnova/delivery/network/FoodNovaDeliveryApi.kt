package com.foodnova.delivery.network

import com.foodnova.delivery.auth.data.remote.dto.DeliveryWorkerOnboardingRequest
import com.foodnova.delivery.auth.data.remote.dto.DeliveryWorkerOnboardingResponse
import com.foodnova.delivery.auth.data.remote.dto.DeliveryWorkerAuthResponse
import com.foodnova.delivery.auth.data.remote.dto.DeliveryWorkerLoginRequest
import com.foodnova.delivery.auth.data.remote.dto.PhoneLookupRequest
import com.foodnova.delivery.auth.data.remote.dto.PhoneLookupResponse
import com.foodnova.delivery.auth.data.remote.dto.DeliveryMeResponse
import com.foodnova.delivery.kyc.data.remote.dto.EmergencyContactRequest
import com.foodnova.delivery.kyc.data.remote.dto.NinVerificationRequest
import com.foodnova.delivery.kyc.data.remote.dto.NinVerificationResponse
import com.foodnova.delivery.kyc.data.remote.dto.VerificationStatusResponse
import com.foodnova.delivery.kyc.data.remote.dto.VerificationSubmissionResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

interface FoodNovaDeliveryApi {
    @POST("delivery/auth/check-phone")
    suspend fun lookupDeliveryWorkerPhone(
        @Body request: PhoneLookupRequest
    ): PhoneLookupResponse

    @POST("delivery/auth/login")
    suspend fun loginDeliveryWorker(
        @Body request: DeliveryWorkerLoginRequest
    ): DeliveryWorkerAuthResponse

    @POST("delivery/auth/register")
    suspend fun registerDeliveryWorker(
        @Body request: DeliveryWorkerOnboardingRequest
    ): DeliveryWorkerAuthResponse

    @GET("delivery/me")
    suspend fun getMe(): DeliveryMeResponse

    @GET("delivery/verification-status")
    suspend fun getVerificationStatus(): VerificationStatusResponse

    @POST("delivery/kyc/verify-nin")
    suspend fun verifyKycNin(
        @Body request: NinVerificationRequest
    ): NinVerificationResponse

    @Multipart
    @POST("delivery/kyc")
    suspend fun submitKyc(
        @Part("nin") nin: RequestBody,
        @Part selfie: MultipartBody.Part
    ): VerificationSubmissionResponse

    @Multipart
    @POST("delivery/address-verification")
    suspend fun submitAddressVerification(
        @Part("document_type") documentType: RequestBody,
        @Part document: MultipartBody.Part
    ): VerificationSubmissionResponse

    @POST("delivery/emergency-contact")
    suspend fun submitEmergencyContact(
        @Body request: EmergencyContactRequest
    ): VerificationSubmissionResponse

    @POST("delivery-workers/register-fcm-token")
    suspend fun registerFcmToken(@Body request: RegisterFcmTokenRequest)
}

data class RegisterFcmTokenRequest(
    val workerId: String,
    val fcmToken: String,
    val platform: String = "android"
)
