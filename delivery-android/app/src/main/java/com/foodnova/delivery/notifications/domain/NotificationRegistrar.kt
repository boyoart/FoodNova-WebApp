package com.foodnova.delivery.notifications.domain

import com.foodnova.delivery.core.AppResult

interface NotificationRegistrar {
    suspend fun requestPermissionAndRegisterToken(workerId: String): AppResult<String>
}
