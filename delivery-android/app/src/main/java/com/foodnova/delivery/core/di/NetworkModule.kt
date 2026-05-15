package com.foodnova.delivery.core.di

import com.foodnova.delivery.core.DeliveryAppConfig
import com.foodnova.delivery.network.FoodNovaDeliveryApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Named
import javax.inject.Singleton
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Named("FoodNovaApiBaseUrl")
    fun provideBaseUrl(): String = DeliveryAppConfig.API_BASE_URL

    @Provides
    @Singleton
    fun provideOkHttpClient(authInterceptor: com.foodnova.delivery.network.AuthInterceptor): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(
        @Named("FoodNovaApiBaseUrl") baseUrl: String,
        okHttpClient: OkHttpClient
    ): Retrofit = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    @Provides
    @Singleton
    fun provideFoodNovaDeliveryApi(retrofit: Retrofit): FoodNovaDeliveryApi =
        retrofit.create(FoodNovaDeliveryApi::class.java)
}
