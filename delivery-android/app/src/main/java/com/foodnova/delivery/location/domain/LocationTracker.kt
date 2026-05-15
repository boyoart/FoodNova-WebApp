package com.foodnova.delivery.location.domain

import com.foodnova.delivery.core.AppResult
import com.foodnova.delivery.core.WorkerType

interface LocationTracker {
    suspend fun requestCurrentLocation(workerType: WorkerType): AppResult<DeliveryLocationPing>
    suspend fun startTracking(workerType: WorkerType)
    suspend fun stopTracking()
}
