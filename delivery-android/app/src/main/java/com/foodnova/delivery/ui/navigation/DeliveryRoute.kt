package com.foodnova.delivery.ui.navigation

sealed class DeliveryRoute(val route: String) {
    data object Splash : DeliveryRoute("splash")

    // Auth graph
    data object AuthPhone : DeliveryRoute("auth/phone")
    data object AuthLogin : DeliveryRoute("auth/login")
    data object AuthRegister : DeliveryRoute("auth/register")

    // KYC graph
    data object KycHub : DeliveryRoute("kyc/hub")
    data object KycIdentityIntro : DeliveryRoute("kyc/identity-intro")
    data object KycNinEntry : DeliveryRoute("kyc/nin-entry")
    data object KycSelfieCapture : DeliveryRoute("kyc/selfie-capture")
    data object KycSubmitted : DeliveryRoute("kyc/submitted")
    data object KycAddress : DeliveryRoute("kyc/address")
    data object KycEmergency : DeliveryRoute("kyc/emergency")

    // Operations graph
    data object OperationsHome : DeliveryRoute("ops/home")
}
