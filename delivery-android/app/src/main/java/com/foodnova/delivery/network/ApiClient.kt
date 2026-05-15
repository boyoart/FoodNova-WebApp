package com.foodnova.delivery.network

import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ApiClient @Inject constructor(
    val deliveryApi: FoodNovaDeliveryApi
)
