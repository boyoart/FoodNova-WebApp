package com.foodnova.delivery.auth.presentation.onboarding

object NigerianPhoneFormatter {
    fun normalizeNationalNumber(input: String): String {
        val digits = input.filter(Char::isDigit)
        return when {
            digits.startsWith("234") -> digits.drop(3).take(10)
            digits.startsWith("0") -> digits.drop(1).take(10)
            else -> digits.take(10)
        }
    }

    fun format(countryCode: String, input: String): String {
        val nationalNumber = normalizeNationalNumber(input)
        return if (nationalNumber.isBlank()) countryCode else "$countryCode$nationalNumber"
    }

    fun isValid(countryCode: String, input: String): Boolean {
        val nationalNumber = normalizeNationalNumber(input)
        return countryCode == "+234" &&
            nationalNumber.length == 10 &&
            nationalNumber.firstOrNull() in setOf('7', '8', '9')
    }
}
