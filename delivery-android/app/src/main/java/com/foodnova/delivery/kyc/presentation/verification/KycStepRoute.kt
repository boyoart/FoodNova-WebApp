package com.foodnova.delivery.kyc.presentation.verification

import com.foodnova.delivery.kyc.domain.KycStep
import com.foodnova.delivery.kyc.domain.VerificationProgress
import com.foodnova.delivery.ui.navigation.DeliveryRoute

fun VerificationProgress.nextKycRoute(): String = when (nextStep) {
    KycStep.Identity -> DeliveryRoute.KycIdentityIntro.route
    KycStep.Address -> DeliveryRoute.KycAddress.route
    KycStep.EmergencyContact -> DeliveryRoute.KycEmergency.route
    KycStep.AdminApproval -> DeliveryRoute.KycAwaitingApproval.route
    KycStep.ActivationComplete -> DeliveryRoute.OperationsHome.route
}

fun KycStep.title(): String = when (this) {
    KycStep.Identity -> "Identity/KYC"
    KycStep.Address -> "Address Document"
    KycStep.EmergencyContact -> "Emergency Contact"
    KycStep.AdminApproval -> "Admin Approval"
    KycStep.ActivationComplete -> "Activation Complete"
}
