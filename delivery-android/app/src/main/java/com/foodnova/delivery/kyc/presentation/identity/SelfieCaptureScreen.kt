package com.foodnova.delivery.kyc.presentation.identity

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.foodnova.delivery.auth.presentation.FieldError
import com.foodnova.delivery.kyc.presentation.verification.VerificationViewModel
import com.foodnova.delivery.ui.components.FoodNovaPrimaryButton
import com.foodnova.delivery.ui.components.FoodNovaStatusMark
import java.io.File

@Composable
fun SelfieCaptureScreen(
    viewModel: VerificationViewModel,
    onSubmitted: () -> Unit
) {
    val context = LocalContext.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    var hasCameraPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var isCapturing by remember { mutableStateOf(false) }
    var captureError by remember { mutableStateOf<String?>(null) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Selfie confirmation",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Use the front camera and align your face inside the guide. This selfie is submitted with your NIN for manual review.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (state.selfieReference.isBlank()) {
                CameraCaptureCard(
                    hasCameraPermission = hasCameraPermission,
                    imageCapture = imageCapture,
                    onImageCaptureReady = { imageCapture = it },
                    isCapturing = isCapturing,
                    captureError = captureError,
                    onRequestPermission = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                    onCapture = {
                        imageCapture?.let { capture ->
                            isCapturing = true
                            captureError = null
                            val file = context.createSelfieFile()
                            val outputOptions = ImageCapture.OutputFileOptions.Builder(file).build()
                            capture.takePicture(
                                outputOptions,
                                ContextCompat.getMainExecutor(context),
                                object : ImageCapture.OnImageSavedCallback {
                                    override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                                        isCapturing = false
                                        viewModel.onSelfieCaptured(
                                            reference = Uri.fromFile(file).toString(),
                                            fileName = file.name
                                        )
                                    }

                                    override fun onError(exception: ImageCaptureException) {
                                        isCapturing = false
                                        captureError = exception.message ?: "Unable to capture selfie. Please try again."
                                    }
                                }
                            )
                        }
                    }
                )
            } else {
                SelfieReviewCard(
                    selfieReference = state.selfieReference,
                    onRetake = viewModel::retakeSelfie
                )
            }

            FieldError(text = captureError ?: state.errorMessage)

            Spacer(modifier = Modifier.weight(1f))
            FoodNovaPrimaryButton(
                text = if (state.isLoading) "Submitting verification..." else "Submit for review",
                enabled = state.isIdentityReady && !state.isLoading,
                onClick = { viewModel.submitIdentityVerification(onSubmitted) }
            )
            Spacer(modifier = Modifier.height(4.dp))
        }
    }
}

@Composable
private fun CameraCaptureCard(
    hasCameraPermission: Boolean,
    imageCapture: ImageCapture?,
    onImageCaptureReady: (ImageCapture) -> Unit,
    isCapturing: Boolean,
    captureError: String?,
    onRequestPermission: () -> Unit,
    onCapture: () -> Unit
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (hasCameraPermission) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(0.78f)
                        .clip(RoundedCornerShape(24.dp))
                        .background(Color.Black),
                    contentAlignment = Alignment.Center
                ) {
                    CameraPreview(onImageCaptureReady = onImageCaptureReady)
                    FaceGuide()
                    if (isCapturing) {
                        CircularProgressIndicator(color = Color.White)
                    }
                }
            } else {
                PermissionPrompt(onRequestPermission = onRequestPermission)
            }

            Text(
                text = captureError ?: "Remove sunglasses, face a light source, and keep your head inside the circle.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            FoodNovaPrimaryButton(
                text = if (isCapturing) "Capturing..." else "Capture selfie",
                enabled = hasCameraPermission && imageCapture != null && !isCapturing,
                onClick = onCapture
            )
        }
    }
}

@Composable
private fun CameraPreview(onImageCaptureReady: (ImageCapture) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val previewView = remember { PreviewView(context) }
    val imageCapture = remember {
        ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build()
    }

    DisposableEffect(lifecycleOwner) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        val executor = ContextCompat.getMainExecutor(context)
        val listener = Runnable {
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also {
                it.surfaceProvider = previewView.surfaceProvider
            }
            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                lifecycleOwner,
                CameraSelector.DEFAULT_FRONT_CAMERA,
                preview,
                imageCapture
            )
            onImageCaptureReady(imageCapture)
        }
        cameraProviderFuture.addListener(listener, executor)

        onDispose {
            runCatching { cameraProviderFuture.get().unbindAll() }
        }
    }

    AndroidView(
        factory = { previewView },
        modifier = Modifier.fillMaxSize()
    )
}

@Composable
private fun FaceGuide() {
    Canvas(modifier = Modifier.fillMaxSize()) {
        val diameter = size.minDimension * 0.72f
        val left = (size.width - diameter) / 2f
        val top = (size.height - diameter) / 2f
        drawOval(
            color = Color.White.copy(alpha = 0.85f),
            topLeft = Offset(left, top),
            size = Size(diameter, diameter),
            style = Stroke(width = 5.dp.toPx(), cap = StrokeCap.Round)
        )
        drawOval(
            color = Color.Black.copy(alpha = 0.25f),
            topLeft = Offset(left - 12.dp.toPx(), top - 12.dp.toPx()),
            size = Size(diameter + 24.dp.toPx(), diameter + 24.dp.toPx()),
            style = Stroke(width = 2.dp.toPx())
        )
    }
}

@Composable
private fun PermissionPrompt(onRequestPermission: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .height(420.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(MaterialTheme.colorScheme.surface),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        FoodNovaStatusMark(label = "CA", color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(42.dp))
        Text("Camera permission is required", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text("FoodNova needs one front-camera selfie for KYC review.", style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.height(14.dp))
        OutlinedButton(onClick = onRequestPermission) {
            Text("Allow camera")
        }
    }
}

@Composable
private fun SelfieReviewCard(selfieReference: String, onRetake: () -> Unit) {
    val context = LocalContext.current
    val bitmap = remember(selfieReference) {
        runCatching {
            val uri = Uri.parse(selfieReference)
            if (uri.scheme == "file") {
                BitmapFactory.decodeFile(uri.path)
            } else {
                context.contentResolver.openInputStream(uri)?.use(BitmapFactory::decodeStream)
            }
        }.getOrNull()
    }

    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.78f)
                    .clip(RoundedCornerShape(24.dp))
                    .background(MaterialTheme.colorScheme.surface),
                contentAlignment = Alignment.Center
            ) {
                if (bitmap != null) {
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = "Captured selfie preview",
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                }
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(14.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary)
                        .padding(8.dp)
                ) {
                    FoodNovaStatusMark(
                        label = "OK",
                        color = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                FoodNovaStatusMark(label = "SC", color = MaterialTheme.colorScheme.primary)
                Text("Selfie ready for secure review", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
            OutlinedButton(
                onClick = onRetake,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.primary)
            ) {
                Text("Retake")
            }
        }
    }
}

private fun Context.createSelfieFile(): File {
    val directory = File(cacheDir, "kyc-selfies").apply { mkdirs() }
    return File(directory, "foodnova-selfie-${System.currentTimeMillis()}.jpg")
}
