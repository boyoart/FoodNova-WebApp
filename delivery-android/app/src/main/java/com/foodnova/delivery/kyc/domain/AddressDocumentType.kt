package com.foodnova.delivery.kyc.domain

enum class AddressDocumentType(val label: String) {
    UtilityBill("Utility bill"),
    BankStatement("Bank statement"),
    InternetBill("Internet bill"),
    WaterOrElectricityBill("Water/electricity bill")
}
