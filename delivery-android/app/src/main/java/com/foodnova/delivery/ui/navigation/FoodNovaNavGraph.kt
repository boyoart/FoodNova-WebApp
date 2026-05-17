package com.foodnova.delivery.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.foodnova.delivery.auth.presentation.LoginScreen
import com.foodnova.delivery.auth.presentation.PhoneEntryScreen
import com.foodnova.delivery.auth.presentation.RegistrationScreen
import com.foodnova.delivery.auth.presentation.VerificationRequiredScreen
import com.foodnova.delivery.auth.presentation.onboarding.OnboardingViewModel
import com.foodnova.delivery.delivery.presentation.DeliveryDashboardScreen
import com.foodnova.delivery.kyc.presentation.identity.IdentityVerificationIntroScreen
import com.foodnova.delivery.kyc.presentation.identity.NinEntryScreen
import com.foodnova.delivery.kyc.presentation.identity.SelfieCaptureScreen
import com.foodnova.delivery.kyc.presentation.identity.VerificationSubmittedScreen
import com.foodnova.delivery.kyc.presentation.verification.AddressVerificationScreen
import com.foodnova.delivery.kyc.presentation.verification.AwaitingAdminApprovalScreen
import com.foodnova.delivery.kyc.presentation.verification.EmergencyContactScreen
import com.foodnova.delivery.kyc.presentation.verification.VerificationViewModel
import com.foodnova.delivery.kyc.presentation.verification.nextKycRoute
import com.foodnova.delivery.ui.splash.SplashScreen

