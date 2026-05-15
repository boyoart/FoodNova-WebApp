package com.foodnova.delivery.location.domain

data class DeliveryLocationPing(
    val workerId: String,
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float?,
    val heading: Float?,
    val speedMetersPerSecond: Float?,
    val timestamp: String
)

data class GeofenceState(
    val insideZone: Boolean?,
    val freshGps: Boolean
)
