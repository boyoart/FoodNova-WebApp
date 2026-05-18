package com.foodnova.delivery.network

import com.foodnova.delivery.core.session.SessionManager
import javax.inject.Inject
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor @Inject constructor(
    private val sessionManager: SessionManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { sessionManager.accessToken() }
        val request = if (token.isNullOrBlank()) {
            chain.request()
        } else {
            chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        }
        val response = chain.proceed(request)
        if (response.code == 401) {
            val body = response.peekBody(2048).string()
            val blockedAccount = body.contains("removed", ignoreCase = true) ||
                body.contains("deactivated", ignoreCase = true) ||
                body.contains("suspended", ignoreCase = true)
            if (blockedAccount) {
                runBlocking { sessionManager.clearSession() }
            }
        }
        return response
    }
}
