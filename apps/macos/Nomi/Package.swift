// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "Nomi",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .executable(name: "Nomi", targets: ["Nomi"])
    ],
    targets: [
        .executableTarget(
            name: "Nomi",
            resources: [
                .process("Resources")
            ]
        )
    ]
)
