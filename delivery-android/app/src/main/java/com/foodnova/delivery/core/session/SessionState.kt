package com.foodnova.delivery.core.session

data class SessionState(
    val accessToken: String? = null,
    val workerId: String? = null,
    val isAuthenticated: Boolean = false
)
