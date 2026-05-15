package com.foodnova.delivery.delivery.domain

import com.foodnova.delivery.core.WorkerType

data class DeliveryOffer(
    val id: String,
    val orderCode: String,
    val workerType: WorkerType,
    val deliveryType: DeliveryType,
    val expiresAt: String
)

enum class DeliveryType {
    SHORT_DISTANCE,
    LONG_DISTANCE,
    NEEDS_ADMIN_REVIEW
}
