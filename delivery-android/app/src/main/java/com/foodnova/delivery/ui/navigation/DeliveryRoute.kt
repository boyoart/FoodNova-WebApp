package com.foodnova.delivery.ui.navigation

sealed class DeliveryRoute(val route: String) {
    data object Splash : DeliveryRoute("splash")
    data object PhoneEntry : DeliveryRoute("phone-entry")
    data object Login : DeliveryRoute("login")
    data object Register : DeliveryRoute("register")
    data object VerificationRequired : DeliveryRoute("verification-required")
    data object AddressVerification : DeliveryRoute("address-verification")
    data object EmergencyContact : DeliveryRoute("emergency-contact")
    data object Dashboard : DeliveryRoute("dashboard")
}
