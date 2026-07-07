import java.util.Base64

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

fun dartDefineValue(name: String): String? {
    val encoded = project.findProperty("dart-defines")?.toString() ?: return null
    return encoded.split(",")
        .mapNotNull { item ->
            try {
                String(Base64.getDecoder().decode(item))
            } catch (_: Exception) {
                null
            }
        }
        .firstOrNull { it.startsWith("$name=") }
        ?.substringAfter("=")
        ?.takeIf { it.isNotBlank() }
}

fun resolvedGoogleMapsApiKey(): String {
    return project.findProperty("GOOGLE_MAPS_API_KEY")?.toString()?.takeIf { it.isNotBlank() }
        ?: System.getenv("GOOGLE_MAPS_API_KEY")?.takeIf { it.isNotBlank() }
        ?: dartDefineValue("GOOGLE_MAPS_API_KEY")
        ?: ""
}

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.warn("FoodNova Firebase: android/app/google-services.json is missing; Google Services plugin is not applied for this local build.")
}

android {
    namespace = "app.foodnova.dispatch"
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "app.foodnova.dispatch"
        minSdk = flutter.minSdkVersion
        targetSdk = 36
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = resolvedGoogleMapsApiKey()
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    jvmToolchain(17)

    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
