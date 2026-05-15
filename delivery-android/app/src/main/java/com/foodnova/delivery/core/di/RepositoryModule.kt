package com.foodnova.delivery.core.di

import com.foodnova.delivery.auth.data.AuthRepositoryImpl
import com.foodnova.delivery.auth.domain.AuthRepository
import com.foodnova.delivery.kyc.data.KycRepositoryImpl
import com.foodnova.delivery.kyc.domain.KycRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds
    @Singleton
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

    @Binds
    @Singleton
    abstract fun bindKycRepository(impl: KycRepositoryImpl): KycRepository
}
