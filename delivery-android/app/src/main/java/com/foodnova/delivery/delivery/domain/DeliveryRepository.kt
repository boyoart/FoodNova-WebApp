package com.foodnova.delivery.delivery.domain

import com.foodnova.delivery.core.AppResult

interface DeliveryRepository {
    suspend fun getPendingOffers(): AppResult<List<DeliveryOffer>>
    suspend fun acceptOffer(offerId: String): AppResult<Unit>
    suspend fun declineOffer(offerId: String): AppResult<Unit>
}