@Composable
fun FoodNovaNavGraph() {
    val navController = rememberNavController()
    val onboardingViewModel: OnboardingViewModel = hiltViewModel()
    val verificationViewModel: VerificationViewModel = hiltViewModel()
    val onboardingState by onboardingViewModel.state.collectAsStateWithLifecycle()
    val verificationState by verificationViewModel.state.collectAsStateWithLifecycle()
    val lastCompletedStep = remember { mutableStateOf("KYC step") }

    LaunchedEffect(Unit) { verificationViewModel.refreshVerificationStatus() }

    fun navigateToNextKycStep() {
        navController.navigate(verificationViewModel.state.value.progress.nextKycRoute()) {
            popUpTo(DeliveryRoute.KycSubmitted.route) { inclusive = true }
            launchSingleTop = true
        }
    }

    fun navigateToOperationsHome() {
        navController.navigate(DeliveryRoute.OperationsHome.route) {
            popUpTo(DeliveryRoute.KycHub.route) { inclusive = false }
        }
    }

    NavHost(navController = navController, startDestination = DeliveryRoute.Splash.route) {
        composable(DeliveryRoute.Splash.route) {
            SplashScreen {
                onboardingViewModel.restoreSession(
                    onRestored = {
                        navController.navigate(DeliveryRoute.OperationsHome.route) {
                            popUpTo(DeliveryRoute.Splash.route) { inclusive = true }
                        }
                    },
                    onMissing = {
                        navController.navigate(DeliveryRoute.AuthPhone.route) {
                            popUpTo(DeliveryRoute.Splash.route) { inclusive = true }
                        }
                    }
                )
            }
        }
        composable(DeliveryRoute.AuthPhone.route) {
            PhoneEntryScreen(
                viewModel = onboardingViewModel,
                onExistingUser = { navController.navigate(DeliveryRoute.AuthLogin.route) },
                onNewUser = { navController.navigate(DeliveryRoute.AuthRegister.route) }
            )
        }
        composable(DeliveryRoute.AuthLogin.route) {
            LoginScreen(
                viewModel = onboardingViewModel,
                onCreateAccount = { navController.navigate(DeliveryRoute.AuthRegister.route) },
                onAuthenticated = {
                    navController.navigate(DeliveryRoute.KycHub.route) { popUpTo(DeliveryRoute.AuthPhone.route) { inclusive = true } }
                }
            )
        }
        composable(DeliveryRoute.AuthRegister.route) {
            RegistrationScreen(
                viewModel = onboardingViewModel,
                onBackToLogin = { navController.navigate(DeliveryRoute.AuthLogin.route) },
                onRegistered = {
                    navController.navigate(DeliveryRoute.KycHub.route) { popUpTo(DeliveryRoute.AuthPhone.route) { inclusive = true } }
                }
            )
        }
        composable(DeliveryRoute.KycHub.route) {
            VerificationRequiredScreen(
                progress = verificationState.progress,
                isLoading = verificationState.isLoading,
                onContinueKyc = { navigateToNextKycStep() },
                onEditIdentity = { navController.navigate(DeliveryRoute.KycIdentityIntro.route) },
                onEditAddress = { navController.navigate(DeliveryRoute.KycAddress.route) },
                onEditEmergencyContact = { navController.navigate(DeliveryRoute.KycEmergency.route) },
                onContinueToDashboard = { navController.navigate(DeliveryRoute.OperationsHome.route) }
            )
        }
        composable(DeliveryRoute.KycIdentityIntro.route) {
            IdentityVerificationIntroScreen(onContinue = { navController.navigate(DeliveryRoute.KycNinEntry.route) })
        }
        composable(DeliveryRoute.KycNinEntry.route) {
            NinEntryScreen(
                viewModel = verificationViewModel,
                onContinue = {
                    lastCompletedStep.value = "Identity/KYC"
                    navController.navigate(DeliveryRoute.KycSubmitted.route) {
                        popUpTo(DeliveryRoute.KycNinEntry.route) { inclusive = true }
                    }
                }
            )
        }
        composable(DeliveryRoute.KycSelfieCapture.route) {
            SelfieCaptureScreen(
                viewModel = verificationViewModel,
                onSubmitted = {
                    lastCompletedStep.value = "Identity/KYC"
                    navController.navigate(DeliveryRoute.KycSubmitted.route) {
                        popUpTo(DeliveryRoute.KycSelfieCapture.route) { inclusive = true }
                    }
                }
            )
        }
        composable(DeliveryRoute.KycSubmitted.route) {
            VerificationSubmittedScreen(
                completedStep = lastCompletedStep.value,
                nextStep = verificationState.progress.nextStep,
                onDone = { navigateToNextKycStep() }
            )
        }
        composable(DeliveryRoute.KycAddress.route) {
            AddressVerificationScreen(
                viewModel = verificationViewModel,
                onSubmitted = {
                    lastCompletedStep.value = "Address document"
                    navController.navigate(DeliveryRoute.KycSubmitted.route) {
                        popUpTo(DeliveryRoute.KycAddress.route) { inclusive = true }
                    }
                }
            )
        }
        composable(DeliveryRoute.KycEmergency.route) {
            EmergencyContactScreen(
                viewModel = verificationViewModel,
                onSubmitted = {
                    lastCompletedStep.value = "Emergency contact"
                    navController.navigate(DeliveryRoute.KycSubmitted.route) {
                        popUpTo(DeliveryRoute.KycEmergency.route) { inclusive = true }
                    }
                }
            )
        }
        composable(DeliveryRoute.KycAwaitingApproval.route) {
            AwaitingAdminApprovalScreen(
                viewModel = verificationViewModel,
                onDashboard = { navigateToOperationsHome() }
            )
        }
        composable(DeliveryRoute.OperationsHome.route) {
            LaunchedEffect(Unit) { verificationViewModel.refreshVerificationStatus() }
            DeliveryDashboardScreen(
                progress = verificationState.progress,
                workerName = onboardingState.fullName.ifBlank { "FoodNova Partner" },
                workerType = onboardingState.workerType.name.lowercase().replaceFirstChar { it.titlecase() },
                onContinueKyc = { navigateToNextKycStep() }
            )
        }
    }
}
