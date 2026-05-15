package com.foodnova.delivery.core

import com.foodnova.delivery.BuildConfig

object DeliveryAppConfig {
    val API_BASE_URL: String = BuildConfig.FOODNOVA_API_BASE_URL
    const val MESSENGER_GEOFENCE_ENABLED = true
    const val RIDER_GEOFENCE_ENABLED = false
}
