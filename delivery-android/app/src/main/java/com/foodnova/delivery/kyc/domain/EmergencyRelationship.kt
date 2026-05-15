package com.foodnova.delivery.kyc.domain

enum class EmergencyRelationship(val label: String) {
    Spouse("Spouse"),
    Parent("Parent"),
    Sibling("Sibling"),
    Friend("Friend"),
    Guardian("Guardian"),
    Other("Other")
}
